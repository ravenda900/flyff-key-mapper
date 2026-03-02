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
  - Copy mapping JSON to clipboard.
  - Import mapping JSON.
- Persistent local storage for settings and shapes.

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
- `src/content/storage.ts` – local storage load/save.
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

Export copies a JSON payload containing both `shapes` and `settings`.

Top-level format:

```json
{
  "shapes": [
    {
      "id": "...",
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
```

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

Manifest version is currently `1.0.1`.

See `RELEASE_NOTES.md` for publish-ready release notes.
