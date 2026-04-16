import { useMemo, useState } from "react";
import type {
  Goal,
  GoalKPI,
  Strategy,
  Team,
  DeptActivity,
} from "../schemas/ogsm";
import { countStrategyWarnings } from "../utils/planWarnings";
import { computeGoalKpiResult } from "../utils/goalKpi";
import { computeKpiAchievement } from "../utils/kpiCalc";

interface Props {
  goal: Goal | null;
  allGoals?: Goal[];
  strategies: Strategy[];
  selectedStrategyId: string | null;
  onSelectStrategy: (id: string, warnFilter?: "overdue" | "warning") => void;
  onAddStrategy?: () => void;
  onUpdateGoal?: (g: Goal) => void;
  onDeleteGoal?: (id: string) => void;
  filterOwner: string;
  onFilterOwner: (v: string) => void;
  teams: Team[];
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

function getGoalKpiMeta(gk: GoalKPI): string {
  const gkType = gk.type ?? "value";
  if (gk.goalKpiType === "aggregate") {
    return `aggregate | 來源 ${(gk.linkedGoalKpis ?? []).length}`;
  }
  if (gkType === "pct_activity") {
    return `pct_activity | 門檻 ${(gk.thresholdGoalKpiIds ?? []).length}`;
  }
  if (gkType === "progress") {
    return `progress | 連結 ${gk.linkedKpis.length}`;
  }
  return `${gk.aggregation} | 連結 ${gk.linkedKpis.length}`;
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
  filterOwner,
  onFilterOwner,
  teams,
  warnDaysBefore,
  deptActivities = [],
}: Props) {
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(
    null,
  );

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

  const goalKpis = goal.goalKpis ?? [];
  const previewGoals = allGoals.length > 0 ? allGoals : [goal];
  const goalKpiPreviews = useMemo(
    () =>
      goalKpis.map((gk) => ({
        gk,
        result: computeGoalKpiResult(gk, goal, deptActivities, previewGoals),
      })),
    [goalKpis, goal, deptActivities, previewGoals],
  );

  const gKpiPreviews = goalKpiPreviews.filter(({ gk }) => isGKpi(gk));
  const subGKpiPreviews = goalKpiPreviews.filter(({ gk }) => !isGKpi(gk));

  const renderPreviewCard = (gk: GoalKPI, section: "gkpi" | "subgkpi") => {
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
    const kColor = getKpiColor(rate);
    const gkType = gk.type ?? "value";
    const isExpanded = expandedPreviewId === gk.id;
    const subSources =
      section === "subgkpi" ? getSubKpiSources(gk, deptActivities) : [];

    return (
      <div
        key={gk.id}
        className={`g-kpi-card${section === "subgkpi" ? " g-kpi-card-sub" : ""}`}
      >
        <div className="g-kpi-card-top">
          <div className="g-kpi-card-left">
            <div className="g-kpi-name-row">
              <span className="g-kpi-name">{gk.label}</span>
              <span
                className={`g-kpi-kind-chip ${section === "gkpi" ? "gkpi" : "subgkpi"}`}
              >
                {section === "gkpi" ? "G-KPI" : "G-sub-KPI"}
              </span>
              {gk.isHeadline && (
                <span className="g-kpi-headline-chip">主要</span>
              )}
            </div>
            <span className="g-kpi-meta">{getGoalKpiMeta(gk)}</span>
          </div>
          <div className="g-kpi-card-right">
            <span className="g-kpi-value">
              <span className="g-kpi-val-label">實際</span>
              {formatMetricValue(actual, isRateMode, gk.unit)}
              {gkType === "pct_activity" && metCount !== null && (
                <span className="g-kpi-inline-hint">
                  {metCount}/{totalCount} 活動達標
                </span>
              )}
              <span className="g-kpi-val-sep">/</span>
              <span className="g-kpi-val-label">目標</span>
              {formatMetricValue(target, isRateMode, gk.unit)}
            </span>
            {(gkType !== "pct_activity" || section === "subgkpi") && (
              <span className="g-kpi-rate" style={{ color: kColor }}>
                {rate !== null ? `${rate}%` : "--"}
              </span>
            )}
          </div>
        </div>

        {rate !== null && (
          <div className="g-kpi-bar-wrap">
            <div className="g-kpi-bar">
              <div
                style={{
                  width: `${Math.min(rate, 100)}%`,
                  height: "100%",
                  background: kColor,
                  borderRadius: "4px",
                  transition: "width 0.6s ease",
                }}
              />
            </div>
          </div>
        )}

        {gkType === "pct_activity" && (
          <div className="g-kpi-activity-breakdown">
            {(gk.thresholdGoalKpiIds ?? []).length === 0 ? (
              <div className="g-kpi-activity-empty">尚未設定門檻 GoalKPI</div>
            ) : activities.length === 0 ? (
              <div className="g-kpi-activity-empty">
                所選 GoalKPI 尚未連結任何 M KPI
              </div>
            ) : (
              <>
                <button
                  className="g-kpi-activity-toggle"
                  onClick={() =>
                    setExpandedPreviewId((current) =>
                      current === gk.id ? null : gk.id,
                    )
                  }
                >
                  {isExpanded ? "▲ 隱藏" : "▶ 顯示"} 活動明細
                </button>
                {isExpanded && (
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
              </>
            )}
          </div>
        )}

        {section === "subgkpi" && subSources.length > 0 && (
          <div className="g-subkpi-breakdown">
            <button
              className="g-kpi-activity-toggle"
              onClick={() =>
                setExpandedPreviewId((current) =>
                  current === gk.id ? null : gk.id,
                )
              }
            >
              {isExpanded ? "▲ 隱藏" : "▶ 顯示"} 來源明細
            </button>
            {isExpanded && (
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
          </div>
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

        {gKpiPreviews.length > 0 && (
          <div className="g-pct-panel g-panel-section">
            <div className="g-pct-panel-header">
              <span className="g-pct-panel-title">G-KPI 預覽</span>
              <span className="g-panel-section-hint">
                對齊目標編輯器的 aggregate / pct_activity 預覽
              </span>
            </div>
            <div className="g-pct-panel-cards">
              {gKpiPreviews.map(({ gk }) => renderPreviewCard(gk, "gkpi"))}
            </div>
          </div>
        )}

        {subGKpiPreviews.length > 0 && (
          <div className="g-kpi-panel g-kpi-panel-sub">
            <div className="g-kpi-panel-header">
              <span className="g-kpi-panel-title">G-sub-KPI 預覽</span>
              <span className="g-panel-section-hint">
                顯示 direct KPI 的實際值、目標與來源明細
              </span>
            </div>
            <div className="g-kpi-panel-body">
              {subGKpiPreviews.map(({ gk }) =>
                renderPreviewCard(gk, "subgkpi"),
              )}
            </div>
          </div>
        )}

        <div className="list-toolbar">
          <div className="list-filters">
            <select
              className="filter-select"
              value={filterOwner}
              onChange={(e) => onFilterOwner(e.target.value)}
            >
              <option value="all">全部負責人</option>
              {teams.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="strategy-rows">
        {strategies.length === 0 && (
          <div className="empty-state small">
            <p>目前此目標下沒有任何策略。</p>
          </div>
        )}
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
    </div>
  );
}
