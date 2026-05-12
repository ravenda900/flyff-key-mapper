import type { MappingProfile, ShapeMapping, ShapeType } from "../types";

export const ROOT_ID = "flyff-mapper-root";
export const OVERLAY_SHORTCUT = "Alt+Shift+M";

export const PROFILE_TOOLTIP_OVERLAY_STYLE = {
  zIndex: 2147483647,
};

export const PROFILE_TOOLTIP_OVERLAY_CLASS = "fm-profile-tooltip";

export const PROFILE_SELECT_DROPDOWN_STYLE = {
  zIndex: 2147483647,
};

export const getProfileTooltipContainer = () => document.body;

export const getSystemDark = (): boolean =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export const SHIFTED_SYMBOL_TO_BASE_KEY: Record<string, string> = {
  "!": "1",
  "@": "2",
  "#": "3",
  $: "4",
  "%": "5",
  "^": "6",
  "&": "7",
  "*": "8",
  "(": "9",
  ")": "0",
  _: "-",
  "+": "=",
  "{": "[",
  "}": "]",
  "|": "\\",
  ":": ";",
  '"': "'",
  "<": ",",
  ">": ".",
  "?": "/",
  "~": "`",
};

export const BASIC_PALETTE_SHAPES: ShapeType[] = [
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
];

export const SHAPE_LABELS: Record<ShapeType, string> = {
  rectangle: "Rectangle",
  circle: "Circle",
  ellipse: "Ellipse",
  triangle: "Triangle",
  diamond: "Diamond",
  pentagon: "Pentagon",
  hexagon: "Hexagon",
  octagon: "Octagon",
  star: "Star",
  pill: "Pill",
  arrow: "Arrow",
  trapezoid: "Trapezoid",
};

export const createShape = (shapeType: ShapeType): ShapeMapping => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type: shapeType,
  x: Math.max(100, window.innerWidth / 2 - 70),
  y: Math.max(100, window.innerHeight / 2 - 50),
  width: 140,
  height: 100,
  rotation: 0,
  opacity: 1,
  keyBinding: "",
  delayMs: 0,
  triggerType: "once",
});

export const normalizeShape = (shape: ShapeMapping): ShapeMapping => ({
  ...shape,
  x: Math.max(0, Math.round(shape.x)),
  y: Math.max(0, Math.round(shape.y)),
  width: Math.max(5, Math.round(shape.width)),
  height: Math.max(5, Math.round(shape.height)),
  opacity: Math.min(1, Math.max(0.05, Number(shape.opacity))),
  rotation: Math.round(shape.rotation),
  delayMs: Math.max(0, Math.round(Number(shape.delayMs) || 0)),
  triggerType: shape.triggerType === "toggle" ? "toggle" : "once",
});

export const createProfileId = () =>
  `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const makeUniqueProfileName = (
  existingProfiles: MappingProfile[],
  desiredName: string,
): string => {
  const base = desiredName.trim() || "Profile";
  const takenNames = new Set(
    existingProfiles.map((profile) => profile.name.toLowerCase()),
  );

  // New profiles should follow Profile 1, Profile 2, ... numbering.
  if (base.toLowerCase() === "profile") {
    const numberedMatches = existingProfiles
      .map((profile) => profile.name.trim())
      .map((name) => {
        const numbered = /^profile\s+(\d+)$/i.exec(name);
        if (numbered) {
          return Number(numbered[1]);
        }

        if (/^profile$/i.test(name)) {
          return 1;
        }

        return null;
      })
      .filter((value): value is number => value !== null);

    const nextIndex =
      numberedMatches.length > 0 ? Math.max(...numberedMatches) + 1 : 1;
    return `Profile ${nextIndex}`;
  }

  if (!takenNames.has(base.toLowerCase())) {
    return base;
  }

  let index = 2;
  while (takenNames.has(`${base} ${index}`.toLowerCase())) {
    index += 1;
  }

  return `${base} ${index}`;
};

export const isModifierOnly = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return ["shift", "control", "ctrl", "alt", "meta"].includes(normalized);
};

export const isGameplayMovementKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return [
    "w",
    "a",
    "s",
    "d",
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
    " ",
    "space",
    "spacebar",
  ].includes(normalized);
};

const SHAPE_POLYGONS: Partial<Record<ShapeType, Array<[number, number]>>> = {
  triangle: [
    [0.5, 0],
    [0, 1],
    [1, 1],
  ],
  diamond: [
    [0.5, 0],
    [1, 0.5],
    [0.5, 1],
    [0, 0.5],
  ],
  pentagon: [
    [0.5, 0],
    [0.05, 0.38],
    [0.22, 1],
    [0.78, 1],
    [0.95, 0.38],
  ],
  hexagon: [
    [0.25, 0],
    [0.75, 0],
    [1, 0.5],
    [0.75, 1],
    [0.25, 1],
    [0, 0.5],
  ],
  octagon: [
    [0.3, 0],
    [0.7, 0],
    [1, 0.3],
    [1, 0.7],
    [0.7, 1],
    [0.3, 1],
    [0, 0.7],
    [0, 0.3],
  ],
  star: [
    [0.5, 0],
    [0.61, 0.35],
    [0.98, 0.35],
    [0.68, 0.57],
    [0.79, 0.91],
    [0.5, 0.7],
    [0.21, 0.91],
    [0.32, 0.57],
    [0.02, 0.35],
    [0.39, 0.35],
  ],
  arrow: [
    [0, 0.35],
    [0.58, 0.35],
    [0.58, 0.15],
    [1, 0.5],
    [0.58, 0.85],
    [0.58, 0.65],
    [0, 0.65],
  ],
  trapezoid: [
    [0.15, 0],
    [0.85, 0],
    [1, 1],
    [0, 1],
  ],
};

const isPointInPolygon = (
  x: number,
  y: number,
  polygon: Array<[number, number]>,
): boolean => {
  let inside = false;
  for (
    let index = 0, prev = polygon.length - 1;
    index < polygon.length;
    prev = index++
  ) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[prev];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

export const isPointInsideShape = (
  shape: ShapeMapping,
  clientX: number,
  clientY: number,
): boolean => {
  const centerX = shape.x + shape.width / 2;
  const centerY = shape.y + shape.height / 2;

  const translatedX = clientX - centerX;
  const translatedY = clientY - centerY;
  const radians = (-shape.rotation * Math.PI) / 180;
  const unrotatedX =
    translatedX * Math.cos(radians) - translatedY * Math.sin(radians);
  const unrotatedY =
    translatedX * Math.sin(radians) + translatedY * Math.cos(radians);

  const localX = unrotatedX + shape.width / 2;
  const localY = unrotatedY + shape.height / 2;

  if (
    localX < 0 ||
    localY < 0 ||
    localX > shape.width ||
    localY > shape.height
  ) {
    return false;
  }

  const normalizedX = localX / shape.width;
  const normalizedY = localY / shape.height;

  if (shape.type === "rectangle") return true;
  if (shape.type === "circle") {
    const dx = normalizedX - 0.5;
    const dy = normalizedY - 0.5;
    return dx * dx + dy * dy <= 0.25;
  }
  if (shape.type === "ellipse" || shape.type === "pill") {
    const dx = (normalizedX - 0.5) / 0.5;
    const dy = (normalizedY - 0.5) / 0.5;
    return dx * dx + dy * dy <= 1;
  }

  const polygon = SHAPE_POLYGONS[shape.type];
  if (!polygon) return true;
  return isPointInPolygon(normalizedX, normalizedY, polygon);
};

export const buildShortcutFromEvent = (event: {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  key: string;
}): string => {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");

  let key = event.key;
  if (key === " ") key = "Space";
  else if (SHIFTED_SYMBOL_TO_BASE_KEY[key]) {
    key = SHIFTED_SYMBOL_TO_BASE_KEY[key];
  } else if (key.length === 1) key = key.toUpperCase();

  if (key && !isModifierOnly(key)) parts.push(key);
  return parts.join("+");
};
