import {
  AimOutlined,
  ClearOutlined,
  CopyOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import {
  Button,
  Divider,
  Form,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import type { Dispatch, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AwakenStatCriterion,
  AutoAwakenConfig,
  NormalizedRect,
} from "../types";
import { AWAKEN_STATS, AWAKEN_STAT_BY_ID } from "./stats";

const createCriterionId = () =>
  `crit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

type Section = "stat1" | "stat2";

type Props = {
  config: AutoAwakenConfig;
  setConfig: Dispatch<SetStateAction<AutoAwakenConfig>>;
  automationRunning: boolean;
  automationStatus: string;
  automationLogs: string[];
  automationRegionCaptureActive: boolean;
  onStartCapture: () => void;
  onCancelCapture: () => void;
  onClearRegion: () => void;
  onStart: (mode?: "reawaken") => void;
  onStop: () => void;
};

const formatRegionLabel = (region: NormalizedRect | null): string => {
  if (!region) return "No region captured";
  return `x:${Math.round(region.x * 100)}% y:${Math.round(region.y * 100)}% w:${Math.round(region.width * 100)}% h:${Math.round(region.height * 100)}%`;
};

const getSelectPopupContainer = (triggerNode: HTMLElement) =>
  (triggerNode.closest(".ant-card-body") as HTMLElement | null) ??
  document.body;

const SELECT_DROPDOWN_STYLE = { zIndex: 2147483647 };

const StatCriteriaSection = ({
  section,
  label,
  criteria,
  onChange,
  otherCriteria,
}: {
  section: Section;
  label: string;
  criteria: AwakenStatCriterion[];
  onChange: (section: Section, criteria: AwakenStatCriterion[]) => void;
  otherCriteria: AwakenStatCriterion[];
}) => {
  // stat IDs already used in THIS section (for deduplication within section)
  const usedInSection = useMemo(
    () => new Set(criteria.map((c) => c.statId)),
    [criteria],
  );

  const availableStats = useMemo(
    () =>
      AWAKEN_STATS.filter(
        (s: (typeof AWAKEN_STATS)[0]) => !usedInSection.has(s.id),
      ),
    [usedInSection],
  );

  const addRow = useCallback(() => {
    if (availableStats.length === 0) return;
    const first = availableStats[0];
    const defaultValue = first.values[0] ?? 0;
    onChange(section, [
      ...criteria,
      {
        id: createCriterionId(),
        statId: first.id,
        statValue: defaultValue,
      },
    ]);
  }, [availableStats, criteria, onChange, section]);

  const updateRow = useCallback(
    (id: string, field: "statId" | "statValue", value: string | number) => {
      onChange(
        section,
        criteria.map((row) => {
          if (row.id !== id) return row;
          if (field === "statId") {
            const stat = AWAKEN_STAT_BY_ID[value as string];
            const lowestValue = stat?.values[0] ?? 0;
            return { ...row, statId: value as string, statValue: lowestValue };
          }
          return { ...row, statValue: value as number };
        }),
      );
    },
    [criteria, onChange, section],
  );

  const removeRow = useCallback(
    (id: string) => {
      onChange(
        section,
        criteria.filter((row) => row.id !== id),
      );
    },
    [criteria, onChange, section],
  );

  return (
    <div className="fm-awaken-section">
      <div className="fm-awaken-section-header">
        <Typography.Text strong>{label}</Typography.Text>
        {otherCriteria.length === 0 && criteria.length > 0 && (
          <Tag color="blue" style={{ marginLeft: 6, fontSize: 10 }}>
            sum mode
          </Tag>
        )}
      </div>
      <Space direction="vertical" size={6} style={{ width: "100%" }}>
        {criteria.map((row) => {
          const stat = AWAKEN_STAT_BY_ID[row.statId];
          if (!stat) return null;

          // values available for this row's stat ID
          const valueOptions = stat.values.map((v: number) => ({
            value: v,
            label: stat.isPercent ? `${v}%` : `+${v}`,
          }));

          // stat options: all stats minus the ones used in THIS section by
          // OTHER rows (current row's stat is always included so it can be
          // kept/changed)
          const statOptions = AWAKEN_STATS.filter(
            (s: (typeof AWAKEN_STATS)[0]) =>
              s.id === row.statId || !usedInSection.has(s.id),
          ).map((s: (typeof AWAKEN_STATS)[0]) => ({
            value: s.id,
            label: s.label,
          }));

          return (
            <Space key={row.id} size={4} style={{ width: "100%" }}>
              <Select
                size="small"
                value={row.statId}
                options={statOptions}
                getPopupContainer={getSelectPopupContainer}
                dropdownStyle={SELECT_DROPDOWN_STYLE}
                style={{ minWidth: 164 }}
                onChange={(v: string) => updateRow(row.id, "statId", v)}
              />
              <Select
                size="small"
                value={row.statValue}
                options={valueOptions}
                getPopupContainer={getSelectPopupContainer}
                dropdownStyle={SELECT_DROPDOWN_STYLE}
                style={{ minWidth: 72 }}
                onChange={(v: number) => updateRow(row.id, "statValue", v)}
              />
              <Tooltip title="Remove">
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined />}
                  onClick={() => removeRow(row.id)}
                />
              </Tooltip>
            </Space>
          );
        })}

        <Button
          type="dashed"
          size="small"
          icon={<PlusOutlined />}
          disabled={availableStats.length === 0}
          onClick={addRow}
        >
          Add condition
        </Button>
        {criteria.length === 0 && (
          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
            No conditions — this section is ignored.
          </Typography.Text>
        )}
      </Space>
    </div>
  );
};

export const AutoAwakenTab = ({
  config,
  setConfig,
  automationRunning,
  automationStatus,
  automationLogs,
  automationRegionCaptureActive,
  onStartCapture,
  onCancelCapture,
  onClearRegion,
  onStart,
  onStop,
}: Props) => {
  const [showActivityView, setShowActivityView] = useState(false);
  const [shouldAutoScrollLog, setShouldAutoScrollLog] = useState(true);
  const [copyLogsState, setCopyLogsState] = useState<
    "idle" | "copied" | "error"
  >("idle");
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const copyLogsResetTimerRef = useRef<number | null>(null);

  const handleCriteriaChange = useCallback(
    (section: Section, criteria: AwakenStatCriterion[]) => {
      setConfig((prev: AutoAwakenConfig) => ({
        ...prev,
        [section === "stat1" ? "stat1Criteria" : "stat2Criteria"]: criteria,
      }));
    },
    [setConfig],
  );

  const canStart =
    config.scanRegion !== null &&
    (config.stat1Criteria.length > 0 || config.stat2Criteria.length > 0);

  useEffect(() => {
    if (automationRunning) {
      setShowActivityView(true);
    }
  }, [automationRunning]);

  useEffect(() => {
    if (showActivityView) {
      setShouldAutoScrollLog(true);
    }
  }, [showActivityView]);

  const activityLogs = useMemo(() => [...automationLogs], [automationLogs]);

  useEffect(() => {
    if (!shouldAutoScrollLog || !showActivityView) {
      return;
    }

    const logNode = logContainerRef.current;
    if (!logNode) {
      return;
    }

    logNode.scrollTop = logNode.scrollHeight;
  }, [activityLogs, shouldAutoScrollLog, showActivityView]);

  const handleLogScroll = useCallback(() => {
    const logNode = logContainerRef.current;
    if (!logNode) {
      return;
    }

    const distanceFromBottom =
      logNode.scrollHeight - logNode.scrollTop - logNode.clientHeight;
    const isAtBottom = distanceFromBottom <= 8;
    setShouldAutoScrollLog(isAtBottom);
  }, []);

  const jumpToLatestLog = useCallback(() => {
    const logNode = logContainerRef.current;
    if (!logNode) {
      return;
    }

    logNode.scrollTop = logNode.scrollHeight;
    setShouldAutoScrollLog(true);
  }, []);

  const copyActivityLogs = useCallback(async () => {
    const text = activityLogs.join("\n").trim();
    if (!text) {
      setCopyLogsState("error");
      return;
    }

    const resetFeedback = () => {
      if (copyLogsResetTimerRef.current !== null) {
        window.clearTimeout(copyLogsResetTimerRef.current);
      }
      copyLogsResetTimerRef.current = window.setTimeout(() => {
        setCopyLogsState("idle");
        copyLogsResetTimerRef.current = null;
      }, 1500);
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "true");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }

      setCopyLogsState("copied");
      resetFeedback();
    } catch {
      setCopyLogsState("error");
      resetFeedback();
    }
  }, [activityLogs]);

  useEffect(() => {
    return () => {
      if (copyLogsResetTimerRef.current !== null) {
        window.clearTimeout(copyLogsResetTimerRef.current);
      }
    };
  }, []);

  const configuredStatRows = useMemo(
    () => [
      {
        label: "Stat 1",
        criteria: config.stat1Criteria,
      },
      {
        label: "Stat 2",
        criteria: config.stat2Criteria,
      },
    ],
    [config.stat1Criteria, config.stat2Criteria],
  );

  const isAwaitingDecision =
    !automationRunning &&
    automationStatus.includes("Target found! Awaiting decision");

  const effectiveStatus = automationRunning
    ? automationStatus || "🔍 Analyzing stats..."
    : automationStatus || "⏸️ Ready to start";

  return (
    <div className="fm-awaken-tab">
      <div className="fm-awaken-top-actions">
        {automationRunning ? (
          <Button block danger size="small" onClick={onStop}>
            Stop Automation
          </Button>
        ) : (
          <Tooltip
            title={
              !config.scanRegion
                ? "Capture a region first"
                : !config.stat1Criteria.length && !config.stat2Criteria.length
                  ? "Add at least one stat condition"
                  : ""
            }
          >
            <Button
              block
              type="primary"
              size="small"
              disabled={!canStart}
              onClick={() => {
                setShowActivityView(true);
                onStart();
              }}
            >
              Start Automation
            </Button>
          </Tooltip>
        )}

        {showActivityView && !automationRunning && (
          <Button
            size="small"
            onClick={() => {
              setShowActivityView(false);
            }}
          >
            Reconfigure
          </Button>
        )}
      </div>

      <div className="fm-awaken-view-viewport">
        <div
          className={`fm-awaken-view-slider${showActivityView ? " fm-awaken-view-slider-activity" : ""}`}
        >
          <div className="fm-awaken-view-pane">
            <Form layout="vertical" style={{ padding: "12px 16px 0" }}>
              <Form.Item label="Blessing Window Region">
                <Space direction="vertical" size={4} style={{ width: "100%" }}>
                  <Space wrap>
                    <Button
                      size="small"
                      icon={<AimOutlined />}
                      onClick={
                        automationRegionCaptureActive
                          ? onCancelCapture
                          : onStartCapture
                      }
                    >
                      {automationRegionCaptureActive
                        ? "Cancel Capture"
                        : config.scanRegion
                          ? "Recapture"
                          : "Capture Region"}
                    </Button>
                    {config.scanRegion && (
                      <Button
                        size="small"
                        icon={<ClearOutlined />}
                        onClick={onClearRegion}
                      >
                        Clear
                      </Button>
                    )}
                  </Space>
                  <Typography.Text
                    type="secondary"
                    style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
                  >
                    {automationRegionCaptureActive
                      ? "Drag over the Blessing of the Goddess/Demon window."
                      : formatRegionLabel(config.scanRegion)}
                  </Typography.Text>
                </Space>
              </Form.Item>

              <Form.Item label="Blessing Type">
                <Select
                  size="small"
                  value={config.blessingType}
                  getPopupContainer={getSelectPopupContainer}
                  dropdownStyle={SELECT_DROPDOWN_STYLE}
                  options={[
                    { value: "auto", label: "Auto-detect" },
                    { value: "goddess", label: "Blessing of the Goddess" },
                    { value: "demon", label: "Blessing of the Demon" },
                  ]}
                  onChange={(v: string) =>
                    setConfig((prev: AutoAwakenConfig) => ({
                      ...prev,
                      blessingType: v as AutoAwakenConfig["blessingType"],
                    }))
                  }
                />
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: 11, marginTop: 4, display: "block" }}
                >
                  Used to narrow down expected stat value ranges.
                </Typography.Text>
              </Form.Item>

              <Divider style={{ margin: "8px 0" }} />

              <Typography.Text
                type="secondary"
                style={{ display: "block", fontSize: 11, marginBottom: 8 }}
              >
                Configure the desired stats. Within each section the conditions
                use OR. Both sections together use AND. When only one section
                has conditions, the same stat found in both panels is summed
                (mixed stat names are not combined).
              </Typography.Text>

              <StatCriteriaSection
                section="stat1"
                label="Stat 1"
                criteria={config.stat1Criteria}
                otherCriteria={config.stat2Criteria}
                onChange={handleCriteriaChange}
              />

              <StatCriteriaSection
                section="stat2"
                label="Stat 2"
                criteria={config.stat2Criteria}
                otherCriteria={config.stat1Criteria}
                onChange={handleCriteriaChange}
              />
            </Form>
          </div>

          <div className="fm-awaken-view-pane fm-awaken-view-pane-activity">
            <div className="fm-awaken-activity-shell">
              <div className="fm-awaken-status">
                <Typography.Text strong style={{ fontSize: 12 }}>
                  {effectiveStatus}
                </Typography.Text>
              </div>

              <Divider style={{ margin: "8px 0" }} />

              <Space
                direction="vertical"
                size={6}
                style={{ width: "100%" }}
                className="fm-awaken-targets"
              >
                <Typography.Text strong style={{ fontSize: 12 }}>
                  Configured Targets
                </Typography.Text>
                {configuredStatRows.map((section) => (
                  <div key={section.label} className="fm-awaken-config-block">
                    <Typography.Text style={{ fontSize: 11 }} strong>
                      {section.label}
                    </Typography.Text>
                    {section.criteria.length === 0 ? (
                      <div className="fm-awaken-log-line">No conditions</div>
                    ) : (
                      section.criteria.map((criterion) => {
                        const stat = AWAKEN_STAT_BY_ID[criterion.statId];
                        const statLabel = stat?.label ?? criterion.statId;
                        const valueLabel = stat?.isPercent
                          ? `${criterion.statValue}%`
                          : `+${criterion.statValue}`;
                        return (
                          <div
                            key={criterion.id}
                            className="fm-awaken-log-line"
                          >
                            {`${statLabel}: ${valueLabel}`}
                          </div>
                        );
                      })
                    )}
                  </div>
                ))}
              </Space>

              <Divider style={{ margin: "8px 0" }} />

              <div className="fm-awaken-log-stack">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 6,
                    gap: 8,
                  }}
                >
                  <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => {
                      void copyActivityLogs();
                    }}
                  >
                    {copyLogsState === "copied"
                      ? "Copied"
                      : copyLogsState === "error"
                        ? "Copy failed"
                        : "Copy logs"}
                  </Button>
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    {activityLogs.length} lines
                  </Typography.Text>
                </div>

                {!shouldAutoScrollLog && activityLogs.length > 0 && (
                  <div className="fm-awaken-log-follow-state fm-awaken-log-paused-hint">
                    <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                      Auto-scroll paused
                    </Typography.Text>
                    <Button type="link" size="small" onClick={jumpToLatestLog}>
                      Jump to latest
                    </Button>
                  </div>
                )}

                <div
                  ref={logContainerRef}
                  className="fm-awaken-log"
                  onScroll={handleLogScroll}
                >
                  {activityLogs.map((line, i) => (
                    <div key={i} className="fm-awaken-log-line">
                      {line}
                    </div>
                  ))}
                </div>
              </div>

              {isAwaitingDecision && (
                <div style={{ marginTop: 8 }}>
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => {
                      setShowActivityView(true);
                      onStart("reawaken");
                    }}
                  >
                    Re-awaken
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
