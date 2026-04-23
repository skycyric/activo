import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DeptActivity,
  KPI,
  PlanItem,
  Strategy,
  Team,
} from "../schemas/ogsm";
import { computeKpiAchievement } from "../utils/kpiCalc";
import { countPlanWarnings, getPlanItemWarning } from "../utils/planWarnings";

interface Props {
  strategy: Strategy;
  onClose: () => void;
  onUpdate: (s: Strategy) => void;
  onDelete: () => void;
  teams: Team[];
  warnDaysBefore: number;
  onUpdateWarnDaysBefore: (n: number) => void;
  initialTab?: "measure" | "plans" | "notes";
  initialWarnFilter?: "overdue" | "warning" | null;
  initialMeasureId?: string;
  isReadOnly?: boolean;
  linkedDeptActivities?: DeptActivity[];
  onToggleExcludeFromOgsm?: (
    activityId: string,
    exclude: boolean,
    strategyId: string,
  ) => void;
  onNavigateToActivityPage?: () => void;
  onOpenActivityDetail?: (activityId: string) => void;
  expandedActivityId?: string | null;
  onExpandedActivityChange?: (activityId: string | null) => void;
}

type StatusKey = "not-started" | "attention" | "in-progress" | "completed";

interface ActivityKpiDetail {
  id: string;
  label: string;
  actual?: number | null;
  target?: number | null;
  unit?: string;
  rate: number | null;
}

interface ActivityAlertDetail {
  id: string;
  description: string;
  warnType: "overdue" | "warning";
  plannedEndDate: string;
}

interface TrackedActivity {
  id: string;
  name: string;
  owner: string;
  status?: StatusKey;
  startDate?: string;
  endDate?: string;
  updatedAt?: string;
  nextDueDate?: string;
  achievedKpis: number;
  totalKpis: number;
  kpiProgressPct: number;
  completedPlans: number;
  totalPlans: number;
  planProgressPct: number;
  warnings: { overdue: number; warning: number };
  kpiDetails: ActivityKpiDetail[];
  alertItems: ActivityAlertDetail[];
  isExcluded: boolean;
}

const LS_WIDTH_KEY = "ogsm_panel_width";
const DEFAULT_WIDTH = 520;
const MIN_WIDTH = 360;
const MAX_WIDTH = 920;

function loadWidth() {
  if (typeof window === "undefined") return DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(LS_WIDTH_KEY);
  const parsed = raw ? Number(raw) : DEFAULT_WIDTH;
  return Number.isFinite(parsed)
    ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, parsed))
    : DEFAULT_WIDTH;
}

function saveWidth(width: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_WIDTH_KEY, String(width));
}

function flattenPlanItems(activity: DeptActivity): PlanItem[] {
  if (activity.planItems?.length) return activity.planItems;
  return activity.actionPlans?.flatMap((plan) => plan.items ?? []) ?? [];
}

function getStatusMeta(status?: StatusKey) {
  switch (status) {
    case "completed":
      return {
        label: "已完成",
        color: "#047857",
        background: "#d1fae5",
        border: "#6ee7b7",
      };
    case "in-progress":
      return {
        label: "進行中",
        color: "#1d4ed8",
        background: "#dbeafe",
        border: "#93c5fd",
      };
    case "attention":
      return {
        label: "需注意",
        color: "#b45309",
        background: "#fef3c7",
        border: "#fcd34d",
      };
    default:
      return {
        label: "未開始",
        color: "#475569",
        background: "#e2e8f0",
        border: "#cbd5e1",
      };
  }
}

function formatDateRange(startDate?: string, endDate?: string) {
  if (startDate && endDate) return `${startDate} - ${endDate}`;
  if (startDate) return `${startDate} 起`;
  if (endDate) return `至 ${endDate}`;
  return "未設定期間";
}

function getKpiAchievementRate(kpi: KPI, siblingKpis: KPI[]) {
  return computeKpiAchievement(kpi, siblingKpis);
}

function getNextDueDate(planItems: PlanItem[]): string | undefined {
  const dueDates = planItems
    .filter((item) => !item.completed && !!item.plannedEndDate)
    .map((item) => item.plannedEndDate as string)
    .sort((a, b) => a.localeCompare(b));
  return dueDates[0];
}

function formatUpdatedDate(updatedAt?: string): string {
  if (!updatedAt) return "未記錄更新";
  return updatedAt.slice(0, 10);
}

function getActivityPriorityScore(activity: TrackedActivity): number {
  const overdueScore = activity.warnings.overdue * 100;
  const warningScore = activity.warnings.warning * 10;
  const statusScore = activity.status === "completed" ? 0 : 1;
  return overdueScore + warningScore + statusScore;
}

export default function DetailPanel({
  strategy,
  onClose,
  warnDaysBefore,
  initialWarnFilter,
  linkedDeptActivities,
  onNavigateToActivityPage,
  onOpenActivityDetail,
  expandedActivityId,
  onExpandedActivityChange,
}: Props) {
  const [panelWidth, setPanelWidth] = useState(loadWidth);
  const [activeWarnFilter, setActiveWarnFilter] = useState<
    "overdue" | "warning" | null
  >(initialWarnFilter ?? null);
  const [internalExpandedActivityId, setInternalExpandedActivityId] = useState<
    string | null
  >(null);
  const dragCtrlRef = useRef<AbortController | null>(null);
  const activitySectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => saveWidth(panelWidth), [panelWidth]);

  useEffect(
    () => () => {
      dragCtrlRef.current?.abort();
    },
    [],
  );

  // Derived state: sync warn filter from prop; reset when strategy changes.
  // Using render-phase setState (React "getDerivedStateFromProps" pattern) to
  // avoid a cascading setState-in-effect render cycle.
  const [warnFilterSyncKey, setWarnFilterSyncKey] = useState(
    `${strategy.id}:${initialWarnFilter ?? ""}`,
  );
  const currentWarnFilterSyncKey = `${strategy.id}:${initialWarnFilter ?? ""}`;
  if (warnFilterSyncKey !== currentWarnFilterSyncKey) {
    setWarnFilterSyncKey(currentWarnFilterSyncKey);
    setActiveWarnFilter(initialWarnFilter ?? null);
  }

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragCtrlRef.current?.abort();
      const controller = new AbortController();
      dragCtrlRef.current = controller;

      const handleMove = (moveEvent: MouseEvent) => {
        const nextWidth = window.innerWidth - moveEvent.clientX;
        setPanelWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, nextWidth)));
      };

      const handleUp = () => {
        controller.abort();
        dragCtrlRef.current = null;
      };

      window.addEventListener("mousemove", handleMove, {
        signal: controller.signal,
      });
      window.addEventListener("mouseup", handleUp, {
        once: true,
        signal: controller.signal,
      });
    },
    [],
  );

  const effectiveExpandedActivityId =
    expandedActivityId ?? internalExpandedActivityId;

  const setExpandedActivity = useCallback(
    (activityId: string | null) => {
      if (onExpandedActivityChange) {
        onExpandedActivityChange(activityId);
        return;
      }
      setInternalExpandedActivityId(activityId);
    },
    [onExpandedActivityChange],
  );

  // Derived state: reset expansion when strategy changes (uncontrolled mode only).
  const [prevStrategyId, setPrevStrategyId] = useState<string | undefined>(
    strategy?.id,
  );
  if (prevStrategyId !== strategy?.id) {
    setPrevStrategyId(strategy?.id);
    if (expandedActivityId === undefined) {
      setInternalExpandedActivityId(null);
    }
  }

  const trackedActivities = useMemo<TrackedActivity[]>(() => {
    if (linkedDeptActivities?.length) {
      return linkedDeptActivities.map((activity) => {
        const planItems = flattenPlanItems(activity);
        const activityWarnDays = Math.max(0, activity.warnDaysBefore ?? 3);
        const kpis = activity.kpis ?? [];
        const achievedKpis = kpis.filter(
          (kpi) => (getKpiAchievementRate(kpi, kpis) ?? 0) >= 100,
        ).length;
        const completedPlans = planItems.filter(
          (item) => item.completed,
        ).length;
        const warnings = countPlanWarnings(planItems, activityWarnDays);
        const kpiDetails = kpis.map((kpi) => ({
          id: kpi.id,
          label: kpi.name || kpi.label || "(未命名 KPI)",
          actual: kpi.actual,
          target: kpi.target,
          unit: kpi.unit,
          rate: getKpiAchievementRate(kpi, kpis),
        }));
        const alertItems = planItems
          .map((item) => ({
            id: item.id,
            description: item.description || "(未命名項目)",
            warnType: getPlanItemWarning(item, activityWarnDays),
            plannedEndDate: item.plannedEndDate ?? "",
          }))
          .filter(
            (item): item is ActivityAlertDetail =>
              item.warnType === "overdue" || item.warnType === "warning",
          );
        const isExcluded =
          activity.dashboardLinks?.find(
            (link) => link.type === "ogsm" && link.strategyId === strategy.id,
          )?.exclude ?? false;

        return {
          id: activity.id,
          name: activity.rawText || "(未命名活動)",
          owner: activity.owner ?? "",
          status: activity.status,
          startDate: activity.startDate,
          endDate: activity.endDate,
          updatedAt: activity.updatedAt,
          nextDueDate: getNextDueDate(planItems),
          achievedKpis,
          totalKpis: kpis.length,
          kpiProgressPct:
            kpis.length > 0
              ? Math.round((achievedKpis / kpis.length) * 100)
              : 0,
          completedPlans,
          totalPlans: planItems.length,
          planProgressPct:
            planItems.length > 0
              ? Math.round((completedPlans / planItems.length) * 100)
              : 0,
          warnings,
          kpiDetails,
          alertItems,
          isExcluded,
        };
      });
    }

    return strategy.measures.map((measure) => {
      const planItems = strategy.actionPlans
        .flatMap((plan) => plan.items)
        .filter((item) => item.linkedMeasureId === measure.id);
      const kpis = measure.kpis ?? [];
      const achievedKpis = kpis.filter(
        (kpi) => (getKpiAchievementRate(kpi, kpis) ?? 0) >= 100,
      ).length;
      const completedPlans = planItems.filter((item) => item.completed).length;
      const warnings = countPlanWarnings(planItems, warnDaysBefore);
      const kpiDetails = kpis.map((kpi) => ({
        id: kpi.id,
        label: kpi.name || kpi.label || "(未命名 KPI)",
        actual: kpi.actual,
        target: kpi.target,
        unit: kpi.unit,
        rate: getKpiAchievementRate(kpi, kpis),
      }));
      const alertItems = planItems
        .map((item) => ({
          id: item.id,
          description: item.description || "(未命名項目)",
          warnType: getPlanItemWarning(item, warnDaysBefore),
          plannedEndDate: item.plannedEndDate ?? "",
        }))
        .filter(
          (item): item is ActivityAlertDetail =>
            item.warnType === "overdue" || item.warnType === "warning",
        );

      return {
        id: measure.id,
        name: measure.rawText || "(未命名活動)",
        owner: measure.owner ?? "",
        status: measure.status,
        startDate: measure.startDate,
        endDate: measure.endDate,
        updatedAt: undefined,
        nextDueDate: getNextDueDate(planItems),
        achievedKpis,
        totalKpis: kpis.length,
        kpiProgressPct:
          kpis.length > 0 ? Math.round((achievedKpis / kpis.length) * 100) : 0,
        completedPlans,
        totalPlans: planItems.length,
        planProgressPct:
          planItems.length > 0
            ? Math.round((completedPlans / planItems.length) * 100)
            : 0,
        warnings,
        kpiDetails,
        alertItems,
        isExcluded: false,
      };
    });
  }, [linkedDeptActivities, strategy, warnDaysBefore]);

  const summary = useMemo(() => {
    const activityCount = trackedActivities.length;
    const totalKpis = trackedActivities.reduce(
      (sum, activity) => sum + activity.totalKpis,
      0,
    );
    const achievedKpis = trackedActivities.reduce(
      (sum, activity) => sum + activity.achievedKpis,
      0,
    );
    const totalPlans = trackedActivities.reduce(
      (sum, activity) => sum + activity.totalPlans,
      0,
    );
    const completedPlans = trackedActivities.reduce(
      (sum, activity) => sum + activity.completedPlans,
      0,
    );
    const overduePlans = trackedActivities.reduce(
      (sum, activity) => sum + activity.warnings.overdue,
      0,
    );
    const warningPlans = trackedActivities.reduce(
      (sum, activity) => sum + activity.warnings.warning,
      0,
    );
    const statusSummary = trackedActivities.reduce(
      (acc, activity) => {
        const status = activity.status ?? "not-started";
        acc[status] += 1;
        return acc;
      },
      {
        "not-started": 0,
        attention: 0,
        "in-progress": 0,
        completed: 0,
      } as Record<StatusKey, number>,
    );

    return {
      activityCount,
      totalKpis,
      achievedKpis,
      totalPlans,
      completedPlans,
      overduePlans,
      warningPlans,
      statusSummary,
      kpiRate:
        totalKpis > 0 ? Math.round((achievedKpis / totalKpis) * 100) : null,
      planRate:
        totalPlans > 0 ? Math.round((completedPlans / totalPlans) * 100) : null,
    };
  }, [trackedActivities]);

  const displayActivities = useMemo(() => {
    return [...trackedActivities].sort((a, b) => {
      const scoreDiff =
        getActivityPriorityScore(b) - getActivityPriorityScore(a);
      if (scoreDiff !== 0) return scoreDiff;

      const aDue = a.nextDueDate ?? "9999-12-31";
      const bDue = b.nextDueDate ?? "9999-12-31";
      return aDue.localeCompare(bDue);
    });
  }, [trackedActivities]);

  const filteredActivities = useMemo(() => {
    if (!activeWarnFilter) return displayActivities;
    return displayActivities.filter((activity) =>
      activeWarnFilter === "overdue"
        ? activity.warnings.overdue > 0
        : activity.warnings.warning > 0,
    );
  }, [activeWarnFilter, displayActivities]);

  useEffect(() => {
    if (!activeWarnFilter) return;
    const targetActivity = filteredActivities[0];
    activitySectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    if (!targetActivity) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setExpandedActivity(targetActivity.id);
    // filteredActivities and setExpandedActivity are intentionally the only
    // reactive deps; effectiveExpandedActivityId must NOT be included here —
    // adding it would cause the effect to fire on every manual expansion and
    // force the view back to the first filtered activity, preventing the user
    // from opening any other card while a filter is active.
  }, [activeWarnFilter, filteredActivities, setExpandedActivity]);

  return (
    <aside
      className="detail-panel detail-panel-dashboard"
      style={{ width: panelWidth }}
      data-tour="ogsm-strategy-detail"
    >
      <div className="panel-resizer" onMouseDown={handleMouseDown} />

      <div className="detail-header detail-header-dashboard">
        <div className="detail-header-toprow">
          <div className="detail-dashboard-title-wrap">
            <div className="detail-dashboard-label">策略活動儀表板</div>
            <div className="detail-dashboard-title" title={strategy.title}>
              {strategy.title || "（未命名策略）"}
            </div>
          </div>
          <button className="detail-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {strategy.owners.length > 0 && (
          <div className="detail-meta detail-dashboard-owners">
            {strategy.owners.map((owner) => (
              <span key={owner} className="owner-chip">
                {owner}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="detail-body detail-body-dashboard">
        <section className="detail-dashboard-summary">
          <div className="detail-dashboard-summary-grid">
            <article className="detail-summary-card">
              <span className="detail-summary-label">活動數</span>
              <strong className="detail-summary-value">
                {summary.activityCount}
              </strong>
              <span className="detail-summary-sub">此策略底下的追蹤活動</span>
            </article>
            <article className="detail-summary-card">
              <span className="detail-summary-label">KPI 達成狀況</span>
              <strong className="detail-summary-value">
                {summary.totalKpis > 0
                  ? `${summary.achievedKpis}/${summary.totalKpis}`
                  : "—"}
              </strong>
              <span className="detail-summary-sub">
                {summary.kpiRate !== null
                  ? `達成率 ${summary.kpiRate}%`
                  : "尚無 KPI"}
              </span>
            </article>
            <article className="detail-summary-card">
              <span className="detail-summary-label">行動計畫</span>
              <strong className="detail-summary-value">
                {summary.totalPlans > 0
                  ? `${summary.completedPlans}/${summary.totalPlans}`
                  : "—"}
              </strong>
              <span className="detail-summary-sub">
                {summary.planRate !== null
                  ? `完成率 ${summary.planRate}%`
                  : "尚無行動項目"}
              </span>
            </article>
            <article className="detail-summary-card detail-summary-card-alert">
              <span className="detail-summary-label">警示</span>
              <strong className="detail-summary-value">
                {summary.overduePlans + summary.warningPlans}
              </strong>
              <span className="detail-summary-sub">
                🔴 {summary.overduePlans} / ⚠️ {summary.warningPlans}
              </span>
            </article>
          </div>

          <div className="detail-dashboard-status-row">
            {[
              { key: "not-started", label: "未開始" },
              { key: "attention", label: "需注意" },
              { key: "in-progress", label: "進行中" },
              { key: "completed", label: "已完成" },
            ].map(({ key, label }) => (
              <div key={key} className="detail-status-pill">
                <span className="detail-status-pill-label">{label}</span>
                <strong className="detail-status-pill-value">
                  {summary.statusSummary[key as StatusKey]}
                </strong>
              </div>
            ))}
          </div>
        </section>

        <section
          ref={activitySectionRef}
          className="detail-dashboard-activity-section"
          data-tour="ogsm-linked-activity-dashboard"
        >
          <div className="detail-dashboard-section-head">
            <div>
              <div className="detail-dashboard-section-title">活動清單</div>
              <div className="detail-dashboard-section-subtitle">
                先看摘要數據，展開後查看該活動的進行狀況；若要修改，請使用明確的編輯按鈕
              </div>
              <div className="detail-dashboard-filter-row">
                <button
                  className={`detail-dashboard-filter-btn${activeWarnFilter === null ? " active" : ""}`}
                  onClick={() => setActiveWarnFilter(null)}
                >
                  全部 {displayActivities.length}
                </button>
                <button
                  className={`detail-dashboard-filter-btn overdue${activeWarnFilter === "overdue" ? " active" : ""}`}
                  onClick={() => setActiveWarnFilter("overdue")}
                >
                  🔴 逾期
                  {
                    displayActivities.filter(
                      (activity) => activity.warnings.overdue > 0,
                    ).length
                  }
                </button>
                <button
                  className={`detail-dashboard-filter-btn warning${activeWarnFilter === "warning" ? " active" : ""}`}
                  onClick={() => setActiveWarnFilter("warning")}
                >
                  ⚠️ 預警
                  {
                    displayActivities.filter(
                      (activity) => activity.warnings.warning > 0,
                    ).length
                  }
                </button>
              </div>
            </div>
            {onNavigateToActivityPage && (
              <button
                className="detail-dashboard-link-btn"
                onClick={onNavigateToActivityPage}
              >
                前往活動總覽 →
              </button>
            )}
          </div>

          {displayActivities.length === 0 ? (
            <div className="detail-dashboard-empty">
              尚無連結活動。請至活動總覽新增活動，並選擇此策略為連結目標。
            </div>
          ) : filteredActivities.length === 0 ? (
            <div className="detail-dashboard-empty">
              目前沒有符合{activeWarnFilter === "overdue" ? "逾期" : "預警"}
              條件的活動。
            </div>
          ) : (
            <div className="detail-dashboard-activity-list">
              {filteredActivities.map((activity) => {
                const status = getStatusMeta(activity.status);
                const isExpanded = effectiveExpandedActivityId === activity.id;

                return (
                  <article
                    key={activity.id}
                    className="detail-activity-row-card"
                  >
                    <div className="detail-activity-row-main">
                      <button
                        className="detail-activity-row-summary"
                        onClick={() =>
                          setExpandedActivity(isExpanded ? null : activity.id)
                        }
                      >
                        <div className="detail-activity-row-left">
                          <span
                            className="detail-activity-status"
                            style={{
                              color: status.color,
                              background: status.background,
                              borderColor: status.border,
                            }}
                          >
                            {status.label}
                          </span>
                          <div className="detail-activity-row-title-block">
                            <div className="detail-activity-card-title">
                              {activity.name}
                            </div>
                            <div className="detail-activity-row-sub">
                              主責：{activity.owner || "未指定"} ・{" "}
                              {formatDateRange(
                                activity.startDate,
                                activity.endDate,
                              )}
                            </div>
                            <div className="detail-activity-row-meta">
                              更新：{formatUpdatedDate(activity.updatedAt)}
                              {activity.nextDueDate
                                ? ` ・ 下一到期：${activity.nextDueDate}`
                                : " ・ 無待辦到期日"}
                            </div>
                          </div>
                        </div>
                        <div className="detail-activity-row-stats">
                          <span className="detail-activity-row-stat">
                            KPI{" "}
                            {activity.totalKpis > 0
                              ? `${activity.achievedKpis}/${activity.totalKpis}`
                              : "—"}
                          </span>
                          <span className="detail-activity-row-stat">
                            計畫{" "}
                            {activity.totalPlans > 0
                              ? `${activity.completedPlans}/${activity.totalPlans}`
                              : "—"}
                          </span>
                          <span className="detail-activity-row-stat detail-activity-row-alert">
                            警示{" "}
                            {activity.warnings.overdue +
                              activity.warnings.warning}
                          </span>
                          <span className="detail-activity-row-arrow">
                            {isExpanded ? "▲" : "▼"}
                          </span>
                        </div>
                      </button>

                      {(onOpenActivityDetail || onNavigateToActivityPage) && (
                        <button
                          className="detail-dashboard-link-btn detail-dashboard-link-btn-inline"
                          onClick={() => {
                            if (onOpenActivityDetail) {
                              onOpenActivityDetail(activity.id);
                              return;
                            }
                            onNavigateToActivityPage?.();
                          }}
                        >
                          編輯活動（前往活動總覽）
                        </button>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="detail-activity-row-detail">
                        <div className="detail-activity-detail-meta">
                          {activity.isExcluded ? (
                            <span className="detail-activity-ogsm detail-activity-ogsm-excluded">
                              已排除 OGSM
                            </span>
                          ) : (
                            <span className="detail-activity-ogsm">
                              計入 OGSM
                            </span>
                          )}
                          <span className="detail-activity-meta-item">
                            KPI 達成率 {activity.kpiProgressPct}%
                          </span>
                          <span className="detail-activity-meta-item">
                            行動計畫完成率 {activity.planProgressPct}%
                          </span>
                          {activity.nextDueDate && (
                            <span className="detail-activity-meta-item">
                              下一到期：{activity.nextDueDate}
                            </span>
                          )}
                        </div>

                        <div className="detail-activity-progress-stack">
                          <div className="detail-activity-progress-line">
                            <span className="detail-activity-progress-label">
                              KPI 進度
                            </span>
                            <div className="detail-activity-progress-bar">
                              <div
                                className="detail-activity-progress-fill kpi"
                                style={{
                                  width: `${Math.min(100, Math.max(0, activity.kpiProgressPct))}%`,
                                }}
                              />
                            </div>
                            <strong className="detail-activity-progress-value">
                              {activity.kpiProgressPct}%
                            </strong>
                          </div>
                          <div className="detail-activity-progress-line">
                            <span className="detail-activity-progress-label">
                              計畫進度
                            </span>
                            <div className="detail-activity-progress-bar">
                              <div
                                className="detail-activity-progress-fill plan"
                                style={{
                                  width: `${Math.min(100, Math.max(0, activity.planProgressPct))}%`,
                                }}
                              />
                            </div>
                            <strong className="detail-activity-progress-value">
                              {activity.planProgressPct}%
                            </strong>
                          </div>
                        </div>

                        <div className="detail-activity-detail-grid">
                          <div className="detail-activity-detail-block">
                            <div className="detail-activity-detail-title">
                              KPI 進行狀況
                            </div>
                            {activity.kpiDetails.length === 0 ? (
                              <div className="detail-activity-detail-empty">
                                尚無 KPI
                              </div>
                            ) : (
                              <div className="detail-activity-kpi-list">
                                {activity.kpiDetails.map((kpi) => (
                                  <div
                                    key={kpi.id}
                                    className="detail-activity-kpi-item"
                                  >
                                    <span className="detail-activity-kpi-name">
                                      {kpi.label}
                                    </span>
                                    <span className="detail-activity-kpi-metric">
                                      {kpi.actual ?? "—"}/{kpi.target ?? "—"}
                                      {kpi.unit ? ` ${kpi.unit}` : ""}
                                    </span>
                                    <span
                                      className="detail-activity-kpi-rate"
                                      style={{
                                        color:
                                          kpi.rate !== null && kpi.rate >= 100
                                            ? "#059669"
                                            : kpi.rate !== null &&
                                                kpi.rate >= 70
                                              ? "#6366f1"
                                              : kpi.rate !== null &&
                                                  kpi.rate >= 40
                                                ? "#d97706"
                                                : "#6b7280",
                                      }}
                                    >
                                      {kpi.rate !== null
                                        ? `${Math.round(kpi.rate)}%`
                                        : "—"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="detail-activity-detail-block">
                            <div className="detail-activity-detail-title">
                              行動計畫進行狀況
                            </div>
                            {activity.totalPlans === 0 ? (
                              <div className="detail-activity-detail-empty">
                                尚無行動項目
                              </div>
                            ) : (
                              <>
                                <div className="detail-activity-plan-summary">
                                  完成 {activity.completedPlans}/
                                  {activity.totalPlans} ・ 🔴{" "}
                                  {activity.warnings.overdue} ・ ⚠️{" "}
                                  {activity.warnings.warning}
                                </div>
                                {activity.alertItems.length > 0 ? (
                                  <div className="detail-activity-alert-list">
                                    {activity.alertItems
                                      .slice(0, 4)
                                      .map((item) => (
                                        <div
                                          key={item.id}
                                          className="detail-activity-alert-item"
                                        >
                                          <span
                                            className={`detail-activity-alert-badge ${item.warnType === "overdue" ? "overdue" : "warning"}`}
                                          >
                                            {item.warnType === "overdue"
                                              ? "逾期"
                                              : "預警"}
                                          </span>
                                          <span className="detail-activity-alert-text">
                                            {item.description}
                                          </span>
                                          {item.plannedEndDate && (
                                            <span className="detail-activity-alert-date">
                                              {item.plannedEndDate}
                                            </span>
                                          )}
                                        </div>
                                      ))}
                                  </div>
                                ) : (
                                  <div className="detail-activity-detail-empty">
                                    目前沒有逾期或預警項目
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </aside>
  );
}
