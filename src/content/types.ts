export type ShapeType =
  | "rectangle"
  | "circle"
  | "ellipse"
  | "triangle"
  | "diamond"
  | "hexagon"
  | "star"
  | "pill"
  | "arrow"
  | "trapezoid";

export type ThemeMode = "light" | "dark" | "system";

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
}

export interface MapperSettings {
  theme: ThemeMode;
  editMode: boolean;
  showHandles: boolean;
  strictPassthrough: boolean;
  addKeyMapShortcut: string;
  toggleModeShortcut: string;
  focusCanvasShortcut: string;
  toggleShapesShortcut: string;
}
