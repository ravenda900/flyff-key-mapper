import { App, ConfigProvider, Modal, theme } from "antd";
import "antd/dist/reset.css";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  getKeyboardBindingToken,
  matchesBinding,
  matchesBindingAction,
  recordBindingAction,
  stopAllToggleShapeAreas,
  stopToggleShapeArea,
  triggerShapeArea,
} from "./keybinding";
import {
  OVERLAY_SHORTCUT,
  ROOT_ID,
  buildShortcutFromEvent,
  createProfileId,
  createShape,
  getSystemDark,
  isGameplayMovementKey,
  isPointInsideShape,
  makeUniqueProfileName,
  normalizeShape,
} from "./key-mapping/constants";
import { MapperDialog } from "./key-mapping/features/MapperDialog";
import { ShapeOverlay } from "./key-mapping/features/ShapeOverlay";
import {
  duplicateClipboardShapes,
  getClipboardShapes,
  isClipboardShortcut,
} from "./key-mapping/shapeClipboard";
import { getReservedShapeShortcutUsage } from "./key-mapping/shortcutBinding";
import { ImportMappingsModal } from "./key-mapping/modals/ImportMappingsModal";
import { ProfileNameModal } from "./key-mapping/modals/ProfileNameModal";
import { DEFAULT_SETTINGS, storage } from "./storage";
import "./styles.css";
import type {
  DialogRect,
  MappingProfile,
  MapperSettings,
  ShapeMapping,
  ShapeType,
  ThemeMode,
} from "./types";

const DEFAULT_DIALOG_RECT: DialogRect = {
  x: 40,
  y: 80,
  width: 420,
  height: 540,
};

type DeletedShapeEntry = {
  shape: ShapeMapping;
  index: number;
};

type DeletedShapesAction = {
  entries: DeletedShapeEntry[];
};

function MapperApp() {
  const [modal, modalContextHolder] = Modal.useModal();
  const initialProfilesState = useMemo(() => storage.loadProfiles(), []);
  const initialUiState = useMemo(() => storage.loadUiState(), []);
  const [settings, setSettings] = useState<MapperSettings>(() => {
    const activeProfile = initialProfilesState.profiles.find(
      (profile) => profile.id === initialProfilesState.activeProfileId,
    );

    return (
      activeProfile?.settings ??
      initialProfilesState.profiles[0]?.settings ??
      storage.loadSettings()
    );
  });
  const [profiles, setProfiles] = useState<MappingProfile[]>(
    initialProfilesState.profiles,
  );
  const [activeProfileId, setActiveProfileId] = useState<string>(
    initialProfilesState.activeProfileId,
  );
  const [selectedProfileId, setSelectedProfileId] = useState<string>(
    initialProfilesState.activeProfileId,
  );
  const [shapes, setShapes] = useState<ShapeMapping[]>(() => {
    const activeProfile = initialProfilesState.profiles.find(
      (profile) => profile.id === initialProfilesState.activeProfileId,
    );
    return (
      activeProfile?.shapes ?? initialProfilesState.profiles[0]?.shapes ?? []
    );
  });
  const [overlayVisible, setOverlayVisible] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [draftShape, setDraftShape] = useState<ShapeMapping>(() =>
    normalizeShape({
      ...createShape("rectangle"),
      opacity: shapes[0]?.opacity ?? 1,
    }),
  );
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [pendingImportText, setPendingImportText] = useState("");
  const [profileNameDialogOpen, setProfileNameDialogOpen] = useState(false);
  const [profileNameDialogMode, setProfileNameDialogMode] = useState<
    "create" | "rename" | "import"
  >("rename");
  const [profileNameInput, setProfileNameInput] = useState("");
  const [profileNameError, setProfileNameError] = useState("");
  const [activeProfileName, setActiveProfileName] = useState(() => {
    const activeProfile = initialProfilesState.profiles.find(
      (profile) => profile.id === initialProfilesState.activeProfileId,
    );
    return activeProfile?.name ?? "";
  });
  const [copiedShapes, setCopiedShapes] = useState<ShapeMapping[]>([]);
  const [isTransformingShape, setIsTransformingShape] = useState(false);
  const [shapesVisible, setShapesVisible] = useState(true);
  const [runningTooltip, setRunningTooltip] = useState<{
    x: number;
    y: number;
    keyBinding: string;
  } | null>(null);
  const [selectedPaletteShape, setSelectedPaletteShape] = useState<ShapeType>(
    initialUiState.selectedPaletteShape,
  );
  const [dialogRect, setDialogRect] = useState<DialogRect>(
    initialUiState.dialogRect,
  );

  const rotateIdRef = useRef<string | null>(null);
  const previousBodyCursorRef = useRef<string | null>(null);
  const previousCanvasPointerEventsRef = useRef<string | null>(null);
  const latestShapesRef = useRef<ShapeMapping[]>(shapes);
  const latestSettingsRef = useRef<MapperSettings>(settings);
  const latestProfilesRef = useRef<MappingProfile[]>(profiles);
  const previousActiveProfileIdRef = useRef(activeProfileId);
  const isSwitchingProfileRef = useRef(false);
  const previousShapeIdsRef = useRef<Set<string>>(new Set());
  const shapeBindingHistoryRef = useRef<
    Array<{ token: string; timestamp: number }>
  >([]);
  const rightClickTrackerRef = useRef(0);
  const selectedPaletteShapeRef = useRef<ShapeType>(selectedPaletteShape);
  const deletedUndoStackRef = useRef<DeletedShapesAction[]>([]);
  const deletedRedoStackRef = useRef<DeletedShapesAction[]>([]);

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) ?? null,
    [activeProfileId, profiles],
  );

  const selectedShape = useMemo(
    () => shapes.find((shape) => shape.id === selectedId) ?? null,
    [selectedId, shapes],
  );

  const selectSingleShape = useCallback((id: string | null) => {
    setSelectedId(id);
    setSelectedIds(id ? [id] : []);
  }, []);

  const toggleShapeSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((item) => item !== id) : [...prev, id];
      setSelectedId(next.length > 0 ? next[next.length - 1] : null);
      return next;
    });
  }, []);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [profiles, selectedProfileId],
  );

  const appliedTheme = useMemo(() => {
    if (settings.theme === "system") return getSystemDark() ? "dark" : "light";
    return settings.theme;
  }, [settings.theme]);

  const importAnalysis = useMemo(() => {
    const raw = importText.trim();
    if (!raw) {
      return {
        isValidJson: false,
        hasImportData: false,
        profileCount: 0,
        missingNameCount: 0,
        parseError: "Paste mapping JSON to import.",
      };
    }

    try {
      const parsed = JSON.parse(raw) as {
        profileName?: string;
        shapes?: ShapeMapping[];
        profiles?: Array<{ name?: string; shapes?: ShapeMapping[] }>;
      };

      let profileCount = 0;
      let missingNameCount = 0;

      if (Array.isArray(parsed.profiles)) {
        parsed.profiles.forEach((profile) => {
          if (!Array.isArray(profile.shapes)) {
            return;
          }
          profileCount += 1;
          if (
            !(
              typeof profile.name === "string" && profile.name.trim().length > 0
            )
          ) {
            missingNameCount += 1;
          }
        });
      }

      if (Array.isArray(parsed.shapes)) {
        profileCount += 1;
        if (
          !(
            typeof parsed.profileName === "string" &&
            parsed.profileName.trim().length > 0
          )
        ) {
          missingNameCount += 1;
        }
      }

      return {
        isValidJson: true,
        hasImportData: profileCount > 0,
        profileCount,
        missingNameCount,
        parseError: "",
      };
    } catch {
      return {
        isValidJson: false,
        hasImportData: false,
        profileCount: 0,
        missingNameCount: 0,
        parseError: "Invalid JSON format.",
      };
    }
  }, [importText]);

  const canImportNow =
    importAnalysis.isValidJson && importAnalysis.hasImportData;

  useEffect(() => {
    latestShapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    const currentShapeIds = new Set(shapes.map((shape) => shape.id));
    previousShapeIdsRef.current.forEach((shapeId) => {
      if (!currentShapeIds.has(shapeId)) {
        stopToggleShapeArea(shapeId);
      }
    });
    previousShapeIdsRef.current = currentShapeIds;
  }, [shapes]);

  useEffect(() => {
    return () => {
      stopAllToggleShapeAreas();
    };
  }, []);

  useEffect(() => {
    if (!activeProfileId || isSwitchingProfileRef.current) {
      return;
    }

    setProfiles((prev) =>
      prev.map((profile) => {
        if (profile.id !== activeProfileId) {
          return profile;
        }

        const nextName = activeProfileName.trim() || profile.name;
        const sameName = profile.name === nextName;
        const sameShapes =
          JSON.stringify(profile.shapes) === JSON.stringify(shapes);
        const sameSettings =
          JSON.stringify(profile.settings) === JSON.stringify(settings);

        if (sameName && sameShapes && sameSettings) {
          return profile;
        }

        return {
          ...profile,
          name: nextName,
          shapes,
          settings,
        };
      }),
    );
  }, [activeProfileId, activeProfileName, settings, shapes]);

  useEffect(() => {
    latestProfilesRef.current = profiles;
    storage.saveProfiles({
      activeProfileId,
      profiles,
    });
  }, [activeProfileId, profiles]);

  useEffect(() => {
    if (profiles.length === 0) {
      if (activeProfileId !== "") {
        setActiveProfileId("");
      }
      if (selectedProfileId !== "") {
        setSelectedProfileId("");
      }
      return;
    }

    if (!profiles.some((profile) => profile.id === activeProfileId)) {
      setActiveProfileId(profiles[0].id);
    }

    if (!profiles.some((profile) => profile.id === selectedProfileId)) {
      setSelectedProfileId(profiles[0].id);
    }
  }, [activeProfileId, profiles, selectedProfileId, settings]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (selectedId === null) {
        return prev.length === 0 ? prev : [];
      }

      if (prev.includes(selectedId)) {
        return prev;
      }

      return [selectedId];
    });
  }, [selectedId]);

  useEffect(() => {
    const shapeIdSet = new Set(shapes.map((shape) => shape.id));
    setSelectedIds((prev) => prev.filter((id) => shapeIdSet.has(id)));
  }, [shapes]);

  useEffect(() => {
    if (selectedId && !selectedIds.includes(selectedId)) {
      setSelectedId(
        selectedIds.length > 0 ? selectedIds[selectedIds.length - 1] : null,
      );
    }
  }, [selectedId, selectedIds]);

  useEffect(() => {
    if (previousActiveProfileIdRef.current === activeProfileId) {
      return;
    }

    previousActiveProfileIdRef.current = activeProfileId;
    const nextActiveProfile =
      profiles.find((profile) => profile.id === activeProfileId) ?? null;
    if (!nextActiveProfile) {
      isSwitchingProfileRef.current = false;
      return;
    }

    setShapes(nextActiveProfile.shapes);
    setSettings(nextActiveProfile.settings);
    setActiveProfileName(nextActiveProfile.name);
    selectSingleShape(null);
    setCopiedShapes([]);
    setIsTransformingShape(false);
    setSelectedProfileId(activeProfileId);
    isSwitchingProfileRef.current = false;
  }, [activeProfileId, profiles, selectSingleShape]);

  useEffect(() => {
    latestSettingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    selectedPaletteShapeRef.current = selectedPaletteShape;
  }, [selectedPaletteShape]);

  useEffect(() => {
    storage.saveUiState({
      selectedPaletteShape,
      dialogRect,
    });
  }, [dialogRect, selectedPaletteShape]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSettings((prev) => ({ ...prev }));
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (settings.editMode) return;
    selectSingleShape(null);
  }, [settings.editMode, selectSingleShape]);

  useEffect(() => {
    if (settings.editMode) {
      stopAllToggleShapeAreas();
    }
  }, [settings.editMode]);

  useEffect(() => {
    const blockMetaKey = (event: KeyboardEvent) => {
      if (
        event.key === "Meta" ||
        event.code === "MetaLeft" ||
        event.code === "MetaRight"
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("keydown", blockMetaKey, { capture: true });
    window.addEventListener("keyup", blockMetaKey, { capture: true });
    return () => {
      window.removeEventListener("keydown", blockMetaKey, { capture: true });
      window.removeEventListener("keyup", blockMetaKey, { capture: true });
    };
  }, []);

  const focusGameCanvas = useCallback(() => {
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
  }, []);

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
  }, [
    focusGameCanvas,
    selectSingleShape,
    selectedIds.length,
    settings.editMode,
  ]);

  useEffect(() => {
    const SEQUENCE_COMPLETION_WINDOW_MS = 350;
    let isReplayingPendingKey = false;

    let pendingSequencePassThrough: {
      timerId: number;
      token: string;
      key: string;
      code: string;
      ctrlKey: boolean;
      altKey: boolean;
      shiftKey: boolean;
      metaKey: boolean;
      timestamp: number;
    } | null = null;

    const dispatchPendingKeyToCanvas = () => {
      if (!pendingSequencePassThrough) {
        return;
      }

      const pending = pendingSequencePassThrough;
      pendingSequencePassThrough = null;

      for (
        let index = shapeBindingHistoryRef.current.length - 1;
        index >= 0;
        index -= 1
      ) {
        const item = shapeBindingHistoryRef.current[index];
        if (
          item.token === pending.token &&
          Math.abs(item.timestamp - pending.timestamp) <= 1000
        ) {
          shapeBindingHistoryRef.current.splice(index, 1);
          break;
        }
      }

      const target =
        (document.querySelector("canvas") as HTMLElement | null) ??
        (document.activeElement as HTMLElement | null) ??
        window;

      const eventInit: KeyboardEventInit = {
        key: pending.key,
        code: pending.code,
        ctrlKey: pending.ctrlKey,
        altKey: pending.altKey,
        shiftKey: pending.shiftKey,
        metaKey: pending.metaKey,
        bubbles: true,
        cancelable: true,
      };

      isReplayingPendingKey = true;
      try {
        target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
        target.dispatchEvent(new KeyboardEvent("keyup", eventInit));
      } finally {
        isReplayingPendingKey = false;
      }
    };

    const clearPendingSequencePassThrough = () => {
      if (!pendingSequencePassThrough) {
        return;
      }

      window.clearTimeout(pendingSequencePassThrough.timerId);
      pendingSequencePassThrough = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isReplayingPendingKey && !event.isTrusted) {
        return;
      }

      const isInputTarget =
        (event.target as HTMLElement | null)?.tagName === "INPUT";

      const keyToken = getKeyboardBindingToken(event);
      const hasPotentialMovementBinding = shapes.some((shape) => {
        if (!shape.keyBinding) {
          return false;
        }

        const bindingParts = shape.keyBinding
          .split("+")
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean);
        const hasModifier = bindingParts.some((part) =>
          [
            "ctrl",
            "control",
            "alt",
            "shift",
            "meta",
            "cmd",
            "command",
          ].includes(part),
        );

        if (hasModifier) {
          return false;
        }

        return bindingParts.includes(keyToken);
      });

      const hasPotentialSingleStepBinding = shapes.some((shape) => {
        if (
          !shape.keyBinding ||
          getReservedShapeShortcutUsage(shape.keyBinding, settings)
        ) {
          return false;
        }

        const bindingParts = shape.keyBinding
          .split("+")
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean);

        const modifiers = {
          ctrl:
            bindingParts.includes("ctrl") || bindingParts.includes("control"),
          alt: bindingParts.includes("alt"),
          shift: bindingParts.includes("shift"),
          meta:
            bindingParts.includes("meta") ||
            bindingParts.includes("cmd") ||
            bindingParts.includes("command"),
        };

        const steps = bindingParts.filter(
          (part) =>
            ![
              "ctrl",
              "control",
              "alt",
              "shift",
              "meta",
              "cmd",
              "command",
            ].includes(part),
        );

        return (
          steps.length === 1 &&
          steps[0] === keyToken &&
          event.ctrlKey === modifiers.ctrl &&
          event.altKey === modifiers.alt &&
          event.shiftKey === modifiers.shift &&
          event.metaKey === modifiers.meta
        );
      });

      const hasPotentialSequenceStartBinding = shapes.some((shape) => {
        if (
          !shape.keyBinding ||
          getReservedShapeShortcutUsage(shape.keyBinding, settings)
        ) {
          return false;
        }

        const bindingParts = shape.keyBinding
          .split("+")
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean);

        const modifiers = {
          ctrl:
            bindingParts.includes("ctrl") || bindingParts.includes("control"),
          alt: bindingParts.includes("alt"),
          shift: bindingParts.includes("shift"),
          meta:
            bindingParts.includes("meta") ||
            bindingParts.includes("cmd") ||
            bindingParts.includes("command"),
        };

        const steps = bindingParts.filter(
          (part) =>
            ![
              "ctrl",
              "control",
              "alt",
              "shift",
              "meta",
              "cmd",
              "command",
            ].includes(part),
        );

        return (
          steps.length > 1 &&
          steps[0] === keyToken &&
          event.ctrlKey === modifiers.ctrl &&
          event.altKey === modifiers.alt &&
          event.shiftKey === modifiers.shift &&
          event.metaKey === modifiers.meta
        );
      });

      const shouldPassThroughGameplayMovement =
        !settings.editMode &&
        !isInputTarget &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.metaKey &&
        isGameplayMovementKey(event.key);

      if (shouldPassThroughGameplayMovement && !hasPotentialMovementBinding) {
        return;
      }

      if (shouldPassThroughGameplayMovement && hasPotentialMovementBinding) {
        event.preventDefault();
        event.stopPropagation();
      }

      const shouldDelaySequenceStartKey =
        !settings.editMode &&
        !isInputTarget &&
        !event.repeat &&
        hasPotentialSequenceStartBinding &&
        !hasPotentialSingleStepBinding;

      if (shouldDelaySequenceStartKey && !pendingSequencePassThrough) {
        event.preventDefault();
        event.stopPropagation();

        const timestamp = Date.now();
        pendingSequencePassThrough = {
          timerId: window.setTimeout(() => {
            dispatchPendingKeyToCanvas();
          }, SEQUENCE_COMPLETION_WINDOW_MS),
          token: keyToken,
          key: event.key,
          code: event.code,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          metaKey: event.metaKey,
          timestamp,
        };
      }

      const isToggleOverlay = matchesBinding(event, OVERLAY_SHORTCUT);
      const isToggleMode = matchesBinding(event, settings.toggleModeShortcut);
      const isFocusCanvas = matchesBinding(event, settings.focusCanvasShortcut);
      const isToggleShapes = matchesBinding(
        event,
        settings.toggleShapesShortcut,
      );
      const isSetZeroOpacity = matchesBinding(
        event,
        settings.setZeroOpacityShortcut,
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

      if (!isInputTarget && isSetZeroOpacity && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();

        const allAtZero = shapes.every((shape) => shape.opacity <= 0.05);
        const nextOpacity = allAtZero ? 1 : 0;

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
        return;
      }

      if (!isInputTarget && isAddKeyMapShortcut && !event.repeat) {
        event.preventDefault();
        event.stopPropagation();
        const base = createShape(selectedPaletteShapeRef.current);
        const newShape = normalizeShape({
          ...base,
          opacity: draftShape.opacity,
        });
        setShapes((prev) => [...prev, newShape]);
        setSelectedId(newShape.id);
        return;
      }

      if (!settings.editMode && !shapesVisible) {
        return;
      }

      if (!settings.editMode && settings.strictPassthrough) {
        if (isInputTarget) {
          return;
        }

        recordBindingAction(shapeBindingHistoryRef.current, keyToken);

        const hitAreas = shapes.filter(
          (shape) =>
            shape.keyBinding &&
            !getReservedShapeShortcutUsage(shape.keyBinding, settings) &&
            matchesBindingAction(
              shape.keyBinding,
              {
                ctrlKey: event.ctrlKey,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                metaKey: event.metaKey,
              },
              shapeBindingHistoryRef.current,
            ),
        );

        if (hitAreas.length > 0) {
          clearPendingSequencePassThrough();
          event.preventDefault();
          event.stopPropagation();

          if (event.repeat) {
            return;
          }

          hitAreas.forEach((shape) => {
            triggerShapeArea(shape, undefined, { delayMs: shape.delayMs });
          });
        }

        return;
      }

      if (!overlayVisible) return;

      if (event.key === "Escape") {
        if (selectedShape) {
          event.preventDefault();
          event.stopPropagation();
          setSelectedId(null);
          (document.activeElement as HTMLElement | null)?.blur();
          return;
        }

        if (dialogVisible) {
          event.preventDefault();
          event.stopPropagation();
          attemptCloseDialog();
          return;
        }
      }

      if (
        settings.editMode &&
        selectedIds.length > 0 &&
        event.key === "Delete"
      ) {
        event.preventDefault();
        event.stopPropagation();
        deleteShapeIds(selectedIds);
        return;
      }

      if (isInputTarget) {
        return;
      }

      if (settings.editMode) {
        const isSelectAllShortcut =
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          !event.altKey &&
          event.key.toLowerCase() === "a";

        if (isSelectAllShortcut) {
          event.preventDefault();
          event.stopPropagation();
          if (shapes.length === 0) {
            selectSingleShape(null);
            return;
          }

          const allIds = shapes.map((shape) => shape.id);
          setSelectedIds(allIds);
          setSelectedId(allIds[allIds.length - 1]);
          return;
        }

        const isUndoShortcut =
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          !event.altKey &&
          event.key.toLowerCase() === "z";

        if (isUndoShortcut) {
          event.preventDefault();
          event.stopPropagation();
          undoDeletedShapes();
          return;
        }

        const isRedoShortcut =
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          ((event.shiftKey && event.key.toLowerCase() === "z") ||
            (!event.shiftKey && event.key.toLowerCase() === "y"));

        if (isRedoShortcut) {
          event.preventDefault();
          event.stopPropagation();
          redoDeletedShapes();
          return;
        }
      }

      if (settings.editMode) {
        const selectedShapesForClipboard = getClipboardShapes(
          shapes,
          selectedIds,
          selectedShape,
        );

        const isCopy = isClipboardShortcut(event, "copy");
        if (isCopy) {
          event.preventDefault();
          event.stopPropagation();
          copyShapeIds(selectedShapesForClipboard.map((shape) => shape.id));
          return;
        }

        const isCut = isClipboardShortcut(event, "cut");
        if (isCut && selectedShapesForClipboard.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          cutShapeIds(selectedShapesForClipboard.map((shape) => shape.id));
          return;
        }

        const isPaste = isClipboardShortcut(event, "paste");
        if (isPaste && copiedShapes.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          pasteCopiedShapesAt();
          return;
        }

        if (!selectedShape) {
          return;
        }
      }

      if (!settings.editMode) {
        recordBindingAction(shapeBindingHistoryRef.current, keyToken);

        const hitAreas = shapes.filter(
          (shape) =>
            shape.keyBinding &&
            !getReservedShapeShortcutUsage(shape.keyBinding, settings) &&
            matchesBindingAction(
              shape.keyBinding,
              {
                ctrlKey: event.ctrlKey,
                altKey: event.altKey,
                shiftKey: event.shiftKey,
                metaKey: event.metaKey,
              },
              shapeBindingHistoryRef.current,
            ),
        );
        if (hitAreas.length > 0) {
          clearPendingSequencePassThrough();
          event.preventDefault();
          event.stopPropagation();

          if (event.repeat) {
            return;
          }

          hitAreas.forEach((shape) => {
            triggerShapeArea(shape, undefined, { delayMs: shape.delayMs });
          });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      clearPendingSequencePassThrough();
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [
    copiedShapes,
    copyShapeIds,
    cutShapeIds,
    deleteShapeIds,
    draftShape.opacity,
    dialogVisible,
    overlayVisible,
    selectedShape,
    selectedIds,
    settings.addKeyMapShortcut,
    settings.editMode,
    settings.focusCanvasShortcut,
    settings.strictPassthrough,
    settings.setZeroOpacityShortcut,
    settings.toggleModeShortcut,
    settings.toggleShapesShortcut,
    shapes,
    shapesVisible,
    selectSingleShape,
    undoDeletedShapes,
    redoDeletedShapes,
    pasteCopiedShapesAt,
  ]);

  useEffect(() => {
    if (settings.editMode || !shapesVisible) {
      return;
    }

    const CLICK_COMPLETION_WINDOW_MS = 350;

    let pendingPointerPassThrough: {
      timerId: number;
      token: "left click" | "right click";
      clientX: number;
      clientY: number;
      ctrlKey: boolean;
      altKey: boolean;
      shiftKey: boolean;
      metaKey: boolean;
      timestamp: number;
    } | null = null;

    const clearPendingPointerPassThrough = () => {
      if (!pendingPointerPassThrough) {
        return;
      }

      window.clearTimeout(pendingPointerPassThrough.timerId);
      pendingPointerPassThrough = null;
    };

    const dispatchPendingPointerToCanvas = () => {
      if (!pendingPointerPassThrough) {
        return;
      }

      const pending = pendingPointerPassThrough;
      pendingPointerPassThrough = null;

      for (
        let index = shapeBindingHistoryRef.current.length - 1;
        index >= 0;
        index -= 1
      ) {
        const item = shapeBindingHistoryRef.current[index];
        if (
          item.token === pending.token &&
          Math.abs(item.timestamp - pending.timestamp) <= 1000
        ) {
          shapeBindingHistoryRef.current.splice(index, 1);
          break;
        }
      }

      const overlayRoot = document.getElementById(ROOT_ID);
      const previousOverlayPointerEvents = overlayRoot?.style.pointerEvents;

      if (overlayRoot) {
        overlayRoot.style.pointerEvents = "none";
      }

      const hit = document.elementFromPoint(
        pending.clientX,
        pending.clientY,
      ) as HTMLElement | null;

      if (overlayRoot) {
        overlayRoot.style.pointerEvents = previousOverlayPointerEvents ?? "";
      }

      const target =
        (hit && !hit.closest(`#${ROOT_ID}`) ? hit : null) ??
        (document.querySelector("canvas") as HTMLElement | null);

      if (!target) {
        return;
      }

      const isRightClick = pending.token === "right click";
      const button = isRightClick ? 2 : 0;
      const commonEventInit: MouseEventInit = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: pending.clientX,
        clientY: pending.clientY,
        button,
        ctrlKey: pending.ctrlKey,
        altKey: pending.altKey,
        shiftKey: pending.shiftKey,
        metaKey: pending.metaKey,
      };

      ["pointerdown", "mousedown", "mouseup"].forEach((eventName) => {
        target.dispatchEvent(new MouseEvent(eventName, commonEventInit));
      });

      target.dispatchEvent(
        new MouseEvent(isRightClick ? "contextmenu" : "click", commonEventInit),
      );
    };

    const hasPointerBinding = (
      token:
        | "left click"
        | "right click"
        | "double left click"
        | "double right click",
      action: {
        ctrlKey: boolean;
        altKey: boolean;
        shiftKey: boolean;
        metaKey: boolean;
      },
    ) => {
      return shapes.some((shape) => {
        if (
          !shape.keyBinding ||
          getReservedShapeShortcutUsage(shape.keyBinding, settings)
        ) {
          return false;
        }

        const bindingParts = shape.keyBinding
          .split("+")
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean);

        const modifiers = {
          ctrl:
            bindingParts.includes("ctrl") || bindingParts.includes("control"),
          alt: bindingParts.includes("alt"),
          shift: bindingParts.includes("shift"),
          meta:
            bindingParts.includes("meta") ||
            bindingParts.includes("cmd") ||
            bindingParts.includes("command"),
        };

        const steps = bindingParts.filter(
          (part) =>
            ![
              "ctrl",
              "control",
              "alt",
              "shift",
              "meta",
              "cmd",
              "command",
            ].includes(part),
        );

        return (
          steps.length === 1 &&
          steps[0] === token &&
          action.ctrlKey === modifiers.ctrl &&
          action.altKey === modifiers.alt &&
          action.shiftKey === modifiers.shift &&
          action.metaKey === modifiers.meta
        );
      });
    };

    const triggerShapesFromAction = (
      token: string,
      event: {
        clientX?: number;
        clientY?: number;
        ctrlKey: boolean;
        altKey: boolean;
        shiftKey: boolean;
        metaKey: boolean;
        deltaY?: number;
        cancelable?: boolean;
        preventDefault: () => void;
        stopPropagation: () => void;
      },
    ) => {
      const pointerToken = token.toLowerCase();
      const shouldDelaySingleClickPassThrough =
        (pointerToken === "left click" || pointerToken === "right click") &&
        hasPointerBinding(
          pointerToken === "left click"
            ? "double left click"
            : "double right click",
          {
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
          },
        ) &&
        !hasPointerBinding(
          pointerToken === "left click" ? "left click" : "right click",
          {
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
          },
        );

      recordBindingAction(shapeBindingHistoryRef.current, token);

      if (shouldDelaySingleClickPassThrough) {
        if (event.cancelable) {
          event.preventDefault();
        }
        event.stopPropagation();

        if (
          !pendingPointerPassThrough &&
          typeof event.clientX === "number" &&
          typeof event.clientY === "number"
        ) {
          const timestamp = Date.now();
          pendingPointerPassThrough = {
            timerId: window.setTimeout(() => {
              dispatchPendingPointerToCanvas();
            }, CLICK_COMPLETION_WINDOW_MS),
            token: pointerToken === "left click" ? "left click" : "right click",
            clientX: event.clientX,
            clientY: event.clientY,
            ctrlKey: event.ctrlKey,
            altKey: event.altKey,
            shiftKey: event.shiftKey,
            metaKey: event.metaKey,
            timestamp,
          };
        }

        return;
      }

      const hitAreas = shapes.filter(
        (shape) =>
          shape.keyBinding &&
          !getReservedShapeShortcutUsage(shape.keyBinding, settings) &&
          matchesBindingAction(
            shape.keyBinding,
            {
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              metaKey: event.metaKey,
            },
            shapeBindingHistoryRef.current,
          ),
      );

      if (hitAreas.length === 0) {
        return;
      }

      clearPendingPointerPassThrough();

      const isWheelEvent = typeof event.deltaY === "number";
      if (!isWheelEvent && event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      hitAreas.forEach((shape) => {
        triggerShapeArea(shape, undefined, { delayMs: shape.delayMs });
      });
    };

    const onMouseDown = (event: MouseEvent) => {
      const targetTag = (event.target as HTMLElement | null)?.tagName;
      if (targetTag === "INPUT" || targetTag === "TEXTAREA") {
        return;
      }

      if (event.button === 0) {
        triggerShapesFromAction("left click", event);
      }
    };

    const onDblClick = (event: MouseEvent) => {
      triggerShapesFromAction("double left click", event);
    };

    const onContextMenu = (event: MouseEvent) => {
      const now = Date.now();
      const isDoubleRightClick = now - rightClickTrackerRef.current < 360;
      rightClickTrackerRef.current = now;

      triggerShapesFromAction(
        isDoubleRightClick ? "double right click" : "right click",
        event,
      );
    };

    const onWheel = (event: WheelEvent) => {
      const token = event.deltaY < 0 ? "wheel up" : "wheel down";
      triggerShapesFromAction(token, event);
    };

    window.addEventListener("mousedown", onMouseDown, { capture: true });
    window.addEventListener("dblclick", onDblClick, { capture: true });
    window.addEventListener("contextmenu", onContextMenu, { capture: true });
    window.addEventListener("wheel", onWheel, {
      capture: true,
      passive: false,
    });

    return () => {
      clearPendingPointerPassThrough();
      window.removeEventListener("mousedown", onMouseDown, { capture: true });
      window.removeEventListener("dblclick", onDblClick, { capture: true });
      window.removeEventListener("contextmenu", onContextMenu, {
        capture: true,
      });
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [settings.editMode, shapes, shapesVisible]);

  const captureGlobalShortcut = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    field:
      | "addKeyMapShortcut"
      | "toggleModeShortcut"
      | "focusCanvasShortcut"
      | "toggleShapesShortcut"
      | "setZeroOpacityShortcut",
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
          const rawRotation = (rad * 180) / Math.PI + 90;
          const rotation = event.shiftKey
            ? Math.round(rawRotation / 15) * 15
            : rawRotation;
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
    const canvas = document.querySelector("canvas") as HTMLElement | null;
    if (!canvas) {
      return;
    }

    if (settings.editMode && isTransformingShape) {
      if (previousCanvasPointerEventsRef.current === null) {
        previousCanvasPointerEventsRef.current = canvas.style.pointerEvents;
      }
      canvas.style.pointerEvents = "none";
      return;
    }

    if (previousCanvasPointerEventsRef.current !== null) {
      canvas.style.pointerEvents = previousCanvasPointerEventsRef.current;
      previousCanvasPointerEventsRef.current = null;
    }

    return () => {
      if (previousCanvasPointerEventsRef.current !== null) {
        canvas.style.pointerEvents = previousCanvasPointerEventsRef.current;
        previousCanvasPointerEventsRef.current = null;
      }
    };
  }, [isTransformingShape, settings.editMode]);

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
            isPointInsideShape(shape, event.clientX, event.clientY),
        );

      if (!hit) {
        setRunningTooltip(null);
        return;
      }

      const viewportPadding = 10;
      const edgeOffset = 8;
      const tooltipWidthEstimate = Math.min(
        260,
        Math.max(120, hit.keyBinding.length * 9 + 36),
      );
      const tooltipHeightEstimate = 32;

      const preferRightX = hit.x + hit.width + edgeOffset;
      const rawX = preferRightX;
      const rawY =
        hit.y + hit.height / 2 - tooltipHeightEstimate / 2 + edgeOffset;

      const x = Math.max(
        viewportPadding,
        Math.min(
          rawX,
          window.innerWidth - tooltipWidthEstimate - viewportPadding,
        ),
      );
      const y = Math.max(
        viewportPadding,
        Math.min(
          rawY,
          window.innerHeight - tooltipHeightEstimate - viewportPadding,
        ),
      );

      setRunningTooltip({
        x,
        y,
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

      if (
        settings.editMode &&
        selectedIds.length > 0 &&
        event.button === 0 &&
        !target?.closest(".fm-shape") &&
        !target?.closest(".fm-shape-context-menu")
      ) {
        selectSingleShape(null);
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
  }, [
    focusGameCanvas,
    selectSingleShape,
    selectedIds.length,
    settings.editMode,
  ]);

  const makeDraftedShape = useCallback(
    (
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
    },
    [draftShape.opacity],
  );

  const addKeyMapOfType = useCallback(
    (shapeType: ShapeType, point?: { x: number; y: number }) => {
      const newShape = makeDraftedShape(shapeType, point);
      setShapes((prev) => [...prev, newShape]);
      selectSingleShape(newShape.id);
    },
    [makeDraftedShape, selectSingleShape],
  );

  const addKeyMap = useCallback(() => {
    addKeyMapOfType(selectedPaletteShape);
  }, [addKeyMapOfType, selectedPaletteShape]);

  const openProfileNameDialog = (
    mode: "create" | "rename" | "import",
    initialName: string,
  ) => {
    setProfileNameDialogMode(mode);
    setProfileNameInput(initialName);
    setProfileNameError("");
    setProfileNameDialogOpen(true);
  };

  const closeProfileNameDialog = () => {
    setProfileNameDialogOpen(false);
    setProfileNameError("");
  };

  const validateProfileName = (
    rawName: string,
    excludeProfileId?: string,
  ): string | null => {
    const trimmed = rawName.trim();
    if (!trimmed) {
      return "Profile name is required.";
    }

    const hasConflict = profiles.some(
      (profile) =>
        profile.id !== excludeProfileId &&
        profile.name.toLowerCase() === trimmed.toLowerCase(),
    );

    if (hasConflict) {
      return "Profile name already exists. Please choose a unique name.";
    }

    return null;
  };

  const switchProfileImmediately = (nextProfileId: string) => {
    stopAllToggleShapeAreas();
    isSwitchingProfileRef.current = true;
    setActiveProfileId(nextProfileId);
    setSelectedProfileId(nextProfileId);
  };

  const requestProfileSwitch = (nextProfileId: string) => {
    if (nextProfileId === activeProfileId) {
      return;
    }

    switchProfileImmediately(nextProfileId);
  };

  const attemptCloseDialog = () => {
    setDialogVisible(false);
  };

  function deleteShapeIds(ids: string[]) {
    const targetIds = Array.from(new Set(ids));
    if (targetIds.length === 0) {
      return;
    }

    targetIds.forEach((id) => stopToggleShapeArea(id));

    setShapes((prev) => {
      const indexById = new Map(prev.map((shape, index) => [shape.id, index]));
      const deletedEntries = targetIds
        .map((id) => {
          const shape = prev.find((item) => item.id === id);
          const index = indexById.get(id);
          if (!shape || index === undefined) {
            return null;
          }

          return {
            shape,
            index,
          };
        })
        .filter((entry): entry is DeletedShapeEntry => entry !== null);

      if (deletedEntries.length > 0) {
        deletedUndoStackRef.current.push({ entries: deletedEntries });
        deletedRedoStackRef.current = [];
      }

      return prev.filter((shape) => !targetIds.includes(shape.id));
    });

    setSelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
    setSelectedId((prev) => (prev && targetIds.includes(prev) ? null : prev));
  }

  const removeShape = (id: string) => {
    deleteShapeIds([id]);
  };

  function undoDeletedShapes() {
    const action = deletedUndoStackRef.current.pop();
    if (!action) {
      return;
    }

    deletedRedoStackRef.current.push(action);

    setShapes((prev) => {
      const next = [...prev];
      const sortedEntries = [...action.entries].sort(
        (a, b) => a.index - b.index,
      );

      sortedEntries.forEach((entry) => {
        if (next.some((shape) => shape.id === entry.shape.id)) {
          return;
        }

        const insertionIndex = Math.min(Math.max(entry.index, 0), next.length);
        next.splice(insertionIndex, 0, entry.shape);
      });

      return next;
    });

    const restoredIds = action.entries.map((entry) => entry.shape.id);
    setSelectedIds(restoredIds);
    setSelectedId(restoredIds[restoredIds.length - 1] ?? null);
  }

  function redoDeletedShapes() {
    const action = deletedRedoStackRef.current.pop();
    if (!action) {
      return;
    }

    deletedUndoStackRef.current.push(action);

    const targetIds = action.entries.map((entry) => entry.shape.id);
    targetIds.forEach((id) => stopToggleShapeArea(id));

    setShapes((prev) => prev.filter((shape) => !targetIds.includes(shape.id)));
    setSelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
    setSelectedId((prev) => (prev && targetIds.includes(prev) ? null : prev));
  }

  function copyShapeIds(ids: string[]) {
    if (ids.length === 0) {
      return;
    }

    const idSet = new Set(ids);
    const clipboardShapes = shapes.filter((shape) => idSet.has(shape.id));
    setCopiedShapes(clipboardShapes);
  }

  function cutShapeIds(ids: string[]) {
    if (ids.length === 0) {
      return;
    }

    copyShapeIds(ids);
    deleteShapeIds(ids);
  }

  function pasteCopiedShapesAt(point?: { x: number; y: number }) {
    if (copiedShapes.length === 0) {
      return false;
    }

    let duplicatedShapes = duplicateClipboardShapes(
      copiedShapes,
      () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    );

    if (point) {
      const anchor = duplicatedShapes[0];
      if (anchor) {
        const deltaX = point.x - anchor.x;
        const deltaY = point.y - anchor.y;
        duplicatedShapes = duplicatedShapes.map((shape) => ({
          ...shape,
          x: shape.x + deltaX,
          y: shape.y + deltaY,
        }));
      }
    }

    const normalizedShapes = duplicatedShapes.map((shape) =>
      normalizeShape(shape),
    );
    setShapes((prev) => [...prev, ...normalizedShapes]);

    const duplicatedIds = normalizedShapes.map((shape) => shape.id);
    setSelectedIds(duplicatedIds);
    setSelectedId(duplicatedIds[duplicatedIds.length - 1] ?? null);
    return true;
  }

  const resetDialogConfiguration = useCallback(() => {
    modal.confirm({
      className: "fm-confirm-modal fm-reset-config-modal",
      title: "Reset mapper configuration?",
      content:
        "This resets configuration shortcuts and mapper UI state (palette selection and dialog size/position). Profiles and their shapes are kept.",
      zIndex: 2147483647,
      okText: "Reset",
      okButtonProps: { danger: true },
      cancelText: "Cancel",
      onOk: () => {
        const resetSettings = { ...DEFAULT_SETTINGS };

        setSettings(resetSettings);
        latestSettingsRef.current = resetSettings;

        setProfiles((prev) =>
          prev.map((profile) =>
            profile.id === activeProfileId
              ? {
                  ...profile,
                  settings: resetSettings,
                }
              : profile,
          ),
        );

        setDialogRect({ ...DEFAULT_DIALOG_RECT });
        setSelectedPaletteShape("rectangle");
        setDraftShape((prev) => ({ ...prev, opacity: 1 }));
      },
    });
  }, [activeProfileId, modal]);

  const createProfile = (name?: string) => {
    const nextName =
      (name ?? "").trim() ||
      makeUniqueProfileName(latestProfilesRef.current, "Profile");
    const validationError = validateProfileName(nextName);
    if (validationError) {
      setProfileNameError(validationError);
      return false;
    }

    const profile: MappingProfile = {
      id: createProfileId(),
      name: nextName,
      shapes: [],
      settings: activeProfile?.settings ?? latestSettingsRef.current,
    };

    setProfiles((prev) => [...prev, profile]);
    requestProfileSwitch(profile.id);
    return true;
  };

  const duplicateSelectedProfile = () => {
    if (!selectedProfile) {
      return;
    }

    const duplicated: MappingProfile = {
      id: createProfileId(),
      name: makeUniqueProfileName(
        latestProfilesRef.current,
        `${selectedProfile.name} Copy`,
      ),
      shapes: selectedProfile.shapes.map((shape) => ({ ...shape })),
      settings: { ...selectedProfile.settings },
    };

    setProfiles((prev) => [...prev, duplicated]);
    setSelectedProfileId(duplicated.id);
    requestProfileSwitch(duplicated.id);
  };

  const renameSelectedProfile = (nextName: string) => {
    if (!selectedProfile) {
      return false;
    }

    const validationError = validateProfileName(nextName, selectedProfile.id);
    if (validationError) {
      setProfileNameError(validationError);
      return false;
    }

    const trimmed = nextName.trim();
    setProfiles((prev) =>
      prev.map((profile) =>
        profile.id === selectedProfile.id
          ? {
              ...profile,
              name: trimmed,
            }
          : profile,
      ),
    );

    if (selectedProfile.id === activeProfileId) {
      setActiveProfileName(trimmed);
    }

    return true;
  };

  const deleteSelectedProfile = () => {
    if (!selectedProfile) {
      return;
    }

    const sourceProfiles = latestProfilesRef.current;
    const removeId = selectedProfile.id;
    const removeIndex = sourceProfiles.findIndex(
      (profile) => profile.id === removeId,
    );
    const remainingProfiles = sourceProfiles.filter(
      (profile) => profile.id !== removeId,
    );

    if (remainingProfiles.length === 0) {
      setProfiles([]);
      setSelectedProfileId("");
      setActiveProfileId("");
      setActiveProfileName("");
      setShapes([]);
      selectSingleShape(null);
      setCopiedShapes([]);
      setIsTransformingShape(false);
      return;
    }

    const previousIndex = Math.max(0, removeIndex - 1);
    const fallbackProfile =
      remainingProfiles[previousIndex] ?? remainingProfiles[0] ?? null;
    if (!fallbackProfile) {
      return;
    }

    setProfiles(remainingProfiles);
    setSelectedProfileId(fallbackProfile.id);

    if (removeId === activeProfileId) {
      switchProfileImmediately(fallbackProfile.id);
    }
  };

  const exportMappings = async () => {
    if (!activeProfile) {
      return;
    }

    const payload = JSON.stringify(
      {
        profileName: activeProfile.name,
        shapes: latestShapesRef.current,
        settings: latestSettingsRef.current,
      },
      null,
      2,
    );
    await navigator.clipboard.writeText(payload);
  };

  const performImportWithName = (baseProfileName: string) => {
    try {
      const parsed = JSON.parse(pendingImportText) as {
        profileName?: string;
        shapes?: ShapeMapping[];
        settings?: Partial<MapperSettings>;
        profiles?: Array<{
          name?: string;
          shapes?: ShapeMapping[];
          settings?: Partial<MapperSettings>;
        }>;
      };

      const baseImportedSettings: MapperSettings = {
        ...latestSettingsRef.current,
        theme: parsed.settings?.theme ?? latestSettingsRef.current.theme,
        editMode:
          parsed.settings?.editMode ?? latestSettingsRef.current.editMode,
        showHandles:
          parsed.settings?.showHandles ?? latestSettingsRef.current.showHandles,
        addKeyMapShortcut:
          parsed.settings?.addKeyMapShortcut ??
          latestSettingsRef.current.addKeyMapShortcut,
        toggleModeShortcut:
          parsed.settings?.toggleModeShortcut ??
          latestSettingsRef.current.toggleModeShortcut,
        strictPassthrough:
          parsed.settings?.strictPassthrough ??
          latestSettingsRef.current.strictPassthrough,
        focusCanvasShortcut:
          parsed.settings?.focusCanvasShortcut ??
          latestSettingsRef.current.focusCanvasShortcut,
        toggleShapesShortcut:
          parsed.settings?.toggleShapesShortcut ??
          latestSettingsRef.current.toggleShapesShortcut,
        setZeroOpacityShortcut:
          parsed.settings?.setZeroOpacityShortcut ??
          latestSettingsRef.current.setZeroOpacityShortcut,
      };

      const importedProfiles: MappingProfile[] = [];

      if (Array.isArray(parsed.profiles)) {
        parsed.profiles.forEach((profile, index) => {
          if (!Array.isArray(profile.shapes)) {
            return;
          }

          const desiredName =
            typeof profile.name === "string" && profile.name.trim().length > 0
              ? profile.name.trim()
              : parsed.profiles && parsed.profiles.length > 1
                ? `${baseProfileName.trim()} ${index + 1}`
                : baseProfileName.trim();

          const uniqueName = makeUniqueProfileName(
            [...latestProfilesRef.current, ...importedProfiles],
            desiredName,
          );

          importedProfiles.push({
            id: createProfileId(),
            name: uniqueName,
            shapes: profile.shapes.map(normalizeShape),
            settings: {
              ...baseImportedSettings,
              theme: profile.settings?.theme ?? baseImportedSettings.theme,
              editMode:
                profile.settings?.editMode ?? baseImportedSettings.editMode,
              showHandles:
                profile.settings?.showHandles ??
                baseImportedSettings.showHandles,
              addKeyMapShortcut:
                profile.settings?.addKeyMapShortcut ??
                baseImportedSettings.addKeyMapShortcut,
              toggleModeShortcut:
                profile.settings?.toggleModeShortcut ??
                baseImportedSettings.toggleModeShortcut,
              strictPassthrough:
                profile.settings?.strictPassthrough ??
                baseImportedSettings.strictPassthrough,
              focusCanvasShortcut:
                profile.settings?.focusCanvasShortcut ??
                baseImportedSettings.focusCanvasShortcut,
              toggleShapesShortcut:
                profile.settings?.toggleShapesShortcut ??
                baseImportedSettings.toggleShapesShortcut,
              setZeroOpacityShortcut:
                profile.settings?.setZeroOpacityShortcut ??
                baseImportedSettings.setZeroOpacityShortcut,
            },
          });
        });
      }

      if (Array.isArray(parsed.shapes)) {
        const desiredName =
          typeof parsed.profileName === "string" &&
          parsed.profileName.trim().length > 0
            ? parsed.profileName.trim()
            : baseProfileName.trim();

        const uniqueName = makeUniqueProfileName(
          [...latestProfilesRef.current, ...importedProfiles],
          desiredName,
        );

        importedProfiles.push({
          id: createProfileId(),
          name: uniqueName,
          shapes: parsed.shapes.map(normalizeShape),
          settings: baseImportedSettings,
        });
      }

      if (importedProfiles.length === 0) {
        Modal.error({
          title: "Invalid import payload",
          content:
            "Please provide a valid JSON mapping export with shapes or profiles.",
        });
        return;
      }

      const nextProfiles = [...latestProfilesRef.current, ...importedProfiles];
      const nextActive = importedProfiles[importedProfiles.length - 1];

      setProfiles(nextProfiles);
      setSelectedProfileId(nextActive.id);
      requestProfileSwitch(nextActive.id);

      selectSingleShape(null);
      setCopiedShapes([]);
      setIsTransformingShape(false);

      setPendingImportText("");
      setImportText("");
      setImportOpen(false);
      closeProfileNameDialog();
    } catch {
      Modal.error({
        title: "Invalid import payload",
        content: "Please provide a valid JSON mapping export.",
      });
    }
  };

  const handleProfileNameDialogSave = () => {
    const trimmed = profileNameInput.trim();
    if (!trimmed) {
      setProfileNameError("Profile name is required.");
      return;
    }

    if (profileNameDialogMode === "create") {
      const ok = createProfile(trimmed);
      if (!ok) {
        return;
      }
      closeProfileNameDialog();
      return;
    }

    if (profileNameDialogMode === "rename") {
      const ok = renameSelectedProfile(trimmed);
      if (!ok) return;
      closeProfileNameDialog();
      return;
    }

    performImportWithName(trimmed);
  };

  const applyImport = () => {
    if (!canImportNow) {
      Modal.error({
        title: "Cannot import mappings",
        content:
          importAnalysis.parseError ||
          "Please provide a valid JSON mapping export with shapes.",
      });
      return;
    }

    let suggestedName = "Imported";
    try {
      const parsed = JSON.parse(importText) as {
        profileName?: string;
        profiles?: Array<{ name?: string }>;
      };

      suggestedName =
        parsed.profileName?.trim() ||
        parsed.profiles?.[0]?.name?.trim() ||
        "Imported";
    } catch {
      suggestedName = "Imported";
    }

    setPendingImportText(importText);
    openProfileNameDialog("import", suggestedName);
  };

  const handleThemeChange = (value: string | number) => {
    setSettings((prev) => ({ ...prev, theme: value as ThemeMode }));
  };

  const algorithm =
    appliedTheme === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm;

  useEffect(() => {
    const bodyClass = "fm-dark-theme";
    if (appliedTheme === "dark") {
      document.body.classList.add(bodyClass);
      return () => {
        document.body.classList.remove(bodyClass);
      };
    }

    document.body.classList.remove(bodyClass);
  }, [appliedTheme]);

  return (
    <ConfigProvider theme={{ algorithm }}>
      <App>
        {modalContextHolder}
        <div
          className={`fm-relative fm-size-full ${appliedTheme === "dark" ? "fm-dark" : ""}`}
        >
          <ShapeOverlay
            overlayVisible={overlayVisible}
            shapesVisible={shapesVisible}
            shapes={shapes}
            settings={settings}
            hasClipboardShapes={copiedShapes.length > 0}
            selectedIds={selectedIds}
            selectSingleShape={selectSingleShape}
            toggleShapeSelection={toggleShapeSelection}
            runningTooltip={runningTooltip}
            setIsTransformingShape={setIsTransformingShape}
            setShapes={setShapes}
            removeShape={removeShape}
            deleteShapeIds={deleteShapeIds}
            copyShapeIds={copyShapeIds}
            cutShapeIds={cutShapeIds}
            pasteCopiedShapesAt={pasteCopiedShapesAt}
            rotateIdRef={rotateIdRef}
            previousBodyCursorRef={previousBodyCursorRef}
            buildShortcutFromEvent={buildShortcutFromEvent}
            normalizeShape={normalizeShape}
          />

          <MapperDialog
            overlayVisible={overlayVisible}
            dialogVisible={dialogVisible}
            isTransformingShape={isTransformingShape}
            dialogRect={dialogRect}
            setDialogRect={setDialogRect}
            activeProfileName={activeProfileName}
            focusGameCanvas={focusGameCanvas}
            onResetDialogConfiguration={resetDialogConfiguration}
            settings={settings}
            toggleMode={toggleMode}
            addKeyMap={addKeyMap}
            profiles={profiles}
            selectedProfile={selectedProfile}
            onSelectProfileChange={(value) => {
              requestProfileSwitch(value);
            }}
            onOpenCreateProfile={() =>
              openProfileNameDialog(
                "create",
                makeUniqueProfileName(latestProfilesRef.current, "Profile"),
              )
            }
            duplicateSelectedProfile={duplicateSelectedProfile}
            onOpenRenameProfile={() => {
              if (!selectedProfile) return;
              openProfileNameDialog("rename", selectedProfile.name);
            }}
            deleteSelectedProfile={deleteSelectedProfile}
            selectedPaletteShape={selectedPaletteShape}
            setSelectedPaletteShape={setSelectedPaletteShape}
            handleThemeChange={handleThemeChange}
            draftShape={draftShape}
            setDraftShape={setDraftShape}
            setShapes={setShapes}
            normalizeShape={normalizeShape}
            setSettings={setSettings}
            exportMappings={exportMappings}
            setImportOpen={setImportOpen}
            captureGlobalShortcut={captureGlobalShortcut}
          />

          <ImportMappingsModal
            overlayVisible={overlayVisible}
            importOpen={importOpen}
            isTransformingShape={isTransformingShape}
            canImportNow={canImportNow}
            importAnalysis={importAnalysis}
            importText={importText}
            setImportText={setImportText}
            applyImport={applyImport}
            onClose={() => {
              setImportOpen(false);
              setImportText("");
              setPendingImportText("");
            }}
          />

          <ProfileNameModal
            overlayVisible={overlayVisible}
            profileNameDialogOpen={profileNameDialogOpen}
            profileNameDialogMode={profileNameDialogMode}
            profileNameInput={profileNameInput}
            profileNameError={profileNameError}
            setProfileNameInput={setProfileNameInput}
            clearProfileNameError={() => setProfileNameError("")}
            onClose={closeProfileNameDialog}
            onSave={handleProfileNameDialogSave}
          />
        </div>
      </App>
    </ConfigProvider>
  );
}

const mount = () => {
  const existingRoot = document.getElementById(ROOT_ID);
  if (existingRoot) {
    existingRoot.remove();
  }

  const rootElement = document.createElement("div");
  rootElement.id = ROOT_ID;
  document.body.appendChild(rootElement);

  createRoot(rootElement).render(<MapperApp />);
};

mount();
