import { decompressFromUTF16 } from "lz-string";
import { getDB, idbGet, idbSet } from "./storage-idb";
import type {
  KeyTriggerAction,
  KeyTriggerProfile,
  KeyTriggerPreset,
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
import { isThemeMode } from "./themePresets";

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
const MAPPER_CHARACTER_PROFILE_MAPPING_KEY =
  "flyff-mapper-character-profiles-v1";
const STORAGE_IDB_MIGRATION_FLAG_KEY = "flyff-mapper-idb-migrated-v1";
const STORAGE_BACKUP_SUFFIX = "::backup";
const CHUNK_KEY_MARKER = "__chunked_v1__";
const COMPRESSED_KEY_MARKER = "__lz_v1__";
const SHARED_RUN_STATE_KEY = "flyff-mapper-run-state-v1";
const SHARED_AUTO_STOP_STATE_KEY = "flyff-mapper-auto-stop-shared-v1";
const SHARED_RECAPTCHA_SIGNAL_KEY = "flyff-mapper-recaptcha-shared-v1";

let idbMigrationStarted = false;

const getBackupKey = (key: string) => `${key}${STORAGE_BACKUP_SUFFIX}`;

const getChunkMetaKey = (key: string) => `${key}::meta`;
const getChunkValueKey = (key: string, index: number) => `${key}::${index}`;

const clearChunkedStorage = (key: string) => {
  const metaRaw = window.localStorage.getItem(getChunkMetaKey(key));
  if (!metaRaw) {
    return;
  }

  const [marker, countRaw] = metaRaw.split(":");
  if (marker === CHUNK_KEY_MARKER) {
    const chunkCount = Number(countRaw);
    if (Number.isFinite(chunkCount) && chunkCount > 0) {
      for (let index = 0; index < chunkCount; index += 1) {
        window.localStorage.removeItem(getChunkValueKey(key, index));
      }
    }
  }

  window.localStorage.removeItem(getChunkMetaKey(key));
};

const readStorageString = (key: string): string | null => {
  const direct = window.localStorage.getItem(key);
  if (typeof direct === "string") {
    return direct;
  }

  const metaRaw = window.localStorage.getItem(getChunkMetaKey(key));
  if (!metaRaw) {
    return null;
  }

  const [marker, countRaw] = metaRaw.split(":");
  if (marker !== CHUNK_KEY_MARKER) {
    return null;
  }

  const chunkCount = Number(countRaw);
  if (!Number.isFinite(chunkCount) || chunkCount <= 0) {
    return null;
  }

  const parts: string[] = [];
  for (let index = 0; index < chunkCount; index += 1) {
    const chunk = window.localStorage.getItem(getChunkValueKey(key, index));
    if (typeof chunk !== "string") {
      return null;
    }
    parts.push(chunk);
  }

  return parts.join("");
};

const deserializeFromStorage = <TValue>(raw: string): TValue => {
  const source = raw.startsWith(COMPRESSED_KEY_MARKER)
    ? decompressFromUTF16(raw.slice(COMPRESSED_KEY_MARKER.length))
    : raw;

  if (typeof source !== "string") {
    throw new Error("Unable to decode stored value");
  }

  return JSON.parse(source) as TValue;
};

const normalizeProfilesState = (
  parsed: Partial<MapperProfilesState> | undefined,
): MapperProfilesState | null => {
  if (!parsed) {
    return null;
  }

  const profiles = Array.isArray(parsed.profiles)
    ? parsed.profiles
        .map((profile) => toValidProfile(profile))
        .filter((profile): profile is MappingProfile => profile !== null)
    : [];

  if (profiles.length === 0) {
    return null;
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
};

const restoreProfilesStateFromBackup = (
  backupState: MapperProfilesState | null,
): MapperProfilesState | null => {
  if (!backupState) {
    return null;
  }

  try {
    const restored = normalizeProfilesState(backupState);
    if (!restored) {
      return null;
    }

    return restored;
  } catch {
    return null;
  }
};

type StorageHealthReport = {
  ok: boolean;
  issues: string[];
  repairs: string[];
};

const valuesMatchInIndexedDb = async (
  store: string,
  key: string,
  expected: unknown,
): Promise<boolean> => {
  const actual = await idbGet<unknown>(store, key);
  return JSON.stringify(actual) === JSON.stringify(expected);
};

const DEFAULT_DIALOG_RECT: DialogRect = {
  x: 40,
  y: 80,
  width: 420,
  height: 540,
};

const normalizeUiState = (value: unknown): MapperUiState => {
  const parsed =
    typeof value === "object" && value ? (value as Partial<MapperUiState>) : {};

  return {
    selectedPaletteShape: isShapeType(parsed.selectedPaletteShape)
      ? parsed.selectedPaletteShape
      : "rectangle",
    dialogRect: normalizeDialogRect(parsed.dialogRect),
    selectedUtilityTab: isUtilityTab(parsed.selectedUtilityTab)
      ? parsed.selectedUtilityTab
      : "key-mapper",
    easyAccessRibbonExpanded: parsed.easyAccessRibbonExpanded === true,
  };
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

const normalizeKeyTriggerRunCount = (value: unknown, fallback = 1): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(1, Math.round(fallback));
  }

  return Math.min(999, Math.max(1, Math.round(numeric)));
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

const createKeyTriggerProfileIdentifier = () =>
  `kt-identifier-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createKeyTriggerActionId = () =>
  `kt-action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeSpecificTabId = (value: unknown): number | null => {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    return null;
  }

  return Number(value);
};

const normalizeSpecificTabIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => normalizeSpecificTabId(entry))
        .filter((entry): entry is number => entry !== null),
    ),
  );
};

const normalizeSpecificTabNames = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value.filter(
        (entry): entry is string =>
          typeof entry === "string" && entry.trim().length > 0,
      ),
    ),
  ).map((entry) => entry.trim());
};

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
    enabled: parsed.enabled !== false,
    actionTriggerType:
      parsed.actionTriggerType === "repeat" ? "repeat" : "once",
    actionRepeatCount:
      parsed.actionTriggerType === "repeat"
        ? normalizeKeyTriggerRunCount(parsed.actionRepeatCount, 2)
        : normalizeKeyTriggerRunCount(parsed.actionRepeatCount, 1),
    executionScope:
      parsed.executionScope === "current" ||
      parsed.executionScope === "other" ||
      parsed.executionScope === "specific"
        ? parsed.executionScope
        : "all",
  };

  if (parsed.currentTabOnly === true) {
    action.currentTabOnly = true;
  }

  if (parsed.otherTabsOnly === true) {
    action.otherTabsOnly = true;
  }

  const specificTargetTabIds = normalizeSpecificTabIds(
    (parsed as { specificTargetTabIds?: unknown }).specificTargetTabIds,
  );
  if (specificTargetTabIds.length > 0) {
    action.specificTargetTabIds = specificTargetTabIds;
  }

  const specificTargetTabNames = normalizeSpecificTabNames(
    (parsed as { specificTargetTabNames?: unknown }).specificTargetTabNames,
  );
  if (specificTargetTabNames.length > 0) {
    action.specificTargetTabNames = specificTargetTabNames;
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

  const triggerType =
    parsed.triggerType === "toggle"
      ? "toggle"
      : parsed.triggerType === "repeat"
        ? "repeat"
        : "once";
  const repeatCount =
    triggerType === "repeat"
      ? normalizeKeyTriggerRunCount(parsed.repeatCount, 2)
      : normalizeKeyTriggerRunCount(parsed.repeatCount, 1);

  const specificTargetTabIds = normalizeSpecificTabIds(
    (parsed as { specificTargetTabIds?: unknown }).specificTargetTabIds,
  );
  const specificTargetTabNames = normalizeSpecificTabNames(
    (parsed as { specificTargetTabNames?: unknown }).specificTargetTabNames,
  );
  const legacySpecificTargetTabId = normalizeSpecificTabId(
    parsed.specificTargetTabId,
  );
  const resolvedSpecificTargetTabIds =
    specificTargetTabIds.length > 0
      ? specificTargetTabIds
      : legacySpecificTargetTabId !== null
        ? [legacySpecificTargetTabId]
        : [];
  const resolvedSpecificTargetTabNames =
    specificTargetTabNames.length > 0
      ? specificTargetTabNames
      : typeof parsed.specificTargetTabName === "string" &&
          parsed.specificTargetTabName.trim().length > 0
        ? [parsed.specificTargetTabName.trim()]
        : [];

  return {
    id:
      typeof parsed.id === "string" && parsed.id.trim().length > 0
        ? parsed.id
        : createKeyTriggerProfileId(),
    profileIdentifier:
      typeof parsed.profileIdentifier === "string" &&
      parsed.profileIdentifier.trim().length > 0
        ? parsed.profileIdentifier.trim()
        : createKeyTriggerProfileIdentifier(),
    name:
      typeof parsed.name === "string" && parsed.name.trim().length > 0
        ? parsed.name.trim()
        : "Profile",
    enabled: parsed.enabled !== false,
    triggerType,
    repeatCount,
    triggerKey:
      typeof parsed.triggerKey === "string" ? parsed.triggerKey.trim() : "",
    currentTabOnly: parsed.currentTabOnly === true,
    otherTabsOnly: parsed.otherTabsOnly === true,
    executionScope:
      parsed.executionScope === "current" ||
      parsed.executionScope === "other" ||
      parsed.executionScope === "specific"
        ? parsed.executionScope
        : resolvedSpecificTargetTabIds.length > 0 ||
            resolvedSpecificTargetTabNames.length > 0
          ? "specific"
          : parsed.otherTabsOnly === true
            ? "other"
            : parsed.currentTabOnly === true
              ? "current"
              : "all",
    specificTargetTabIds: resolvedSpecificTargetTabIds,
    specificTargetTabNames: resolvedSpecificTargetTabNames,
    specificTargetTabId: resolvedSpecificTargetTabIds[0] ?? null,
    specificTargetTabName: resolvedSpecificTargetTabNames[0] ?? null,
    delayMode:
      parsed.delayMode === "synchronous" ? "synchronous" : "sequential",
    lockToTab: parsed.lockToTab === true,
    toggleOwnerTabId:
      typeof parsed.toggleOwnerTabId === "number" &&
      Number.isFinite(parsed.toggleOwnerTabId)
        ? parsed.toggleOwnerTabId
        : undefined,
    actions,
  };
};

const normalizeKeyTriggerPreset = (
  value: unknown,
  fallbackName: string,
): KeyTriggerPreset | null => {
  if (typeof value !== "object" || !value) {
    return null;
  }

  const parsed = value as Partial<KeyTriggerPreset>;
  const profiles = Array.isArray(parsed.profiles)
    ? parsed.profiles
        .map((profile) => normalizeKeyTriggerProfile(profile))
        .filter((profile): profile is KeyTriggerProfile => profile !== null)
    : [];

  return {
    id:
      typeof parsed.id === "string" && parsed.id.trim().length > 0
        ? parsed.id.trim()
        : `kt-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name:
      typeof parsed.name === "string" && parsed.name.trim().length > 0
        ? parsed.name.trim()
        : fallbackName,
    switchShortcut:
      typeof parsed.switchShortcut === "string"
        ? parsed.switchShortcut.trim()
        : "",
    profiles,
  };
};

const normalizeKeyTriggerState = (
  parsed: Partial<KeyTriggerState> | undefined,
): KeyTriggerState => {
  const presets = Array.isArray(parsed?.presets)
    ? parsed.presets
        .map((preset, index) =>
          normalizeKeyTriggerPreset(
            preset,
            index === 0 ? "Default" : `Preset ${index + 1}`,
          ),
        )
        .filter((preset): preset is KeyTriggerPreset => preset !== null)
    : [];

  if (presets.length > 0) {
    return {
      selectedPresetId:
        typeof parsed?.selectedPresetId === "string" &&
        presets.some((preset) => preset.id === parsed.selectedPresetId)
          ? parsed.selectedPresetId
          : presets[0].id,
      presets,
      characterPresetMapping:
        typeof parsed?.characterPresetMapping === "object" &&
        parsed.characterPresetMapping !== null
          ? Object.fromEntries(
              Object.entries(parsed.characterPresetMapping).filter(
                ([key, value]) =>
                  typeof key === "string" &&
                  key.trim().length > 0 &&
                  typeof value === "string" &&
                  value.trim().length > 0 &&
                  presets.some((preset) => preset.id === value),
              ),
            )
          : {},
    };
  }

  const legacyProfiles = Array.isArray(
    (parsed as { profiles?: unknown }).profiles,
  )
    ? ((parsed as { profiles?: unknown }).profiles as unknown[])
        .map((profile) => normalizeKeyTriggerProfile(profile))
        .filter((profile): profile is KeyTriggerProfile => profile !== null)
    : [];

  return {
    selectedPresetId: "kt-preset-default",
    presets: [
      {
        id: "kt-preset-default",
        name: "Default",
        profiles: legacyProfiles,
      },
    ],
    characterPresetMapping: {},
  };
};

export const DEFAULT_SETTINGS: MapperSettings = {
  theme: "system",
  editMode: true,
  experimentalFeaturesEnabled: false,
  showHandles: false,
  showSnapIndicators: true,
  showShapeTooltips: true,
  shapeOpacity: 1,
  syncMouseEvents: false,
  mouseSyncPositionMode: "actual" as MouseSyncPositionMode,
  strictPassthrough: true,
  showEasyAccessUi: true,
  showEasyAccessArrowButton: true,
  addKeyMapShortcut: "Alt+Shift+A",
  toggleEasyAccessUiShortcut: "Alt+Shift+U",
  toggleModeShortcut: "Alt+Shift+S",
  focusCanvasShortcut: "Alt+Shift+F",
  toggleShapesShortcut: "Alt+Shift+H",
  setZeroOpacityShortcut: "Alt+Shift+0",
  toggleDialogShortcut: "Alt+Shift+M",
  keyTriggerPresetSwitchShortcut: "Alt+Shift+P",
  autoStopSeconds: 30,
  notifyOnRecaptcha: true,
  stopOnRecaptcha: true,
  mobilePushEnabled: false,
  mobilePushDiscordBotUrl: "",
  mobilePushDiscordUserId: "",
  mobilePushDiscordApiKey: "",
  subscriptionAccessToken: "",
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

const GLOBAL_SETTINGS_FIELDS = [
  "strictPassthrough",
  "showEasyAccessUi",
  "showEasyAccessArrowButton",
  "showSnapIndicators",
  "showShapeTooltips",
  "shapeOpacity",
  "addKeyMapShortcut",
  "toggleShapesShortcut",
  "setZeroOpacityShortcut",
  "keyTriggerPresetSwitchShortcut",
  "subscriptionAccessToken",
] as const satisfies readonly (keyof MapperSettings)[];

const mergeSharedSettingsFromSource = (
  baseSettings: MapperSettings,
  sourceSettings: Partial<MapperSettings> | undefined,
): MapperSettings => {
  const normalizedSource = normalizeSettings(sourceSettings ?? baseSettings);

  return GLOBAL_SETTINGS_FIELDS.reduce<MapperSettings>(
    (accumulator, field) => ({
      ...accumulator,
      [field]: normalizedSource[field],
    }),
    baseSettings,
  );
};

const deriveSharedSettingsFromProfiles = (
  parsed: Partial<MapperProfilesState> | null | undefined,
  fallbackSettings: MapperSettings,
): MapperSettings => {
  if (!parsed?.profiles?.length) {
    return fallbackSettings;
  }

  const preferredProfile =
    parsed.profiles.find((profile) => profile.id === parsed.activeProfileId) ??
    parsed.profiles[0];

  const preferredProfileSettings =
    typeof preferredProfile === "object" &&
    preferredProfile !== null &&
    "settings" in preferredProfile
      ? ((preferredProfile as { settings?: Partial<MapperSettings> })
          .settings ?? undefined)
      : undefined;

  return mergeSharedSettingsFromSource(
    fallbackSettings,
    preferredProfileSettings,
  );
};

const normalizeSettings = (
  parsed: Partial<MapperSettings> | undefined,
): MapperSettings => ({
  theme: isThemeMode(parsed?.theme) ? parsed.theme : DEFAULT_SETTINGS.theme,
  editMode: parsed?.editMode ?? DEFAULT_SETTINGS.editMode,
  experimentalFeaturesEnabled:
    parsed?.experimentalFeaturesEnabled ??
    DEFAULT_SETTINGS.experimentalFeaturesEnabled,
  showHandles: parsed?.showHandles ?? DEFAULT_SETTINGS.showHandles,
  showSnapIndicators:
    parsed?.showSnapIndicators ?? DEFAULT_SETTINGS.showSnapIndicators,
  showShapeTooltips:
    parsed?.showShapeTooltips ?? DEFAULT_SETTINGS.showShapeTooltips,
  shapeOpacity:
    typeof parsed?.shapeOpacity === "number" &&
    Number.isFinite(parsed.shapeOpacity)
      ? Math.max(0, Math.min(1, parsed.shapeOpacity))
      : DEFAULT_SETTINGS.shapeOpacity,
  syncMouseEvents: parsed?.syncMouseEvents ?? DEFAULT_SETTINGS.syncMouseEvents,
  mouseSyncPositionMode:
    parsed?.mouseSyncPositionMode === "ratio" ? "ratio" : "actual",
  strictPassthrough:
    parsed?.strictPassthrough ?? DEFAULT_SETTINGS.strictPassthrough,
  showEasyAccessUi:
    parsed?.showEasyAccessUi ?? DEFAULT_SETTINGS.showEasyAccessUi,
  showEasyAccessArrowButton:
    parsed?.showEasyAccessArrowButton ??
    DEFAULT_SETTINGS.showEasyAccessArrowButton,
  addKeyMapShortcut:
    parsed?.addKeyMapShortcut ?? DEFAULT_SETTINGS.addKeyMapShortcut,
  toggleEasyAccessUiShortcut:
    parsed?.toggleEasyAccessUiShortcut ??
    DEFAULT_SETTINGS.toggleEasyAccessUiShortcut,
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
  keyTriggerPresetSwitchShortcut:
    parsed?.keyTriggerPresetSwitchShortcut ??
    DEFAULT_SETTINGS.keyTriggerPresetSwitchShortcut,
  autoStopSeconds:
    parsed?.autoStopSeconds === null
      ? 0
      : typeof parsed?.autoStopSeconds === "number" &&
          Number.isFinite(parsed.autoStopSeconds)
        ? Math.max(0, parsed.autoStopSeconds)
        : DEFAULT_SETTINGS.autoStopSeconds,
  notifyOnRecaptcha:
    parsed?.notifyOnRecaptcha ?? DEFAULT_SETTINGS.notifyOnRecaptcha,
  stopOnRecaptcha: parsed?.stopOnRecaptcha ?? DEFAULT_SETTINGS.stopOnRecaptcha,
  mobilePushEnabled:
    parsed?.mobilePushEnabled ?? DEFAULT_SETTINGS.mobilePushEnabled,
  mobilePushDiscordBotUrl:
    typeof parsed?.mobilePushDiscordBotUrl === "string"
      ? parsed.mobilePushDiscordBotUrl.trim()
      : DEFAULT_SETTINGS.mobilePushDiscordBotUrl,
  mobilePushDiscordUserId:
    typeof parsed?.mobilePushDiscordUserId === "string"
      ? parsed.mobilePushDiscordUserId.trim()
      : DEFAULT_SETTINGS.mobilePushDiscordUserId,
  mobilePushDiscordApiKey:
    typeof parsed?.mobilePushDiscordApiKey === "string"
      ? parsed.mobilePushDiscordApiKey.trim()
      : DEFAULT_SETTINGS.mobilePushDiscordApiKey,
  subscriptionAccessToken:
    typeof parsed?.subscriptionAccessToken === "string"
      ? parsed.subscriptionAccessToken.trim()
      : DEFAULT_SETTINGS.subscriptionAccessToken,
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
): MapperProfilesState => {
  const defaultProfile: MappingProfile = {
    id: createProfileId(),
    name: "Default",
    shapes,
  };

  return {
    activeProfileId: defaultProfile.id,
    profiles: [defaultProfile],
  };
};

const toValidProfile = (value: unknown): MappingProfile | null => {
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
  };
};

type SharedRunState = {
  editMode: boolean;
  experimentalFeaturesEnabled: boolean;
  shapesVisible: boolean;
  updatedAt: number;
};

type SharedAutoStopState = {
  lastActivityAt: number;
  stopSignalId: string;
  stopSignalAt: number;
  stopSignalBy: string;
  notifiedSignalId: string;
  notifiedAt: number;
  notifiedBy: string;
};

type SharedRecaptchaSignal = {
  signalId: string;
  detectedAt: number;
  detectedBy: string;
  stopRequested: boolean;
  notifiedSignalId: string;
  notifiedAt: number;
  notifiedBy: string;
};

type StorageSyncMessage = {
  key: string;
  value: unknown;
};

const STORAGE_SYNC_CHANNEL_NAME = "flyff-mapper-sync-v1";

let storageReadyPromise: Promise<void> | null = null;
let profilesCache: MapperProfilesState = buildDefaultProfileState();
let profilesBackupCache: MapperProfilesState | null = null;
let shapesCache: ShapeMapping[] = [];
let settingsCache: MapperSettings = DEFAULT_SETTINGS;
let uiStateCache: MapperUiState = {
  selectedPaletteShape: "rectangle",
  dialogRect: {
    x: 40,
    y: 80,
    width: 420,
    height: 540,
  },
  selectedUtilityTab: "key-mapper",
};
let keyTriggerStateCache: KeyTriggerState = {
  selectedPresetId: "kt-preset-default",
  presets: [
    {
      id: "kt-preset-default",
      name: "Default",
      profiles: [],
    },
  ],
  characterPresetMapping: {},
};
let keyTriggerTargetTabIdsCache: number[] = [];
let keyTriggerTargetTabNamesCache: string[] = [];
let keyTriggerCharacterProfileMappingCache: Record<string, string> = {};
let mapperCharacterProfileMappingCache: Record<string, string> = {};
let sharedRunStateCache: SharedRunState = getDefaultSharedRunState();
let sharedAutoStopStateCache: SharedAutoStopState =
  getDefaultSharedAutoStopState();
let sharedRecaptchaSignalCache: SharedRecaptchaSignal =
  getDefaultSharedRecaptchaSignal();

const storageSyncListeners = new Set<(message: StorageSyncMessage) => void>();
let storageSyncChannel: BroadcastChannel | null = null;

const applyIncomingStorageSync = (message: StorageSyncMessage) => {
  if (message.key === PROFILES_KEY) {
    const normalized = normalizeProfilesState(
      message.value as Partial<MapperProfilesState>,
    );
    if (normalized) {
      profilesCache = normalized;
    }
    return;
  }

  if (message.key === SHAPES_KEY) {
    if (Array.isArray(message.value)) {
      shapesCache = normalizeLoadedShapes(message.value as ShapeMapping[]);
    }
    return;
  }

  if (message.key === SETTINGS_KEY) {
    if (typeof message.value === "object" && message.value) {
      settingsCache = normalizeSettings(
        sanitizeSettingsForStorage(message.value as MapperSettings),
      );
    }
    return;
  }

  if (message.key === UI_STATE_KEY) {
    uiStateCache = normalizeUiState(message.value);
    return;
  }

  if (message.key === KEY_TRIGGER_KEY) {
    keyTriggerStateCache = normalizeKeyTriggerState(
      message.value as Partial<KeyTriggerState>,
    );
    return;
  }

  if (message.key === KEY_TRIGGER_TARGET_TABS_KEY) {
    keyTriggerTargetTabIdsCache = Array.isArray(message.value)
      ? (message.value as unknown[]).filter((id): id is number =>
          Number.isFinite(id),
        )
      : [];
    return;
  }

  if (message.key === KEY_TRIGGER_TARGET_TAB_NAMES_KEY) {
    keyTriggerTargetTabNamesCache = Array.isArray(message.value)
      ? (message.value as unknown[]).filter(
          (name): name is string => typeof name === "string",
        )
      : [];
    return;
  }

  if (message.key === KEY_TRIGGER_CHARACTER_PROFILE_MAPPING_KEY) {
    keyTriggerCharacterProfileMappingCache =
      typeof message.value === "object" && message.value
        ? Object.entries(message.value as Record<string, unknown>).reduce<
            Record<string, string>
          >((acc, [key, value]) => {
            if (typeof key === "string" && typeof value === "string") {
              acc[key] = value;
            }
            return acc;
          }, {})
        : {};
    return;
  }

  if (message.key === MAPPER_CHARACTER_PROFILE_MAPPING_KEY) {
    mapperCharacterProfileMappingCache =
      typeof message.value === "object" && message.value
        ? Object.entries(message.value as Record<string, unknown>).reduce<
            Record<string, string>
          >((acc, [key, value]) => {
            if (typeof key === "string" && typeof value === "string") {
              acc[key] = value;
            }
            return acc;
          }, {})
        : {};
    return;
  }

  if (message.key === SHARED_RUN_STATE_KEY) {
    const value = message.value as Partial<SharedRunState>;
    sharedRunStateCache = {
      editMode: value?.editMode !== false,
      experimentalFeaturesEnabled: value?.experimentalFeaturesEnabled === true,
      shapesVisible: value?.shapesVisible !== false,
      updatedAt:
        typeof value?.updatedAt === "number" && Number.isFinite(value.updatedAt)
          ? value.updatedAt
          : Date.now(),
    };
    return;
  }

  if (message.key === SHARED_AUTO_STOP_STATE_KEY) {
    const value = message.value as Partial<SharedAutoStopState>;
    sharedAutoStopStateCache = {
      lastActivityAt:
        typeof value?.lastActivityAt === "number" &&
        Number.isFinite(value.lastActivityAt)
          ? value.lastActivityAt
          : 0,
      stopSignalId:
        typeof value?.stopSignalId === "string" ? value.stopSignalId : "",
      stopSignalAt:
        typeof value?.stopSignalAt === "number" &&
        Number.isFinite(value.stopSignalAt)
          ? value.stopSignalAt
          : 0,
      stopSignalBy:
        typeof value?.stopSignalBy === "string" ? value.stopSignalBy : "",
      notifiedSignalId:
        typeof value?.notifiedSignalId === "string"
          ? value.notifiedSignalId
          : "",
      notifiedAt:
        typeof value?.notifiedAt === "number" &&
        Number.isFinite(value.notifiedAt)
          ? value.notifiedAt
          : 0,
      notifiedBy: typeof value?.notifiedBy === "string" ? value.notifiedBy : "",
    };
    return;
  }

  if (message.key === SHARED_RECAPTCHA_SIGNAL_KEY) {
    const value = message.value as Partial<SharedRecaptchaSignal>;
    sharedRecaptchaSignalCache = {
      signalId: typeof value?.signalId === "string" ? value.signalId : "",
      detectedAt:
        typeof value?.detectedAt === "number" &&
        Number.isFinite(value.detectedAt)
          ? value.detectedAt
          : 0,
      detectedBy: typeof value?.detectedBy === "string" ? value.detectedBy : "",
      stopRequested: Boolean(value?.stopRequested),
      notifiedSignalId:
        typeof value?.notifiedSignalId === "string"
          ? value.notifiedSignalId
          : "",
      notifiedAt:
        typeof value?.notifiedAt === "number" &&
        Number.isFinite(value.notifiedAt)
          ? value.notifiedAt
          : 0,
      notifiedBy: typeof value?.notifiedBy === "string" ? value.notifiedBy : "",
    };
  }
};

const getStorageSyncChannel = () => {
  if (storageSyncChannel || typeof BroadcastChannel === "undefined") {
    return storageSyncChannel;
  }

  storageSyncChannel = new BroadcastChannel(STORAGE_SYNC_CHANNEL_NAME);
  storageSyncChannel.onmessage = (event: MessageEvent) => {
    const message = event.data as StorageSyncMessage;
    if (
      typeof message !== "object" ||
      !message ||
      typeof message.key !== "string"
    ) {
      return;
    }

    applyIncomingStorageSync(message);

    storageSyncListeners.forEach((listener) => listener(message));
  };

  return storageSyncChannel;
};

export const subscribeToStorageSync = (
  listener: (message: StorageSyncMessage) => void,
): (() => void) => {
  storageSyncListeners.add(listener);
  getStorageSyncChannel();
  return () => {
    storageSyncListeners.delete(listener);
  };
};

const broadcastStorageSync = (message: StorageSyncMessage) => {
  const channel = getStorageSyncChannel();
  if (!channel) {
    return;
  }

  channel.postMessage(message);
};

function getDefaultSharedRunState(): SharedRunState {
  return {
    editMode: true,
    experimentalFeaturesEnabled: false,
    shapesVisible: true,
    updatedAt: 0,
  };
}

function getDefaultSharedAutoStopState(): SharedAutoStopState {
  return {
    lastActivityAt: 0,
    stopSignalId: "",
    stopSignalAt: 0,
    stopSignalBy: "",
    notifiedSignalId: "",
    notifiedAt: 0,
    notifiedBy: "",
  };
}

function getDefaultSharedRecaptchaSignal(): SharedRecaptchaSignal {
  return {
    signalId: "",
    detectedAt: 0,
    detectedBy: "",
    stopRequested: false,
    notifiedSignalId: "",
    notifiedAt: 0,
    notifiedBy: "",
  };
}

const CORE_IDB_KEYS = [
  PROFILES_KEY,
  SHAPES_KEY,
  SETTINGS_KEY,
  UI_STATE_KEY,
  KEY_TRIGGER_KEY,
  KEY_TRIGGER_TARGET_TABS_KEY,
  KEY_TRIGGER_TARGET_TAB_NAMES_KEY,
  KEY_TRIGGER_CHARACTER_PROFILE_MAPPING_KEY,
  MAPPER_CHARACTER_PROFILE_MAPPING_KEY,
  "flyff-mapper-run-state-v1",
  "flyff-mapper-auto-stop-shared-v1",
  "flyff-mapper-recaptcha-shared-v1",
];

const clearLegacyStorageFamily = (key: string) => {
  clearChunkedStorage(key);
  clearChunkedStorage(getBackupKey(key));
  window.localStorage.removeItem(key);
  window.localStorage.removeItem(getBackupKey(key));
};

const loadLegacySharedRunState = (): SharedRunState | null => {
  try {
    const raw = window.localStorage.getItem("flyff-mapper-run-state-v1");
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SharedRunState>;
    return {
      editMode: parsed.editMode !== false,
      experimentalFeaturesEnabled: parsed.experimentalFeaturesEnabled === true,
      shapesVisible: parsed.shapesVisible !== false,
      updatedAt:
        typeof parsed.updatedAt === "number" &&
        Number.isFinite(parsed.updatedAt)
          ? parsed.updatedAt
          : 0,
    };
  } catch {
    return null;
  }
};

const loadLegacySharedAutoStopState = (): SharedAutoStopState | null => {
  try {
    const raw = window.localStorage.getItem("flyff-mapper-auto-stop-shared-v1");
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SharedAutoStopState>;
    return {
      lastActivityAt:
        typeof parsed.lastActivityAt === "number" &&
        Number.isFinite(parsed.lastActivityAt)
          ? parsed.lastActivityAt
          : 0,
      stopSignalId:
        typeof parsed.stopSignalId === "string" ? parsed.stopSignalId : "",
      stopSignalAt:
        typeof parsed.stopSignalAt === "number" &&
        Number.isFinite(parsed.stopSignalAt)
          ? parsed.stopSignalAt
          : 0,
      stopSignalBy:
        typeof parsed.stopSignalBy === "string" ? parsed.stopSignalBy : "",
      notifiedSignalId:
        typeof parsed.notifiedSignalId === "string"
          ? parsed.notifiedSignalId
          : "",
      notifiedAt:
        typeof parsed.notifiedAt === "number" &&
        Number.isFinite(parsed.notifiedAt)
          ? parsed.notifiedAt
          : 0,
      notifiedBy:
        typeof parsed.notifiedBy === "string" ? parsed.notifiedBy : "",
    };
  } catch {
    return null;
  }
};

const loadLegacySharedRecaptchaSignal = (): SharedRecaptchaSignal | null => {
  try {
    const raw = window.localStorage.getItem("flyff-mapper-recaptcha-shared-v1");
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SharedRecaptchaSignal>;
    return {
      signalId: typeof parsed.signalId === "string" ? parsed.signalId : "",
      detectedAt:
        typeof parsed.detectedAt === "number" &&
        Number.isFinite(parsed.detectedAt)
          ? parsed.detectedAt
          : 0,
      detectedBy:
        typeof parsed.detectedBy === "string" ? parsed.detectedBy : "",
      stopRequested: Boolean(parsed.stopRequested),
      notifiedSignalId:
        typeof parsed.notifiedSignalId === "string"
          ? parsed.notifiedSignalId
          : "",
      notifiedAt:
        typeof parsed.notifiedAt === "number" &&
        Number.isFinite(parsed.notifiedAt)
          ? parsed.notifiedAt
          : 0,
      notifiedBy:
        typeof parsed.notifiedBy === "string" ? parsed.notifiedBy : "",
    };
  } catch {
    return null;
  }
};

const hydrateCachesFromIndexedDb = async () => {
  const [
    profiles,
    shapes,
    settings,
    uiState,
    keyTriggerState,
    keyTriggerTargetTabIds,
    keyTriggerTargetTabNames,
    keyTriggerCharacterProfileMapping,
    mapperCharacterProfileMapping,
    profilesBackup,
    sharedRunState,
    sharedAutoStopState,
    sharedRecaptchaSignal,
  ] = await Promise.all([
    idbGet<MapperProfilesState>("profiles", PROFILES_KEY),
    idbGet<ShapeMapping[]>("shapes", SHAPES_KEY),
    idbGet<MapperSettings>("settings", SETTINGS_KEY),
    idbGet<MapperUiState>("uiState", UI_STATE_KEY),
    idbGet<KeyTriggerState>("keyTrigger", KEY_TRIGGER_KEY),
    idbGet<number[]>("keyTriggerTargetTabs", KEY_TRIGGER_TARGET_TABS_KEY),
    idbGet<string[]>(
      "keyTriggerTargetTabNames",
      KEY_TRIGGER_TARGET_TAB_NAMES_KEY,
    ),
    idbGet<Record<string, string>>(
      "keyTriggerCharacterProfiles",
      KEY_TRIGGER_CHARACTER_PROFILE_MAPPING_KEY,
    ),
    idbGet<Record<string, string>>(
      "mapperCharacterProfiles",
      MAPPER_CHARACTER_PROFILE_MAPPING_KEY,
    ),
    idbGet<MapperProfilesState>("profiles", getBackupKey(PROFILES_KEY)),
    idbGet<SharedRunState>("sharedRunState", SHARED_RUN_STATE_KEY),
    idbGet<SharedAutoStopState>(
      "sharedAutoStopState",
      SHARED_AUTO_STOP_STATE_KEY,
    ),
    idbGet<SharedRecaptchaSignal>(
      "sharedRecaptchaSignal",
      SHARED_RECAPTCHA_SIGNAL_KEY,
    ),
  ]);

  if (profiles) {
    const normalizedProfiles = normalizeProfilesState(profiles);
    if (normalizedProfiles) {
      profilesCache = normalizedProfiles;
    }
  }
  if (shapes) shapesCache = shapes;
  if (settings) {
    settingsCache = settings;
  } else if (profiles) {
    settingsCache = deriveSharedSettingsFromProfiles(
      profiles,
      DEFAULT_SETTINGS,
    );
    void idbSet("settings", SETTINGS_KEY, settingsCache).catch(() => undefined);
    broadcastStorageSync({ key: SETTINGS_KEY, value: settingsCache });
  }
  if (uiState) uiStateCache = uiState;
  if (uiState) uiStateCache = normalizeUiState(uiState);
  if (keyTriggerState) {
    keyTriggerStateCache = normalizeKeyTriggerState(keyTriggerState);
  }
  if (keyTriggerTargetTabIds)
    keyTriggerTargetTabIdsCache = keyTriggerTargetTabIds;
  if (keyTriggerTargetTabNames)
    keyTriggerTargetTabNamesCache = keyTriggerTargetTabNames;
  if (keyTriggerCharacterProfileMapping)
    keyTriggerCharacterProfileMappingCache = keyTriggerCharacterProfileMapping;
  if (mapperCharacterProfileMapping)
    mapperCharacterProfileMappingCache = mapperCharacterProfileMapping;
  if (profilesBackup) {
    profilesBackupCache = normalizeProfilesState(profilesBackup);
  }
  if (sharedRunState) sharedRunStateCache = sharedRunState;
  if (sharedAutoStopState) sharedAutoStopStateCache = sharedAutoStopState;
  if (sharedRecaptchaSignal) sharedRecaptchaSignalCache = sharedRecaptchaSignal;
};

const migrateLegacyStorageToIndexedDb = async () => {
  if (idbMigrationStarted) {
    return;
  }

  idbMigrationStarted = true;

  const loadLegacyValue = <TValue>(key: string): TValue | null => {
    const raw = readStorageString(key);
    if (raw === null) {
      return null;
    }

    try {
      return deserializeFromStorage<TValue>(raw);
    } catch {
      return null;
    }
  };

  const legacyProfiles =
    loadLegacyValue<Partial<MapperProfilesState>>(PROFILES_KEY);
  const legacyShapes = loadLegacyValue<unknown>(SHAPES_KEY);
  const legacySettings = loadLegacyValue<Partial<MapperSettings>>(SETTINGS_KEY);
  const legacyUiState = loadLegacyValue<Partial<MapperUiState>>(UI_STATE_KEY);
  const legacyKeyTrigger =
    loadLegacyValue<Partial<KeyTriggerState>>(KEY_TRIGGER_KEY);
  const legacyKeyTriggerTabIds = loadLegacyValue<unknown>(
    KEY_TRIGGER_TARGET_TABS_KEY,
  );
  const legacyKeyTriggerTabNames = loadLegacyValue<unknown>(
    KEY_TRIGGER_TARGET_TAB_NAMES_KEY,
  );
  const legacyKeyTriggerCharacterProfileMapping = loadLegacyValue<unknown>(
    KEY_TRIGGER_CHARACTER_PROFILE_MAPPING_KEY,
  );
  const legacyMapperCharacterProfileMapping = loadLegacyValue<unknown>(
    MAPPER_CHARACTER_PROFILE_MAPPING_KEY,
  );
  const legacyProfilesBackup = loadLegacyValue<Partial<MapperProfilesState>>(
    getBackupKey(PROFILES_KEY),
  );

  const legacyRunState = loadLegacySharedRunState();
  const legacyAutoStopState = loadLegacySharedAutoStopState();
  const legacyRecaptchaSignal = loadLegacySharedRecaptchaSignal();
  const legacySharedSettings = normalizeSettings(
    legacySettings ??
      deriveSharedSettingsFromProfiles(legacyProfiles, DEFAULT_SETTINGS),
  );
  const normalizedProfilesBackup = normalizeProfilesState(
    legacyProfilesBackup ?? undefined,
  );

  const hasLegacyData =
    legacyProfiles !== null ||
    legacyShapes !== null ||
    legacySettings !== null ||
    legacyUiState !== null ||
    legacyKeyTrigger !== null ||
    legacyKeyTriggerTabIds !== null ||
    legacyKeyTriggerTabNames !== null ||
    legacyKeyTriggerCharacterProfileMapping !== null ||
    legacyMapperCharacterProfileMapping !== null ||
    normalizedProfilesBackup !== null ||
    legacyRunState !== null ||
    legacyAutoStopState !== null ||
    legacyRecaptchaSignal !== null ||
    window.localStorage.getItem(STORAGE_IDB_MIGRATION_FLAG_KEY) !== null;

  if (!hasLegacyData) {
    return;
  }

  const migratedEntries: Array<{ store: string; key: string; value: unknown }> =
    [];

  if (legacyProfiles !== null) {
    const normalizedLegacyProfiles = normalizeProfilesState(
      legacyProfiles ?? undefined,
    );
    const migratedProfiles =
      normalizedLegacyProfiles ?? buildDefaultProfileState();
    await idbSet("profiles", PROFILES_KEY, migratedProfiles);
    migratedEntries.push({
      store: "profiles",
      key: PROFILES_KEY,
      value: migratedProfiles,
    });
  }
  if (legacyShapes !== null) {
    await idbSet("shapes", SHAPES_KEY, legacyShapes);
    migratedEntries.push({
      store: "shapes",
      key: SHAPES_KEY,
      value: legacyShapes,
    });
  }
  if (legacySettings !== null) {
    await idbSet("settings", SETTINGS_KEY, legacySettings);
    migratedEntries.push({
      store: "settings",
      key: SETTINGS_KEY,
      value: legacySettings,
    });
  } else if (legacyProfiles !== null) {
    await idbSet("settings", SETTINGS_KEY, legacySharedSettings);
    migratedEntries.push({
      store: "settings",
      key: SETTINGS_KEY,
      value: legacySharedSettings,
    });
  }
  if (legacyUiState !== null) {
    const migratedUiState = normalizeUiState(legacyUiState);
    await idbSet("uiState", UI_STATE_KEY, migratedUiState);
    migratedEntries.push({
      store: "uiState",
      key: UI_STATE_KEY,
      value: migratedUiState,
    });
  }
  if (legacyKeyTrigger !== null) {
    await idbSet("keyTrigger", KEY_TRIGGER_KEY, legacyKeyTrigger);
    migratedEntries.push({
      store: "keyTrigger",
      key: KEY_TRIGGER_KEY,
      value: legacyKeyTrigger,
    });
  }
  if (legacyKeyTriggerTabIds !== null) {
    await idbSet(
      "keyTriggerTargetTabs",
      KEY_TRIGGER_TARGET_TABS_KEY,
      legacyKeyTriggerTabIds,
    );
    migratedEntries.push({
      store: "keyTriggerTargetTabs",
      key: KEY_TRIGGER_TARGET_TABS_KEY,
      value: legacyKeyTriggerTabIds,
    });
  }
  if (legacyKeyTriggerTabNames !== null) {
    await idbSet(
      "keyTriggerTargetTabNames",
      KEY_TRIGGER_TARGET_TAB_NAMES_KEY,
      legacyKeyTriggerTabNames,
    );
    migratedEntries.push({
      store: "keyTriggerTargetTabNames",
      key: KEY_TRIGGER_TARGET_TAB_NAMES_KEY,
      value: legacyKeyTriggerTabNames,
    });
  }
  if (legacyKeyTriggerCharacterProfileMapping !== null) {
    await idbSet(
      "keyTriggerCharacterProfiles",
      KEY_TRIGGER_CHARACTER_PROFILE_MAPPING_KEY,
      legacyKeyTriggerCharacterProfileMapping,
    );
    migratedEntries.push({
      store: "keyTriggerCharacterProfiles",
      key: KEY_TRIGGER_CHARACTER_PROFILE_MAPPING_KEY,
      value: legacyKeyTriggerCharacterProfileMapping,
    });
  }
  if (legacyMapperCharacterProfileMapping !== null) {
    await idbSet(
      "mapperCharacterProfiles",
      MAPPER_CHARACTER_PROFILE_MAPPING_KEY,
      legacyMapperCharacterProfileMapping,
    );
    migratedEntries.push({
      store: "mapperCharacterProfiles",
      key: MAPPER_CHARACTER_PROFILE_MAPPING_KEY,
      value: legacyMapperCharacterProfileMapping,
    });
  }
  if (normalizedProfilesBackup !== null) {
    await idbSet(
      "profiles",
      getBackupKey(PROFILES_KEY),
      normalizedProfilesBackup,
    );
    profilesBackupCache = normalizedProfilesBackup;
    migratedEntries.push({
      store: "profiles",
      key: getBackupKey(PROFILES_KEY),
      value: normalizedProfilesBackup,
    });
  }
  if (legacyRunState !== null) {
    await idbSet("sharedRunState", SHARED_RUN_STATE_KEY, legacyRunState);
    migratedEntries.push({
      store: "sharedRunState",
      key: SHARED_RUN_STATE_KEY,
      value: legacyRunState,
    });
  }
  if (legacyAutoStopState !== null) {
    await idbSet(
      "sharedAutoStopState",
      SHARED_AUTO_STOP_STATE_KEY,
      legacyAutoStopState,
    );
    migratedEntries.push({
      store: "sharedAutoStopState",
      key: SHARED_AUTO_STOP_STATE_KEY,
      value: legacyAutoStopState,
    });
  }
  if (legacyRecaptchaSignal !== null) {
    await idbSet(
      "sharedRecaptchaSignal",
      SHARED_RECAPTCHA_SIGNAL_KEY,
      legacyRecaptchaSignal,
    );
    migratedEntries.push({
      store: "sharedRecaptchaSignal",
      key: SHARED_RECAPTCHA_SIGNAL_KEY,
      value: legacyRecaptchaSignal,
    });
  }

  const allMigrated = await Promise.all(
    migratedEntries.map((entry) =>
      valuesMatchInIndexedDb(entry.store, entry.key, entry.value),
    ),
  );

  if (!allMigrated.every(Boolean)) {
    idbMigrationStarted = false;
    return;
  }

  CORE_IDB_KEYS.forEach((key) => clearLegacyStorageFamily(key));
  window.localStorage.removeItem(STORAGE_IDB_MIGRATION_FLAG_KEY);
};

const runStorageHealthCheck = async (): Promise<StorageHealthReport> => {
  const issues: string[] = [];
  const repairs: string[] = [];

  const hadLegacyEntries = CORE_IDB_KEYS.some(
    (key) =>
      readStorageString(key) !== null ||
      readStorageString(getBackupKey(key)) !== null,
  );

  await migrateLegacyStorageToIndexedDb();

  for (const key of CORE_IDB_KEYS) {
    if (
      readStorageString(key) !== null ||
      readStorageString(getBackupKey(key)) !== null
    ) {
      issues.push(`${key}: legacy localStorage cleanup incomplete`);
    }
  }

  if (window.localStorage.getItem(STORAGE_IDB_MIGRATION_FLAG_KEY) !== null) {
    window.localStorage.removeItem(STORAGE_IDB_MIGRATION_FLAG_KEY);
    repairs.push(
      `${STORAGE_IDB_MIGRATION_FLAG_KEY}: removed stale migration flag`,
    );
  }

  if (hadLegacyEntries && issues.length === 0) {
    repairs.push("legacy localStorage data migrated and cleaned up");
  }

  return {
    ok: issues.length === 0,
    issues,
    repairs,
  };
};

export const initializeStorage = async (): Promise<void> => {
  if (storageReadyPromise) {
    return storageReadyPromise;
  }

  storageReadyPromise = (async () => {
    await getDB();
    await migrateLegacyStorageToIndexedDb();
    await hydrateCachesFromIndexedDb();
  })();

  return storageReadyPromise;
};

export const storage = {
  initialize: initializeStorage,
  subscribeToSync: subscribeToStorageSync,
  runStorageHealthCheck,

  resetForTests(): void {
    storageReadyPromise = null;
    idbMigrationStarted = false;
    profilesCache = buildDefaultProfileState();
    profilesBackupCache = null;
    shapesCache = [];
    settingsCache = DEFAULT_SETTINGS;
    uiStateCache = {
      selectedPaletteShape: "rectangle",
      dialogRect: {
        x: 40,
        y: 80,
        width: 420,
        height: 540,
      },
      selectedUtilityTab: "key-mapper",
    };
    keyTriggerStateCache = {
      selectedPresetId: "kt-preset-default",
      presets: [
        {
          id: "kt-preset-default",
          name: "Default",
          profiles: [],
        },
      ],
      characterPresetMapping: {},
    };
    keyTriggerTargetTabIdsCache = [];
    keyTriggerTargetTabNamesCache = [];
    keyTriggerCharacterProfileMappingCache = {};
    mapperCharacterProfileMappingCache = {};
    sharedRunStateCache = getDefaultSharedRunState();
    sharedAutoStopStateCache = getDefaultSharedAutoStopState();
    sharedRecaptchaSignalCache = getDefaultSharedRecaptchaSignal();
  },

  loadProfiles(): MapperProfilesState {
    return profilesCache;
  },

  restoreProfilesFromBackup(): MapperProfilesState | null {
    const restored = restoreProfilesStateFromBackup(profilesBackupCache);
    if (!restored) {
      return null;
    }

    profilesCache = restored;
    void idbSet("profiles", PROFILES_KEY, restored).catch(() => undefined);
    broadcastStorageSync({ key: PROFILES_KEY, value: restored });
    return restored;
  },

  saveProfiles(state: MapperProfilesState): void {
    profilesCache = state;
    void idbSet("profiles", PROFILES_KEY, state).catch(() => undefined);
    broadcastStorageSync({ key: PROFILES_KEY, value: state });
  },

  loadShapes(): ShapeMapping[] {
    return shapesCache;
  },

  saveShapes(shapes: ShapeMapping[]): void {
    shapesCache = normalizeLoadedShapes(shapes);
    void idbSet("shapes", SHAPES_KEY, shapesCache).catch(() => undefined);
    broadcastStorageSync({ key: SHAPES_KEY, value: shapesCache });
  },

  loadSettings(): MapperSettings {
    return settingsCache;
  },

  saveSettings(settings: MapperSettings): void {
    settingsCache = normalizeSettings(sanitizeSettingsForStorage(settings));
    void idbSet("settings", SETTINGS_KEY, settingsCache).catch(() => undefined);
    broadcastStorageSync({ key: SETTINGS_KEY, value: settingsCache });
  },

  loadUiState(): MapperUiState {
    return uiStateCache;
  },

  saveUiState(state: MapperUiState): void {
    uiStateCache = normalizeUiState(state);
    void idbSet("uiState", UI_STATE_KEY, uiStateCache).catch(() => undefined);
    broadcastStorageSync({ key: UI_STATE_KEY, value: uiStateCache });
  },

  loadKeyTriggerState(): KeyTriggerState {
    return keyTriggerStateCache;
  },

  saveKeyTriggerState(state: KeyTriggerState): void {
    keyTriggerStateCache = normalizeKeyTriggerState(state);
    void idbSet("keyTrigger", KEY_TRIGGER_KEY, keyTriggerStateCache).catch(
      () => undefined,
    );
    broadcastStorageSync({ key: KEY_TRIGGER_KEY, value: keyTriggerStateCache });
  },

  loadKeyTriggerTargetTabIds(): number[] {
    return keyTriggerTargetTabIdsCache;
  },

  saveKeyTriggerTargetTabIds(ids: number[]): void {
    keyTriggerTargetTabIdsCache = ids.filter((id) => Number.isFinite(id));
    void idbSet(
      "keyTriggerTargetTabs",
      KEY_TRIGGER_TARGET_TABS_KEY,
      keyTriggerTargetTabIdsCache,
    ).catch(() => undefined);
    broadcastStorageSync({
      key: KEY_TRIGGER_TARGET_TABS_KEY,
      value: keyTriggerTargetTabIdsCache,
    });
  },

  loadKeyTriggerTargetTabNames(): string[] {
    return keyTriggerTargetTabNamesCache;
  },

  saveKeyTriggerTargetTabNames(names: string[]): void {
    keyTriggerTargetTabNamesCache = names.filter(
      (name) => typeof name === "string",
    );
    void idbSet(
      "keyTriggerTargetTabNames",
      KEY_TRIGGER_TARGET_TAB_NAMES_KEY,
      keyTriggerTargetTabNamesCache,
    ).catch(() => undefined);
    broadcastStorageSync({
      key: KEY_TRIGGER_TARGET_TAB_NAMES_KEY,
      value: keyTriggerTargetTabNamesCache,
    });
  },

  loadKeyTriggerCharacterProfileMapping(): Record<string, string> {
    return keyTriggerCharacterProfileMappingCache;
  },

  saveKeyTriggerCharacterProfileMapping(mapping: Record<string, string>): void {
    keyTriggerCharacterProfileMappingCache = Object.fromEntries(
      Object.entries(mapping).filter(
        ([key, value]) => typeof key === "string" && typeof value === "string",
      ),
    );
    void idbSet(
      "keyTriggerCharacterProfiles",
      KEY_TRIGGER_CHARACTER_PROFILE_MAPPING_KEY,
      keyTriggerCharacterProfileMappingCache,
    ).catch(() => undefined);
    broadcastStorageSync({
      key: KEY_TRIGGER_CHARACTER_PROFILE_MAPPING_KEY,
      value: keyTriggerCharacterProfileMappingCache,
    });
  },

  loadMapperCharacterProfileMapping(): Record<string, string> {
    return mapperCharacterProfileMappingCache;
  },

  saveMapperCharacterProfileMapping(mapping: Record<string, string>): void {
    mapperCharacterProfileMappingCache = Object.fromEntries(
      Object.entries(mapping).filter(
        ([key, value]) => typeof key === "string" && typeof value === "string",
      ),
    );
    void idbSet(
      "mapperCharacterProfiles",
      MAPPER_CHARACTER_PROFILE_MAPPING_KEY,
      mapperCharacterProfileMappingCache,
    ).catch(() => undefined);
    broadcastStorageSync({
      key: MAPPER_CHARACTER_PROFILE_MAPPING_KEY,
      value: mapperCharacterProfileMappingCache,
    });
  },

  loadSharedRunState(): SharedRunState {
    return sharedRunStateCache;
  },

  saveSharedRunState(state: SharedRunState): void {
    sharedRunStateCache = {
      editMode: state.editMode !== false,
      experimentalFeaturesEnabled: state.experimentalFeaturesEnabled === true,
      shapesVisible: state.shapesVisible !== false,
      updatedAt:
        typeof state.updatedAt === "number" && Number.isFinite(state.updatedAt)
          ? state.updatedAt
          : Date.now(),
    };
    void idbSet(
      "sharedRunState",
      SHARED_RUN_STATE_KEY,
      sharedRunStateCache,
    ).catch(() => undefined);
    broadcastStorageSync({
      key: SHARED_RUN_STATE_KEY,
      value: sharedRunStateCache,
    });
  },

  loadSharedAutoStopState(): SharedAutoStopState {
    return sharedAutoStopStateCache;
  },

  saveSharedAutoStopState(state: SharedAutoStopState): void {
    sharedAutoStopStateCache = {
      lastActivityAt:
        typeof state.lastActivityAt === "number" &&
        Number.isFinite(state.lastActivityAt)
          ? state.lastActivityAt
          : 0,
      stopSignalId:
        typeof state.stopSignalId === "string" ? state.stopSignalId : "",
      stopSignalAt:
        typeof state.stopSignalAt === "number" &&
        Number.isFinite(state.stopSignalAt)
          ? state.stopSignalAt
          : 0,
      stopSignalBy:
        typeof state.stopSignalBy === "string" ? state.stopSignalBy : "",
      notifiedSignalId:
        typeof state.notifiedSignalId === "string"
          ? state.notifiedSignalId
          : "",
      notifiedAt:
        typeof state.notifiedAt === "number" &&
        Number.isFinite(state.notifiedAt)
          ? state.notifiedAt
          : 0,
      notifiedBy: typeof state.notifiedBy === "string" ? state.notifiedBy : "",
    };
    void idbSet(
      "sharedAutoStopState",
      SHARED_AUTO_STOP_STATE_KEY,
      sharedAutoStopStateCache,
    ).catch(() => undefined);
    broadcastStorageSync({
      key: SHARED_AUTO_STOP_STATE_KEY,
      value: sharedAutoStopStateCache,
    });
  },

  loadSharedRecaptchaSignal(): SharedRecaptchaSignal {
    return sharedRecaptchaSignalCache;
  },

  saveSharedRecaptchaSignal(signal: SharedRecaptchaSignal): void {
    sharedRecaptchaSignalCache = {
      signalId: typeof signal.signalId === "string" ? signal.signalId : "",
      detectedAt:
        typeof signal.detectedAt === "number" &&
        Number.isFinite(signal.detectedAt)
          ? signal.detectedAt
          : 0,
      detectedBy:
        typeof signal.detectedBy === "string" ? signal.detectedBy : "",
      stopRequested: Boolean(signal.stopRequested),
      notifiedSignalId:
        typeof signal.notifiedSignalId === "string"
          ? signal.notifiedSignalId
          : "",
      notifiedAt:
        typeof signal.notifiedAt === "number" &&
        Number.isFinite(signal.notifiedAt)
          ? signal.notifiedAt
          : 0,
      notifiedBy:
        typeof signal.notifiedBy === "string" ? signal.notifiedBy : "",
    };
    void idbSet(
      "sharedRecaptchaSignal",
      SHARED_RECAPTCHA_SIGNAL_KEY,
      sharedRecaptchaSignalCache,
    ).catch(() => undefined);
    broadcastStorageSync({
      key: SHARED_RECAPTCHA_SIGNAL_KEY,
      value: sharedRecaptchaSignalCache,
    });
  },
};
