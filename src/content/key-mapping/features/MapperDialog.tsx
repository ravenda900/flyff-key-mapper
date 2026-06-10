import {
  LeftOutlined,
  LockOutlined,
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
  SafetyCertificateOutlined,
  SettingOutlined,
  StopOutlined,
  CheckOutlined as SaveIcon,
  CloseOutlined as CancelIcon,
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
  Popover,
  Popconfirm,
  Select,
  Slider,
  Space,
  Switch,
  Tag,
  Tabs,
  theme,
  Tooltip,
  Typography,
  message,
} from "antd";
import type {
  CSSProperties,
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  SetStateAction,
  WheelEvent as ReactWheelEvent,
} from "react";
import { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";
import type {
  CharacterTabInfo,
  KeyTriggerPreset,
  MapperSettings,
  MappingProfile,
  NormalizedRect,
  ShapeMapping,
  ShapeType,
  UtilityTab,
} from "../../types";
import type { AutoHolyDebuffType } from "../../types";
import type {
  AccessControlState,
  AccessRole,
  SubscriptionPlan,
  SubscriptionTokenRecord,
} from "../../accessControl";
import {
  BASIC_PALETTE_SHAPES,
  OVERLAY_SHORTCUT,
  PROFILE_SELECT_DROPDOWN_STYLE,
  SHAPE_LABELS,
} from "../constants";
import type { GlobalShortcutField } from "../shortcutBinding";
import { KeyTriggerTab } from "./KeyTriggerTab";
import type { KeyTriggerFooterControls } from "./KeyTriggerTab";
import { AutoAwakenTab } from "../../auto-awaken/AutoAwakenTab";
import { storage } from "../../storage";
import {
  THEME_SELECT_OPTIONS,
  getResolvedThemePreset,
  type ThemeMode,
} from "../../themePresets";

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
import { ShapePaletteActionButton } from "./EasyAccessRibbon";
import { ShortcutKeys } from "../components/ShortcutKeys";
import { syncKeyTriggerCharacterProfileSelection } from "./profileSelectionSync";

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
  onFactoryResetConfiguration: () => void;
  onRestoreDialogConfiguration?: () => void;
  settings: MapperSettings;
  toggleMode: () => void;
  addKeyMap: () => void;
  profiles: MappingProfile[];
  selectedProfile: MappingProfile | null;
  onSelectProfileChange: (value: string) => void;
  onCreateProfileWithName: (name: string) => string | null;
  duplicateSelectedProfile: () => void;
  onRenameProfileWithName: (name: string) => string | null;
  deleteSelectedProfile: () => void;
  activeUtilityTab: UtilityTab;
  onActiveUtilityTabChange: (value: UtilityTab) => void;
  selectedPaletteShape: ShapeType;
  setSelectedPaletteShape: (shape: ShapeType) => void;
  handleThemeChange: (value: ThemeMode) => void;
  draftShape?: ShapeMapping;
  setDraftShape?: Dispatch<SetStateAction<ShapeMapping>>;
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
  keyTriggerPresets: KeyTriggerPreset[];
  selectedKeyTriggerPresetId: string;
  setKeyTriggerPresets: Dispatch<SetStateAction<KeyTriggerPreset[]>>;
  setSelectedKeyTriggerPresetId: Dispatch<SetStateAction<string>>;
  keyTriggerCharacters: CharacterTabInfo[];
  selectedKeyTriggerTabIds: number[];
  onSelectedKeyTriggerTabIdsChange: (ids: number[]) => void;
  keyTriggerCharacterPresetMapping?: Record<string, string>;
  setKeyTriggerCharacterPresetMapping?: Dispatch<
    SetStateAction<Record<string, string>>
  >;
  keyTriggerCharacterProfileMapping: Record<string, string>;
  setKeyTriggerCharacterProfileMapping: Dispatch<
    SetStateAction<Record<string, string>>
  >;
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

  accessLoading?: boolean;
  subscriptionPlan?: SubscriptionPlan;
  accessRole?: AccessRole;
  canManageAccess?: boolean;
  canManageAdmins?: boolean;
  canGenerateTokens?: boolean;
  hasToolAccess?: boolean;
  accessReason?: string | null;
  tokenExpiresAtIso?: string | null;
  accessLastCheckedAtIso?: string | null;
  accessSource?: "none" | "token";

  onGenerateSubscriptionToken?: (payload: {
    plan: SubscriptionPlan;
    role?: AccessRole;
  }) => Promise<{
    token: string;
    role: AccessRole;
    expiresAtIso: string | null;
  }>;
  onListSubscriptionTokens?: () => Promise<SubscriptionTokenRecord[]>;
  onRevokeSubscriptionToken?: (tokenHash: string) => Promise<void>;
  onDeleteSubscriptionToken?: (tokenHash: string) => Promise<void>;
  onRefreshAccessControl?: (
    subscriptionToken?: string,
  ) => Promise<AccessControlState>;
  featureAccess?: {
    keyTrigger?: boolean;
    autoHoly?: boolean;
    autoPills?: boolean;
    autoAwaken?: boolean;
    syncMouse?: boolean;
  };
};

type DialogPane = UtilityTab | "settings" | "admin";

export const MapperDialog = ({
  overlayVisible,
  dialogVisible,
  isTransformingShape,
  dialogRect,
  setDialogRect,
  activeProfileName,
  focusGameCanvas,
  onResetDialogConfiguration,
  onFactoryResetConfiguration,
  settings,
  toggleMode,
  addKeyMap,
  profiles,
  selectedProfile,
  onSelectProfileChange,
  onCreateProfileWithName,
  duplicateSelectedProfile,
  onRenameProfileWithName,
  deleteSelectedProfile,
  activeUtilityTab,
  onActiveUtilityTabChange,
  selectedPaletteShape,
  setSelectedPaletteShape,
  handleThemeChange,
  draftShape: _draftShape,
  setDraftShape: _setDraftShape,
  setShapes: _setShapes,
  normalizeShape: _normalizeShape,
  setSettings,
  exportMappings,
  setImportOpen,
  captureGlobalShortcut,
  globalShortcutErrors,
  keyTriggerPresets,
  selectedKeyTriggerPresetId,
  setKeyTriggerPresets,
  setSelectedKeyTriggerPresetId,
  keyTriggerCharacters,
  selectedKeyTriggerTabIds,
  onSelectedKeyTriggerTabIdsChange,
  reloadKeyTriggerCharacters,
  keyTriggerCharacterProfileMapping,
  setKeyTriggerCharacterProfileMapping,
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
  accessLoading,
  subscriptionPlan,
  accessRole,
  canManageAccess,
  canManageAdmins,
  canGenerateTokens,
  hasToolAccess,
  accessReason,
  tokenExpiresAtIso,
  accessLastCheckedAtIso,
  accessSource,
  onGenerateSubscriptionToken,
  onListSubscriptionTokens,
  onRevokeSubscriptionToken,
  onDeleteSubscriptionToken,
  onRefreshAccessControl,
}: Props) => {
  const { token } = theme.useToken();
  const isLocked = !settings.editMode;
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isThemeIconAnimating, setIsThemeIconAnimating] = useState(false);
  const [activeDialogPane, setActiveDialogPane] =
    useState<DialogPane>(activeUtilityTab);
  const [isKeyTriggerEditorOpen, setIsKeyTriggerEditorOpen] = useState(false);
  const [keyTriggerFooterControls, setKeyTriggerFooterControls] =
    useState<KeyTriggerFooterControls | null>(null);
  const [keyTriggerBackRequestVersion, setKeyTriggerBackRequestVersion] =
    useState(0);
  const [shouldFocusAutoStop, setShouldFocusAutoStop] = useState(false);
  const [isSendingTestPush, setIsSendingTestPush] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
  const [profileCreateName, setProfileCreateName] = useState("");
  const [profileCreateOpen, setProfileCreateOpen] = useState(false);
  const [profileRenameName, setProfileRenameName] = useState("");
  const [profileRenameOpen, setProfileRenameOpen] = useState(false);
  const [profileInlineNameError, setProfileInlineNameError] = useState("");
  const [autoStopDraftSeconds, setAutoStopDraftSeconds] = useState(
    Math.max(0, settings.autoStopSeconds ?? 0),
  );
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
  const settingsAnchorRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const profileCreateInputRef = useRef<import("antd").InputRef | null>(null);
  const profileRenameInputRef = useRef<import("antd").InputRef | null>(null);
  const autoStopDebounceTimerRef = useRef<number | null>(null);
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

  const getDialogPopupContainer = (triggerNode?: HTMLElement) => {
    const closestDialog = triggerNode?.closest(
      ".fm-dialog",
    ) as HTMLElement | null;
    if (closestDialog) {
      return closestDialog;
    }

    const existingDialog = document.querySelector(
      ".fm-dialog",
    ) as HTMLElement | null;
    if (existingDialog) {
      return existingDialog;
    }

    const root = document.getElementById("flyff-mapper-root");
    return root ?? document.body;
  };

  const dialogTooltipProps = {
    getPopupContainer: (triggerNode: HTMLElement) =>
      getDialogPopupContainer(triggerNode),
    zIndex: 2147483647,
    overlayClassName: "fm-dialog-surface-tooltip",
  };

  const dialogPopconfirmProps = {
    getPopupContainer: (triggerNode: HTMLElement) =>
      getDialogPopupContainer(triggerNode),
    zIndex: 2147483647,
    overlayClassName: "fm-dialog-surface-popconfirm",
  };

  const dialogPopoverProps = {
    getPopupContainer: (triggerNode?: HTMLElement) =>
      getDialogPopupContainer(triggerNode),
    zIndex: 2147483647,
    overlayClassName: "fm-dialog-surface-popover",
  };

  const getSystemDark = () => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return false;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };

  const resolvedThemePreset = getResolvedThemePreset(
    settings.theme,
    getSystemDark(),
  );
  const effectivePlan: SubscriptionPlan = subscriptionPlan ?? "free";
  const effectiveRole: AccessRole = accessRole ?? "user";
  const effectiveHasToolAccess = hasToolAccess ?? false;
  const isAccessGated = !effectiveHasToolAccess && !accessLoading;
  const effectiveAccessSource = accessSource ?? "none";
  const canOpenAdminPane =
    effectiveRole === "admin" || effectiveRole === "superadmin";
  const canManageAdminsEffective =
    canManageAdmins ?? effectiveRole === "superadmin";
  const canGenerateTokensEffective =
    canGenerateTokens ??
    (effectiveRole === "admin" || effectiveRole === "superadmin");
  const canManageAccessEffective = canManageAccess ?? canManageAdminsEffective;
  const canIssueUnlimitedPlan = effectiveRole === "superadmin";

  const isLightTheme = resolvedThemePreset.appearance === "light";

  const setSettingsAnchor =
    (id: string) =>
    (node: HTMLDivElement | null): void => {
      settingsAnchorRefs.current[id] = node;
    };

  const scrollToSettingsAnchor = (id: string) => {
    const target = settingsAnchorRefs.current[id];
    if (!target) {
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const settingsSearchEntries: Array<{
    id: string;
    label: string;
    keywords: string[];
  }> = [
    {
      id: "factory-reset",
      label: "Factory Reset",
      keywords: ["factory", "reset", "clean slate", "delete"],
    },
    {
      id: "theme",
      label: "Theme",
      keywords: ["theme", "appearance", "light", "dark"],
    },
    {
      id: "strict-passthrough",
      label: "Strict Input Passthrough",
      keywords: ["strict", "passthrough", "input"],
    },
    {
      id: "easy-access-arrow",
      label: "Easy Access Arrow Button",
      keywords: ["easy access", "arrow", "ribbon", "button"],
    },
    {
      id: "easy-access-ui",
      label: "Show Easy Access UI",
      keywords: ["easy access", "ui", "panel", "show", "hide"],
    },
    {
      id: "toggle-easy-access-shortcut",
      label: "Show/Hide Easy Access Shortcut",
      keywords: ["easy access", "shortcut", "toggle", "hotkey"],
    },
    {
      id: "toggle-dialog-shortcut",
      label: "Toggle Dialog Shortcut",
      keywords: ["dialog", "shortcut", "open", "close"],
    },
    {
      id: "auto-stop",
      label: "Auto-Stop (seconds)",
      keywords: ["auto stop", "timeout", "seconds", "idle"],
    },
    {
      id: "captcha-detection",
      label: "CAPTCHA Detection Action",
      keywords: ["captcha", "recaptcha", "notify", "stop"],
    },
    {
      id: "mobile-push",
      label: "Mobile Push Notifications",
      keywords: ["mobile", "push", "discord", "notification"],
    },
    {
      id: "sync-mouse",
      label: "Sync Mouse Events Across Tabs",
      keywords: ["sync", "mouse", "tabs", "ratio", "actual"],
    },
    {
      id: "experimental-features",
      label: "Experimental Features",
      keywords: ["experimental", "auto holy", "auto pills", "auto awaken"],
    },
    {
      id: "auto-holy",
      label: "Auto-Holy",
      keywords: ["auto holy", "holy", "root", "stun"],
    },
    {
      id: "auto-holy-debuff",
      label: "Auto-Holy Debuff Type",
      keywords: ["auto holy", "debuff", "root", "stun"],
    },
    {
      id: "auto-holy-region",
      label: "Auto-Holy Debuff Reference Area",
      keywords: ["auto holy", "region", "capture", "reference area"],
    },
    {
      id: "auto-holy-key",
      label: "Auto-Holy Key",
      keywords: ["auto holy", "holy key", "shortcut", "hotkey"],
    },
    {
      id: "auto-pills",
      label: "Auto-Pills",
      keywords: ["auto pills", "pills", "hp"],
    },
    {
      id: "auto-pills-threshold",
      label: "Auto-Pills HP Threshold",
      keywords: ["auto pills", "hp threshold", "threshold"],
    },
    {
      id: "auto-pills-region",
      label: "Auto-Pills HP Reference Area",
      keywords: ["auto pills", "region", "capture", "reference area"],
    },
    {
      id: "auto-pills-key",
      label: "Auto-Pills Key",
      keywords: ["auto pills", "pill key", "shortcut", "hotkey"],
    },
  ];

  const normalizedSettingsSearchQuery = settingsSearchQuery
    .trim()
    .toLowerCase();
  const filteredSettingsSearchEntries =
    normalizedSettingsSearchQuery.length === 0
      ? []
      : settingsSearchEntries.filter((entry) => {
          if (
            entry.label.toLowerCase().includes(normalizedSettingsSearchQuery)
          ) {
            return true;
          }

          return entry.keywords.some((keyword) =>
            keyword.toLowerCase().includes(normalizedSettingsSearchQuery),
          );
        });

  const dialogThemeVars: CSSProperties = {
    "--fm-theme-bg-base": resolvedThemePreset.token.colorBgBase,
    "--fm-theme-bg-container":
      resolvedThemePreset.token.colorBgContainer ??
      resolvedThemePreset.token.colorBgBase,
    "--fm-theme-bg-elevated":
      resolvedThemePreset.token.colorBgElevated ??
      resolvedThemePreset.token.colorBgContainer,
    "--fm-theme-bg-layout":
      resolvedThemePreset.token.colorBgLayout ??
      resolvedThemePreset.token.colorBgBase,
    "--fm-theme-text": resolvedThemePreset.token.colorTextBase,
    "--fm-theme-text-secondary": resolvedThemePreset.token.colorTextSecondary,
    "--fm-theme-border": resolvedThemePreset.token.colorBorder,
    "--fm-theme-border-secondary":
      resolvedThemePreset.token.colorBorderSecondary,
    "--fm-theme-fill": resolvedThemePreset.token.colorFillSecondary,
    "--fm-theme-fill-strong": resolvedThemePreset.token.colorFillTertiary,
    "--fm-theme-fill-soft": resolvedThemePreset.token.colorFillQuaternary,
    "--fm-theme-primary-bg": resolvedThemePreset.token.colorPrimaryBg,
    "--fm-theme-success-bg": resolvedThemePreset.token.colorSuccessBg,
    "--fm-theme-warning-bg": resolvedThemePreset.token.colorWarningBg,
    "--fm-theme-error-bg": resolvedThemePreset.token.colorErrorBg,
    "--fm-theme-info-bg": resolvedThemePreset.token.colorInfoBg,
    backgroundColor:
      resolvedThemePreset.token.colorBgContainer ??
      resolvedThemePreset.token.colorBgBase,
    color: resolvedThemePreset.token.colorTextBase,
  } as CSSProperties;

  useEffect(() => {
    const normalized = Math.max(0, settings.autoStopSeconds ?? 0);
    setAutoStopDraftSeconds((prev) =>
      prev === normalized ? prev : normalized,
    );
  }, [settings.autoStopSeconds]);

  const flushAutoStopDraftToSettings = () => {
    if (autoStopDebounceTimerRef.current !== null) {
      window.clearTimeout(autoStopDebounceTimerRef.current);
      autoStopDebounceTimerRef.current = null;
    }

    const nextAutoStop = Math.max(0, Math.round(autoStopDraftSeconds));
    setSettings((prev) =>
      prev.autoStopSeconds === nextAutoStop
        ? prev
        : {
            ...prev,
            autoStopSeconds: nextAutoStop,
          },
    );
  };

  useEffect(() => {
    if (autoStopDebounceTimerRef.current !== null) {
      window.clearTimeout(autoStopDebounceTimerRef.current);
    }

    autoStopDebounceTimerRef.current = window.setTimeout(() => {
      const nextAutoStop = Math.max(0, Math.round(autoStopDraftSeconds));
      setSettings((prev) =>
        prev.autoStopSeconds === nextAutoStop
          ? prev
          : {
              ...prev,
              autoStopSeconds: nextAutoStop,
            },
      );
      autoStopDebounceTimerRef.current = null;
    }, 400);

    return () => {
      if (autoStopDebounceTimerRef.current !== null) {
        window.clearTimeout(autoStopDebounceTimerRef.current);
        autoStopDebounceTimerRef.current = null;
      }
    };
  }, [autoStopDraftSeconds, setSettings]);

  const toggleThemeMode = () => {
    handleThemeChange(isLightTheme ? "dark" : "light");
  };

  const submitCreateProfile = () => {
    const error = onCreateProfileWithName(profileCreateName);
    if (error) {
      setProfileInlineNameError(error);
      return;
    }
    setProfileCreateOpen(false);
    setProfileCreateName("");
    setProfileInlineNameError("");
  };

  const submitRenameProfile = () => {
    const error = onRenameProfileWithName(profileRenameName);
    if (error) {
      setProfileInlineNameError(error);
      return;
    }
    setProfileRenameOpen(false);
    setProfileInlineNameError("");
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

  const toggleAdminPane = () => {
    if (!canOpenAdminPane) {
      return;
    }

    if (activeDialogPane === "admin") {
      setActiveDialogPane(lastUtilityTabRef.current);
      return;
    }

    lastUtilityTabRef.current = activeUtilityTab;
    setActiveDialogPane("admin");
  };

  const activePaneIndex =
    activeDialogPane === "key-trigger"
      ? 1
      : activeDialogPane === "settings"
        ? 2
        : activeDialogPane === "auto-awaken"
          ? 3
          : activeDialogPane === "admin"
            ? 4
            : 0;

  const showMergedBackButton =
    activeDialogPane === "settings" ||
    activeDialogPane === "admin" ||
    (activeDialogPane === "key-trigger" && isKeyTriggerEditorOpen);

  const mergedBackLabel =
    activeDialogPane === "settings" || activeDialogPane === "admin"
      ? "Back to previous tab"
      : activeDialogPane === "key-trigger" && isKeyTriggerEditorOpen
        ? "Back to profiles"
        : "Back";

  const handleMergedBack = () => {
    if (activeDialogPane === "settings" || activeDialogPane === "admin") {
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

  useEffect(() => {
    if (!canOpenAdminPane && activeDialogPane === "admin") {
      setActiveDialogPane(lastUtilityTabRef.current);
    }
  }, [activeDialogPane, canOpenAdminPane]);

  const recaptchaActionMode = settings.stopOnRecaptcha
    ? settings.notifyOnRecaptcha
      ? "stop-and-notify"
      : "stop-only"
    : settings.notifyOnRecaptcha
      ? "notify-only"
      : "off";

  const canSendTestPush =
    settings.mobilePushEnabled &&
    settings.mobilePushDiscordBotUrl.trim().length > 0 &&
    settings.mobilePushDiscordUserId.trim().length > 0 &&
    settings.mobilePushDiscordApiKey.trim().length > 0;

  const canTestConnection =
    settings.mobilePushEnabled &&
    settings.mobilePushDiscordBotUrl.trim().length > 0 &&
    settings.mobilePushDiscordApiKey.trim().length > 0;

  const testMobilePushConnection = async () => {
    if (!canTestConnection || isTestingConnection) {
      return;
    }

    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      message.error("Extension runtime is unavailable.");
      return;
    }

    setIsTestingConnection(true);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "TEST_MOBILE_PUSH_CONNECTION",
        mobilePush: {
          enabled: settings.mobilePushEnabled,
          provider: "discord",
          discordBotUrl: settings.mobilePushDiscordBotUrl,
          discordApiKey: settings.mobilePushDiscordApiKey,
        },
      })) as { ok?: boolean; error?: string };

      if (response?.ok) {
        message.success("Bot connection looks good.");
      } else {
        message.error(response?.error || "Unable to connect to Discord bot.");
      }
    } catch {
      message.error("Unable to connect to Discord bot.");
    } finally {
      setIsTestingConnection(false);
    }
  };

  const sendTestMobilePush = async () => {
    if (!canSendTestPush || isSendingTestPush) {
      return;
    }

    if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
      message.error("Extension runtime is unavailable.");
      return;
    }

    setIsSendingTestPush(true);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "SEND_TEST_MOBILE_PUSH",
        title: "Flyff Utility - Test Push",
        message:
          "Test notification sent. If this reaches your Discord DMs, the bot is configured correctly.",
        mobilePush: {
          enabled: settings.mobilePushEnabled,
          provider: "discord",
          discordBotUrl: settings.mobilePushDiscordBotUrl,
          discordUserId: settings.mobilePushDiscordUserId,
          discordApiKey: settings.mobilePushDiscordApiKey,
        },
      })) as { ok?: boolean; error?: string };

      if (response?.ok) {
        message.success("Test push sent. Check your phone.");
      } else {
        message.error(response?.error || "Unable to send test push.");
      }
    } catch {
      message.error("Unable to send test push.");
    } finally {
      setIsSendingTestPush(false);
    }
  };

  const [shapeOpacityDraft, setShapeOpacityDraft] = useState<number>(
    settings.shapeOpacity ?? 1,
  );

  const [tokenIssuePlan, setTokenIssuePlan] =
    useState<SubscriptionPlan>("free");
  const [tokenIssueRole, setTokenIssueRole] = useState<AccessRole>("user");
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [generatedTokenRole, setGeneratedTokenRole] =
    useState<AccessRole | null>(null);
  const [generatedTokenExpiresAtIso, setGeneratedTokenExpiresAtIso] = useState<
    string | null
  >(null);
  const [issuedTokens, setIssuedTokens] = useState<SubscriptionTokenRecord[]>(
    [],
  );
  const [tokenIssueLoading, setTokenIssueLoading] = useState(false);
  const [tokenListLoading, setTokenListLoading] = useState(false);
  const [revokingTokenHash, setRevokingTokenHash] = useState<string | null>(
    null,
  );
  const [deletingTokenHash, setDeletingTokenHash] = useState<string | null>(
    null,
  );
  const [tokenStatusFilter, setTokenStatusFilter] = useState<
    "all" | "active" | "inactive" | "expired"
  >("all");
  const [tokenPlanFilter, setTokenPlanFilter] = useState<
    "all" | SubscriptionPlan
  >("all");

  const buildPlanExpiryIso = (plan: SubscriptionPlan) => {
    if (plan === "unlimited") {
      return null;
    }
    const now = new Date();
    const days = plan === "elite" ? 90 : plan === "pro" ? 30 : 7;
    now.setDate(now.getDate() + days);
    return now.toISOString();
  };

  useEffect(() => {
    setShapeOpacityDraft(settings.shapeOpacity ?? 1);
  }, [settings.shapeOpacity]);

  useEffect(() => {
    if (!canIssueUnlimitedPlan && tokenIssuePlan === "unlimited") {
      setTokenIssuePlan("elite");
    }
  }, [canIssueUnlimitedPlan, tokenIssuePlan]);

  const formatTokenDate = (value: string | null) => {
    if (!value) {
      return "-";
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleString();
  };

  const getRemainingDurationLabel = (value: string | null) => {
    if (!value) {
      return null;
    }

    const targetMs = Date.parse(value);
    if (!Number.isFinite(targetMs)) {
      return null;
    }

    const diffMs = targetMs - Date.now();
    const absMs = Math.abs(diffMs);
    const totalMinutes = Math.floor(absMs / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || days > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);

    return diffMs >= 0
      ? `${parts.join(" ")} remaining`
      : `expired ${parts.join(" ")} ago`;
  };

  const renderDateWithRemainingTooltip = (value: string | null) => {
    const formatted = formatTokenDate(value);
    if (formatted === "-") {
      return "-";
    }

    const remaining = getRemainingDurationLabel(value);
    const tooltipText = remaining ? `${formatted} (${remaining})` : formatted;

    return (
      <Tooltip title={tooltipText} {...dialogTooltipProps}>
        <span>{formatted}</span>
      </Tooltip>
    );
  };

  const getTokenStatus = (item: SubscriptionTokenRecord) => {
    if (item.status === "inactive") {
      return "inactive";
    }
    return item.isExpired ? "expired" : "active";
  };

  const maskedToken = (tokenHash: string) => {
    if (tokenHash.length <= 12) {
      return tokenHash;
    }
    return `${tokenHash.slice(0, 6)}...${tokenHash.slice(-6)}`;
  };

  const filteredIssuedTokens = issuedTokens.filter((item) => {
    const statusOk =
      tokenStatusFilter === "all" || getTokenStatus(item) === tokenStatusFilter;
    const planOk = tokenPlanFilter === "all" || item.plan === tokenPlanFilter;
    return statusOk && planOk;
  });

  const adminTableShellStyle: CSSProperties = {
    overflowX: "auto",
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: 10,
    background: token.colorBgContainer,
  };

  const adminTableStyle: CSSProperties = {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    minWidth: 760,
  };

  const adminHeaderCellStyle: CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: token.colorTextSecondary,
    padding: "10px 12px",
    borderBottom: `1px solid ${token.colorBorderSecondary}`,
    background: token.colorFillAlter,
    whiteSpace: "nowrap",
  };

  const adminBodyCellStyle: CSSProperties = {
    fontSize: 12,
    color: token.colorText,
    padding: "10px 12px",
    borderBottom: `1px solid ${token.colorBorderSecondary}`,
    verticalAlign: "top",
  };

  const renderStateTag = (
    value: string,
    tone: "success" | "warning" | "error" | "default" = "default",
  ) => {
    const color =
      tone === "success"
        ? "success"
        : tone === "warning"
          ? "warning"
          : tone === "error"
            ? "error"
            : "default";
    return (
      <Tag color={color} style={{ marginInlineEnd: 0, fontSize: 11 }}>
        {value.toUpperCase()}
      </Tag>
    );
  };

  const issueSubscriptionToken = async () => {
    if (
      !canGenerateTokensEffective ||
      !onGenerateSubscriptionToken ||
      tokenIssueLoading
    ) {
      return;
    }
    setTokenIssueLoading(true);
    try {
      const result = await onGenerateSubscriptionToken({
        plan: tokenIssuePlan,
        role: tokenIssueRole,
      });
      setGeneratedToken(result.token);
      setGeneratedTokenRole(result.role);
      setGeneratedTokenExpiresAtIso(result.expiresAtIso);
      if (onListSubscriptionTokens) {
        const refreshedTokens = await onListSubscriptionTokens();
        setIssuedTokens(refreshedTokens);
      }
      message.success("Subscription token generated.");
    } catch (error) {
      const messageText =
        error instanceof Error
          ? error.message
          : "Unable to generate subscription token.";
      message.error(messageText);
    } finally {
      setTokenIssueLoading(false);
    }
  };

  const refreshIssuedTokens = async () => {
    if (
      !canGenerateTokensEffective ||
      !onListSubscriptionTokens ||
      tokenListLoading
    ) {
      return;
    }
    setTokenListLoading(true);
    try {
      const tokens = await onListSubscriptionTokens();
      setIssuedTokens(tokens);
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Unable to load token list.";
      message.error(messageText);
    } finally {
      setTokenListLoading(false);
    }
  };

  const revokeIssuedToken = async (tokenHash: string) => {
    if (
      !canGenerateTokensEffective ||
      !onRevokeSubscriptionToken ||
      !tokenHash
    ) {
      return;
    }
    if (revokingTokenHash) {
      return;
    }
    setRevokingTokenHash(tokenHash);
    try {
      await onRevokeSubscriptionToken(tokenHash);
      setIssuedTokens((prev) =>
        prev.map((token) =>
          token.tokenHash === tokenHash
            ? {
                ...token,
                expiresAt: new Date().toISOString(),
                isExpired: true,
              }
            : token,
        ),
      );
      message.success("Subscription token revoked.");
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Unable to revoke token.";
      message.error(messageText);
    } finally {
      setRevokingTokenHash(null);
    }
  };

  const deleteIssuedToken = async (tokenHash: string) => {
    if (
      !canGenerateTokensEffective ||
      !onDeleteSubscriptionToken ||
      !tokenHash
    ) {
      return;
    }
    if (deletingTokenHash) {
      return;
    }
    setDeletingTokenHash(tokenHash);
    try {
      await onDeleteSubscriptionToken(tokenHash);
      setIssuedTokens((prev) =>
        prev.filter((token) => token.tokenHash !== tokenHash),
      );
      message.success("Subscription token deleted.");
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : "Unable to delete token.";
      message.error(messageText);
    } finally {
      setDeletingTokenHash(null);
    }
  };

  const applySubscriptionToken = async () => {
    const tokenInput = settings.subscriptionAccessToken.trim();
    if (!tokenInput) {
      message.warning("Enter a subscription token first.");
      return;
    }

    const nextState = await onRefreshAccessControl?.(
      tokenInput.length > 0 ? tokenInput : undefined,
    );

    if (!nextState) {
      return;
    }

    if (nextState.hasToolAccess && nextState.accessSource === "token") {
      const remaining = getRemainingDurationLabel(nextState.tokenExpiresAtIso);
      message.success(
        remaining
          ? `Subscription token validated (${remaining}).`
          : "Subscription token validated.",
      );
      return;
    }

    message.error(nextState.reason ?? "Invalid or expired subscription token.");
  };

  const clearSavedToken = async () => {
    setSettings((prev) => ({
      ...prev,
      subscriptionAccessToken: "",
    }));
    const nextState = await onRefreshAccessControl?.("");
    if (nextState?.hasToolAccess) {
      message.info("Saved token cleared.");
      return;
    }
    message.info("Saved token cleared. Access is now locked.");
  };

  useEffect(() => {
    if (activeDialogPane !== "admin") {
      return;
    }
    if (canGenerateTokensEffective) {
      void refreshIssuedTokens();
    }
  }, [activeDialogPane, canGenerateTokensEffective]);

  const activeUtilityPaneTab: UtilityTab =
    activeDialogPane === "settings" || activeDialogPane === "admin"
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
          {(activeDialogPane === "key-trigger" ||
            activeDialogPane === "key-mapper") && (
            <div
              style={{
                padding: "8px 16px 8px 16px",
              }}
            >
              <Space
                align="center"
                style={{ width: "100%", justifyContent: "space-between" }}
              >
                <Space align="center" size={8} wrap>
                  <Typography.Text strong>Characters / Tabs</Typography.Text>
                </Space>
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
                <Typography.Text type="secondary">
                  Selection updates apply immediately while running. Checked
                  tabs are included, unchecked tabs are excluded for Key Trigger
                  and cross-tab sync targets.
                </Typography.Text>
                {keyTriggerCharacters.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No Flyff tabs found"
                  />
                ) : (
                  <div className="fm-kt-character-grid">
                    {keyTriggerCharacters.map((tab) => (
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
                      >
                        {tab.name}
                      </Checkbox>
                    ))}
                  </div>
                )}
              </Space>
            </div>
          )}
        </>
      )}
    </div>
  );

  const dialogFooter = (
    <div className="fm-dialog-sticky-footer" role="status" aria-live="polite">
      {activeDialogPane === "key-trigger" && keyTriggerFooterControls && (
        <div className="fm-dialog-footer-controls-top">
          <div className="fm-dialog-footer-key-trigger-controls">
            {(keyTriggerFooterControls.showAddProfile ||
              keyTriggerFooterControls.showAddAction) && (
              <div className="fm-dialog-footer-key-trigger-add-row">
                {keyTriggerFooterControls.showAddProfile && (
                  <Button
                    icon={<PlusOutlined style={{ fontSize: 16 }} />}
                    className="fm-footer-btn-add"
                    block
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      padding: "6px 0",
                    }}
                    disabled={keyTriggerFooterControls.addProfileDisabled}
                    onClick={keyTriggerFooterControls.onAddProfile}
                  >
                    Add Profile
                  </Button>
                )}
                {keyTriggerFooterControls.showAddAction && (
                  <Button
                    icon={<PlusOutlined style={{ fontSize: 16 }} />}
                    className="fm-footer-btn-add"
                    block
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      padding: "6px 0",
                    }}
                    disabled={keyTriggerFooterControls.addActionDisabled}
                    onClick={keyTriggerFooterControls.onAddAction}
                  >
                    Add Action
                  </Button>
                )}
              </div>
            )}

            {keyTriggerFooterControls.showSaveCancel && (
              <div className="fm-dialog-footer-key-trigger-edit-row">
                <Tooltip
                  title={
                    keyTriggerFooterControls.saveDisabled
                      ? (keyTriggerFooterControls.saveDisabledReason ??
                        "Complete required fields to save.")
                      : undefined
                  }
                  {...dialogTooltipProps}
                >
                  <span className="fm-footer-save-wrap">
                    <Button
                      type="primary"
                      icon={<SaveIcon style={{ fontSize: 15 }} />}
                      className="fm-footer-btn-save"
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        letterSpacing: 0.2,
                        padding: "6px 0",
                      }}
                      disabled={keyTriggerFooterControls.saveDisabled}
                      onClick={keyTriggerFooterControls.onSave}
                    >
                      Save
                    </Button>
                  </span>
                </Tooltip>
                <Button
                  type="default"
                  icon={<CancelIcon style={{ fontSize: 15 }} />}
                  className="fm-footer-btn-cancel"
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    padding: "6px 0",
                  }}
                  onClick={keyTriggerFooterControls.onCancel}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="fm-dialog-footer-bottom">
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
        <div className="fm-dialog-footer-right">
          <Typography.Text
            type="secondary"
            className="fm-dialog-footer-version"
          >
            v{toolVersion}
          </Typography.Text>
        </div>
      </div>
    </div>
  );

  if (!dialogVisible || isTransformingShape) {
    return null;
  }
  if (!overlayVisible && (effectiveHasToolAccess || accessLoading)) {
    return null;
  }

  return (
    <ConfigProvider
      getPopupContainer={getDialogPopupContainer}
      theme={{
        token: {
          ...resolvedThemePreset.token,
          zIndexPopupBase: 2147483647,
        },
      }}
    >
      <Rnd
        className="fm-dialog fm-z-[2147483645]"
        style={dialogThemeVars}
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
            position: "relative",
            backgroundColor:
              resolvedThemePreset.token.colorBgContainer ??
              resolvedThemePreset.token.colorBgBase,
            color: resolvedThemePreset.token.colorTextBase,
          }}
          style={{
            backgroundColor:
              resolvedThemePreset.token.colorBgContainer ??
              resolvedThemePreset.token.colorBgBase,
            color: resolvedThemePreset.token.colorTextBase,
            borderColor: token.colorBorderSecondary,
          }}
          className="fm-panel fm-h-full"
          extra={
            <Space size={8} align="center">
              {showMergedBackButton && !isAccessGated && (
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
              {!isAccessGated && (
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
                  aria-label={
                    settings.editMode ? "Start Script" : "Stop Script"
                  }
                />
              )}
              {!isAccessGated && (
                <Tooltip title="Copy Tool Config" {...dialogTooltipProps}>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    aria-label="Copy tool config"
                    onClick={exportMappings}
                  />
                </Tooltip>
              )}
              {!isAccessGated && (
                <Tooltip title="Import Tool Config" {...dialogTooltipProps}>
                  <Button
                    type="text"
                    size="small"
                    className={isLocked ? "fm-header-action-btn-locked" : ""}
                    icon={<DownloadOutlined />}
                    aria-label="Import tool config"
                    aria-disabled={isLocked}
                    onClick={() => {
                      if (isLocked) {
                        return;
                      }

                      setImportOpen(true);
                    }}
                  />
                </Tooltip>
              )}
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
              {!isAccessGated && (
                <Tooltip
                  title="Reset Settings Defaults"
                  {...dialogTooltipProps}
                >
                  <Button
                    type="text"
                    size="small"
                    onClick={() => {
                      onResetDialogConfiguration();
                    }}
                    icon={<ReloadOutlined />}
                    aria-label="Reset settings defaults"
                  />
                </Tooltip>
              )}
              <Tooltip title="Settings" {...dialogTooltipProps}>
                <Button
                  type="text"
                  size="small"
                  icon={<SettingOutlined />}
                  aria-label={
                    activeDialogPane === "settings"
                      ? "Close settings"
                      : "Open settings"
                  }
                  onClick={() => {
                    toggleSettingsPane();
                  }}
                />
              </Tooltip>
              <Tooltip title="User Manual" {...dialogTooltipProps}>
                <Button
                  type="text"
                  size="small"
                  icon={<QuestionOutlined />}
                  aria-label="Open user manual"
                  onClick={() => setIsHelpDialogOpen(true)}
                />
              </Tooltip>
              {!isAccessGated && canOpenAdminPane && (
                <Tooltip title="Admin Panel" {...dialogTooltipProps}>
                  <Button
                    type="text"
                    size="small"
                    icon={<SafetyCertificateOutlined />}
                    aria-label={
                      activeDialogPane === "admin"
                        ? "Close admin panel"
                        : "Open admin panel"
                    }
                    onClick={() => {
                      toggleAdminPane();
                    }}
                  />
                </Tooltip>
              )}
            </Space>
          }
        >
          {isAccessGated && activeDialogPane !== "settings" && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 10,
                display: "flex",
                flexDirection: "column",
                padding: "24px 28px 0",
                background: "var(--fm-theme-bg-container)",
              }}
            >
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 20,
                }}
              >
                <Space
                  direction="vertical"
                  size={8}
                  align="center"
                  style={{ width: "100%", maxWidth: 320 }}
                >
                  <LockOutlined style={{ fontSize: 36, opacity: 0.55 }} />
                  <Typography.Text strong style={{ fontSize: 15 }}>
                    Access Required
                  </Typography.Text>
                  {accessReason && (
                    <Typography.Text
                      type="secondary"
                      style={{ textAlign: "center", display: "block" }}
                    >
                      {accessReason}
                    </Typography.Text>
                  )}
                </Space>
                <Form
                  layout="vertical"
                  style={{ width: "100%", maxWidth: 320 }}
                >
                  <Form.Item
                    label="Subscription Access Token"
                    style={{ marginBottom: 8 }}
                  >
                    <Input
                      value={settings.subscriptionAccessToken}
                      placeholder="Enter subscription token"
                      onChange={(event) => {
                        setSettings((prev) => ({
                          ...prev,
                          subscriptionAccessToken: event.target.value,
                        }));
                      }}
                      onPressEnter={() => {
                        void applySubscriptionToken();
                      }}
                    />
                  </Form.Item>
                  <Button
                    type="primary"
                    block
                    loading={Boolean(accessLoading)}
                    onClick={() => {
                      void applySubscriptionToken();
                    }}
                  >
                    Validate Token
                  </Button>
                  <Button
                    block
                    style={{ marginTop: 8 }}
                    onClick={() => {
                      void clearSavedToken();
                    }}
                  >
                    Clear Saved Token
                  </Button>
                  <Typography.Text
                    type="secondary"
                    style={{ display: "block", marginTop: 8 }}
                  >
                    Paste a different token and click Validate Token to switch
                    subscriptions.
                  </Typography.Text>
                  {accessLastCheckedAtIso && (
                    <Typography.Text
                      type="secondary"
                      style={{ display: "block", marginTop: 6 }}
                    >
                      Last access check:{" "}
                      {formatTokenDate(accessLastCheckedAtIso)}
                    </Typography.Text>
                  )}
                </Form>
              </div>
              <div
                className="fm-dialog-sticky-footer"
                style={{ marginLeft: -28, marginRight: -28 }}
              >
                <div className="fm-dialog-footer-bottom">
                  <div className="fm-dialog-footer-right">
                    <Typography.Text
                      type="secondary"
                      className="fm-dialog-footer-version"
                    >
                      v{toolVersion}
                    </Typography.Text>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="fm-dialog-slider-viewport">
            <div
              className="fm-dialog-slider-track"
              style={{
                transform: `translateX(-${activePaneIndex * (100 / 5)}%)`,
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
                        <div>
                          Active Profile:{" "}
                          <Typography.Text>
                            {activeProfileName || "No Active Profile"}
                          </Typography.Text>
                        </div>

                        <Typography.Text type="secondary">
                          Start turns on Edit Mode to add, move, resize, and
                          configure shapes. Stop turns on trigger mode for
                          gameplay use.
                        </Typography.Text>
                      </Space>
                    </Form.Item>

                    <Divider className="!fm-my-2" />

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
                          <Popover
                            open={profileCreateOpen}
                            onOpenChange={(open) => {
                              if (isLocked) {
                                setProfileCreateOpen(false);
                                return;
                              }
                              setProfileCreateOpen(open);
                              if (open) {
                                setProfileRenameOpen(false);
                              }
                              if (open) {
                                setProfileInlineNameError("");
                                setProfileCreateName("");
                                window.setTimeout(() => {
                                  profileCreateInputRef.current?.focus();
                                }, 50);
                              }
                            }}
                            trigger="click"
                            placement="bottomLeft"
                            {...dialogPopoverProps}
                            content={
                              <Space direction="vertical" size={6}>
                                <Space size={4}>
                                  <Input
                                    ref={profileCreateInputRef}
                                    size="small"
                                    placeholder="Profile name"
                                    value={profileCreateName}
                                    style={{ width: 180 }}
                                    onChange={(event) => {
                                      setProfileCreateName(event.target.value);
                                      if (profileInlineNameError) {
                                        setProfileInlineNameError("");
                                      }
                                    }}
                                    onPressEnter={submitCreateProfile}
                                  />
                                  <Button
                                    size="small"
                                    type="primary"
                                    icon={<SaveIcon />}
                                    onClick={submitCreateProfile}
                                    disabled={isLocked}
                                  />
                                  <Button
                                    size="small"
                                    type="default"
                                    icon={<CancelIcon />}
                                    onClick={() => {
                                      setProfileCreateOpen(false);
                                      setProfileInlineNameError("");
                                    }}
                                  />
                                </Space>
                                {profileInlineNameError && (
                                  <Typography.Text type="danger">
                                    {profileInlineNameError}
                                  </Typography.Text>
                                )}
                              </Space>
                            }
                          >
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
                                disabled={isLocked}
                                aria-label="Create profile"
                              />
                            </Tooltip>
                          </Popover>
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
                          <Popover
                            open={profileRenameOpen}
                            onOpenChange={(open) => {
                              if (isLocked || !selectedProfile) {
                                setProfileRenameOpen(false);
                                return;
                              }
                              setProfileRenameOpen(open);
                              if (open) {
                                setProfileCreateOpen(false);
                              }
                              if (open) {
                                setProfileInlineNameError("");
                                setProfileRenameName(
                                  selectedProfile?.name ?? "",
                                );
                                window.setTimeout(() => {
                                  profileRenameInputRef.current?.focus();
                                  profileRenameInputRef.current?.select();
                                }, 50);
                              }
                            }}
                            trigger="click"
                            placement="bottomLeft"
                            {...dialogPopoverProps}
                            content={
                              <Space direction="vertical" size={6}>
                                <Space size={4}>
                                  <Input
                                    ref={profileRenameInputRef}
                                    size="small"
                                    placeholder="Profile name"
                                    value={profileRenameName}
                                    style={{ width: 180 }}
                                    onChange={(event) => {
                                      setProfileRenameName(event.target.value);
                                      if (profileInlineNameError) {
                                        setProfileInlineNameError("");
                                      }
                                    }}
                                    onPressEnter={submitRenameProfile}
                                  />
                                  <Button
                                    size="small"
                                    type="primary"
                                    icon={<SaveIcon />}
                                    onClick={submitRenameProfile}
                                    disabled={isLocked || !selectedProfile}
                                  />
                                  <Button
                                    size="small"
                                    type="default"
                                    icon={<CancelIcon />}
                                    onClick={() => {
                                      setProfileRenameOpen(false);
                                      setProfileInlineNameError("");
                                    }}
                                  />
                                </Space>
                                {profileInlineNameError && (
                                  <Typography.Text type="danger">
                                    {profileInlineNameError}
                                  </Typography.Text>
                                )}
                              </Space>
                            }
                          >
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
                                disabled={isLocked || !selectedProfile}
                                aria-label="Rename selected profile"
                              />
                            </Tooltip>
                          </Popover>
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
                              {...dialogPopconfirmProps}
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

                    <Tooltip {...dialogTooltipProps} title="Add a new key map">
                      <span>
                        <ShapePaletteActionButton
                          selectedPaletteShape={selectedPaletteShape}
                          setSelectedPaletteShape={setSelectedPaletteShape}
                          onAddKeyMap={addKeyMap}
                          disabled={isLocked}
                          buttonType="dashed"
                          block
                          getPopupContainer={getDialogPopupContainer}
                        />
                      </span>
                    </Tooltip>

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
                  </Form>
                  {dialogFooter}
                </div>
              </div>

              <div className="fm-dialog-slider-pane">
                <div className="fm-dialog-form-shell">
                  {renderPaneTop()}
                  <div className="fm-key-trigger-pane-shell">
                    {(() => {
                      const selectedKeyTriggerTabs =
                        keyTriggerCharacters.filter((tab) =>
                          selectedKeyTriggerTabIds.includes(tab.id),
                        );

                      if (selectedKeyTriggerTabs.length === 0) {
                        return (
                          <>
                            <Typography.Text
                              type="secondary"
                              style={{ display: "block", marginBottom: 8 }}
                            >
                              No character/tab is currently checked. You can
                              still edit key trigger presets and profiles below.
                            </Typography.Text>
                            <KeyTriggerTab
                              key="key-trigger-global-editor"
                              presets={keyTriggerPresets}
                              selectedPresetId={selectedKeyTriggerPresetId}
                              onPresetsChange={setKeyTriggerPresets}
                              onSelectedPresetIdChange={
                                setSelectedKeyTriggerPresetId
                              }
                              availableTargetTabs={keyTriggerCharacters}
                              activeMapperProfileName={
                                selectedProfile?.name ?? null
                              }
                              activeMapperProfileBindings={
                                selectedProfile?.shapes
                                  .map((shape) => shape.keyBinding)
                                  .filter(
                                    (binding) => binding.trim().length > 0,
                                  ) ?? []
                              }
                              isConfigLocked={!settings.editMode}
                              onEditorOpenChange={setIsKeyTriggerEditorOpen}
                              onFooterControlsChange={
                                setKeyTriggerFooterControls
                              }
                              backRequestVersion={keyTriggerBackRequestVersion}
                              selectedProfileId={null}
                              onSelectedProfileIdChange={() => {
                                // No tab is selected, so profile selection is not mapped yet.
                              }}
                            />
                          </>
                        );
                      }

                      const activeSelectedTab = selectedKeyTriggerTabs[0];
                      const activeSelectedProfileId =
                        keyTriggerCharacterProfileMapping?.[
                          activeSelectedTab.name
                        ] ?? null;

                      return (
                        <>
                          <Typography.Text
                            type="secondary"
                            style={{ display: "block", marginBottom: 8 }}
                          >
                            Editing the selected preset will apply to the
                            checked character/tab targets.
                          </Typography.Text>
                          <KeyTriggerTab
                            key="key-trigger-shared-editor"
                            presets={keyTriggerPresets}
                            selectedPresetId={selectedKeyTriggerPresetId}
                            onPresetsChange={setKeyTriggerPresets}
                            onSelectedPresetIdChange={
                              setSelectedKeyTriggerPresetId
                            }
                            availableTargetTabs={keyTriggerCharacters}
                            activeMapperProfileName={
                              selectedProfile?.name ?? null
                            }
                            activeMapperProfileBindings={
                              selectedProfile?.shapes
                                .map((shape) => shape.keyBinding)
                                .filter(
                                  (binding) => binding.trim().length > 0,
                                ) ?? []
                            }
                            isConfigLocked={!settings.editMode}
                            onEditorOpenChange={setIsKeyTriggerEditorOpen}
                            onFooterControlsChange={setKeyTriggerFooterControls}
                            backRequestVersion={keyTriggerBackRequestVersion}
                            selectedProfileId={activeSelectedProfileId}
                            onSelectedProfileIdChange={(profileId) => {
                              setKeyTriggerCharacterProfileMapping((prev) => {
                                let nextMapping = prev;
                                let changed = false;

                                for (const tab of selectedKeyTriggerTabs) {
                                  const syncResult =
                                    syncKeyTriggerCharacterProfileSelection({
                                      currentMapping: nextMapping,
                                      tabName: tab.name,
                                      nextProfileId: profileId,
                                    });

                                  if (
                                    syncResult.shouldNotify &&
                                    syncResult.nextMapping
                                  ) {
                                    nextMapping = syncResult.nextMapping;
                                    changed = true;
                                  }
                                }

                                if (!changed) {
                                  return prev;
                                }

                                if (
                                  storage &&
                                  storage.saveKeyTriggerCharacterProfileMapping
                                ) {
                                  storage.saveKeyTriggerCharacterProfileMapping(
                                    nextMapping,
                                  );
                                }

                                return nextMapping;
                              });
                            }}
                          />
                        </>
                      );
                    })()}
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

                    <Form.Item label="Find Setting">
                      <Space
                        direction="vertical"
                        size={6}
                        className="fm-w-full"
                      >
                        <Input.Search
                          allowClear
                          placeholder="Search settings (e.g. easy access, shortcut, auto-stop)"
                          value={settingsSearchQuery}
                          onChange={(event) => {
                            setSettingsSearchQuery(event.target.value);
                          }}
                          onSearch={() => {
                            const firstMatch = filteredSettingsSearchEntries[0];
                            if (!firstMatch) {
                              return;
                            }
                            scrollToSettingsAnchor(firstMatch.id);
                          }}
                        />
                        {normalizedSettingsSearchQuery.length > 0 && (
                          <>
                            {filteredSettingsSearchEntries.length > 0 ? (
                              <Space wrap>
                                {filteredSettingsSearchEntries
                                  .slice(0, 8)
                                  .map((entry) => (
                                    <Button
                                      key={entry.id}
                                      size="small"
                                      type="default"
                                      onClick={() => {
                                        scrollToSettingsAnchor(entry.id);
                                      }}
                                    >
                                      {entry.label}
                                    </Button>
                                  ))}
                              </Space>
                            ) : (
                              <Typography.Text type="secondary">
                                No matching settings found.
                              </Typography.Text>
                            )}
                          </>
                        )}
                      </Space>
                    </Form.Item>

                    <div ref={setSettingsAnchor("factory-reset")} />
                    <Form.Item label="Factory Reset">
                      <Space
                        direction="vertical"
                        size={6}
                        className="fm-w-full"
                      >
                        <Button
                          danger
                          onClick={() => {
                            onFactoryResetConfiguration();
                          }}
                        >
                          Reset Tool to Clean Slate
                        </Button>
                        <Typography.Text type="warning">
                          Back up your tool config JSON first. Factory reset
                          removes all saved profiles, presets, mappings,
                          selected tabs, and settings.
                        </Typography.Text>
                      </Space>
                    </Form.Item>

                    <div ref={setSettingsAnchor("theme")} />
                    <Form.Item label="Theme">
                      <Space
                        direction="vertical"
                        size={6}
                        className="fm-w-full"
                      >
                        <Select
                          value={settings.theme}
                          options={THEME_SELECT_OPTIONS as any}
                          getPopupContainer={getDialogPopupContainer}
                          dropdownStyle={PROFILE_SELECT_DROPDOWN_STYLE}
                          onChange={(value) => {
                            handleThemeChange(value as ThemeMode);
                          }}
                        />
                        <Typography.Text type="secondary">
                          Active appearance:{" "}
                          {resolvedThemePreset.appearance.toUpperCase()}.
                        </Typography.Text>
                      </Space>
                    </Form.Item>

                    {!isAccessGated && (
                      <>
                        <Form.Item>
                          <Space
                            direction="vertical"
                            size={4}
                            className="fm-w-full"
                          >
                            <Divider className="!fm-my-1" />
                            <Typography.Text strong>
                              Key Mapper Settings
                            </Typography.Text>
                            <Typography.Text type="secondary">
                              Runtime behavior, visuals, and mapper-related
                              shortcuts.
                            </Typography.Text>
                          </Space>
                        </Form.Item>

                        <Form.Item label="Strict Input Passthrough">
                          <div ref={setSettingsAnchor("strict-passthrough")} />
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
                              In Stop mode, gameplay input passes through unless
                              it matches a mapper shortcut or mapped shape
                              binding.
                            </Typography.Text>
                          </Space>
                        </Form.Item>

                        <Form.Item
                          label={
                            <Space size={6} align="center">
                              <span>Easy Access Arrow Button</span>
                              <Tooltip
                                title="Turn this off to keep the easy-access panel always visible without the left arrow control. Your last expanded or collapsed state is still remembered."
                                {...dialogTooltipProps}
                              >
                                <QuestionOutlined
                                  style={{
                                    color: "var(--fm-theme-text-secondary)",
                                  }}
                                />
                              </Tooltip>
                            </Space>
                          }
                        >
                          <div ref={setSettingsAnchor("easy-access-arrow")} />
                          <Space
                            direction="vertical"
                            size={4}
                            className="fm-w-full"
                          >
                            <Switch
                              checked={settings.showEasyAccessArrowButton}
                              disabled={isLocked}
                              onChange={(checked) => {
                                setSettings((prev) => ({
                                  ...prev,
                                  showEasyAccessArrowButton: checked,
                                }));
                              }}
                            />
                            <Typography.Text type="secondary">
                              When disabled, the easy-access panel stays visible
                              and hides the left arrow toggle button.
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
                              Shows or hides snap alignment guide lines when
                              snap alignment is active.
                            </Typography.Text>
                          </Space>
                        </Form.Item>

                        <Form.Item
                          label={
                            <Space size={6} align="center">
                              <span>Show Easy Access UI</span>
                              <Tooltip
                                title="Hides or shows the full easy-access area, including both the arrow button and ribbon panel."
                                {...dialogTooltipProps}
                              >
                                <QuestionOutlined
                                  style={{
                                    color: "var(--fm-theme-text-secondary)",
                                  }}
                                />
                              </Tooltip>
                            </Space>
                          }
                        >
                          <div ref={setSettingsAnchor("easy-access-ui")} />
                          <Space
                            direction="vertical"
                            size={4}
                            className="fm-w-full"
                          >
                            <Switch
                              checked={settings.showEasyAccessUi}
                              disabled={isLocked}
                              onChange={(checked) => {
                                setSettings((prev) => ({
                                  ...prev,
                                  showEasyAccessUi: checked,
                                }));
                              }}
                            />
                            <Typography.Text type="secondary">
                              Shows or hides the entire easy-access UI,
                              including the arrow button and ribbon panel.
                            </Typography.Text>
                          </Space>
                        </Form.Item>

                        <Form.Item label="Shape Key Binding Tooltips">
                          <Space
                            direction="vertical"
                            size={4}
                            className="fm-w-full"
                          >
                            <Switch
                              checked={settings.showShapeTooltips}
                              disabled={isLocked}
                              onChange={(checked) => {
                                setSettings((prev) => ({
                                  ...prev,
                                  showShapeTooltips: checked,
                                }));
                              }}
                            />
                            <Typography.Text type="secondary">
                              Shows or hides key binding tooltips when hovering
                              over shapes.
                            </Typography.Text>
                          </Space>
                        </Form.Item>

                        <Form.Item label="Opacity">
                          <Slider
                            min={0}
                            max={1}
                            step={0.01}
                            value={shapeOpacityDraft}
                            onChange={(value) => {
                              const nextOpacity = Number(value);
                              setShapeOpacityDraft(nextOpacity);
                              setSettings((prev) => ({
                                ...prev,
                                shapeOpacity: nextOpacity,
                              }));
                            }}
                            onChangeComplete={(value) => {
                              const nextOpacity = Number(value);
                              setSettings((prev) => ({
                                ...prev,
                                shapeOpacity: nextOpacity,
                              }));
                            }}
                          />
                          <Typography.Text type="secondary">
                            Controls visibility intensity for all shapes in the
                            active profile.
                          </Typography.Text>
                        </Form.Item>

                        <Form.Item label="Subscription Access Token">
                          <Space
                            direction="vertical"
                            size={6}
                            className="fm-w-full"
                          >
                            <Typography.Text type="warning">
                              Preserved by Reset Settings Defaults. Cleared only
                              by Reset Tool to Clean Slate.
                            </Typography.Text>
                            <Input
                              value={settings.subscriptionAccessToken}
                              placeholder="Enter subscription token"
                              onChange={(event) => {
                                setSettings((prev) => ({
                                  ...prev,
                                  subscriptionAccessToken: event.target.value,
                                }));
                              }}
                            />
                            <Button
                              loading={Boolean(accessLoading)}
                              onClick={() => {
                                void applySubscriptionToken();
                              }}
                            >
                              Validate Token
                            </Button>
                            <Button
                              onClick={() => {
                                void clearSavedToken();
                              }}
                            >
                              Clear Saved Token
                            </Button>
                            {effectiveAccessSource === "token" &&
                              tokenExpiresAtIso && (
                                <Typography.Text type="secondary">
                                  Current token expires:{" "}
                                  {renderDateWithRemainingTooltip(
                                    tokenExpiresAtIso,
                                  )}
                                </Typography.Text>
                              )}
                            <Typography.Text type="secondary">
                              To use another subscription token, replace the
                              value above and click Validate Token.
                            </Typography.Text>
                            {accessLastCheckedAtIso && (
                              <Typography.Text type="secondary">
                                Last access check:{" "}
                                {formatTokenDate(accessLastCheckedAtIso)}
                              </Typography.Text>
                            )}
                          </Space>
                        </Form.Item>

                        <Form.Item label="Toggle Dialog Shortcut">
                          <div
                            ref={setSettingsAnchor("toggle-dialog-shortcut")}
                          />
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

                        <Form.Item label="Show/Hide Easy Access Shortcut">
                          <div
                            ref={setSettingsAnchor(
                              "toggle-easy-access-shortcut",
                            )}
                          />
                          <Space
                            direction="vertical"
                            size={4}
                            className="fm-w-full"
                          >
                            <div
                              className={`fm-shortcut-input-shell${settings.toggleEasyAccessUiShortcut ? " fm-shortcut-input-has-value" : ""}`}
                            >
                              <Input
                                className="fm-global-shortcut-input"
                                value={settings.toggleEasyAccessUiShortcut}
                                placeholder="Press keys"
                                disabled={isLocked}
                                onKeyDown={(event) => {
                                  captureGlobalShortcut(
                                    event,
                                    "toggleEasyAccessUiShortcut",
                                  );
                                }}
                              />
                              {settings.toggleEasyAccessUiShortcut && (
                                <span
                                  className="fm-shortcut-input-overlay"
                                  aria-hidden="true"
                                >
                                  <ShortcutKeys
                                    combo={settings.toggleEasyAccessUiShortcut}
                                  />
                                </span>
                              )}
                            </div>
                            <Typography.Text type="secondary">
                              Toggles easy-access visibility (arrow and panel).
                              Default: Alt+Shift+U.
                            </Typography.Text>
                            {globalShortcutErrors.toggleEasyAccessUiShortcut && (
                              <Typography.Text type="danger">
                                {
                                  globalShortcutErrors.toggleEasyAccessUiShortcut
                                }
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
                                  captureGlobalShortcut(
                                    event,
                                    "addKeyMapShortcut",
                                  );
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
                              Shortcut used by the Add Key Map action while in
                              Edit Mode. Default: Alt+Shift+A.
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
                              Shows or hides visual shape overlays without
                              modifying profile mappings.
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
                              Toggles all shape opacity values in the active
                              profile between 0% and 100%.
                            </Typography.Text>
                            {globalShortcutErrors.setZeroOpacityShortcut && (
                              <Typography.Text type="danger">
                                {globalShortcutErrors.setZeroOpacityShortcut}
                              </Typography.Text>
                            )}
                          </Space>
                        </Form.Item>

                        <Form.Item label="Auto-Stop (seconds)">
                          <div ref={setSettingsAnchor("auto-stop")} />
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
                                min={0}
                                step={1}
                                value={autoStopDraftSeconds}
                                placeholder="Disabled"
                                style={{ width: "100%" }}
                                onChange={(value) => {
                                  const nextValue =
                                    typeof value === "number" &&
                                    Number.isFinite(value)
                                      ? value
                                      : 0;
                                  setAutoStopDraftSeconds(
                                    Math.max(0, nextValue),
                                  );
                                }}
                                onBlur={flushAutoStopDraftToSettings}
                                onPressEnter={flushAutoStopDraftToSettings}
                                addonAfter="s"
                              />
                            </div>
                            <Typography.Text type="secondary">
                              Script automatically stops if no activity is
                              detected for this duration. Set 0 to disable.
                            </Typography.Text>
                          </Space>
                        </Form.Item>

                        <Form.Item label="CAPTCHA Detection Action">
                          <div ref={setSettingsAnchor("captcha-detection")} />
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
                              Sets what happens when a reCAPTCHA or hCaptcha
                              element is detected.
                            </Typography.Text>
                          </Space>
                        </Form.Item>

                        <Form.Item label="Mobile Push Notifications (Discord Bot)">
                          <div ref={setSettingsAnchor("mobile-push")} />
                          <Space
                            direction="vertical"
                            size={8}
                            className="fm-w-full"
                          >
                            <Typography.Text type="warning">
                              Preserved by Reset Settings Defaults. Cleared only
                              by Reset Tool to Clean Slate.
                            </Typography.Text>
                            <Switch
                              checked={settings.mobilePushEnabled}
                              onChange={(checked) => {
                                setSettings((prev) => ({
                                  ...prev,
                                  mobilePushEnabled: checked,
                                }));
                              }}
                            />
                            {settings.mobilePushEnabled && (
                              <>
                                <Input
                                  value={settings.mobilePushDiscordBotUrl}
                                  placeholder="Bot URL (e.g. https://your-bot.onrender.com)"
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setSettings((prev) => ({
                                      ...prev,
                                      mobilePushDiscordBotUrl: value,
                                    }));
                                  }}
                                />
                                <Input
                                  value={settings.mobilePushDiscordUserId}
                                  placeholder="Your Discord User ID"
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setSettings((prev) => ({
                                      ...prev,
                                      mobilePushDiscordUserId: value,
                                    }));
                                  }}
                                />
                                <Input.Password
                                  value={settings.mobilePushDiscordApiKey}
                                  placeholder="Discord Bot API Key"
                                  onChange={(event) => {
                                    const value = event.target.value;
                                    setSettings((prev) => ({
                                      ...prev,
                                      mobilePushDiscordApiKey: value,
                                    }));
                                  }}
                                />
                                <Space wrap>
                                  <Button
                                    onClick={() => {
                                      void testMobilePushConnection();
                                    }}
                                    disabled={!canTestConnection}
                                    loading={isTestingConnection}
                                  >
                                    Test Connection
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      void sendTestMobilePush();
                                    }}
                                    disabled={!canSendTestPush}
                                    loading={isSendingTestPush}
                                  >
                                    Send Test Push
                                  </Button>
                                </Space>
                              </>
                            )}
                            <Typography.Text type="secondary">
                              Sends Discord DM alerts for auto-stop and CAPTCHA
                              detection events. Deploy the Discord bot, then
                              enter its URL, your Discord User ID, and Bot API
                              key above.
                            </Typography.Text>
                          </Space>
                        </Form.Item>

                        <Form.Item label="Sync Mouse Events Across Tabs">
                          <div ref={setSettingsAnchor("sync-mouse")} />
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
                                        settings.mouseSyncPositionMode ===
                                        "ratio"
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
                                          value === "ratio"
                                            ? "ratio"
                                            : "actual",
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
                              interactions to selected Flyff tabs. Use Ratio
                              mode when target windows have different sizes so
                              cursor mapping remains visible.
                            </Typography.Text>
                          </Space>
                        </Form.Item>

                        <Form.Item label="Experimental Features">
                          <div
                            ref={setSettingsAnchor("experimental-features")}
                          />
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
                              Enables experimental utilities: Auto-Holy,
                              Auto-Pills, and Auto-Awaken.
                            </Typography.Text>
                          </Space>
                        </Form.Item>

                        {settings.experimentalFeaturesEnabled && (
                          <>
                            <div ref={setSettingsAnchor("auto-holy")} />
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
                                      <div
                                        ref={setSettingsAnchor(
                                          "auto-holy-debuff",
                                        )}
                                      />
                                      <Select
                                        value={settings.autoHoly.debuffType}
                                        getPopupContainer={
                                          getDialogPopupContainer
                                        }
                                        dropdownStyle={
                                          PROFILE_SELECT_DROPDOWN_STYLE
                                        }
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
                                              debuffType:
                                                value as AutoHolyDebuffType,
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
                                      <div
                                        ref={setSettingsAnchor(
                                          "auto-holy-region",
                                        )}
                                      />
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
                                            disabled={
                                              !settings.autoHoly.scanRegion
                                            }
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
                                        ref={setSettingsAnchor("auto-holy-key")}
                                      />
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
                                            input.focus({
                                              preventScroll: true,
                                            });

                                            if (!wasFocused) {
                                              return;
                                            }

                                            const now = Date.now();
                                            const prev =
                                              holyKeyLastClickRef.current;
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
                                              input.focus({
                                                preventScroll: true,
                                              });
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
                                  Automatically uses the Scroll of Holy when a
                                  root or stun debuff is detected on screen.
                                </Typography.Text>
                              </Space>
                            </Form.Item>
                          </>
                        )}

                        {settings.experimentalFeaturesEnabled && (
                          <>
                            <div ref={setSettingsAnchor("auto-pills")} />
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
                                      <div
                                        ref={setSettingsAnchor(
                                          "auto-pills-threshold",
                                        )}
                                      />
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
                                      <div
                                        ref={setSettingsAnchor(
                                          "auto-pills-region",
                                        )}
                                      />
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
                                            disabled={
                                              !settings.autoPills.scanRegion
                                            }
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
                                        ref={setSettingsAnchor(
                                          "auto-pills-key",
                                        )}
                                      />
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
                                            input.focus({
                                              preventScroll: true,
                                            });

                                            if (!wasFocused) {
                                              return;
                                            }

                                            const now = Date.now();
                                            const prev =
                                              pillKeyLastClickRef.current;
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
                                              input.focus({
                                                preventScroll: true,
                                              });
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
                                  Automatically uses pills when HP drops to or
                                  below the set threshold percentage. Enable HP
                                  Debug Overlay while calibrating to see live
                                  detected HP values.
                                </Typography.Text>
                              </Space>
                            </Form.Item>
                          </>
                        )}
                      </>
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

              <div className="fm-dialog-slider-pane">
                <div className="fm-dialog-form-shell">
                  {activeDialogPane === "admin" && canOpenAdminPane && (
                    <>
                      {renderPaneTop({ hideUtilityControls: true })}
                      <Form
                        layout="vertical"
                        className="fm-settings-form"
                        style={{ direction: "ltr", padding: "12px 16px 0" }}
                      >
                        <Form.Item>
                          <Space
                            direction="vertical"
                            size={4}
                            className="fm-w-full"
                          >
                            <Typography.Text strong>
                              Admin Panel
                            </Typography.Text>
                            <Typography.Text type="secondary">
                              Role: {effectiveRole.toUpperCase()} | Plan:{" "}
                              {effectivePlan.toUpperCase()} | Access Source:{" "}
                              {effectiveAccessSource.toUpperCase()}
                            </Typography.Text>
                            {accessReason && (
                              <Typography.Text type="secondary">
                                {accessReason}
                              </Typography.Text>
                            )}
                            {tokenExpiresAtIso && (
                              <Typography.Text type="secondary">
                                Token expires:{" "}
                                {renderDateWithRemainingTooltip(
                                  tokenExpiresAtIso,
                                )}
                              </Typography.Text>
                            )}
                            {!canManageAccessEffective && (
                              <Typography.Text type="warning">
                                Access is read-only for this role.
                              </Typography.Text>
                            )}
                          </Space>
                        </Form.Item>

                        {canManageAdminsEffective && (
                          <Form.Item label="Role Issuance Rules">
                            <Typography.Text type="secondary">
                              Subscription-token access is role based. The admin
                              panel can issue tokens for USER and ADMIN roles
                              only. Unlimited plan tokens are restricted to
                              SUPERADMIN. SUPERADMIN must be managed through
                              auth claims tooling.
                            </Typography.Text>
                          </Form.Item>
                        )}

                        {canGenerateTokensEffective && (
                          <Form.Item label="Subscription Tokens">
                            <Space
                              direction="vertical"
                              size={8}
                              className="fm-w-full"
                            >
                              <Typography.Text type="secondary">
                                Generate subscription tokens with a role and
                                plan. Unlimited plan never expires and unlocks
                                all features.
                              </Typography.Text>
                              <Select
                                value={tokenIssueRole}
                                options={[
                                  { value: "user", label: "User" },
                                  { value: "admin", label: "Admin" },
                                ]}
                                onChange={(value) => {
                                  setTokenIssueRole(
                                    value === "admin" ? "admin" : "user",
                                  );
                                }}
                              />
                              <Select
                                value={tokenIssuePlan}
                                options={[
                                  { value: "free", label: "Free (7 days)" },
                                  { value: "pro", label: "Pro (30 days)" },
                                  { value: "elite", label: "Elite (90 days)" },
                                  ...(canIssueUnlimitedPlan
                                    ? [
                                        {
                                          value: "unlimited",
                                          label: "Unlimited (No expiry)",
                                        },
                                      ]
                                    : []),
                                ]}
                                onChange={(value) => {
                                  setTokenIssuePlan(
                                    value === "unlimited" &&
                                      canIssueUnlimitedPlan
                                      ? "unlimited"
                                      : value === "elite"
                                        ? "elite"
                                        : value === "pro"
                                          ? "pro"
                                          : "free",
                                  );
                                }}
                              />
                              <Typography.Text type="secondary">
                                Expires At (auto by plan):{" "}
                                {tokenIssuePlan === "unlimited"
                                  ? "No expiry"
                                  : renderDateWithRemainingTooltip(
                                      buildPlanExpiryIso(tokenIssuePlan),
                                    )}
                              </Typography.Text>
                              <Button
                                loading={tokenIssueLoading}
                                onClick={() => {
                                  void issueSubscriptionToken();
                                }}
                              >
                                Generate Subscription Token
                              </Button>
                              {generatedToken && (
                                <Input.TextArea
                                  value={generatedToken}
                                  readOnly
                                  autoSize={{ minRows: 2, maxRows: 4 }}
                                />
                              )}
                              {generatedTokenExpiresAtIso && (
                                <Typography.Text type="secondary">
                                  Generated token expires:{" "}
                                  {renderDateWithRemainingTooltip(
                                    generatedTokenExpiresAtIso,
                                  )}
                                </Typography.Text>
                              )}
                              {generatedTokenRole && (
                                <Typography.Text type="secondary">
                                  Generated token role: {generatedTokenRole}
                                </Typography.Text>
                              )}
                              {!generatedTokenExpiresAtIso &&
                                generatedToken && (
                                  <Typography.Text type="secondary">
                                    Generated token expiry: No expiry
                                  </Typography.Text>
                                )}

                              <Divider style={{ margin: "8px 0" }} />

                              <Button
                                icon={<ReloadOutlined />}
                                loading={tokenListLoading}
                                onClick={() => {
                                  void refreshIssuedTokens();
                                }}
                              >
                                Refresh Token List
                              </Button>

                              <Space size={8} wrap className="fm-w-full">
                                <Select
                                  value={tokenStatusFilter}
                                  style={{ minWidth: 140 }}
                                  options={[
                                    { value: "all", label: "All Statuses" },
                                    { value: "active", label: "Active" },
                                    { value: "inactive", label: "Inactive" },
                                    { value: "expired", label: "Expired" },
                                  ]}
                                  onChange={(value) => {
                                    setTokenStatusFilter(
                                      value === "active"
                                        ? "active"
                                        : value === "inactive"
                                          ? "inactive"
                                          : value === "expired"
                                            ? "expired"
                                            : "all",
                                    );
                                  }}
                                />
                                <Select
                                  value={tokenPlanFilter}
                                  style={{ minWidth: 140 }}
                                  options={[
                                    { value: "all", label: "All Plans" },
                                    { value: "free", label: "Free" },
                                    { value: "pro", label: "Pro" },
                                    { value: "elite", label: "Elite" },
                                    { value: "unlimited", label: "Unlimited" },
                                  ]}
                                  onChange={(value) => {
                                    setTokenPlanFilter(
                                      value === "free"
                                        ? "free"
                                        : value === "pro"
                                          ? "pro"
                                          : value === "elite"
                                            ? "elite"
                                            : value === "unlimited"
                                              ? "unlimited"
                                              : "all",
                                    );
                                  }}
                                />
                                <Typography.Text type="secondary">
                                  Showing {filteredIssuedTokens.length} of{" "}
                                  {issuedTokens.length}
                                </Typography.Text>
                              </Space>

                              <div
                                className="fm-w-full"
                                style={adminTableShellStyle}
                              >
                                <table style={adminTableStyle}>
                                  <thead>
                                    <tr>
                                      <th
                                        align="left"
                                        style={adminHeaderCellStyle}
                                      >
                                        Token Hash
                                      </th>
                                      <th
                                        align="left"
                                        style={adminHeaderCellStyle}
                                      >
                                        Plan
                                      </th>
                                      <th
                                        align="left"
                                        style={adminHeaderCellStyle}
                                      >
                                        Role
                                      </th>
                                      <th
                                        align="left"
                                        style={adminHeaderCellStyle}
                                      >
                                        Status
                                      </th>
                                      <th
                                        align="left"
                                        style={adminHeaderCellStyle}
                                      >
                                        Expires
                                      </th>
                                      <th
                                        align="left"
                                        style={adminHeaderCellStyle}
                                      >
                                        Created
                                      </th>
                                      <th
                                        align="left"
                                        style={adminHeaderCellStyle}
                                      >
                                        Issuer IP
                                      </th>
                                      <th
                                        align="left"
                                        style={adminHeaderCellStyle}
                                      >
                                        Actions
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filteredIssuedTokens.length === 0 ? (
                                      <tr>
                                        <td
                                          colSpan={8}
                                          style={adminBodyCellStyle}
                                        >
                                          <Typography.Text type="secondary">
                                            No issued tokens match the current
                                            filters.
                                          </Typography.Text>
                                        </td>
                                      </tr>
                                    ) : (
                                      filteredIssuedTokens.map((item) => {
                                        const effectiveStatus =
                                          getTokenStatus(item);
                                        const canRevoke =
                                          effectiveStatus === "active";

                                        return (
                                          <tr key={item.tokenHash}>
                                            <td style={adminBodyCellStyle}>
                                              {maskedToken(item.tokenHash)}
                                            </td>
                                            <td style={adminBodyCellStyle}>
                                              {item.plan.toUpperCase()}
                                            </td>
                                            <td style={adminBodyCellStyle}>
                                              {item.role.toUpperCase()}
                                            </td>
                                            <td style={adminBodyCellStyle}>
                                              {effectiveStatus === "active"
                                                ? renderStateTag(
                                                    "active",
                                                    "success",
                                                  )
                                                : effectiveStatus === "inactive"
                                                  ? renderStateTag(
                                                      "inactive",
                                                      "default",
                                                    )
                                                  : renderStateTag(
                                                      "expired",
                                                      "warning",
                                                    )}
                                            </td>
                                            <td style={adminBodyCellStyle}>
                                              {item.expiresAt
                                                ? renderDateWithRemainingTooltip(
                                                    item.expiresAt,
                                                  )
                                                : "No expiry"}
                                            </td>
                                            <td style={adminBodyCellStyle}>
                                              {formatTokenDate(item.createdAt)}
                                            </td>
                                            <td style={adminBodyCellStyle}>
                                              {item.createdByIp ?? "-"}
                                            </td>
                                            <td style={adminBodyCellStyle}>
                                              <Space size={4}>
                                                <Popconfirm
                                                  {...dialogPopconfirmProps}
                                                  title="Revoke token?"
                                                  description="This will deactivate the token immediately."
                                                  okText="Revoke"
                                                  okButtonProps={{
                                                    danger: true,
                                                  }}
                                                  disabled={!canRevoke}
                                                  onConfirm={() => {
                                                    void revokeIssuedToken(
                                                      item.tokenHash,
                                                    );
                                                  }}
                                                >
                                                  <Button
                                                    danger
                                                    size="small"
                                                    disabled={!canRevoke}
                                                    loading={
                                                      revokingTokenHash ===
                                                      item.tokenHash
                                                    }
                                                  >
                                                    Revoke
                                                  </Button>
                                                </Popconfirm>
                                                <Popconfirm
                                                  {...dialogPopconfirmProps}
                                                  title="Delete token record?"
                                                  description="This permanently removes the token record from the list."
                                                  okText="Delete"
                                                  okButtonProps={{
                                                    danger: true,
                                                  }}
                                                  onConfirm={() => {
                                                    void deleteIssuedToken(
                                                      item.tokenHash,
                                                    );
                                                  }}
                                                >
                                                  <Button
                                                    danger
                                                    size="small"
                                                    loading={
                                                      deletingTokenHash ===
                                                      item.tokenHash
                                                    }
                                                  >
                                                    Delete
                                                  </Button>
                                                </Popconfirm>
                                              </Space>
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </Space>
                          </Form.Item>
                        )}
                      </Form>
                      {dialogFooter}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>

        <Modal
          title="Flyff Utility User Manual"
          open={isHelpDialogOpen}
          onCancel={() => setIsHelpDialogOpen(false)}
          wrapClassName="fm-ltr-modal fm-shortcuts-features-modal fm-user-manual-modal"
          footer={[
            <Button key="close" onClick={() => setIsHelpDialogOpen(false)}>
              Close
            </Button>,
          ]}
          width={760}
          zIndex={2147483647}
        >
          <div className="fm-user-manual-scroll">{helpDialogContent}</div>
        </Modal>

        <div
          className="fm-dialog-manual-resize-layer"
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 2147483645,
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
