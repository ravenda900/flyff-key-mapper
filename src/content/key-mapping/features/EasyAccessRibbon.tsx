import {
  LeftOutlined,
  PlusOutlined,
  RightOutlined,
  StopOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
import {
  Button,
  Checkbox,
  Popover,
  Select,
  Space,
  Tooltip,
  Typography,
  theme,
} from "antd";
import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import type {
  CharacterTabInfo,
  MapperSettings,
  ShapeType,
  ThemeMode,
} from "../../types";
import { BASIC_PALETTE_SHAPES, SHAPE_LABELS } from "../constants";
import { PaletteShapeIcon } from "../components/PaletteShapeIcon";
import { THEME_SELECT_OPTIONS } from "../../themePresets";

type ShapePaletteActionButtonProps = {
  selectedPaletteShape: ShapeType;
  setSelectedPaletteShape: (shape: ShapeType) => void;
  onAddKeyMap: () => void;
  disabled?: boolean;
  buttonType?: "default" | "dashed" | "primary" | "text" | "link";
  block?: boolean;
  size?: "small" | "middle" | "large";
  className?: string;
  style?: CSSProperties;
  getPopupContainer?: (triggerNode?: HTMLElement) => HTMLElement;
  tooltipTitle?: string;
};

export const ShapePaletteActionButton = ({
  selectedPaletteShape,
  setSelectedPaletteShape,
  onAddKeyMap,
  disabled,
  buttonType = "default",
  block,
  size = "middle",
  className,
  style,
  getPopupContainer,
  tooltipTitle,
}: ShapePaletteActionButtonProps) => {
  const { token } = theme.useToken();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const paletteContent = useMemo(
    () => (
      <div className="fm-shape-palette-popover-grid">
        {BASIC_PALETTE_SHAPES.map((shapeType) => {
          const isSelected = selectedPaletteShape === shapeType;
          const label = SHAPE_LABELS[shapeType];

          return (
            <Button
              key={shapeType}
              size="small"
              type={isSelected ? "primary" : "default"}
              className={`fm-shape-palette-popover-tile${isSelected ? " fm-shape-palette-popover-tile-selected" : ""}`}
              onClick={() => {
                setSelectedPaletteShape(shapeType);
                setPaletteOpen(false);
              }}
            >
              <Space direction="vertical" size={2} align="center">
                <PaletteShapeIcon shape={shapeType} />
                <span className="fm-shape-palette-popover-label">{label}</span>
              </Space>
            </Button>
          );
        })}
      </div>
    ),
    [selectedPaletteShape, setSelectedPaletteShape],
  );

  return (
    <Popover
      open={paletteOpen}
      onOpenChange={setPaletteOpen}
      trigger="contextMenu"
      placement="bottomLeft"
      getPopupContainer={getPopupContainer}
      zIndex={2147483647}
      overlayClassName="fm-dialog-surface-popover"
      content={paletteContent}
    >
      <Tooltip
        title={tooltipTitle}
        getPopupContainer={getPopupContainer}
        overlayClassName="fm-dialog-surface-tooltip"
        zIndex={2147483647}
      >
        <Button
          type={buttonType}
          block={block}
          size={size}
          className={className}
          style={{
            ...style,
            borderColor: disabled ? token.colorBorder : style?.borderColor,
          }}
          icon={<PlusOutlined />}
          disabled={disabled}
          onClick={() => {
            if (disabled) {
              return;
            }

            setPaletteOpen(false);
            onAddKeyMap();
          }}
          onContextMenu={(event) => {
            if (disabled) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            setPaletteOpen(true);
          }}
        >
          Add Key Map
        </Button>
      </Tooltip>
    </Popover>
  );
};

type EasyAccessRibbonProps = {
  visible: boolean;
  settings: MapperSettings;
  keyTriggerCharacters: CharacterTabInfo[];
  selectedKeyTriggerTabIds: number[];
  onSelectedKeyTriggerTabIdsChange: (ids: number[]) => void;
  toggleMode: () => void;
  addKeyMap: () => void;
  selectedPaletteShape: ShapeType;
  setSelectedPaletteShape: (shape: ShapeType) => void;
  handleThemeChange: (value: ThemeMode) => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  getDialogPopupContainer?: (triggerNode?: HTMLElement) => HTMLElement;
};

export const EasyAccessRibbon = ({
  visible,
  settings,
  keyTriggerCharacters,
  selectedKeyTriggerTabIds,
  onSelectedKeyTriggerTabIdsChange,
  toggleMode,
  addKeyMap,
  selectedPaletteShape,
  setSelectedPaletteShape,
  handleThemeChange,
  expanded,
  onExpandedChange,
  getDialogPopupContainer,
}: EasyAccessRibbonProps) => {
  const { token } = theme.useToken();
  const showArrowButton = settings.showEasyAccessArrowButton !== false;
  const panelVisible = expanded || !showArrowButton;

  const ribbonSurfaceStyle: CSSProperties = {
    borderColor: token.colorBorder,
    background: token.colorBgContainer,
    color: token.colorText,
    boxShadow: `inset 4px 0 0 ${token.colorPrimary}, 0 18px 44px color-mix(in srgb, ${token.colorText} 20%, transparent)`,
  };

  const ribbonToggleStyle: CSSProperties = {
    border: "none",
    background: `linear-gradient(180deg, ${token.colorPrimary}, ${token.colorPrimaryHover ?? token.colorPrimary}) !important`,
    color: `{token.colorTextLightSolid} !important`,
    boxShadow: `0 10px 24px color-mix(in srgb, ${token.colorText} 20%, transparent)`,
    transition: "none",
  };

  const getRibbonPopupContainer = (triggerNode?: HTMLElement) =>
    (triggerNode?.closest(".fm-easy-access-ribbon") as HTMLElement | null) ??
    (triggerNode?.closest("#flyff-mapper-root") as HTMLElement | null) ??
    document.getElementById("flyff-mapper-root") ??
    document.body;

  if (!visible) {
    return null;
  }

  const selectedCount = selectedKeyTriggerTabIds.length;
  const allChecked =
    keyTriggerCharacters.length > 0 &&
    selectedCount > 0 &&
    keyTriggerCharacters.every((tab) =>
      selectedKeyTriggerTabIds.includes(tab.id),
    );

  return (
    <div
      className={`fm-easy-access-ribbon${panelVisible ? " fm-easy-access-ribbon-open" : " fm-easy-access-ribbon-collapsed"}${showArrowButton ? "" : " fm-easy-access-ribbon-no-toggle"}`}
    >
      {showArrowButton && (
        <Button
          className="fm-easy-access-ribbon-toggle"
          size="small"
          type="primary"
          icon={panelVisible ? <LeftOutlined /> : <RightOutlined />}
          style={ribbonToggleStyle}
          onClick={() => onExpandedChange(!expanded)}
        />
      )}

      {panelVisible && (
        <div
          className="fm-easy-access-ribbon-panel"
          aria-hidden={!panelVisible}
          style={ribbonSurfaceStyle}
        >
          <Space direction="vertical" size={10} className="fm-w-full">
            <div className="fm-easy-access-ribbon-header">
              <Space direction="vertical" size={0}>
                <Typography.Text strong>Easy Access</Typography.Text>
                <Typography.Text
                  type="secondary"
                  className="fm-easy-access-ribbon-subtitle"
                >
                  Quick tab, mapper, and theme controls.
                </Typography.Text>
              </Space>
            </div>

            <Space wrap size={8} className="fm-w-full">
              <Button
                type={settings.editMode ? "default" : "primary"}
                icon={
                  settings.editMode ? <PlayCircleOutlined /> : <StopOutlined />
                }
                onClick={toggleMode}
              >
                {settings.editMode ? "Start Script" : "Stop Script"}
              </Button>

              <ShapePaletteActionButton
                selectedPaletteShape={selectedPaletteShape}
                setSelectedPaletteShape={setSelectedPaletteShape}
                onAddKeyMap={addKeyMap}
                buttonType="dashed"
                size="middle"
                block={false}
                getPopupContainer={getDialogPopupContainer}
                tooltipTitle={`Left click: add ${SHAPE_LABELS[selectedPaletteShape]}. Right click: open shape palette to switch.`}
              />
            </Space>

            <div className="fm-easy-access-ribbon-section">
              <div className="fm-easy-access-ribbon-section-header">
                <Typography.Text strong>Characters / Tabs</Typography.Text>
                <Space size={6}>
                  <Button
                    size="small"
                    onClick={() => {
                      onSelectedKeyTriggerTabIdsChange(
                        keyTriggerCharacters.map((tab) => tab.id),
                      );
                    }}
                    disabled={keyTriggerCharacters.length === 0 || allChecked}
                  >
                    Select All
                  </Button>
                  <Button
                    size="small"
                    onClick={() => onSelectedKeyTriggerTabIdsChange([])}
                    disabled={selectedCount === 0}
                  >
                    Clear
                  </Button>
                </Space>
              </div>
              <div className="fm-easy-access-ribbon-tab-list">
                {keyTriggerCharacters.length === 0 ? (
                  <Typography.Text type="secondary">
                    No Flyff tabs detected yet.
                  </Typography.Text>
                ) : (
                  keyTriggerCharacters.map((tab) => {
                    const checked = selectedKeyTriggerTabIds.includes(tab.id);
                    return (
                      <Checkbox
                        key={tab.id}
                        checked={checked}
                        onChange={(event) => {
                          if (event.target.checked) {
                            onSelectedKeyTriggerTabIdsChange(
                              Array.from(
                                new Set([...selectedKeyTriggerTabIds, tab.id]),
                              ),
                            );
                            return;
                          }

                          onSelectedKeyTriggerTabIdsChange(
                            selectedKeyTriggerTabIds.filter(
                              (id) => id !== tab.id,
                            ),
                          );
                        }}
                      >
                        <span className="fm-easy-access-ribbon-tab-label">
                          {tab.name}
                        </span>
                      </Checkbox>
                    );
                  })
                )}
              </div>
            </div>

            <div className="fm-easy-access-ribbon-section">
              <Typography.Text strong>Theme</Typography.Text>
              <Select
                value={settings.theme}
                options={THEME_SELECT_OPTIONS as any}
                onChange={(value) => handleThemeChange(value as ThemeMode)}
                getPopupContainer={getRibbonPopupContainer}
                popupClassName="fm-easy-access-ribbon-select-dropdown"
                size="small"
                style={{ width: "100%" }}
              />
            </div>

            <Typography.Text
              type="secondary"
              className="fm-easy-access-ribbon-footer"
            >
              Ribbon and dialog share the same tab selection, mapper mode, and
              theme.
            </Typography.Text>
          </Space>
        </div>
      )}
    </div>
  );
};
