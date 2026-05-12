import { describe, expect, it } from "vitest";
import {
  isMouseWheelShortcutToken,
  shouldHandleGlobalDialogShortcut,
} from "./shortcutRuntime";

describe("isMouseWheelShortcutToken", () => {
  it("accepts all supported pointer and wheel tokens", () => {
    expect(isMouseWheelShortcutToken("Left Click")).toBe(true);
    expect(isMouseWheelShortcutToken("Double Left Click")).toBe(true);
    expect(isMouseWheelShortcutToken("Right Click")).toBe(true);
    expect(isMouseWheelShortcutToken("Double Right Click")).toBe(true);
    expect(isMouseWheelShortcutToken("Wheel Up")).toBe(true);
    expect(isMouseWheelShortcutToken("Wheel Down")).toBe(true);
  });

  it("normalizes casing and surrounding spaces", () => {
    expect(isMouseWheelShortcutToken("  wHeEl Up  ")).toBe(true);
    expect(isMouseWheelShortcutToken("  left click  ")).toBe(true);
  });

  it("rejects keyboard-only tokens", () => {
    expect(isMouseWheelShortcutToken("Ctrl+K")).toBe(false);
    expect(isMouseWheelShortcutToken("Space")).toBe(false);
    expect(isMouseWheelShortcutToken("F5")).toBe(false);
  });
});

describe("shouldHandleGlobalDialogShortcut", () => {
  it("allows handling when not typing and not focusing toggle-dialog field", () => {
    expect(
      shouldHandleGlobalDialogShortcut({
        isInputTarget: false,
        isToggleDialogShortcutFieldFocused: false,
      }),
    ).toBe(true);
  });

  it("blocks handling when any input is focused", () => {
    expect(
      shouldHandleGlobalDialogShortcut({
        isInputTarget: true,
        isToggleDialogShortcutFieldFocused: false,
      }),
    ).toBe(false);
  });

  it("blocks handling when the toggle-dialog shortcut field is focused", () => {
    expect(
      shouldHandleGlobalDialogShortcut({
        isInputTarget: false,
        isToggleDialogShortcutFieldFocused: true,
      }),
    ).toBe(false);
  });
});
