import {
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  HolderOutlined,
  PoweroffOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  Button,
  Checkbox,
  Empty,
  Input,
  InputNumber,
  Popover,
  Segmented,
  Space,
  Tooltip,
  Typography,
  theme,
} from "antd";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent as ReactWheelEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  KeyTriggerAction,
  KeyTriggerProfile,
  TriggerType,
} from "../../types";
import { ShortcutKeys } from "../components/ShortcutKeys";

type Props = {
  profiles: KeyTriggerProfile[];
  onProfilesChange: (profiles: KeyTriggerProfile[]) => void;
  isConfigLocked: boolean;
  onEditorOpenChange?: (isOpen: boolean) => void;
  backRequestVersion?: number;
  selectedProfileId?: string | null;
  onSelectedProfileIdChange?: (profileId: string | null) => void;
};

type ProfileEditorDraft = {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: TriggerType;
  triggerKey: string;
  currentTabOnly?: boolean;
  otherTabsOnly?: boolean;
  delayMode: "sequential" | "synchronous";
  actions: KeyTriggerAction[];
};

const createProfileId = () =>
  `kt-profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
  };
};

export const KeyTriggerTab = ({
  profiles,
  onProfilesChange,
  isConfigLocked,
  onEditorOpenChange,
  backRequestVersion,
  selectedProfileId: initialSelectedProfileId,
  onSelectedProfileIdChange,
}: Props) => {
  const { token } = theme.useToken();
  const dialogTooltipProps = {
    getPopupContainer: (triggerNode: HTMLElement) =>
      (triggerNode.closest(".fm-dialog") as HTMLElement | null) ??
      document.body,
    zIndex: 2147483647,
  };
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    initialSelectedProfileId ?? null,
  );
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
  const profilesPaneContentRef = useRef<HTMLDivElement | null>(null);
  const editorPaneContentRef = useRef<HTMLDivElement | null>(null);
  const [activePaneHeight, setActivePaneHeight] = useState<number | null>(null);
  const triggerKeyLastClickRef = useRef<{ button: number; time: number }>({
    button: -1,
    time: 0,
  });
  const actionKeyLastClickRef = useRef<
    Map<string, { button: number; time: number }>
  >(new Map());

  const isEditorOpen = editorDraft !== null;

  useEffect(() => {
    onEditorOpenChange?.(isEditorOpen);
  }, [isEditorOpen, onEditorOpenChange]);

  useEffect(() => {
    if (
      initialSelectedProfileId !== undefined &&
      initialSelectedProfileId !== selectedProfileId
    ) {
      setSelectedProfileId(initialSelectedProfileId);
    }
  }, [initialSelectedProfileId]);

  useEffect(() => {
    if (onSelectedProfileIdChange) {
      onSelectedProfileIdChange(selectedProfileId);
    }
  }, [selectedProfileId, onSelectedProfileIdChange]);

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
    if (!isEditorOpen) {
      return;
    }

    const pane = editorPaneContentRef.current?.closest(
      ".fm-dialog-slider-pane",
    ) as HTMLElement | null;
    if (!pane) {
      return;
    }

    pane.scrollTo({ top: 0, behavior: "smooth" });
  }, [isEditorOpen, editingProfileId]);

  const lastBackRequestVersionRef = useRef<number>(backRequestVersion ?? 0);

  const startNewProfileEditor = () => {
    const id = createProfileId();
    const name = getNextProfileName(profiles.map((profile) => profile.name));

    setEditingProfileId(id);
    setEditorDraft({
      id,
      name,
      enabled: true,
      triggerType: "once",
      triggerKey: "",
      delayMode: "sequential",
      actions: [createDefaultAction()],
    });
  };

  const startEditProfileEditor = (profile: KeyTriggerProfile) => {
    setSelectedProfileId(profile.id);
    setEditingProfileId(profile.id);
    setEditorDraft({
      id: profile.id,
      name: profile.name,
      enabled: profile.enabled !== false,
      triggerType: profile.triggerType,
      triggerKey: profile.triggerKey,
      currentTabOnly: profile.currentTabOnly,
      otherTabsOnly: profile.otherTabsOnly,
      delayMode: profile.delayMode || "sequential",
      actions:
        profile.actions.length > 0
          ? profile.actions.map((action) => ({ ...action }))
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
      name: duplicatedName,
      enabled: profile.enabled !== false,
      delayMode: profile.delayMode || "sequential",
      actions: profile.actions.map((action) => ({
        ...action,
        id: createActionId(),
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

  const toggleProfileEnabled = (profileId: string) => {
    onProfilesChange(
      profiles.map((profile) =>
        profile.id === profileId
          ? { ...profile, enabled: profile.enabled === false }
          : profile,
      ),
    );
  };

  const saveDraft = () => {
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

    const normalizedActions = sourceActions.map((action, index) => ({
      ...action,
      name: action.name.trim() || `Action ${index + 1}`,
      key: action.key.trim(),
      delayMs: Math.max(0, Math.round(action.delayMs || 0)),
    }));

    const nextProfile: KeyTriggerProfile = {
      id: editorDraft.id,
      name: normalizedName,
      enabled: editorDraft.enabled,
      triggerType: editorDraft.triggerType,
      triggerKey: normalizedTriggerKey,
      ...(editorDraft.currentTabOnly && { currentTabOnly: true }),
      ...(editorDraft.otherTabsOnly && { otherTabsOnly: true }),
      delayMode: editorDraft.delayMode,
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
  };

  const cancelDraft = () => {
    setEditingProfileId(null);
    setEditorDraft(null);
  };

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

  const addActionDraft = () => {
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
        },
      ],
    });
    setNewActionHighlightId(nextId);
  };

  return (
    <Space direction="vertical" size={12} className="fm-w-full fm-kt-pane">
      <div className="fm-kt-profiles-section">
        <div className="fm-kt-section-row">
          <Typography.Text strong>Profiles</Typography.Text>
          {!isEditorOpen && (
            <Tooltip title="Add profile" {...dialogTooltipProps}>
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                onClick={startNewProfileEditor}
                disabled={isConfigLocked}
                aria-label="Add profile"
              />
            </Tooltip>
          )}
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
                ) : (
                  <>
                    {profiles.map((profile) => {
                      const isSelected = selectedProfileId === profile.id;
                      const isHighlighted =
                        newProfileHighlightId === profile.id;
                      const profileItemClassName = `fm-kt-profile-item${isSelected ? " fm-kt-profile-item-selected" : ""}${isHighlighted ? " fm-kt-profile-item-highlighted" : ""}${profile.enabled === false ? " fm-kt-profile-item-disabled" : ""}`;

                      return (
                        <div
                          key={profile.id}
                          className={profileItemClassName}
                          draggable={!isConfigLocked}
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
                              <Typography.Text
                                strong
                                className="fm-kt-profile-name-text"
                              >
                                {profile.name}
                              </Typography.Text>
                            </Space>

                            <Space size={4}>
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
                                  onClick={() => deleteProfile(profile.id)}
                                  disabled={isConfigLocked}
                                />
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

                            <div className="fm-kt-profile-meta-row">
                              <span className="fm-kt-profile-meta-label">
                                No. of actions:
                              </span>
                              <Popover
                                trigger="hover"
                                placement="rightTop"
                                overlayInnerStyle={{
                                  backgroundColor: "#0f172af5",
                                  color: token.colorText,
                                }}
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
                      ]}
                      disabled={isConfigLocked}
                      onChange={(value) => {
                        setEditorDraft({
                          ...editorDraft,
                          triggerType: value === "toggle" ? "toggle" : "once",
                        });
                      }}
                    />
                  </div>

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
                          event.stopPropagation();
                          if (!wasFocused) {
                            input.focus({ preventScroll: true });
                            return;
                          }

                          const captured = buildWheelShortcut(event);
                          if (!captured) return;
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
                  </div>

                  <div>
                    <Typography.Text type="secondary">
                      Execution Scope
                    </Typography.Text>
                    <Segmented
                      value={
                        editorDraft.otherTabsOnly === true
                          ? "other"
                          : editorDraft.currentTabOnly === true
                            ? "current"
                            : "all"
                      }
                      disabled={isConfigLocked}
                      onChange={(value) => {
                        setEditorDraft({
                          ...editorDraft,
                          currentTabOnly: value === "current",
                          otherTabsOnly: value === "other",
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
                      ]}
                      block
                    />
                  </div>

                  <div className="fm-kt-actions-section">
                    <div className="fm-kt-section-row">
                      <Typography.Text strong>Actions</Typography.Text>
                      <Tooltip title="Add action" {...dialogTooltipProps}>
                        <Button
                          type="text"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={addActionDraft}
                          disabled={isConfigLocked}
                          aria-label="Add action"
                        />
                      </Tooltip>
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
                            <span>Delay</span>
                          </Tooltip>
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
                                      event.stopPropagation();
                                      if (!wasFocused) {
                                        input.focus({ preventScroll: true });
                                        return;
                                      }

                                      const captured =
                                        buildWheelShortcut(event);
                                      if (!captured) return;
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
                                      onClick={() => {
                                        if (editorDraft.actions.length <= 1) {
                                          return;
                                        }

                                        setEditorDraft({
                                          ...editorDraft,
                                          actions: editorDraft.actions.filter(
                                            (item) => item.id !== action.id,
                                          ),
                                        });
                                      }}
                                    />
                                  </Tooltip>
                                </Space>
                              </div>
                              <div style={{ paddingTop: 8, paddingLeft: 28 }}>
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
                                    action.otherTabsOnly === true
                                      ? "other"
                                      : action.currentTabOnly === true
                                        ? "current"
                                        : "all"
                                  }
                                  disabled={isConfigLocked}
                                  onChange={(value) => {
                                    setEditorDraft({
                                      ...editorDraft,
                                      actions: editorDraft.actions.map(
                                        (item) =>
                                          item.id === action.id
                                            ? {
                                                ...item,
                                                currentTabOnly:
                                                  value === "current",
                                                otherTabsOnly:
                                                  value === "other",
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
                                  ]}
                                  block
                                />
                              </div>
                            </div>
                          );
                        })}
                      </Space>
                    )}
                  </div>

                  <div className="fm-kt-editor-actions">
                    <Button
                      type="primary"
                      block
                      disabled={
                        isConfigLocked ||
                        !editorDraft.name.trim() ||
                        !editorDraft.triggerKey.trim()
                      }
                      onClick={saveDraft}
                    >
                      Save
                    </Button>
                    <Button block onClick={cancelDraft}>
                      Cancel
                    </Button>
                  </div>
                </Space>
              ) : (
                <div style={{ paddingTop: 8 }}>
                  {profiles.length === 0 && (
                    <Empty
                      image={Empty.PRESENTED_IMAGE_SIMPLE}
                      description="No key trigger profiles"
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Space>
  );
};
