export type ShapeType =
  | "rectangle"
  | "circle"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "pentagon"
  | "hexagon"
  | "octagon"
  | "star"
  | "pill"
  | "arrow"
  | "trapezoid";

export type ThemeMode = import("./themePresets").ThemeMode;
export type TriggerType = "once" | "toggle" | "repeat";
export type UtilityTab = "key-mapper" | "key-trigger" | "auto-awaken";
export type AutoHolyDebuffType = "all" | "root" | "stun";
export type MouseSyncPositionMode = "actual" | "ratio";

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AutoHolyConfig {
  enabled: boolean;
  debuffType: AutoHolyDebuffType;
  debugOverlayEnabled: boolean;
  holyKey: string;
  scanRegion: NormalizedRect | null;
}

export interface AutoPillsConfig {
  enabled: boolean;
  hpThreshold: number;
  debugOverlayEnabled: boolean;
  pillKey: string;
  scanRegion: NormalizedRect | null;
}

export interface AwakenStatCriterion {
  id: string;
  statId: string;
  statValue: number;
}

export type AwakenBlessingType = "goddess" | "demon" | "auto";

export interface AutoAwakenConfig {
  scanRegion: NormalizedRect | null;
  blessingType: AwakenBlessingType;
  stat1Criteria: AwakenStatCriterion[];
  stat2Criteria: AwakenStatCriterion[];
}

export interface ShapeMapping {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  keyBinding: string;
  delayMs: number;
  triggerType: TriggerType;
}

export interface MapperSettings {
  theme: ThemeMode;
  editMode: boolean;
  experimentalFeaturesEnabled: boolean;
  showHandles: boolean;
  showSnapIndicators: boolean;
  showShapeTooltips: boolean;
  shapeOpacity: number;
  syncMouseEvents: boolean;
  mouseSyncPositionMode: MouseSyncPositionMode;
  strictPassthrough: boolean;
  addKeyMapShortcut: string;
  toggleModeShortcut: string;
  focusCanvasShortcut: string;
  toggleShapesShortcut: string;
  setZeroOpacityShortcut: string;
  toggleDialogShortcut: string;
  keyTriggerPresetSwitchShortcut: string;
  autoStopSeconds: number | null;
  notifyOnRecaptcha: boolean;
  stopOnRecaptcha: boolean;
  mobilePushEnabled: boolean;
  mobilePushDiscordBotUrl: string;
  mobilePushDiscordUserId: string;
  mobilePushDiscordApiKey: string;
  subscriptionAccessToken: string;
  autoHoly: AutoHolyConfig;
  autoPills: AutoPillsConfig;
  autoAwaken: AutoAwakenConfig;
}

export interface MappingProfile {
  id: string;
  name: string;
  shapes: ShapeMapping[];
}

export interface MapperProfilesState {
  activeProfileId: string;
  profiles: MappingProfile[];
}

export interface DialogRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapperUiState {
  selectedPaletteShape: ShapeType;
  dialogRect: DialogRect;
  selectedUtilityTab: UtilityTab;
}

export interface KeyTriggerAction {
  id: string;
  name: string;
  key: string;
  delayMs: number;
  enabled?: boolean;
  actionTriggerType?: "once" | "repeat";
  actionRepeatCount?: number;
  executionScope?: "all" | "current" | "other" | "specific";
  currentTabOnly?: boolean;
  otherTabsOnly?: boolean;
  specificTargetTabIds?: number[];
  specificTargetTabNames?: string[];
}

export interface KeyTriggerPreset {
  id: string;
  name: string;
  switchShortcut?: string;
  profiles: KeyTriggerProfile[];
}

export interface KeyTriggerProfile {
  id: string;
  profileIdentifier?: string;
  name: string;
  enabled: boolean;
  triggerType: TriggerType;
  repeatCount?: number;
  triggerKey: string;
  executionScope?: "all" | "current" | "other" | "specific";
  currentTabOnly?: boolean;
  otherTabsOnly?: boolean;
  specificTargetTabId?: number | null;
  specificTargetTabName?: string | null;
  specificTargetTabIds?: number[];
  specificTargetTabNames?: string[];
  delayMode: "sequential" | "synchronous";
  actions: KeyTriggerAction[];
  lockToTab?: boolean;
  toggleOwnerTabId?: number;
}

export interface KeyTriggerState {
  selectedPresetId: string;
  presets: KeyTriggerPreset[];
  characterPresetMapping: Record<string, string>;
}

export interface CharacterTabInfo {
  id: number;
  name: string;
  title: string;
}
