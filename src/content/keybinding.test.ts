import { describe, expect, it } from "vitest";
import { matchesBinding } from "./keybinding";

type KeyEventShape = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
>;

const makeEvent = (partial: Partial<KeyEventShape>): KeyboardEvent =>
  ({
    key: "",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...partial,
  }) as KeyboardEvent;

describe("matchesBinding", () => {
  it("matches Shift+1 when event key is !", () => {
    const event = makeEvent({ key: "!", shiftKey: true });
    expect(matchesBinding(event, "Shift+1")).toBe(true);
  });

  it("matches Shift+/ when event key is ?", () => {
    const event = makeEvent({ key: "?", shiftKey: true });
    expect(matchesBinding(event, "Shift+/")).toBe(true);
  });

  it("matches Shift+= when event key is +", () => {
    const event = makeEvent({ key: "+", shiftKey: true });
    expect(matchesBinding(event, "Shift+=")).toBe(true);
  });

  it("does not match without required shift modifier", () => {
    const event = makeEvent({ key: "1", shiftKey: false });
    expect(matchesBinding(event, "Shift+1")).toBe(false);
  });

  it("matches Ctrl+Alt+Shift+1 when event key is !", () => {
    const event = makeEvent({
      key: "!",
      ctrlKey: true,
      altKey: true,
      shiftKey: true,
    });
    expect(matchesBinding(event, "Ctrl+Alt+Shift+1")).toBe(true);
  });

  it("does not match Ctrl+Alt+Shift+1 when Alt is missing", () => {
    const event = makeEvent({
      key: "!",
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
    });
    expect(matchesBinding(event, "Ctrl+Alt+Shift+1")).toBe(false);
  });
});
