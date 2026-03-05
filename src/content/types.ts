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
  showHandles: boolean;
  showSnapIndicators: boolean;
  strictPassthrough: boolean;
  addKeyMapShortcut: string;
  toggleModeShortcut: string;
  focusCanvasShortcut: string;
  toggleShapesShortcut: string;
  setZeroOpacityShortcut: string;
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
}
