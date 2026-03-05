import { describe, expect, it } from "vitest";
import {
  getReservedShapeShortcutUsage,
  sanitizeShapeBinding,
} from "./shortcutBinding";

describe("sanitizeShapeBinding", () => {
  it("keeps only Ctrl/Alt/Shift when a pointer token is present", () => {
    expect(sanitizeShapeBinding("Ctrl+A+Left Click")).toBe("Ctrl+Left Click");
    expect(sanitizeShapeBinding("B+Wheel Down")).toBe("Wheel Down");
    expect(sanitizeShapeBinding("Meta+Shift+Wheel Up")).toBe("Shift+Wheel Up");
  });

  it("prevents stacking ordinary keys with mouse double click", () => {
    expect(sanitizeShapeBinding("A+A+Double Left Click")).toBe(
      "Double Left Click",
    );
  });

  it("preserves keyboard-only bindings including Meta", () => {
    expect(sanitizeShapeBinding("Meta+Alt+K+W+Q")).toBe("Alt+Meta+W+Q");
  });
});

describe("getReservedShapeShortcutUsage", () => {
  const settings = {
    theme: "system",
    editMode: true,
    showHandles: false,
    showSnapIndicators: true,
    strictPassthrough: true,
    addKeyMapShortcut: "Alt+Shift+A",
    toggleModeShortcut: "Alt+Shift+S",
    focusCanvasShortcut: "Alt+Shift+F",
    toggleShapesShortcut: "Alt+Shift+H",
    setZeroOpacityShortcut: "Alt+Shift+0",
  } as const;

  it("matches configurable shortcuts", () => {
    expect(getReservedShapeShortcutUsage("Alt+Shift+A", settings)).toBe(
      "Add Key Map",
    );
  });

  it("does not reserve internal edit shortcuts", () => {
    expect(getReservedShapeShortcutUsage("Ctrl+A", settings)).toBeNull();
    expect(getReservedShapeShortcutUsage("Meta+Shift+Z", settings)).toBeNull();
  });
});
