import {
  LeftOutlined,
  ExclamationCircleFilled,
  BulbFilled,
  BulbOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  CaretRightOutlined,
  PlusOutlined,
  QuestionOutlined,
  ReloadOutlined,
  SettingOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Checkbox,
  ConfigProvider,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Slider,
  Space,
  Switch,
  Tabs,
  theme,
  Tooltip,
  Typography,
} from "antd";
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  SetStateAction,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import type {
  CharacterTabInfo,
  KeyTriggerProfile,
  MapperSettings,
  MappingProfile,
  NormalizedRect,
  ShapeMapping,
  ShapeType,
  UtilityTab,
} from "../../types";
import type { AutoHolyDebuffType } from "../../types";
import {
  BASIC_PALETTE_SHAPES,
  OVERLAY_SHORTCUT,
  PROFILE_SELECT_DROPDOWN_STYLE,
  SHAPE_LABELS,
} from "../constants";
import type { GlobalShortcutField } from "../shortcutBinding";
import { KeyTriggerTab } from "./KeyTriggerTab";
import { AutoAwakenTab } from "../../auto-awaken/AutoAwakenTab";

const AUTO_FEATURE_MODIFIER_KEYS = new Set([
  "Control",
  "Alt",
  "Shift",
  "Meta",
  "CapsLock",
  "NumLock",
  "ScrollLock",
]);

const buildAutoFeatureShortcut = (
  event: ReactKeyboardEvent<HTMLInputElement>,
): string => {
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") return "";
  if (AUTO_FEATURE_MODIFIER_KEYS.has(event.key)) return "";
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [...parts, key].join("+");
};

const buildMouseModifiers = (event: {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}): string[] => {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");
  return parts;
};

const buildWheelShortcut = (
  event: ReactWheelEvent<HTMLInputElement>,
): string => {
  if (event.deltaY === 0) return "";
  const direction = event.deltaY < 0 ? "Wheel Up" : "Wheel Down";
  return [...buildMouseModifiers(event), direction].join("+");
};

const formatScanRegionSummary = (region: NormalizedRect | null): string => {
  if (!region) {
    return "Using the default top-left scan area until you capture a custom region.";
  }

  return `Saved region: ${Math.round(region.x * 100)}% x, ${Math.round(region.y * 100)}% y, ${Math.round(region.width * 100)}% w, ${Math.round(region.height * 100)}% h.`;
};

import { PaletteShapeIcon } from "../components/PaletteShapeIcon";
import { ShortcutKeys } from "../components/ShortcutKeys";

type Props = {
  overlayVisible: boolean;
  dialogVisible: boolean;
  isTransformingShape: boolean;
  dialogRect: { x: number; y: number; width: number; height: number };
  setDialogRect: Dispatch<
    SetStateAction<{ x: number; y: number; width: number; height: number }>
  >;
  activeProfileName: string;
  focusGameCanvas: () => void;
  onResetDialogConfiguration: () => void;
  settings: MapperSettings;
  toggleMode: () => void;
  addKeyMap: () => void;
  profiles: MappingProfile[];
  selectedProfile: MappingProfile | null;
  onSelectProfileChange: (value: string) => void;
  onOpenCreateProfile: () => void;
  duplicateSelectedProfile: () => void;
  onOpenRenameProfile: () => void;
  deleteSelectedProfile: () => void;
  activeUtilityTab: UtilityTab;
  onActiveUtilityTabChange: (value: UtilityTab) => void;
  selectedPaletteShape: ShapeType;
  setSelectedPaletteShape: (shape: ShapeType) => void;
  handleThemeChange: (value: string | number) => void;
  draftShape: ShapeMapping;
  setDraftShape: Dispatch<SetStateAction<ShapeMapping>>;
  setShapes: Dispatch<SetStateAction<ShapeMapping[]>>;
  normalizeShape: (shape: ShapeMapping) => ShapeMapping;
  setSettings: Dispatch<SetStateAction<MapperSettings>>;
  exportMappings: () => void;
  setImportOpen: (value: boolean) => void;
  captureGlobalShortcut: (
    event: ReactKeyboardEvent<HTMLInputElement>,
    field: GlobalShortcutField,
  ) => void;
  globalShortcutErrors: Partial<Record<GlobalShortcutField, string>>;
  keyTriggerProfiles: KeyTriggerProfile[];
  onKeyTriggerProfilesChange: (profiles: KeyTriggerProfile[]) => void;
  keyTriggerCharacters: CharacterTabInfo[];
  selectedKeyTriggerTabIds: number[];
  onSelectedKeyTriggerTabIdsChange: (ids: number[]) => void;
  keyTriggerSelectedProfileId?: string | null;
  onKeyTriggerSelectedProfileIdChange?: (profileId: string | null) => void;
  reloadKeyTriggerCharacters: () => void;
  autoStopCountdown: number | null;
  automationRegionCaptureTarget: "autoHoly" | "autoPills" | "autoAwaken" | null;
  onStartAutomationRegionCapture: (
    target: "autoHoly" | "autoPills" | "autoAwaken",
  ) => void;
  onCancelAutomationRegionCapture: () => void;
  onClearAutomationRegionCapture: (
    target: "autoHoly" | "autoPills" | "autoAwaken",
  ) => void;
  autoAwakenRunning: boolean;
  autoAwakenStatus: string;
  autoAwakenLogs: string[];
  onStartAutoAwaken: (mode?: "reawaken") => void;
  onStopAutoAwaken: () => void;
};

type DialogPane = UtilityTab | "settings";

export const MapperDialog = ({
  overlayVisible,
  dialogVisible,
  isTransformingShape,
  dialogRect,
  setDialogRect,
  activeProfileName,
  focusGameCanvas,
  onResetDialogConfiguration,
  settings,
  toggleMode,
  addKeyMap,
  profiles,
  selectedProfile,
  onSelectProfileChange,
  onOpenCreateProfile,
  duplicateSelectedProfile,
  onOpenRenameProfile,
  deleteSelectedProfile,
  activeUtilityTab,
  onActiveUtilityTabChange,
  selectedPaletteShape,
  setSelectedPaletteShape,
  handleThemeChange,
  draftShape,
  setDraftShape,
  setShapes,
  normalizeShape,
  setSettings,
  exportMappings,
  setImportOpen,
  captureGlobalShortcut,
  globalShortcutErrors,
  keyTriggerProfiles,
  onKeyTriggerProfilesChange,
  keyTriggerCharacters,
  selectedKeyTriggerTabIds,
  onSelectedKeyTriggerTabIdsChange,
  keyTriggerSelectedProfileId,
  onKeyTriggerSelectedProfileIdChange,
  reloadKeyTriggerCharacters,
  autoStopCountdown,
  automationRegionCaptureTarget,
  onStartAutomationRegionCapture,
  onCancelAutomationRegionCapture,
  onClearAutomationRegionCapture,
  autoAwakenRunning,
  autoAwakenStatus,
  autoAwakenLogs,
  onStartAutoAwaken,
  onStopAutoAwaken,
}: Props) => {
  const { token } = theme.useToken();
  const isLocked = !settings.editMode;
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isThemeIconAnimating, setIsThemeIconAnimating] = useState(false);
  const [activeDialogPane, setActiveDialogPane] =
    useState<DialogPane>(activeUtilityTab);
  const [isKeyTriggerEditorOpen, setIsKeyTriggerEditorOpen] = useState(false);
  const [keyTriggerBackRequestVersion, setKeyTriggerBackRequestVersion] =
    useState(0);
  const [shouldFocusAutoStop, setShouldFocusAutoStop] = useState(false);
  const toolVersion =
    typeof chrome !== "undefined" && chrome.runtime?.getManifest
      ? chrome.runtime.getManifest().version
      : "dev";
  const resizeStateRef = useRef<{
    direction: "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";
    startX: number;
    startY: number;
    startRect: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const lastUtilityTabRef = useRef<UtilityTab>(activeUtilityTab);
  const autoStopInputRef = useRef<any>(null);
  const holyKeyLastClickRef = useRef<{ button: number; time: number }>({
    button: -1,
    time: 0,
  });
  const pillKeyLastClickRef = useRef<{ button: number; time: number }>({
    button: -1,
    time: 0,
  });

  const MIN_DIALOG_WIDTH = 360;
  const MIN_DIALOG_HEIGHT = 430;

  const getDialogPopupContainer = (triggerNode?: HTMLElement) =>
    (triggerNode?.closest(".fm-dialog") as HTMLElement | null) ?? document.body;

  const dialogTooltipProps = {
    getPopupContainer: (triggerNode: HTMLElement) =>
      getDialogPopupContainer(triggerNode),
    zIndex: 2147483647,
  };

  const isLightTheme = settings.theme === "light";
  const toggleThemeMode = () => {
    handleThemeChange(isLightTheme ? "dark" : "light");
  };

  const helpDialogContent = (
    <Space direction="vertical" size={6} style={{ width: "100%" }}>
      <Typography.Text strong>Features</Typography.Text>
      <Typography.Text type="secondary">
        Start enables Edit Mode for creating and editing shapes; Stop enables
        trigger mode for gameplay execution.
      </Typography.Text>
      <Typography.Text type="secondary">
        Drag / move shapes in Edit Mode (single or grouped selection).
      </Typography.Text>
      <Typography.Text type="secondary">
        Rotate using the rotate handle (hold <ShortcutKeys combo="Shift" /> for
        larger angle step).
      </Typography.Text>
      <Typography.Text type="secondary">
        Resize with corner handles (hold <ShortcutKeys combo="Shift" /> to keep
        aspect ratio).
      </Typography.Text>
      <Typography.Text type="secondary">
        Snap to guides while dragging/resizing, with live alignment indicator
        lines.
      </Typography.Text>
      <Typography.Text type="secondary">
        Multi-select with <ShortcutKeys combo="Ctrl+Click" /> or{" "}
        <ShortcutKeys combo="Cmd+Click" />, group move, copy/paste, and
        undo/redo for shape and canvas edits.
      </Typography.Text>
      <Typography.Text type="secondary">
        Shape shortcut input hides automatically on very small shapes and
        remains editable through the shape context menu.
      </Typography.Text>
      <Typography.Text type="secondary">
        Per-shape delay is supported before trigger execution.
      </Typography.Text>
      <Typography.Text type="secondary">
        Trigger Type supports Once and Toggle behavior per shape.
      </Typography.Text>
      <Typography.Text type="secondary">
        Shape bindings support keyboard sequences and mouse actions (
        <ShortcutKeys combo="Left Click" />,{" "}
        <ShortcutKeys combo="Double Left Click" />,{" "}
        <ShortcutKeys combo="Right Click" />, <ShortcutKeys combo="Wheel Up" />{" "}
        / <ShortcutKeys combo="Wheel Down" />) with modifier combinations.
      </Typography.Text>
      <Typography.Text type="secondary">
        <ShortcutKeys combo="Right Click" /> context menu in Edit Mode supports
        Delete, Copy, Cut, Paste, and Move (cursor-follow drop on{" "}
        <ShortcutKeys combo="Left Click" />
        ); right-clicking the game canvas shows Paste when clipboard has shapes.
      </Typography.Text>
      <Typography.Text type="secondary">
        Context menu supports live coordinate/size editing (X, Y, Width,
        Height), and the menu follows the shape while values change.
      </Typography.Text>
      <Typography.Text type="secondary">
        Context menu also supports Trigger Delay (ms) and Trigger Type
        (Once/Toggle) per shape.
      </Typography.Text>
      <Typography.Text type="secondary">
        Context actions apply to the current multi-selection when the{" "}
        <ShortcutKeys combo="Right Click" /> target shape is part of the
        selected group.
      </Typography.Text>
      <Typography.Text type="secondary">
        Snap line indicators can be toggled from Mapper Controls; when enabled
        they appear when snap alignment is active.
      </Typography.Text>

      <Divider className="!fm-my-1" />
      <Typography.Text strong>Configurable</Typography.Text>
      <Typography.Text type="secondary">
        Global shortcuts below work when not typing in an input field.
      </Typography.Text>
      <Typography.Text type="secondary">
        Toggle Mapper: <ShortcutKeys combo={OVERLAY_SHORTCUT} />
      </Typography.Text>
      <Typography.Text type="secondary">
        Add Key Map: <ShortcutKeys combo={settings.addKeyMapShortcut} />
      </Typography.Text>
      <Typography.Text type="secondary">
        Start/Stop Mode: <ShortcutKeys combo={settings.toggleModeShortcut} />
      </Typography.Text>
      <Typography.Text type="secondary">
        Focus Canvas: <ShortcutKeys combo={settings.focusCanvasShortcut} />
      </Typography.Text>
      <Typography.Text type="secondary">
        Show/Hide Shapes: <ShortcutKeys combo={settings.toggleShapesShortcut} />
      </Typography.Text>
      <Typography.Text type="secondary">
        Opacity 0/100: <ShortcutKeys combo={settings.setZeroOpacityShortcut} />
      </Typography.Text>

      <Divider className="!fm-my-1" />
      <Typography.Text strong>Edit Mode (Built-in)</Typography.Text>
      <Typography.Text type="secondary">
        Select All: <ShortcutKeys combo="Ctrl+A" /> or{" "}
        <ShortcutKeys combo="Cmd+A" />
      </Typography.Text>
      <Typography.Text type="secondary">
        Multi-select Toggle: Ctrl/Cmd + Click on shapes.
      </Typography.Text>
      <Typography.Text type="secondary">
        Delete Selected: <ShortcutKeys combo="Delete" />
      </Typography.Text>
      <Typography.Text type="secondary">
        Undo Shape/Canvas Edit: <ShortcutKeys combo="Ctrl+Z" /> or{" "}
        <ShortcutKeys combo="Cmd+Z" />
      </Typography.Text>
      <Typography.Text type="secondary">
        Redo Shape/Canvas Edit: <ShortcutKeys combo="Ctrl+Y" /> or{" "}
        <ShortcutKeys combo="Ctrl+Shift+Z" /> or{" "}
        <ShortcutKeys combo="Cmd+Shift+Z" />
      </Typography.Text>
      <Typography.Text type="secondary">
        Cut / Copy / Paste: <ShortcutKeys combo="Ctrl+X" /> /{" "}
        <ShortcutKeys combo="Ctrl+C" /> / <ShortcutKeys combo="Ctrl+V" /> or{" "}
        <ShortcutKeys combo="Cmd+X" /> / <ShortcutKeys combo="Cmd+C" /> /{" "}
        <ShortcutKeys combo="Cmd+V" />
      </Typography.Text>
      <Typography.Text type="secondary">
        Move Selected: <ShortcutKeys combo="Arrow Keys" /> (Shift = 10px step)
      </Typography.Text>
      <Typography.Text type="secondary">
        Rotate Selected: drag rotate handle (Shift = larger angle step).
      </Typography.Text>
      <Typography.Text type="secondary">
        Drag and context-menu free move can snap to nearby guides; indicators
        show during active snapping when enabled. Holding Shift increases
        movement step and skips line snapping.
      </Typography.Text>
      <Typography.Text type="secondary">
        Clear Selection / Close Dialog: <ShortcutKeys combo="Escape" />
      </Typography.Text>

      <Divider className="!fm-my-1" />
      <Typography.Text strong>Stop Mode (Built-in)</Typography.Text>
      <Typography.Text type="secondary">
        Shape bindings execute in Stop mode, including keyboard sequences, mouse
        tokens, wheel tokens, delay, and toggle/once trigger type.
      </Typography.Text>

      <Divider className="!fm-my-1" />
      <Typography.Text strong>Shape Trigger Tokens (Examples)</Typography.Text>
      <Typography.Text type="secondary">
        Keyboard sequences: <ShortcutKeys combo="Alt+K+W" /> /{" "}
        <ShortcutKeys combo="Space+Space" />
      </Typography.Text>
      <Typography.Text type="secondary">
        Mouse: <ShortcutKeys combo="Left Click" />,{" "}
        <ShortcutKeys combo="Right Click" />,{" "}
        <ShortcutKeys combo="Double Left Click" />,{" "}
        <ShortcutKeys combo="Double Right Click" />
      </Typography.Text>
      <Typography.Text type="secondary">
        Wheel: <ShortcutKeys combo="Wheel Up" /> /{" "}
        <ShortcutKeys combo="Wheel Down" />
      </Typography.Text>
      <Typography.Text type="secondary">
        Mouse + modifiers: <ShortcutKeys combo="Ctrl+Left Click" />,{" "}
        <ShortcutKeys combo="Alt+Right Click" />,{" "}
        <ShortcutKeys combo="Shift+Wheel Down" />
      </Typography.Text>
    </Space>
  );

  const stopDialogResize = () => {
    resizeStateRef.current = null;
    window.removeEventListener("pointermove", onDialogResizeMove);
    window.removeEventListener("pointerup", stopDialogResize);
  };

  const onDialogResizeMove = (event: PointerEvent) => {
    const active = resizeStateRef.current;
    if (!active) {
      return;
    }

    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;

    let nextX = active.startRect.x;
    let nextY = active.startRect.y;
    let nextWidth = active.startRect.width;
    let nextHeight = active.startRect.height;

    if (active.direction.includes("e")) {
      nextWidth = Math.max(MIN_DIALOG_WIDTH, active.startRect.width + dx);
    }

    if (active.direction.includes("s")) {
      nextHeight = Math.max(MIN_DIALOG_HEIGHT, active.startRect.height + dy);
    }

    if (active.direction.includes("w")) {
      const proposedWidth = Math.max(
        MIN_DIALOG_WIDTH,
        active.startRect.width - dx,
      );
      nextX = active.startRect.x + (active.startRect.width - proposedWidth);
      nextWidth = proposedWidth;
    }

    if (active.direction.includes("n")) {
      const proposedHeight = Math.max(
        MIN_DIALOG_HEIGHT,
        active.startRect.height - dy,
      );
      nextY = active.startRect.y + (active.startRect.height - proposedHeight);
      nextHeight = proposedHeight;
    }

    const maxX = Math.max(0, window.innerWidth - nextWidth);
    const maxY = Math.max(0, window.innerHeight - nextHeight);

    nextX = Math.min(Math.max(0, nextX), maxX);
    nextY = Math.min(Math.max(0, nextY), maxY);

    setDialogRect({
      x: nextX,
      y: nextY,
      width: nextWidth,
      height: nextHeight,
    });
  };

  const startDialogResize = (
    direction: "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw",
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    resizeStateRef.current = {
      direction,
      startX: event.clientX,
      startY: event.clientY,
      startRect: { ...dialogRect },
    };

    window.addEventListener("pointermove", onDialogResizeMove);
    window.addEventListener("pointerup", stopDialogResize);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onDialogResizeMove);
      window.removeEventListener("pointerup", stopDialogResize);
    };
  }, []);

  useEffect(() => {
    lastUtilityTabRef.current = activeUtilityTab;
    setActiveDialogPane((prev) => {
      if (prev === "settings" || prev === activeUtilityTab) {
        return prev;
      }

      return activeUtilityTab;
    });
  }, [activeUtilityTab]);

  useEffect(() => {
    if (
      !settings.experimentalFeaturesEnabled &&
      activeDialogPane === "auto-awaken"
    ) {
      setActiveDialogPane("key-mapper");
      onActiveUtilityTabChange("key-mapper");
    }
  }, [
    activeDialogPane,
    onActiveUtilityTabChange,
    settings.experimentalFeaturesEnabled,
  ]);

  useEffect(() => {
    if (
      shouldFocusAutoStop &&
      activeDialogPane === "settings" &&
      autoStopInputRef.current
    ) {
      // Small delay to ensure the pane transition is complete
      const timer = setTimeout(() => {
        autoStopInputRef.current?.focus();
        // Scroll the input into view
        autoStopInputRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        setShouldFocusAutoStop(false);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [shouldFocusAutoStop, activeDialogPane]);

  const openUtilityPane = (value: UtilityTab) => {
    lastUtilityTabRef.current = value;
    onActiveUtilityTabChange(value);
    setActiveDialogPane(value);
  };

  const toggleSettingsPane = () => {
    if (activeDialogPane === "settings") {
      setActiveDialogPane(lastUtilityTabRef.current);
      return;
    }

    lastUtilityTabRef.current = activeUtilityTab;
    setActiveDialogPane("settings");
  };

  const activePaneIndex =
    activeDialogPane === "key-trigger"
      ? 1
      : activeDialogPane === "auto-awaken"
        ? 3
        : activeDialogPane === "settings"
          ? 2
          : 0;

  const showMergedBackButton =
    activeDialogPane === "settings" ||
    (activeDialogPane === "key-trigger" && isKeyTriggerEditorOpen);

  const mergedBackLabel =
    activeDialogPane === "settings"
      ? "Back to previous tab"
      : activeDialogPane === "key-trigger" && isKeyTriggerEditorOpen
        ? "Back to profiles"
        : "Back";

  const handleMergedBack = () => {
    if (activeDialogPane === "settings") {
      setActiveDialogPane(lastUtilityTabRef.current);
      return;
    }

    if (activeDialogPane === "key-trigger" && isKeyTriggerEditorOpen) {
      setKeyTriggerBackRequestVersion((prev) => prev + 1);
    }
  };

  const openSettingsFromAutoStop = () => {
    if (activeDialogPane === "settings") {
      // Already in settings, just focus the auto-stop field
      setShouldFocusAutoStop(true);
      return;
    }

    lastUtilityTabRef.current = activeUtilityTab;
    setShouldFocusAutoStop(true);
    setActiveDialogPane("settings");
  };

  const recaptchaActionMode = settings.stopOnRecaptcha
    ? settings.notifyOnRecaptcha
      ? "stop-and-notify"
      : "stop-only"
    : settings.notifyOnRecaptcha
      ? "notify-only"
      : "off";

  const activeUtilityPaneTab: UtilityTab =
    activeDialogPane === "settings"
      ? lastUtilityTabRef.current
      : activeDialogPane;

  const renderPaneTop = (options?: { hideUtilityControls?: boolean }) => (
    <div className="fm-dialog-sticky-top">
      {!options?.hideUtilityControls && (
        <>
          <Tabs
            size="small"
            activeKey={activeUtilityPaneTab}
            onChange={(value) =>
              openUtilityPane(
                value === "key-trigger"
                  ? "key-trigger"
                  : value === "auto-awaken"
                    ? "auto-awaken"
                    : "key-mapper",
              )
            }
            items={[
              { key: "key-mapper", label: "Key Mapper" },
              { key: "key-trigger", label: "Key Trigger" },
              ...(settings.experimentalFeaturesEnabled
                ? [{ key: "auto-awaken", label: "Auto-Awaken" }]
                : []),
            ]}
            style={{
              padding: "0px 16px 0",
              backgroundColor: "inherit",
              color: token.colorText,
            }}
          />
          {activeDialogPane === "key-trigger" && (
            <div
              style={{
                padding: "8px 16px 8px 16px",
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
              }}
            >
              <Space
                align="center"
                style={{ width: "100%", justifyContent: "space-between" }}
              >
                <Typography.Text strong>Characters / Tabs</Typography.Text>
                <Tooltip title="Reload characters" {...dialogTooltipProps}>
                  <Button
                    type="text"
                    size="small"
                    icon={<ReloadOutlined />}
                    onClick={reloadKeyTriggerCharacters}
                    aria-label="Reload characters"
                  />
                </Tooltip>
              </Space>
              <Space
                direction="vertical"
                size={4}
                className="fm-w-full"
                style={{ marginTop: 8 }}
              >
                {keyTriggerCharacters.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No Flyff tabs found"
                  />
                ) : (
                  keyTriggerCharacters.map((tab) => (
                    <Checkbox
                      key={tab.id}
                      checked={selectedKeyTriggerTabIds.includes(tab.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          onSelectedKeyTriggerTabIdsChange([
                            ...selectedKeyTriggerTabIds,
                            tab.id,
                          ]);
                          return;
                        }

                        onSelectedKeyTriggerTabIdsChange(
                          selectedKeyTriggerTabIds.filter(
                            (id) => id !== tab.id,
                          ),
                        );
                      }}
                      disabled={!settings.editMode}
                    >
                      {tab.name}
                    </Checkbox>
                  ))
                )}
              </Space>
            </div>
          )}
        </>
      )}
    </div>
  );

  const dialogFooter = (
    <div
      className="fm-dialog-sticky-footer"
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <div className="fm-dialog-footer-left">
        {autoStopCountdown !== null && (
          <Button
            type="text"
            size="small"
            className="fm-footer-autostop-alert fm-footer-autostop-trigger"
            icon={<ExclamationCircleFilled />}
            onClick={openSettingsFromAutoStop}
          >
            Auto-stop in {autoStopCountdown}s
          </Button>
        )}
      </div>
      <Typography.Text type="secondary" className="fm-dialog-footer-right">
        v{toolVersion}
      </Typography.Text>
    </div>
  );

  if (!overlayVisible || !dialogVisible || isTransformingShape) {
    return null;
  }

  return (
    <ConfigProvider
      getPopupContainer={getDialogPopupContainer}
      theme={{
        token: {
          zIndexPopupBase: 2147483647,
        },
      }}
    >
      <Rnd
        className="fm-dialog fm-z-[2147483645]"
        size={{ width: dialogRect.width, height: dialogRect.height }}
        position={{ x: dialogRect.x, y: dialogRect.y }}
        minWidth={360}
        minHeight={430}
        dragHandleClassName="ant-card-head"
        enableResizing={false}
        cancel=".fm-dialog-manual-resize-layer, .fm-dialog-manual-handle"
        bounds="window"
        onDragStop={(_event, data) => {
          setDialogRect((prev) => ({ ...prev, x: data.x, y: data.y }));
        }}
      >
        <Card
          title={
            <div className="fm-dialog-title-row">
              <span>Flyff Utility</span>
            </div>
          }
          size="small"
          bodyStyle={{
            height: "calc(100% - 46px)",
            overflow: "hidden",
            padding: 0,
          }}
          className="fm-panel fm-h-full"
          extra={
            <Space size={8} align="center">
              {showMergedBackButton && (
                <Tooltip title={mergedBackLabel} {...dialogTooltipProps}>
                  <Button
                    type="text"
                    size="small"
                    shape="circle"
                    icon={<LeftOutlined />}
                    aria-label={mergedBackLabel}
                    onClick={handleMergedBack}
                  />
                </Tooltip>
              )}
              <Tooltip
                title={
                  isLightTheme ? "Switch to dark mode" : "Switch to light mode"
                }
                {...dialogTooltipProps}
              >
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Toggle theme"
                  className={`fm-theme-toggle-icon${isLightTheme ? " fm-theme-toggle-icon-light" : " fm-theme-toggle-icon-dark"}${isThemeIconAnimating ? " fm-theme-toggle-icon-animate" : ""}`}
                  onClick={() => {
                    setIsThemeIconAnimating(true);
                    toggleThemeMode();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setIsThemeIconAnimating(true);
                      toggleThemeMode();
                    }
                  }}
                  onAnimationEnd={() => {
                    setIsThemeIconAnimating(false);
                  }}
                >
                  {isLightTheme ? <BulbFilled /> : <BulbOutlined />}
                </span>
              </Tooltip>
              <Button
                type="text"
                size="small"
                className="fm-header-mode-icon-btn"
                icon={
                  <span
                    className={`fm-header-mode-icon ${settings.editMode ? "fm-header-mode-icon-start" : "fm-header-mode-icon-stop"}`}
                  >
                    {settings.editMode ? (
                      <CaretRightOutlined />
                    ) : (
                      <StopOutlined />
                    )}
                  </span>
                }
                aria-disabled={false}
                onClick={toggleMode}
                title={settings.editMode ? "Start Script" : "Stop Script"}
                aria-label={settings.editMode ? "Start Script" : "Stop Script"}
              />
              <Tooltip title="Copy JSON" {...dialogTooltipProps}>
                <Button
                  type="text"
                  size="small"
                  icon={<CopyOutlined />}
                  aria-label="Copy JSON"
                  onClick={exportMappings}
                />
              </Tooltip>
              <Tooltip title="Import JSON" {...dialogTooltipProps}>
                <Button
                  type="text"
                  size="small"
                  className={isLocked ? "fm-header-action-btn-locked" : ""}
                  icon={<DownloadOutlined />}
                  aria-label="Import JSON"
                  aria-disabled={isLocked}
                  onClick={() => {
                    if (isLocked) {
                      return;
                    }

                    setImportOpen(true);
                  }}
                />
              </Tooltip>
              <Tooltip
                title="Focus game canvas for immediate keyboard gameplay input"
                {...dialogTooltipProps}
              >
                <Button
                  type="text"
                  size="small"
                  onClick={focusGameCanvas}
                  title="Focus game canvas"
                >
                  F
                </Button>
              </Tooltip>
              <Tooltip title="Reset to Default" {...dialogTooltipProps}>
                <Button
                  type="text"
                  size="small"
                  className={isLocked ? "fm-header-action-btn-locked" : ""}
                  aria-disabled={isLocked}
                  onClick={() => {
                    if (isLocked) {
                      return;
                    }

                    onResetDialogConfiguration();
                  }}
                  icon={<ReloadOutlined />}
                  aria-label="Reset mapper configuration"
                />
              </Tooltip>
              <Tooltip title="Settings" {...dialogTooltipProps}>
                <Button
                  type="text"
                  size="small"
                  className={isLocked ? "fm-header-action-btn-locked" : ""}
                  icon={<SettingOutlined />}
                  aria-label={
                    activeDialogPane === "settings"
                      ? "Close settings"
                      : "Open settings"
                  }
                  aria-disabled={isLocked}
                  onClick={() => {
                    if (isLocked) {
                      return;
                    }

                    toggleSettingsPane();
                  }}
                />
              </Tooltip>
            </Space>
          }
        >
          <div className="fm-dialog-slider-viewport">
            <div
              className="fm-dialog-slider-track"
              style={{
                transform: `translateX(-${activePaneIndex * (100 / 4)}%)`,
              }}
            >
              <div className="fm-dialog-slider-pane">
                <div className="fm-dialog-form-shell">
                  {renderPaneTop()}
                  <Form
                    layout="vertical"
                    style={{ direction: "ltr", padding: "12px 16px 0" }}
                    disabled={isLocked}
                  >
                    <Form.Item>
                      <Space
                        direction="vertical"
                        size={8}
                        className="fm-w-full"
                      >
                        <Space
                          align="center"
                          style={{
                            width: "100%",
                            justifyContent: "space-between",
                          }}
                        >
                          <div>
                            Active Profile:{" "}
                            <Typography.Text>
                              {activeProfileName || "No Active Profile"}
                            </Typography.Text>
                          </div>

                          <Tooltip
                            title="Open mapper shortcuts and features help"
                            {...dialogTooltipProps}
                          >
                            <Button
                              type="text"
                              size="small"
                              icon={<QuestionOutlined />}
                              aria-label="Show all mapper shortcuts"
                              onClick={() => setIsHelpDialogOpen(true)}
                            />
                          </Tooltip>
                        </Space>

                        <Tooltip
                          {...dialogTooltipProps}
                          title="Add a new key map"
                        >
                          <Button
                            type="dashed"
                            block
                            onClick={addKeyMap}
                            disabled={isLocked}
                          >
                            Add Key Map
                          </Button>
                        </Tooltip>
                        <Typography.Text type="secondary">
                          Start turns on Edit Mode to add, move, resize, and
                          configure shapes. Stop turns on trigger mode for
                          gameplay use.
                        </Typography.Text>
                      </Space>
                    </Form.Item>

                    <Divider className="!fm-my-2" />
                    <Typography.Text strong>Mapper Controls</Typography.Text>

                    <Form.Item label="Mapping Profile">
                      <Space
                        direction="vertical"
                        size={6}
                        className="fm-w-full"
                      >
                        {profiles.length > 0 && (
                          <Select
                            value={selectedProfile?.id}
                            options={profiles.map((profile) => ({
                              value: profile.id,
                              label: profile.name,
                            }))}
                            getPopupContainer={getDialogPopupContainer}
                            dropdownStyle={PROFILE_SELECT_DROPDOWN_STYLE}
                            onChange={onSelectProfileChange}
                            disabled={isLocked}
                          />
                        )}
                        <div className="fm-profile-actions-grid">
                          <Tooltip
                            title="Create"
                            {...dialogTooltipProps}
                            placement="top"
                            arrow={{ pointAtCenter: true }}
                          >
                            <Button
                              block
                              className="fm-profile-action-btn"
                              icon={<PlusOutlined />}
                              onClick={onOpenCreateProfile}
                              disabled={isLocked}
                              aria-label="Create profile"
                            />
                          </Tooltip>
                          <Tooltip
                            title="Duplicate"
                            {...dialogTooltipProps}
                            placement="top"
                            arrow={{ pointAtCenter: true }}
                          >
                            <Button
                              block
                              className="fm-profile-action-btn"
                              icon={<CopyOutlined />}
                              onClick={duplicateSelectedProfile}
                              disabled={isLocked || !selectedProfile}
                              aria-label="Duplicate selected profile"
                            />
                          </Tooltip>
                          <Tooltip
                            title="Rename"
                            {...dialogTooltipProps}
                            placement="top"
                            arrow={{ pointAtCenter: true }}
                          >
                            <Button
                              block
                              className="fm-profile-action-btn"
                              icon={<EditOutlined />}
                              onClick={onOpenRenameProfile}
                              disabled={isLocked || !selectedProfile}
                              aria-label="Rename selected profile"
                            />
                          </Tooltip>
                          <Tooltip
                            title="Delete"
                            {...dialogTooltipProps}
                            placement="top"
                            arrow={{ pointAtCenter: true }}
                          >
                            <Popconfirm
                              title="Delete profile?"
                              description="This cannot be undone."
                              okText="Delete"
                              cancelText="Cancel"
                              okButtonProps={{ danger: true }}
                              onConfirm={deleteSelectedProfile}
                              disabled={isLocked || !selectedProfile}
                              getPopupContainer={getDialogPopupContainer}
                              zIndex={2147483647}
                            >
                              <Button
                                danger
                                block
                                className="fm-profile-action-btn"
                                icon={<DeleteOutlined />}
                                disabled={isLocked || !selectedProfile}
                                aria-label="Delete selected profile"
                              />
                            </Popconfirm>
                          </Tooltip>
                        </div>
                        <Typography.Text type="secondary">
                          Choosing a profile loads its shapes, shortcuts, and
                          settings immediately.
                        </Typography.Text>
                        <Typography.Text type="secondary">
                          Profile actions: Create new, Duplicate, Rename, or
                          Delete the selected profile. Changes are saved
                          automatically.
                        </Typography.Text>
                      </Space>
                    </Form.Item>

                    <Form.Item label="Shape Palette">
                      <Space
                        direction="vertical"
                        size={6}
                        className="fm-w-full"
                      >
                        <div
                          className="fm-shape-palette-grid"
                          role="listbox"
                          aria-label="Shape palette"
                        >
                          {BASIC_PALETTE_SHAPES.map((shapeType) => {
                            const isSelected =
                              selectedPaletteShape === shapeType;
                            const label = SHAPE_LABELS[shapeType];
                            return (
                              <Tooltip
                                key={shapeType}
                                title={`Select ${label}`}
                                {...dialogTooltipProps}
                              >
                                <div
                                  role="option"
                                  aria-selected={isSelected}
                                  aria-disabled={isLocked}
                                  tabIndex={isLocked ? -1 : 0}
                                  className={`fm-shape-palette-tile${isSelected ? " fm-shape-palette-tile-selected" : ""}${isLocked ? " fm-shape-palette-tile-disabled" : ""}`}
                                  onClick={() => {
                                    if (isLocked) return;
                                    setSelectedPaletteShape(shapeType);
                                  }}
                                  onKeyDown={(event) => {
                                    if (isLocked) return;
                                    if (
                                      event.key === "Enter" ||
                                      event.key === " "
                                    ) {
                                      event.preventDefault();
                                      setSelectedPaletteShape(shapeType);
                                    }
                                  }}
                                >
                                  <Space
                                    direction="vertical"
                                    size={2}
                                    align="center"
                                    className="fm-shape-palette-btn-content"
                                  >
                                    <PaletteShapeIcon shape={shapeType} />
                                    <span className="fm-shape-palette-label">
                                      {label}
                                    </span>
                                  </Space>
                                </div>
                              </Tooltip>
                            );
                          })}
                        </div>
                        <Typography.Text type="secondary">
                          Pick a base shape here, then use Add Key Map to place
                          it on the canvas.
                        </Typography.Text>
                      </Space>
                    </Form.Item>

                    <Form.Item label="Strict Input Passthrough">
                      <Space
                        direction="vertical"
                        size={4}
                        className="fm-w-full"
                      >
                        <Switch
                          checked={settings.strictPassthrough}
                          disabled={isLocked}
                          onChange={(checked) => {
                            setSettings((prev) => ({
                              ...prev,
                              strictPassthrough: checked,
                            }));
                          }}
                        />
                        <Typography.Text type="secondary">
                          In Stop mode, gameplay input passes through unless it
                          matches a mapper shortcut or mapped shape binding.
                        </Typography.Text>
                      </Space>
                    </Form.Item>

                    <Form.Item label="Snap Line Indicators">
                      <Space
                        direction="vertical"
                        size={4}
                        className="fm-w-full"
                      >
                        <Switch
                          checked={settings.showSnapIndicators}
                          disabled={isLocked}
                          onChange={(checked) => {
                            setSettings((prev) => ({
                              ...prev,
                              showSnapIndicators: checked,
                            }));
                          }}
                        />
                        <Typography.Text type="secondary">
                          Shows or hides snap alignment guide lines when snap
                          alignment is active.
                        </Typography.Text>
                      </Space>
                    </Form.Item>

                    <Form.Item label="Opacity">
                      <Slider
                        min={0.05}
                        max={1}
                        step={0.05}
                        value={draftShape.opacity}
                        disabled={isLocked}
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
                      <Typography.Text type="secondary">
                        Controls visibility intensity for all shapes in the
                        active profile.
                      </Typography.Text>
                    </Form.Item>

                    <Divider className="!fm-my-2" />
                    <Form.Item label="Add Key Map Shortcut">
                      <Space
                        direction="vertical"
                        size={4}
                        className="fm-w-full"
                      >
                        <div
                          className={`fm-shortcut-input-shell${settings.addKeyMapShortcut ? " fm-shortcut-input-has-value" : ""}`}
                        >
                          <Input
                            className="fm-global-shortcut-input"
                            value={settings.addKeyMapShortcut}
                            placeholder="Press keys"
                            disabled={isLocked}
                            onKeyDown={(event) => {
                              captureGlobalShortcut(event, "addKeyMapShortcut");
                            }}
                          />
                          {settings.addKeyMapShortcut && (
                            <span
                              className="fm-shortcut-input-overlay"
                              aria-hidden="true"
                            >
                              <ShortcutKeys
                                combo={settings.addKeyMapShortcut}
                              />
                            </span>
                          )}
                        </div>
                        <Typography.Text type="secondary">
                          Shortcut used by the Add Key Map action while in Edit
                          Mode. Default: Alt+Shift+A.
                        </Typography.Text>
                        {globalShortcutErrors.addKeyMapShortcut && (
                          <Typography.Text type="danger">
                            {globalShortcutErrors.addKeyMapShortcut}
                          </Typography.Text>
                        )}
                      </Space>
                    </Form.Item>

                    <Form.Item label="Hide Shapes Shortcut">
                      <Space
                        direction="vertical"
                        size={4}
                        className="fm-w-full"
                      >
                        <div
                          className={`fm-shortcut-input-shell${settings.toggleShapesShortcut ? " fm-shortcut-input-has-value" : ""}`}
                        >
                          <Input
                            className="fm-global-shortcut-input"
                            value={settings.toggleShapesShortcut}
                            placeholder="Press keys"
                            disabled={isLocked}
                            onKeyDown={(event) => {
                              captureGlobalShortcut(
                                event,
                                "toggleShapesShortcut",
                              );
                            }}
                          />
                          {settings.toggleShapesShortcut && (
                            <span
                              className="fm-shortcut-input-overlay"
                              aria-hidden="true"
                            >
                              <ShortcutKeys
                                combo={settings.toggleShapesShortcut}
                              />
                            </span>
                          )}
                        </div>
                        <Typography.Text type="secondary">
                          Shows or hides visual shape overlays without modifying
                          profile mappings.
                        </Typography.Text>
                        {globalShortcutErrors.toggleShapesShortcut && (
                          <Typography.Text type="danger">
                            {globalShortcutErrors.toggleShapesShortcut}
                          </Typography.Text>
                        )}
                      </Space>
                    </Form.Item>

                    <Form.Item label="Toggle Opacity 0/100 Shortcut">
                      <Space
                        direction="vertical"
                        size={4}
                        className="fm-w-full"
                      >
                        <div
                          className={`fm-shortcut-input-shell${settings.setZeroOpacityShortcut ? " fm-shortcut-input-has-value" : ""}`}
                        >
                          <Input
                            className="fm-global-shortcut-input"
                            value={settings.setZeroOpacityShortcut}
                            placeholder="Press keys"
                            disabled={isLocked}
                            onKeyDown={(event) => {
                              captureGlobalShortcut(
                                event,
                                "setZeroOpacityShortcut",
                              );
                            }}
                          />
                          {settings.setZeroOpacityShortcut && (
                            <span
                              className="fm-shortcut-input-overlay"
                              aria-hidden="true"
                            >
                              <ShortcutKeys
                                combo={settings.setZeroOpacityShortcut}
                              />
                            </span>
                          )}
                        </div>
                        <Typography.Text type="secondary">
                          Toggles all shape opacity values in the active profile
                          between 0% and 100%.
                        </Typography.Text>
                        {globalShortcutErrors.setZeroOpacityShortcut && (
                          <Typography.Text type="danger">
                            {globalShortcutErrors.setZeroOpacityShortcut}
                          </Typography.Text>
                        )}
                      </Space>
                    </Form.Item>
                  </Form>
                  {dialogFooter}
                </div>
              </div>

              <div className="fm-dialog-slider-pane">
                <div className="fm-dialog-form-shell">
                  {renderPaneTop()}
                  <div className="fm-key-trigger-pane-shell">
                    <KeyTriggerTab
                      profiles={keyTriggerProfiles}
                      onProfilesChange={onKeyTriggerProfilesChange}
                      isConfigLocked={!settings.editMode}
                      onEditorOpenChange={setIsKeyTriggerEditorOpen}
                      backRequestVersion={keyTriggerBackRequestVersion}
                      selectedProfileId={keyTriggerSelectedProfileId ?? null}
                      onSelectedProfileIdChange={
                        onKeyTriggerSelectedProfileIdChange
                      }
                    />
                  </div>
                  {dialogFooter}
                </div>
              </div>

              <div className="fm-dialog-slider-pane">
                <div className="fm-dialog-form-shell">
                  {renderPaneTop({
                    hideUtilityControls: true,
                  })}
                  <Form
                    layout="vertical"
                    disabled={isLocked}
                    className={
                      isLocked
                        ? "fm-settings-form fm-settings-form-locked"
                        : "fm-settings-form"
                    }
                    style={{ direction: "ltr", padding: "12px 16px 0" }}
                  >
                    <Form.Item>
                      <Space
                        direction="vertical"
                        size={4}
                        className="fm-w-full"
                      >
                        <Typography.Text strong>Settings</Typography.Text>
                        <Typography.Text type="secondary">
                          Utility-wide shortcuts and runtime behavior are
                          configured here without leaving the Flyff Utility
                          dialog.
                        </Typography.Text>
                      </Space>
                    </Form.Item>

                    <Form.Item label="Toggle Dialog Shortcut">
                      <Space
                        direction="vertical"
                        size={4}
                        className="fm-w-full"
                      >
                        <div
                          className={`fm-shortcut-input-shell${settings.toggleDialogShortcut ? " fm-shortcut-input-has-value" : ""}`}
                        >
                          <Input
                            className="fm-global-shortcut-input fm-toggle-dialog-shortcut-input"
                            value={settings.toggleDialogShortcut}
                            placeholder="Press keys"
                            onKeyDown={(event) => {
                              captureGlobalShortcut(
                                event,
                                "toggleDialogShortcut",
                              );
                            }}
                          />
                          {settings.toggleDialogShortcut && (
                            <span
                              className="fm-shortcut-input-overlay"
                              aria-hidden="true"
                            >
                              <ShortcutKeys
                                combo={settings.toggleDialogShortcut}
                              />
                            </span>
                          )}
                        </div>
                        <Typography.Text type="secondary">
                          Shows or hides the Flyff Utility dialog. Default:
                          Alt+Shift+M.
                        </Typography.Text>
                        {globalShortcutErrors.toggleDialogShortcut && (
                          <Typography.Text type="danger">
                            {globalShortcutErrors.toggleDialogShortcut}
                          </Typography.Text>
                        )}
                      </Space>
                    </Form.Item>

                    <Form.Item label="Start/Stop Shortcut">
                      <Space
                        direction="vertical"
                        size={4}
                        className="fm-w-full"
                      >
                        <div
                          className={`fm-shortcut-input-shell${settings.toggleModeShortcut ? " fm-shortcut-input-has-value" : ""}`}
                        >
                          <Input
                            className="fm-global-shortcut-input"
                            value={settings.toggleModeShortcut}
                            placeholder="Press keys"
                            disabled={isLocked}
                            onKeyDown={(event) => {
                              captureGlobalShortcut(
                                event,
                                "toggleModeShortcut",
                              );
                            }}
                          />
                          {settings.toggleModeShortcut && (
                            <span
                              className="fm-shortcut-input-overlay"
                              aria-hidden="true"
                            >
                              <ShortcutKeys
                                combo={settings.toggleModeShortcut}
                              />
                            </span>
                          )}
                        </div>
                        <Typography.Text type="secondary">
                          Toggles mapper state between Edit Mode (Start) and
                          trigger mode (Stop).
                        </Typography.Text>
                        {globalShortcutErrors.toggleModeShortcut && (
                          <Typography.Text type="danger">
                            {globalShortcutErrors.toggleModeShortcut}
                          </Typography.Text>
                        )}
                      </Space>
                    </Form.Item>

                    <Form.Item label="Focus Canvas Shortcut">
                      <Space
                        direction="vertical"
                        size={4}
                        className="fm-w-full"
                      >
                        <div
                          className={`fm-shortcut-input-shell${settings.focusCanvasShortcut ? " fm-shortcut-input-has-value" : ""}`}
                        >
                          <Input
                            className="fm-global-shortcut-input"
                            value={settings.focusCanvasShortcut}
                            placeholder="Press keys"
                            disabled={isLocked}
                            onKeyDown={(event) => {
                              captureGlobalShortcut(
                                event,
                                "focusCanvasShortcut",
                              );
                            }}
                          />
                          {settings.focusCanvasShortcut && (
                            <span
                              className="fm-shortcut-input-overlay"
                              aria-hidden="true"
                            >
                              <ShortcutKeys
                                combo={settings.focusCanvasShortcut}
                              />
                            </span>
                          )}
                        </div>
                        <Typography.Text type="secondary">
                          Moves focus back to the game canvas so keyboard
                          gameplay input works immediately.
                        </Typography.Text>
                        {globalShortcutErrors.focusCanvasShortcut && (
                          <Typography.Text type="danger">
                            {globalShortcutErrors.focusCanvasShortcut}
                          </Typography.Text>
                        )}
                      </Space>
                    </Form.Item>

                    <Form.Item label="Auto-Stop (seconds)">
                      <Space
                        direction="vertical"
                        size={4}
                        className="fm-w-full"
                        style={{ width: "100%" }}
                      >
                        <div className="fm-full-width-input-number-wrap">
                          <InputNumber
                            ref={autoStopInputRef}
                            className="fm-full-width-input-number"
                            min={30}
                            step={10}
                            value={settings.autoStopSeconds ?? undefined}
                            placeholder="Disabled"
                            style={{ width: "100%" }}
                            onChange={(value) => {
                              setSettings((prev) => ({
                                ...prev,
                                autoStopSeconds:
                                  value !== null && value >= 30 ? value : null,
                              }));
                            }}
                            addonAfter="s"
                          />
                        </div>
                        <Typography.Text type="secondary">
                          Script automatically stops if no activity is detected
                          for this duration. Leave empty to disable.
                        </Typography.Text>
                      </Space>
                    </Form.Item>

                    <Form.Item label="CAPTCHA Detection Action">
                      <Space
                        direction="vertical"
                        size={4}
                        className="fm-w-full"
                      >
                        <Select
                          value={recaptchaActionMode}
                          getPopupContainer={getDialogPopupContainer}
                          dropdownStyle={PROFILE_SELECT_DROPDOWN_STYLE}
                          options={[
                            {
                              value: "off",
                              label: "Disabled",
                            },
                            {
                              value: "notify-only",
                              label: "Notify only",
                            },
                            {
                              value: "stop-only",
                              label: "Stop script only",
                            },
                            {
                              value: "stop-and-notify",
                              label: "Stop script and notify",
                            },
                          ]}
                          onChange={(value) => {
                            const nextMode = String(value);
                            setSettings((prev) => ({
                              ...prev,
                              notifyOnRecaptcha:
                                nextMode === "notify-only" ||
                                nextMode === "stop-and-notify",
                              stopOnRecaptcha:
                                nextMode === "stop-only" ||
                                nextMode === "stop-and-notify",
                            }));
                          }}
                        />
                        <Typography.Text type="secondary">
                          Sets what happens when a reCAPTCHA or hCaptcha element
                          is detected.
                        </Typography.Text>
                      </Space>
                    </Form.Item>

                    <Form.Item label="Sync Mouse Events Across Tabs">
                      <Space
                        direction="vertical"
                        size={4}
                        className="fm-w-full"
                      >
                        <Switch
                          checked={settings.syncMouseEvents}
                          onChange={(checked) => {
                            setSettings((prev) => ({
                              ...prev,
                              syncMouseEvents: checked,
                            }));
                          }}
                        />
                        {settings.syncMouseEvents && (
                          <Form.Item
                            label={
                              <Space size={6} align="center">
                                <span>Mouse Position Sync Mode</span>
                                <Tooltip
                                  title={
                                    settings.mouseSyncPositionMode === "ratio"
                                      ? "Ratio mode keeps the synced cursor aligned when source and target Flyff windows are different sizes."
                                      : "Actual mode works best when your Flyff windows are roughly the same size."
                                  }
                                  {...dialogTooltipProps}
                                >
                                  <QuestionOutlined />
                                </Tooltip>
                              </Space>
                            }
                            style={{ marginBottom: 0 }}
                          >
                            <Space
                              direction="vertical"
                              size={4}
                              className="fm-w-full"
                            >
                              <Select
                                value={settings.mouseSyncPositionMode}
                                getPopupContainer={(triggerNode) =>
                                  (triggerNode.closest(
                                    ".fm-dialog",
                                  ) as HTMLElement | null) ?? document.body
                                }
                                dropdownStyle={{
                                  ...PROFILE_SELECT_DROPDOWN_STYLE,
                                  zIndex: 2147483647,
                                }}
                                options={[
                                  {
                                    value: "actual",
                                    label: "Actual (pixels)",
                                  },
                                  {
                                    value: "ratio",
                                    label: "Ratio (%)",
                                  },
                                ]}
                                onChange={(value) => {
                                  setSettings((prev) => ({
                                    ...prev,
                                    mouseSyncPositionMode:
                                      value === "ratio" ? "ratio" : "actual",
                                  }));
                                }}
                              />
                              <Typography.Text type="secondary">
                                {settings.mouseSyncPositionMode === "ratio"
                                  ? "Ratio mode keeps the synced cursor aligned on smaller or differently sized windows."
                                  : "Actual mode works best when your Flyff windows are about the same size."}
                              </Typography.Text>
                            </Space>
                          </Form.Item>
                        )}
                        <Typography.Text type="secondary">
                          Mirrors mouse position, click, drag, and wheel
                          interactions to selected Flyff tabs. Use Ratio mode
                          when target windows have different sizes so cursor
                          mapping remains visible.
                        </Typography.Text>
                      </Space>
                    </Form.Item>

                    <Form.Item label="Experimental Features">
                      <Space
                        direction="vertical"
                        size={4}
                        className="fm-w-full"
                      >
                        <Switch
                          checked={settings.experimentalFeaturesEnabled}
                          onChange={(checked) => {
                            setSettings((prev) => ({
                              ...prev,
                              experimentalFeaturesEnabled: checked,
                            }));
                          }}
                        />
                        <Typography.Text type="secondary">
                          Enables experimental utilities: Auto-Holy, Auto-Pills,
                          and Auto-Awaken.
                        </Typography.Text>
                      </Space>
                    </Form.Item>

                    {settings.experimentalFeaturesEnabled && (
                      <Form.Item label="Auto-Holy">
                        <Space
                          direction="vertical"
                          size={6}
                          className="fm-w-full"
                        >
                          <Switch
                            checked={settings.autoHoly.enabled}
                            onChange={(checked) => {
                              setSettings((prev) => ({
                                ...prev,
                                autoHoly: {
                                  ...prev.autoHoly,
                                  enabled: checked,
                                },
                              }));
                            }}
                          />
                          {settings.autoHoly.enabled && (
                            <>
                              <Form.Item
                                label="Debuff Type"
                                style={{ marginBottom: 0 }}
                              >
                                <Select
                                  value={settings.autoHoly.debuffType}
                                  getPopupContainer={getDialogPopupContainer}
                                  dropdownStyle={PROFILE_SELECT_DROPDOWN_STYLE}
                                  options={[
                                    { value: "all", label: "All" },
                                    { value: "root", label: "Root" },
                                    { value: "stun", label: "Stun" },
                                  ]}
                                  onChange={(value) => {
                                    setSettings((prev) => ({
                                      ...prev,
                                      autoHoly: {
                                        ...prev.autoHoly,
                                        debuffType: value as AutoHolyDebuffType,
                                      },
                                    }));
                                  }}
                                />
                              </Form.Item>
                              <Form.Item
                                label="Show Auto-Holy Debug Overlay"
                                style={{ marginBottom: 0 }}
                              >
                                <Switch
                                  checked={
                                    settings.autoHoly.debugOverlayEnabled
                                  }
                                  onChange={(checked) => {
                                    setSettings((prev) => ({
                                      ...prev,
                                      autoHoly: {
                                        ...prev.autoHoly,
                                        debugOverlayEnabled: checked,
                                      },
                                    }));
                                  }}
                                />
                              </Form.Item>
                              <Form.Item
                                label="Debuff Reference Area"
                                style={{ marginBottom: 0 }}
                              >
                                <Space
                                  direction="vertical"
                                  size={4}
                                  className="fm-w-full"
                                >
                                  <Space wrap>
                                    <Button
                                      onClick={() => {
                                        if (
                                          automationRegionCaptureTarget ===
                                          "autoHoly"
                                        ) {
                                          onCancelAutomationRegionCapture();
                                          return;
                                        }

                                        onStartAutomationRegionCapture(
                                          "autoHoly",
                                        );
                                      }}
                                      disabled={
                                        automationRegionCaptureTarget ===
                                        "autoPills"
                                      }
                                    >
                                      {automationRegionCaptureTarget ===
                                      "autoHoly"
                                        ? "Cancel Capture"
                                        : settings.autoHoly.scanRegion
                                          ? "Recapture Region"
                                          : "Capture Region"}
                                    </Button>
                                    <Button
                                      onClick={() => {
                                        onClearAutomationRegionCapture(
                                          "autoHoly",
                                        );
                                      }}
                                      disabled={!settings.autoHoly.scanRegion}
                                    >
                                      Clear Region
                                    </Button>
                                  </Space>
                                  <Typography.Text type="secondary">
                                    {automationRegionCaptureTarget ===
                                    "autoHoly"
                                      ? "Drag over the buff icons area on the game canvas to capture the root/stun detection zone."
                                      : formatScanRegionSummary(
                                          settings.autoHoly.scanRegion,
                                        )}
                                  </Typography.Text>
                                </Space>
                              </Form.Item>
                              <Form.Item
                                label="Holy Key"
                                style={{ marginBottom: 0 }}
                              >
                                <div
                                  className={`fm-shortcut-input-shell${settings.autoHoly.holyKey ? " fm-shortcut-input-has-value" : ""}`}
                                >
                                  <Input
                                    className="fm-global-shortcut-input"
                                    value={settings.autoHoly.holyKey}
                                    placeholder="Click or press keys"
                                    onKeyDown={(event) => {
                                      const captured =
                                        buildAutoFeatureShortcut(event);
                                      if (captured === "") {
                                        if (event.key === "Escape") {
                                          setSettings((prev) => ({
                                            ...prev,
                                            autoHoly: {
                                              ...prev.autoHoly,
                                              holyKey: "",
                                            },
                                          }));
                                        }
                                        return;
                                      }
                                      setSettings((prev) => ({
                                        ...prev,
                                        autoHoly: {
                                          ...prev.autoHoly,
                                          holyKey: captured,
                                        },
                                      }));
                                    }}
                                    onMouseDown={(event) => {
                                      if (
                                        event.button !== 0 &&
                                        event.button !== 2
                                      )
                                        return;
                                      const input =
                                        event.currentTarget as HTMLInputElement;
                                      const wasFocused =
                                        document.activeElement === input;
                                      event.preventDefault();
                                      event.stopPropagation();
                                      input.focus({ preventScroll: true });

                                      if (!wasFocused) {
                                        return;
                                      }

                                      const now = Date.now();
                                      const prev = holyKeyLastClickRef.current;
                                      const isDouble =
                                        prev.button === event.button &&
                                        now - prev.time < 360;
                                      holyKeyLastClickRef.current = {
                                        button: event.button,
                                        time: now,
                                      };
                                      const baseLabel =
                                        event.button === 0
                                          ? isDouble
                                            ? "Double Left Click"
                                            : "Left Click"
                                          : isDouble
                                            ? "Double Right Click"
                                            : "Right Click";
                                      const captured = [
                                        ...buildMouseModifiers(event),
                                        baseLabel,
                                      ].join("+");
                                      setSettings((prev) => ({
                                        ...prev,
                                        autoHoly: {
                                          ...prev.autoHoly,
                                          holyKey: captured,
                                        },
                                      }));
                                    }}
                                    onWheel={(event) => {
                                      const input =
                                        event.currentTarget as HTMLInputElement;
                                      const wasFocused =
                                        document.activeElement === input;
                                      event.stopPropagation();
                                      if (!wasFocused) {
                                        input.focus({ preventScroll: true });
                                        return;
                                      }

                                      const captured =
                                        buildWheelShortcut(event);
                                      if (!captured) return;
                                      setSettings((prev) => ({
                                        ...prev,
                                        autoHoly: {
                                          ...prev.autoHoly,
                                          holyKey: captured,
                                        },
                                      }));
                                    }}
                                    onContextMenu={(event) =>
                                      event.preventDefault()
                                    }
                                  />
                                  {settings.autoHoly.holyKey && (
                                    <span
                                      className="fm-shortcut-input-overlay"
                                      aria-hidden="true"
                                    >
                                      <ShortcutKeys
                                        combo={settings.autoHoly.holyKey}
                                      />
                                    </span>
                                  )}
                                </div>
                              </Form.Item>
                            </>
                          )}
                          <Typography.Text type="secondary">
                            Automatically uses the Scroll of Holy when a root or
                            stun debuff is detected on screen.
                          </Typography.Text>
                        </Space>
                      </Form.Item>
                    )}

                    {settings.experimentalFeaturesEnabled && (
                      <Form.Item label="Auto-Pills">
                        <Space
                          direction="vertical"
                          size={6}
                          className="fm-w-full"
                        >
                          <Switch
                            checked={settings.autoPills.enabled}
                            onChange={(checked) => {
                              setSettings((prev) => ({
                                ...prev,
                                autoPills: {
                                  ...prev.autoPills,
                                  enabled: checked,
                                },
                              }));
                            }}
                          />
                          {settings.autoPills.enabled && (
                            <>
                              <Form.Item
                                label={`HP Threshold: ${settings.autoPills.hpThreshold}%`}
                                style={{ marginBottom: 0 }}
                              >
                                <Slider
                                  min={1}
                                  max={99}
                                  step={1}
                                  value={settings.autoPills.hpThreshold}
                                  onChange={(value) => {
                                    setSettings((prev) => ({
                                      ...prev,
                                      autoPills: {
                                        ...prev.autoPills,
                                        hpThreshold: value,
                                      },
                                    }));
                                  }}
                                  marks={{
                                    25: "25%",
                                    50: "50%",
                                    75: "75%",
                                  }}
                                />
                              </Form.Item>
                              <Form.Item
                                label="Show HP Debug Overlay"
                                style={{ marginBottom: 0 }}
                              >
                                <Switch
                                  checked={
                                    settings.autoPills.debugOverlayEnabled
                                  }
                                  onChange={(checked) => {
                                    setSettings((prev) => ({
                                      ...prev,
                                      autoPills: {
                                        ...prev.autoPills,
                                        debugOverlayEnabled: checked,
                                      },
                                    }));
                                  }}
                                />
                              </Form.Item>
                              <Form.Item
                                label="HP Reference Area"
                                style={{ marginBottom: 0 }}
                              >
                                <Space
                                  direction="vertical"
                                  size={4}
                                  className="fm-w-full"
                                >
                                  <Space wrap>
                                    <Button
                                      onClick={() => {
                                        if (
                                          automationRegionCaptureTarget ===
                                          "autoPills"
                                        ) {
                                          onCancelAutomationRegionCapture();
                                          return;
                                        }

                                        onStartAutomationRegionCapture(
                                          "autoPills",
                                        );
                                      }}
                                      disabled={
                                        automationRegionCaptureTarget ===
                                        "autoHoly"
                                      }
                                    >
                                      {automationRegionCaptureTarget ===
                                      "autoPills"
                                        ? "Cancel Capture"
                                        : settings.autoPills.scanRegion
                                          ? "Recapture Region"
                                          : "Capture Region"}
                                    </Button>
                                    <Button
                                      onClick={() => {
                                        onClearAutomationRegionCapture(
                                          "autoPills",
                                        );
                                      }}
                                      disabled={!settings.autoPills.scanRegion}
                                    >
                                      Clear Region
                                    </Button>
                                  </Space>
                                  <Typography.Text type="secondary">
                                    {automationRegionCaptureTarget ===
                                    "autoPills"
                                      ? "Drag over the character window HP bar area on the game canvas to capture the HP detection zone."
                                      : formatScanRegionSummary(
                                          settings.autoPills.scanRegion,
                                        )}
                                  </Typography.Text>
                                </Space>
                              </Form.Item>
                              <Form.Item
                                label="Pill Key"
                                style={{ marginBottom: 0 }}
                              >
                                <div
                                  className={`fm-shortcut-input-shell${settings.autoPills.pillKey ? " fm-shortcut-input-has-value" : ""}`}
                                >
                                  <Input
                                    className="fm-global-shortcut-input"
                                    value={settings.autoPills.pillKey}
                                    placeholder="Click or press keys"
                                    onKeyDown={(event) => {
                                      const captured =
                                        buildAutoFeatureShortcut(event);
                                      if (captured === "") {
                                        if (event.key === "Escape") {
                                          setSettings((prev) => ({
                                            ...prev,
                                            autoPills: {
                                              ...prev.autoPills,
                                              pillKey: "",
                                            },
                                          }));
                                        }
                                        return;
                                      }
                                      setSettings((prev) => ({
                                        ...prev,
                                        autoPills: {
                                          ...prev.autoPills,
                                          pillKey: captured,
                                        },
                                      }));
                                    }}
                                    onMouseDown={(event) => {
                                      if (
                                        event.button !== 0 &&
                                        event.button !== 2
                                      )
                                        return;
                                      const input =
                                        event.currentTarget as HTMLInputElement;
                                      const wasFocused =
                                        document.activeElement === input;
                                      event.preventDefault();
                                      event.stopPropagation();
                                      input.focus({ preventScroll: true });

                                      if (!wasFocused) {
                                        return;
                                      }

                                      const now = Date.now();
                                      const prev = pillKeyLastClickRef.current;
                                      const isDouble =
                                        prev.button === event.button &&
                                        now - prev.time < 360;
                                      pillKeyLastClickRef.current = {
                                        button: event.button,
                                        time: now,
                                      };
                                      const baseLabel =
                                        event.button === 0
                                          ? isDouble
                                            ? "Double Left Click"
                                            : "Left Click"
                                          : isDouble
                                            ? "Double Right Click"
                                            : "Right Click";
                                      const captured = [
                                        ...buildMouseModifiers(event),
                                        baseLabel,
                                      ].join("+");
                                      setSettings((prev) => ({
                                        ...prev,
                                        autoPills: {
                                          ...prev.autoPills,
                                          pillKey: captured,
                                        },
                                      }));
                                    }}
                                    onWheel={(event) => {
                                      const input =
                                        event.currentTarget as HTMLInputElement;
                                      const wasFocused =
                                        document.activeElement === input;
                                      event.stopPropagation();
                                      if (!wasFocused) {
                                        input.focus({ preventScroll: true });
                                        return;
                                      }

                                      const captured =
                                        buildWheelShortcut(event);
                                      if (!captured) return;
                                      setSettings((prev) => ({
                                        ...prev,
                                        autoPills: {
                                          ...prev.autoPills,
                                          pillKey: captured,
                                        },
                                      }));
                                    }}
                                    onContextMenu={(event) =>
                                      event.preventDefault()
                                    }
                                  />
                                  {settings.autoPills.pillKey && (
                                    <span
                                      className="fm-shortcut-input-overlay"
                                      aria-hidden="true"
                                    >
                                      <ShortcutKeys
                                        combo={settings.autoPills.pillKey}
                                      />
                                    </span>
                                  )}
                                </div>
                              </Form.Item>
                            </>
                          )}
                          <Typography.Text type="secondary">
                            Automatically uses pills when HP drops to or below
                            the set threshold percentage. Enable HP Debug
                            Overlay while calibrating to see live detected HP
                            values.
                          </Typography.Text>
                        </Space>
                      </Form.Item>
                    )}
                  </Form>
                  {dialogFooter}
                </div>
              </div>

              <div className="fm-dialog-slider-pane">
                <div className="fm-dialog-form-shell">
                  {renderPaneTop()}
                  <AutoAwakenTab
                    config={settings.autoAwaken}
                    setConfig={(updater) => {
                      setSettings((prev) => ({
                        ...prev,
                        autoAwaken:
                          typeof updater === "function"
                            ? updater(prev.autoAwaken)
                            : updater,
                      }));
                    }}
                    automationRunning={autoAwakenRunning}
                    automationStatus={autoAwakenStatus}
                    automationLogs={autoAwakenLogs}
                    automationRegionCaptureActive={
                      automationRegionCaptureTarget === "autoAwaken"
                    }
                    onStartCapture={() =>
                      onStartAutomationRegionCapture("autoAwaken")
                    }
                    onCancelCapture={onCancelAutomationRegionCapture}
                    onClearRegion={() =>
                      onClearAutomationRegionCapture("autoAwaken")
                    }
                    onStart={onStartAutoAwaken}
                    onStop={onStopAutoAwaken}
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Modal
          title="Mapper Shortcuts & Features"
          open={isHelpDialogOpen}
          onCancel={() => setIsHelpDialogOpen(false)}
          wrapClassName="fm-ltr-modal fm-shortcuts-features-modal"
          footer={[
            <Button key="close" onClick={() => setIsHelpDialogOpen(false)}>
              Close
            </Button>,
          ]}
          width={680}
          zIndex={2147483647}
        >
          <div style={{ maxHeight: 420, overflow: "auto", paddingRight: 4 }}>
            {helpDialogContent}
          </div>
        </Modal>

        <div
          className="fm-dialog-manual-resize-layer"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 2147483647,
          }}
        >
          <div
            className="fm-dialog-manual-handle fm-dialog-manual-handle-n"
            style={{
              position: "absolute",
              top: 0,
              bottom: "auto",
              left: 10,
              right: 10,
              height: 10,
              cursor: "ns-resize",
              pointerEvents: "auto",
            }}
            onPointerDown={(event) => startDialogResize("n", event)}
          />
          <div
            className="fm-dialog-manual-handle fm-dialog-manual-handle-e"
            style={{
              position: "absolute",
              left: "auto",
              right: -2,
              top: 10,
              bottom: 10,
              width: 8,
              cursor: "ew-resize",
              pointerEvents: "auto",
            }}
            onPointerDown={(event) => startDialogResize("e", event)}
          />
          <div
            className="fm-dialog-manual-handle fm-dialog-manual-handle-s"
            style={{
              position: "absolute",
              top: "auto",
              bottom: 0,
              left: 10,
              right: 10,
              height: 10,
              cursor: "ns-resize",
              pointerEvents: "auto",
            }}
            onPointerDown={(event) => startDialogResize("s", event)}
          />
          <div
            className="fm-dialog-manual-handle fm-dialog-manual-handle-w"
            style={{
              position: "absolute",
              left: -2,
              right: "auto",
              top: 10,
              bottom: 10,
              width: 8,
              cursor: "ew-resize",
              pointerEvents: "auto",
            }}
            onPointerDown={(event) => startDialogResize("w", event)}
          />
          <div
            className="fm-dialog-manual-handle fm-dialog-manual-handle-ne"
            style={{
              position: "absolute",
              top: 0,
              bottom: "auto",
              left: "auto",
              right: -2,
              width: 12,
              height: 12,
              cursor: "nesw-resize",
              pointerEvents: "auto",
            }}
            onPointerDown={(event) => startDialogResize("ne", event)}
          />
          <div
            className="fm-dialog-manual-handle fm-dialog-manual-handle-nw"
            style={{
              position: "absolute",
              top: 0,
              left: -2,
              right: "auto",
              bottom: "auto",
              width: 12,
              height: 12,
              cursor: "nwse-resize",
              pointerEvents: "auto",
            }}
            onPointerDown={(event) => startDialogResize("nw", event)}
          />
          <div
            className="fm-dialog-manual-handle fm-dialog-manual-handle-se"
            style={{
              position: "absolute",
              left: "auto",
              right: -2,
              top: "auto",
              bottom: 0,
              width: 12,
              height: 12,
              cursor: "nwse-resize",
              pointerEvents: "auto",
            }}
            onPointerDown={(event) => startDialogResize("se", event)}
          />
          <div
            className="fm-dialog-manual-handle fm-dialog-manual-handle-sw"
            style={{
              position: "absolute",
              left: -2,
              right: "auto",
              top: "auto",
              bottom: 0,
              width: 12,
              height: 12,
              cursor: "nesw-resize",
              pointerEvents: "auto",
            }}
            onPointerDown={(event) => startDialogResize("sw", event)}
          />
        </div>
      </Rnd>
    </ConfigProvider>
  );
};
