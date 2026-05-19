# Flyff Mapper

Browser extension for Universe Flyff that adds an in-game visual key-mapping overlay on top of the game canvas.

Target page: `https://universe.flyff.com/play*`

## What it does

Flyff Mapper lets you place draggable/resizable/rotatable trigger shapes over UI or world positions. Each shape can be assigned a keyboard shortcut. In play mode, pressing the assigned key dispatches a click at that shape's center.

This helps map keyboard keys to mouse-click actions without leaving the game viewport.

## Current feature set

- Overlay control panel with draggable + resizable window.
- Fixed mapper toggle shortcut: `Alt+Shift+M`.
- Edit/Stop mode toggle (customizable shortcut).
- Add Key Map action (customizable shortcut).
- Focus canvas shortcut (customizable).
- Hide/show shapes shortcut (customizable).
- Strict input passthrough toggle for smoother gameplay.
- Shape editing:
  - Drag, resize, rotate.
  - Assign key binding per shape.
  - Delete shape with close button or `Delete` key in edit mode.
  - Move selected shape with arrow keys (`Shift` for bigger step).
  - Copy/paste selected shape with `Ctrl/Cmd+C` and `Ctrl/Cmd+V`.
- Shape types:
  - rectangle, circle, ellipse, triangle, diamond, hexagon, star, pill, arrow, trapezoid.
- Theme options: Light, Dark, System.
- Global opacity control for all shapes.
- Mapping portability:
  - Copy active profile mapping JSON to clipboard.
  - Import mapping JSON as a new named profile.
- Profile-based mapping management:
  - Switch active profile.
  - Rename, create, and delete profiles.
- Persistent local storage for settings and shapes.

## What's new in v3.3.0

### Discord push notifications and reliability

- Replaced mobile push provider integration with Discord bot DM support.
- Added configurable Discord Bot URL, Discord User ID, and Discord Bot API key.
- Added `Test Connection` action for bot health checks before sending push messages.
- Improved notification flow reliability so auto-stop and reCAPTCHA paths consistently attempt Discord push delivery.

### Persistence and storage safety

- Improved persistence behavior for mobile push configuration fields so values are retained across tab/window reloads.
- Added IndexedDB mirroring for persistent mapper state with verification-based migration from local storage.
- Added write-ahead backups and recovery logic to reduce risk of data corruption during storage writes.
- Added startup storage health check with automatic repair for recoverable inconsistencies.

### Cross-tab behavior and profile sync

- Extended cross-tab synchronization to include profile visual state updates (shape visibility and related profile state).
- Improved mapper/profile state propagation to reduce stale tab state after profile updates.
- Settings and Key Mapper configuration changes now sync across open tabs and are restored after tab/window restart.

## What's new in v3.1.0

### Key Trigger chaining and execution model

- Profile-level repeat trigger mode:
  - Profiles can now run in `once`, `toggle`, or `repeat` mode.
  - `repeat` mode runs a profile for a configured number of cycles.

- Action-level repeat mode:
  - Each action can run in `once` or `repeat` mode.
  - Action repeat count is configurable per action.

- Hold-to-repeat trigger behavior:
  - Holding a profile trigger key now repeatedly executes profile actions at interval.

- Chain-aware sequential timing:
  - If an action triggers another profile (by using that profile's trigger key), sequential mode now waits for the triggered profile chain to complete before continuing.
  - Next action timing becomes: `triggered chain total duration + next action delay`.

- Chain-aware synchronous timing:
  - Synchronous delay mode is now inherited through profile chains.
  - This inheritance applies to both plain key actions and profile-triggering actions.

### Cross-tab sync and profile mapping

- Key Mapper character-profile switching in other tabs no longer sticks to an old mapping.
- Mapper auto-apply mapping now avoids overwriting manual profile switches.
- Selected Key Trigger character/tab targets are preserved across transient tab reloads and restored when tabs are available again.
- Cross-tab runtime sync now includes `experimentalFeaturesEnabled` state.

### Auto-Awaken reliability improvements

- Criteria evaluation now follows intended logic:
  - OR inside each criteria section.
  - AND between Stat 1 and Stat 2 sections.
  - Correct handling of pooled detections across both stat panels.
  - Correct single-section sum behavior.
- Added regression tests for Auto-Awaken matching behavior.

## Tech stack

- React + TypeScript + Vite
- Ant Design (UI)
- react-rnd (drag/resize)
- Tailwind utility classes (content styles)
- Manifest V3 Chrome extension

## Project structure

- `public/manifest.json` – extension manifest and command registration.
- `public/background.js` – background service worker.
- `src/content/main.tsx` – core mapper UI + interaction logic.
- `src/content/keybinding.ts` – key matching and click dispatch logic.
- `src/content/storage.ts` – persistent state load/save, migration, and recovery safeguards.
- `src/content/types.ts` – mapper and shape types.

## Development setup

### Prerequisites

- Node.js 20+
- npm
- Chromium browser (Chrome/Edge)

### Install dependencies

```bash
npm install
```

### Build extension assets

```bash
npm run build
```

Build output is generated in `dist/`.

### Optional commands

```bash
npm run lint
npm run test
npm run dev
```

## Load unpacked extension

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the project's `dist/` folder.

## Quick start

1. Open `https://universe.flyff.com/play`.
2. Press `Alt+Shift+M` to open/close the mapper panel.
3. Ensure mapper is in edit mode (Start/Stop button state).
4. Click **Add Key Map**.
5. Move/resize/rotate the new shape onto your target UI location.
6. Click the shape shortcut input and press the desired key combo.
7. Switch to play mode and test your binding.

## Shortcuts

### Fixed shortcut

- Mapper toggle: `Alt+Shift+M` (not configurable).

### Configurable shortcuts

- Add Key Map shortcut
- Start/Stop shortcut
- Focus Canvas shortcut
- Hide Shapes shortcut

All configurable shortcuts can be edited from the control panel.

## Settings behavior

- **Strict Input Passthrough**
  - When enabled, gameplay keys are passed through unless they match mapper shortcuts.
  - Intended to reduce movement interruption while playing.

- **Opacity**
  - Applies to all shapes.

- **Theme**
  - Changes panel/overlay visual style only.

## Import/Export format

`Copy Share JSON` exports a schema-based payload that includes Key Mapper, Key Trigger, settings, UI state, and character-profile mappings.

Top-level payload (`schemaVersion: 2`):

```json
{
  "schemaVersion": 2,
  "exportedAt": "2025-03-01T11:22:33.000Z",
  "profiles": [
    {
      "id": "profile-1",
      "name": "My Mapper Profile",
      "shapes": [
        {
          "id": "shape-1",
          "type": "rectangle",
          "x": 120,
          "y": 240,
          "width": 140,
          "height": 100,
          "rotation": 0,
          "opacity": 1,
          "keyBinding": "Q"
        }
      ],
      "settings": {
        "theme": "system",
        "editMode": true,
        "showHandles": false,
        "strictPassthrough": true,
        "addKeyMapShortcut": "Alt+Shift+A",
        "toggleModeShortcut": "Alt+Shift+S",
        "focusCanvasShortcut": "Alt+Shift+F",
        "toggleShapesShortcut": "Alt+Shift+H"
      }
    }
  ],
  "activeProfileId": "profile-1",
  "settings": {
    "theme": "system",
    "editMode": true,
    "showHandles": false,
    "strictPassthrough": true,
    "addKeyMapShortcut": "Alt+Shift+A",
    "toggleModeShortcut": "Alt+Shift+S",
    "focusCanvasShortcut": "Alt+Shift+F",
    "toggleShapesShortcut": "Alt+Shift+H"
  },
  "uiState": {
    "selectedPaletteShape": "rectangle",
    "dialogRect": {
      "x": 90,
      "y": 70,
      "width": 560,
      "height": 680
    },
    "selectedUtilityTab": "key-mapper"
  },
  "keyTriggerProfiles": [
    {
      "id": "kt-profile-1",
      "profileIdentifier": "kt-identifier-abc123",
      "name": "Burst Combo",
      "enabled": true,
      "triggerType": "once",
      "triggerKey": "R",
      "delayMode": "sequential",
      "actions": [
        {
          "id": "kt-action-1",
          "name": "Action 1",
          "key": "1",
          "delayMs": 0,
          "enabled": true,
          "currentTabOnly": false,
          "otherTabsOnly": false
        }
      ]
    }
  ],
  "selectedKeyTriggerTabIds": [123],
  "selectedKeyTriggerTabNames": ["MyCharacter"],
  "keyTriggerCharacterProfileMapping": {
    "MyCharacter": "kt-profile-1"
  },
  "mapperCharacterProfileMapping": {
    "MyCharacter": "profile-1"
  }
}
```

How import works:

- Paste JSON into `Import shared mappings` and click `Import`.
- If key-mapper profiles are present, you are prompted for a base profile name.
- Imported key-mapper profile IDs are regenerated, and character mappings are remapped to those new IDs.
- Imported key-trigger profile/action IDs are regenerated, and key-trigger character mappings are remapped.
- Import merges into existing data; it does not wipe current profiles.

Duplicate handling:

- Key Mapper duplicate detection is signature-based (normalized profile content).
- Key Trigger duplicate detection prioritizes `profileIdentifier` first, then falls back to signature matching.
- If a key-trigger profile matches an existing `profileIdentifier`, import skips creating a duplicate and remaps imported references to the existing local profile.
- Duplicate profiles are skipped and summarized in an import warning.

Settings and UI merge behavior:

- Top-level `settings` are applied if present.
- Profile-level settings inside `profiles[]` are preserved for each imported key-mapper profile.
- Conflicting global shortcuts are not blindly overwritten; conflicts are detected and kept on current local values with warnings.
- `uiState.selectedPaletteShape`, `uiState.selectedUtilityTab`, and `uiState.dialogRect` are applied only when valid.
- `selectedKeyTriggerTabIds` and `selectedKeyTriggerTabNames` are resolved against currently available characters/tabs.

Supported payload shapes:

- Current schema (`schemaVersion: 2`) full payload.
- Legacy payload with top-level `profileName` + `shapes` (+ optional `settings`).

Edge cases:

- Invalid JSON or payloads without importable data show an error and are rejected.
- Key-trigger actions with missing values are normalized (`name`, `delayMs`, `enabled`, tab flags).
- Empty/invalid character mapping entries are ignored.
- If imported profile names collide, unique names are generated.
- If imported key-mapper profiles are all duplicates, only non-profile sections (for example key-trigger data/settings/UI) can still be applied when valid.
- Importing the same key-trigger payload repeatedly will not duplicate profiles when `profileIdentifier` is present and stable.

## Troubleshooting

- **Shortcuts are not firing**
  - Confirm you are on `https://universe.flyff.com/play*`.
  - Verify the shortcut is assigned and unique.
  - Make sure mapper panel is loaded (`Alt+Shift+M`).

- **Movement feels interrupted**
  - Enable **Strict Input Passthrough**.
  - Avoid assigning essential movement keys to shape mappings.

- **Import fails**
  - Ensure the pasted content is valid JSON.
  - Ensure `shapes` is an array when present.

## Permissions

Declared in manifest:

- `activeTab`
- `storage`
- `scripting`
- Host permission: `https://universe.flyff.com/*`

## Versioning

Current release version is `3.1.0`.

Extension manifest format remains **Manifest V3**.

See `RELEASE_NOTES.md` for publish-ready release notes.
