import type {
  DialogRect,
  MapperProfilesState,
  MapperSettings,
  MapperUiState,
  MappingProfile,
  ShapeMapping,
  ShapeType,
} from "./types";

const SHAPES_KEY = "flyff-mapper-shapes-v1";
const SETTINGS_KEY = "flyff-mapper-settings-v1";
const PROFILES_KEY = "flyff-mapper-profiles-v1";
const UI_STATE_KEY = "flyff-mapper-ui-state-v1";

const DEFAULT_DIALOG_RECT: DialogRect = {
  x: 40,
  y: 80,
  width: 420,
  height: 540,
};

const isShapeType = (value: unknown): value is ShapeType =>
  [
    "rectangle",
    "circle",
    "ellipse",
    "triangle",
    "diamond",
    "pentagon",
    "hexagon",
    "octagon",
    "star",
    "pill",
    "arrow",
    "trapezoid",
  ].includes(String(value));

const normalizeDialogRect = (value: unknown): DialogRect => {
  if (typeof value !== "object" || !value) {
    return { ...DEFAULT_DIALOG_RECT };
  }

  const parsed = value as Partial<DialogRect>;
  const width = Number(parsed.width);
  const height = Number(parsed.height);
  const x = Number(parsed.x);
  const y = Number(parsed.y);

  return {
    x: Number.isFinite(x) ? x : DEFAULT_DIALOG_RECT.x,
    y: Number.isFinite(y) ? y : DEFAULT_DIALOG_RECT.y,
    width: Number.isFinite(width)
      ? Math.max(360, width)
      : DEFAULT_DIALOG_RECT.width,
    height: Number.isFinite(height)
      ? Math.max(430, height)
      : DEFAULT_DIALOG_RECT.height,
  };
};

const createProfileId = () =>
  `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeDelayMs = (value: unknown): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }

  return Math.max(0, Math.round(numeric));
};

const normalizeLoadedShapes = (shapes: ShapeMapping[]): ShapeMapping[] =>
  shapes.map((shape) => ({
    ...shape,
    delayMs: normalizeDelayMs((shape as Partial<ShapeMapping>).delayMs),
    triggerType:
      (shape as Partial<ShapeMapping>).triggerType === "toggle"
        ? "toggle"
        : "once",
  }));

export const DEFAULT_SETTINGS: MapperSettings = {
  theme: "system",
  editMode: true,
  showHandles: false,
  showSnapIndicators: true,
  strictPassthrough: true,
  addKeyMapShortcut: "Alt+Shift+A",
  toggleModeShortcut: "Alt+Shift+S",
  focusCanvasShortcut: "Alt+Shift+F",
  toggleShapesShortcut: "Alt+Shift+H",
  setZeroOpacityShortcut: "Alt+Shift+0",
};

const normalizeSettings = (
  parsed: Partial<MapperSettings> | undefined,
): MapperSettings => ({
  theme: parsed?.theme ?? DEFAULT_SETTINGS.theme,
  editMode: parsed?.editMode ?? DEFAULT_SETTINGS.editMode,
  showHandles: parsed?.showHandles ?? DEFAULT_SETTINGS.showHandles,
  showSnapIndicators:
    parsed?.showSnapIndicators ?? DEFAULT_SETTINGS.showSnapIndicators,
  strictPassthrough:
    parsed?.strictPassthrough ?? DEFAULT_SETTINGS.strictPassthrough,
  addKeyMapShortcut:
    parsed?.addKeyMapShortcut ?? DEFAULT_SETTINGS.addKeyMapShortcut,
  toggleModeShortcut:
    parsed?.toggleModeShortcut ?? DEFAULT_SETTINGS.toggleModeShortcut,
  focusCanvasShortcut:
    parsed?.focusCanvasShortcut ?? DEFAULT_SETTINGS.focusCanvasShortcut,
  toggleShapesShortcut:
    parsed?.toggleShapesShortcut ?? DEFAULT_SETTINGS.toggleShapesShortcut,
  setZeroOpacityShortcut:
    parsed?.setZeroOpacityShortcut ?? DEFAULT_SETTINGS.setZeroOpacityShortcut,
});

const buildDefaultProfileState = (
  shapes: ShapeMapping[] = [],
  settings: MapperSettings = DEFAULT_SETTINGS,
): MapperProfilesState => {
  const defaultProfile: MappingProfile = {
    id: createProfileId(),
    name: "Default",
    shapes,
    settings,
  };

  return {
    activeProfileId: defaultProfile.id,
    profiles: [defaultProfile],
  };
};

const toValidProfile = (
  value: unknown,
  fallbackSettings: MapperSettings,
): MappingProfile | null => {
  if (typeof value !== "object" || !value) {
    return null;
  }

  const parsed = value as Partial<MappingProfile>;
  if (!Array.isArray(parsed.shapes)) {
    return null;
  }

  const id =
    typeof parsed.id === "string" && parsed.id.trim().length > 0
      ? parsed.id
      : createProfileId();

  const name =
    typeof parsed.name === "string" && parsed.name.trim().length > 0
      ? parsed.name.trim()
      : "Imported";

  return {
    id,
    name,
    shapes: normalizeLoadedShapes(parsed.shapes as ShapeMapping[]),
    settings: normalizeSettings(
      (parsed.settings as Partial<MapperSettings> | undefined) ??
        fallbackSettings,
    ),
  };
};

export const storage = {
  loadProfiles(): MapperProfilesState {
    try {
      const legacySettings = storage.loadSettings();
      const rawProfiles = window.localStorage.getItem(PROFILES_KEY);
      if (rawProfiles) {
        const parsed = JSON.parse(rawProfiles) as Partial<MapperProfilesState>;
        const profiles = Array.isArray(parsed.profiles)
          ? parsed.profiles
              .map((profile) => toValidProfile(profile, legacySettings))
              .filter((profile): profile is MappingProfile => profile !== null)
          : [];

        if (profiles.length === 0) {
          return {
            activeProfileId: "",
            profiles: [],
          };
        }

        const activeProfileId = profiles.some(
          (profile) => profile.id === parsed.activeProfileId,
        )
          ? (parsed.activeProfileId as string)
          : profiles[0].id;

        return {
          activeProfileId,
          profiles,
        };
      }

      const migrated = buildDefaultProfileState(
        storage.loadShapes(),
        legacySettings,
      );
      storage.saveProfiles(migrated);
      return migrated;
    } catch {
      const fallback = buildDefaultProfileState();
      storage.saveProfiles(fallback);
      return fallback;
    }
  },

  saveProfiles(state: MapperProfilesState): void {
    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(state));
  },

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
      return normalizeLoadedShapes(parsed as ShapeMapping[]);
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
        return DEFAULT_SETTINGS;
      }
      const parsed = JSON.parse(raw) as Partial<MapperSettings>;
      return normalizeSettings(parsed);
    } catch {
      return DEFAULT_SETTINGS;
    }
  },

  saveSettings(settings: MapperSettings): void {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  },

  loadUiState(): MapperUiState {
    try {
      const raw = window.localStorage.getItem(UI_STATE_KEY);
      if (!raw) {
        return {
          selectedPaletteShape: "rectangle",
          dialogRect: { ...DEFAULT_DIALOG_RECT },
        };
      }

      const parsed = JSON.parse(raw) as Partial<MapperUiState>;
      const selectedPaletteShape = isShapeType(parsed.selectedPaletteShape)
        ? parsed.selectedPaletteShape
        : "rectangle";

      return {
        selectedPaletteShape,
        dialogRect: normalizeDialogRect(parsed.dialogRect),
      };
    } catch {
      return {
        selectedPaletteShape: "rectangle",
        dialogRect: { ...DEFAULT_DIALOG_RECT },
      };
    }
  },

  saveUiState(state: MapperUiState): void {
    window.localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  },
};
