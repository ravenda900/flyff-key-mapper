import { OVERLAY_SHORTCUT } from "./constants";
import type { MapperSettings } from "../types";

const MODIFIER_ORDER = ["Ctrl", "Alt", "Shift", "Meta"];

const POINTER_TOKEN_SET = new Set([
  "left click",
  "right click",
  "double left click",
  "double right click",
  "wheel up",
  "wheel down",
]);

const normalizeShortcutForCompare = (binding: string): string => {
  const parts = binding
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  const modifiers = new Set<string>();
  const steps: string[] = [];

  parts.forEach((part) => {
    if (part === "ctrl" || part === "control") {
      modifiers.add("ctrl");
      return;
    }

    if (part === "alt") {
      modifiers.add("alt");
      return;
    }

    if (part === "shift") {
      modifiers.add("shift");
      return;
    }

    if (part === "meta" || part === "cmd" || part === "command") {
      modifiers.add("meta");
      return;
    }

    steps.push(part);
  });

  const orderedModifiers = ["ctrl", "alt", "shift", "meta"].filter((modifier) =>
    modifiers.has(modifier),
  );

  return [...orderedModifiers, ...steps].join("+");
};

type ReservedShortcutEntry = {
  binding: string;
  usedBy: string;
};

export type GlobalShortcutField =
  | "addKeyMapShortcut"
  | "toggleModeShortcut"
  | "focusCanvasShortcut"
  | "toggleShapesShortcut"
  | "setZeroOpacityShortcut"
  | "toggleDialogShortcut";

const getReservedShortcutEntries = (
  settings: MapperSettings,
): ReservedShortcutEntry[] => [
  { binding: OVERLAY_SHORTCUT, usedBy: "Toggle Mapper" },
  { binding: settings.addKeyMapShortcut, usedBy: "Add Key Map" },
  { binding: settings.toggleModeShortcut, usedBy: "Start/Stop Mode" },
  { binding: settings.focusCanvasShortcut, usedBy: "Focus Canvas" },
  { binding: settings.toggleShapesShortcut, usedBy: "Show/Hide Shapes" },
  { binding: settings.setZeroOpacityShortcut, usedBy: "Opacity 0/100" },
  { binding: settings.toggleDialogShortcut, usedBy: "Toggle Dialog" },
];

export const getGlobalShortcutConflict = (
  binding: string,
  settings: MapperSettings,
  currentField: GlobalShortcutField,
): string | null => {
  const normalizedTarget = normalizeShortcutForCompare(binding);
  if (!normalizedTarget) {
    return null;
  }

  const candidates: Array<
    ReservedShortcutEntry & { field?: GlobalShortcutField }
  > = [
    { binding: OVERLAY_SHORTCUT, usedBy: "Toggle Mapper" },
    {
      binding: settings.addKeyMapShortcut,
      usedBy: "Add Key Map",
      field: "addKeyMapShortcut",
    },
    {
      binding: settings.toggleModeShortcut,
      usedBy: "Start/Stop Mode",
      field: "toggleModeShortcut",
    },
    {
      binding: settings.focusCanvasShortcut,
      usedBy: "Focus Canvas",
      field: "focusCanvasShortcut",
    },
    {
      binding: settings.toggleShapesShortcut,
      usedBy: "Show/Hide Shapes",
      field: "toggleShapesShortcut",
    },
    {
      binding: settings.setZeroOpacityShortcut,
      usedBy: "Opacity 0/100",
      field: "setZeroOpacityShortcut",
    },
  ];

  const conflict = candidates.find((candidate) => {
    if (candidate.field === currentField) {
      return false;
    }

    return normalizeShortcutForCompare(candidate.binding) === normalizedTarget;
  });

  return conflict?.usedBy ?? null;
};

export const getReservedShapeShortcutUsage = (
  binding: string,
  settings: MapperSettings,
): string | null => {
  const normalizedTarget = normalizeShortcutForCompare(binding);
  if (!normalizedTarget) {
    return null;
  }

  const match = getReservedShortcutEntries(settings).find(
    (entry) => normalizeShortcutForCompare(entry.binding) === normalizedTarget,
  );

  return match?.usedBy ?? null;
};

export const sanitizeShapeBinding = (nextBinding: string): string => {
  const normalizedParts = nextBinding
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  const modifierLookup = new Set(
    normalizedParts.map((part) => part.toLowerCase()),
  );

  const selectedModifiers = MODIFIER_ORDER.filter((modifier) =>
    modifierLookup.has(modifier.toLowerCase()),
  );

  const pointerSteps: string[] = [];
  const ordinarySteps: string[] = [];

  normalizedParts.forEach((part) => {
    const lower = part.toLowerCase();

    if (
      lower === "ctrl" ||
      lower === "alt" ||
      lower === "shift" ||
      lower === "meta"
    ) {
      return;
    }

    if (POINTER_TOKEN_SET.has(lower)) {
      pointerSteps.push(part);
      return;
    }

    ordinarySteps.push(part);
  });

  const limitedOrdinarySteps = ordinarySteps.slice(-2);
  const limitedPointerSteps = pointerSteps.slice(-1);
  const hasPointerStep = limitedPointerSteps.length > 0;

  const modifiers = hasPointerStep
    ? selectedModifiers.filter(
        (modifier) =>
          modifier === "Ctrl" || modifier === "Alt" || modifier === "Shift",
      )
    : selectedModifiers;

  return [
    ...modifiers,
    ...(hasPointerStep ? [] : limitedOrdinarySteps),
    ...limitedPointerSteps,
  ].join("+");
};
