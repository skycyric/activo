import { useMemo, useState } from "react";
import type { Goal, GoalKPI, DeptActivity, Strategy } from "../schemas/ogsm";
import { countStrategyWarnings } from "../utils/planWarnings";
import { computeGoalKpiResult } from "../utils/goalKpi";
import { computeKpiAchievement } from "../utils/kpiCalc";

interface Props {
  goal: Goal | null;
  allGoals?: Goal[];
  strategies: import("../schemas/ogsm").Strategy[];
  selectedStrategyId: string | null;
  onSelectStrategy: (id: string, warnFilter?: "overdue" | "warning") => void;
  onAddStrategy?: () => void;
  onUpdateGoal?: (g: Goal) => void;
  onDeleteGoal?: (id: string) => void;
  filterOwner: string;
  onFilterOwner: (v: string) => void;
  teams: import("../schemas/ogsm").Team[];
  warnDaysBefore: number;
  isReadOnly?: boolean;
  deptActivities?: DeptActivity[];
}

function isGKpi(gk: GoalKPI): boolean {
  return (
    gk.goalKpiType === "aggregate" || (gk.type ?? "value") === "pct_activity"
  );
}

function getKpiColor(rate: number | null): string {
  if (rate === null) return "#6b7280";
  if (rate >= 100) return "#10b981";
  if (rate >= 70) return "#6366f1";
  if (rate >= 40) return "#f59e0b";
  return "#ef4444";
}

function formatMetricValue(
  value: number | null,
  isRateMode: boolean,
  unit?: string,
): string {
  if (value === null) return "--";
  const formatted = Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (isRateMode) return `${formatted}%`;
  return unit ? `${formatted} ${unit}` : formatted;
}

function getActivityId(link: { activityId?: string }): string {
  return link.activityId || ((link as Record<string, string>).measureId ?? "");
}

function getStatusInfo(rate: number | null): {
  label: string;
  colorClass: string;
  color: string;
  bgTint: string;
} {
  if (rate === null)
    return {
      label: "未計算",
      colorClass: "none",
      color: "#94a3b8",
      bgTint: "#f8fafc",
    };
  if (rate >= 100)
    return {
      label: "達標",
      colorClass: "hit",
      color: "#10b981",
      bgTint: "#f0fdf4",
    };
  if (rate >= 70)
    return {
      label: "良好",
      colorClass: "good",
      color: "#6366f1",
      bgTint: "#f5f3ff",
    };
  if (rate >= 40)
    return {
      label: "注意",
      colorClass: "warn",
      color: "#f59e0b",
      bgTint: "#fffbeb",
    };
  return {
    label: "落後",
    colorClass: "behind",
    color: "#ef4444",
    bgTint: "#fef2f2",
  };
}

function getSubKpiSources(gk: GoalKPI, deptActivities: DeptActivity[]) {
  const groups = new Map<
    string,
    {
      activityId: string;
      activityName: string;
      items: Array<{
        kpiId: string;
        name: string;
        actual: number | null | undefined;
        target: number | null | undefined;
        unit?: string;
        rate: number | null;
      }>;
    }
  >();

  for (const link of gk.linkedKpis) {
    const activityId = getActivityId(link);
    if (!activityId) continue;
    const activity = deptActivities.find((item) => item.id === activityId);
    const kpi = activity?.kpis.find((item) => item.id === link.kpiId);
    const rate = kpi
      ? (computeKpiAchievement(kpi, activity?.kpis ?? []) ??
        kpi.achievementRate ??
        null)
      : null;
    if (!groups.has(activityId)) {
      groups.set(activityId, {
        activityId,
        activityName: activity?.rawText || "（未命名活動）",
        items: [],
      });
    }
    groups.get(activityId)!.items.push({
      kpiId: link.kpiId,
      name: kpi?.name || kpi?.label || "(未知 KPI)",
      actual: kpi?.actual,
      target: kpi?.target,
      unit: kpi?.unit,
      rate,
    });
  }

  return Array.from(groups.values());
}

function StrategyRow({
  s,
  index,
  selected,
  onClick,
  onSelectStrategy,
  warnDaysBefore,
}: {
  s: Strategy;
  index: number;
  selected: boolean;
  onClick: () => void;
  onSelectStrategy: (id: string, warnFilter?: "overdue" | "warning") => void;
  warnDaysBefore: number;
}) {
  const measuresTotal = s.measures.length;
  const measuresAchieved = s.measures.filter(
    (m) => m.status === "completed",
  ).length;
  const kpiCount = s.measures
    .flatMap((m) => m.kpis)
    .filter((k) => k.achievementRate !== null).length;
  const sBudget = s.measures.reduce((sum, m) => sum + (m.budget ?? 0), 0);
  const sDays = s.measures.reduce((sum, m) => sum + (m.personDays ?? 0), 0);
  const hasBudget = s.measures.some((m) => m.budget != null);
  const hasDays = s.measures.some((m) => m.personDays != null);
  const warnCounts = countStrategyWarnings(s, warnDaysBefore);

  return (
    <div
      className={`strategy-row ${selected ? "selected" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="strategy-row-left">
        <div className="strategy-row-main">
          <span className="strategy-s-label">S{index + 1}</span>
          <span className="strategy-row-title">{s.title}</span>
          <div className="strategy-row-meta">
            {s.owners.map((name) => (
              <span key={name} className="owner-chip">
                {name}
              </span>
            ))}
            {kpiCount > 0 && (
              <span className="meta-tag">🎯 {kpiCount} KPI</span>
            )}
            {measuresTotal > 0 && (
              <span className="meta-tag">
                ✅ {measuresAchieved}/{measuresTotal} M
              </span>
            )}
            {hasBudget && (
              <span className="meta-tag">💰 {sBudget.toLocaleString()}</span>
            )}
            {hasDays && <span className="meta-tag">⏱ {sDays} 人天</span>}
            {warnCounts.overdue > 0 && (
              <span
                className="meta-tag meta-warn-overdue"
                title="點擊查看逾期項目"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectStrategy(s.id, "overdue");
                }}
              >
                🔴 {warnCounts.overdue}
              </span>
            )}
            {warnCounts.warning > 0 && (
              <span
                className="meta-tag meta-warn-near"
                title="點擊查看即將到期項目"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectStrategy(s.id, "warning");
                }}
              >
                ⚠️ {warnCounts.warning}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StrategyList({
  goal,
  allGoals = [],
  strategies,
  selectedStrategyId,
  onSelectStrategy,
  warnDaysBefore,
  deptActivities = [],
}: Props) {
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(
    null,
  );

  const previewGoals = useMemo(
    () => (goal ? (allGoals.length > 0 ? allGoals : [goal]) : []),
    [allGoals, goal],
  );
  const goalKpiPreviews = useMemo(() => {
    if (!goal) return [];
    const goalKpis = goal.goalKpis ?? [];
    return goalKpis.map((gk) => ({
      gk,
      result: computeGoalKpiResult(gk, goal, deptActivities, previewGoals),
    }));
  }, [goal, deptActivities, previewGoals]);

  if (!goal) {
    return (
      <div className="strategy-list strategy-list-empty">
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h2>目前沒有任何策略</h2>
          <p>請在左側選擇一個目標（如 G1、G2、G3）以查看策略</p>
        </div>
      </div>
    );
  }

  const renderScorecardCard = (gk: GoalKPI) => {
    const {
      actual,
      target,
      rate,
      isRateMode,
      metCount,
      totalCount,
      activities,
    } =
      goalKpiPreviews.find((item) => item.gk.id === gk.id)?.result ??
      computeGoalKpiResult(gk, goal, deptActivities, previewGoals);
    const gkType = gk.type ?? "value";
    const isAgg = gk.goalKpiType === "aggregate";
    const isPct = gkType === "pct_activity";
    const isGKpiCard = isAgg || isPct; // G-KPI（目標成效指標）

    // G-KPI 狀態色以 rate 判斷（aggregate: rate=actual；pct_activity: rate=actual/target*100）
    // G-sub-KPI 狀態色同樣以 rate 判斷
    const status = getStatusInfo(rate);
    const isExpanded = expandedPreviewId === gk.id;
    const subSources = !isGKpiCard ? getSubKpiSources(gk, deptActivities) : [];

    // ── 主角數字決定 ──
    // pct_activity：大字 = "N/M"（幾個活動達標），副字 = "活動達標"，footer = 達標率% / 目標%
    // aggregate：大字 = actual%（加權平均達成率），footer = "來源 N 項加權平均"
    // G-sub-KPI：大字 = rate%（真正的達成率），footer = 實際 X / 目標 Y

    let bigNumber: string;
    let bigUnit: string | null = null;
    let footerLine: string | null = null;

    if (isPct) {
      bigNumber = metCount !== null ? `${metCount}/${totalCount}` : "--";
      bigUnit = "活動達標";
      footerLine =
        actual !== null ? `達標率 ${actual}% ／ 目標 ${target ?? "--"}%` : null;
    } else if (isAgg) {
      bigNumber = actual !== null ? `${actual}%` : "--";
      footerLine =
        totalCount > 0 ? `來源 ${totalCount} 項加權平均` : "尚未連結來源";
    } else {
      // G-sub-KPI：rate% 才是達成率
      bigNumber = rate !== null ? `${rate}%` : "--";
      footerLine = `實際 ${formatMetricValue(actual, isRateMode, gk.unit)} ／ 目標 ${formatMetricValue(target, isRateMode, gk.unit)}`;
    }

    // 進度條寬度：pct_activity 用 actual/target（達標率百分比），其餘用 rate
    const barPct = isPct
      ? actual !== null && target
        ? Math.min((actual / target) * 100, 100)
        : 0
      : Math.min(rate ?? 0, 100);

    const hasExpandable =
      (isPct &&
        (gk.thresholdGoalKpiIds ?? []).length > 0 &&
        activities.length > 0) ||
      (!isGKpiCard && subSources.length > 0);

    return (
      <div
        key={gk.id}
        className={`kpi-sc-card kpi-sc-card--${status.colorClass}${isExpanded ? " kpi-sc-card--expanded" : ""}`}
        style={{ borderLeftColor: status.color, background: status.bgTint }}
      >
        {/* 頂部：名稱 + 狀態 badge */}
        <div className="kpi-sc-top">
          <span className="kpi-sc-name">
            {gk.isHeadline && <span className="kpi-sc-star">★ </span>}
            {gk.label}
          </span>
          <span
            className={`kpi-sc-status kpi-sc-status--${status.colorClass}`}
            style={{ color: status.color }}
          >
            {status.label}
          </span>
        </div>

        {/* 主角數字 */}
        <div className="kpi-sc-rate-row">
          <span className="kpi-sc-rate" style={{ color: status.color }}>
            {bigNumber}
          </span>
          {bigUnit && (
            <span className="kpi-sc-pct-sub">
              <span className="kpi-sc-pct-unit">{bigUnit}</span>
            </span>
          )}
        </div>

        {/* 進度條 */}
        <div className="kpi-sc-bar-wrap">
          <div
            className="kpi-sc-bar-fill"
            style={{ width: `${barPct}%`, background: status.color }}
          />
        </div>

        {/* 補充說明小字 */}
        {footerLine && <div className="kpi-sc-footer">{footerLine}</div>}

        {/* 展開按鈕 */}
        {hasExpandable && (
          <>
            <button
              className="kpi-sc-toggle"
              onClick={() =>
                setExpandedPreviewId((cur) => (cur === gk.id ? null : gk.id))
              }
            >
              {isPct
                ? isExpanded
                  ? "▲ 收合活動明細"
                  : "▶ 展開活動明細"
                : isExpanded
                  ? "▲ 收合來源明細"
                  : "▶ 展開來源明細"}
            </button>
            {isExpanded && isPct && (
              <div className="g-kpi-activity-list">
                {activities.map((a) => (
                  <div
                    key={a.measureId}
                    className={`g-kpi-activity-row ${a.met ? "met" : "unmet"}`}
                  >
                    <span className="g-kpi-activity-icon">
                      {a.met ? "✅" : "❌"}
                    </span>
                    <span className="g-kpi-activity-text">
                      {(a.measureRawText || "").substring(0, 28)}
                    </span>
                    {a.isConflict && (
                      <span className="g-pct-src-badge">
                        {a.chosenSrcLabel}
                      </span>
                    )}
                    <span className="g-kpi-activity-detail">
                      {a.displayRate !== null
                        ? `${a.displayRate.toFixed(1)}%`
                        : "--"}
                      {" / 目標 "}
                      {a.chosenTarget !== null ? a.chosenTarget : "--"}%
                    </span>
                  </div>
                ))}
              </div>
            )}
            {isExpanded && !isPct && subSources.length > 0 && (
              <div className="g-subkpi-source-list">
                {subSources.map((group) => (
                  <div key={group.activityId} className="g-subkpi-source-group">
                    <div className="g-subkpi-source-title">
                      {group.activityName}
                    </div>
                    <div className="g-subkpi-source-items">
                      {group.items.map((item) => (
                        <div
                          key={`${group.activityId}-${item.kpiId}`}
                          className="g-subkpi-source-item"
                        >
                          <span className="g-subkpi-source-name">
                            {item.name}
                          </span>
                          <span className="g-subkpi-source-metric">
                            {formatMetricValue(
                              item.actual ?? null,
                              false,
                              item.unit,
                            )}
                            <span className="g-kpi-val-sep">/</span>
                            {formatMetricValue(
                              item.target ?? null,
                              false,
                              item.unit,
                            )}
                          </span>
                          <span
                            className="g-subkpi-source-rate"
                            style={{ color: getKpiColor(item.rate) }}
                          >
                            {item.rate !== null ? `${item.rate}%` : "--"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="strategy-list">
      <div className="goal-header">
        <div className="goal-header-top">
          <span className="goal-label-badge">{goal.label}</span>
          <h1 className="goal-header-title">
            {goal.title || (
              <span style={{ color: "#6b7280", fontStyle: "italic" }}>
                （尚未輸入標題）
              </span>
            )}
          </h1>
        </div>

        {!selectedStrategyId &&
          (() => {
            const gKpiList = goalKpiPreviews.filter(({ gk }) => isGKpi(gk));
            const subGKpiList = goalKpiPreviews.filter(({ gk }) => !isGKpi(gk));
            return (
              <>
                {gKpiList.length > 0 && (
                  <div className="kpi-scorecard-section kpi-scorecard-section--primary">
                    <div className="kpi-scorecard-header">
                      <div className="kpi-scorecard-header-left">
                        <span className="kpi-sc-section-chip kpi-sc-section-chip--gkpi">
                          G-KPI
                        </span>
                        <span className="kpi-scorecard-title">
                          目標成效指標
                        </span>
                        <span className="kpi-scorecard-subtitle">
                          目標是否達成的結論性數字
                        </span>
                      </div>
                      <span className="kpi-scorecard-stat">
                        {
                          gKpiList.filter(
                            ({ result }) => (result.rate ?? 0) >= 100,
                          ).length
                        }
                        <span className="kpi-scorecard-stat-sep">/</span>
                        {gKpiList.length}
                        <span className="kpi-scorecard-stat-label"> 達標</span>
                      </span>
                    </div>
                    <div className="kpi-scorecard-grid">
                      {gKpiList.map(({ gk }) => renderScorecardCard(gk))}
                    </div>
                  </div>
                )}

                {subGKpiList.length > 0 && (
                  <div className="kpi-scorecard-section kpi-scorecard-section--sub">
                    <div className="kpi-scorecard-header kpi-scorecard-header--sub">
                      <div className="kpi-scorecard-header-left">
                        <span className="kpi-sc-section-chip kpi-sc-section-chip--sub">
                          G-sub-KPI
                        </span>
                        <span className="kpi-scorecard-title">
                          活動執行指標
                        </span>
                        <span className="kpi-scorecard-subtitle">
                          連結各活動 M-KPI，匯入上方 G-KPI
                        </span>
                      </div>
                      <span className="kpi-scorecard-stat">
                        {
                          subGKpiList.filter(
                            ({ result }) => (result.rate ?? 0) >= 100,
                          ).length
                        }
                        <span className="kpi-scorecard-stat-sep">/</span>
                        {subGKpiList.length}
                        <span className="kpi-scorecard-stat-label"> 達標</span>
                      </span>
                    </div>
                    <div className="kpi-scorecard-grid kpi-scorecard-grid--sub">
                      {subGKpiList.map(({ gk }) => renderScorecardCard(gk))}
                    </div>
                  </div>
                )}

                {gKpiList.length === 0 && subGKpiList.length > 0 && null}
              </>
            );
          })()}

        {selectedStrategyId && strategies.length > 0 && (
          <div className="strategy-rows">
            {strategies.map((s, i) => (
              <StrategyRow
                key={s.id}
                s={s}
                index={i}
                selected={s.id === selectedStrategyId}
                onClick={() => onSelectStrategy(s.id)}
                onSelectStrategy={onSelectStrategy}
                warnDaysBefore={warnDaysBefore}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
