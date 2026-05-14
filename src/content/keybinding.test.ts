import { describe, expect, it } from "vitest";
import {
  matchesBinding,
  matchesBindingAction,
  recordBindingAction,
  type BindingHistoryEntry,
} from "./keybinding";

type KeyEventShape = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
>;

const makeEvent = (partial: Partial<KeyEventShape>): KeyboardEvent =>
  ({
    key: "",
    code: "",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...partial,
  }) as KeyboardEvent;

const makeAction = (partial: {
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}) => ({
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...partial,
});

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

  it("matches ArrowUp when the event exposes a legacy Up key value", () => {
    const event = makeEvent({ key: "Up", code: "ArrowUp" });
    expect(matchesBinding(event, "ArrowUp")).toBe(true);
  });

  it("matches Ctrl+ArrowLeft using the physical key code", () => {
    const event = makeEvent({
      key: "Left",
      code: "ArrowLeft",
      ctrlKey: true,
    });
    expect(matchesBinding(event, "Ctrl+ArrowLeft")).toBe(true);
  });
});

describe("matchesBindingAction", () => {
  it("matches modifier + mouse token (Ctrl+Left Click)", () => {
    const history: BindingHistoryEntry[] = [];
    recordBindingAction(history, "Left Click", 1000);

    expect(
      matchesBindingAction(
        "Ctrl+Left Click",
        makeAction({ ctrlKey: true }),
        history,
      ),
    ).toBe(true);
  });

  it("matches mouse token regardless of token case/spacing", () => {
    const history: BindingHistoryEntry[] = [];
    recordBindingAction(history, "  dOuBlE   rIgHt   ClIcK  ", 1000);

    expect(
      matchesBindingAction("double right click", makeAction({}), history),
    ).toBe(true);
  });

  it("does not match mouse token when modifier state differs", () => {
    const history: BindingHistoryEntry[] = [];
    recordBindingAction(history, "Left Click", 1000);

    expect(
      matchesBindingAction(
        "Ctrl+Left Click",
        makeAction({ ctrlKey: false }),
        history,
      ),
    ).toBe(false);
  });

  it("matches keyboard + mouse sequence", () => {
    const history: BindingHistoryEntry[] = [];
    recordBindingAction(history, "g", 1000);
    recordBindingAction(history, "Left Click", 1100);

    expect(matchesBindingAction("g+left click", makeAction({}), history)).toBe(
      true,
    );
  });
});
