# Flyff Mapper Release Notes

## v2.0.0 (2026-03-05)

Major feature and UX release focused on key-sequence control, shape interaction upgrades, theme consistency, and shortcut visualization.

### Added

- Added full-side shape resize handles (top/right/bottom/left) in addition to corner handles.
- Added timed completion windows for key and click sequences so unfinished multi-step shortcuts can pass through to gameplay input.
- Added richer shortcut rendering across mapper surfaces using consistent key/mouse visual tokens.

### Changed

- Updated shortcut capture/trigger behavior for multi-step bindings with modifiers (for example `Shift+K+W`).
- Updated running-mode shape shortcut display to use styled shortcut tokens (same visual language as edit mode).
- Expanded dark-theme coverage and alignment across dialog controls, tooltips, segmented/select surfaces, and modal variants.
- Improved segmented styling in dark mode to keep selected state visually distinct while avoiding layout shift.

### Fixed

- Fixed movement and non-movement sequence passthrough conflicts (`Space+Space`, `H+H`, and similar patterns).
- Fixed reserved global shortcut suppression for shape triggers (including mapper toggle binding).
- Fixed passive wheel listener warning by ensuring safe event handling in wheel-trigger paths.
- Fixed overlapping shortcut text in configuration inputs by strengthening hidden-underlay input styling.

### Packaging

- Manifest version updated to `2.0.0`.
- Package version updated to `2.0.0`.

## v1.0.1 (2026-03-02)

Minor feature and stability update focused on gameplay smoothness and shape authoring workflow.

### Added

- Added a draggable SVG **Shape Palette** with basic shapes.
- Added palette selection state with default selected shape set to **rectangle**.
- Added drag-from-palette to canvas creation flow.
- Added double-click on the selected palette shape to add it to canvas.
- Added read-only mapper toggle label in the panel header.

### Changed

- Mapper toggle shortcut remains fixed to `Alt+Shift+M`.
- Added configurable **Add Key Map** shortcut while keeping the **Add Key Map** button default behavior (rectangle).

### Fixed

- Improved continuous gameplay input passthrough behavior.
- Improved right-click camera-pan + movement key compatibility.
- Fixed cursor state restoration so game cursor remains stable.
- Ensured mapper dialog hides during palette dragging and restores after drag ends.

### Packaging

- Manifest version updated to `1.0.1`.

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
