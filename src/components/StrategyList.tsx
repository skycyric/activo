import { useState } from "react";
import type {
  Goal,
  GoalKPI,
  Strategy,
  Team,
  DeptActivity,
} from "../schemas/ogsm";
import { countStrategyWarnings } from "../utils/planWarnings";
import { computeGoalKpiResult } from "../utils/goalKpi";

interface Props {
  goal: Goal | null;
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
  strategies,
  selectedStrategyId,
  onSelectStrategy,
  filterOwner,
  onFilterOwner,
  teams,
  warnDaysBefore,
  deptActivities = [],
}: Props) {
  const [showActivityBreakdown, setShowActivityBreakdown] = useState<
    string | null
  >(null);

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
  const computeGoalKpi = (gk: GoalKPI) =>
    computeGoalKpiResult(gk, goal, deptActivities);

  const activityKpis = goalKpis.filter(
    (gk) => (gk.type ?? "value") === "pct_activity",
  );
  const headlineKpis = goalKpis.filter(
    (gk) => (gk.type ?? "value") !== "pct_activity" && gk.isHeadline,
  );
  const detailKpis = goalKpis.filter(
    (gk) => (gk.type ?? "value") !== "pct_activity" && !gk.isHeadline,
  );

  const renderGkCard = (gk: GoalKPI) => {
    const {
      actual,
      target,
      rate,
      isRateMode,
      metCount,
      totalCount,
      activities,
    } = computeGoalKpi(gk);
    const kColor =
      rate === null
        ? "#6b7280"
        : rate >= 100
          ? "#10b981"
          : rate >= 70
            ? "#6366f1"
            : rate >= 40
              ? "#f59e0b"
              : "#ef4444";
    const gkType = gk.type ?? "value";

    return (
      <div key={gk.id} className="g-kpi-card">
        <div className="g-kpi-card-top">
          <div className="g-kpi-card-left">
            <span className="g-kpi-name">{gk.label}</span>
            <span className="g-kpi-meta">
              {gkType === "pct_activity"
                ? "活動達標率"
                : gkType === "progress"
                  ? "進度"
                  : gk.aggregation === "SUM"
                    ? "加總"
                    : "平均"}{" "}
              {gkType === "pct_activity"
                ? `門檻 ${(gk.thresholdGoalKpiIds ?? []).length}`
                : `連結 ${gk.linkedKpis.length}`}
            </span>
          </div>
          <div className="g-kpi-card-right">
            <span className="g-kpi-value">
              <span className="g-kpi-val-label">實際</span>
              {actual !== null ? actual.toLocaleString() : "--"}
              {isRateMode ? "%" : actual !== null ? ` ${gk.unit}` : ""}{" "}
              {gkType === "pct_activity" && metCount !== null && (
                <span style={{ fontSize: 11, color: "#6b7280" }}>
                  {metCount}/{totalCount}{" "}
                </span>
              )}
              <span className="g-kpi-val-sep">/</span>
              <span className="g-kpi-val-label">目標</span>
              {target !== null ? target.toLocaleString() : "--"}
              {isRateMode ? "%" : ` ${gk.unit}`}
            </span>
            {gkType !== "pct_activity" && (
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
                    setShowActivityBreakdown(
                      showActivityBreakdown === gk.id ? null : gk.id,
                    )
                  }
                >
                  {showActivityBreakdown === gk.id ? "▲ 隱藏" : "▶ 顯示"}{" "}
                  活動明細
                </button>
                {showActivityBreakdown === gk.id && (
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

        {activityKpis.length > 0 && (
          <div className="g-pct-panel">
            <div className="g-pct-panel-header">
              <span className="g-pct-panel-title">活動達標率</span>
            </div>
            <div className="g-pct-panel-cards">
              {activityKpis.map(renderGkCard)}
            </div>
          </div>
        )}

        {(headlineKpis.length > 0 || detailKpis.length > 0) && (
          <div className="g-kpi-panel">
            <div className="g-kpi-panel-header">
              <span className="g-kpi-panel-title">目標 KPI</span>
            </div>
            {headlineKpis.length > 0 && (
              <div className="g-kpi-headline-area">
                <span className="g-kpi-headline-label">主要指標</span>
                {headlineKpis.map(renderGkCard)}
              </div>
            )}
            <div className="g-kpi-panel-body">
              {detailKpis.map(renderGkCard)}
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
