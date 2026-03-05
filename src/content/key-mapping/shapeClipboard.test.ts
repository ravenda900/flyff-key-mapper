import { describe, expect, it } from "vitest";
import type { ShapeMapping } from "../types";
import {
  PASTE_OFFSET_PX,
  duplicateClipboardShapes,
  getClipboardShapes,
  isClipboardShortcut,
} from "./shapeClipboard";

const createShape = (
  id: string,
  x: number,
  y: number,
  keyBinding = "",
): ShapeMapping => ({
  id,
  type: "rectangle",
  x,
  y,
  width: 100,
  height: 60,
  rotation: 0,
  opacity: 1,
  keyBinding,
  delayMs: 0,
  triggerType: "once",
});

describe("getClipboardShapes", () => {
  it("returns selected shapes by selectedIds", () => {
    const shapes = [
      createShape("s1", 10, 10),
      createShape("s2", 20, 20),
      createShape("s3", 30, 30),
    ];

    const result = getClipboardShapes(shapes, ["s1", "s3"], shapes[1]);

    expect(result.map((shape) => shape.id)).toEqual(["s1", "s3"]);
  });

  it("falls back to selectedShape when there are no selectedIds", () => {
    const shape = createShape("s2", 20, 20);
    const result = getClipboardShapes([shape], [], shape);
    expect(result.map((entry) => entry.id)).toEqual(["s2"]);
  });
});

describe("duplicateClipboardShapes", () => {
  it("creates duplicated shapes with new ids and offset positions", () => {
    const source = [createShape("s1", 10, 10), createShape("s2", 50, 60)];
    let index = 0;
    const ids = ["d1", "d2"];

    const duplicated = duplicateClipboardShapes(source, () => ids[index++]);

    expect(duplicated.map((shape) => shape.id)).toEqual(["d1", "d2"]);
    expect(duplicated.map((shape) => [shape.x, shape.y])).toEqual([
      [10 + PASTE_OFFSET_PX, 10 + PASTE_OFFSET_PX],
      [50 + PASTE_OFFSET_PX, 60 + PASTE_OFFSET_PX],
    ]);
  });
});

describe("isClipboardShortcut", () => {
  const makeEvent = (partial: Partial<KeyboardEvent>): KeyboardEvent =>
    ({
      key: "",
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      altKey: false,
      ...partial,
    }) as KeyboardEvent;

  it("matches Ctrl+X and Cmd+X for cut", () => {
    expect(
      isClipboardShortcut(makeEvent({ key: "x", ctrlKey: true }), "cut"),
    ).toBe(true);
    expect(
      isClipboardShortcut(makeEvent({ key: "x", metaKey: true }), "cut"),
    ).toBe(true);
  });

  it("matches Ctrl/Cmd copy and paste", () => {
    expect(
      isClipboardShortcut(makeEvent({ key: "c", ctrlKey: true }), "copy"),
    ).toBe(true);
    expect(
      isClipboardShortcut(makeEvent({ key: "c", metaKey: true }), "copy"),
    ).toBe(true);
    expect(
      isClipboardShortcut(makeEvent({ key: "v", ctrlKey: true }), "paste"),
    ).toBe(true);
    expect(
      isClipboardShortcut(makeEvent({ key: "v", metaKey: true }), "paste"),
    ).toBe(true);
  });

  it("does not match when Shift or Alt are pressed", () => {
    expect(
      isClipboardShortcut(
        makeEvent({ key: "x", ctrlKey: true, shiftKey: true }),
        "cut",
      ),
    ).toBe(false);
    expect(
      isClipboardShortcut(
        makeEvent({ key: "c", ctrlKey: true, altKey: true }),
        "copy",
      ),
    ).toBe(false);
  });
});
