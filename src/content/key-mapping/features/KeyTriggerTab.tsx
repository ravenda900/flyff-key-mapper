// Extend the Window interface to include fmCurrentTabId
declare global {
  interface Window {
    fmCurrentTabId?: number;
  }
}
import {
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
  PoweroffOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import {
  Button,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  Popconfirm,
  Popover,
  Segmented,
  Select,
  Space,
  Tooltip,
  Typography,
  message,
  theme,
} from "antd";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent as ReactWheelEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  CharacterTabInfo,
  KeyTriggerAction,
  KeyTriggerProfile,
  KeyTriggerPreset,
  TriggerType,
} from "../../types";
import { ShortcutKeys } from "../components/ShortcutKeys";

type Props = {
  presets: KeyTriggerPreset[];
  selectedPresetId: string;
  onPresetsChange: (presets: KeyTriggerPreset[]) => void;
  onSelectedPresetIdChange: (presetId: string) => void;
  availableTargetTabs: CharacterTabInfo[];
  activeMapperProfileName?: string | null;
  activeMapperProfileBindings?: string[];
  isConfigLocked: boolean;
  onEditorOpenChange?: (isOpen: boolean) => void;
  onFooterControlsChange?: (controls: KeyTriggerFooterControls | null) => void;
  backRequestVersion?: number;
  selectedProfileId?: string | null;
  onSelectedProfileIdChange?: (profileId: string | null) => void;
};

export type KeyTriggerFooterControls = {
  showAddProfile: boolean;
  addProfileDisabled: boolean;
  onAddProfile: () => void;
  showAddAction: boolean;
  addActionDisabled: boolean;
  onAddAction: () => void;
  showSaveCancel: boolean;
  saveDisabled: boolean;
  saveDisabledReason?: string;
  onSave: () => void;
  onCancel: () => void;
};

type ProfileEditorDraft = {
  id: string;
  profileIdentifier: string;
  name: string;
  enabled: boolean;
  triggerType: TriggerType;
  repeatCount: number;
  triggerKey: string;
  executionScope: "all" | "current" | "other" | "specific";
  currentTabOnly?: boolean;
  otherTabsOnly?: boolean;
  specificTargetTabId?: number | null;
  specificTargetTabName?: string | null;
  specificTargetTabIds?: number[];
  specificTargetTabNames?: string[];
  delayMode: "sequential" | "synchronous";
  actions: KeyTriggerAction[];
  lockToTab?: boolean;
  toggleOwnerTabId?: number;
};

const normalizeRepeatCount = (value: unknown, fallback = 2): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.min(999, Math.max(2, Math.round(fallback)));
  }

  return Math.min(999, Math.max(2, Math.round(numeric)));
};

const normalizeActionRepeatCount = (value: unknown, fallback = 2): number => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.min(99, Math.max(2, Math.round(fallback)));
  }

  return Math.min(99, Math.max(2, Math.round(numeric)));
};

const createProfileId = () =>
  `kt-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createProfileIdentifier = () =>
  `kt-identifier-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const createActionId = () =>
  `kt-action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const MODIFIER_KEYS = new Set(["Control", "Alt", "Shift", "Meta"]);

const normalizeKeyFromCode = (code: string, fallbackKey: string): string => {
  if (/^Digit[0-9]$/i.test(code)) {
    return code.slice(-1);
  }

  if (/^Key[A-Z]$/i.test(code)) {
    return code.slice(-1).toUpperCase();
  }

  if (/^F[0-9]{1,2}$/i.test(code)) {
    return code.toUpperCase();
  }

  if (/^Numpad[0-9]$/i.test(code)) {
    return code.replace("Numpad", "Numpad ");
  }

  const codeMap: Record<string, string> = {
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backquote: "`",
    Space: "Space",
    Tab: "Tab",
    Enter: "Enter",
    Escape: "Esc",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
  };

  if (codeMap[code]) {
    return codeMap[code];
  }

  if (fallbackKey.length === 1) {
    return fallbackKey.toUpperCase();
  }

  return fallbackKey;
};

const buildRecordedShortcut = (event: ReactKeyboardEvent<HTMLInputElement>) => {
  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Meta");

  if (MODIFIER_KEYS.has(event.key)) {
    return "";
  }

  const key = normalizeKeyFromCode(event.code, event.key);
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

const WHEEL_CAPTURE_ARM_WINDOW_MS = 1500;

const moveById = <T extends { id: string }>(
  items: T[],
  sourceId: string,
  targetId: string,
): T[] => {
  if (sourceId === targetId) {
    return items;
  }

  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildParenthesizedDuplicateName = (
  base: string,
  existing: string[],
): string => {
  const trimmedBase = base.trim() || "Item";
  const numberedPattern = new RegExp(
    `^${escapeRegExp(trimmedBase)}\\s*\\((\\d+)\\)$`,
    "i",
  );

  const existingNumbers = existing
    .map((value) => value.trim())
    .map((value) => {
      const matched = numberedPattern.exec(value);
      return matched ? Number(matched[1]) : null;
    })
    .filter((value): value is number => value !== null);

  const nextNumber =
    existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
  return `${trimmedBase} (${nextNumber})`;
};

const getNextActionName = (existingNames: string[]): string => {
  const actionNumbers = existingNames
    .map((value) => value.trim())
    .map((value) => {
      const numbered = /^action\s+(\d+)$/i.exec(value);
      if (numbered) {
        return Number(numbered[1]);
      }

      if (/^action$/i.test(value)) {
        return 1;
      }

      return null;
    })
    .filter((value): value is number => value !== null);

  const nextNumber =
    actionNumbers.length > 0 ? Math.max(...actionNumbers) + 1 : 1;
  return `Action ${nextNumber}`;
};

const getNextProfileName = (existingNames: string[]): string => {
  const profileNumbers = existingNames
    .map((value) => value.trim())
    .map((value) => {
      const numbered = /^profile\s+(\d+)$/i.exec(value);
      if (numbered) {
        return Number(numbered[1]);
      }

      if (/^profile$/i.test(value)) {
        return 1;
      }

      return null;
    })
    .filter((value): value is number => value !== null);

  const nextNumber =
    profileNumbers.length > 0 ? Math.max(...profileNumbers) + 1 : 1;
  return `Profile ${nextNumber}`;
};

const createDefaultAction = (
  existingNames: string[] = [],
): KeyTriggerAction => {
  return {
    id: createActionId(),
    name: getNextActionName(existingNames),
    key: "",
    delayMs: 0,
    enabled: true,
    actionTriggerType: "once",
    actionRepeatCount: 1,
  };
};

const isProfileLike = (value: unknown): value is Partial<KeyTriggerProfile> =>
  typeof value === "object" && value !== null;

const extractProfilesFromImportPayload = (
  payload: unknown,
): Partial<KeyTriggerProfile>[] => {
  if (Array.isArray(payload)) {
    return payload.filter(isProfileLike);
  }

  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { profiles?: unknown }).profiles)
  ) {
    return (payload as { profiles: unknown[] }).profiles.filter(isProfileLike);
  }

  return [];
};

const normalizeShortcutForConflictCheck = (binding: string): string => {
  const parts = binding
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (parts.length === 0) {
    return "";
  }

  const modifiers = new Set<string>();
  const steps: string[] = [];

  parts.forEach((part) => {
    if (part === "ctrl" || part === "control") {
      modifiers.add("ctrl");
      return;
    }

    if (part === "alt") {
      modifiers.add("alt");
      return;
    }

    if (part === "shift") {
      modifiers.add("shift");
      return;
    }

    if (part === "meta" || part === "cmd" || part === "command") {
      modifiers.add("meta");
      return;
    }

    if (part === "escape") {
      steps.push("esc");
      return;
    }

    steps.push(part);
  });

  const orderedModifiers = ["ctrl", "alt", "shift", "meta"].filter((modifier) =>
    modifiers.has(modifier),
  );

  return [...orderedModifiers, ...steps].join("+");
};

export const KeyTriggerTab = ({
  presets,
  selectedPresetId,
  onPresetsChange,
  onSelectedPresetIdChange,
  availableTargetTabs,
  activeMapperProfileName,
  activeMapperProfileBindings,
  isConfigLocked,
  onEditorOpenChange,
  onFooterControlsChange,
  backRequestVersion,
  selectedProfileId: initialSelectedProfileId,
  onSelectedProfileIdChange,
}: Props) => {
  const selectedPreset =
    presets.find((p) => p.id === selectedPresetId) || presets[0];
  const profiles = selectedPreset?.profiles || [];
  const activePresetId = selectedPreset?.id ?? selectedPresetId;
  const selectedPresetSwitchShortcut = selectedPreset?.switchShortcut ?? "";
  const presetSwitchShortcutUsage = (() => {
    const normalizedTarget = normalizeShortcutForConflictCheck(
      selectedPresetSwitchShortcut,
    );

    if (!normalizedTarget) {
      return {
        mapperUsage: null as string | null,
        keyTriggerUsage: null as string | null,
      };
    }

    const mapperUsage =
      activeMapperProfileBindings?.some(
        (binding) =>
          normalizeShortcutForConflictCheck(binding) === normalizedTarget,
      ) ?? false;

    const keyTriggerMatch = profiles.find(
      (profile) =>
        profile.triggerKey &&
        normalizeShortcutForConflictCheck(profile.triggerKey) ===
          normalizedTarget,
    );

    const conflictingPreset = presets.find(
      (preset) =>
        preset.id !== activePresetId &&
        normalizeShortcutForConflictCheck(preset.switchShortcut ?? "") ===
          normalizedTarget,
    );

    return {
      mapperUsage: mapperUsage
        ? `Active profile key mapper${activeMapperProfileName ? ` (${activeMapperProfileName})` : ""}`
        : null,
      keyTriggerUsage: keyTriggerMatch
        ? `Key trigger profile: ${keyTriggerMatch.name}`
        : conflictingPreset
          ? `Preset shortcut conflict: ${conflictingPreset.name}`
          : null,
    };
  })();
  const onProfilesChange = useCallback(
    (nextProfiles: KeyTriggerProfile[]) => {
      const nextPresets = presets.map((preset) =>
        preset.id === activePresetId
          ? { ...preset, profiles: nextProfiles }
          : preset,
      );
      onPresetsChange(nextPresets);
    },
    [activePresetId, onPresetsChange, presets],
  );
  const { token } = theme.useToken();
  const getDialogPopupContainer = (triggerNode?: HTMLElement) =>
    (triggerNode?.closest(".fm-dialog") as HTMLElement | null) ?? document.body;
  const dialogTooltipProps = {
    getPopupContainer: getDialogPopupContainer,
    zIndex: 2147483647,
    overlayClassName: "fm-dialog-surface-tooltip",
  };
  const dialogPopoverProps = {
    getPopupContainer: getDialogPopupContainer,
    zIndex: 2147483647,
    overlayClassName: "fm-dialog-surface-popover",
  };
  const dialogPopconfirmProps = {
    getPopupContainer: getDialogPopupContainer,
    zIndex: 2147483647,
    overlayClassName: "fm-dialog-surface-popconfirm",
  };
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    initialSelectedProfileId ?? null,
  );
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [hasPasteableClipboardProfiles, setHasPasteableClipboardProfiles] =
    useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [editorDraft, setEditorDraft] = useState<ProfileEditorDraft | null>(
    null,
  );
  const [newProfileHighlightId, setNewProfileHighlightId] = useState<
    string | null
  >(null);
  const [newActionHighlightId, setNewActionHighlightId] = useState<
    string | null
  >(null);
  const [dragProfileId, setDragProfileId] = useState<string | null>(null);
  const [dragActionId, setDragActionId] = useState<string | null>(null);
  const isValidTabId = (value: unknown): value is number =>
    Number.isInteger(value) && Number(value) > 0;

  const resolveExecutionScope = (
    draft: Pick<
      ProfileEditorDraft,
      | "executionScope"
      | "currentTabOnly"
      | "otherTabsOnly"
      | "specificTargetTabId"
      | "specificTargetTabIds"
    >,
  ): ProfileEditorDraft["executionScope"] => {
    if (draft.executionScope === "specific") {
      return "specific";
    }

    if (draft.executionScope === "current") {
      return "current";
    }

    if (draft.executionScope === "other") {
      return "other";
    }

    if (draft.currentTabOnly) {
      return "current";
    }

    if (draft.otherTabsOnly) {
      return "other";
    }

    if (
      Array.isArray(draft.specificTargetTabIds) &&
      draft.specificTargetTabIds.some((id) => isValidTabId(id))
    ) {
      return "specific";
    }

    if (isValidTabId(draft.specificTargetTabId)) {
      return "specific";
    }

    return "all";
  };

  // Preset management state
  const [presetCreateName, setPresetCreateName] = useState("");
  const [presetCreateOpen, setPresetCreateOpen] = useState(false);
  const [presetRenameName, setPresetRenameName] = useState("");
  const [presetRenameOpen, setPresetRenameOpen] = useState(false);
  const presetCreateInputRef = useRef<import("antd").InputRef | null>(null);
  const presetRenameInputRef = useRef<import("antd").InputRef | null>(null);
  const onSelectedProfileIdChangeRef = useRef(onSelectedProfileIdChange);
  const lastNotifiedProfileIdRef = useRef<string | null | undefined>(undefined);
  const lastNotifiedEditorOpenRef = useRef<boolean | undefined>(undefined);

  const profilesPaneContentRef = useRef<HTMLDivElement | null>(null);
  const editorPaneContentRef = useRef<HTMLDivElement | null>(null);
  const profilesPaneScrollTopRef = useRef(0);
  const editorPaneScrollTopRef = useRef(0);
  const wasEditorOpenRef = useRef(false);
  const [activePaneHeight, setActivePaneHeight] = useState<number | null>(null);
  const triggerKeyLastClickRef = useRef<{ button: number; time: number }>({
    button: -1,
    time: 0,
  });
  const actionKeyLastClickRef = useRef<
    Map<string, { button: number; time: number }>
  >(new Map());
  const triggerWheelCaptureArmedUntilRef = useRef(0);
  const actionWheelCaptureArmedUntilRef = useRef<Map<string, number>>(
    new Map(),
  );

  const isEditorOpen = editorDraft !== null;

  useEffect(() => {
    if (!onEditorOpenChange) {
      return;
    }

    if (lastNotifiedEditorOpenRef.current === isEditorOpen) {
      return;
    }

    lastNotifiedEditorOpenRef.current = isEditorOpen;
    onEditorOpenChange(isEditorOpen);
  }, [isEditorOpen, onEditorOpenChange]);

  useEffect(() => {
    if (initialSelectedProfileId === undefined) {
      return;
    }

    setSelectedProfileId((prev) =>
      prev === initialSelectedProfileId ? prev : initialSelectedProfileId,
    );
  }, [initialSelectedProfileId]);

  useEffect(() => {
    onSelectedProfileIdChangeRef.current = onSelectedProfileIdChange;
  }, [onSelectedProfileIdChange]);

  useEffect(() => {
    if (onSelectedProfileIdChangeRef.current) {
      if (lastNotifiedProfileIdRef.current === selectedProfileId) {
        return;
      }

      lastNotifiedProfileIdRef.current = selectedProfileId;
      onSelectedProfileIdChangeRef.current(selectedProfileId);
    }
  }, [selectedProfileId]);

  useEffect(() => {
    if (selectedProfileIds.length === 0) {
      return;
    }

    const profileIdSet = new Set(profiles.map((profile) => profile.id));
    setSelectedProfileIds((prev) => {
      const next = prev.filter((profileId) => profileIdSet.has(profileId));
      return next.length === prev.length &&
        next.every((id, i) => id === prev[i])
        ? prev
        : next;
    });
  }, [profiles, selectedProfileIds]);

  useLayoutEffect(() => {
    const measureHeight = () => {
      const target = isEditorOpen
        ? editorPaneContentRef.current
        : profilesPaneContentRef.current;
      if (!target) {
        setActivePaneHeight(null);
        return;
      }

      setActivePaneHeight(Math.ceil(target.getBoundingClientRect().height));
    };

    measureHeight();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      measureHeight();
    });

    if (profilesPaneContentRef.current) {
      observer.observe(profilesPaneContentRef.current);
    }

    if (editorPaneContentRef.current) {
      observer.observe(editorPaneContentRef.current);
    }

    return () => observer.disconnect();
  }, [isEditorOpen, profiles.length, editorDraft]);

  useEffect(() => {
    const wasEditorOpen = wasEditorOpenRef.current;

    if (!wasEditorOpen && isEditorOpen) {
      const profilesPane = profilesPaneContentRef.current?.closest(
        ".fm-dialog-slider-pane",
      ) as HTMLElement | null;
      if (profilesPane) {
        profilesPaneScrollTopRef.current = profilesPane.scrollTop;
      }

      const editorPane = editorPaneContentRef.current?.closest(
        ".fm-dialog-slider-pane",
      ) as HTMLElement | null;
      if (editorPane) {
        editorPane.scrollTop = editorPaneScrollTopRef.current;
      }
    }

    if (wasEditorOpen && !isEditorOpen) {
      const editorPane = editorPaneContentRef.current?.closest(
        ".fm-dialog-slider-pane",
      ) as HTMLElement | null;
      if (editorPane) {
        editorPaneScrollTopRef.current = editorPane.scrollTop;
      }

      const profilesPane = profilesPaneContentRef.current?.closest(
        ".fm-dialog-slider-pane",
      ) as HTMLElement | null;
      if (profilesPane) {
        window.requestAnimationFrame(() => {
          profilesPane.scrollTop = profilesPaneScrollTopRef.current;
        });
      }
    }

    wasEditorOpenRef.current = isEditorOpen;
  }, [isEditorOpen]);

  const lastBackRequestVersionRef = useRef<number>(backRequestVersion ?? 0);

  const startNewProfileEditor = useCallback(() => {
    const id = createProfileId();
    const name = getNextProfileName(profiles.map((profile) => profile.name));

    setEditingProfileId(id);
    setEditorDraft({
      id,
      profileIdentifier: createProfileIdentifier(),
      name,
      enabled: true,
      triggerType: "once",
      repeatCount: 2,
      triggerKey: "",
      executionScope: "all",
      specificTargetTabIds: [],
      specificTargetTabNames: [],
      specificTargetTabId: null,
      specificTargetTabName: null,
      delayMode: "sequential",
      lockToTab: false,
      toggleOwnerTabId: undefined,
      actions: [createDefaultAction()],
    });
  }, [availableTargetTabs, profiles]);

  const startEditProfileEditor = (profile: KeyTriggerProfile) => {
    setSelectedProfileId(profile.id);
    setEditingProfileId(profile.id);
    setEditorDraft({
      id: profile.id,
      profileIdentifier: profile.profileIdentifier ?? createProfileIdentifier(),
      name: profile.name,
      enabled: profile.enabled !== false,
      triggerType: profile.triggerType,
      repeatCount: normalizeRepeatCount(profile.repeatCount, 2),
      triggerKey: profile.triggerKey,
      executionScope:
        profile.executionScope ??
        (profile.otherTabsOnly === true
          ? "other"
          : profile.currentTabOnly === true
            ? "current"
            : profile.specificTargetTabId !== undefined &&
                profile.specificTargetTabId !== null
              ? "specific"
              : "all"),
      currentTabOnly: profile.currentTabOnly,
      otherTabsOnly: profile.otherTabsOnly,
      specificTargetTabId: profile.specificTargetTabId ?? null,
      specificTargetTabName: profile.specificTargetTabName ?? null,
      specificTargetTabIds:
        profile.specificTargetTabIds && profile.specificTargetTabIds.length > 0
          ? [...profile.specificTargetTabIds]
          : profile.specificTargetTabId !== undefined &&
              profile.specificTargetTabId !== null
            ? [profile.specificTargetTabId]
            : [],
      specificTargetTabNames:
        profile.specificTargetTabNames &&
        profile.specificTargetTabNames.length > 0
          ? [...profile.specificTargetTabNames]
          : profile.specificTargetTabName
            ? [profile.specificTargetTabName]
            : [],
      delayMode: profile.delayMode || "sequential",
      lockToTab: profile.lockToTab === true,
      toggleOwnerTabId:
        typeof profile.toggleOwnerTabId === "number" &&
        Number.isFinite(profile.toggleOwnerTabId)
          ? profile.toggleOwnerTabId
          : undefined,
      actions:
        profile.actions.length > 0
          ? profile.actions.map((action) => ({
              ...action,
              actionTriggerType:
                action.actionTriggerType === "repeat" ? "repeat" : "once",
              actionRepeatCount:
                action.actionTriggerType === "repeat"
                  ? normalizeActionRepeatCount(action.actionRepeatCount, 2)
                  : 1,
              executionScope:
                action.executionScope === "current" ||
                action.executionScope === "other" ||
                action.executionScope === "specific"
                  ? action.executionScope
                  : action.otherTabsOnly === true
                    ? "other"
                    : action.currentTabOnly === true
                      ? "current"
                      : "all",
              specificTargetTabIds: Array.isArray(action.specificTargetTabIds)
                ? action.specificTargetTabIds.filter((id) =>
                    Number.isFinite(id),
                  )
                : [],
              specificTargetTabNames: Array.isArray(
                action.specificTargetTabNames,
              )
                ? action.specificTargetTabNames.filter(
                    (name): name is string =>
                      typeof name === "string" && name.trim().length > 0,
                  )
                : [],
            }))
          : [createDefaultAction()],
    });
  };

  const duplicateProfile = (profile: KeyTriggerProfile) => {
    const duplicatedId = createProfileId();
    const duplicatedName = buildParenthesizedDuplicateName(
      profile.name,
      profiles.map((entry) => entry.name),
    );

    const duplicated: KeyTriggerProfile = {
      ...profile,
      id: duplicatedId,
      profileIdentifier: createProfileIdentifier(),
      name: duplicatedName,
      enabled: profile.enabled !== false,
      repeatCount: normalizeRepeatCount(profile.repeatCount, 2),
      executionScope: profile.executionScope,
      currentTabOnly: profile.currentTabOnly,
      otherTabsOnly: profile.otherTabsOnly,
      specificTargetTabId: profile.specificTargetTabId ?? null,
      specificTargetTabName: profile.specificTargetTabName ?? null,
      specificTargetTabIds:
        profile.specificTargetTabIds && profile.specificTargetTabIds.length > 0
          ? [...profile.specificTargetTabIds]
          : profile.specificTargetTabId !== undefined &&
              profile.specificTargetTabId !== null
            ? [profile.specificTargetTabId]
            : [],
      specificTargetTabNames:
        profile.specificTargetTabNames &&
        profile.specificTargetTabNames.length > 0
          ? [...profile.specificTargetTabNames]
          : profile.specificTargetTabName
            ? [profile.specificTargetTabName]
            : [],
      delayMode: profile.delayMode || "sequential",
      actions: profile.actions.map((action) => ({
        ...action,
        id: createActionId(),
        actionTriggerType:
          action.actionTriggerType === "repeat" ? "repeat" : "once",
        actionRepeatCount:
          action.actionTriggerType === "repeat"
            ? normalizeActionRepeatCount(action.actionRepeatCount, 2)
            : 1,
        executionScope:
          action.executionScope === "current" ||
          action.executionScope === "other" ||
          action.executionScope === "specific"
            ? action.executionScope
            : action.otherTabsOnly === true
              ? "other"
              : action.currentTabOnly === true
                ? "current"
                : "all",
        specificTargetTabIds: Array.isArray(action.specificTargetTabIds)
          ? action.specificTargetTabIds.filter((id) => Number.isFinite(id))
          : [],
        specificTargetTabNames: Array.isArray(action.specificTargetTabNames)
          ? action.specificTargetTabNames.filter(
              (name): name is string =>
                typeof name === "string" && name.trim().length > 0,
            )
          : [],
      })),
    };

    const profileIndex = profiles.findIndex((entry) => entry.id === profile.id);
    if (profileIndex < 0) {
      onProfilesChange([...profiles, duplicated]);
    } else {
      const nextProfiles = [...profiles];
      nextProfiles.splice(profileIndex + 1, 0, duplicated);
      onProfilesChange(nextProfiles);
    }
    setSelectedProfileId(duplicatedId);
    setNewProfileHighlightId(duplicatedId);
  };

  const deleteProfile = (profileId: string) => {
    const next = profiles.filter((profile) => profile.id !== profileId);
    onProfilesChange(next);

    if (selectedProfileId === profileId) {
      setSelectedProfileId(next[next.length - 1]?.id ?? null);
    }

    if (editingProfileId === profileId) {
      setEditingProfileId(null);
      setEditorDraft(null);
    }
  };

  // Track the current tab ID for lockToTab enforcement
  const [currentTabId, setCurrentTabId] = useState<number | null>(null);
  useEffect(() => {
    // Try to get the tab ID from window.name or a global injected value
    if (window && typeof window.fmCurrentTabId === "number") {
      setCurrentTabId(window.fmCurrentTabId ?? null);
    } else if (!isNaN(Number(window.name))) {
      setCurrentTabId(Number(window.name));
    }
  }, []);

  const toggleProfileEnabled = (profileId: string) => {
    onProfilesChange(
      profiles.map((profile) => {
        if (profile.id !== profileId) return profile;
        // If enabling, set toggleOwnerTabId if lockToTab is set
        if (profile.triggerType === "toggle" && profile.lockToTab) {
          if (profile.enabled === false || profile.enabled === undefined) {
            // Enabling: record owner tab
            return {
              ...profile,
              enabled: true,
              toggleOwnerTabId: currentTabId ?? undefined,
            };
          } else {
            // Disabling: only allow from owner tab
            if (
              typeof profile.toggleOwnerTabId === "number" &&
              currentTabId !== profile.toggleOwnerTabId
            ) {
              // Not allowed to disable from another tab
              return profile;
            }
            return {
              ...profile,
              enabled: false,
              toggleOwnerTabId: undefined,
            };
          }
        }
        // Default toggle logic for non-locked profiles
        return { ...profile, enabled: profile.enabled === false };
      }),
    );
  };

  const saveDraft = useCallback(() => {
    if (!editorDraft) {
      return;
    }

    const normalizedName = editorDraft.name.trim();
    const normalizedTriggerKey = editorDraft.triggerKey.trim();

    if (!normalizedName || !normalizedTriggerKey) {
      return;
    }

    const sourceActions =
      editorDraft.actions.length > 0
        ? editorDraft.actions
        : [createDefaultAction()];

    const normalizedActions: KeyTriggerAction[] = sourceActions.map(
      (action, index) => {
        const executionScope =
          action.executionScope === "current" ||
          action.executionScope === "other" ||
          action.executionScope === "specific"
            ? action.executionScope
            : action.otherTabsOnly === true
              ? "other"
              : action.currentTabOnly === true
                ? "current"
                : "all";
        const specificTargetTabIds = Array.from(
          new Set(
            (action.specificTargetTabIds ?? []).filter((id) =>
              Number.isFinite(id),
            ),
          ),
        );
        const specificTargetTabNames = Array.from(
          new Set(
            (action.specificTargetTabNames ?? []).filter(
              (name): name is string =>
                typeof name === "string" && name.trim().length > 0,
            ),
          ),
        );
        const effectiveSpecificTargetTabIds =
          executionScope === "specific" ? specificTargetTabIds : [];
        const effectiveSpecificTargetTabNames =
          executionScope === "specific" ? specificTargetTabNames : [];

        return {
          ...action,
          name: action.name.trim() || `Action ${index + 1}`,
          key: action.key.trim(),
          delayMs: Math.max(0, Math.round(action.delayMs || 0)),
          enabled: action.enabled !== false,
          executionScope,
          currentTabOnly: executionScope === "current",
          otherTabsOnly: executionScope === "other",
          specificTargetTabIds: effectiveSpecificTargetTabIds,
          specificTargetTabNames: effectiveSpecificTargetTabNames,
          actionTriggerType:
            action.actionTriggerType === "repeat" ? "repeat" : "once",
          actionRepeatCount:
            action.actionTriggerType === "repeat"
              ? normalizeActionRepeatCount(action.actionRepeatCount, 2)
              : 1,
        };
      },
    );
    const executionScope = resolveExecutionScope(editorDraft);
    const specificTargetTabIds = Array.from(
      new Set(
        (editorDraft.specificTargetTabIds ?? []).filter((id) =>
          Number.isFinite(id),
        ),
      ),
    );
    const specificTargetTabNames = Array.from(
      new Set(
        (editorDraft.specificTargetTabNames ?? []).filter(
          (name): name is string =>
            typeof name === "string" && name.trim().length > 0,
        ),
      ),
    );
    const effectiveSpecificTargetTabIds =
      executionScope === "specific" ? specificTargetTabIds : [];
    const effectiveSpecificTargetTabNames =
      executionScope === "specific" ? specificTargetTabNames : [];

    const nextProfile: KeyTriggerProfile = {
      id: editorDraft.id,
      profileIdentifier: editorDraft.profileIdentifier,
      name: normalizedName,
      enabled: editorDraft.enabled,
      triggerType: editorDraft.triggerType,
      repeatCount:
        editorDraft.triggerType === "repeat"
          ? normalizeRepeatCount(editorDraft.repeatCount, 2)
          : 1,
      triggerKey: normalizedTriggerKey,
      executionScope,
      currentTabOnly: executionScope === "current",
      otherTabsOnly: executionScope === "other",
      specificTargetTabIds: effectiveSpecificTargetTabIds,
      specificTargetTabNames: effectiveSpecificTargetTabNames,
      specificTargetTabId:
        effectiveSpecificTargetTabIds[0] ??
        (executionScope === "specific"
          ? editorDraft.specificTargetTabId
          : null) ??
        null,
      specificTargetTabName:
        effectiveSpecificTargetTabNames[0] ??
        (executionScope === "specific"
          ? editorDraft.specificTargetTabName
          : null) ??
        null,
      delayMode: editorDraft.delayMode,
      lockToTab: editorDraft.lockToTab === true,
      toggleOwnerTabId:
        editorDraft.lockToTab === true &&
        typeof editorDraft.toggleOwnerTabId === "number" &&
        Number.isFinite(editorDraft.toggleOwnerTabId)
          ? editorDraft.toggleOwnerTabId
          : undefined,
      actions: normalizedActions,
    };

    const existingIndex = profiles.findIndex(
      (profile) => profile.id === editorDraft.id,
    );
    if (existingIndex >= 0) {
      const next = [...profiles];
      next[existingIndex] = nextProfile;
      onProfilesChange(next);
    } else {
      onProfilesChange([nextProfile, ...profiles]);
      setNewProfileHighlightId(nextProfile.id);
    }
    setSelectedProfileId(nextProfile.id);
    setEditingProfileId(null);
    setEditorDraft(null);
  }, [editorDraft, onProfilesChange, profiles]);

  const cancelDraft = useCallback(() => {
    setEditingProfileId(null);
    setEditorDraft(null);
  }, []);

  useEffect(() => {
    if (typeof backRequestVersion !== "number") {
      return;
    }

    if (backRequestVersion === lastBackRequestVersionRef.current) {
      return;
    }

    lastBackRequestVersionRef.current = backRequestVersion;
    if (isEditorOpen) {
      cancelDraft();
    }
  }, [backRequestVersion, isEditorOpen]);

  const addActionDraft = useCallback(() => {
    if (!editorDraft) {
      return;
    }

    const nextId = createActionId();
    const nextName = getNextActionName(
      editorDraft.actions.map((action) => action.name),
    );

    setEditorDraft({
      ...editorDraft,
      actions: [
        ...editorDraft.actions,
        {
          id: nextId,
          name: nextName,
          key: "",
          delayMs: 0,
          enabled: true,
          actionTriggerType: "once",
          actionRepeatCount: 1,
        },
      ],
    });
    setNewActionHighlightId(nextId);
  }, [editorDraft]);

  const saveDisabledReason = isConfigLocked
    ? "Enable Edit Mode to save changes."
    : editorDraft === null
      ? undefined
      : editorDraft.name.trim().length === 0
        ? "Profile name is required."
        : editorDraft.triggerKey.trim().length === 0
          ? "Trigger key is required."
          : undefined;

  const canSaveDraft = editorDraft !== null && saveDisabledReason === undefined;

  useEffect(() => {
    if (!onFooterControlsChange) {
      return;
    }

    onFooterControlsChange({
      showAddProfile: !isEditorOpen,
      addProfileDisabled: isConfigLocked,
      onAddProfile: startNewProfileEditor,
      showAddAction: isEditorOpen,
      addActionDisabled: isConfigLocked,
      onAddAction: addActionDraft,
      showSaveCancel: isEditorOpen,
      saveDisabled: !canSaveDraft,
      saveDisabledReason,
      onSave: saveDraft,
      onCancel: cancelDraft,
    });
  }, [
    onFooterControlsChange,
    isEditorOpen,
    isConfigLocked,
    editorDraft,
    startNewProfileEditor,
    addActionDraft,
    saveDraft,
    cancelDraft,
  ]);

  useEffect(() => {
    return () => {
      onFooterControlsChange?.(null);
    };
  }, [onFooterControlsChange]);

  // Filter profiles by search term
  const filteredProfiles = profiles.filter((profile) => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return true;
    const actionText = profile.actions
      .map((action) => `${action.name} ${action.key}`)
      .join(" ")
      .toLowerCase();
    return (
      profile.name.toLowerCase().includes(term) ||
      profile.triggerKey?.toLowerCase().includes(term) ||
      actionText.includes(term)
    );
  });

  const reusableSourceProfiles =
    selectedProfileIds.length > 0
      ? profiles.filter((profile) => selectedProfileIds.includes(profile.id))
      : selectedProfileId
        ? profiles.filter((profile) => profile.id === selectedProfileId)
        : [];

  const cloneProfilesForPreset = (
    sourceProfiles: Partial<KeyTriggerProfile>[],
    targetPreset: KeyTriggerPreset,
  ): KeyTriggerProfile[] => {
    const usedNames = targetPreset.profiles.map((profile) => profile.name);

    return sourceProfiles
      .filter(
        (profile): profile is Partial<KeyTriggerProfile> & { name: string } =>
          typeof profile.name === "string" && profile.name.trim().length > 0,
      )
      .map((profile) => {
        const baseName = profile.name.trim();
        const nextName = usedNames.includes(baseName)
          ? buildParenthesizedDuplicateName(baseName, usedNames)
          : baseName;
        usedNames.push(nextName);

        const sourceActions = Array.isArray(profile.actions)
          ? profile.actions
          : [];
        const nextActions: KeyTriggerAction[] =
          sourceActions.length > 0
            ? sourceActions.map((action, actionIndex) => ({
                ...action,
                id: createActionId(),
                name:
                  typeof action.name === "string" && action.name.trim().length
                    ? action.name.trim()
                    : `Action ${actionIndex + 1}`,
                key: typeof action.key === "string" ? action.key.trim() : "",
                delayMs: Math.max(0, Math.round(Number(action.delayMs) || 0)),
                enabled: action.enabled !== false,
                actionTriggerType:
                  action.actionTriggerType === "repeat" ? "repeat" : "once",
                actionRepeatCount:
                  action.actionTriggerType === "repeat"
                    ? normalizeActionRepeatCount(action.actionRepeatCount, 2)
                    : 1,
                executionScope:
                  action.executionScope === "current" ||
                  action.executionScope === "other" ||
                  action.executionScope === "specific"
                    ? action.executionScope
                    : action.otherTabsOnly === true
                      ? "other"
                      : action.currentTabOnly === true
                        ? "current"
                        : "all",
                currentTabOnly: action.currentTabOnly,
                otherTabsOnly: action.otherTabsOnly,
                specificTargetTabIds: Array.isArray(action.specificTargetTabIds)
                  ? action.specificTargetTabIds.filter((id) =>
                      Number.isFinite(id),
                    )
                  : [],
                specificTargetTabNames: Array.isArray(
                  action.specificTargetTabNames,
                )
                  ? action.specificTargetTabNames.filter(
                      (name): name is string =>
                        typeof name === "string" && name.trim().length > 0,
                    )
                  : [],
              }))
            : [createDefaultAction([])];

        const normalizedTriggerType =
          profile.triggerType === "repeat" || profile.triggerType === "toggle"
            ? profile.triggerType
            : "once";

        return {
          ...(profile as KeyTriggerProfile),
          id: createProfileId(),
          profileIdentifier: createProfileIdentifier(),
          name: nextName,
          enabled: profile.enabled !== false,
          triggerType: normalizedTriggerType,
          repeatCount:
            normalizedTriggerType === "repeat"
              ? normalizeRepeatCount(profile.repeatCount, 2)
              : 1,
          triggerKey:
            typeof profile.triggerKey === "string" ? profile.triggerKey : "",
          executionScope:
            profile.executionScope === "current" ||
            profile.executionScope === "other" ||
            profile.executionScope === "specific"
              ? profile.executionScope
              : profile.otherTabsOnly === true
                ? "other"
                : profile.currentTabOnly === true
                  ? "current"
                  : "all",
          currentTabOnly: profile.currentTabOnly,
          otherTabsOnly: profile.otherTabsOnly,
          specificTargetTabIds: Array.isArray(profile.specificTargetTabIds)
            ? profile.specificTargetTabIds.filter((id) => Number.isFinite(id))
            : profile.specificTargetTabId !== undefined &&
                profile.specificTargetTabId !== null
              ? [profile.specificTargetTabId]
              : [],
          specificTargetTabNames: Array.isArray(profile.specificTargetTabNames)
            ? profile.specificTargetTabNames.filter(
                (name): name is string =>
                  typeof name === "string" && name.trim().length > 0,
              )
            : typeof profile.specificTargetTabName === "string" &&
                profile.specificTargetTabName.trim().length > 0
              ? [profile.specificTargetTabName.trim()]
              : [],
          specificTargetTabId:
            Array.isArray(profile.specificTargetTabIds) &&
            profile.specificTargetTabIds.length > 0
              ? profile.specificTargetTabIds[0]
              : (profile.specificTargetTabId ?? null),
          specificTargetTabName:
            Array.isArray(profile.specificTargetTabNames) &&
            profile.specificTargetTabNames.length > 0
              ? profile.specificTargetTabNames[0]
              : (profile.specificTargetTabName ?? null),
          delayMode:
            profile.delayMode === "synchronous" ? "synchronous" : "sequential",
          actions: nextActions,
          lockToTab: profile.lockToTab === true,
          toggleOwnerTabId: undefined,
        } satisfies KeyTriggerProfile;
      });
  };

  const appendProfilesToPreset = (
    sourceProfiles: Partial<KeyTriggerProfile>[],
    targetPresetId: string,
    sourceLabel: string,
  ) => {
    const targetPreset = presets.find((preset) => preset.id === targetPresetId);
    if (!targetPreset) {
      return;
    }

    const clonedProfiles = cloneProfilesForPreset(sourceProfiles, targetPreset);
    if (clonedProfiles.length === 0) {
      message.warning("No valid profiles found to import.");
      return;
    }

    onPresetsChange(
      presets.map((preset) =>
        preset.id === targetPresetId
          ? { ...preset, profiles: [...preset.profiles, ...clonedProfiles] }
          : preset,
      ),
    );

    message.success(
      `${sourceLabel}: added ${clonedProfiles.length} profile${clonedProfiles.length === 1 ? "" : "s"} to "${targetPreset.name}".`,
    );
  };

  const handleCopyProfilesToClipboard = async () => {
    if (reusableSourceProfiles.length === 0) {
      message.warning("Select at least one profile first.");
      return;
    }

    try {
      await navigator.clipboard.writeText(
        JSON.stringify({
          type: "flyff-key-trigger-profiles",
          profiles: reusableSourceProfiles,
        }),
      );
      setHasPasteableClipboardProfiles(true);
      message.success(
        `Copied ${reusableSourceProfiles.length} profile${reusableSourceProfiles.length === 1 ? "" : "s"} to clipboard.`,
      );
    } catch {
      message.error("Clipboard copy failed.");
    }
  };

  const handlePasteProfilesFromClipboard = async (targetPresetId: string) => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const payload = JSON.parse(clipboardText);
      const nextProfiles = extractProfilesFromImportPayload(payload);
      setHasPasteableClipboardProfiles(nextProfiles.length > 0);
      appendProfilesToPreset(nextProfiles, targetPresetId, "Clipboard paste");
    } catch {
      setHasPasteableClipboardProfiles(false);
      message.error("Clipboard does not contain valid profile JSON.");
    }
  };

  const switchSelectedPreset = useCallback(
    (nextPresetId: string) => {
      if (nextPresetId === selectedPresetId) {
        return;
      }

      if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
        void chrome.runtime.sendMessage({ type: "KEY_TRIGGER_STOP_ALL" });
      }

      onSelectedPresetIdChange(nextPresetId);
    },
    [onSelectedPresetIdChange, selectedPresetId],
  );

  const refreshClipboardAvailability = useCallback(async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const payload = JSON.parse(clipboardText);
      const nextProfiles = extractProfilesFromImportPayload(payload);
      setHasPasteableClipboardProfiles(nextProfiles.length > 0);
    } catch {
      setHasPasteableClipboardProfiles(false);
    }
  }, []);

  useEffect(() => {
    void refreshClipboardAvailability();

    const onWindowFocus = () => {
      void refreshClipboardAvailability();
    };

    window.addEventListener("focus", onWindowFocus);
    return () => {
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [refreshClipboardAvailability]);

  const handleCreatePreset = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const id = `kt-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    onPresetsChange([
      ...presets,
      { id, name: trimmed, switchShortcut: "", profiles: [] },
    ]);
    switchSelectedPreset(id);
    setPresetCreateName("");
    setPresetCreateOpen(false);
  };

  const handleRenamePreset = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || !selectedPresetId) return;
    onPresetsChange(
      presets.map((p) =>
        p.id === selectedPresetId ? { ...p, name: trimmed } : p,
      ),
    );
    setPresetRenameName("");
    setPresetRenameOpen(false);
  };

  const handleDuplicatePreset = () => {
    if (!selectedPreset) return;
    const id = `kt-preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newName = buildParenthesizedDuplicateName(
      selectedPreset.name,
      presets.map((p) => p.name),
    );
    const duplicated: KeyTriggerPreset = {
      id,
      name: newName,
      switchShortcut: "",
      profiles: selectedPreset.profiles.map((profile) => ({
        ...profile,
        id: `kt-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        profileIdentifier: `kt-pid-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      })),
    };
    onPresetsChange([...presets, duplicated]);
    switchSelectedPreset(id);
  };

  const handleDeletePreset = () => {
    if (presets.length <= 1) return;
    const remaining = presets.filter((p) => p.id !== selectedPresetId);
    onPresetsChange(remaining);
    switchSelectedPreset(remaining[0].id);
  };

  return (
    <Space direction="vertical" size={12} className="fm-w-full fm-kt-pane">
      <div className="fm-kt-presets-section" style={{ marginBottom: 12 }}>
        <div
          className="fm-kt-section-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Space style={{ flex: "1 1 auto" }}>
            <Typography.Text strong style={{ flexShrink: 0 }}>
              Preset
            </Typography.Text>
            <Select
              value={selectedPresetId}
              onChange={switchSelectedPreset}
              options={presets.map((p) => ({ label: p.name, value: p.id }))}
              size="small"
              style={{ minWidth: 140, flex: "1 1 140px", maxWidth: 240 }}
              getPopupContainer={getDialogPopupContainer}
            />
          </Space>
          <Space size={4} style={{ flexShrink: 0 }}>
            {/* Create */}
            <Popover
              open={presetCreateOpen}
              onOpenChange={(open) => {
                setPresetCreateOpen(open);
                if (open) {
                  setPresetCreateName("");
                  setTimeout(() => {
                    presetCreateInputRef.current?.focus();
                  }, 50);
                }
              }}
              trigger="click"
              placement="bottomLeft"
              getPopupContainer={getDialogPopupContainer}
              zIndex={2147483647}
              overlayClassName="fm-dialog-surface-popover"
              content={
                <Space size={4}>
                  <Input
                    ref={presetCreateInputRef}
                    placeholder="Preset name"
                    size="small"
                    value={presetCreateName}
                    style={{ width: 160 }}
                    onChange={(e) => setPresetCreateName(e.target.value)}
                    onPressEnter={() => handleCreatePreset(presetCreateName)}
                  />
                  <Button
                    size="small"
                    type="primary"
                    icon={<CheckOutlined />}
                    disabled={!presetCreateName.trim()}
                    onClick={() => handleCreatePreset(presetCreateName)}
                  />
                  <Button
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={() => setPresetCreateOpen(false)}
                  />
                </Space>
              }
            >
              <Tooltip title="Create preset" {...dialogTooltipProps}>
                <Button size="small" icon={<PlusOutlined />} />
              </Tooltip>
            </Popover>

            {/* Rename */}
            <Popover
              open={presetRenameOpen}
              onOpenChange={(open) => {
                setPresetRenameOpen(open);
                if (open) {
                  setPresetRenameName(selectedPreset?.name ?? "");
                  setTimeout(() => {
                    presetRenameInputRef.current?.focus();
                    presetRenameInputRef.current?.select();
                  }, 50);
                }
              }}
              trigger="click"
              placement="bottomLeft"
              getPopupContainer={getDialogPopupContainer}
              zIndex={2147483647}
              overlayClassName="fm-dialog-surface-popover"
              content={
                <Space size={4}>
                  <Input
                    ref={presetRenameInputRef}
                    placeholder="New name"
                    size="small"
                    value={presetRenameName}
                    style={{ width: 160 }}
                    onChange={(e) => setPresetRenameName(e.target.value)}
                    onPressEnter={() => handleRenamePreset(presetRenameName)}
                  />
                  <Button
                    size="small"
                    type="primary"
                    icon={<CheckOutlined />}
                    disabled={!presetRenameName.trim()}
                    onClick={() => handleRenamePreset(presetRenameName)}
                  />
                  <Button
                    size="small"
                    icon={<CloseOutlined />}
                    onClick={() => setPresetRenameOpen(false)}
                  />
                </Space>
              }
            >
              <Tooltip title="Rename preset" {...dialogTooltipProps}>
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  disabled={isConfigLocked}
                />
              </Tooltip>
            </Popover>

            {/* Duplicate */}
            <Tooltip title="Duplicate preset" {...dialogTooltipProps}>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={handleDuplicatePreset}
              />
            </Tooltip>

            {/* Delete */}
            <Tooltip
              title={
                presets.length <= 1
                  ? "Cannot delete the last preset"
                  : "Delete preset"
              }
              {...dialogTooltipProps}
            >
              <Popconfirm
                title="Delete preset?"
                description="All profiles in this preset will be deleted. This cannot be undone."
                okText="Delete"
                cancelText="Cancel"
                okButtonProps={{ danger: true }}
                disabled={isConfigLocked || presets.length <= 1}
                onConfirm={handleDeletePreset}
                {...dialogPopconfirmProps}
              >
                <Button
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={isConfigLocked || presets.length <= 1}
                />
              </Popconfirm>
            </Tooltip>
          </Space>
        </div>
        <div className="fm-kt-section-row" style={{ marginTop: 8 }}>
          <Space direction="vertical" size={4} style={{ width: "100%" }}>
            <Typography.Text type="secondary">
              Switch To This Preset Shortcut
            </Typography.Text>
            <div
              className={`fm-shortcut-input-shell${selectedPresetSwitchShortcut ? " fm-shortcut-input-has-value" : ""}`}
            >
              <Input
                className="fm-global-shortcut-input"
                value={selectedPresetSwitchShortcut}
                placeholder="Press keys"
                disabled={isConfigLocked || !selectedPreset}
                onKeyDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();

                  let nextValue = "";
                  if (event.key === "Backspace" || event.key === "Delete") {
                    nextValue = "";
                  } else {
                    const captured = buildRecordedShortcut(event);
                    if (!captured) {
                      return;
                    }
                    nextValue = captured;
                  }

                  onPresetsChange(
                    presets.map((preset) =>
                      preset.id === activePresetId
                        ? {
                            ...preset,
                            switchShortcut: nextValue,
                          }
                        : preset,
                    ),
                  );
                }}
                onContextMenu={(event) => event.preventDefault()}
              />
              {selectedPresetSwitchShortcut && (
                <span className="fm-shortcut-input-overlay" aria-hidden="true">
                  <ShortcutKeys combo={selectedPresetSwitchShortcut} />
                </span>
              )}
            </div>
            <Typography.Text type="secondary">
              Switches directly to this preset and stops active preset toggles
              before switching.
            </Typography.Text>
            {presetSwitchShortcutUsage.mapperUsage && (
              <Typography.Text type="warning">
                {presetSwitchShortcutUsage.mapperUsage}
              </Typography.Text>
            )}
            {presetSwitchShortcutUsage.keyTriggerUsage && (
              <Typography.Text type="warning">
                {presetSwitchShortcutUsage.keyTriggerUsage}
              </Typography.Text>
            )}
          </Space>
        </div>
      </div>
      <div className="fm-kt-profiles-section">
        <div
          className="fm-kt-section-row"
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <Typography.Text strong>Profiles</Typography.Text>
          <Input.Search
            allowClear
            placeholder="Search profiles..."
            style={{ maxWidth: 220, marginLeft: "auto" }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            size="small"
          />
        </div>

        <div
          className="fm-kt-section-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <Checkbox
            checked={
              filteredProfiles.length > 0 &&
              filteredProfiles.every((profile) =>
                selectedProfileIds.includes(profile.id),
              )
            }
            indeterminate={
              filteredProfiles.some((profile) =>
                selectedProfileIds.includes(profile.id),
              ) &&
              !filteredProfiles.every((profile) =>
                selectedProfileIds.includes(profile.id),
              )
            }
            onChange={(event) => {
              if (event.target.checked) {
                setSelectedProfileIds((prev) => {
                  const next = new Set(prev);
                  for (const profile of filteredProfiles) {
                    next.add(profile.id);
                  }
                  return Array.from(next);
                });
              } else {
                setSelectedProfileIds((prev) =>
                  prev.filter(
                    (profileId) =>
                      !filteredProfiles.some(
                        (profile) => profile.id === profileId,
                      ),
                  ),
                );
              }
            }}
          >
            Select All
          </Checkbox>

          <Space size={4} style={{ marginLeft: "auto" }} wrap>
            {selectedProfileIds.length > 0 && (
              <Tooltip
                title="Copy selected profiles to clipboard"
                {...dialogTooltipProps}
              >
                <Button
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => {
                    void handleCopyProfilesToClipboard();
                  }}
                >
                  Copy Profiles
                </Button>
              </Tooltip>
            )}

            {hasPasteableClipboardProfiles && (
              <Button
                size="small"
                icon={<UploadOutlined />}
                disabled={isConfigLocked || !selectedPresetId}
                onClick={() => {
                  if (!selectedPresetId) {
                    return;
                  }
                  void handlePasteProfilesFromClipboard(selectedPresetId);
                }}
              >
                Paste to Preset
              </Button>
            )}
          </Space>
        </div>

        <div
          className="fm-kt-profiles-slider-viewport"
          style={
            activePaneHeight !== null ? { height: activePaneHeight } : undefined
          }
        >
          <div
            className="fm-kt-profiles-slider-track"
            style={{
              transform: isEditorOpen ? "translateX(-50%)" : "translateX(0)",
            }}
          >
            <div className="fm-kt-profiles-slider-pane">
              <Space
                direction="vertical"
                size={6}
                className="fm-w-full"
                ref={profilesPaneContentRef}
              >
                {profiles.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No key trigger profiles"
                  />
                ) : filteredProfiles.length === 0 ? (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="No profiles match the search"
                  />
                ) : (
                  <>
                    {filteredProfiles.map((profile) => {
                      const isSelected = selectedProfileId === profile.id;
                      const isMultiSelected = selectedProfileIds.includes(
                        profile.id,
                      );
                      const isHighlighted =
                        newProfileHighlightId === profile.id;
                      const profileItemClassName = `fm-kt-profile-item${isSelected || isMultiSelected ? " fm-kt-profile-item-selected" : ""}${isHighlighted ? " fm-kt-profile-item-highlighted" : ""}${profile.enabled === false ? " fm-kt-profile-item-disabled" : ""}`;

                      return (
                        <div
                          key={profile.id}
                          className={profileItemClassName}
                          role="button"
                          tabIndex={0}
                          draggable={!isConfigLocked}
                          onClick={() => {
                            setSelectedProfileId(profile.id);
                            setSelectedProfileIds((prev) =>
                              prev.includes(profile.id)
                                ? prev.filter(
                                    (profileId) => profileId !== profile.id,
                                  )
                                : [...prev, profile.id],
                            );
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") {
                              return;
                            }
                            event.preventDefault();
                            setSelectedProfileId(profile.id);
                            setSelectedProfileIds((prev) =>
                              prev.includes(profile.id)
                                ? prev.filter(
                                    (profileId) => profileId !== profile.id,
                                  )
                                : [...prev, profile.id],
                            );
                          }}
                          onDragStart={() => setDragProfileId(profile.id)}
                          onDragEnd={() => setDragProfileId(null)}
                          onDragOver={(event) => {
                            event.preventDefault();
                          }}
                          onDrop={() => {
                            if (!dragProfileId || isConfigLocked) {
                              return;
                            }

                            onProfilesChange(
                              moveById(profiles, dragProfileId, profile.id),
                            );
                            setDragProfileId(null);
                          }}
                          style={{
                            border: `1px solid ${token.colorBorder}`,
                          }}
                        >
                          <div className="fm-kt-profile-item-top">
                            <Space align="center" size={6}>
                              <span
                                className="fm-kt-drag-handle"
                                aria-hidden="true"
                              >
                                <HolderOutlined />
                              </span>
                              <span
                                className="fm-kt-profile-name-text"
                                style={{ fontWeight: 600 }}
                              >
                                {profile.name}
                              </span>
                            </Space>

                            <Space
                              size={4}
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <Tooltip
                                title={
                                  profile.enabled === false
                                    ? "Enable profile"
                                    : "Disable profile"
                                }
                                {...dialogTooltipProps}
                              >
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<PoweroffOutlined />}
                                  style={{
                                    color:
                                      isConfigLocked ||
                                      profile.enabled !== false
                                        ? token.colorTextDisabled
                                        : token.colorWarning,
                                  }}
                                  onClick={() =>
                                    toggleProfileEnabled(profile.id)
                                  }
                                  disabled={isConfigLocked}
                                />
                              </Tooltip>
                              <Tooltip title="Edit" {...dialogTooltipProps}>
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<EditOutlined />}
                                  style={{
                                    color: isConfigLocked
                                      ? token.colorTextDisabled
                                      : undefined,
                                  }}
                                  onClick={() =>
                                    startEditProfileEditor(profile)
                                  }
                                  disabled={isConfigLocked}
                                />
                              </Tooltip>
                              <Tooltip
                                title="Duplicate"
                                {...dialogTooltipProps}
                              >
                                <Button
                                  type="text"
                                  size="small"
                                  icon={<CopyOutlined />}
                                  style={{
                                    color: isConfigLocked
                                      ? token.colorTextDisabled
                                      : undefined,
                                  }}
                                  onClick={() => duplicateProfile(profile)}
                                  disabled={isConfigLocked}
                                />
                              </Tooltip>
                              <Tooltip title="Delete" {...dialogTooltipProps}>
                                <Popconfirm
                                  title="Delete profile?"
                                  description="This cannot be undone."
                                  okText="Delete"
                                  cancelText="Cancel"
                                  okButtonProps={{ danger: true }}
                                  onConfirm={() => deleteProfile(profile.id)}
                                  disabled={isConfigLocked}
                                  {...dialogPopconfirmProps}
                                >
                                  <Button
                                    type="text"
                                    size="small"
                                    danger
                                    style={{
                                      color: isConfigLocked
                                        ? token.colorTextDisabled
                                        : token.colorError,
                                    }}
                                    icon={<DeleteOutlined />}
                                    disabled={isConfigLocked}
                                  />
                                </Popconfirm>
                              </Tooltip>
                            </Space>
                          </div>

                          <div className="fm-kt-profile-meta">
                            <div className="fm-kt-profile-meta-row">
                              <span className="fm-kt-profile-meta-label">
                                Status:
                              </span>
                              <Typography.Text
                                type={
                                  profile.enabled === false
                                    ? "warning"
                                    : "secondary"
                                }
                              >
                                {profile.enabled === false
                                  ? "Disabled"
                                  : "Enabled"}
                              </Typography.Text>
                            </div>
                            <div className="fm-kt-profile-meta-row">
                              <span className="fm-kt-profile-meta-label">
                                Type:
                              </span>
                              <Typography.Text type="secondary">
                                {profile.triggerType === "toggle"
                                  ? "Toggle"
                                  : profile.triggerType === "repeat"
                                    ? `Repeat (${normalizeRepeatCount(profile.repeatCount, 2)}x)`
                                    : "Once"}
                              </Typography.Text>
                            </div>
                            <div className="fm-kt-profile-meta-row">
                              <span className="fm-kt-profile-meta-label">
                                Key:
                              </span>
                              <Typography.Text type="secondary">
                                {profile.triggerKey ? (
                                  <ShortcutKeys combo={profile.triggerKey} />
                                ) : (
                                  "No Trigger Key"
                                )}
                              </Typography.Text>
                            </div>

                            {profile.triggerType === "toggle" && (
                              <div className="fm-kt-profile-meta-row">
                                <span className="fm-kt-profile-meta-label">
                                  Lock:
                                </span>
                                <Typography.Text
                                  type={
                                    profile.lockToTab ? "warning" : "secondary"
                                  }
                                >
                                  {profile.lockToTab
                                    ? "This tab only"
                                    : "Disabled"}
                                </Typography.Text>
                              </div>
                            )}

                            <div className="fm-kt-profile-meta-row">
                              <span className="fm-kt-profile-meta-label">
                                No. of actions:
                              </span>
                              <Popover
                                trigger="hover"
                                placement="rightTop"
                                {...dialogPopoverProps}
                                content={
                                  <div className="fm-kt-actions-popover-content">
                                    <Space direction="vertical" size={4}>
                                      {profile.actions.length > 0 ? (
                                        profile.actions.map((action, index) => (
                                          <div
                                            key={
                                              action.id ||
                                              `${profile.id}-${index}`
                                            }
                                          >
                                            <Typography.Text strong>
                                              {action.name.trim() ||
                                                `Action ${index + 1}`}
                                            </Typography.Text>
                                            {action.enabled === false && (
                                              <div>
                                                <Typography.Text type="warning">
                                                  Disabled
                                                </Typography.Text>
                                              </div>
                                            )}
                                            <div>
                                              <Typography.Text type="secondary">
                                                Shortcut:{" "}
                                              </Typography.Text>
                                              {action.key.trim() ? (
                                                <ShortcutKeys
                                                  combo={action.key}
                                                />
                                              ) : (
                                                <Typography.Text type="secondary">
                                                  None
                                                </Typography.Text>
                                              )}
                                            </div>
                                            <Typography.Text type="secondary">
                                              Delay:{" "}
                                              {Math.max(
                                                0,
                                                Math.round(action.delayMs || 0),
                                              )}{" "}
                                              ms
                                            </Typography.Text>
                                          </div>
                                        ))
                                      ) : (
                                        <Typography.Text type="secondary">
                                          No actions configured
                                        </Typography.Text>
                                      )}
                                    </Space>
                                  </div>
                                }
                                {...dialogTooltipProps}
                              >
                                <Typography.Text type="secondary" underline>
                                  {profile.actions.length}
                                </Typography.Text>
                              </Popover>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </Space>
            </div>

            <div className="fm-kt-profiles-slider-pane">
              {editorDraft ? (
                <Space
                  direction="vertical"
                  size={10}
                  className="fm-w-full"
                  ref={editorPaneContentRef}
                >
                  <div>
                    <Typography.Text type="secondary">Name</Typography.Text>
                    <Input
                      value={editorDraft.name}
                      disabled={isConfigLocked}
                      onChange={(event) => {
                        setEditorDraft({
                          ...editorDraft,
                          name: event.target.value,
                        });
                      }}
                    />
                  </div>

                  <div>
                    <Typography.Text type="secondary">
                      Trigger Type
                    </Typography.Text>
                    <Segmented
                      block
                      value={editorDraft.triggerType}
                      options={[
                        { label: "Once", value: "once" },
                        { label: "Toggle", value: "toggle" },
                        { label: "Repeat", value: "repeat" },
                      ]}
                      disabled={isConfigLocked}
                      onChange={(value) => {
                        const triggerType: TriggerType =
                          value === "toggle"
                            ? "toggle"
                            : value === "repeat"
                              ? "repeat"
                              : "once";
                        setEditorDraft({
                          ...editorDraft,
                          triggerType,
                          repeatCount:
                            triggerType === "repeat"
                              ? normalizeRepeatCount(editorDraft.repeatCount, 2)
                              : editorDraft.repeatCount,
                        });
                      }}
                    />
                  </div>

                  {editorDraft.triggerType === "repeat" && (
                    <div>
                      <Typography.Text type="secondary">
                        Repeat Count
                      </Typography.Text>
                      <InputNumber
                        className="fm-w-full"
                        min={2}
                        max={999}
                        step={1}
                        precision={0}
                        value={normalizeRepeatCount(editorDraft.repeatCount, 2)}
                        disabled={isConfigLocked}
                        onChange={(value) => {
                          setEditorDraft({
                            ...editorDraft,
                            repeatCount: normalizeRepeatCount(value, 2),
                          });
                        }}
                      />
                    </div>
                  )}

                  <div>
                    <Typography.Text type="secondary">
                      Delay Mode
                    </Typography.Text>
                    <Segmented
                      block
                      value={editorDraft.delayMode}
                      options={[
                        { label: "Sequential", value: "sequential" },
                        { label: "Synchronous", value: "synchronous" },
                      ]}
                      disabled={isConfigLocked}
                      onChange={(value) => {
                        setEditorDraft({
                          ...editorDraft,
                          delayMode:
                            value === "synchronous"
                              ? "synchronous"
                              : "sequential",
                        });
                      }}
                    />
                  </div>

                  <div>
                    <Typography.Text type="secondary">
                      Trigger Key
                    </Typography.Text>
                    <div
                      className={`fm-shortcut-input-shell fm-kt-key-shell${editorDraft.triggerKey ? " fm-shortcut-input-has-value" : ""}`}
                    >
                      <Input
                        value={editorDraft.triggerKey}
                        readOnly
                        disabled={isConfigLocked}
                        placeholder="Click or press keys"
                        onKeyDown={(event) => {
                          if (isConfigLocked) {
                            return;
                          }

                          triggerWheelCaptureArmedUntilRef.current =
                            Date.now() + WHEEL_CAPTURE_ARM_WINDOW_MS;

                          event.preventDefault();
                          event.stopPropagation();

                          if (
                            event.key === "Backspace" ||
                            event.key === "Delete"
                          ) {
                            setEditorDraft({
                              ...editorDraft,
                              triggerKey: "",
                            });
                            return;
                          }

                          const captured = buildRecordedShortcut(event);
                          if (!captured) {
                            return;
                          }

                          setEditorDraft({
                            ...editorDraft,
                            triggerKey: captured,
                          });
                        }}
                        onMouseDown={(event) => {
                          if (isConfigLocked) return;
                          if (event.button !== 0 && event.button !== 2) return;
                          triggerWheelCaptureArmedUntilRef.current =
                            Date.now() + WHEEL_CAPTURE_ARM_WINDOW_MS;
                          const input = event.currentTarget as HTMLInputElement;
                          const wasFocused = document.activeElement === input;
                          event.preventDefault();
                          event.stopPropagation();
                          input.focus({ preventScroll: true });
                          if (!wasFocused) {
                            return;
                          }

                          const now = Date.now();
                          const prev = triggerKeyLastClickRef.current;
                          const isDouble =
                            prev.button === event.button &&
                            now - prev.time < 360;
                          triggerKeyLastClickRef.current = {
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
                          setEditorDraft({
                            ...editorDraft,
                            triggerKey: captured,
                          });
                        }}
                        onWheel={(event) => {
                          if (isConfigLocked) return;
                          const input = event.currentTarget as HTMLInputElement;
                          const wasFocused = document.activeElement === input;
                          if (!wasFocused) {
                            input.focus({ preventScroll: true });
                            return;
                          }

                          if (
                            Date.now() >
                            triggerWheelCaptureArmedUntilRef.current
                          ) {
                            return;
                          }

                          const captured = buildWheelShortcut(event);
                          if (!captured) return;
                          event.preventDefault();
                          event.stopPropagation();
                          setEditorDraft({
                            ...editorDraft,
                            triggerKey: captured,
                          });
                        }}
                        onContextMenu={(event) => event.preventDefault()}
                      />
                      {editorDraft.triggerKey && (
                        <span
                          className="fm-shortcut-input-overlay"
                          aria-hidden="true"
                        >
                          <ShortcutKeys combo={editorDraft.triggerKey} />
                        </span>
                      )}
                    </div>

                    {saveDisabledReason && (
                      <Typography.Text
                        type={isConfigLocked ? "warning" : "danger"}
                      >
                        {saveDisabledReason}
                      </Typography.Text>
                    )}
                  </div>

                  <div>
                    <Typography.Text type="secondary">
                      Execution Scope
                    </Typography.Text>
                    {(() => {
                      const scope = resolveExecutionScope(editorDraft);
                      const specificOptions = availableTargetTabs.map(
                        (tab) => ({
                          label: tab.name,
                          value: tab.id,
                        }),
                      );

                      (editorDraft.specificTargetTabIds ?? []).forEach(
                        (id, index) => {
                          if (!isValidTabId(id)) {
                            return;
                          }

                          if (
                            !availableTargetTabs.some((tab) => tab.id === id)
                          ) {
                            specificOptions.unshift({
                              label: editorDraft.specificTargetTabNames?.[index]
                                ? `${editorDraft.specificTargetTabNames[index]} (saved)`
                                : "Saved tab",
                              value: id,
                            });
                          }
                        },
                      );

                      return (
                        <>
                          <Segmented
                            block
                            value={scope}
                            disabled={isConfigLocked}
                            onChange={(value) => {
                              const nextScope =
                                value === "current" ||
                                value === "other" ||
                                value === "specific"
                                  ? value
                                  : "all";

                              const nextSpecificTargetTabId =
                                nextScope === "specific"
                                  ? (editorDraft.specificTargetTabIds?.find(
                                      (id) => isValidTabId(id),
                                    ) ??
                                    (isValidTabId(
                                      editorDraft.specificTargetTabId,
                                    )
                                      ? editorDraft.specificTargetTabId
                                      : null) ??
                                    availableTargetTabs[0]?.id ??
                                    null)
                                  : isValidTabId(
                                        editorDraft.specificTargetTabId,
                                      )
                                    ? editorDraft.specificTargetTabId
                                    : null;

                              const nextSpecificTargetTabName =
                                nextScope === "specific"
                                  ? (editorDraft.specificTargetTabNames?.[0] ??
                                    editorDraft.specificTargetTabName ??
                                    availableTargetTabs.find(
                                      (tab) =>
                                        tab.id === nextSpecificTargetTabId,
                                    )?.name ??
                                    null)
                                  : (editorDraft.specificTargetTabName ?? null);

                              const nextSpecificTargetTabIds =
                                nextScope === "specific"
                                  ? nextSpecificTargetTabId !== null
                                    ? [nextSpecificTargetTabId]
                                    : []
                                  : (editorDraft.specificTargetTabIds ?? []);

                              const nextSpecificTargetTabNames =
                                nextScope === "specific"
                                  ? nextSpecificTargetTabName
                                    ? [nextSpecificTargetTabName]
                                    : []
                                  : (editorDraft.specificTargetTabNames ?? []);

                              setEditorDraft({
                                ...editorDraft,
                                executionScope: nextScope,
                                currentTabOnly: nextScope === "current",
                                otherTabsOnly: nextScope === "other",
                                specificTargetTabIds: nextSpecificTargetTabIds,
                                specificTargetTabNames:
                                  nextSpecificTargetTabNames,
                                specificTargetTabId: nextSpecificTargetTabId,
                                specificTargetTabName:
                                  nextSpecificTargetTabName,
                              });
                            }}
                            options={[
                              { label: "All tabs", value: "all" },
                              { label: "Current only", value: "current" },
                              { label: "Other only", value: "other" },
                              { label: "Specific tab", value: "specific" },
                            ]}
                          />

                          {scope === "specific" && (
                            <div style={{ marginTop: 8 }}>
                              <Select
                                className="fm-w-full"
                                mode="multiple"
                                value={editorDraft.specificTargetTabIds ?? []}
                                options={specificOptions}
                                placeholder="Select specific tabs"
                                disabled={isConfigLocked}
                                onChange={(values) => {
                                  const normalizedValues = Array.from(
                                    new Set(
                                      values.filter((id) =>
                                        Number.isFinite(id),
                                      ),
                                    ),
                                  );
                                  const selectedTabNames = normalizedValues.map(
                                    (id) =>
                                      availableTargetTabs.find(
                                        (tab) => tab.id === id,
                                      )?.name ?? `Tab ${id}`,
                                  );
                                  setEditorDraft({
                                    ...editorDraft,
                                    executionScope: "specific",
                                    specificTargetTabIds: normalizedValues,
                                    specificTargetTabNames: selectedTabNames,
                                    specificTargetTabId:
                                      normalizedValues[0] ?? null,
                                    specificTargetTabName:
                                      selectedTabNames[0] ?? null,
                                    currentTabOnly: false,
                                    otherTabsOnly: false,
                                  });
                                }}
                              />
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {editorDraft.triggerType === "toggle" && (
                    <div style={{ margin: "8px 0" }}>
                      <Checkbox
                        checked={!!editorDraft.lockToTab}
                        disabled={isConfigLocked}
                        onChange={(event) => {
                          setEditorDraft({
                            ...editorDraft,
                            lockToTab: event.target.checked,
                          });
                        }}
                      >
                        Lock toggle to this tab (can only be turned off from the
                        tab where it was enabled)
                      </Checkbox>
                    </div>
                  )}

                  <div className="fm-kt-actions-section">
                    <div className="fm-kt-section-row">
                      <Typography.Text strong>Actions</Typography.Text>
                    </div>

                    <div>
                      <Checkbox
                        checked={editorDraft.enabled}
                        disabled={isConfigLocked}
                        onChange={(event) => {
                          setEditorDraft({
                            ...editorDraft,
                            enabled: event.target.checked,
                          });
                        }}
                      >
                        Enabled in running mode
                      </Checkbox>
                    </div>

                    {editorDraft.actions.length === 0 ? (
                      <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="No actions"
                      />
                    ) : (
                      <Space
                        direction="vertical"
                        size={6}
                        className="fm-w-full"
                      >
                        <div className="fm-kt-actions-table-scroll">
                          <div className="fm-kt-actions-table">
                            <div
                              className="fm-kt-action-header"
                              style={{
                                color: token.colorTextSecondary,
                                fontSize: 12,
                                fontWeight: 600,
                                padding: "0 4px",
                              }}
                            >
                              <span aria-hidden="true" />
                              <span>Name</span>
                              <span>Key</span>
                              <Tooltip title="ms" {...dialogTooltipProps}>
                                <div style={{ width: "100%" }}>
                                  <span>Delay</span>
                                </div>
                              </Tooltip>
                              <span>Mode</span>
                              <span>Times</span>
                              <span>Enabled</span>
                              <span>Actions</span>
                            </div>

                            {editorDraft.actions.map((action) => {
                              const actionHighlighted =
                                newActionHighlightId === action.id;
                              return (
                                <div
                                  key={action.id}
                                  draggable={!isConfigLocked}
                                  onDragStart={() => setDragActionId(action.id)}
                                  onDragOver={(event) => {
                                    event.preventDefault();
                                  }}
                                  onDrop={() => {
                                    if (!dragActionId || isConfigLocked) {
                                      return;
                                    }

                                    setEditorDraft({
                                      ...editorDraft,
                                      actions: moveById(
                                        editorDraft.actions,
                                        dragActionId,
                                        action.id,
                                      ),
                                    });
                                    setDragActionId(null);
                                  }}
                                  style={{
                                    border: `1px solid ${token.colorBorder}`,
                                    background: actionHighlighted
                                      ? token.colorFillTertiary
                                      : token.colorFillQuaternary,
                                    borderRadius: 8,
                                    padding: 4,
                                  }}
                                >
                                  <div className="fm-kt-action-row">
                                    <span
                                      className="fm-kt-drag-handle"
                                      aria-hidden="true"
                                    >
                                      <HolderOutlined />
                                    </span>
                                    <Input
                                      value={action.name}
                                      placeholder="Action name"
                                      disabled={isConfigLocked}
                                      onChange={(event) => {
                                        setEditorDraft({
                                          ...editorDraft,
                                          actions: editorDraft.actions.map(
                                            (item) =>
                                              item.id === action.id
                                                ? {
                                                    ...item,
                                                    name: event.target.value,
                                                  }
                                                : item,
                                          ),
                                        });
                                      }}
                                    />

                                    <div
                                      className={`fm-shortcut-input-shell fm-kt-key-shell${action.key ? " fm-shortcut-input-has-value" : ""}`}
                                    >
                                      <Input
                                        value={action.key}
                                        readOnly
                                        disabled={isConfigLocked}
                                        placeholder="Click or press keys"
                                        onKeyDown={(event) => {
                                          if (isConfigLocked) {
                                            return;
                                          }

                                          actionWheelCaptureArmedUntilRef.current.set(
                                            action.id,
                                            Date.now() +
                                              WHEEL_CAPTURE_ARM_WINDOW_MS,
                                          );

                                          event.preventDefault();
                                          event.stopPropagation();

                                          if (
                                            event.key === "Backspace" ||
                                            event.key === "Delete"
                                          ) {
                                            setEditorDraft({
                                              ...editorDraft,
                                              actions: editorDraft.actions.map(
                                                (item) =>
                                                  item.id === action.id
                                                    ? { ...item, key: "" }
                                                    : item,
                                              ),
                                            });
                                            return;
                                          }

                                          const captured =
                                            buildRecordedShortcut(event);
                                          if (!captured) {
                                            return;
                                          }

                                          setEditorDraft({
                                            ...editorDraft,
                                            actions: editorDraft.actions.map(
                                              (item) =>
                                                item.id === action.id
                                                  ? {
                                                      ...item,
                                                      key: captured,
                                                    }
                                                  : item,
                                            ),
                                          });
                                        }}
                                        onMouseDown={(event) => {
                                          if (isConfigLocked) return;
                                          if (
                                            event.button !== 0 &&
                                            event.button !== 2
                                          )
                                            return;
                                          actionWheelCaptureArmedUntilRef.current.set(
                                            action.id,
                                            Date.now() +
                                              WHEEL_CAPTURE_ARM_WINDOW_MS,
                                          );
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
                                          const prevEntry =
                                            actionKeyLastClickRef.current.get(
                                              action.id,
                                            ) ?? {
                                              button: -1,
                                              time: 0,
                                            };
                                          const isDouble =
                                            prevEntry.button === event.button &&
                                            now - prevEntry.time < 360;
                                          actionKeyLastClickRef.current.set(
                                            action.id,
                                            {
                                              button: event.button,
                                              time: now,
                                            },
                                          );
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
                                          setEditorDraft({
                                            ...editorDraft,
                                            actions: editorDraft.actions.map(
                                              (item) =>
                                                item.id === action.id
                                                  ? { ...item, key: captured }
                                                  : item,
                                            ),
                                          });
                                        }}
                                        onWheel={(event) => {
                                          if (isConfigLocked) return;
                                          const input =
                                            event.currentTarget as HTMLInputElement;
                                          const wasFocused =
                                            document.activeElement === input;
                                          if (!wasFocused) {
                                            input.focus({
                                              preventScroll: true,
                                            });
                                            return;
                                          }

                                          if (
                                            Date.now() >
                                            (actionWheelCaptureArmedUntilRef.current.get(
                                              action.id,
                                            ) ?? 0)
                                          ) {
                                            return;
                                          }

                                          const captured =
                                            buildWheelShortcut(event);
                                          if (!captured) return;
                                          event.preventDefault();
                                          event.stopPropagation();
                                          setEditorDraft({
                                            ...editorDraft,
                                            actions: editorDraft.actions.map(
                                              (item) =>
                                                item.id === action.id
                                                  ? { ...item, key: captured }
                                                  : item,
                                            ),
                                          });
                                        }}
                                        onContextMenu={(event) =>
                                          event.preventDefault()
                                        }
                                      />
                                      {action.key && (
                                        <span
                                          className="fm-shortcut-input-overlay"
                                          aria-hidden="true"
                                        >
                                          <ShortcutKeys combo={action.key} />
                                        </span>
                                      )}
                                    </div>

                                    <Tooltip title="ms" {...dialogTooltipProps}>
                                      <div style={{ width: "100%" }}>
                                        <InputNumber
                                          min={0}
                                          step={25}
                                          value={action.delayMs}
                                          disabled={isConfigLocked}
                                          onChange={(value) => {
                                            const delayMs = Math.max(
                                              0,
                                              Math.round(Number(value) || 0),
                                            );
                                            setEditorDraft({
                                              ...editorDraft,
                                              actions: editorDraft.actions.map(
                                                (item) =>
                                                  item.id === action.id
                                                    ? { ...item, delayMs }
                                                    : item,
                                              ),
                                            });
                                          }}
                                          placeholder="Delay"
                                          style={{ width: "100%" }}
                                        />
                                      </div>
                                    </Tooltip>

                                    <Segmented
                                      size="small"
                                      value={
                                        action.actionTriggerType === "repeat"
                                          ? "repeat"
                                          : "once"
                                      }
                                      options={[
                                        { label: "Once", value: "once" },
                                        { label: "Repeat", value: "repeat" },
                                      ]}
                                      disabled={isConfigLocked}
                                      onChange={(value) => {
                                        setEditorDraft({
                                          ...editorDraft,
                                          actions: editorDraft.actions.map(
                                            (item) =>
                                              item.id === action.id
                                                ? {
                                                    ...item,
                                                    actionTriggerType:
                                                      value === "repeat"
                                                        ? "repeat"
                                                        : "once",
                                                    actionRepeatCount:
                                                      value === "repeat"
                                                        ? normalizeActionRepeatCount(
                                                            item.actionRepeatCount,
                                                            2,
                                                          )
                                                        : 1,
                                                  }
                                                : item,
                                          ),
                                        });
                                      }}
                                    />

                                    <InputNumber
                                      min={1}
                                      max={99}
                                      step={1}
                                      precision={0}
                                      value={
                                        action.actionTriggerType === "repeat"
                                          ? normalizeActionRepeatCount(
                                              action.actionRepeatCount,
                                              2,
                                            )
                                          : 1
                                      }
                                      disabled={
                                        isConfigLocked ||
                                        action.actionTriggerType !== "repeat"
                                      }
                                      onChange={(value) => {
                                        setEditorDraft({
                                          ...editorDraft,
                                          actions: editorDraft.actions.map(
                                            (item) =>
                                              item.id === action.id
                                                ? {
                                                    ...item,
                                                    actionRepeatCount:
                                                      item.actionTriggerType ===
                                                      "repeat"
                                                        ? normalizeActionRepeatCount(
                                                            value,
                                                            2,
                                                          )
                                                        : 1,
                                                  }
                                                : item,
                                          ),
                                        });
                                      }}
                                      style={{ width: "100%" }}
                                    />

                                    <Checkbox
                                      checked={action.enabled !== false}
                                      disabled={isConfigLocked}
                                      onChange={(event) => {
                                        setEditorDraft({
                                          ...editorDraft,
                                          actions: editorDraft.actions.map(
                                            (item) =>
                                              item.id === action.id
                                                ? {
                                                    ...item,
                                                    enabled:
                                                      event.target.checked,
                                                  }
                                                : item,
                                          ),
                                        });
                                      }}
                                    />

                                    <Space size={4}>
                                      <Tooltip
                                        title="Duplicate"
                                        {...dialogTooltipProps}
                                      >
                                        <Button
                                          type="text"
                                          icon={<CopyOutlined />}
                                          style={{
                                            color: isConfigLocked
                                              ? token.colorTextDisabled
                                              : undefined,
                                          }}
                                          disabled={isConfigLocked}
                                          onClick={() => {
                                            const nextId = createActionId();
                                            const nextName =
                                              buildParenthesizedDuplicateName(
                                                action.name || "Action",
                                                editorDraft.actions.map(
                                                  (item) => item.name,
                                                ),
                                              );
                                            const actionIndex =
                                              editorDraft.actions.findIndex(
                                                (item) => item.id === action.id,
                                              );
                                            const nextActions = [
                                              ...editorDraft.actions,
                                            ];

                                            if (actionIndex < 0) {
                                              nextActions.push({
                                                ...action,
                                                id: nextId,
                                                name: nextName,
                                              });
                                            } else {
                                              nextActions.splice(
                                                actionIndex + 1,
                                                0,
                                                {
                                                  ...action,
                                                  id: nextId,
                                                  name: nextName,
                                                },
                                              );
                                            }

                                            setEditorDraft({
                                              ...editorDraft,
                                              actions: nextActions,
                                            });
                                            setNewActionHighlightId(nextId);
                                          }}
                                        />
                                      </Tooltip>
                                      <Tooltip
                                        title={
                                          editorDraft.actions.length <= 1
                                            ? "At least one action is required"
                                            : "Delete"
                                        }
                                        {...dialogTooltipProps}
                                      >
                                        <Popconfirm
                                          title="Delete action?"
                                          description="This cannot be undone."
                                          okText="Delete"
                                          cancelText="Cancel"
                                          okButtonProps={{ danger: true }}
                                          disabled={
                                            isConfigLocked ||
                                            editorDraft.actions.length <= 1
                                          }
                                          onConfirm={() => {
                                            if (
                                              editorDraft.actions.length <= 1
                                            ) {
                                              return;
                                            }

                                            setEditorDraft({
                                              ...editorDraft,
                                              actions:
                                                editorDraft.actions.filter(
                                                  (item) =>
                                                    item.id !== action.id,
                                                ),
                                            });
                                          }}
                                          {...dialogPopconfirmProps}
                                        >
                                          <Button
                                            type="text"
                                            danger
                                            style={{
                                              color:
                                                isConfigLocked ||
                                                editorDraft.actions.length <= 1
                                                  ? token.colorTextDisabled
                                                  : token.colorError,
                                            }}
                                            icon={<DeleteOutlined />}
                                            disabled={
                                              isConfigLocked ||
                                              editorDraft.actions.length <= 1
                                            }
                                          />
                                        </Popconfirm>
                                      </Tooltip>
                                    </Space>
                                  </div>
                                  <div
                                    style={{ paddingTop: 8, paddingLeft: 28 }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        marginBottom: 8,
                                        color: token.colorTextSecondary,
                                      }}
                                    >
                                      Scope:
                                    </div>
                                    <Segmented
                                      value={
                                        action.executionScope === "specific"
                                          ? "specific"
                                          : action.otherTabsOnly === true
                                            ? "other"
                                            : action.currentTabOnly === true
                                              ? "current"
                                              : "all"
                                      }
                                      disabled={isConfigLocked}
                                      onChange={(value) => {
                                        const nextScope =
                                          value === "current" ||
                                          value === "other" ||
                                          value === "specific"
                                            ? value
                                            : "all";
                                        const nextSpecificTargetTabIds =
                                          nextScope === "specific"
                                            ? action.specificTargetTabIds &&
                                              action.specificTargetTabIds
                                                .length > 0
                                              ? action.specificTargetTabIds
                                              : availableTargetTabs[0]?.id !==
                                                  undefined
                                                ? [availableTargetTabs[0].id]
                                                : []
                                            : (action.specificTargetTabIds ??
                                              []);
                                        const nextSpecificTargetTabNames =
                                          nextScope === "specific"
                                            ? nextSpecificTargetTabIds.map(
                                                (id) =>
                                                  availableTargetTabs.find(
                                                    (tab) => tab.id === id,
                                                  )?.name ?? `Tab ${id}`,
                                              )
                                            : (action.specificTargetTabNames ??
                                              []);
                                        setEditorDraft({
                                          ...editorDraft,
                                          actions: editorDraft.actions.map(
                                            (item) =>
                                              item.id === action.id
                                                ? {
                                                    ...item,
                                                    executionScope: nextScope,
                                                    currentTabOnly:
                                                      nextScope === "current",
                                                    otherTabsOnly:
                                                      nextScope === "other",
                                                    specificTargetTabIds:
                                                      nextSpecificTargetTabIds,
                                                    specificTargetTabNames:
                                                      nextSpecificTargetTabNames,
                                                  }
                                                : item,
                                          ),
                                        });
                                      }}
                                      options={[
                                        {
                                          label: "All tabs",
                                          value: "all",
                                        },
                                        {
                                          label: "Current only",
                                          value: "current",
                                        },
                                        {
                                          label: "Other only",
                                          value: "other",
                                        },
                                        {
                                          label: "Specific tabs",
                                          value: "specific",
                                        },
                                      ]}
                                      block
                                    />
                                    {(action.executionScope === "specific" ||
                                      ((action.specificTargetTabIds?.length ??
                                        0) > 0 &&
                                        action.currentTabOnly !== true &&
                                        action.otherTabsOnly !== true)) && (
                                      <div style={{ marginTop: 8 }}>
                                        <Select
                                          mode="multiple"
                                          className="fm-w-full"
                                          value={
                                            action.specificTargetTabIds ?? []
                                          }
                                          options={availableTargetTabs.map(
                                            (tab) => ({
                                              label: tab.name,
                                              value: tab.id,
                                            }),
                                          )}
                                          placeholder="Select specific tabs"
                                          disabled={isConfigLocked}
                                          onChange={(values) => {
                                            const normalizedValues = Array.from(
                                              new Set(
                                                values.filter((id) =>
                                                  Number.isFinite(id),
                                                ),
                                              ),
                                            );
                                            const selectedTabNames =
                                              normalizedValues.map(
                                                (id) =>
                                                  availableTargetTabs.find(
                                                    (tab) => tab.id === id,
                                                  )?.name ?? `Tab ${id}`,
                                              );

                                            setEditorDraft({
                                              ...editorDraft,
                                              actions: editorDraft.actions.map(
                                                (item) =>
                                                  item.id === action.id
                                                    ? {
                                                        ...item,
                                                        executionScope:
                                                          "specific",
                                                        currentTabOnly: false,
                                                        otherTabsOnly: false,
                                                        specificTargetTabIds:
                                                          normalizedValues,
                                                        specificTargetTabNames:
                                                          selectedTabNames,
                                                      }
                                                    : item,
                                              ),
                                            });
                                          }}
                                        />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </Space>
                    )}
                  </div>
                </Space>
              ) : (
                <div ref={editorPaneContentRef} />
              )}
            </div>
          </div>
        </div>
      </div>
    </Space>
  );
};
