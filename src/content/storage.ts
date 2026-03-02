import type { MapperSettings, ShapeMapping } from "./types";

const SHAPES_KEY = "flyff-mapper-shapes-v1";
const SETTINGS_KEY = "flyff-mapper-settings-v1";

const defaultSettings: MapperSettings = {
  theme: "system",
  editMode: true,
  showHandles: false,
  strictPassthrough: true,
  addKeyMapShortcut: "Alt+Shift+A",
  toggleModeShortcut: "Alt+Shift+S",
  focusCanvasShortcut: "Alt+Shift+F",
  toggleShapesShortcut: "Alt+Shift+H",
};

export const storage = {
  loadShapes(): ShapeMapping[] {
    try {
      const raw = window.localStorage.getItem(SHAPES_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed as ShapeMapping[];
    } catch {
      return [];
    }
  },

  saveShapes(shapes: ShapeMapping[]): void {
    window.localStorage.setItem(SHAPES_KEY, JSON.stringify(shapes));
  },

  loadSettings(): MapperSettings {
    try {
      const raw = window.localStorage.getItem(SETTINGS_KEY);
      if (!raw) {
        return defaultSettings;
      }
      const parsed = JSON.parse(raw) as Partial<MapperSettings>;
      return {
        theme: parsed.theme ?? defaultSettings.theme,
        editMode: parsed.editMode ?? defaultSettings.editMode,
        showHandles: parsed.showHandles ?? defaultSettings.showHandles,
        strictPassthrough:
          parsed.strictPassthrough ?? defaultSettings.strictPassthrough,
        addKeyMapShortcut:
          parsed.addKeyMapShortcut ?? defaultSettings.addKeyMapShortcut,
        toggleModeShortcut:
          parsed.toggleModeShortcut ?? defaultSettings.toggleModeShortcut,
        focusCanvasShortcut:
          parsed.focusCanvasShortcut ?? defaultSettings.focusCanvasShortcut,
        toggleShapesShortcut:
          parsed.toggleShapesShortcut ?? defaultSettings.toggleShapesShortcut,
      };
    } catch {
      return defaultSettings;
    }
  },

  saveSettings(settings: MapperSettings): void {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },
};
