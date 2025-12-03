import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

const overlay = document.getElementById('overlay');
overlay.addEventListener('click', () => {});
controls.addEventListener('lock', () => {
  overlay.classList.add('hide');
});
controls.addEventListener('unlock', () => {
  overlay.classList.remove('hide');
});

const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 3);
scene.add(dirLight);

const collidables = [];
const room = new THREE.Group();
let mapBounds = null;
let mazeCells = null;
scene.add(room);

function addWall(x, y, z, rx, ry, rz, w, h, d, color) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1, metalness: 0, transparent: true, opacity: 0.25, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  room.add(mesh);
  collidables.push(mesh);
}

function buildMap(rows = 5, cols = 5, cell = 12, height = 4, door = 4, rng = Math.random) {
  const halfW = (cols * cell) / 2;
  const halfD = (rows * cell) / 2;
  const xMin = -halfW;
  const xMax = halfW;
  const zMin = -halfD;
  const zMax = halfD;
  mapBounds = { xMin, xMax, zMin, zMax, height, cell, rows, cols };

  // Floor and roof
  addWall(0, 0, 0, 0, 0, 0, cols * cell, 0.2, rows * cell, 0x000000);
  addWall(0, height, 0, 0, 0, 0, cols * cell, 0.2, rows * cell, 0x000000);

  // Perimeter walls
  addWall(0, height / 2, zMin, 0, 0, 0, cols * cell, height, 0.2, 0x000000); // North
  addWall(0, height / 2, zMax, 0, 0, 0, cols * cell, height, 0.2, 0x000000); // South
  addWall(xMin, height / 2, 0, 0, 0, 0, 0.2, height, rows * cell, 0x000000); // West
  addWall(xMax, height / 2, 0, 0, 0, 0, 0.2, height, rows * cell, 0x000000); // East

  // Interior vertical dividers with random door openings
  for (let i = 1; i < cols; i++) {
    const x = xMin + i * cell;
    const gapZ = THREE.MathUtils.lerp(zMin + cell * 0.5, zMax - cell * 0.5, rng());
    const seg1Depth = Math.max(0, gapZ - door / 2 - zMin);
    const seg2Depth = Math.max(0, zMax - (gapZ + door / 2));
    if (seg1Depth > 0) addWall(x, height / 2, zMin + seg1Depth / 2, 0, 0, 0, 0.2, height, seg1Depth, 0x000000);
    if (seg2Depth > 0) addWall(x, height / 2, zMax - seg2Depth / 2, 0, 0, 0, 0.2, height, seg2Depth, 0x000000);
  }

  // Interior horizontal dividers with random door openings
  for (let j = 1; j < rows; j++) {
    const z = zMin + j * cell;
    const gapX = THREE.MathUtils.lerp(xMin + cell * 0.5, xMax - cell * 0.5, rng());
    const seg1Width = Math.max(0, gapX - door / 2 - xMin);
    const seg2Width = Math.max(0, xMax - (gapX + door / 2));
    if (seg1Width > 0) addWall(xMin + seg1Width / 2, height / 2, z, 0, 0, 0, seg1Width, height, 0.2, 0x000000);
    if (seg2Width > 0) addWall(xMax - seg2Width / 2, height / 2, z, 0, 0, 0, seg2Width, height, 0.2, 0x000000);
  }

  // Add a few obstacles
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 3 === 0) {
        const cx = xMin + c * cell + cell * 0.5 + (rng() - 0.5) * cell * 0.3;
        const cz = zMin + r * cell + cell * 0.5 + (rng() - 0.5) * cell * 0.3;
        addWall(cx, height / 2, cz, 0, 0, 0, 1.2, height * 0.8, 1.2, 0x000000);
      }
    }
  }
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

async function loadMapFromConfig(cfg) {
  const rng = cfg.seed != null ? mulberry32(cfg.seed) : Math.random;
  if (cfg.type === 'maze') {
    buildMazeMap(cfg, rng);
  } else {
    buildMap(cfg.rows, cfg.cols, cfg.cell, cfg.height, cfg.door, rng);
  }
}

function spawnAtOpenLocation(rng = Math.random) {
  if (!mapBounds) {
    controls.getObject().position.set(0, 1.6, 0);
    return;
  }
  const { xMin, xMax, zMin, zMax } = mapBounds;
  const tries = 200;
  for (let i = 0; i < tries; i++) {
    const x = THREE.MathUtils.lerp(xMin + 1.0, xMax - 1.0, rng());
    const z = THREE.MathUtils.lerp(zMin + 1.0, zMax - 1.0, rng());
    const candidate = new THREE.Vector3(x, 0, z);
    if (!willCollide(candidate, 0.6)) {
      controls.getObject().position.set(x, 1.6, z);
      return;
    }
  }
  // Fallback: near center but slightly forward to avoid central divider
  controls.getObject().position.set(0, 1.6, 2.0);
}

function randomOpenPosition(rng = Math.random) {
  if (!mapBounds) return { x: 0, z: 0 };
  const { xMin, xMax, zMin, zMax } = mapBounds;
  const tries = 200;
  for (let i = 0; i < tries; i++) {
    const x = THREE.MathUtils.lerp(xMin + 1.0, xMax - 1.0, rng());
    const z = THREE.MathUtils.lerp(zMin + 1.0, zMax - 1.0, rng());
    const candidate = new THREE.Vector3(x, 0, z);
    if (!willCollide(candidate, 0.6)) return { x, z };
  }
  return { x: 0, z: 2.0 };
}

function generateMaze(rows, cols, rng) {
  const cells = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ N: true, S: true, E: true, W: true, v: false })));
  const stack = [];
  let cr = Math.floor(rows / 2);
  let cc = Math.floor(cols / 2);
  cells[cr][cc].v = true;
  stack.push([cr, cc]);
  const dirs = [[-1,0,'N','S'],[1,0,'S','N'],[0,1,'E','W'],[0,-1,'W','E']];
  while (stack.length) {
    const [r, c] = stack[stack.length - 1];
    const order = dirs.slice().sort(() => rng() - 0.5);
    let moved = false;
    for (const [dr, dc, wall, opp] of order) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
      if (!cells[nr][nc].v) {
        cells[r][c][wall] = false;
        cells[nr][nc][opp] = false;
        cells[nr][nc].v = true;
        stack.push([nr, nc]);
        moved = true;
        break;
      }
    }
    if (!moved) stack.pop();
  }
  return cells;
}

function buildMazeMap(cfg, rng) {
  const rows = cfg.rows, cols = cfg.cols, cell = cfg.cell, height = cfg.height;
  const thickness = cfg.thickness || 0.2;
  const door = cfg.door || 3;
  const hiddenDoorChance = cfg.hiddenDoorChance || 0.12;
  const cells = generateMaze(rows, cols, rng);
  mazeCells = cells;
  const halfW = (cols * cell) / 2;
  const halfD = (rows * cell) / 2;
  const xMin = -halfW;
  const xMax = halfW;
  const zMin = -halfD;
  const zMax = halfD;
  mapBounds = { xMin, xMax, zMin, zMax, height, cell, rows, cols };
  addWall(0, 0, 0, 0, 0, 0, cols * cell, 0.2, rows * cell, 0x000000);
  addWall(0, height, 0, 0, 0, 0, cols * cell, 0.2, rows * cell, 0x000000);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = xMin + c * cell + cell / 2;
      const cz = zMin + r * cell + cell / 2;
      if (cells[r][c].N) {
        const zEdge = cz - cell / 2;
        const makeDoor = rng() < hiddenDoorChance && r > 0;
        if (makeDoor) {
          const left = (cell - door) / 2;
          addWall(cx - (door / 2 + left / 2), height / 2, zEdge, 0, 0, 0, left, height, thickness, 0x000000);
          addWall(cx + (door / 2 + left / 2), height / 2, zEdge, 0, 0, 0, left, height, thickness, 0x000000);
        } else {
          addWall(cx, height / 2, zEdge, 0, 0, 0, cell, height, thickness, 0x000000);
        }
      }
      if (cells[r][c].W) {
        const xEdge = cx - cell / 2;
        const makeDoor = rng() < hiddenDoorChance && c > 0;
        if (makeDoor) {
          const left = (cell - door) / 2;
          addWall(xEdge, height / 2, cz - (door / 2 + left / 2), 0, 0, 0, thickness, height, left, 0x000000);
          addWall(xEdge, height / 2, cz + (door / 2 + left / 2), 0, 0, 0, thickness, height, left, 0x000000);
        } else {
          addWall(xEdge, height / 2, cz, 0, 0, 0, thickness, height, cell, 0x000000);
        }
      }
      if (r === rows - 1 && cells[r][c].S) {
        const zEdge = cz + cell / 2;
        addWall(cx, height / 2, zEdge, 0, 0, 0, cell, height, thickness, 0x000000);
      }
      if (c === cols - 1 && cells[r][c].E) {
        const xEdge = cx + cell / 2;
        addWall(xEdge, height / 2, cz, 0, 0, 0, thickness, height, cell, 0x000000);
      }
    }
  }
}

const pointsGroup = new THREE.Group();
scene.add(pointsGroup);
let exitGroup = null;
let goalArea = null;
let enemy = null;
let enemySpeed = 1.8;
let enemyDir = new THREE.Vector3(1, 0, 0);
let enemyTimer = 0;
let audioCtx = null;
let audioMasterGain = null;
let enemyGain = null;
let enemyNoiseSrc = null;
let enemyFilter = null;
let audioAccum = 0;
let enemyPingTimer = 0;
let noNoiseTimer = 0;
let avoidTargetCell = null;
let avoidTimer = 0;
let noiseIdleThreshold = 5 + Math.random() * 5;
let lastNoisePos = { x: 0, z: 0 };

const gun = new THREE.Mesh(
  new THREE.CylinderGeometry(0.05, 0.05, 0.6, 16),
  new THREE.MeshStandardMaterial({ color: 0xdddddd })
);
gun.rotation.z = 0;
gun.rotation.x = Math.PI / 2;
gun.position.set(0.35, -0.15, -0.5);
camera.add(gun);

const keys = new Set();
window.addEventListener('keydown', e => {
  keys.add(e.code);
  if (e.code === 'Digit1') setMode('dot');
  if (e.code === 'Digit2') setMode('rect');
  if (e.code === 'Digit3') setMode('spiral');
  if (e.code === 'Digit4') setMode('fan');
  if (e.code === 'Digit5') setMode('random');
  if (e.code === 'KeyM') {
    miniMapExpanded = !miniMapExpanded;
    if (miniMapDiv) miniMapDiv.classList.toggle('expanded', miniMapExpanded);
    if (miniMapCanvas) {
      if (miniMapExpanded) { miniMapCanvas.width = 420; miniMapCanvas.height = 420; }
      else { miniMapCanvas.width = 200; miniMapCanvas.height = 200; }
    }
    e.preventDefault();
  }
});
window.addEventListener('keyup', e => {
  keys.delete(e.code);
});

let scanMode = 'dot';
let density = 7;
let maxDots = 10000;
let customShape = 'rectangle';
let customX = 35;
let customY = 25;
let scanDotLimit = 2000;
let customFill = false;
let scanning = false;
let scanQueue = [];
let scanIndex = 0;
const modeLabel = document.getElementById('modeLabel');
const modeToast = document.getElementById('modeToast');
const densityInput = document.getElementById('density');
const densityValue = document.getElementById('densityValue');
const maxDotsInput = document.getElementById('maxDots');
const maxDotsValue = document.getElementById('maxDotsValue');
const clearDotsBtn = document.getElementById('clearDots');
const openSettingsBtn = document.getElementById('openSettings');
const closeSettingsBtn = document.getElementById('closeSettings');
const settingsPanel = document.getElementById('settingsPanel');
const tabPerfBtn = document.getElementById('tabPerf');
const tabCustomBtn = document.getElementById('tabCustom');
const tabExtrasBtn = document.getElementById('tabExtras');
const settingsPerf = document.getElementById('settingsPerf');
const settingsCustom = document.getElementById('settingsCustom');
const settingsExtras = document.getElementById('settingsExtras');
const perfPresetSel = document.getElementById('perfPreset');
const customShapeSel = document.getElementById('customShape');
const customXInput = document.getElementById('customX');
const customYInput = document.getElementById('customY');
const createCustomBtn = document.getElementById('createCustom');
const scanDotsInput = document.getElementById('scanDots');
const scanDotsValue = document.getElementById('scanDotsValue');
const customFillInput = document.getElementById('customFill');
const openSuggestionsBtn = document.getElementById('openSuggestions');
const openChangelogBtn = document.getElementById('openChangelog');
const changelogModal = document.getElementById('changelogModal');
const openMPBtn = document.getElementById('openMP');
const mpModal = document.getElementById('mpModal');
const closeMPBtn = document.getElementById('closeMP');
const mpUsernameInput = document.getElementById('mpUsername');
const mpLobbyNameInput = document.getElementById('mpLobbyName');
const mpLockInput = document.getElementById('mpLock');
const mpPasswordInput = document.getElementById('mpPassword');
const mpCreateBtn = document.getElementById('mpCreate');
const mpJoinCodeInput = document.getElementById('mpJoinCode');
const mpJoinPasswordInput = document.getElementById('mpJoinPassword');
const mpJoinBtn = document.getElementById('mpJoin');
const mpLobbyListDiv = document.getElementById('mpLobbyList');
const openQABtn = document.getElementById('openQA');
const qaModal = document.getElementById('qaModal');
const closeQABtn = document.getElementById('closeQA');
const startNewBtn = document.getElementById('startNew');
const startCrazyBtn = document.getElementById('startCrazy');
const difficultySel = document.getElementById('difficulty');
const resumeBtn = document.getElementById('resumeBtn');
let hasStarted = false;
let won = false;
let currentDifficulty = 'medium';
const winMsgEl = document.getElementById('winMsg');
const closeChangelogBtn = document.getElementById('closeChangelog');
let gameOver = false;
const noiseFill = document.getElementById('noiseFill');
let noiseLevel = 0;
const NOISE_INC_RATE = 0.18;
const NOISE_DECAY_RATE = 0.85;
const mappingModeInput = document.getElementById('mappingMode');
const miniMapDiv = document.getElementById('miniMap');
const miniMapCanvas = document.getElementById('miniMapCanvas');
let miniMapCtx = miniMapCanvas ? miniMapCanvas.getContext('2d') : null;
let mappingEnabled = false;
let miniMapExpanded = false;
const cheatModal = document.getElementById('cheatModal');
const cheatYesBtn = document.getElementById('cheatYes');
const cheatNoBtn = document.getElementById('cheatNo');
const colorModeSel = document.getElementById('colorMode');
const colorAInput = document.getElementById('colorA');
const colorBInput = document.getElementById('colorB');
const colorCheatEnable = document.getElementById('colorCheatEnable');
const openColorModalBtn = document.getElementById('openColorModal');
const colorModal = document.getElementById('colorModal');
const closeColorModalBtn = document.getElementById('closeColorModal');
const colorCheatConfirm = document.getElementById('colorCheatConfirm');
const colorCheatYesBtn = document.getElementById('colorCheatYes');
const colorCheatNoBtn = document.getElementById('colorCheatNo');
const colorBRatioInput = document.getElementById('colorBRatio');
const colorBRatioValue = document.getElementById('colorBRatioValue');
const colorWarnEl = document.getElementById('colorWarn');
let colorMode = 'default';
let colorA = 0x00ffff;
let colorB = 0xff00ff;
let rainbowHue = 0;
let dualToggle = false;
let colorCheatEnabled = false;
let colorBRatio = 0.5;
const VERSION = '0.7.4-beta';
const CHANGELOG = [
  {
    version: '0.7.4-beta',
    items: [
      'Q&A modal added in Extras next to Change Log',
      'Q&A covers scanning, mapping, enemy behavior, and color cheat',
      'Open/close controls wired; content scrolls within modal'
    ]
  },
  {
    version: '0.7.3-beta',
    items: [
      'Dot color cheat added with enable confirmation and modal',
      'Modes: Default, Rainbow, Two colors with A/B pickers',
      'Two-color supports adjustable Color B ratio (0–100%)',
      'Warning shown when selecting red or black for visibility/meaning',
      'Color customization gated by cheat enable; enemy hits stay red'
    ]
  },
  {
    version: '0.7.2-beta',
    items: [
      'Mapping mode added with top-right mini-map overlay',
      'Press M to enlarge/shrink mini-map; enlarged shows wider area',
      'Mini-map zoom radius doubles when expanded; render cap increases',
      'Mini-map shows fewer floor/ceiling dots (~25%), more walls (~70%)',
      'Stable subsampling for mini-map to avoid flicker',
      'Bottom-right noise HUD; larger size for visibility',
      'Noise rises slower and decays faster (run longer before max)',
      'Enemy wanders away after 5–10s of silence from last noise',
      'Fixed shooting without pointer lock; clicks over UI are ignored',
      'Mini-map performance and visibility improvements'
    ]
  },
  {
    version: '0.6.6-beta',
    items: [
      'Enemy added: fully transparent, spawns far, roams',
      'Noise bar HUD: noise rises while walking, decays when still',
      'Enemy attracted to noise; pathfinds through maze toward player',
      'Scanning enemy shows red particles that auto-clear after 3s',
      'Proximity audio replaced with soft noise bursts (near-only, gentle volume)',
      'Pitch lowers as enemy approaches; bursts stop when far',
      'Game Over triggers if enemy catches you while moving'
    ]
  },
  {
    version: '0.6.3-beta',
    items: [
      'Settings split into tabs: Performance, Custom Scan, Extras',
      'Performance presets added and updated (3k/6k/10k/15k)',
      'Max dots slider increased to 20,000',
      'Start screen with difficulty select and map choice',
      'Map regenerates fresh each start (guaranteed path to exit)',
      'Random Crazy uses maze for connectivity with larger layouts',
      'Exit changed to a faint green dotted circle area',
      'Win detection and victory overlay message when in exit area',
      'Resume button to unpause from overlay'
    ]
  },
  {
    version: '0.6.0-beta',
    items: [
      'Added changelog ',
      'Added suggestions page'
    ]
  },
  {
    version: '0.5.8-beta',
    items: [
      'First open beta',
      'Added Custom shapes: Rectangle, Circle, Triangle, Hexagon, Star, Plus',
      'Added Fill option and Dots/scan slider for Custom',
      'Replaced Ring with Random Beam (forward hemisphere)',
      'Increased Random Beam fire rate',
      'Settings panel right-side actions: Suggestions and Change Log',
      'Change Log modal with accordion entries'
    ]
  },
  {
    version: '0.5.4',
    items: [
      'Added Suggestions page with back-to-game link',
      'Added Change Log modal (initial version)'
    ]
  },
  {
    version: '0.4.8',
    items: [
      'Random Beam rate increased (triple beams per frame)'
    ]
  },
  {
    version: '0.4.2',
    items: [
      'Replaced Ring with Random Beam',
      'Fixed Random Beam firing behind player (now forward hemisphere)'
    ]
  },
  {
    version: '0.3.6',
    items: [
      'Custom scan integrated as single active pattern',
      'Queue builder for outline and filled shapes'
    ]
  },
  {
    version: '0.3.0',
    items: [
      'Custom scan creator UI',
      'Shapes and X/Y size inputs',
      'Dots/scan slider and Fill toggle'
    ]
  },
  {
    version: '0.2.4',
    items: [
      'Added Settings button and panel',
      'Max dots slider (2,000–10,000) and Clear Dots'
    ]
  },
  {
    version: '0.1.8',
    items: [
      'Laser pointer repositioned to right of screen',
      'Laser pointer rotated to align correctly',
      'Fixed W/S movement direction'
    ]
  },
  {
    version: '0.1.2',
    items: [
      'Added Spiral and Fan scan modes',
      'Added density control for queued scans',
      'Added bottom-left mode label'
    ]
  },
  {
    version: '0.0.6',
    items: [
      'Initial playable build: WASD movement and pointer lock',
      'Dot and Rect Grid scan modes',
      'Basic map generation with walls and obstacles'
    ]
  }
];

function setMode(mode) {
  scanMode = mode;
  const nameMap = { dot: 'Dot', rect: 'Rect Grid', spiral: 'Spiral', fan: 'Fan', random: 'Random Beam', custom: 'Custom' };
  const name = nameMap[mode] || mode;
  if (modeLabel) modeLabel.textContent = name;
  if (modeToast) modeToast.textContent = name;
}

if (densityInput) {
  densityInput.addEventListener('input', () => {
    density = parseInt(densityInput.value, 10);
    if (densityValue) densityValue.textContent = String(density);
  });
}
if (maxDotsInput) {
  maxDotsInput.addEventListener('input', () => {
    maxDots = parseInt(maxDotsInput.value, 10);
    if (maxDotsValue) maxDotsValue.textContent = String(maxDots);
  });
}
if (clearDotsBtn) {
  clearDotsBtn.addEventListener('click', () => {
    for (let i = pointsGroup.children.length - 1; i >= 0; i--) pointsGroup.remove(pointsGroup.children[i]);
  });
}
if (openSettingsBtn && settingsPanel) {
  openSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('hide');
    if (openMPBtn) openMPBtn.classList.remove('hide');
  });
}
if (closeSettingsBtn && settingsPanel) {
  closeSettingsBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hide');
    if (openMPBtn) openMPBtn.classList.add('hide');
  });
}

function showTab(which) {
  if (tabPerfBtn && tabCustomBtn && tabExtrasBtn) {
    tabPerfBtn.classList.toggle('active', which === 'perf');
    tabCustomBtn.classList.toggle('active', which === 'custom');
    tabExtrasBtn.classList.toggle('active', which === 'extras');
  }
  if (settingsPerf && settingsCustom && settingsExtras) {
    settingsPerf.classList.toggle('show', which === 'perf');
    settingsCustom.classList.toggle('show', which === 'custom');
    settingsExtras.classList.toggle('show', which === 'extras');
  }
}
if (tabPerfBtn) tabPerfBtn.addEventListener('click', () => showTab('perf'));
if (tabCustomBtn) tabCustomBtn.addEventListener('click', () => showTab('custom'));
if (tabExtrasBtn) tabExtrasBtn.addEventListener('click', () => showTab('extras'));
showTab('perf');

function applyPreset(name) {
  let d = density;
  let m = maxDots;
  if (name === 'low') { d = 3; m = 3000; }
  else if (name === 'medium') { d = 6; m = 6000; }
  else if (name === 'high') { d = 8; m = 10000; }
  else if (name === 'ultra') { d = 10; m = 15000; }
  if (densityInput && densityValue) {
    densityInput.value = String(d);
    density = d;
    densityValue.textContent = String(d);
  }
  if (maxDotsInput && maxDotsValue) {
    maxDotsInput.value = String(m);
    maxDots = m;
    maxDotsValue.textContent = String(m);
  }
}
if (perfPresetSel) perfPresetSel.addEventListener('change', () => {
  const v = perfPresetSel.value;
  if (v !== 'custom') applyPreset(v);
});

if (customShapeSel) customShapeSel.addEventListener('change', () => { customShape = customShapeSel.value; });
if (customXInput) customXInput.addEventListener('input', () => { customX = Math.max(1, Math.min(100, parseInt(customXInput.value || '1', 10))); });
if (customYInput) customYInput.addEventListener('input', () => { customY = Math.max(1, Math.min(100, parseInt(customYInput.value || '1', 10))); });
if (createCustomBtn) createCustomBtn.addEventListener('click', () => { setMode('custom'); settingsPanel.classList.add('hide'); });
if (scanDotsInput) {
  scanDotsInput.addEventListener('input', () => {
    scanDotLimit = Math.max(100, Math.min(10000, parseInt(scanDotsInput.value, 10)));
    if (scanDotsValue) scanDotsValue.textContent = String(scanDotLimit);
  });
}
if (customFillInput) customFillInput.addEventListener('change', () => { customFill = !!customFillInput.checked; });
if (openSuggestionsBtn) openSuggestionsBtn.addEventListener('click', () => { window.location.href = './suggestions.html'; });
function renderChangelog() {
  const container = document.getElementById('changelogEntries');
  if (!container) return;
  container.innerHTML = '';
  for (const entry of CHANGELOG) {
    const details = document.createElement('details');
    details.open = false;
    const summary = document.createElement('summary');
    summary.textContent = entry.version;
    details.appendChild(summary);
    const ul = document.createElement('ul');
    for (const it of entry.items) {
      const li = document.createElement('li');
      li.textContent = it;
      ul.appendChild(li);
    }
    details.appendChild(ul);
    container.appendChild(details);
  }
}
if (openChangelogBtn && changelogModal) openChangelogBtn.addEventListener('click', () => { renderChangelog(); changelogModal.classList.add('show'); });
if (openMPBtn && mpModal) openMPBtn.addEventListener('click', () => { mpModal.classList.add('show'); renderLobbyList(); });
if (closeMPBtn && mpModal) closeMPBtn.addEventListener('click', () => { mpModal.classList.remove('show'); });
if (openQABtn && qaModal) openQABtn.addEventListener('click', () => { qaModal.classList.add('show'); });
if (closeQABtn && qaModal) closeQABtn.addEventListener('click', () => { qaModal.classList.remove('show'); });
if (closeChangelogBtn && changelogModal) closeChangelogBtn.addEventListener('click', () => { changelogModal.classList.remove('show'); });

function difficultyConfig(level) {
  if (level === 'easy') return { rows: 8, cols: 8, cell: 12, height: 4, door: 4, thickness: 0.2, hiddenDoorChance: 0.15, type: 'maze' };
  if (level === 'medium') return { rows: 12, cols: 12, cell: 12, height: 4, door: 4, thickness: 0.2, hiddenDoorChance: 0.1, type: 'maze' };
  if (level === 'hard') return { rows: 16, cols: 16, cell: 12, height: 4, door: 3, thickness: 0.2, hiddenDoorChance: 0.06, type: 'maze' };
  return { rows: 24, cols: 20, cell: 12, height: 4, door: 2, thickness: 0.2, hiddenDoorChance: 0.03, type: 'maze' };
}

function cellToWorld(r, c) {
  const { xMin, zMin, cell } = mapBounds;
  return { x: xMin + c * cell + cell / 2, z: zMin + r * cell + cell / 2 };
}

function worldToCell(x, z) {
  if (!mapBounds) return { r: 0, c: 0 };
  const { xMin, zMin, cell, rows, cols } = mapBounds;
  let c = Math.floor((x - xMin) / cell);
  let r = Math.floor((z - zMin) / cell);
  c = Math.max(0, Math.min(cols - 1, c));
  r = Math.max(0, Math.min(rows - 1, r));
  return { r, c };
}

function farthestCellFrom(sr, sc) {
  if (!mazeCells) return [sr, sc];
  const rows = mazeCells.length, cols = mazeCells[0].length;
  const dist = Array.from({ length: rows }, () => Array(cols).fill(-1));
  const q = [[sr, sc]];
  dist[sr][sc] = 0;
  while (q.length) {
    const [r, c] = q.shift();
    const d = dist[r][c];
    const cell = mazeCells[r][c];
    const nb = [];
    if (!cell.N && r > 0) nb.push([r - 1, c]);
    if (!cell.S && r < rows - 1) nb.push([r + 1, c]);
    if (!cell.W && c > 0) nb.push([r, c - 1]);
    if (!cell.E && c < cols - 1) nb.push([r, c + 1]);
    for (const [nr, nc] of nb) {
      if (dist[nr][nc] === -1) { dist[nr][nc] = d + 1; q.push([nr, nc]); }
    }
  }
  let br = sr, bc = sc, md = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (dist[r][c] > md) { md = dist[r][c]; br = r; bc = c; }
    }
  }
  return [br, bc];
}

function spawnAtCell(r, c) {
  const p = cellToWorld(r, c);
  controls.getObject().position.set(p.x, 1.6, p.z);
}

function placeGoalAtCell(r, c) {
  const p = cellToWorld(r, c);
  const radius = 1.2;
  if (exitGroup) room.remove(exitGroup);
  exitGroup = new THREE.Group();
  const count = 40;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const x = p.x + Math.cos(a) * radius;
    const z = p.z + Math.sin(a) * radius;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), new THREE.MeshBasicMaterial({ color: 0x88ff88 }));
    dot.position.set(x, 0.15, z);
    exitGroup.add(dot);
  }
  room.add(exitGroup);
  goalArea = { x: p.x, z: p.z, r: radius };
}

function startGame(mode) {
  const level = difficultySel ? difficultySel.value : 'medium';
  const cfg = difficultyConfig(level);
  const rng = Math.random;
  resetMap();
  won = false;
  gameOver = false;
  currentDifficulty = level;
  if (winMsgEl) winMsgEl.textContent = '';
  if (mode === 'crazy') {
    const rows = 24 + Math.floor(rng() * 10);
    const cols = 24 + Math.floor(rng() * 10);
    const crazyCfg = { rows, cols, cell: 12, height: 4, door: 3, thickness: 0.2, hiddenDoorChance: 0.18, type: 'maze' };
    loadMapFromConfig(crazyCfg);
    const sr = Math.floor(rng() * rows);
    const sc = Math.floor(rng() * cols);
    const [er, ec] = farthestCellFrom(sr, sc);
    spawnAtCell(sr, sc);
    placeGoalAtCell(er, ec);
    createEnemy();
  } else {
    loadMapFromConfig(cfg);
    const sr = Math.floor(cfg.rows / 2);
    const sc = Math.floor(cfg.cols / 2);
    const [er, ec] = farthestCellFrom(sr, sc);
    spawnAtCell(sr, sc);
    placeGoalAtCell(er, ec);
    createEnemy();
  }
  overlay.classList.add('hide');
  controls.lock();
  hasStarted = true;
  setupAudio();
}

if (startNewBtn) startNewBtn.addEventListener('click', () => startGame('maze'));
if (startCrazyBtn) startCrazyBtn.addEventListener('click', () => startGame('crazy'));
if (resumeBtn) resumeBtn.addEventListener('click', () => { overlay.classList.add('hide'); controls.lock(); });
if (mappingModeInput) mappingModeInput.addEventListener('change', () => {
  const wantEnable = !!mappingModeInput.checked;
  if (wantEnable) {
    mappingModeInput.checked = false;
    if (cheatModal) cheatModal.classList.add('show');
  } else {
    mappingEnabled = false;
    if (miniMapDiv) miniMapDiv.classList.toggle('hide', true);
  }
});
if (cheatYesBtn && cheatModal) cheatYesBtn.addEventListener('click', () => {
  mappingEnabled = true;
  mappingModeInput.checked = true;
  if (miniMapDiv) miniMapDiv.classList.toggle('hide', false);
  cheatModal.classList.remove('show');
});
if (cheatNoBtn && cheatModal) cheatNoBtn.addEventListener('click', () => {
  mappingEnabled = false;
  mappingModeInput.checked = false;
  if (miniMapDiv) miniMapDiv.classList.toggle('hide', true);
  cheatModal.classList.remove('show');
});
if (colorCheatEnable) colorCheatEnable.addEventListener('change', () => {
  const wantEnable = !!colorCheatEnable.checked;
  if (wantEnable) {
    colorCheatEnable.checked = false;
    if (colorCheatConfirm) colorCheatConfirm.classList.add('show');
  } else {
    colorCheatEnabled = false;
    if (openColorModalBtn) openColorModalBtn.disabled = true;
    if (colorModal) colorModal.classList.remove('show');
  }
});
if (colorCheatYesBtn && colorCheatConfirm) colorCheatYesBtn.addEventListener('click', () => {
  colorCheatEnabled = true;
  colorCheatEnable.checked = true;
  if (openColorModalBtn) openColorModalBtn.disabled = false;
  colorCheatConfirm.classList.remove('show');
});
if (colorCheatNoBtn && colorCheatConfirm) colorCheatNoBtn.addEventListener('click', () => {
  colorCheatEnabled = false;
  colorCheatEnable.checked = false;
  if (openColorModalBtn) openColorModalBtn.disabled = true;
  colorCheatConfirm.classList.remove('show');
});
if (openColorModalBtn && colorModal) openColorModalBtn.addEventListener('click', () => { if (!openColorModalBtn.disabled) colorModal.classList.add('show'); });
if (closeColorModalBtn && colorModal) closeColorModalBtn.addEventListener('click', () => { colorModal.classList.remove('show'); });
if (colorModeSel) {
  colorMode = colorModeSel.value;
  colorModeSel.addEventListener('change', () => { colorMode = colorModeSel.value; });
}
function parseHexColor(s) { try { return parseInt(s.replace('#',''), 16); } catch { return 0xffffff; } }
function hexStr(s) { return (s || '').toLowerCase(); }
function updateColorWarning() {
  if (!colorWarnEl || !colorAInput || !colorBInput) return;
  const a = hexStr(colorAInput.value);
  const b = hexStr(colorBInput.value);
  const bad = (a === '#ff0000' || a === '#000000' || b === '#ff0000' || b === '#000000');
  colorWarnEl.classList.toggle('hide', !bad);
}
if (colorAInput) {
  colorA = parseHexColor(colorAInput.value);
  colorAInput.addEventListener('input', () => { colorA = parseHexColor(colorAInput.value); updateColorWarning(); });
  colorAInput.addEventListener('change', () => { colorA = parseHexColor(colorAInput.value); updateColorWarning(); });
}
if (colorBInput) {
  colorB = parseHexColor(colorBInput.value);
  colorBInput.addEventListener('input', () => { colorB = parseHexColor(colorBInput.value); updateColorWarning(); });
  colorBInput.addEventListener('change', () => { colorB = parseHexColor(colorBInput.value); updateColorWarning(); });
}
if (colorBRatioInput && colorBRatioValue) {
  const updateBRatio = () => { colorBRatio = Math.max(0, Math.min(1, (parseInt(colorBRatioInput.value, 10) || 0) / 100)); colorBRatioValue.textContent = `${Math.round(colorBRatio * 100)}%`; };
  updateBRatio();
  colorBRatioInput.addEventListener('input', updateBRatio);
  colorBRatioInput.addEventListener('change', updateBRatio);
}
if (openColorModalBtn) openColorModalBtn.addEventListener('click', () => { updateColorWarning(); });

function resetMap() {
  while (room.children.length) room.remove(room.children[0]);
  collidables.length = 0;
  mazeCells = null;
  mapBounds = null;
  if (exitGroup) { room.remove(exitGroup); exitGroup = null; }
  goalArea = null;
  if (enemy) {
    room.remove(enemy);
    const idx = collidables.indexOf(enemy);
    if (idx >= 0) collidables.splice(idx, 1);
    enemy = null;
  }
  while (pointsGroup.children.length) pointsGroup.remove(pointsGroup.children[0]);
}

function onWin() {
  won = true;
  controls.unlock();
  overlay.classList.remove('hide');
  if (winMsgEl) winMsgEl.textContent = `You won the beta ${currentDifficulty} mode!`;
}

function onGameOver() {
  gameOver = true;
  scanning = false;
  controls.unlock();
  overlay.classList.remove('hide');
  if (winMsgEl) winMsgEl.textContent = `Game Over — caught in beta ${currentDifficulty} mode`;
  if (enemyGain) enemyGain.gain.value = 0;
}

function createEnemy() {
  const playerPos = controls.getObject().position;
  let pos = { x: 0, z: 0 }, bestDist = -1;
  for (let i = 0; i < 80; i++) {
    const cand = randomOpenPosition(Math.random);
    const d = Math.hypot(playerPos.x - cand.x, playerPos.z - cand.z);
    if (d > bestDist) { bestDist = d; pos = cand; }
  }
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.8, 8, 16), new THREE.MeshStandardMaterial({ color: 0x333333, transparent: true, opacity: 0 }));
  body.position.set(pos.x, 1.0, pos.z);
  enemy = body;
  room.add(enemy);
  collidables.push(enemy);
  enemyDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
  enemyTimer = 3 + Math.random() * 3;
}

function updateEnemy(delta) {
  if (!enemy || !mapBounds) return;
  const playerPos = controls.getObject().position;
  const noisy = noiseLevel > 0.2;
  if (noisy && mazeCells) {
    lastNoisePos.x = playerPos.x;
    lastNoisePos.z = playerPos.z;
    noNoiseTimer = 0;
    avoidTargetCell = null;
    const es = worldToCell(enemy.position.x, enemy.position.z);
    const ps = worldToCell(playerPos.x, playerPos.z);
    const rows = mazeCells.length, cols = mazeCells[0].length;
    const dist = Array.from({ length: rows }, () => Array(cols).fill(-1));
    const prev = Array.from({ length: rows }, () => Array(cols).fill(null));
    const q = [[es.r, es.c]];
    dist[es.r][es.c] = 0;
    while (q.length) {
      const [r, c] = q.shift();
      if (r === ps.r && c === ps.c) break;
      const cell = mazeCells[r][c];
      const nb = [];
      if (!cell.N && r > 0) nb.push([r - 1, c]);
      if (!cell.S && r < rows - 1) nb.push([r + 1, c]);
      if (!cell.W && c > 0) nb.push([r, c - 1]);
      if (!cell.E && c < cols - 1) nb.push([r, c + 1]);
      for (const [nr, nc] of nb) {
        if (dist[nr][nc] === -1) { dist[nr][nc] = dist[r][c] + 1; prev[nr][nc] = [r, c]; q.push([nr, nc]); }
      }
    }
    let tr = ps.r, tc = ps.c;
    if (dist[tr][tc] !== -1) {
      while (prev[tr][tc] && !(prev[tr][tc][0] === es.r && prev[tr][tc][1] === es.c)) {
        const p = prev[tr][tc];
        tr = p[0];
        tc = p[1];
      }
      const target = cellToWorld(tr, tc);
      const toTarget = new THREE.Vector3(target.x - enemy.position.x, 0, target.z - enemy.position.z).normalize();
      enemyDir.copy(toTarget);
    }
  } else {
    noNoiseTimer += delta;
    if (!avoidTargetCell && noNoiseTimer > noiseIdleThreshold && mazeCells) {
      const heardCell = worldToCell(lastNoisePos.x, lastNoisePos.z);
      const [ar, ac] = farthestCellFrom(heardCell.r, heardCell.c);
      avoidTargetCell = { r: ar, c: ac };
      avoidTimer = 5 + Math.random() * 5;
      noiseIdleThreshold = 5 + Math.random() * 5;
    }
    if (avoidTargetCell && avoidTimer > 0 && mazeCells) {
      const es = worldToCell(enemy.position.x, enemy.position.z);
      const trGoal = avoidTargetCell.r, tcGoal = avoidTargetCell.c;
      const rows = mazeCells.length, cols = mazeCells[0].length;
      const dist = Array.from({ length: rows }, () => Array(cols).fill(-1));
      const prev = Array.from({ length: rows }, () => Array(cols).fill(null));
      const q = [[es.r, es.c]];
      dist[es.r][es.c] = 0;
      while (q.length) {
        const [r, c] = q.shift();
        if (r === trGoal && c === tcGoal) break;
        const cell = mazeCells[r][c];
        const nb = [];
        if (!cell.N && r > 0) nb.push([r - 1, c]);
        if (!cell.S && r < rows - 1) nb.push([r + 1, c]);
        if (!cell.W && c > 0) nb.push([r, c - 1]);
        if (!cell.E && c < cols - 1) nb.push([r, c + 1]);
        for (const [nr, nc] of nb) {
          if (dist[nr][nc] === -1) { dist[nr][nc] = dist[r][c] + 1; prev[nr][nc] = [r, c]; q.push([nr, nc]); }
        }
      }
      let tr = trGoal, tc = tcGoal;
      if (dist[tr][tc] !== -1) {
        while (prev[tr][tc] && !(prev[tr][tc][0] === es.r && prev[tr][tc][1] === es.c)) {
          const p = prev[tr][tc];
          tr = p[0];
          tc = p[1];
        }
        const target = cellToWorld(tr, tc);
        const toTarget = new THREE.Vector3(target.x - enemy.position.x, 0, target.z - enemy.position.z).normalize();
        enemyDir.copy(toTarget);
      }
      avoidTimer -= delta;
      if (avoidTimer <= 0) avoidTargetCell = null;
    } else {
      enemyTimer -= delta;
      if (enemyTimer <= 0) { enemyDir.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(); enemyTimer = 2 + Math.random() * 3; }
    }
  }
  const next = enemy.position.clone().add(new THREE.Vector3(enemyDir.x, 0, enemyDir.z).multiplyScalar(enemySpeed * delta));
  const bounce = willCollide(next, 0.4);
  if (!bounce) {
    enemy.position.set(next.x, enemy.position.y, next.z);
  } else {
    enemyDir.applyAxisAngle(new THREE.Vector3(0,1,0), (Math.random() - 0.5) * Math.PI);
  }
  const { xMin, xMax, zMin, zMax } = mapBounds;
  if (enemy.position.x < xMin + 0.8 || enemy.position.x > xMax - 0.8) enemyDir.x *= -1;
  if (enemy.position.z < zMin + 0.8 || enemy.position.z > zMax - 0.8) enemyDir.z *= -1;
}

function setupAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (!audioMasterGain) { audioMasterGain = audioCtx.createGain(); audioMasterGain.gain.value = 0.35; audioMasterGain.connect(audioCtx.destination); }
    if (!enemyGain) { enemyGain = audioCtx.createGain(); enemyGain.gain.value = 1; enemyGain.connect(audioMasterGain); }
    if (enemyNoiseSrc) { try { enemyNoiseSrc.stop(); } catch {} enemyNoiseSrc = null; }
    enemyFilter = null;
    audioCtx.resume();
  } catch {}
}

function enemyNoiseBurst(closeness) {
  if (!audioCtx || !audioMasterGain) return;
  const buffer = audioCtx.createBuffer(1, Math.floor(audioCtx.sampleRate * 0.25), audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  const fHigh = 1200;
  const fLow = 250;
  bp.frequency.value = fHigh * (1 - closeness) + fLow * closeness;
  bp.Q.value = 6;
  const gain = audioCtx.createGain();
  const amp = 0.03 + closeness * 0.06;
  const t = audioCtx.currentTime;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(amp, t + 0.03);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  src.connect(bp);
  bp.connect(gain);
  gain.connect(audioMasterGain);
  src.start(t);
  src.stop(t + 0.25);
}

function movePlayer(delta) {
  const speed = 3.2;
  const dir = new THREE.Vector3();
  controls.getDirection(dir);
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) {
    dir.set(0, 0, -1).applyQuaternion(controls.getObject().quaternion);
    dir.y = 0;
  }
  dir.normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
  const forwardFactor = (keys.has('KeyW') ? 1 : 0) + (keys.has('KeyS') ? -1 : 0);
  const strafeFactor = (keys.has('KeyD') ? 1 : 0) + (keys.has('KeyA') ? -1 : 0);
  const move = new THREE.Vector3();
  move.addScaledVector(dir, forwardFactor * speed * delta);
  move.addScaledVector(right, strafeFactor * speed * delta);
  const current = controls.getObject().position.clone();
  const next = current.clone().add(new THREE.Vector3(move.x, 0, move.z));
  const blocked = willCollide(next, 0.5);
  if (!blocked) controls.getObject().position.set(next.x, current.y, next.z);
  controls.getObject().position.y = 1.6; // lock to ground eye height
}

function willCollide(nextPos, radius) {
  const origins = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.25, 0, 0),
    new THREE.Vector3(-0.25, 0, 0),
    new THREE.Vector3(0, 0, 0.25),
    new THREE.Vector3(0, 0, -0.25)
  ];
  for (const offset of origins) {
    const origin = nextPos.clone().add(offset).add(new THREE.Vector3(0, 1.6, 0));
    for (const wall of collidables) {
      const bb = new THREE.Box3().setFromObject(wall);
      if (bb.expandByScalar(radius).containsPoint(origin)) return true;
    }
  }
  return false;
}

function shoot() {
  beginScan();
}

function getHeadOrigin() {
  const dir = forwardDirection();
  return camera.getWorldPosition(new THREE.Vector3()).add(dir.clone().multiplyScalar(0.1));
}

function shootDot() {
  castAndPlace(getHeadOrigin(), forwardDirection(), 1);
}

function shootRandom() {
  const origin = getHeadOrigin();
  const yaw = (Math.random() - 0.5) * Math.PI; // [-90°, +90°]
  const pitch = (Math.random() - 0.5) * Math.PI; // [-90°, +90°]
  const dir = offsetDirection(yaw, pitch);
  castAndPlace(origin, dir, 1);
}

function buildRectQueue() {
  const fov = { yaw: THREE.MathUtils.degToRad(35), pitch: THREE.MathUtils.degToRad(25) };
  const cols = 30;
  const rows = 25;
  const dirs = [];
  for (let iy = 0; iy < rows; iy++) {
    for (let ix = 0; ix < cols; ix++) {
      const u = ix / (cols - 1);
      const v = iy / (rows - 1);
      const yaw = (u - 0.5) * fov.yaw;
      const pitch = (v - 0.5) * fov.pitch;
      dirs.push(offsetDirection(yaw, pitch));
    }
  }
  return dirs;
}

function buildSpiralQueue() {
  const turns = 2 + Math.floor(density / 2);
  const samples = 100 + density * 40;
  const dirs = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const angle = t * Math.PI * 2 * turns;
    const rYaw = THREE.MathUtils.degToRad(35) * t;
    const rPitch = THREE.MathUtils.degToRad(25) * t;
    const yaw = Math.cos(angle) * rYaw;
    const pitch = Math.sin(angle) * rPitch;
    dirs.push(offsetDirection(yaw, pitch));
  }
  return dirs;
}

function buildFanQueue() {
  const steps = 20 + density * 6;
  const yawRadius = THREE.MathUtils.degToRad(35);
  const pitch = 0;
  const dirs = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const yaw = (t - 0.5) * 2 * yawRadius;
    dirs.push(offsetDirection(yaw, pitch));
  }
  return dirs;
}

function buildRingQueue() {
  const samples = 120 + density * 30;
  const yawR = THREE.MathUtils.degToRad(35);
  const pitchR = THREE.MathUtils.degToRad(25);
  const dirs = [];
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    const yaw = Math.cos(a) * yawR;
    const pitch = Math.sin(a) * pitchR;
    dirs.push(offsetDirection(yaw, pitch));
  }
  return dirs;
}

function buildCustomQueue() {
  const yawRange = THREE.MathUtils.degToRad(customX);
  const pitchRange = THREE.MathUtils.degToRad(customY);
  const count = scanDotLimit;
  const dirs = [];

  function addDir(y, p) { dirs.push(offsetDirection(y, p)); }

  function pointInPolygon(x, y, verts) {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const xi = verts[i].yaw, yi = verts[i].pitch;
      const xj = verts[j].yaw, yj = verts[j].pitch;
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi + 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function buildPolygonOutline(verts) {
    for (let i = 0; i < count; i++) {
      const s = i / count;
      const seg = Math.floor(s * verts.length);
      const t = s * verts.length - seg;
      const a = verts[seg % verts.length];
      const b = verts[(seg + 1) % verts.length];
      addDir(a.yaw + (b.yaw - a.yaw) * t, a.pitch + (b.pitch - a.pitch) * t);
    }
  }

  function buildPolygonFill(verts) {
    const stepsX = Math.max(2, Math.floor(Math.sqrt(count * (customX / (customY + 1e-9)))));
    const stepsY = Math.max(2, Math.floor(count / stepsX));
    for (let iy = 0; iy < stepsY; iy++) {
      for (let ix = 0; ix < stepsX; ix++) {
        const u = ix / (stepsX - 1);
        const v = iy / (stepsY - 1);
        const yaw = (u - 0.5) * 2 * yawRange;
        const pitch = (v - 0.5) * 2 * pitchRange;
        if (pointInPolygon(yaw, pitch, verts)) addDir(yaw, pitch);
      }
    }
  }

  if (customShape === 'rectangle') {
    const verts = [
      { yaw: -yawRange, pitch: -pitchRange },
      { yaw: yawRange, pitch: -pitchRange },
      { yaw: yawRange, pitch: pitchRange },
      { yaw: -yawRange, pitch: pitchRange }
    ];
    if (customFill) buildPolygonFill(verts); else buildPolygonOutline(verts);
  } else if (customShape === 'circle') {
    if (customFill) {
      const stepsR = Math.max(2, Math.floor(Math.sqrt(count)));
      const stepsA = Math.max(8, Math.floor(count / stepsR));
      for (let ir = 0; ir < stepsR; ir++) {
        const r = (ir + 1) / stepsR;
        for (let ia = 0; ia < stepsA; ia++) {
          const a = (ia / stepsA) * Math.PI * 2;
          addDir(Math.cos(a) * yawRange * r, Math.sin(a) * pitchRange * r);
        }
      }
    } else {
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        addDir(Math.cos(a) * yawRange, Math.sin(a) * pitchRange);
      }
    }
  } else if (customShape === 'triangle') {
    const verts = [
      { yaw: 0, pitch: -pitchRange },
      { yaw: yawRange, pitch: pitchRange },
      { yaw: -yawRange, pitch: pitchRange }
    ];
    if (customFill) buildPolygonFill(verts); else buildPolygonOutline(verts);
  } else if (customShape === 'hexagon') {
    const verts = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      verts.push({ yaw: Math.cos(a) * yawRange, pitch: Math.sin(a) * pitchRange });
    }
    if (customFill) buildPolygonFill(verts); else buildPolygonOutline(verts);
  } else if (customShape === 'star') {
    const verts = [];
    const inner = 0.45;
    for (let k = 0; k < 10; k++) {
      const ang = (k / 10) * Math.PI * 2;
      const rx = (k % 2 === 0 ? 1 : inner) * yawRange;
      const ry = (k % 2 === 0 ? 1 : inner) * pitchRange;
      verts.push({ yaw: Math.cos(ang) * rx, pitch: Math.sin(ang) * ry });
    }
    if (customFill) buildPolygonFill(verts); else buildPolygonOutline(verts);
  } else if (customShape === 'plus') {
    const barX = yawRange * 0.25;
    const barY = pitchRange * 0.25;
    if (customFill) {
      const steps = Math.max(2, Math.floor(Math.sqrt(count)));
      for (let iy = 0; iy < steps; iy++) {
        for (let ix = 0; ix < steps; ix++) {
          const u = ix / (steps - 1);
          const v = iy / (steps - 1);
          const yaw = (u - 0.5) * 2 * yawRange;
          const pitch = (v - 0.5) * 2 * pitchRange;
          const inVertical = Math.abs(yaw) <= barX;
          const inHorizontal = Math.abs(pitch) <= barY;
          if (inVertical || inHorizontal) addDir(yaw, pitch);
        }
      }
    } else {
      // Outline: sample edges of both bars
      for (let i = 0; i < count; i++) {
        const s = i / count;
        const seg = Math.floor(s * 4);
        const t = s * 4 - seg;
        let yaw = 0, pitch = 0;
        if (seg === 0) { yaw = -barX + 2 * barX * t; pitch = -pitchRange; }
        else if (seg === 1) { yaw = barX; pitch = -pitchRange + 2 * pitchRange * t; }
        else if (seg === 2) { yaw = barX - 2 * barX * t; pitch = pitchRange; }
        else { yaw = -barX; pitch = pitchRange - 2 * pitchRange * t; }
        addDir(yaw, pitch);
      }
    }
  }

  return dirs;
}

function beginScan() {
  scanQueue = [];
  scanIndex = 0;
  if (scanMode === 'rect') scanQueue = buildRectQueue();
  else if (scanMode === 'spiral') scanQueue = buildSpiralQueue();
  else if (scanMode === 'fan') scanQueue = buildFanQueue();
  else if (scanMode === 'custom') scanQueue = buildCustomQueue();
  if (scanQueue.length > scanDotLimit) scanQueue = scanQueue.slice(0, scanDotLimit);
  scanning = true;
}

function forwardDirection() {
  const d = new THREE.Vector3();
  controls.getDirection(d);
  return d.clone().normalize();
}

function offsetDirection(yawOffset, pitchOffset) {
  const forward = forwardDirection();
  const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
  const upWorld = new THREE.Vector3().crossVectors(right, forward).normalize();
  const qYaw = new THREE.Quaternion().setFromAxisAngle(upWorld, yawOffset);
  const qPitch = new THREE.Quaternion().setFromAxisAngle(right, pitchOffset);
  return forward.clone().applyQuaternion(qYaw).applyQuaternion(qPitch).normalize();
}

function castAndPlace(origin, direction, maxHits) {
  const raycaster = new THREE.Raycaster(origin.clone(), direction.clone(), 0.1, 100);
  const hits = raycaster.intersectObjects(collidables, false);
  if (hits.length > 0) {
    const hit = hits[0];
    placeDot(hit.point, hit.object === enemy);
  }
}

function placeDot(position, isEnemy = false) {
  let c = isEnemy ? 0xff0000 : 0x00ffff;
  if (!isEnemy && colorCheatEnabled) {
    if (colorMode === 'rainbow') {
      rainbowHue = (rainbowHue + 0.01) % 1;
      const clr = new THREE.Color();
      clr.setHSL(rainbowHue, 0.8, 0.5);
      c = clr.getHex();
    } else if (colorMode === 'dual') {
      const r = Math.random();
      c = (r < colorBRatio) ? colorB : colorA;
    }
  }
  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: c })
  );
  dot.position.copy(position);
  pointsGroup.add(dot);
  if (isEnemy) {
    setTimeout(() => {
      if (dot.parent) dot.parent.remove(dot);
    }, 3000);
  }
  while (pointsGroup.children.length > maxDots) {
    const oldest = pointsGroup.children[0];
    pointsGroup.remove(oldest);
  }
}

let lastTime = performance.now();
function anyMovementKeys() {
  return keys.has('KeyW') || keys.has('KeyA') || keys.has('KeyS') || keys.has('KeyD');
}

function animate() {
  const now = performance.now();
  const delta = (now - lastTime) / 1000;
  lastTime = now;
  audioAccum += delta;
  if (anyMovementKeys() || controls.isLocked) movePlayer(delta);
  if (anyMovementKeys()) {
    noiseLevel = Math.min(1, noiseLevel + NOISE_INC_RATE * delta);
  } else {
    noiseLevel = Math.max(0, noiseLevel - NOISE_DECAY_RATE * delta);
  }
  if (noiseFill) noiseFill.style.width = `${Math.floor(noiseLevel * 100)}%`;
  if (!won && !gameOver && goalArea) {
    const p = controls.getObject().position;
    const dx = p.x - goalArea.x;
    const dz = p.z - goalArea.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < goalArea.r) onWin();
  }
  updateEnemy(delta);
  if (enemyGain && enemy) {
    const p = controls.getObject().position;
    const dx = p.x - enemy.position.x;
    const dz = p.z - enemy.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const audibleRadius = 12;
    if (dist < audibleRadius) {
      const closeness = Math.max(0, Math.min(1, 1 - dist / audibleRadius));
      if (enemyPingTimer <= 0) {
        enemyNoiseBurst(closeness);
        const interval = Math.max(0.22, 0.8 - 0.5 * closeness);
        enemyPingTimer = interval;
      } else {
        enemyPingTimer -= delta;
      }
    } else {
      enemyPingTimer = 0;
    }
    const catchRadius = 0.8;
    if (!won && !gameOver && anyMovementKeys() && dist < catchRadius) onGameOver();
  }
  if (scanning) {
    if (scanMode === 'dot') {
      shootDot();
    } else if (scanMode === 'random') {
      const beams = 3;
      for (let i = 0; i < beams; i++) shootRandom();
    } else {
      const batch = Math.max(1, Math.floor(density / 2) + 2);
      const origin = getHeadOrigin();
      for (let i = 0; i < batch && scanIndex < scanQueue.length; i++) {
        const dir = scanQueue[scanIndex++];
        castAndPlace(origin, dir, 1);
      }
      if (scanIndex >= scanQueue.length) scanning = false;
    }
  }
  if (mappingEnabled) renderMiniMap();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

renderer.domElement.addEventListener('mousedown', e => {
  shoot();
});
renderer.domElement.addEventListener('mouseup', e => {
  scanning = false;
});

document.addEventListener('mousedown', e => {
  const t = e.target;
  const isUI = (t && (t.closest('#overlay') || t.closest('#miniMap') || t.closest('#changelogModal')));
  if (isUI) return;
  shoot();
});
document.addEventListener('mouseup', () => { scanning = false; });

// Scroll wheel to switch modes
window.addEventListener('wheel', e => {
  if (!controls.isLocked) return;
  const modes = ['dot', 'rect', 'spiral', 'fan', 'random', 'custom'];
  let idx = modes.indexOf(scanMode);
  if (e.deltaY > 0) idx = (idx + 1) % modes.length; else idx = (idx - 1 + modes.length) % modes.length;
  setMode(modes[idx]);
  e.preventDefault();
}, { passive: false });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
function renderMiniMap() {
  if (!miniMapCtx || !miniMapCanvas) return;
  const w = miniMapCanvas.width, h = miniMapCanvas.height;
  miniMapCtx.fillStyle = 'rgba(0,0,0,0.25)';
  miniMapCtx.fillRect(0, 0, w, h);
  const player = controls.getObject().position;
  const range = miniMapExpanded ? 50 : 25;
  function toScreen(x, z) {
    const dx = x - player.x;
    const dz = z - player.z;
    const sx = w / 2 + (dx / range) * (w / 2);
    const sy = h / 2 + (dz / range) * (h / 2);
    return { sx, sy };
  }
  function includeDot(x, z, prob) {
    const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453);
    const r = h - Math.floor(h);
    return r < prob;
  }
  miniMapCtx.fillStyle = '#00ffff';
  const maxDraw = miniMapExpanded ? 3000 : 1500;
  let drawn = 0;
  for (let i = pointsGroup.children.length - 1; i >= 0 && drawn < maxDraw; i--) {
    const dot = pointsGroup.children[i];
    const p = dot.position;
    const isFloor = p.y < 0.25;
    const isCeil = mapBounds && Math.abs(p.y - mapBounds.height) < 0.25;
    const prob = (isFloor || isCeil) ? 0.25 : 0.7;
    if (!includeDot(p.x, p.z, prob)) continue;
    const c = toScreen(p.x, p.z);
    const colorHex = dot.material && dot.material.color ? `#${dot.material.color.getHexString()}` : '#00ffff';
    miniMapCtx.fillStyle = colorHex;
    miniMapCtx.fillRect(Math.floor(c.sx), Math.floor(c.sy), 2, 2);
    drawn++;
  }
  miniMapCtx.fillStyle = '#ffffff';
  miniMapCtx.beginPath();
  miniMapCtx.arc(w / 2, h / 2, 3, 0, Math.PI * 2);
  miniMapCtx.fill();
}
let db = null;
function initLobbyBackend() {
  try {
    if (window.FIREBASE_CONFIG) {
      const app = firebase.initializeApp(window.FIREBASE_CONFIG);
      db = firebase.database(app);
    }
  } catch {}
}
initLobbyBackend();
function loadLobbies(cb) {
  if (db) {
    db.ref('lobbies').on('value', snap => {
      const val = snap.val() || {};
      const list = Object.values(val);
      cb(list);
    });
  } else {
    try { cb(JSON.parse(localStorage.getItem('MP_LOBBIES') || '[]')); } catch { cb([]); }
  }
}
function saveLobby(lobby) {
  if (db) {
    return db.ref(`lobbies/${lobby.code}`).set(lobby);
  } else {
    const list = (() => { try { return JSON.parse(localStorage.getItem('MP_LOBBIES') || '[]'); } catch { return []; } })();
    const idx = list.findIndex(l => l.code === lobby.code);
    if (idx >= 0) list[idx] = lobby; else list.push(lobby);
    localStorage.setItem('MP_LOBBIES', JSON.stringify(list));
  }
}
function makeCode() { return Math.random().toString(36).slice(2, 8); }
function renderLobbyList() {
  if (!mpLobbyListDiv) return;
  loadLobbies(list => {
    mpLobbyListDiv.innerHTML = list.length ? list.map(l => `<button data-code="${l.code}" data-locked="${l.locked ? '1':'0'}">${l.name} (${l.code}) ${l.locked ? '🔒' : '🌐'}</button>`).join(' ') : 'No lobbies';
    mpLobbyListDiv.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', () => {
        mpJoinCodeInput.value = b.getAttribute('data-code') || '';
        const locked = b.getAttribute('data-locked') === '1';
        if (locked && mpJoinPasswordInput) mpJoinPasswordInput.focus();
      });
    });
  });
}
let currentLobby = null;
let selfUsername = 'Player';
const playersGroup = new THREE.Group();
scene.add(playersGroup);
function makeNameSprite(text) {
  const cvs = document.createElement('canvas');
  cvs.width = 256; cvs.height = 64;
  const ctx = cvs.getContext('2d');
  ctx.clearRect(0,0,cvs.width,cvs.height);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, cvs.width, cvs.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '28px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cvs.width/2, cvs.height/2);
  const tex = new THREE.CanvasTexture(cvs);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.8, 0.45, 1);
  return spr;
}
function spawnAvatar(name, pos) {
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.8, 8, 16), new THREE.MeshStandardMaterial({ color: 0x66ccff }));
  body.position.set(pos.x, 1.0, pos.z);
  const label = makeNameSprite(name);
  label.position.set(0, 1.6, 0);
  body.add(label);
  playersGroup.add(body);
}
function clearAvatars() {
  while (playersGroup.children.length) playersGroup.remove(playersGroup.children[0]);
}
function enterLobby(lobby) {
  currentLobby = lobby;
  clearAvatars();
  if (db) {
    const code = lobby.code;
    db.ref(`lobbies/${code}/players`).on('value', snap => {
      const playersObj = snap.val() || {};
      const players = Object.values(playersObj);
      clearAvatars();
      for (const p of players) {
        if (p.name !== selfUsername) {
          const pos = randomOpenPosition(Math.random);
          spawnAvatar(p.name, pos);
        }
      }
    });
  } else {
    const players = Array.isArray(lobby.players) ? lobby.players : Object.values(lobby.players || {});
    for (const p of players) {
      if (p.name !== selfUsername) {
        const pos = randomOpenPosition(Math.random);
        spawnAvatar(p.name, pos);
      }
    }
  }
  mpModal.classList.remove('show');
}
if (mpCreateBtn) mpCreateBtn.addEventListener('click', () => {
  const name = (mpLobbyNameInput && mpLobbyNameInput.value.trim()) || 'Lobby';
  const user = (mpUsernameInput && mpUsernameInput.value.trim()) || 'Player';
  const locked = !!(mpLockInput && mpLockInput.checked);
  const pass = (mpPasswordInput && mpPasswordInput.value) || '';
  selfUsername = user;
  const code = makeCode();
  const lobby = { code, name, locked, password: locked ? pass : '', players: {} };
  lobby.players[user] = { name: user };
  if (db) saveLobby(lobby); else {
    const list = (() => { try { return JSON.parse(localStorage.getItem('MP_LOBBIES') || '[]'); } catch { return []; } })();
    list.push({ code, name, locked, password: locked ? pass : '', players: [{ name: user }] });
    localStorage.setItem('MP_LOBBIES', JSON.stringify(list));
  }
  renderLobbyList();
  enterLobby(lobby);
});
if (mpJoinBtn) mpJoinBtn.addEventListener('click', () => {
  const code = (mpJoinCodeInput && mpJoinCodeInput.value.trim()) || '';
  const user = (mpUsernameInput && mpUsernameInput.value.trim()) || 'Player';
  const pass = (mpJoinPasswordInput && mpJoinPasswordInput.value) || '';
  selfUsername = user;
  if (db) {
    db.ref(`lobbies/${code}`).get().then(snap => {
      const lobby = snap.val();
      if (!lobby) return;
      if (lobby.locked && lobby.password !== pass) return;
      lobby.players = lobby.players || {};
      lobby.players[user] = { name: user };
      saveLobby(lobby);
      enterLobby(lobby);
    });
  } else {
    const list = (() => { try { return JSON.parse(localStorage.getItem('MP_LOBBIES') || '[]'); } catch { return []; } })();
    const lobby = list.find(l => l.code === code);
    if (!lobby) return;
    if (lobby.locked && lobby.password !== pass) return;
    lobby.players.push({ name: user });
    localStorage.setItem('MP_LOBBIES', JSON.stringify(list));
    enterLobby(lobby);
  }
});
window.addEventListener('beforeunload', () => {
  try {
    if (db && currentLobby && selfUsername) {
      db.ref(`lobbies/${currentLobby.code}/players/${selfUsername}`).remove();
    }
  } catch {}
});
