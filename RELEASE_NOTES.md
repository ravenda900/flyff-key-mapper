# Flyff Mapper Release Notes

## v1.0.0 (2026-03-02)

Initial public release of Flyff Mapper for Universe Flyff.

### Highlights

- Added in-game key mapping overlay for `https://universe.flyff.com/play*`.
- Added draggable, resizable, rotatable trigger shapes.
- Added per-shape shortcut binding with visual shortcut tooltip.
- Added mapping import/export via JSON.
- Added persistent local settings and shape storage.

### Core Features

- Fixed overlay toggle shortcut: `Alt+Shift+M`.
- Configurable shortcuts:
  - Add Key Map
  - Start/Stop
  - Focus Canvas
  - Hide Shapes
- Edit and play workflow with Start/Stop control.
- Theme selection: Light, Dark, System.
- Global shape opacity control.
- Shape types:
  - rectangle, circle, ellipse, triangle, diamond, hexagon, star, pill, arrow, trapezoid.

### Input and Gameplay Improvements

- Added strict input passthrough mode to reduce gameplay interference.
- Improved keyboard handling so movement keys pass through cleanly in play mode.
- Improved right-click camera pan behavior while holding movement keys.
- Fixed cursor handling so extension interactions do not break in-game cursor state.

### Sharing and Portability

- Added `Copy Mapping JSON` action for sharing setups.
- Added `Import Mapping JSON` with validation and error feedback.

### Notes for Users

- Mapper toggle shortcut is permanent: `Alt+Shift+M`.
- The Add Key Map shortcut is configurable (default `Alt+Shift+A`).
- Existing local settings are automatically migrated with defaults for newly introduced fields.

### Packaging

- Manifest version: `1.0.0`
- Manifest format: Chrome Extension Manifest V3

---

For setup and usage instructions, see `README.md`.
