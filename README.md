# LiDAR Maze Scanner

LiDAR Maze Scanner is a browser-based first-person scanning game. Walk through a procedurally built maze and reveal the environment by firing scanning beams that place dots where rays hit geometry. You can switch between scan patterns, tune density, and even design custom shapes to outline or fill.

## Quick Start

- Requirements: a modern desktop browser. To avoid file loading issues, run a local server.
- From the project root, start a server:

  ```
  python -m http.server 8000
  ```

- Open `http://localhost:8000/` in your browser.

## How To Play

- Click the screen to lock the cursor and enter pointer-lock mode.
- Move with `W`, `A`, `S`, `D`.
- Hold left mouse button to scan; release to stop.
- Switch scan mode with the mouse wheel or hotkeys:
  - `1` Dot
  - `2` Rect Grid
  - `3` Spiral
  - `4` Fan
  - `5` Random Beam (forward hemisphere)
- The current mode is shown at the bottom-left.

## Settings

- Open the Settings button at the top-left.
- `Density`: adjusts how many rays are cast per frame for queued modes.
- `Max dots`: sets the maximum number of dots kept in the scene (2,000–10,000). When the limit is exceeded, older dots are removed.
- `Clear dots`: removes all placed dots.

## Custom Scans

- In Settings, choose a `Custom` shape and press `Create` to switch to Custom mode.
- Shapes: Rectangle, Circle, Triangle, Hexagon, Star, Plus.
- `X size` and `Y size`: angular width/height in degrees for the shape’s yaw/pitch spread.
- `Fill` checkbox: toggle between outline and filled sampling.
- `Dots/scan`: slider controlling how many dots the custom scan places per hold.
- Only one custom pattern is active at a time; creating a new one replaces the previous.

## Tips

- For reliable dot placement, scan while facing walls or obstacles; beams place dots on the first surface they hit.
- Use `Random Beam` to quickly spray the area in front of you.
- If the cursor unlocks, click the screen again to re-enter pointer-lock.

## Development Notes

- The game uses `three.js` for rendering and pointer lock controls.
- Map configuration is loaded from `map.json`. If loading fails, a default map is generated.
