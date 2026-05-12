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

export type ThemeMode = "light" | "dark" | "system";
export type TriggerType = "once" | "toggle";
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
  syncMouseEvents: boolean;
  mouseSyncPositionMode: MouseSyncPositionMode;
  strictPassthrough: boolean;
  addKeyMapShortcut: string;
  toggleModeShortcut: string;
  focusCanvasShortcut: string;
  toggleShapesShortcut: string;
  setZeroOpacityShortcut: string;
  toggleDialogShortcut: string;
  autoStopSeconds: number | null;
  notifyOnRecaptcha: boolean;
  stopOnRecaptcha: boolean;
  autoHoly: AutoHolyConfig;
  autoPills: AutoPillsConfig;
  autoAwaken: AutoAwakenConfig;
}

export interface MappingProfile {
  id: string;
  name: string;
  shapes: ShapeMapping[];
  settings: MapperSettings;
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
  currentTabOnly?: boolean;
  otherTabsOnly?: boolean;
}

export interface KeyTriggerProfile {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: TriggerType;
  triggerKey: string;
  currentTabOnly?: boolean;
  otherTabsOnly?: boolean;
  delayMode: "sequential" | "synchronous";
  actions: KeyTriggerAction[];
}

export interface KeyTriggerState {
  profiles: KeyTriggerProfile[];
}

export interface CharacterTabInfo {
  id: number;
  name: string;
  title: string;
}
