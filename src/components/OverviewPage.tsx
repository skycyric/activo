import { useState } from "react";
import type {
  OGSMData,
  Goal,
  Strategy,
  GoalKPI,
  GoalKpiLink,
} from "../types/ogsm";

interface Props {
  data: OGSMData;
  onSelectGoal: (id: string) => void;
  onSelectStrategy: (goalId: string, strategyId: string) => void;
  onEditObjective: (text: string) => void;
}

//  stat types
interface NodeStats {
  kpiDone: number;
  kpiTotal: number;
  planDone: number;
  planTotal: number;
}

//  GoalKPI helpers
function goalKpiRate(gk: GoalKPI, goal: Goal): number | null {
  const values = gk.linkedKpis.flatMap((link: GoalKpiLink) => {
    const s = goal.strategies.find((s) => s.id === link.strategyId);
    const m = s?.measures.find((m) => m.id === link.measureId);
    const k = m?.kpis.find((k) => k.id === link.kpiId);
    if (!k) return [];
    return [
      {
        actual: k.actual ?? 0,
        target: k.target ?? 0,
        achievementRate: k.achievementRate,
      },
    ];
  });
  if (values.length === 0) return null;
  if (gk.aggregation === "AVERAGE") {
    const rates = values
      .map((v) => v.achievementRate)
      .filter((r): r is number => r !== null && r !== undefined);
    if (rates.length === 0) {
      // fallback: compute from actual/target (matches StrategyList computeGoalKpi behaviour)
      const avgActual =
        values.reduce((a, v) => a + v.actual, 0) / values.length;
      const avgTarget =
        values.reduce((a, v) => a + v.target, 0) / values.length;
      const denom =
        gk.target !== null && gk.target !== undefined ? gk.target : avgTarget;
      if (denom <= 0) return null;
      return Math.round((avgActual / denom) * 100);
    }
    const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length;
    const target =
      gk.target !== null && gk.target !== undefined ? gk.target : 100;
    return Math.round((avgRate / target) * 100);
  } else {
    const sumActual = values.reduce((a, v) => a + v.actual, 0);
    const denominator = gk.target ?? values.reduce((a, v) => a + v.target, 0);
    if (denominator <= 0) return null;
    return Math.round((sumActual / denominator) * 100);
  }
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
function gStats(g: Goal): NodeStats {
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
      kpiDone: gks.filter((gk) => (goalKpiRate(gk, g) ?? 0) >= 100).length,
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
      `${hasGoalKpi ? "\u76ee\u6a19KPI" : "KPI"}\u00a0${gs.kpiDone}/${gs.kpiTotal}\u9054\u6a19`,
    );
  if (gs.planTotal > 0)
    parts.push(
      `\u884c\u52d5\u8a08\u756b\u00a0${gs.planDone}/${gs.planTotal}\u9054\u6a19`,
    );
  parts.push(`\u7b56\u7565\u00a0${g.strategies.length}\u9805`);
  return parts.join("  |  ");
}

// S tooltip: KPI (all) + 行動計畫(= Measures)
function sTooltip(_s: Strategy, ss: NodeStats): string {
  const parts: string[] = [];
  if (ss.kpiTotal > 0)
    parts.push(`KPI\u00a0${ss.kpiDone}/${ss.kpiTotal}\u9054\u6a19`);
  if (ss.planTotal > 0)
    parts.push(
      `\u884c\u52d5\u8a08\u756b\u00a0${ss.planDone}/${ss.planTotal}\u9054\u6a19`,
    );
  return parts.join("  |  ") || "\u5c1a\u7121\u8cc7\u6599";
}

//  component
export default function OverviewPage({
  data,
  onSelectGoal,
  onSelectStrategy,
  onEditObjective,
}: Props) {
  const [editingO, setEditingO] = useState(false);
  const [oText, setOText] = useState("");

  // O-level KPI 統計：只統計每個 G 的 GoalKPI 看板
  const oKpiItems = data.goals.flatMap((g) =>
    (g.goalKpis ?? []).map((gk) => ({
      done: (goalKpiRate(gk, g) ?? 0) >= 100,
    })),
  );
  const oKpiTotal = oKpiItems.length;
  const oKpiDone = oKpiItems.filter((k) => k.done).length;

  // 活動完成：以 Measure（行動計畫）為單位，done = 所有 KPI 達成率 >= 100
  const allMeasures = data.goals.flatMap((g) =>
    g.strategies.flatMap((s) => s.measures),
  );
  const oPlanTotal = allMeasures.length;
  const oPlanDone = allMeasures.filter((m) => m.status === "completed").length;

  const sTotal = data.goals.flatMap((g) => g.strategies).length;

  return (
    <div className="overview-page">
      {/*  O Stats Header  */}
      <div className="ov-header">
        <div className="ov-header-left">
          <div className="ov-header-badge">O</div>
          <div style={{ flex: 1 }}>
            <div className="ov-header-label">
              {"\u90e8\u9580\u76ee\u6a19"} &middot; {data.period}
            </div>
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
                  setOText(data.objectives?.deptO ?? "");
                  setEditingO(true);
                }}
                title={"\u96d9\u64ca\u7de8\u8f2f"}
              >
                {data.objectives?.deptO || (
                  <span style={{ color: "#6b7280", fontStyle: "italic" }}>
                    {"\u96d9\u64ca\u8f38\u5165\u90e8\u9580\u76ee\u6a19\u2026"}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="ov-stat-items">
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
            <span className="ov-stat-desc">{"KPI \u9054\u6210"}</span>
          </div>
          <div className="ov-stat-item">
            <span className="ov-stat-num" style={{ color: "#6366f1" }}>
              {oPlanDone}
              <span style={{ fontSize: 13, color: "#6b7280" }}>
                /{oPlanTotal}
              </span>
            </span>
            <span className="ov-stat-desc">{"\u6d3b\u52d5\u5b8c\u6210"}</span>
          </div>
        </div>
      </div>

      {/*  Org-chart Tree  */}
      {data.goals.length === 0 ? (
        <div className="empty-state" style={{ padding: 60 }}>
          <div className="empty-icon">{"\uD83C\uDFAF"}</div>
          <h2>{"\u5c1a\u672a\u5efa\u7acb\u4efb\u4f55\u76ee\u6a19"}</h2>
          <p>
            {
              "\u9ede\u9078\u5de6\u5074\u300c+ \u65b0\u589e\u76ee\u6a19\uff08G\uff09\u300d\u958b\u59cb\u5efa\u7acb OGSM"
            }
          </p>
        </div>
      ) : (
        <div className="org-tree-wrap">
          <ul className="org-root">
            <li>
              {/* O node (no click, tooltip = full stats) */}
              <div
                className="org-node org-node-o"
                data-tooltip={[
                  `G KPI \u5168\u9054\u6a19\u00a0${oKpiDone}/${oKpiTotal}`,
                  oPlanTotal > 0
                    ? `\u884c\u52d5\u8a08\u756b\u00a0${oPlanDone}/${oPlanTotal}\u9054\u6a19`
                    : "",
                  `G\u00a0${data.goals.length}`,
                  `S\u00a0${sTotal}`,
                ]
                  .filter(Boolean)
                  .join("  |  ")}
              >
                <span className="org-badge org-badge-o">O</span>
                <span className="org-title">
                  {data.objectives?.deptO || "\u90e8\u9580\u76ee\u6a19"}
                </span>
              </div>

              <ul className="org-children">
                {data.goals.map((g: Goal, gi: number) => {
                  const gs = gStats(g);
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
                        <span className="org-badge org-badge-g">{`G${gi + 1}`}</span>
                        <span className="org-title">
                          {g.title || <em>(\u672a\u547d\u540d)</em>}
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
                                  data-tooltip={sTooltip(s, ss)}
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
                                    {s.title || <em>(\u672a\u547d\u540d)</em>}
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
