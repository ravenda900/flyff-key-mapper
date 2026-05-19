import { describe, expect, it } from "vitest";
import { syncKeyTriggerCharacterProfileSelection } from "./profileSelectionSync";

describe("syncKeyTriggerCharacterProfileSelection", () => {
  it("returns no-op when selected profile is unchanged", () => {
    const currentMapping = { "Character A": "profile-1" };

    const result = syncKeyTriggerCharacterProfileSelection({
      currentMapping,
      tabName: "Character A",
      nextProfileId: "profile-1",
    });

    expect(result.shouldNotify).toBe(false);
    expect(result.nextMapping).toBeNull();
    expect(result.normalizedProfileId).toBe("profile-1");
  });

  it("creates next mapping and notifies when selected profile changes", () => {
    const currentMapping = { "Character A": "profile-1" };

    const result = syncKeyTriggerCharacterProfileSelection({
      currentMapping,
      tabName: "Character A",
      nextProfileId: "profile-2",
    });

    expect(result.shouldNotify).toBe(true);
    expect(result.nextMapping).toEqual({ "Character A": "profile-2" });
    expect(result.normalizedProfileId).toBe("profile-2");
  });

  it("normalizes null profile selection to an empty string", () => {
    const currentMapping = { "Character A": "profile-1" };

    const result = syncKeyTriggerCharacterProfileSelection({
      currentMapping,
      tabName: "Character A",
      nextProfileId: null,
    });

    expect(result.shouldNotify).toBe(true);
    expect(result.nextMapping).toEqual({ "Character A": "" });
    expect(result.normalizedProfileId).toBe("");
  });

  it("preserves unrelated tab mappings when updating one tab", () => {
    const currentMapping = {
      "Character A": "profile-1",
      "Character B": "profile-9",
    };

    const result = syncKeyTriggerCharacterProfileSelection({
      currentMapping,
      tabName: "Character A",
      nextProfileId: "profile-2",
    });

    expect(result.shouldNotify).toBe(true);
    expect(result.nextMapping).toEqual({
      "Character A": "profile-2",
      "Character B": "profile-9",
    });
  });
});
