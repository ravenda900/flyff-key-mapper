import { describe, expect, it } from "vitest";
import {
  getReservedShapeShortcutUsage,
  sanitizeShapeBinding,
} from "./shortcutBinding";
import type { MapperSettings } from "../types";

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
    experimentalFeaturesEnabled: false,
    showHandles: false,
    showSnapIndicators: true,
    showShapeTooltips: true,
    syncMouseEvents: false,
    mouseSyncPositionMode: "actual",
    strictPassthrough: true,
    addKeyMapShortcut: "Alt+Shift+A",
    toggleModeShortcut: "Alt+Shift+S",
    focusCanvasShortcut: "Alt+Shift+F",
    toggleShapesShortcut: "Alt+Shift+H",
    setZeroOpacityShortcut: "Alt+Shift+0",
    toggleDialogShortcut: "Alt+Shift+M",
    autoStopSeconds: null,
    notifyOnRecaptcha: false,
    stopOnRecaptcha: false,
    mobilePushEnabled: false,
    mobilePushDiscordBotUrl: "",
    mobilePushDiscordUserId: "",
    mobilePushDiscordApiKey: "",
    autoHoly: {
      enabled: false,
      debuffType: "root",
      debugOverlayEnabled: false,
      holyKey: "",
      scanRegion: null,
    },
    autoPills: {
      enabled: false,
      hpThreshold: 50,
      debugOverlayEnabled: false,
      pillKey: "",
      scanRegion: null,
    },
    autoAwaken: {
      scanRegion: null,
      blessingType: "auto" as const,
      stat1Criteria: [],
      stat2Criteria: [],
    },
  } satisfies MapperSettings;

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
