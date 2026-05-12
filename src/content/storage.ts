import type {
  KeyTriggerAction,
  KeyTriggerProfile,
  KeyTriggerState,
  DialogRect,
  MapperProfilesState,
  MapperSettings,
  MapperUiState,
  MappingProfile,
  ShapeMapping,
  ShapeType,
  UtilityTab,
} from "./types";
import type {
  AutoHolyConfig,
  AutoPillsConfig,
  AutoAwakenConfig,
  AwakenStatCriterion,
  AwakenBlessingType,
  AutoHolyDebuffType,
  MouseSyncPositionMode,
  NormalizedRect,
} from "./types";

const SHAPES_KEY = "flyff-mapper-shapes-v1";
const SETTINGS_KEY = "flyff-mapper-settings-v1";
const PROFILES_KEY = "flyff-mapper-profiles-v1";
const UI_STATE_KEY = "flyff-mapper-ui-state-v1";
const KEY_TRIGGER_KEY = "flyff-mapper-key-trigger-v1";
const KEY_TRIGGER_TARGET_TABS_KEY = "flyff-mapper-key-trigger-target-tabs-v1";
const KEY_TRIGGER_TARGET_TAB_NAMES_KEY =
  "flyff-mapper-key-trigger-target-tab-names-v1";
const KEY_TRIGGER_CHARACTER_PROFILE_MAPPING_KEY =
  "flyff-mapper-key-trigger-character-profiles-v1";

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

const isUtilityTab = (value: unknown): value is UtilityTab =>
  value === "key-mapper" || value === "key-trigger" || value === "auto-awaken";

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

const normalizeScanRegion = (value: unknown): NormalizedRect | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const parsed = value as Partial<NormalizedRect>;
  const x = Number(parsed.x);
  const y = Number(parsed.y);
  const width = Number(parsed.width);
  const height = Number(parsed.height);

  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height)
  ) {
    return null;
  }

  const clampedX = Math.max(0, Math.min(x, 1));
  const clampedY = Math.max(0, Math.min(y, 1));
  const clampedWidth = Math.max(0, Math.min(width, 1 - clampedX));
  const clampedHeight = Math.max(0, Math.min(height, 1 - clampedY));

  if (clampedWidth <= 0 || clampedHeight <= 0) {
    return null;
  }

  return {
    x: clampedX,
    y: clampedY,
    width: clampedWidth,
    height: clampedHeight,
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

const createKeyTriggerProfileId = () =>
  `kt-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createKeyTriggerActionId = () =>
  `kt-action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeKeyTriggerAction = (value: unknown): KeyTriggerAction | null => {
  if (typeof value !== "object" || !value) {
    return null;
  }

  const parsed = value as Partial<KeyTriggerAction>;
  const name =
    typeof parsed.name === "string" && parsed.name.trim().length > 0
      ? parsed.name.trim()
      : "Action";
  const key =
    typeof parsed.key === "string" && parsed.key.trim().length > 0
      ? parsed.key.trim()
      : "";

  const action: KeyTriggerAction = {
    id:
      typeof parsed.id === "string" && parsed.id.trim().length > 0
        ? parsed.id
        : createKeyTriggerActionId(),
    name,
    key,
    delayMs: normalizeDelayMs(parsed.delayMs),
  };

  if (parsed.currentTabOnly === true) {
    action.currentTabOnly = true;
  }

  if (parsed.otherTabsOnly === true) {
    action.otherTabsOnly = true;
  }

  return action;
};

const normalizeKeyTriggerProfile = (
  value: unknown,
): KeyTriggerProfile | null => {
  if (typeof value !== "object" || !value) {
    return null;
  }

  const parsed = value as Partial<KeyTriggerProfile>;
  const actions = Array.isArray(parsed.actions)
    ? parsed.actions
        .map((action) => normalizeKeyTriggerAction(action))
        .filter((action): action is KeyTriggerAction => action !== null)
    : [];

  return {
    id:
      typeof parsed.id === "string" && parsed.id.trim().length > 0
        ? parsed.id
        : createKeyTriggerProfileId(),
    name:
      typeof parsed.name === "string" && parsed.name.trim().length > 0
        ? parsed.name.trim()
        : "Profile",
    enabled: parsed.enabled !== false,
    triggerType: parsed.triggerType === "toggle" ? "toggle" : "once",
    triggerKey:
      typeof parsed.triggerKey === "string" ? parsed.triggerKey.trim() : "",
    currentTabOnly: parsed.currentTabOnly === true,
    otherTabsOnly: parsed.otherTabsOnly === true,
    delayMode:
      parsed.delayMode === "synchronous" ? "synchronous" : "sequential",
    actions,
  };
};

export const DEFAULT_SETTINGS: MapperSettings = {
  theme: "system",
  editMode: true,
  experimentalFeaturesEnabled: false,
  showHandles: false,
  showSnapIndicators: true,
  syncMouseEvents: false,
  mouseSyncPositionMode: "actual" as MouseSyncPositionMode,
  strictPassthrough: true,
  addKeyMapShortcut: "Alt+Shift+A",
  toggleModeShortcut: "Alt+Shift+S",
  focusCanvasShortcut: "Alt+Shift+F",
  toggleShapesShortcut: "Alt+Shift+H",
  setZeroOpacityShortcut: "Alt+Shift+0",
  toggleDialogShortcut: "Alt+Shift+M",
  autoStopSeconds: 30,
  notifyOnRecaptcha: true,
  stopOnRecaptcha: true,
  autoHoly: {
    enabled: false,
    debuffType: "all" as AutoHolyDebuffType,
    debugOverlayEnabled: false,
    holyKey: "",
    scanRegion: null,
  },
  autoPills: {
    enabled: false,
    hpThreshold: 50,
    debugOverlayEnabled: false,
    pillKey: "",
    scanRegion: null,
  },
  autoAwaken: {
    scanRegion: null,
    blessingType: "auto" as AwakenBlessingType,
    stat1Criteria: [],
    stat2Criteria: [],
  },
};

const normalizeSettings = (
  parsed: Partial<MapperSettings> | undefined,
): MapperSettings => ({
  theme: parsed?.theme ?? DEFAULT_SETTINGS.theme,
  editMode: parsed?.editMode ?? DEFAULT_SETTINGS.editMode,
  experimentalFeaturesEnabled:
    parsed?.experimentalFeaturesEnabled ??
    DEFAULT_SETTINGS.experimentalFeaturesEnabled,
  showHandles: parsed?.showHandles ?? DEFAULT_SETTINGS.showHandles,
  showSnapIndicators:
    parsed?.showSnapIndicators ?? DEFAULT_SETTINGS.showSnapIndicators,
  syncMouseEvents: parsed?.syncMouseEvents ?? DEFAULT_SETTINGS.syncMouseEvents,
  mouseSyncPositionMode:
    parsed?.mouseSyncPositionMode === "ratio" ? "ratio" : "actual",
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
  toggleDialogShortcut:
    parsed?.toggleDialogShortcut ?? DEFAULT_SETTINGS.toggleDialogShortcut,
  autoStopSeconds:
    parsed?.autoStopSeconds === null
      ? null
      : typeof parsed?.autoStopSeconds === "number" &&
          Number.isFinite(parsed.autoStopSeconds) &&
          parsed.autoStopSeconds >= 30
        ? parsed.autoStopSeconds
        : DEFAULT_SETTINGS.autoStopSeconds,
  notifyOnRecaptcha:
    parsed?.notifyOnRecaptcha ?? DEFAULT_SETTINGS.notifyOnRecaptcha,
  stopOnRecaptcha: parsed?.stopOnRecaptcha ?? DEFAULT_SETTINGS.stopOnRecaptcha,
  autoHoly: (() => {
    const ah =
      typeof parsed?.autoHoly === "object" && parsed.autoHoly !== null
        ? (parsed.autoHoly as Partial<AutoHolyConfig>)
        : null;
    return {
      enabled: ah ? Boolean(ah.enabled) : DEFAULT_SETTINGS.autoHoly.enabled,
      debuffType:
        ah?.debuffType === "all" ||
        ah?.debuffType === "root" ||
        ah?.debuffType === "stun"
          ? ah.debuffType
          : DEFAULT_SETTINGS.autoHoly.debuffType,
      debugOverlayEnabled:
        typeof ah?.debugOverlayEnabled === "boolean"
          ? ah.debugOverlayEnabled
          : DEFAULT_SETTINGS.autoHoly.debugOverlayEnabled,
      holyKey:
        typeof ah?.holyKey === "string"
          ? ah.holyKey
          : DEFAULT_SETTINGS.autoHoly.holyKey,
      scanRegion: normalizeScanRegion(ah?.scanRegion),
    };
  })(),
  autoPills: (() => {
    const ap =
      typeof parsed?.autoPills === "object" && parsed.autoPills !== null
        ? (parsed.autoPills as Partial<AutoPillsConfig>)
        : null;
    return {
      enabled: ap ? Boolean(ap.enabled) : DEFAULT_SETTINGS.autoPills.enabled,
      hpThreshold:
        typeof ap?.hpThreshold === "number" &&
        ap.hpThreshold >= 1 &&
        ap.hpThreshold <= 99
          ? ap.hpThreshold
          : DEFAULT_SETTINGS.autoPills.hpThreshold,
      debugOverlayEnabled:
        typeof ap?.debugOverlayEnabled === "boolean"
          ? ap.debugOverlayEnabled
          : DEFAULT_SETTINGS.autoPills.debugOverlayEnabled,
      pillKey:
        typeof ap?.pillKey === "string"
          ? ap.pillKey
          : DEFAULT_SETTINGS.autoPills.pillKey,
      scanRegion: normalizeScanRegion(ap?.scanRegion),
    };
  })(),
  autoAwaken: (() => {
    const aa =
      typeof parsed?.autoAwaken === "object" && parsed.autoAwaken !== null
        ? (parsed.autoAwaken as Partial<AutoAwakenConfig>)
        : null;

    const normalizeCriterion = (v: unknown): AwakenStatCriterion | null => {
      if (typeof v !== "object" || !v) return null;
      const c = v as Partial<AwakenStatCriterion>;
      if (typeof c.statId !== "string" || !c.statId.trim()) return null;
      const val = Number(c.statValue);
      if (!Number.isFinite(val)) return null;
      return {
        id:
          typeof c.id === "string" && c.id.trim()
            ? c.id
            : `crit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        statId: c.statId.trim(),
        statValue: val,
      };
    };

    const normCriteria = (arr: unknown): AwakenStatCriterion[] =>
      Array.isArray(arr)
        ? (arr.map(normalizeCriterion).filter(Boolean) as AwakenStatCriterion[])
        : [];

    const blessingType: AwakenBlessingType =
      aa?.blessingType === "goddess" ||
      aa?.blessingType === "demon" ||
      aa?.blessingType === "auto"
        ? aa.blessingType
        : "auto";

    return {
      // Auto-Awaken capture is session-only and should not persist.
      scanRegion: null,
      blessingType,
      stat1Criteria: normCriteria(aa?.stat1Criteria),
      stat2Criteria: normCriteria(aa?.stat2Criteria),
    };
  })(),
});

const sanitizeSettingsForStorage = (
  settings: MapperSettings,
): MapperSettings => ({
  ...settings,
  autoAwaken: {
    ...settings.autoAwaken,
    scanRegion: null,
  },
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
    const sanitizedState: MapperProfilesState = {
      ...state,
      profiles: state.profiles.map((profile) => ({
        ...profile,
        settings: sanitizeSettingsForStorage(profile.settings),
      })),
    };

    window.localStorage.setItem(PROFILES_KEY, JSON.stringify(sanitizedState));
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
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify(sanitizeSettingsForStorage(settings)),
    );
  },

  loadUiState(): MapperUiState {
    try {
      const raw = window.localStorage.getItem(UI_STATE_KEY);
      if (!raw) {
        return {
          selectedPaletteShape: "rectangle",
          dialogRect: { ...DEFAULT_DIALOG_RECT },
          selectedUtilityTab: "key-mapper",
        };
      }

      const parsed = JSON.parse(raw) as Partial<MapperUiState>;
      const selectedPaletteShape = isShapeType(parsed.selectedPaletteShape)
        ? parsed.selectedPaletteShape
        : "rectangle";
      const selectedUtilityTab = isUtilityTab(parsed.selectedUtilityTab)
        ? parsed.selectedUtilityTab
        : "key-mapper";

      return {
        selectedPaletteShape,
        dialogRect: normalizeDialogRect(parsed.dialogRect),
        selectedUtilityTab,
      };
    } catch {
      return {
        selectedPaletteShape: "rectangle",
        dialogRect: { ...DEFAULT_DIALOG_RECT },
        selectedUtilityTab: "key-mapper",
      };
    }
  },

  saveUiState(state: MapperUiState): void {
    window.localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  },

  loadKeyTriggerState(): KeyTriggerState {
    try {
      const raw = window.localStorage.getItem(KEY_TRIGGER_KEY);
      if (!raw) {
        return {
          profiles: [],
        };
      }

      const parsed = JSON.parse(raw) as Partial<KeyTriggerState>;
      const profiles = Array.isArray(parsed.profiles)
        ? parsed.profiles
            .map((profile) => normalizeKeyTriggerProfile(profile))
            .filter((profile): profile is KeyTriggerProfile => profile !== null)
        : [];

      return {
        profiles,
      };
    } catch {
      return {
        profiles: [],
      };
    }
  },

  saveKeyTriggerState(state: KeyTriggerState): void {
    window.localStorage.setItem(KEY_TRIGGER_KEY, JSON.stringify(state));
  },

  loadKeyTriggerTargetTabIds(): number[] {
    try {
      const raw = window.localStorage.getItem(KEY_TRIGGER_TARGET_TABS_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((id): id is number => Number.isFinite(id));
    } catch {
      return [];
    }
  },

  saveKeyTriggerTargetTabIds(ids: number[]): void {
    window.localStorage.setItem(
      KEY_TRIGGER_TARGET_TABS_KEY,
      JSON.stringify(ids.filter((id) => Number.isFinite(id))),
    );
  },

  loadKeyTriggerTargetTabNames(): string[] {
    try {
      const raw = window.localStorage.getItem(KEY_TRIGGER_TARGET_TAB_NAMES_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter((name): name is string => typeof name === "string");
    } catch {
      return [];
    }
  },

  saveKeyTriggerTargetTabNames(names: string[]): void {
    window.localStorage.setItem(
      KEY_TRIGGER_TARGET_TAB_NAMES_KEY,
      JSON.stringify(names.filter((name) => typeof name === "string")),
    );
  },

  loadKeyTriggerCharacterProfileMapping(): Record<string, string> {
    try {
      const raw = window.localStorage.getItem(
        KEY_TRIGGER_CHARACTER_PROFILE_MAPPING_KEY,
      );
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || !parsed) {
        return {};
      }

      // Ensure all keys and values are strings
      const mapping: Record<string, string> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof key === "string" && typeof value === "string") {
          mapping[key] = value;
        }
      }
      return mapping;
    } catch {
      return {};
    }
  },

  saveKeyTriggerCharacterProfileMapping(mapping: Record<string, string>): void {
    window.localStorage.setItem(
      KEY_TRIGGER_CHARACTER_PROFILE_MAPPING_KEY,
      JSON.stringify(mapping),
    );
  },
};
