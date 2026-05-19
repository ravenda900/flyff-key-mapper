# Flyff Mapper Release Notes

## v3.3.0 (2026-05-19)

Discord Mobile Push, Storage Hardening, and Cross-Tab Persistence Improvements.

### Added

- Added Discord bot DM mobile push integration with configurable Bot URL, Discord User ID, and API key fields.
- Added Test Connection action for validating Discord bot health before sending notifications.
- Added IndexedDB mirroring for persistent storage with migration verification from existing local storage values.
- Added startup storage health checks with automatic repair for recoverable storage inconsistencies.

### Changed

- Updated notification delivery pipeline so auto-stop and reCAPTCHA-triggered paths consistently attempt Discord push delivery.
- Updated settings persistence flow so mobile push configuration fields remain stable across tab/window reloads and profile transitions.
- Updated cross-tab profile synchronization behavior for mapper state updates.
- Updated Settings and Key Mapper configuration sync so changes propagate across tabs and persist after browser/tab restart.

### Fixed

- Fixed cases where mobile push settings could be lost after tab reload or profile state changes.
- Fixed scenarios where storage payload corruption could cause profile/settings instability by adding backup restore paths.

### Packaging

- Package version updated to 3.3.0.
- Manifest extension version updated to 3.3.0.

## v3.2.0 (2026-05-15)

Key Mapper Footer UX and Action Placement Improvements.

### Changed

- Updated Key Trigger footer action button hierarchy for clearer intent:
  - Save now uses success-oriented styling.
  - Cancel now uses danger-oriented styling.
- Updated footer action button typography sizing to improve readability and reduce visual crowding.
- Updated Add Action button styling to improve affordance and visual clarity.
- Moved the Add Key Map action button in Key Mapper to sit directly above Shape Palette for a more intuitive create-then-select workflow.
- Improved footer action layout behavior so control rows expand consistently across available width.

### Fixed

- Fixed footer action visual inconsistency where oversized button text reduced scanability.

### Packaging

- Manifest extension version updated to 3.2.0.

## v3.1.0 (2026-05-15)

Chained Profile Timing, Cross-Tab Mapper Stability, and Auto-Awaken Reliability.

### Added

- Added profile-level Key Trigger repeat mode (triggerType: repeat) with configurable repeat count.
- Added action-level repeat mode (actionTriggerType: repeat) with per-action repeat count.
- Added hold-to-repeat trigger behavior for Key Trigger profiles while the trigger key is held.

### Changed

- Changed chained profile behavior in sequential mode: when an action triggers another profile, subsequent actions now wait for the triggered profile to finish, then apply the next action delay.
- Changed chained profile behavior in synchronous mode: inherited synchronous timing is now applied consistently to plain actions and profile-triggered actions across the full chain.
- Updated cross-tab run-state sync payload to include experimentalFeaturesEnabled.
- Updated selected character/tab retention so Key Trigger selections survive transient tab reload windows.

### Fixed

- Fixed Key Mapper character-profile mapping getting stuck after switching profiles in other tabs.
- Fixed mapping sync race that could revert manual profile switches during auto-apply mapping.
- Fixed Auto-Awaken criteria evaluation to match intended semantics.
- Fixed Auto-Awaken section matching to use OR logic within each configured section and AND logic across Stat 1 and Stat 2 sections.
- Fixed Auto-Awaken cross-panel occurrence pooling and single-section sum-mode handling.

### Tests

- Added and stabilized Auto-Awaken regression coverage for criteria matching behavior.

### Packaging

- Package version updated to 3.1.0.
- Manifest extension version updated to 3.1.0.

## v3.0.0 (2026-05-13)

Character-Aware Key Trigger Profiles and Parallel Synchronous Runtime.

### Added

- Added character-aware Key Trigger profile mapping using tab title format `<IGN> - Flyff Universe` so each character restores its previously selected Key Trigger profile.
- Added dialog-open refresh for Key Trigger tabs so persisted checked characters/tabs are re-applied immediately when the pane is opened.

### Changed

- Changed Key Trigger profile persistence from tab-id-oriented behavior to character-name-oriented behavior for better stability across tab refreshes and tab id changes.
- Updated synchronous toggle execution behavior so each action runs in parallel on its own interval (for example 500ms, 10000ms, 19000ms, 46000ms) until toggle is stopped.
- Updated synchronous run-once execution behavior to launch each action once at its own delay in parallel.

### Fixed

- Fixed Key Trigger toggle delay-mode resolution when profile ids are scoped with tab ids (`profileId::tabIds`), which previously caused synchronous profiles to run as sequential.
- Fixed inconsistent preselection restoration by combining persisted selected tab ids and persisted character names during tab reload.

### Packaging

- Package version updated to `3.0.0`.

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
