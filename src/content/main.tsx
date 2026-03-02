import {
  CloseOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Card,
  ConfigProvider,
  Divider,
  Form,
  Input,
  Modal,
  Segmented,
  Slider,
  Space,
  Switch,
  Tooltip,
  theme,
  Typography,
} from "antd";
import "antd/dist/reset.css";
import {
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Rnd } from "react-rnd";
import { matchesBinding, triggerShapeArea } from "./keybinding";
import { getShapeClass } from "./shapeStyles";
import { storage } from "./storage";
import "./styles.css";
import type {
  MapperSettings,
  ShapeMapping,
  ShapeType,
  ThemeMode,
} from "./types";

const ROOT_ID = "flyff-mapper-root";
const OVERLAY_SHORTCUT = "Alt+Shift+M";

const getSystemDark = (): boolean =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

const createShape = (shapeType: ShapeType): ShapeMapping => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type: shapeType,
  x: Math.max(100, window.innerWidth / 2 - 70),
  y: Math.max(100, window.innerHeight / 2 - 50),
  width: 140,
  height: 100,
  rotation: 0,
  opacity: 1,
  keyBinding: "",
});

const normalizeShape = (shape: ShapeMapping): ShapeMapping => ({
  ...shape,
  x: Math.max(0, Math.round(shape.x)),
  y: Math.max(0, Math.round(shape.y)),
  width: Math.max(5, Math.round(shape.width)),
  height: Math.max(5, Math.round(shape.height)),
  opacity: Math.min(1, Math.max(0.05, Number(shape.opacity))),
  rotation: Math.round(shape.rotation),
});

const isModifierOnly = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return ["shift", "control", "ctrl", "alt", "meta"].includes(normalized);
};

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

const isGameplayMovementKey = (key: string): boolean => {
  const normalized = key.toLowerCase();
  return [
    "w",
    "a",
    "s",
    "d",
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
    " ",
    "space",
    "spacebar",
  ].includes(normalized);
};

const buildShortcutFromEvent = (event: {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  key: string;
}): string => {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");

  let key = event.key;
  if (key === " ") key = "Space";
  else if (SHIFTED_SYMBOL_TO_BASE_KEY[key]) {
    key = SHIFTED_SYMBOL_TO_BASE_KEY[key];
  } else if (key.length === 1) key = key.toUpperCase();

  if (key && !isModifierOnly(key)) parts.push(key);
  return parts.join("+");
};

const ShortcutKeys = ({ combo }: { combo: string }) => {
  const parts = combo
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <span className="fm-shortcut-kbd-group" aria-label={`Shortcut ${combo}`}>
      {parts.map((part, index) => (
        <Fragment key={`${part}-${index}`}>
          <kbd className="fm-kbd">{part}</kbd>
          {index < parts.length - 1 && (
            <span className="fm-shortcut-plus">+</span>
          )}
        </Fragment>
      ))}
    </span>
  );
};

const BASIC_PALETTE_SHAPES: ShapeType[] = [
  "rectangle",
  "circle",
  "ellipse",
  "triangle",
  "diamond",
  "hexagon",
  "star",
  "pill",
  "arrow",
  "trapezoid",
];

const PaletteShapeIcon = ({ shape }: { shape: ShapeType }) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    aria-hidden="true"
    focusable="false"
  >
    {shape === "rectangle" && (
      <rect
        x="4"
        y="6"
        width="16"
        height="12"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    )}
    {shape === "circle" && (
      <circle
        cx="12"
        cy="12"
        r="7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    )}
    {shape === "ellipse" && (
      <ellipse
        cx="12"
        cy="12"
        rx="8"
        ry="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    )}
    {shape === "triangle" && (
      <polygon
        points="12,5 19,18 5,18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    )}
    {shape === "diamond" && (
      <polygon
        points="12,4 19,12 12,20 5,12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    )}
    {shape === "hexagon" && (
      <polygon
        points="7,5 17,5 21,12 17,19 7,19 3,12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    )}
    {shape === "star" && (
      <polygon
        points="12,4 14.3,9.1 20,9.3 15.4,12.9 17,18.4 12,15.2 7,18.4 8.6,12.9 4,9.3 9.7,9.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    )}
    {shape === "pill" && (
      <rect
        x="3"
        y="8"
        width="18"
        height="8"
        rx="4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    )}
    {shape === "arrow" && (
      <path
        d="M4 12h10M11 8l6 4-6 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
    {shape === "trapezoid" && (
      <polygon
        points="7,6 17,6 20,18 4,18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

function MapperApp() {
  const [settings, setSettings] = useState<MapperSettings>(() =>
    storage.loadSettings(),
  );
  const [shapes, setShapes] = useState<ShapeMapping[]>(() =>
    storage.loadShapes(),
  );
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [draftShape, setDraftShape] = useState<ShapeMapping>(() =>
    normalizeShape({
      ...createShape("rectangle"),
      opacity: shapes[0]?.opacity ?? 1,
    }),
  );
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [copiedShape, setCopiedShape] = useState<ShapeMapping | null>(null);
  const [isTransformingShape, setIsTransformingShape] = useState(false);
  const [shapesVisible, setShapesVisible] = useState(true);
  const [runningTooltip, setRunningTooltip] = useState<{
    x: number;
    y: number;
    keyBinding: string;
  } | null>(null);
  const [selectedPaletteShape, setSelectedPaletteShape] =
    useState<ShapeType>("rectangle");
  const [dialogRect, setDialogRect] = useState({
    x: 40,
    y: 80,
    width: 420,
    height: 540,
  });

  const rotateIdRef = useRef<string | null>(null);
  const previousBodyCursorRef = useRef<string | null>(null);
  const paletteDragTypeRef = useRef<ShapeType | null>(null);

  const selectedShape = useMemo(
    () => shapes.find((shape) => shape.id === selectedId) ?? null,
    [selectedId, shapes],
  );

  const appliedTheme = useMemo(() => {
    if (settings.theme === "system") return getSystemDark() ? "dark" : "light";
    return settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    storage.saveShapes(shapes);
  }, [shapes]);

  useEffect(() => {
    storage.saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSettings((prev) => ({ ...prev }));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (settings.editMode) return;
    setSelectedId(null);
  }, [settings.editMode]);

  const focusGameCanvas = () => {
    const canvas = document.querySelector("canvas") as HTMLElement | null;
    if (!canvas) return;

    const active = document.activeElement as HTMLElement | null;
    if (active === canvas) {
      return;
    }

    active?.blur();

    if (canvas.tabIndex < 0) {
      canvas.tabIndex = -1;
    }

    canvas.focus({ preventScroll: true });
  };

  const toggleOverlay = () => {
    setIsTransformingShape(false);
    setOverlayVisible(true);
    setDialogVisible((prev) => {
      const next = !prev;
      if (!next) {
        setImportOpen(false);
        window.setTimeout(() => {
          focusGameCanvas();
        }, 0);
      }
      return next;
    });
  };

  const toggleMode = () => {
    setSettings((prev) => {
      const nextEditMode = !prev.editMode;
      if (nextEditMode) {
        window.setTimeout(() => {
          focusGameCanvas();
        }, 0);
      }
      return { ...prev, editMode: nextEditMode };
    });
  };

  useEffect(() => {
    const onRuntimeMessage = (message: unknown) => {
      if (typeof message === "object" && message && "type" in message) {
        const msg = message as { type?: string };
        if (msg.type === "TOGGLE_OVERLAY") {
          toggleOverlay();
        }
      }
    };

    chrome.runtime.onMessage.addListener(onRuntimeMessage);
    return () => chrome.runtime.onMessage.removeListener(onRuntimeMessage);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isInputTarget =
        (event.target as HTMLElement | null)?.tagName === "INPUT";

      const shouldPassThroughGameplayMovement =
        !settings.editMode &&
        !isInputTarget &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        isGameplayMovementKey(event.key);

      if (shouldPassThroughGameplayMovement) {
        return;
      }

      const isToggleOverlay = matchesBinding(event, OVERLAY_SHORTCUT);
      const isToggleMode = matchesBinding(event, settings.toggleModeShortcut);
      const isFocusCanvas = matchesBinding(event, settings.focusCanvasShortcut);
      const isToggleShapes = matchesBinding(
        event,
        settings.toggleShapesShortcut,
      );
      const isAddKeyMapShortcut = matchesBinding(
        event,
        settings.addKeyMapShortcut,
      );

      if (!isInputTarget && isToggleOverlay && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        toggleOverlay();
        return;
      }

      if (!isInputTarget && isToggleMode && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        toggleMode();
        return;
      }

      if (!isInputTarget && isFocusCanvas && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        focusGameCanvas();
        return;
      }

      if (!isInputTarget && isToggleShapes && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        setShapesVisible((prev) => {
          const next = !prev;
          if (!next) {
            setRunningTooltip(null);
          }
          return next;
        });
        return;
      }

      if (
        !isInputTarget &&
        isAddKeyMapShortcut &&
        !event.repeat &&
        settings.editMode
      ) {
        event.preventDefault();
        event.stopPropagation();
        addKeyMap();
        return;
      }

      if (!settings.editMode && settings.strictPassthrough) {
        if (isInputTarget) {
          return;
        }

        const hitAreas = shapes.filter(
          (shape) =>
            shape.keyBinding && matchesBinding(event, shape.keyBinding),
        );

        if (hitAreas.length > 0 && !event.repeat) {
          hitAreas.forEach((shape) => {
            triggerShapeArea(shape);
          });
        }

        return;
      }

      if (!overlayVisible) return;

      if (event.key === "Escape") {
        if (selectedShape) {
          event.preventDefault();
          setSelectedId(null);
          (document.activeElement as HTMLElement | null)?.blur();
          return;
        }

        if (dialogVisible) {
          attemptCloseDialog();
          return;
        }
      }

      if (settings.editMode && selectedShape && event.key === "Delete") {
        event.preventDefault();
        removeShape(selectedShape.id);
        return;
      }

      if (isInputTarget) {
        return;
      }

      if (settings.editMode && selectedShape) {
        const isCopy =
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          event.key.toLowerCase() === "c";
        if (isCopy) {
          event.preventDefault();
          setCopiedShape(selectedShape);
          return;
        }

        const isPaste =
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          event.key.toLowerCase() === "v";
        if (isPaste && copiedShape) {
          event.preventDefault();
          const duplicated = normalizeShape({
            ...copiedShape,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            x: copiedShape.x + 20,
            y: copiedShape.y + 20,
          });
          setShapes((prev) => [...prev, duplicated]);
          setSelectedId(duplicated.id);
          return;
        }

        const step = event.shiftKey ? 10 : 1;
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveShape(selectedShape.id, 0, -step);
          return;
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveShape(selectedShape.id, 0, step);
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          moveShape(selectedShape.id, -step, 0);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          moveShape(selectedShape.id, step, 0);
          return;
        }
      }

      if (!settings.editMode) {
        const hitAreas = shapes.filter(
          (shape) =>
            shape.keyBinding && matchesBinding(event, shape.keyBinding),
        );
        if (hitAreas.length > 0) {
          if (event.repeat) {
            return;
          }

          hitAreas.forEach((shape) => {
            triggerShapeArea(shape);
          });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [
    copiedShape,
    dialogVisible,
    overlayVisible,
    selectedShape,
    settings.addKeyMapShortcut,
    settings.editMode,
    settings.focusCanvasShortcut,
    settings.strictPassthrough,
    settings.toggleModeShortcut,
    settings.toggleShapesShortcut,
    shapes,
  ]);

  const captureGlobalShortcut = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    field:
      | "addKeyMapShortcut"
      | "toggleModeShortcut"
      | "focusCanvasShortcut"
      | "toggleShapesShortcut",
  ) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.key === "Escape") {
      (event.target as HTMLInputElement).blur();
      return;
    }

    const captured = buildShortcutFromEvent(event);
    if (!captured) return;

    setSettings((prev) => ({
      ...prev,
      [field]: captured,
    }));
  };

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const activeId = rotateIdRef.current;
      if (!activeId) return;

      setShapes((prev) =>
        prev.map((shape) => {
          if (shape.id !== activeId) return shape;
          const cx = shape.x + shape.width / 2;
          const cy = shape.y + shape.height / 2;
          const rad = Math.atan2(event.clientY - cy, event.clientX - cx);
          const rotation = (rad * 180) / Math.PI + 90;
          return { ...shape, rotation };
        }),
      );
    };

    const onUp = () => {
      if (!rotateIdRef.current) {
        return;
      }

      rotateIdRef.current = null;
      setIsTransformingShape(false);
      document.body.style.cursor = previousBodyCursorRef.current ?? "";
      previousBodyCursorRef.current = null;
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  useEffect(() => {
    if (!overlayVisible || !shapesVisible) {
      setRunningTooltip(null);
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      const hit = [...shapes]
        .reverse()
        .find(
          (shape) =>
            shape.keyBinding &&
            event.clientX >= shape.x &&
            event.clientX <= shape.x + shape.width &&
            event.clientY >= shape.y &&
            event.clientY <= shape.y + shape.height,
        );

      if (!hit) {
        setRunningTooltip(null);
        return;
      }

      setRunningTooltip({
        x: event.clientX + 12,
        y: event.clientY + 12,
        keyBinding: hit.keyBinding,
      });
    };

    const onMouseLeaveWindow = () => {
      setRunningTooltip(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseout", onMouseLeaveWindow);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseout", onMouseLeaveWindow);
    };
  }, [overlayVisible, shapes, shapesVisible]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;

      const active = document.activeElement as HTMLElement | null;
      const activeIsShapeShortcutInput =
        active?.classList.contains("fm-shape-shortcut-input") ?? false;
      const clickedShortcutInput =
        target?.closest(".fm-shape-shortcut-input") ?? null;

      if (activeIsShapeShortcutInput && !clickedShortcutInput) {
        active?.blur();
      }

      if (target?.closest("canvas") && event.button === 0) {
        focusGameCanvas();
      }
    };

    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    return () =>
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
  }, []);

  const moveShape = (id: string, dx: number, dy: number) => {
    setShapes((prev) =>
      prev.map((shape) =>
        shape.id === id
          ? normalizeShape({
              ...shape,
              x: shape.x + dx,
              y: shape.y + dy,
            })
          : shape,
      ),
    );
  };

  const makeDraftedShape = (
    shapeType: ShapeType = "rectangle",
    point?: { x: number; y: number },
  ): ShapeMapping => {
    const base = createShape(shapeType);

    if (!point) {
      return normalizeShape({
        ...base,
        opacity: draftShape.opacity,
      });
    }

    return normalizeShape({
      ...base,
      x: point.x - base.width / 2,
      y: point.y - base.height / 2,
      opacity: draftShape.opacity,
    });
  };

  const addKeyMapOfType = (
    shapeType: ShapeType,
    point?: { x: number; y: number },
  ) => {
    const newShape = makeDraftedShape(shapeType, point);
    setSettings((prev) => ({ ...prev, editMode: true }));
    setShapes((prev) => [...prev, newShape]);
    setSelectedId(newShape.id);
  };

  const addKeyMap = () => {
    addKeyMapOfType("rectangle");
  };

  const onPaletteDragStart = (
    event: ReactDragEvent<HTMLElement>,
    shapeType: ShapeType,
  ) => {
    if (!settings.editMode) {
      event.preventDefault();
      return;
    }

    setSelectedPaletteShape(shapeType);
    paletteDragTypeRef.current = shapeType;
    setIsTransformingShape(true);
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("text/plain", shapeType);
  };

  const onPaletteDragEnd = () => {
    paletteDragTypeRef.current = null;
    setIsTransformingShape(false);
  };

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (!paletteDragTypeRef.current) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const onDrop = (event: DragEvent) => {
      const shapeType = paletteDragTypeRef.current;
      if (!shapeType) return;

      event.preventDefault();

      const elementAtPoint = document.elementFromPoint(
        event.clientX,
        event.clientY,
      ) as HTMLElement | null;
      const droppedOnCanvas = Boolean(elementAtPoint?.closest("canvas"));

      if (droppedOnCanvas) {
        addKeyMapOfType(shapeType, {
          x: event.clientX,
          y: event.clientY,
        });
      }

      paletteDragTypeRef.current = null;
      setIsTransformingShape(false);
    };

    const onGlobalDragEnd = () => {
      if (!paletteDragTypeRef.current) return;
      paletteDragTypeRef.current = null;
      setIsTransformingShape(false);
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", onGlobalDragEnd);

    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", onGlobalDragEnd);
    };
  }, [addKeyMapOfType]);

  const attemptCloseDialog = () => {
    setDialogVisible(false);
  };

  const removeShape = (id: string) => {
    setShapes((prev) => prev.filter((shape) => shape.id !== id));
    setSelectedId((prev) => (prev === id ? null : prev));
  };

  const exportMappings = async () => {
    const payload = JSON.stringify({ shapes, settings }, null, 2);
    await navigator.clipboard.writeText(payload);
  };

  const applyImport = () => {
    try {
      const parsed = JSON.parse(importText) as {
        shapes?: ShapeMapping[];
        settings?: Partial<MapperSettings>;
      };

      if (Array.isArray(parsed.shapes)) {
        setShapes(parsed.shapes.map(normalizeShape));
      }

      if (parsed.settings) {
        setSettings((prev) => ({
          ...prev,
          theme: parsed.settings?.theme ?? prev.theme,
          editMode: parsed.settings?.editMode ?? prev.editMode,
          showHandles: parsed.settings?.showHandles ?? prev.showHandles,
          addKeyMapShortcut:
            parsed.settings?.addKeyMapShortcut ?? prev.addKeyMapShortcut,
          toggleModeShortcut:
            parsed.settings?.toggleModeShortcut ?? prev.toggleModeShortcut,
          strictPassthrough:
            parsed.settings?.strictPassthrough ?? prev.strictPassthrough,
          focusCanvasShortcut:
            parsed.settings?.focusCanvasShortcut ?? prev.focusCanvasShortcut,
          toggleShapesShortcut:
            parsed.settings?.toggleShapesShortcut ?? prev.toggleShapesShortcut,
        }));
      }

      setImportText("");
      setImportOpen(false);
    } catch {
      Modal.error({
        title: "Invalid import payload",
        content: "Please provide a valid JSON mapping export.",
      });
    }
  };

  const handleThemeChange = (value: string | number) => {
    setSettings((prev) => ({ ...prev, theme: value as ThemeMode }));
  };

  const algorithm =
    appliedTheme === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm;

  return (
    <ConfigProvider theme={{ algorithm }}>
      <App>
        <div
          className={`fm-relative fm-size-full ${appliedTheme === "dark" ? "fm-dark" : ""}`}
        >
          {overlayVisible &&
            shapesVisible &&
            shapes.map((shape) => {
              const selected = settings.editMode && shape.id === selectedId;
              return (
                <Rnd
                  key={shape.id}
                  className={`fm-shape ${selected ? "fm-shape-selected" : ""}`}
                  size={{ width: shape.width, height: shape.height }}
                  position={{ x: shape.x, y: shape.y }}
                  minWidth={5}
                  minHeight={5}
                  disableDragging={!settings.editMode}
                  enableResizing={
                    settings.editMode ? { bottomRight: true } : false
                  }
                  resizeHandleStyles={{
                    bottomRight: {
                      right: "-9px",
                      bottom: "-9px",
                      left: "auto",
                      top: "auto",
                      width: "18px",
                      height: "18px",
                      cursor: "nwse-resize",
                    },
                  }}
                  cancel=".fm-shape-shortcut-input, .fm-close-btn, .fm-rotate-handle"
                  bounds="window"
                  style={{
                    pointerEvents: settings.editMode ? "auto" : "none",
                    zIndex: selected ? 2147483644 : 2147483643,
                  }}
                  onMouseDown={() => {
                    if (!settings.editMode) return;
                    setSelectedId(shape.id);
                  }}
                  onClick={(event: ReactMouseEvent) => {
                    if (!settings.editMode) return;
                    event.stopPropagation();
                    setSelectedId(shape.id);
                  }}
                  onDragStart={() => {
                    if (!settings.editMode) return;
                    setSelectedId(shape.id);
                    setIsTransformingShape(true);
                  }}
                  onDragStop={(_event, data) => {
                    setIsTransformingShape(false);
                    setShapes((prev) =>
                      prev.map((item) =>
                        item.id === shape.id
                          ? normalizeShape({ ...item, x: data.x, y: data.y })
                          : item,
                      ),
                    );
                  }}
                  onResizeStart={() => {
                    if (!settings.editMode) return;
                    setSelectedId(shape.id);
                    setIsTransformingShape(true);
                  }}
                  onResizeStop={(_event, _dir, ref, _delta, position) => {
                    setIsTransformingShape(false);
                    setShapes((prev) =>
                      prev.map((item) =>
                        item.id === shape.id
                          ? normalizeShape({
                              ...item,
                              x: position.x,
                              y: position.y,
                              width: Number(ref.style.width.replace("px", "")),
                              height: Number(
                                ref.style.height.replace("px", ""),
                              ),
                            })
                          : item,
                      ),
                    );
                  }}
                >
                  {settings.editMode && (
                    <button
                      type="button"
                      className="fm-close-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeShape(shape.id);
                      }}
                    >
                      <CloseOutlined />
                    </button>
                  )}
                  <div
                    className="fm-shape-shell"
                    style={{
                      transform: `rotate(${shape.rotation}deg)`,
                      opacity: shape.opacity,
                      pointerEvents: settings.editMode ? "auto" : "none",
                    }}
                  >
                    <div className={getShapeClass(shape.type)} />
                    {settings.editMode && selected && (
                      <div
                        className="fm-rotate-handle"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          previousBodyCursorRef.current =
                            document.body.style.cursor;
                          rotateIdRef.current = shape.id;
                          document.body.style.cursor = "grabbing";
                        }}
                      />
                    )}
                    <div className="fm-shape-shortcut">
                      <input
                        className="fm-shape-shortcut-input"
                        value={shape.keyBinding}
                        placeholder={settings.editMode ? "Press keys" : ""}
                        readOnly={!settings.editMode}
                        tabIndex={settings.editMode ? 0 : -1}
                        style={{
                          pointerEvents: settings.editMode ? "auto" : "none",
                        }}
                        onMouseDown={(event) => {
                          if (!settings.editMode) return;
                          event.stopPropagation();
                          setSelectedId(shape.id);
                        }}
                        onFocus={() => {
                          if (!settings.editMode) return;
                          setSelectedId(shape.id);
                        }}
                        onKeyDown={(event) => {
                          if (!settings.editMode) return;
                          event.preventDefault();
                          event.stopPropagation();
                          if (event.key === "Escape") {
                            (event.target as HTMLInputElement).blur();
                            return;
                          }
                          const captured = buildShortcutFromEvent(event);
                          if (!captured) return;
                          setShapes((prev) =>
                            prev.map((item) =>
                              item.id === shape.id
                                ? normalizeShape({
                                    ...item,
                                    keyBinding: captured,
                                  })
                                : item,
                            ),
                          );
                        }}
                      />
                    </div>
                  </div>
                </Rnd>
              );
            })}

          {overlayVisible && shapesVisible && runningTooltip && (
            <div
              className="fm-running-tooltip"
              style={{
                left: runningTooltip.x,
                top: runningTooltip.y,
              }}
            >
              <span>Trigger: </span>
              <ShortcutKeys combo={runningTooltip.keyBinding} />
            </div>
          )}

          {overlayVisible && dialogVisible && !isTransformingShape && (
            <Rnd
              className="fm-dialog fm-z-[2147483645]"
              size={{ width: dialogRect.width, height: dialogRect.height }}
              position={{ x: dialogRect.x, y: dialogRect.y }}
              minWidth={360}
              minHeight={430}
              dragHandleClassName="ant-card-head"
              bounds="window"
              onDragStop={(_event, data) => {
                setDialogRect((prev) => ({ ...prev, x: data.x, y: data.y }));
              }}
              onResizeStop={(_event, _dir, ref, _delta, position) => {
                setDialogRect({
                  x: position.x,
                  y: position.y,
                  width: Number(ref.style.width.replace("px", "")),
                  height: Number(ref.style.height.replace("px", "")),
                });
              }}
            >
              <Card
                title="Key Mapper"
                size="small"
                bodyStyle={{ height: "calc(100% - 46px)", overflow: "auto" }}
                className="fm-panel fm-h-full"
                extra={
                  <Space size={8}>
                    <Typography.Text type="secondary">
                      Mapper Toggle: {OVERLAY_SHORTCUT}
                    </Typography.Text>
                    <Button
                      size="small"
                      onClick={focusGameCanvas}
                      title="Focus game canvas"
                    >
                      F
                    </Button>
                  </Space>
                }
              >
                <Form layout="vertical" style={{ direction: "ltr" }}>
                  <Form.Item>
                    <Space direction="vertical" size={8} className="fm-w-full">
                      <Tooltip
                        title={
                          <span>
                            Shortcut:{" "}
                            <ShortcutKeys combo={settings.toggleModeShortcut} />
                          </span>
                        }
                      >
                        <Button
                          type="primary"
                          danger={!settings.editMode}
                          block
                          icon={
                            settings.editMode ? (
                              <PlayCircleOutlined />
                            ) : (
                              <StopOutlined />
                            )
                          }
                          aria-label={settings.editMode ? "Start" : "Stop"}
                          title={settings.editMode ? "Start" : "Stop"}
                          onClick={toggleMode}
                        >
                          {settings.editMode ? "Start" : "Stop"}
                        </Button>
                      </Tooltip>
                      <Tooltip
                        title={
                          <span>
                            Shortcut:{" "}
                            <ShortcutKeys combo={settings.addKeyMapShortcut} />
                          </span>
                        }
                      >
                        <Button
                          type="dashed"
                          block
                          onClick={addKeyMap}
                          disabled={!settings.editMode}
                        >
                          Add Key Map
                        </Button>
                      </Tooltip>
                    </Space>
                  </Form.Item>

                  <Divider className="!fm-my-2" />
                  <Typography.Text strong>Mapper Controls</Typography.Text>

                  <Form.Item label="Shape Palette">
                    <Space direction="vertical" size={6} className="fm-w-full">
                      <Space wrap>
                        {BASIC_PALETTE_SHAPES.map((shapeType) => {
                          const isSelected = selectedPaletteShape === shapeType;
                          return (
                            <Tooltip key={shapeType} title={shapeType}>
                              <Button
                                type={isSelected ? "primary" : "default"}
                                size="small"
                                draggable={settings.editMode}
                                onClick={() =>
                                  setSelectedPaletteShape(shapeType)
                                }
                                onDoubleClick={() => {
                                  if (!settings.editMode) return;
                                  if (selectedPaletteShape !== shapeType)
                                    return;
                                  addKeyMapOfType(shapeType);
                                }}
                                onDragStart={(event) =>
                                  onPaletteDragStart(event, shapeType)
                                }
                                onDragEnd={onPaletteDragEnd}
                                disabled={!settings.editMode}
                              >
                                <Space size={4}>
                                  <PaletteShapeIcon shape={shapeType} />
                                  <span className="fm-capitalize">
                                    {shapeType}
                                  </span>
                                </Space>
                              </Button>
                            </Tooltip>
                          );
                        })}
                      </Space>
                      <Typography.Text type="secondary">
                        Drag a selected shape to the game canvas. Double-click
                        the selected shape to add it at the default position.
                      </Typography.Text>
                    </Space>
                  </Form.Item>

                  <Form.Item label="Theme">
                    <Segmented
                      options={[
                        { label: "Light", value: "light" },
                        { label: "Dark", value: "dark" },
                        { label: "System", value: "system" },
                      ]}
                      value={settings.theme}
                      onChange={handleThemeChange}
                    />
                  </Form.Item>

                  <Form.Item label="Strict Input Passthrough">
                    <Space direction="vertical" size={4} className="fm-w-full">
                      <Switch
                        checked={settings.strictPassthrough}
                        onChange={(checked) => {
                          setSettings((prev) => ({
                            ...prev,
                            strictPassthrough: checked,
                          }));
                        }}
                      />
                      <Typography.Text type="secondary">
                        When enabled, gameplay keys are fully passed through in
                        Stop mode unless they match mapper shortcuts.
                      </Typography.Text>
                    </Space>
                  </Form.Item>

                  <Form.Item label="Opacity">
                    <Slider
                      min={0.05}
                      max={1}
                      step={0.05}
                      value={draftShape.opacity}
                      disabled={!settings.editMode}
                      onChange={(value) => {
                        const nextOpacity = Number(value);
                        setDraftShape((prev) => ({
                          ...prev,
                          opacity: nextOpacity,
                        }));
                        setShapes((prev) =>
                          prev.map((shape) =>
                            normalizeShape({
                              ...shape,
                              opacity: nextOpacity,
                            }),
                          ),
                        );
                      }}
                    />
                  </Form.Item>

                  <Divider className="!fm-my-2" />
                  <Form.Item label="Share Key Maps">
                    <Space direction="vertical" size={6} className="fm-w-full">
                      <Space wrap>
                        <Button onClick={exportMappings}>
                          Copy Mapping JSON
                        </Button>
                        <Button onClick={() => setImportOpen(true)}>
                          Import Mapping JSON
                        </Button>
                      </Space>
                      <Typography.Text type="secondary">
                        Copy sends your current map setup to clipboard; import
                        loads a shared mapping JSON.
                      </Typography.Text>
                    </Space>
                  </Form.Item>

                  <Form.Item label="Add Key Map Shortcut">
                    <Space direction="vertical" size={4}>
                      <ShortcutKeys combo={settings.addKeyMapShortcut} />
                      <Input
                        className="fm-global-shortcut-input"
                        value={settings.addKeyMapShortcut}
                        placeholder="Press keys"
                        onKeyDown={(event) => {
                          captureGlobalShortcut(event, "addKeyMapShortcut");
                        }}
                      />
                      <Typography.Text type="secondary">
                        Default is Alt+Shift+A. Mapper toggle is fixed to
                        Alt+Shift+M.
                      </Typography.Text>
                    </Space>
                  </Form.Item>

                  <Form.Item label="Start/Stop Shortcut">
                    <Space direction="vertical" size={4} className="fm-w-full">
                      <ShortcutKeys combo={settings.toggleModeShortcut} />
                      <Input
                        className="fm-global-shortcut-input"
                        value={settings.toggleModeShortcut}
                        placeholder="Press keys"
                        onKeyDown={(event) => {
                          captureGlobalShortcut(event, "toggleModeShortcut");
                        }}
                      />
                    </Space>
                  </Form.Item>

                  <Form.Item label="Focus Canvas Shortcut">
                    <Space direction="vertical" size={4} className="fm-w-full">
                      <ShortcutKeys combo={settings.focusCanvasShortcut} />
                      <Input
                        className="fm-global-shortcut-input"
                        value={settings.focusCanvasShortcut}
                        placeholder="Press keys"
                        onKeyDown={(event) => {
                          captureGlobalShortcut(event, "focusCanvasShortcut");
                        }}
                      />
                    </Space>
                  </Form.Item>

                  <Form.Item label="Hide Shapes Shortcut">
                    <Space direction="vertical" size={4} className="fm-w-full">
                      <ShortcutKeys combo={settings.toggleShapesShortcut} />
                      <Input
                        className="fm-global-shortcut-input"
                        value={settings.toggleShapesShortcut}
                        placeholder="Press keys"
                        onKeyDown={(event) => {
                          captureGlobalShortcut(event, "toggleShapesShortcut");
                        }}
                      />
                    </Space>
                  </Form.Item>
                </Form>
              </Card>
            </Rnd>
          )}

          <Modal
            title="Import shared mappings"
            open={overlayVisible && importOpen && !isTransformingShape}
            onOk={applyImport}
            onCancel={() => {
              setImportOpen(false);
              setImportText("");
            }}
            okText="Import"
            cancelText="Close"
            footer={(_, { OkBtn, CancelBtn }) => (
              <Space style={{ width: "100%", justifyContent: "flex-end" }}>
                <OkBtn />
                <CancelBtn />
              </Space>
            )}
          >
            <Input.TextArea
              rows={8}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="Paste JSON copied from Copy Share JSON"
            />
          </Modal>
        </div>
      </App>
    </ConfigProvider>
  );
}

const mount = () => {
  if (document.getElementById(ROOT_ID)) return;

  const rootElement = document.createElement("div");
  rootElement.id = ROOT_ID;
  document.body.appendChild(rootElement);

  createRoot(rootElement).render(<MapperApp />);
};

mount();
