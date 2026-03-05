import type { ShapeMapping } from "./types";

const activeToggleShapeTimers = new Map<string, number>();

const POINTER_STEP_TOKENS = new Set([
  "left click",
  "right click",
  "double left click",
  "double right click",
  "wheel up",
  "wheel down",
]);

export type BindingHistoryEntry = {
  token: string;
  timestamp: number;
};

type BindingModifiers = {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
};

const normalizeToken = (token: string): string => token.trim().toLowerCase();

const normalizeBindingStepToken = (token: string): string =>
  token.trim().toLowerCase().replace(/\s+/g, " ");

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

const parseActionBinding = (binding: string) => {
  const tokens = binding
    .split("+")
    .map(normalizeBindingStepToken)
    .filter(Boolean);

  const modifiers: BindingModifiers = {
    ctrl: tokens.includes("ctrl") || tokens.includes("control"),
    alt: tokens.includes("alt"),
    shift: tokens.includes("shift"),
    meta:
      tokens.includes("meta") ||
      tokens.includes("cmd") ||
      tokens.includes("command"),
  };

  const steps = tokens.filter(
    (token) =>
      !["ctrl", "control", "alt", "shift", "meta", "cmd", "command"].includes(
        token,
      ),
  );

  return {
    ...modifiers,
    steps,
  };
};

export const getKeyboardBindingToken = (event: KeyboardEvent): string => {
  const token = getEventToken(event);
  return token === " " ? "space" : normalizeBindingStepToken(token);
};

export const recordBindingAction = (
  history: BindingHistoryEntry[],
  token: string,
  timestamp = Date.now(),
): void => {
  const normalizedToken = normalizeBindingStepToken(token);
  if (!normalizedToken) {
    return;
  }

  history.push({
    token: normalizedToken,
    timestamp,
  });

  const earliestTime = timestamp - 5000;
  while (history.length > 0 && history[0].timestamp < earliestTime) {
    history.shift();
  }

  if (history.length > 16) {
    history.splice(0, history.length - 16);
  }
};

export const matchesBindingAction = (
  binding: string,
  action: {
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
  },
  history: BindingHistoryEntry[],
): boolean => {
  const parsed = parseActionBinding(binding);
  if (parsed.steps.length === 0) {
    return false;
  }

  const ordinaryKeyboardStepCount = parsed.steps.filter(
    (step) => !POINTER_STEP_TOKENS.has(step),
  ).length;
  if (ordinaryKeyboardStepCount > 2) {
    return false;
  }

  if (action.ctrlKey !== parsed.ctrl) {
    return false;
  }
  if (action.altKey !== parsed.alt) {
    return false;
  }
  if (action.shiftKey !== parsed.shift) {
    return false;
  }
  if (action.metaKey !== parsed.meta) {
    return false;
  }

  if (history.length < parsed.steps.length) {
    return false;
  }

  const candidate = history.slice(-parsed.steps.length);
  const firstTimestamp = candidate[0]?.timestamp ?? 0;
  const lastTimestamp = candidate[candidate.length - 1]?.timestamp ?? 0;
  const maxWindowMs = Math.max(900, parsed.steps.length * 900);

  if (lastTimestamp - firstTimestamp > maxWindowMs) {
    return false;
  }

  return candidate.every((entry, index) => entry.token === parsed.steps[index]);
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

export const triggerShapeArea = (
  shape: ShapeMapping,
  point?: { x: number; y: number },
  options?: { delayMs?: number },
): void => {
  const centerX = point?.x ?? shape.x + shape.width / 2;
  const centerY = point?.y ?? shape.y + shape.height / 2;

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
  if (shape.triggerType === "toggle") {
    const existingTimer = activeToggleShapeTimers.get(shape.id);
    if (existingTimer !== undefined) {
      window.clearInterval(existingTimer);
      activeToggleShapeTimers.delete(shape.id);
      return;
    }

    const intervalMs = Math.max(
      25,
      Math.round(options?.delayMs ?? shape.delayMs ?? 0),
    );

    const timerId = window.setInterval(() => {
      tryDispatch();
    }, intervalMs);
    activeToggleShapeTimers.set(shape.id, timerId);
    return;
  }

  const delayMs = Math.max(0, Math.round(options?.delayMs ?? 0));
  if (delayMs > 0) {
    window.setTimeout(() => {
      tryDispatch();
    }, delayMs);
    return;
  }

  tryDispatch();
};

export const stopToggleShapeArea = (shapeId: string): void => {
  const timerId = activeToggleShapeTimers.get(shapeId);
  if (timerId === undefined) {
    return;
  }

  window.clearInterval(timerId);
  activeToggleShapeTimers.delete(shapeId);
};

export const stopAllToggleShapeAreas = (): void => {
  activeToggleShapeTimers.forEach((timerId) => {
    window.clearInterval(timerId);
  });
  activeToggleShapeTimers.clear();
};
