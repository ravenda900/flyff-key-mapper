import type { ShapeMapping } from "../types";

export const PASTE_OFFSET_PX = 20;

type ShortcutEventLike = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey"
>;

export type ClipboardShortcutAction = "cut" | "copy" | "paste";

export function getClipboardShapes(
  shapes: ShapeMapping[],
  selectedIds: string[],
  selectedShape: ShapeMapping | null,
): ShapeMapping[] {
  if (selectedIds.length > 0) {
    const selectedIdSet = new Set(selectedIds);
    return shapes.filter((shape) => selectedIdSet.has(shape.id));
  }

  return selectedShape ? [selectedShape] : [];
}

export function duplicateClipboardShapes(
  copiedShapes: ShapeMapping[],
  createId: () => string,
  offset = PASTE_OFFSET_PX,
): ShapeMapping[] {
  return copiedShapes.map((shape) => ({
    ...shape,
    id: createId(),
    x: shape.x + offset,
    y: shape.y + offset,
  }));
}

export function isClipboardShortcut(
  event: ShortcutEventLike,
  action: ClipboardShortcutAction,
): boolean {
  if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) {
    return false;
  }

  const key = event.key.toLowerCase();
  if (action === "cut") {
    return key === "x";
  }

  if (action === "copy") {
    return key === "c";
  }

  return key === "v";
}
