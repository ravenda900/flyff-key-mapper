import {
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  CaretRightOutlined,
  PlusOutlined,
  QuestionOutlined,
  ReloadOutlined,
  StopOutlined,
} from "@ant-design/icons";
import {
  Button,
  Card,
  Divider,
  Form,
  Input,
  Modal,
  Select,
  Segmented,
  Slider,
  Space,
  Switch,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  SetStateAction,
} from "react";
import { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import type {
  MapperSettings,
  MappingProfile,
  ShapeMapping,
  ShapeType,
} from "../../types";
import {
  BASIC_PALETTE_SHAPES,
  OVERLAY_SHORTCUT,
  PROFILE_SELECT_DROPDOWN_STYLE,
  SHAPE_LABELS,
} from "../constants";
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
    field:
      | "addKeyMapShortcut"
      | "toggleModeShortcut"
      | "focusCanvasShortcut"
      | "toggleShapesShortcut"
      | "setZeroOpacityShortcut",
  ) => void;
};

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
}: Props) => {
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
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

  const MIN_DIALOG_WIDTH = 360;
  const MIN_DIALOG_HEIGHT = 430;

  const dialogTooltipProps = {
    getPopupContainer: (triggerNode: HTMLElement) =>
      (triggerNode.closest(".ant-card-body") as HTMLElement | null) ??
      document.body,
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
        undo/redo for deleted shapes.
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
        Undo Delete: <ShortcutKeys combo="Ctrl+Z" /> or{" "}
        <ShortcutKeys combo="Cmd+Z" />
      </Typography.Text>
      <Typography.Text type="secondary">
        Redo Delete: <ShortcutKeys combo="Ctrl+Y" /> or{" "}
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

  if (!overlayVisible || !dialogVisible || isTransformingShape) {
    return null;
  }

  return (
    <Rnd
      className="fm-dialog fm-z-[2147483645]"
      size={{ width: dialogRect.width, height: dialogRect.height }}
      default={{
        x: dialogRect.x,
        y: dialogRect.y,
        width: dialogRect.width,
        height: dialogRect.height,
      }}
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
          <Space size={8} align="center" style={{ whiteSpace: "nowrap" }}>
            <Typography.Text strong>Key Mapper</Typography.Text>
          </Space>
        }
        size="small"
        bodyStyle={{
          height: "calc(100% - 46px)",
          overflow: "auto",
          padding: 0,
        }}
        className="fm-panel fm-h-full"
        extra={
          <Space size={8}>
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
            <Tooltip
              title="Reset shortcuts and mapper UI state"
              {...dialogTooltipProps}
            >
              <Button
                type="text"
                size="small"
                onClick={onResetDialogConfiguration}
                icon={<ReloadOutlined />}
                aria-label="Reset mapper configuration"
              />
            </Tooltip>
          </Space>
        }
      >
        <div className="fm-dialog-form-shell">
          <Form
            layout="vertical"
            style={{ direction: "ltr", padding: "12px 16px 0" }}
          >
            <Form.Item>
              <Space direction="vertical" size={8} className="fm-w-full">
                <Tooltip
                  {...dialogTooltipProps}
                  title="Start or stop mapper mode"
                >
                  <Button
                    type="primary"
                    danger={!settings.editMode}
                    block
                    icon={
                      settings.editMode ? (
                        <CaretRightOutlined />
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
                <Tooltip {...dialogTooltipProps} title="Add a new key map">
                  <Button type="dashed" block onClick={addKeyMap}>
                    Add Key Map
                  </Button>
                </Tooltip>
                <Typography.Text type="secondary">
                  Start turns on Edit Mode to add, move, resize, and configure
                  shapes. Stop turns on trigger mode for gameplay use.
                </Typography.Text>
              </Space>
            </Form.Item>

            <Divider className="!fm-my-2" />
            <Typography.Text strong>Mapper Controls</Typography.Text>

            <Form.Item label="Mapping Profile">
              <Space direction="vertical" size={6} className="fm-w-full">
                {profiles.length > 0 && (
                  <Select
                    value={selectedProfile?.id}
                    options={profiles.map((profile) => ({
                      value: profile.id,
                      label: profile.name,
                    }))}
                    getPopupContainer={() => document.body}
                    dropdownStyle={PROFILE_SELECT_DROPDOWN_STYLE}
                    onChange={onSelectProfileChange}
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
                      disabled={!selectedProfile}
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
                      disabled={!selectedProfile}
                      aria-label="Rename selected profile"
                    />
                  </Tooltip>
                  <Tooltip
                    title="Delete"
                    {...dialogTooltipProps}
                    placement="top"
                    arrow={{ pointAtCenter: true }}
                  >
                    <Button
                      danger
                      block
                      className="fm-profile-action-btn"
                      icon={<DeleteOutlined />}
                      onClick={deleteSelectedProfile}
                      disabled={!selectedProfile}
                      aria-label="Delete selected profile"
                    />
                  </Tooltip>
                </div>
                <Typography.Text type="secondary">
                  Choosing a profile loads its shapes, shortcuts, and settings
                  immediately.
                </Typography.Text>
                <Typography.Text type="secondary">
                  Profile actions: Create new, Duplicate, Rename, or Delete the
                  selected profile. Changes are saved automatically.
                </Typography.Text>
              </Space>
            </Form.Item>

            <Form.Item label="Shape Palette">
              <Space direction="vertical" size={6} className="fm-w-full">
                <div
                  className="fm-shape-palette-grid"
                  role="listbox"
                  aria-label="Shape palette"
                >
                  {BASIC_PALETTE_SHAPES.map((shapeType) => {
                    const isSelected = selectedPaletteShape === shapeType;
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
                          aria-disabled={false}
                          tabIndex={0}
                          className={`fm-shape-palette-tile${isSelected ? " fm-shape-palette-tile-selected" : ""}`}
                          onClick={() => {
                            setSelectedPaletteShape(shapeType);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
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
                  Pick a base shape here, then use Add Key Map to place it on
                  the canvas.
                </Typography.Text>
              </Space>
            </Form.Item>

            <Form.Item label="Theme">
              <Segmented
                block
                options={[
                  { label: "Light", value: "light" },
                  { label: "Dark", value: "dark" },
                  { label: "System", value: "system" },
                ]}
                value={settings.theme}
                onChange={handleThemeChange}
              />
              <Typography.Text type="secondary">
                Light and Dark force a fixed theme; System follows your OS
                theme.
              </Typography.Text>
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
                  In Stop mode, gameplay input passes through unless it matches
                  a mapper shortcut or mapped shape binding.
                </Typography.Text>
              </Space>
            </Form.Item>

            <Form.Item label="Snap Line Indicators">
              <Space direction="vertical" size={4} className="fm-w-full">
                <Switch
                  checked={settings.showSnapIndicators}
                  onChange={(checked) => {
                    setSettings((prev) => ({
                      ...prev,
                      showSnapIndicators: checked,
                    }));
                  }}
                />
                <Typography.Text type="secondary">
                  Shows or hides snap alignment guide lines when snap alignment
                  is active.
                </Typography.Text>
              </Space>
            </Form.Item>

            <Form.Item label="Opacity">
              <Slider
                min={0.05}
                max={1}
                step={0.05}
                value={draftShape.opacity}
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
                Controls visibility intensity for all shapes in the active
                profile.
              </Typography.Text>
            </Form.Item>

            <Divider className="!fm-my-2" />
            <Form.Item label="Share Key Maps">
              <Space direction="vertical" size={6} className="fm-w-full">
                <Button
                  type="primary"
                  icon={<CopyOutlined />}
                  block
                  onClick={exportMappings}
                >
                  Copy Mapping JSON
                </Button>
                <Button
                  type="dashed"
                  icon={<DownloadOutlined />}
                  block
                  onClick={() => setImportOpen(true)}
                >
                  Import Mapping JSON
                </Button>
                <Typography.Text type="secondary">
                  Copy exports the active profile only. Import creates new
                  profile entries and does not overwrite your current one.
                </Typography.Text>
              </Space>
            </Form.Item>

            <Form.Item label="Add Key Map Shortcut">
              <Space direction="vertical" size={4}>
                <div
                  className={`fm-shortcut-input-shell${settings.addKeyMapShortcut ? " fm-shortcut-input-has-value" : ""}`}
                >
                  <Input
                    className="fm-global-shortcut-input"
                    value={settings.addKeyMapShortcut}
                    placeholder="Press keys"
                    onKeyDown={(event) => {
                      captureGlobalShortcut(event, "addKeyMapShortcut");
                    }}
                  />
                  {settings.addKeyMapShortcut && (
                    <span
                      className="fm-shortcut-input-overlay"
                      aria-hidden="true"
                    >
                      <ShortcutKeys combo={settings.addKeyMapShortcut} />
                    </span>
                  )}
                </div>
                <Typography.Text type="secondary">
                  Shortcut used by the Add Key Map action while in Edit Mode.
                  Default: Alt+Shift+A.
                </Typography.Text>
              </Space>
            </Form.Item>

            <Form.Item label="Start/Stop Shortcut">
              <Space direction="vertical" size={4} className="fm-w-full">
                <div
                  className={`fm-shortcut-input-shell${settings.toggleModeShortcut ? " fm-shortcut-input-has-value" : ""}`}
                >
                  <Input
                    className="fm-global-shortcut-input"
                    value={settings.toggleModeShortcut}
                    placeholder="Press keys"
                    onKeyDown={(event) => {
                      captureGlobalShortcut(event, "toggleModeShortcut");
                    }}
                  />
                  {settings.toggleModeShortcut && (
                    <span
                      className="fm-shortcut-input-overlay"
                      aria-hidden="true"
                    >
                      <ShortcutKeys combo={settings.toggleModeShortcut} />
                    </span>
                  )}
                </div>
                <Typography.Text type="secondary">
                  Toggles mapper state between Edit Mode (Start) and trigger
                  mode (Stop).
                </Typography.Text>
              </Space>
            </Form.Item>

            <Form.Item label="Focus Canvas Shortcut">
              <Space direction="vertical" size={4} className="fm-w-full">
                <div
                  className={`fm-shortcut-input-shell${settings.focusCanvasShortcut ? " fm-shortcut-input-has-value" : ""}`}
                >
                  <Input
                    className="fm-global-shortcut-input"
                    value={settings.focusCanvasShortcut}
                    placeholder="Press keys"
                    onKeyDown={(event) => {
                      captureGlobalShortcut(event, "focusCanvasShortcut");
                    }}
                  />
                  {settings.focusCanvasShortcut && (
                    <span
                      className="fm-shortcut-input-overlay"
                      aria-hidden="true"
                    >
                      <ShortcutKeys combo={settings.focusCanvasShortcut} />
                    </span>
                  )}
                </div>
                <Typography.Text type="secondary">
                  Moves focus back to the game canvas so keyboard gameplay input
                  works immediately.
                </Typography.Text>
              </Space>
            </Form.Item>

            <Form.Item label="Hide Shapes Shortcut">
              <Space direction="vertical" size={4} className="fm-w-full">
                <div
                  className={`fm-shortcut-input-shell${settings.toggleShapesShortcut ? " fm-shortcut-input-has-value" : ""}`}
                >
                  <Input
                    className="fm-global-shortcut-input"
                    value={settings.toggleShapesShortcut}
                    placeholder="Press keys"
                    onKeyDown={(event) => {
                      captureGlobalShortcut(event, "toggleShapesShortcut");
                    }}
                  />
                  {settings.toggleShapesShortcut && (
                    <span
                      className="fm-shortcut-input-overlay"
                      aria-hidden="true"
                    >
                      <ShortcutKeys combo={settings.toggleShapesShortcut} />
                    </span>
                  )}
                </div>
                <Typography.Text type="secondary">
                  Shows or hides visual shape overlays without modifying profile
                  mappings.
                </Typography.Text>
              </Space>
            </Form.Item>

            <Form.Item label="Toggle Opacity 0/100 Shortcut">
              <Space direction="vertical" size={4} className="fm-w-full">
                <div
                  className={`fm-shortcut-input-shell${settings.setZeroOpacityShortcut ? " fm-shortcut-input-has-value" : ""}`}
                >
                  <Input
                    className="fm-global-shortcut-input"
                    value={settings.setZeroOpacityShortcut}
                    placeholder="Press keys"
                    onKeyDown={(event) => {
                      captureGlobalShortcut(event, "setZeroOpacityShortcut");
                    }}
                  />
                  {settings.setZeroOpacityShortcut && (
                    <span
                      className="fm-shortcut-input-overlay"
                      aria-hidden="true"
                    >
                      <ShortcutKeys combo={settings.setZeroOpacityShortcut} />
                    </span>
                  )}
                </div>
                <Typography.Text type="secondary">
                  Toggles all shape opacity values in the active profile between
                  0% and 100%.
                </Typography.Text>
              </Space>
            </Form.Item>
          </Form>
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
            <Tag color="blue" className="fm-dialog-footer-left">
              <Tooltip title="Active Profile" {...dialogTooltipProps}>
                <span
                  style={{
                    display: "inline-block",
                    maxWidth: 180,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    verticalAlign: "bottom",
                  }}
                >
                  {activeProfileName || "No Active Profile"}
                </span>
              </Tooltip>
            </Tag>
            <Typography.Text
              type="secondary"
              className="fm-dialog-footer-right"
            >
              v{toolVersion}
            </Typography.Text>
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
  );
};
