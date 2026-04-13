import { useState } from "react";
import type {
  OGSMData,
  Goal,
  Strategy,
  Measure,
  GoalKPI,
  DeptActivity,
} from "../schemas/ogsm";
import { getPlanItemWarning } from "../utils/planWarnings";
import { computeGoalKpiResult } from "../utils/goalKpi";

interface Props {
  data: OGSMData;
  warnDaysBefore: number;
  onSelectGoal: (id: string) => void;
  onSelectStrategy: (
    goalId: string,
    strategyId: string,
    warnFilter?: "overdue" | "warning",
  ) => void;
  onSelectMeasure: (goalId: string, stratId: string, measureId: string) => void;
  onEditObjective: (text: string) => void;
  onAddGoal: () => void;
  isReadOnly?: boolean;
  /** V3 架構：部門活動清單，供 GoalKPI 計算使用 */
  deptActivities?: DeptActivity[];
}

//  stat types
interface NodeStats {
  kpiDone: number;
  kpiTotal: number;
  planDone: number;
  planTotal: number;
}

//  GoalKPI helpers
// goalKpiRate 委派給共用的 computeGoalKpiResult（utils/goalKpi.ts）
function goalKpiRate(
  gk: GoalKPI,
  goal: Goal,
  deptActivities: DeptActivity[] = [],
): number | null {
  return computeGoalKpiResult(gk, goal, deptActivities).rate;
}

// sStats: "行動計畫" = Measure row；KPI = all KPIs in measures (not filtered by actual)
function sStats(s: Strategy): NodeStats {
  const allKpis = s.measures.flatMap((m) => m.kpis);
  // Measure "done" = all its KPIs have achievementRate >= 100
  const planDone = s.measures.filter(
    (m) =>
      m.kpis.length > 0 && m.kpis.every((k) => (k.achievementRate ?? 0) >= 100),
  ).length;
  return {
    kpiDone: allKpis.filter((k) => (k.achievementRate ?? 0) >= 100).length,
    kpiTotal: allKpis.length,
    planDone,
    planTotal: s.measures.length,
  };
}

// gStats: GoalKPI (G-level KPI panel) if exists, else sum M-level; plans aggregated from strategies
function gStats(g: Goal, deptActivities: DeptActivity[] = []): NodeStats {
  const gks = g.goalKpis ?? [];
  const planAcc = g.strategies.reduce(
    (acc, s) => {
      const ns = sStats(s);
      return {
        planDone: acc.planDone + ns.planDone,
        planTotal: acc.planTotal + ns.planTotal,
      };
    },
    { planDone: 0, planTotal: 0 },
  );
  if (gks.length > 0) {
    // kpiTotal = ALL GoalKPIs in the panel (not just those with computable rate)
    return {
      kpiDone: gks.filter(
        (gk) => (goalKpiRate(gk, g, deptActivities) ?? 0) >= 100,
      ).length,
      kpiTotal: gks.length,
      ...planAcc,
    };
  }
  const kpiAcc = g.strategies.reduce(
    (acc, s) => {
      const ns = sStats(s);
      return {
        kpiDone: acc.kpiDone + ns.kpiDone,
        kpiTotal: acc.kpiTotal + ns.kpiTotal,
      };
    },
    { kpiDone: 0, kpiTotal: 0 },
  );
  return { ...kpiAcc, ...planAcc };
}

// G tooltip: 目標KPI (GoalKPI or M-level) + 行動計畫(Measures) + 策略數
function gTooltip(g: Goal, gs: NodeStats): string {
  const parts: string[] = [];
  const hasGoalKpi = (g.goalKpis ?? []).length > 0;
  if (gs.kpiTotal > 0)
    parts.push(
      `${hasGoalKpi ? "目標KPI" : "KPI"} ${gs.kpiDone}/${gs.kpiTotal}達標`,
    );
  if (gs.planTotal > 0)
    parts.push(`行動計畫 ${gs.planDone}/${gs.planTotal}達標`);
  parts.push(`策略 ${g.strategies.length}項`);
  return parts.join("  |  ");
}

// S tooltip: KPI (all) + 行動計畫(= Measures)
function sTooltip(ss: NodeStats): string {
  const parts: string[] = [];
  if (ss.kpiTotal > 0) parts.push(`KPI ${ss.kpiDone}/${ss.kpiTotal}達標`);
  if (ss.planTotal > 0)
    parts.push(`行動計畫 ${ss.planDone}/${ss.planTotal}達標`);
  return parts.join("  |  ") || "尚無資料";
}

//  component
export default function OverviewPage({
  data,
  warnDaysBefore,
  onSelectGoal,
  onSelectStrategy,
  onSelectMeasure,
  onEditObjective,
  onAddGoal,
  isReadOnly = false,
  deptActivities = [],
}: Props) {
  const [editingO, setEditingO] = useState(false);
  const [oText, setOText] = useState("");
  const [oExpandedStatus, setOExpandedStatus] = useState<string | null>(null);
  const [warnExpandedType, setWarnExpandedType] = useState<
    "overdue" | "warning" | null
  >(null);

  // 全頁警告計畫項目（逾期 / 即將到期）
  type WarnItemCtx = {
    itemId: string;
    measureName: string; // 連結活動名稱（Measure.rawText），無連結時為策略名
    description: string; // PlanItem.description
    notes: string; // PlanItem.notes
    plannedEndDate: string;
    warnType: "overdue" | "warning";
    goalId: string;
    stratId: string;
  };
  const allWarnItems: WarnItemCtx[] = data.goals.flatMap((g) =>
    g.strategies.flatMap((s) =>
      s.actionPlans.flatMap((p) =>
        p.items.flatMap((item) => {
          const w = getPlanItemWarning(item, warnDaysBefore);
          if (!w) return [];
          const linkedMeasure = item.linkedMeasureId
            ? s.measures.find((m) => m.id === item.linkedMeasureId)
            : null;
          const measureName =
            linkedMeasure?.rawText || s.title || "（未命名策略）";
          return [
            {
              itemId: item.id,
              measureName,
              description: item.description,
              notes: item.notes ?? "",
              plannedEndDate: item.plannedEndDate ?? "",
              warnType: w,
              goalId: g.id,
              stratId: s.id,
            },
          ];
        }),
      ),
    ),
  );
  const overdueItems = allWarnItems.filter((x) => x.warnType === "overdue");
  const nearItems = allWarnItems.filter((x) => x.warnType === "warning");

  // O-level KPI 統計：G = GoalKPI 看板；M = Measure 內的 kpis
  const oKpiItems = data.goals.flatMap((g) =>
    (g.goalKpis ?? []).map((gk) => ({
      done: (goalKpiRate(gk, g, deptActivities) ?? 0) >= 100,
    })),
  );
  const oKpiTotal = oKpiItems.length;
  const oKpiDone = oKpiItems.filter((k) => k.done).length;

  const mKpiItems = data.goals.flatMap((g) =>
    g.strategies.flatMap((s) =>
      s.measures.flatMap((m) =>
        (m.kpis ?? []).map((k) => ({ done: (k.achievementRate ?? 0) >= 100 })),
      ),
    ),
  );
  const mKpiTotal = mKpiItems.length;
  const mKpiDone = mKpiItems.filter((k) => k.done).length;

  // G 活動達標率：pct_activity 類型的 GoalKPI
  const gPctItems = data.goals.flatMap((g) =>
    (g.goalKpis ?? [])
      .filter((gk) => (gk.type ?? "value") === "pct_activity")
      .map((gk) => ({
        done: (goalKpiRate(gk, g, deptActivities) ?? 0) >= 100,
      })),
  );
  const gPctTotal = gPctItems.length;
  const gPctDone = gPctItems.filter((k) => k.done).length;

  // 活動統計：以 Measure 為單位，含 Goal/Strategy 來源資訊供展開清單使用
  type MeasureWithCtx = Measure & {
    goalTitle: string;
    goalId: string;
    stratTitle: string;
    stratId: string;
    displayName: string;
    actionDone: number;
    actionTotal: number;
  };
  const allMeasuresWithCtx: MeasureWithCtx[] = data.goals.flatMap((g) =>
    g.strategies.flatMap((s) =>
      s.measures.map((m) => {
        const linkedItems = s.actionPlans
          .flatMap((p) => p.items)
          .filter((i) => i.linkedMeasureId === m.id);
        return {
          ...m,
          goalTitle: g.title,
          goalId: g.id,
          stratTitle: s.title,
          stratId: s.id,
          displayName: m.rawText || "（未命名活動）",
          actionDone: linkedItems.filter((i) => i.completed).length,
          actionTotal: linkedItems.length,
        };
      }),
    ),
  );
  const oPlanNotStarted = allMeasuresWithCtx.filter(
    (m) => (m.status ?? "not-started") === "not-started",
  );
  const oPlanAttention = allMeasuresWithCtx.filter(
    (m) => m.status === "attention",
  );
  const oPlanInProgress = allMeasuresWithCtx.filter(
    (m) => m.status === "in-progress",
  );
  const oPlanCompleted = allMeasuresWithCtx.filter(
    (m) => m.status === "completed",
  );

  return (
    <div className="overview-page">
      {/*  O Stats Header  */}
      <div className="ov-header">
        <div className="ov-header-left">
          <div className="ov-header-badge">O</div>
          <div style={{ flex: 1 }}>
            <div className="ov-header-label">部門目標 · {data.period}</div>
            {editingO ? (
              <textarea
                className="ov-objective-text"
                style={{
                  width: "100%",
                  resize: "vertical",
                  minHeight: 60,
                  background: "rgba(99,102,241,.08)",
                }}
                autoFocus
                value={oText}
                onChange={(e) => setOText(e.target.value)}
                onBlur={() => {
                  if (oText.trim() !== data.objectives?.deptO)
                    onEditObjective(oText.trim());
                  setEditingO(false);
                }}
              />
            ) : (
              <div
                className="ov-objective-text"
                onDoubleClick={() => {
                  if (isReadOnly) return;
                  setOText(data.objectives?.deptO ?? "");
                  setEditingO(true);
                }}
                title={isReadOnly ? "唯讀模式" : "雙擊編輯"}
              >
                {data.objectives?.deptO || (
                  <span style={{ color: "#6b7280", fontStyle: "italic" }}>
                    雙擊輸入部門目標…
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="ov-stat-items">
          {/* KPI 區 */}
          <div className="ov-stat-group">
            <div className="ov-stat-group-label">KPI</div>
            <div className="ov-stat-group-items">
              {/* G-主要目標（pct_activity 類型） */}
              <div className="ov-stat-item">
                {gPctTotal === 0 ? (
                  <span className="ov-stat-num" style={{ color: "#d1d5db" }}>
                    —
                  </span>
                ) : (
                  <span
                    className="ov-stat-num"
                    style={{
                      color: gPctDone === gPctTotal ? "#10b981" : "var(--text)",
                    }}
                  >
                    {gPctDone}
                    <span style={{ fontSize: 13, color: "#6b7280" }}>
                      /{gPctTotal}
                    </span>
                  </span>
                )}
                <span className="ov-stat-desc">G-主要目標</span>
              </div>
              {/* G-KPI達成 */}
              <div className="ov-stat-item">
                <span
                  className="ov-stat-num"
                  style={{
                    color:
                      oKpiDone === oKpiTotal && oKpiTotal > 0
                        ? "#10b981"
                        : "var(--text)",
                  }}
                >
                  {oKpiDone}
                  <span style={{ fontSize: 13, color: "#6b7280" }}>
                    /{oKpiTotal}
                  </span>
                </span>
                <span className="ov-stat-desc">G-KPI 達成</span>
              </div>
              {/* M-KPI達成 */}
              <div className="ov-stat-item">
                <span
                  className="ov-stat-num"
                  style={{
                    color:
                      mKpiDone === mKpiTotal && mKpiTotal > 0
                        ? "#10b981"
                        : "var(--text)",
                  }}
                >
                  {mKpiDone}
                  <span style={{ fontSize: 13, color: "#6b7280" }}>
                    /{mKpiTotal}
                  </span>
                </span>
                <span className="ov-stat-desc">M-KPI 達成</span>
              </div>
            </div>
          </div>
          <div className="ov-stat-divider" />
          {/* 活動區 */}
          <div className="ov-stat-group">
            <div className="ov-stat-group-label">活動</div>
            <div className="ov-stat-group-items">
              {(
                [
                  {
                    key: "not-started",
                    label: "未開始",
                    count: oPlanNotStarted.length,
                    color: "#6b7280",
                  },
                  {
                    key: "attention",
                    label: "需注意",
                    count: oPlanAttention.length,
                    color: "#d97706",
                  },
                  {
                    key: "in-progress",
                    label: "進行中",
                    count: oPlanInProgress.length,
                    color: "#2563eb",
                  },
                  {
                    key: "completed",
                    label: "已完成",
                    count: oPlanCompleted.length,
                    color: "#059669",
                  },
                ] as const
              ).map(({ key, label, count, color }) => (
                <div
                  key={key}
                  className={`ov-stat-item ov-stat-clickable${oExpandedStatus === key ? " active" : ""}`}
                  onClick={() =>
                    setOExpandedStatus((v) => (v === key ? null : key))
                  }
                  title={`點擊查看${label}的活動`}
                >
                  <span className="ov-stat-num" style={{ color }}>
                    {count}
                  </span>
                  <span className="ov-stat-desc">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {oExpandedStatus &&
          (() => {
            const items =
              oExpandedStatus === "not-started"
                ? oPlanNotStarted
                : oExpandedStatus === "attention"
                  ? oPlanAttention
                  : oExpandedStatus === "in-progress"
                    ? oPlanInProgress
                    : oPlanCompleted;
            const statusLabel =
              oExpandedStatus === "not-started"
                ? "未開始"
                : oExpandedStatus === "attention"
                  ? "需注意"
                  : oExpandedStatus === "in-progress"
                    ? "進行中"
                    : "已完成";
            return (
              <div className="ov-status-list">
                <div className="ov-status-list-header">
                  <span>
                    {statusLabel}活動（{items.length} 項）
                  </span>
                  <button
                    className="ov-status-list-close"
                    onClick={() => setOExpandedStatus(null)}
                  >
                    ✕
                  </button>
                </div>
                {items.length === 0 ? (
                  <div className="ov-status-list-empty">無項目</div>
                ) : (
                  <div className="ov-status-list-body">
                    {items.map((m) => (
                      <div
                        key={m.id}
                        className="ov-status-list-item"
                        onClick={() =>
                          onSelectMeasure(m.goalId, m.stratId, m.id)
                        }
                        title="點擊開啟行動項目"
                      >
                        <span className="ov-status-list-name">
                          {m.displayName}
                        </span>
                        <span className="ov-status-list-path">
                          執行狀況 {m.actionDone}/{m.actionTotal}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
      </div>

      {/* 行動計畫警告列：逾期 / 即將到期 */}
      {(overdueItems.length > 0 || nearItems.length > 0) && (
        <div className="ov-warn-bar">
          <div className="ov-warn-bar-badges">
            <span className="ov-warn-bar-label">行動警示</span>
            {overdueItems.length > 0 && (
              <button
                className={`ov-warn-bar-btn ov-warn-bar-btn--overdue${warnExpandedType === "overdue" ? " active" : ""}`}
                onClick={() =>
                  setWarnExpandedType((v) =>
                    v === "overdue" ? null : "overdue",
                  )
                }
              >
                🔴 {overdueItems.length} 已逾期
              </button>
            )}
            {nearItems.length > 0 && (
              <button
                className={`ov-warn-bar-btn ov-warn-bar-btn--near${warnExpandedType === "warning" ? " active" : ""}`}
                onClick={() =>
                  setWarnExpandedType((v) =>
                    v === "warning" ? null : "warning",
                  )
                }
              >
                ⚠️ {nearItems.length} 即將到期
              </button>
            )}
            {warnExpandedType && (
              <button
                className="ov-warn-bar-close"
                onClick={() => setWarnExpandedType(null)}
              >
                ✕
              </button>
            )}
          </div>
          {warnExpandedType && (
            <div className="ov-warn-list">
              {(warnExpandedType === "overdue" ? overdueItems : nearItems).map(
                (x) => (
                  <div
                    key={x.itemId}
                    className="ov-warn-list-item"
                    onClick={() =>
                      onSelectStrategy(x.goalId, x.stratId, x.warnType)
                    }
                    title="點擊跳到行動計畫"
                  >
                    <span className="ov-warn-list-measure">
                      {x.measureName}
                    </span>
                    <span className="ov-warn-list-desc">
                      {x.description || "（未命名）"}
                    </span>
                    {x.notes && (
                      <span className="ov-warn-list-notes">{x.notes}</span>
                    )}
                    <span className="ov-warn-list-meta">
                      {x.plannedEndDate && (
                        <span
                          style={{
                            color:
                              warnExpandedType === "overdue"
                                ? "#ef4444"
                                : "#f59e0b",
                          }}
                        >
                          {x.plannedEndDate}
                        </span>
                      )}
                    </span>
                  </div>
                ),
              )}
            </div>
          )}
        </div>
      )}

      <div className="ov-legend">
        {(
          [
            { color: "#10b981", label: "達標（≥100%）" },
            { color: "#6366f1", label: "良好（≥70%）" },
            { color: "#f59e0b", label: "注意（≥40%）" },
            { color: "#ef4444", label: "落後（<40%）" },
            { color: "#4b5563", label: "未開始" },
          ] as const
        ).map(({ color, label }) => (
          <span key={label} className="ov-legend-item">
            <span className="ov-legend-dot" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      <div className="ov-actions">
        {!isReadOnly && (
          <button className="ov-add-goal" onClick={onAddGoal}>
            ＋ 新增目標（G）
          </button>
        )}
      </div>

      {/*  Org-chart Tree  */}
      {data.goals.length === 0 ? (
        <div className="empty-state" style={{ padding: 60 }}>
          <div className="empty-icon">🎯</div>
          <h2>尚未建立任何目標</h2>
          <p>點選上方「＋ 新增目標（G）」開始建立 OGSM</p>
        </div>
      ) : (
        <div className="org-tree-wrap">
          <ul className="org-root">
            <li>
              {/* O node (no click, tooltip = full stats) */}
              <div
                className="org-node org-node-o"
                data-tooltip={`活動統計：未開始 ${oPlanNotStarted.length}｜需注意 ${oPlanAttention.length}｜進行中 ${oPlanInProgress.length}｜已完成 ${oPlanCompleted.length}`}
              >
                <span className="org-badge org-badge-o">O</span>
                <span className="org-title">
                  {data.objectives?.deptO || "部門目標"}
                </span>
              </div>

              <ul className="org-children">
                {data.goals.map((g: Goal) => {
                  const gs = gStats(g, deptActivities);
                  return (
                    <li key={g.id}>
                      {/* G node */}
                      <div
                        className="org-node org-node-g"
                        data-tooltip={gTooltip(g, gs)}
                        onClick={() => onSelectGoal(g.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) =>
                          e.key === "Enter" && onSelectGoal(g.id)
                        }
                      >
                        <span className="org-badge org-badge-g">{g.label}</span>
                        <span className="org-title">
                          {g.title || <em>(未命名)</em>}
                        </span>
                      </div>

                      {g.strategies.length > 0 && (
                        <ul className="org-children">
                          {g.strategies.map((s: Strategy, si: number) => {
                            const ss = sStats(s);
                            return (
                              <li key={s.id}>
                                {/* S node */}
                                <div
                                  className="org-node org-node-s"
                                  data-tooltip={sTooltip(ss)}
                                  onClick={() => onSelectStrategy(g.id, s.id)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    onSelectStrategy(g.id, s.id)
                                  }
                                >
                                  <span className="org-badge org-badge-s">{`S${si + 1}`}</span>
                                  <span className="org-title">
                                    {s.title || <em>(未命名)</em>}
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
