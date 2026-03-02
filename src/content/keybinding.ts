import type { ShapeMapping } from "./types";

const normalizeToken = (token: string): string => token.trim().toLowerCase();

const SHIFTED_SYMBOL_TO_BASE_KEY: Record<string, string> = {
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

const getEventToken = (event: KeyboardEvent): string => {
  const shiftedBaseKey = SHIFTED_SYMBOL_TO_BASE_KEY[event.key];
  if (shiftedBaseKey) {
    return shiftedBaseKey;
  }

  if (event.key.length === 1) {
    return event.key.toLowerCase();
  }

  return event.key.toLowerCase();
};

const parseBinding = (binding: string) => {
  const tokens = binding.split("+").map(normalizeToken).filter(Boolean);

  return {
    ctrl: tokens.includes("ctrl") || tokens.includes("control"),
    alt: tokens.includes("alt"),
    shift: tokens.includes("shift"),
    meta:
      tokens.includes("meta") ||
      tokens.includes("cmd") ||
      tokens.includes("command"),
    key: tokens.find(
      (token) =>
        !["ctrl", "control", "alt", "shift", "meta", "cmd", "command"].includes(
          token,
        ),
    ),
  };
};

export const matchesBinding = (
  event: KeyboardEvent,
  binding: string,
): boolean => {
  const parsed = parseBinding(binding);
  if (!parsed.key) {
    return false;
  }

  if (event.ctrlKey !== parsed.ctrl) {
    return false;
  }
  if (event.altKey !== parsed.alt) {
    return false;
  }
  if (event.shiftKey !== parsed.shift) {
    return false;
  }
  if (event.metaKey !== parsed.meta) {
    return false;
  }

  return getEventToken(event) === parsed.key;
};

export const triggerShapeArea = (shape: ShapeMapping): void => {
  const centerX = shape.x + shape.width / 2;
  const centerY = shape.y + shape.height / 2;

  const tryDispatch = () => {
    const overlayRoot = document.getElementById("flyff-mapper-root");
    const previousOverlayPointerEvents = overlayRoot?.style.pointerEvents;

    if (overlayRoot) {
      overlayRoot.style.pointerEvents = "none";
    }

    const hit = document.elementFromPoint(
      centerX,
      centerY,
    ) as HTMLElement | null;

    if (overlayRoot) {
      overlayRoot.style.pointerEvents = previousOverlayPointerEvents ?? "";
    }

    const target =
      (hit && !hit.closest("#flyff-mapper-root") ? hit : null) ??
      (document.querySelector("canvas") as HTMLElement | null);

    if (!target) {
      return;
    }

    const events: Array<keyof DocumentEventMap> = [
      "pointerdown",
      "mousedown",
      "mouseup",
      "click",
    ];

    events.forEach((eventName) => {
      target.dispatchEvent(
        new MouseEvent(eventName, {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: centerX,
          clientY: centerY,
          button: 0,
        }),
      );
    });
  };
  tryDispatch();
};
