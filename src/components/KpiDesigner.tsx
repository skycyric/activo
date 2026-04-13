import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  Panel,
  NodeResizer as _NodeResizer,
  type NodeProps,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type {
  OGSMData,
  Goal,
  GoalKPI,
  Strategy,
  DeptActivity,
} from "../schemas/ogsm";
import { genId } from "../utils/csvParser";
import { computeGoalKpiResult, type GoalKpiResult } from "../utils/goalKpi";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  data: OGSMData;
  deptActivities: DeptActivity[];
  initialGoalId?: string;
  onUpdateData: (d: OGSMData) => void;
  onAddGoal: () => void;
  onDeleteGoal: (id: string) => void;
  onAddStrategyToGoal: (goalId: string) => void;
  onDeleteStrategy: (stratId: string) => void;
  onClose: () => void;
}

// ─── Full canvas builders ─────────────────────────────────────────────────────

type ViewMode = "item" | "kpi";

// ── Layout constants ──────────────────────────────────────────────────────────
const COL_O = 60,
  COL_G = 320,
  COL_S = 580;
const S_ROW_H = 90; // item mode: vertical gap between strategy rows
const GOAL_GAP = 60; // vertical gap between consecutive goals

// KPI mode layout (horizontal 4-column: G → pct GKs → direct GKs → Activities)
const KPI_G_X = 80; // Col 1: G node
const KPI_PCT_X = 360; // Col 2: pct_activity / summary GKs
const KPI_GK_X = 660; // Col 3: direct / threshold GKs
const KPI_ACT_X = 1000; // Col 4: Activity nodes
const KPI_GK_ROW_H = 120; // vertical step between rows
const KPI_GOAL_GAP = 80; // extra vertical gap between goals

// ── Item mode: O → G → S ──────────────────────────────────────────────────────
function buildItemNodes(
  data: OGSMData,
  _deptActivities: DeptActivity[],
  selectedId: string | null,
): Node[] {
  const nodes: Node[] = [];
  let curY = 0;
  const layouts: { topY: number; itemH: number }[] = [];

  for (const goal of data.goals) {
    const itemH = Math.max(goal.strategies.length, 1) * S_ROW_H;
    layouts.push({ topY: curY, itemH });
    curY += itemH + GOAL_GAP;
  }

  nodes.push({
    id: "o",
    type: "oNode",
    position: { x: COL_O, y: curY / 2 - 40 },
    data: { text: data.objectives.deptO, selected: selectedId === "o" },
  });

  data.goals.forEach((goal, gi) => {
    const { topY, itemH } = layouts[gi];
    nodes.push({
      id: `g-${goal.id}`,
      type: "goalNode",
      position: { x: COL_G, y: topY + itemH / 2 - 28 },
      data: { goal, selected: selectedId === `g-${goal.id}` },
    });
    goal.strategies.forEach((s, j) => {
      nodes.push({
        id: `s-${s.id}`,
        type: "strategyNode",
        position: { x: COL_S, y: topY + j * S_ROW_H + 10 },
        data: { strategy: s, selected: selectedId === `s-${s.id}` },
      });
    });
  });

  return nodes;
}

// ── KPI mode: G → pct GKs → threshold GKs → Activities (4-column) ─────────────
function buildKpiNodes(
  data: OGSMData,
  deptActivities: DeptActivity[],
  selectedId: string | null,
): Node[] {
  const nodes: Node[] = [];
  const actPositions = new Map<string, { x: number; y: number }>();
  const kpiGoals = data.goals.filter((g) => (g.goalKpis?.length ?? 0) > 0);

  let curY = 0;
  for (const goal of kpiGoals) {
    const gkpis = goal.goalKpis ?? [];

    // Split GKs into layers:
    //   col2 (KPI_PCT_X)  = pct_activity or aggregate summary GKs
    //   col3 (KPI_GK_X)   = threshold / direct rate GKs
    const pctGks = gkpis.filter((gk) => gk.type === "pct_activity");
    const aggGks = gkpis.filter(
      (gk) => gk.goalKpiType === "aggregate" && gk.type !== "pct_activity",
    );
    const thresholdGkIds = new Set(
      pctGks.flatMap((gk) => gk.thresholdGoalKpiIds ?? []),
    );
    const thresholdGks = gkpis.filter((gk) => thresholdGkIds.has(gk.id));
    // Standalone: not pct, not aggregate, not threshold
    const standaloneGks = gkpis.filter(
      (gk) =>
        gk.type !== "pct_activity" &&
        gk.goalKpiType !== "aggregate" &&
        !thresholdGkIds.has(gk.id),
    );

    const hasPct = pctGks.length > 0;
    // col2: pct_activity + aggregate GKs (when there are pct GKs)
    // col3: threshold + standalone direct GKs
    // when no pct: all GKs go to col3 (G connects directly)
    const col2Gks = hasPct ? [...pctGks, ...aggGks] : [];
    const col3Gks = hasPct
      ? [...thresholdGks, ...standaloneGks]
      : gkpis.filter((gk) => gk.goalKpiType !== "aggregate");
    const col2AggOnly = !hasPct ? aggGks : []; // aggregates when no pct
    const allCol3 = [...col3Gks];

    const totalRows = Math.max(
      col2Gks.length,
      allCol3.length + col2AggOnly.length,
      1,
    );
    const totalH = totalRows * KPI_GK_ROW_H;

    // G node — show pct GKs in summary, or all if no pct
    const gkResults = gkpis.map((gk) => ({
      gk,
      result: computeGoalKpiResult(gk, goal, deptActivities, data.goals),
    }));
    nodes.push({
      id: `g-${goal.id}`,
      type: "goalNode",
      position: { x: KPI_G_X, y: curY + totalH / 2 - 28 },
      data: { goal, gkResults, selected: selectedId === `g-${goal.id}` },
    });

    // Col-2 nodes (pct_activity + aggregate)
    col2Gks.forEach((gk, k) => {
      const gkY = curY + k * KPI_GK_ROW_H + KPI_GK_ROW_H / 2 - 28;
      const rate = computeGoalKpiResult(
        gk,
        goal,
        deptActivities,
        data.goals,
      ).rate;
      nodes.push({
        id: `gk-${gk.id}`,
        type: "goalKpiNode",
        position: { x: KPI_PCT_X, y: gkY },
        data: { gk, rate, selected: selectedId === `gk-${gk.id}` },
      });
    });

    // Col-3 nodes (threshold + standalone + aggOnly when no pct)
    const col3All = [...allCol3, ...col2AggOnly];
    col3All.forEach((gk, k) => {
      const gkY = curY + k * KPI_GK_ROW_H + KPI_GK_ROW_H / 2 - 28;
      const rate = computeGoalKpiResult(
        gk,
        goal,
        deptActivities,
        data.goals,
      ).rate;
      nodes.push({
        id: `gk-${gk.id}`,
        type: "goalKpiNode",
        position: { x: KPI_GK_X, y: gkY },
        data: { gk, rate, selected: selectedId === `gk-${gk.id}` },
      });
      if (gk.goalKpiType !== "aggregate") {
        gk.linkedKpis.forEach((link) => {
          // Support both V3 activityId and legacy measureId formats
          const actId =
            link.activityId ||
            (link as unknown as Record<string, string>).measureId;
          if (actId && !actPositions.has(actId)) {
            actPositions.set(actId, { x: KPI_ACT_X, y: gkY });
          }
        });
      }
    });

    curY += totalH + KPI_GOAL_GAP;
  }

  for (const [actId, pos] of actPositions) {
    const act = deptActivities.find((a) => a.id === actId);
    if (!act) continue;
    nodes.push({
      id: `act-${act.id}`,
      type: "activityNode",
      position: pos,
      data: { activity: act, selected: selectedId === `act-${act.id}` },
    });
  }

  return nodes;
}

function buildItemEdges(data: OGSMData): Edge[] {
  const edges: Edge[] = [];
  for (const goal of data.goals) {
    edges.push({
      id: `e-o-g-${goal.id}`,
      source: "o",
      target: `g-${goal.id}`,
      sourceHandle: "source-right",
      targetHandle: "target-left",
      type: "default",
      style: { stroke: "#fb923c", strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "#fb923c" },
    });
    for (const s of goal.strategies) {
      edges.push({
        id: `e-g-s-${s.id}`,
        source: `g-${goal.id}`,
        target: `s-${s.id}`,
        sourceHandle: "source-right",
        targetHandle: "target-left",
        type: "default",
        style: { stroke: "#94a3b8", strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#94a3b8" },
      });
    }
  }
  return edges;
}

function buildKpiEdges(data: OGSMData): Edge[] {
  const edges: Edge[] = [];

  for (const goal of data.goals) {
    const gkpis = goal.goalKpis ?? [];
    if (gkpis.length === 0) continue;

    const pctGks = gkpis.filter((gk) => gk.type === "pct_activity");
    const thresholdGkIds = new Set(
      pctGks.flatMap((gk) => gk.thresholdGoalKpiIds ?? []),
    );
    const hasPct = pctGks.length > 0;

    for (const gk of gkpis) {
      const isPct = gk.type === "pct_activity";
      const isThreshold = thresholdGkIds.has(gk.id);
      const isAgg = gk.goalKpiType === "aggregate";

      // ── G → GK edges ───────────────────────────────────────────────────────
      if (hasPct) {
        // Only pct GKs and non-threshold/non-pct GKs connect from G
        if (isPct || (!isThreshold && !isPct)) {
          const color = isPct ? "#06b6d4" : isAgg ? "#a855f7" : "#94a3b8";
          edges.push({
            id: `e-g-gk-${gk.id}`,
            source: `g-${goal.id}`,
            target: `gk-${gk.id}`,
            sourceHandle: "source-right",
            targetHandle: "target-left",
            type: "default",
            style: { stroke: color, strokeWidth: 1.5 },
            markerEnd: { type: MarkerType.ArrowClosed, color },
          });
        }
      } else {
        // No pct GKs: all GKs connect from G
        const color = isAgg ? "#a855f7" : "#06b6d4";
        edges.push({
          id: `e-g-gk-${gk.id}`,
          source: `g-${goal.id}`,
          target: `gk-${gk.id}`,
          sourceHandle: "source-right",
          targetHandle: "target-left",
          type: "default",
          style: { stroke: color, strokeWidth: 1.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color },
        });
      }

      // ── pct_activity GK → threshold GKs ────────────────────────────────────
      if (isPct) {
        for (const thId of gk.thresholdGoalKpiIds ?? []) {
          edges.push({
            id: `e-pct-th-${gk.id}-${thId}`,
            source: `gk-${gk.id}`,
            target: `gk-${thId}`,
            sourceHandle: "source-right",
            targetHandle: "target-left",
            type: "default",
            style: {
              stroke: "#06b6d4",
              strokeWidth: 1.5,
              strokeDasharray: "5 3",
            },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#06b6d4" },
          });
        }
      }

      // ── aggregate GK → linked GoalKPIs ─────────────────────────────────────
      if (isAgg && !isPct) {
        for (const link of gk.linkedGoalKpis ?? []) {
          edges.push({
            id: `e-gkagg-${gk.id}-${link.goalKpiId}`,
            source: `gk-${gk.id}`,
            target: `gk-${link.goalKpiId}`,
            sourceHandle: "source-right",
            targetHandle: "target-left",
            animated: true,
            label: `×${link.weight}`,
            labelStyle: { fontSize: 11, fill: "#a855f7" },
            type: "default",
            style: { stroke: "#a855f7", strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#a855f7" },
          });
        }
      }

      // ── direct GK → Activities ──────────────────────────────────────────────
      if (!isAgg && !isPct) {
        const linkedActIds = new Set(
          gk.linkedKpis
            .map(
              (l) =>
                l.activityId ||
                (l as unknown as Record<string, string>).measureId,
            )
            .filter(Boolean),
        );
        for (const actId of linkedActIds) {
          edges.push({
            id: `e-gk-act-${gk.id}-${actId}`,
            source: `gk-${gk.id}`,
            target: `act-${actId}`,
            sourceHandle: "source-right",
            targetHandle: "target-left",
            type: "default",
            style: { stroke: "#3b82f6", strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
          });
        }
      }
    }
  }

  return edges;
}

// ─── O Node ───────────────────────────────────────────────────────────────────

function ONode({ data }: NodeProps) {
  const { text, selected } = data as { text: string; selected: boolean };
  return (
    <div className={`kpid-o-node${selected ? " selected" : ""}`}>
      <div className="kpid-o-label">O</div>
      <div className="kpid-o-text">{text || "（未設定組織目標）"}</div>
      <Handle type="source" position={Position.Right} id="source-right" />
    </div>
  );
}

// ─── Goal Node ────────────────────────────────────────────────────────────────

function GoalNode({ data }: NodeProps) {
  const { goal, gkResults, selected } = data as {
    goal: Goal;
    gkResults?: Array<{ gk: GoalKPI; result: GoalKpiResult }>;
    selected: boolean;
  };
  // Prefer pct_activity GKs for the inline summary; fall back to isHeadline; then all
  const pctResults = gkResults?.filter(({ gk }) => gk.type === "pct_activity");
  const headlineResults = gkResults?.filter(({ gk }) => gk.isHeadline);
  const displayResults =
    (pctResults?.length ? pctResults : null) ??
    (headlineResults?.length ? headlineResults : null) ??
    gkResults;

  return (
    <div className={`kpid-g-node${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Left} id="target-left" />
      <div className="kpid-g-header">
        <span className="kpid-g-label">{goal.label}</span>
        <span className="kpid-g-title">{goal.title}</span>
      </div>
      {displayResults && displayResults.length > 0 && (
        <div className="kpid-g-kpis">
          {displayResults.map(({ gk, result }) => (
            <div
              key={gk.id}
              className={`kpid-g-kpi-row${gk.type === "pct_activity" ? " pct" : ""}`}
            >
              {gk.type === "pct_activity" ? (
                <span className="kpid-g-kpi-star">✦</span>
              ) : gk.isHeadline ? (
                <span className="kpid-g-kpi-star">★</span>
              ) : null}
              <span className="kpid-g-kpi-label">{gk.label}</span>
              <span className="kpid-g-kpi-rate-inline">
                {result.rate !== null
                  ? `${result.rate}%`
                  : result.metCount !== null
                    ? `${result.metCount}/${result.totalCount}`
                    : "─"}
              </span>
            </div>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} id="source-right" />
    </div>
  );
}

// ─── Strategy Node ────────────────────────────────────────────────────────────

function StrategyNode({ data }: NodeProps) {
  const { strategy, selected } = data as {
    strategy: Strategy;
    selected: boolean;
  };
  return (
    <div className={`kpid-s-node${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Left} id="target-left" />
      <div className="kpid-s-title">{strategy.title}</div>
    </div>
  );
}

// ─── GoalKPI Node ─────────────────────────────────────────────────────────────

function GoalKpiNode({ data }: NodeProps) {
  const { gk, rate, selected } = data as {
    gk: GoalKPI;
    rate: number | null;
    selected: boolean;
  };
  const isAgg = gk.goalKpiType === "aggregate";
  return (
    <div
      className={`kpid-gk-node${isAgg ? " agg" : ""}${selected ? " selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} id="target-left" />
      <div className="kpid-gk-header">
        <span className="kpid-gk-label" title={gk.label}>
          {gk.label}
        </span>
        <span className={`kpid-type-badge${isAgg ? " agg" : ""}`}>
          {isAgg ? "聚合" : "直接"}
        </span>
      </div>
      <div className="kpid-gk-rate">
        {rate !== null ? `${rate}%` : "─"} / 目標&nbsp;{gk.target ?? "─"}&nbsp;
        {gk.unit}
      </div>
      <Handle type="source" position={Position.Right} id="source-right" />
    </div>
  );
}

// ─── Activity Node ────────────────────────────────────────────────────────────

function ActivityNode({ data }: NodeProps) {
  const { activity, selected } = data as {
    activity: DeptActivity;
    selected: boolean;
  };
  return (
    <div className={`kpid-act-node${selected ? " selected" : ""}`}>
      <Handle type="target" position={Position.Left} id="target-left" />
      <div className="kpid-act-header" title={activity.rawText}>
        {activity.rawText || "活動"}
      </div>
      {activity.kpis.length === 0 && <div className="kpid-no-kpi">無 KPI</div>}
      {activity.kpis.map((kpi) => (
        <div key={kpi.id} className="kpid-kpi-row">
          <span className="kpid-kpi-name">
            {kpi.name || kpi.label || `KPI#${kpi.id.slice(-4)}`}
          </span>
          <span className="kpid-kpi-val">
            {kpi.actual ?? "─"}/{kpi.target ?? "─"}
            {kpi.unit}
          </span>
        </div>
      ))}
    </div>
  );
}

const NODE_TYPES = {
  oNode: ONode,
  goalNode: GoalNode,
  strategyNode: StrategyNode,
  goalKpiNode: GoalKpiNode,
  activityNode: ActivityNode,
};

// ─── GoalKPI Config Panel ─────────────────────────────────────────────────────

interface ConfigPanelProps {
  gk: GoalKPI;
  draftGoal: Goal;
  allGoals: Goal[];
  deptActivities: DeptActivity[];
  onUpdate: (updated: GoalKPI) => void;
  onClose: () => void;
}

function GoalKpiConfigPanel({
  gk,
  draftGoal,
  allGoals,
  deptActivities,
  onUpdate,
  onClose,
}: ConfigPanelProps) {
  const isAgg = gk.goalKpiType === "aggregate";

  return (
    <div className="kpid-config-panel">
      <div className="kpid-config-header">
        <span className="kpid-config-title" title={gk.label}>
          {gk.label}
        </span>
        <button className="kpid-config-close" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Type toggle */}
      <div className="kpid-config-section">
        <div className="kpid-config-label">GoalKPI 類型</div>
        <div className="kpid-type-toggle">
          <button
            className={`kpid-type-btn${!isAgg ? " active" : ""}`}
            onClick={() => onUpdate({ ...gk, goalKpiType: "direct" })}
          >
            直接映射
          </button>
          <button
            className={`kpid-type-btn${isAgg ? " active" : ""}`}
            onClick={() => onUpdate({ ...gk, goalKpiType: "aggregate" })}
          >
            聚合 GoalKPI
          </button>
        </div>
      </div>

      {isAgg ? (
        <div className="kpid-config-section">
          <div className="kpid-config-label">連結的 GoalKPI</div>
          {(gk.linkedGoalKpis ?? []).length === 0 && (
            <div className="kpid-empty-links">請從下方選單新增連結 GoalKPI</div>
          )}
          {(gk.linkedGoalKpis ?? []).map((link, idx) => {
            const refGoal = allGoals.find((g) => g.id === link.goalId);
            const refGk = refGoal?.goalKpis?.find(
              (g) => g.id === link.goalKpiId,
            );
            return (
              <div
                key={`${link.goalId}-${link.goalKpiId}`}
                className="kpid-linked-row"
              >
                <span
                  className="kpid-linked-name"
                  title={`${refGoal?.label ?? link.goalId} / ${refGk?.label ?? link.goalKpiId}`}
                >
                  {refGoal?.label ?? link.goalId}&nbsp;/&nbsp;
                  {refGk?.label ?? link.goalKpiId}
                </span>
                <label className="kpid-weight-label">
                  權重
                  <input
                    type="number"
                    className="kpid-weight-input"
                    min={0}
                    max={1}
                    step={0.1}
                    value={link.weight}
                    onChange={(e) => {
                      const w = Math.min(
                        1,
                        Math.max(0, parseFloat(e.target.value) || 0),
                      );
                      onUpdate({
                        ...gk,
                        linkedGoalKpis: gk.linkedGoalKpis!.map((l, i) =>
                          i === idx ? { ...l, weight: w } : l,
                        ),
                      });
                    }}
                  />
                </label>
                <button
                  className="kpid-remove-btn"
                  title="移除"
                  onClick={() =>
                    onUpdate({
                      ...gk,
                      linkedGoalKpis: gk.linkedGoalKpis!.filter(
                        (_, i) => i !== idx,
                      ),
                    })
                  }
                >
                  ✕
                </button>
              </div>
            );
          })}
          <select
            className="kpid-add-select"
            value=""
            onChange={(e) => {
              const [goalId, goalKpiId] = e.target.value.split("::");
              if (!goalId) return;
              if (gk.linkedGoalKpis?.some((l) => l.goalKpiId === goalKpiId))
                return;
              onUpdate({
                ...gk,
                linkedGoalKpis: [
                  ...(gk.linkedGoalKpis ?? []),
                  { goalId, goalKpiId, weight: 1 },
                ],
              });
            }}
          >
            <option value="">── 新增連結 GoalKPI...</option>
            {allGoals.flatMap((g) =>
              (g.goalKpis ?? [])
                .filter((subGk) => subGk.id !== gk.id)
                .map((subGk) => (
                  <option
                    key={`${g.id}::${subGk.id}`}
                    value={`${g.id}::${subGk.id}`}
                  >
                    {g.label} / {subGk.label}
                  </option>
                )),
            )}
          </select>
        </div>
      ) : (
        <div className="kpid-config-section">
          <div className="kpid-config-label">連結的活動 KPI</div>
          {gk.linkedKpis.length === 0 && (
            <div className="kpid-empty-links">請從下方選單新增連結 KPI</div>
          )}
          {gk.linkedKpis.map((link, idx) => {
            const actId =
              link.activityId ||
              ((link as unknown as Record<string, string>).measureId ?? "");
            const act = deptActivities.find((a) => a.id === actId);
            const kpi = act?.kpis.find((k) => k.id === link.kpiId);
            return (
              <div key={`${actId}-${link.kpiId}`} className="kpid-linked-row">
                <span
                  className="kpid-linked-name"
                  title={`${act?.rawText ?? actId} / ${(kpi as { name?: string; label?: string } | undefined)?.name ?? kpi?.label ?? link.kpiId}`}
                >
                  {act?.rawText ?? actId}&nbsp;/&nbsp;
                  {kpi?.name ?? kpi?.label ?? link.kpiId}
                </span>
                <button
                  className="kpid-remove-btn"
                  title="移除"
                  onClick={() =>
                    onUpdate({
                      ...gk,
                      linkedKpis: gk.linkedKpis.filter((_, i) => i !== idx),
                    })
                  }
                >
                  ✕
                </button>
              </div>
            );
          })}
          <select
            className="kpid-add-select"
            value=""
            onChange={(e) => {
              const [actId, kpiId] = e.target.value.split("::");
              if (!actId) return;
              if (
                gk.linkedKpis.some(
                  (l) =>
                    (l.activityId ||
                      ((l as unknown as Record<string, string>).measureId ??
                        "")) === actId && l.kpiId === kpiId,
                )
              )
                return;
              onUpdate({
                ...gk,
                linkedKpis: [...gk.linkedKpis, { activityId: actId, kpiId }],
              });
            }}
          >
            <option value="">── 新增連結活動 KPI...</option>
            {deptActivities.flatMap((act) =>
              (act.kpis ?? []).map((kpi) => (
                <option
                  key={`${act.id}::${kpi.id}`}
                  value={`${act.id}::${kpi.id}`}
                >
                  {act.rawText || act.id}&nbsp;/&nbsp;{kpi.name || kpi.id}
                </option>
              )),
            )}
          </select>
          {(() => {
            const linkedActIds = new Set(
              gk.linkedKpis.map(
                (l) =>
                  l.activityId ||
                  ((l as unknown as Record<string, string>).measureId ?? ""),
              ),
            );
            const unlinked = deptActivities.filter(
              (a) => !linkedActIds.has(a.id) && a.kpis.length > 0,
            );
            if (unlinked.length === 0) return null;
            return (
              <div className="kpid-unlinked-hint">
                {unlinked.length} 個活動含有 KPI 尚未連結
              </div>
            );
          })()}
          {gk.linkedKpis.length > 0 && (
            <div className="kpid-linked-summary">
              <div className="kpid-config-label" style={{ marginTop: 8 }}>
                KPI 實績
              </div>
              {gk.linkedKpis.map((link) => {
                const actId =
                  link.activityId ||
                  ((link as unknown as Record<string, string>).measureId ?? "");
                const act = deptActivities.find((a) => a.id === actId);
                const kpi = act?.kpis.find((k) => k.id === link.kpiId);
                if (!kpi) return null;
                const rate = kpi.achievementRate;
                return (
                  <div
                    key={`${actId}-${link.kpiId}`}
                    className="kpid-kpi-summary-row"
                  >
                    <span className="kpid-kpi-summary-name">
                      {kpi.name || kpi.label || link.kpiId}
                    </span>
                    <span className="kpid-kpi-summary-val">
                      {kpi.actual ?? "─"}&nbsp;/&nbsp;{kpi.target ?? "─"}&nbsp;
                      {kpi.unit}
                    </span>
                    {rate != null && (
                      <span
                        className={`kpid-kpi-summary-rate${rate >= 100 ? " done" : rate >= 60 ? " ok" : " warn"}`}
                      >
                        {rate}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Aggregate weight sum warning */}
      {isAgg &&
        (gk.linkedGoalKpis ?? []).length > 0 &&
        (() => {
          const sum = (gk.linkedGoalKpis ?? []).reduce(
            (a, l) => a + l.weight,
            0,
          );
          const pct = Math.round(sum * 100);
          if (Math.abs(sum - 1) > 0.01) {
            return (
              <div className="kpid-weight-warn">
                警告：權重加總 = {pct}%，建議調整至 100%
              </div>
            );
          }
          return <div className="kpid-weight-ok">✓ 權重加總 = {pct}%</div>;
        })()}

      {/* Preview computed rate */}
      {(() => {
        if (!draftGoal) return null;
        const result = computeGoalKpiResult(
          gk,
          draftGoal,
          deptActivities,
          allGoals,
        );
        return (
          <div className="kpid-preview">
            <div className="kpid-config-label">預覽結果</div>
            <div className="kpid-preview-row">
              <span>實際值</span>
              <strong>{result.actual ?? "─"}</strong>
            </div>
            <div className="kpid-preview-row">
              <span>目標值</span>
              <strong>
                {result.target ?? "─"}&nbsp;{gk.unit}
              </strong>
            </div>
            <div className="kpid-preview-row">
              <span>達成率</span>
              <strong
                className={
                  result.rate != null
                    ? result.rate >= 100
                      ? "rate-done"
                      : result.rate >= 60
                        ? "rate-ok"
                        : "rate-warn"
                    : ""
                }
              >
                {result.rate != null ? `${result.rate}%` : "─"}
              </strong>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── OGS Tree (left panel) ────────────────────────────────────────────────────

interface OgsTreeProps {
  data: OGSMData;
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onUpdateData: (d: OGSMData) => void;
  onAddGoal: () => void;
  onDeleteGoal: (id: string) => void;
  onAddStrategyToGoal: (goalId: string) => void;
  onDeleteStrategy: (stratId: string) => void;
  style?: React.CSSProperties;
}

function OgsTree({
  data,
  selectedNodeId,
  onSelectNode,
  onUpdateData,
  onAddGoal,
  onDeleteGoal,
  onAddStrategyToGoal,
  onDeleteStrategy,
  style,
}: OgsTreeProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const startEdit = (id: string, current: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingId(id);
    setEditText(current);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const commitEdit = () => {
    if (!editingId) return;
    const id = editingId;
    const text = editText.trim();
    setEditingId(null);

    if (id === "o") {
      onUpdateData({
        ...data,
        objectives: { ...data.objectives, deptO: text },
      });
    } else if (id.startsWith("g-")) {
      const gid = id.slice(2);
      const [labelPart, ...rest] = text.split(" ");
      const newLabel = rest.length
        ? labelPart
        : (data.goals.find((g) => g.id === gid)?.label ?? "");
      const newTitle = rest.length ? rest.join(" ") : text;
      onUpdateData({
        ...data,
        goals: data.goals.map((g) =>
          g.id !== gid
            ? g
            : {
                ...g,
                label: newLabel || g.label,
                title: newTitle || g.title,
                updatedAt: new Date().toISOString(),
              },
        ),
      });
    } else if (id.startsWith("s-")) {
      const sid = id.slice(2);
      onUpdateData({
        ...data,
        goals: data.goals.map((g) => ({
          ...g,
          strategies: g.strategies.map((s) =>
            s.id !== sid
              ? s
              : {
                  ...s,
                  title: text || s.title,
                  updatedAt: new Date().toISOString(),
                },
          ),
        })),
      });
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement))
      commitEdit();
    if (e.key === "Escape") setEditingId(null);
  };

  return (
    <div className="kpid-ogs-tree" style={style}>
      {/* O */}
      <div className="kpid-tree-section-label">組織目標 (O)</div>
      <div
        className={`kpid-tree-o${selectedNodeId === "o" ? " selected" : ""}`}
        onClick={() => onSelectNode("o")}
      >
        {editingId === "o" ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            className="kpid-tree-edit"
            value={editText}
            rows={3}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKey}
          />
        ) : (
          <span
            className="kpid-tree-o-text"
            onDoubleClick={() => startEdit("o", data.objectives.deptO)}
          >
            {data.objectives.deptO || "（雙擊編輯組織目標）"}
          </span>
        )}
      </div>

      {/* G list */}
      <div className="kpid-tree-section-label">
        目標 (G)
        <button
          className="kpid-tree-add-btn"
          onClick={onAddGoal}
          title="新增目標"
        >
          ＋
        </button>
      </div>
      <div className="kpid-tree-g-list">
        {data.goals.map((g) => (
          <div key={g.id} className="kpid-tree-g-item">
            <div
              className={`kpid-tree-g-header${selectedNodeId === `g-${g.id}` ? " selected" : ""}`}
              onClick={() => onSelectNode(`g-${g.id}`)}
            >
              <span className="kpid-tree-g-label">{g.label}</span>
              {editingId === `g-${g.id}` ? (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  className="kpid-tree-edit-inline"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleKey}
                />
              ) : (
                <span
                  className="kpid-tree-g-title"
                  onDoubleClick={(e) =>
                    startEdit(`g-${g.id}`, `${g.label} ${g.title}`, e)
                  }
                >
                  {g.title}
                </span>
              )}
              <div className="kpid-tree-actions">
                <button
                  className="kpid-tree-action-btn"
                  title="新增策略"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddStrategyToGoal(g.id);
                  }}
                >
                  S＋
                </button>
                <button
                  className="kpid-tree-action-btn del"
                  title="刪除目標"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteGoal(g.id);
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {g.strategies.length > 0 && (
              <div className="kpid-tree-s-list">
                {g.strategies.map((s) => (
                  <div
                    key={s.id}
                    className={`kpid-tree-s-item${selectedNodeId === `s-${s.id}` ? " selected" : ""}`}
                    onClick={() => onSelectNode(`s-${s.id}`)}
                  >
                    {editingId === `s-${s.id}` ? (
                      <input
                        ref={inputRef as React.RefObject<HTMLInputElement>}
                        className="kpid-tree-edit-inline"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={handleKey}
                      />
                    ) : (
                      <span
                        className="kpid-tree-s-title"
                        onDoubleClick={(e) =>
                          startEdit(`s-${s.id}`, s.title, e)
                        }
                      >
                        {s.title}
                      </span>
                    )}
                    <button
                      className="kpid-tree-action-btn del"
                      title="刪除策略"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteStrategy(s.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            {(g.goalKpis?.length ?? 0) > 0 && (
              <div className="kpid-tree-gk-list">
                {g.goalKpis!.map((gk) => (
                  <div
                    key={gk.id}
                    className={`kpid-tree-gk-tag${gk.goalKpiType === "aggregate" ? " agg" : ""}${selectedNodeId === `gk-${gk.id}` ? " selected" : ""}`}
                    onClick={() => onSelectNode(`gk-${gk.id}`)}
                    title={
                      gk.goalKpiType === "aggregate" ? "聚合 KPI" : "直接 KPI"
                    }
                  >
                    {gk.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── KPI Goal Tree (left panel for KPI mode) ──────────────────────────────────

interface KpiGoalTreeProps {
  draftGoals: Goal[];
  deptActivities: DeptActivity[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onAddGoalKpi: (goalId: string) => void;
  style?: React.CSSProperties;
}

function KpiGoalTree({
  draftGoals,
  deptActivities,
  selectedNodeId,
  onSelectNode,
  onAddGoalKpi,
  style,
}: KpiGoalTreeProps) {
  return (
    <div className="kpid-ogs-tree" style={style}>
      <div className="kpid-tree-section-label">KPI 模式 — 目標 GoalKPI</div>
      <div className="kpid-tree-g-list">
        {draftGoals.map((g) => {
          const gkpis = g.goalKpis ?? [];
          return (
            <div key={g.id} className="kpid-tree-g-item">
              <div
                className={`kpid-tree-g-header${selectedNodeId === `g-${g.id}` ? " selected" : ""}`}
                onClick={() => onSelectNode(`g-${g.id}`)}
              >
                <span className="kpid-tree-g-label">{g.label}</span>
                <span className="kpid-tree-g-title">{g.title}</span>
                <div className="kpid-tree-actions">
                  <button
                    className="kpid-tree-add-btn"
                    title="新增 GoalKPI"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddGoalKpi(g.id);
                    }}
                  >
                    KPI＋
                  </button>
                </div>
              </div>
              {gkpis.length > 0 ? (
                <div className="kpid-tree-gk-rows">
                  {gkpis.map((gk) => {
                    const result = computeGoalKpiResult(
                      gk,
                      g,
                      deptActivities,
                      draftGoals,
                    );
                    const rate = result.rate;
                    return (
                      <div
                        key={gk.id}
                        className={`kpid-tree-gk-full-row${selectedNodeId === `gk-${gk.id}` ? " selected" : ""}`}
                        onClick={() => onSelectNode(`gk-${gk.id}`)}
                      >
                        <span
                          className={`kpid-tree-gk-type-tag${gk.goalKpiType === "aggregate" ? " agg" : ""}`}
                        >
                          {gk.goalKpiType === "aggregate" ? "聚" : "直"}
                        </span>
                        {gk.isHeadline && (
                          <span className="kpid-tree-gk-star">★</span>
                        )}
                        <span
                          className="kpid-tree-gk-fullname"
                          title={gk.label}
                        >
                          {gk.label}
                        </span>
                        <span
                          className={`kpid-tree-gk-pct${rate !== null ? (rate >= 100 ? " done" : rate >= 60 ? " ok" : " warn") : ""}`}
                        >
                          {rate !== null ? `${rate}%` : "─"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="kpid-tree-gk-none">尚無 GoalKPI</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── GoalKPI List Panel (right panel for G node in KPI mode) ─────────────────

interface GoalKpiListPanelProps {
  draftGoal: Goal;
  allGoals: Goal[];
  deptActivities: DeptActivity[];
  onUpdateGoalKpis: (goalId: string, kpis: GoalKPI[]) => void;
  onClose: () => void;
}

function GoalKpiListPanel({
  draftGoal,
  allGoals,
  deptActivities,
  onUpdateGoalKpis,
  onClose,
}: GoalKpiListPanelProps) {
  const gkpis = draftGoal.goalKpis ?? [];

  const updateGk = (updated: GoalKPI) =>
    onUpdateGoalKpis(
      draftGoal.id,
      gkpis.map((gk) => (gk.id === updated.id ? updated : gk)),
    );

  const deleteGk = (gkId: string) =>
    onUpdateGoalKpis(
      draftGoal.id,
      gkpis.filter((gk) => gk.id !== gkId),
    );

  const addGk = () => {
    const newGk: GoalKPI = {
      id: genId("gk"),
      label: "新 GoalKPI",
      unit: "",
      target: null,
      aggregation: "AVERAGE",
      linkedKpis: [],
      goalKpiType: "direct",
    };
    onUpdateGoalKpis(draftGoal.id, [...gkpis, newGk]);
  };

  return (
    <div className="kpid-node-config">
      <div className="kpid-config-header">
        <span className="kpid-config-title">
          {draftGoal.label}｜GoalKPI 設定
        </span>
        <button className="kpid-config-close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="kpid-config-section">
        <div
          className="kpid-config-label"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>GoalKPI 列表（{gkpis.length} 個）</span>
          <button className="kpid-tree-add-btn" onClick={addGk}>
            ＋ 新增
          </button>
        </div>
        {gkpis.length === 0 && (
          <div className="kpid-empty-links">
            尚無 GoalKPI，按「＋ 新增」建立
          </div>
        )}
        {gkpis.map((gk) => {
          const result = computeGoalKpiResult(
            gk,
            draftGoal,
            deptActivities,
            allGoals,
          );
          return (
            <div key={gk.id} className="kpid-gkl-item">
              {/* Row 1: label input + delete */}
              <div className="kpid-gkl-row1">
                <input
                  className="kpid-gkl-label-input"
                  value={gk.label}
                  placeholder="KPI 名稱"
                  onChange={(e) => updateGk({ ...gk, label: e.target.value })}
                />
                <button
                  className="kpid-remove-btn"
                  title="刪除"
                  onClick={() => deleteGk(gk.id)}
                >
                  ✕
                </button>
              </div>
              {/* Row 2: target, unit, headline, type */}
              <div className="kpid-gkl-row2">
                <label className="kpid-gkl-field">
                  目標
                  <input
                    type="number"
                    className="kpid-weight-input"
                    value={gk.target ?? ""}
                    onChange={(e) =>
                      updateGk({
                        ...gk,
                        target: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      })
                    }
                  />
                </label>
                <label className="kpid-gkl-field">
                  單位
                  <input
                    className="kpid-weight-input"
                    style={{ width: 40 }}
                    value={gk.unit}
                    onChange={(e) => updateGk({ ...gk, unit: e.target.value })}
                  />
                </label>
                <label
                  className="kpid-gkl-field"
                  style={{ cursor: "pointer" }}
                  title="標示為標題 KPI（顯示在 G 節點上）"
                >
                  <input
                    type="checkbox"
                    checked={gk.isHeadline ?? false}
                    onChange={(e) =>
                      updateGk({ ...gk, isHeadline: e.target.checked })
                    }
                  />
                  ★ 標題
                </label>
                <label
                  className="kpid-gkl-field"
                  style={{ cursor: "pointer" }}
                  title="切換為聚合 GoalKPI"
                >
                  <input
                    type="checkbox"
                    checked={gk.goalKpiType === "aggregate"}
                    onChange={(e) =>
                      updateGk({
                        ...gk,
                        goalKpiType: e.target.checked ? "aggregate" : "direct",
                      })
                    }
                  />
                  聚合
                </label>
              </div>
              {/* Row 3: computed result preview */}
              <div className="kpid-gkl-result">
                {result.rate !== null ? (
                  <>
                    <span>
                      {result.actual ?? "─"} / {result.target ?? "─"} {gk.unit}
                    </span>
                    <span
                      className={`kpid-kpi-summary-rate${result.rate >= 100 ? " done" : result.rate >= 60 ? " ok" : " warn"}`}
                    >
                      {result.rate}%
                    </span>
                  </>
                ) : (
                  <span className="kpid-config-hint">尚無實績</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Node Config (right panel) ────────────────────────────────────────────────

interface NodeConfigProps {
  selectedNodeId: string | null;
  viewMode: ViewMode;
  data: OGSMData;
  draftGoals: Goal[];
  deptActivities: DeptActivity[];
  onUpdateDraftGk: (gk: GoalKPI, goalId: string) => void;
  onUpdateGoalKpis: (goalId: string, kpis: GoalKPI[]) => void;
  onClose: () => void;
}

function NodeConfig({
  selectedNodeId,
  viewMode,
  data,
  draftGoals,
  deptActivities,
  onUpdateDraftGk,
  onUpdateGoalKpis,
  onClose,
}: NodeConfigProps) {
  if (!selectedNodeId) return null;

  if (selectedNodeId === "o") {
    return (
      <div className="kpid-node-config">
        <div className="kpid-config-header">
          <span className="kpid-config-title">O 組織目標</span>
          <button className="kpid-config-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="kpid-config-section">
          <p className="kpid-config-hint">
            雙擊左側樹狀文字可直接編輯組織目標。
          </p>
        </div>
      </div>
    );
  }

  if (selectedNodeId.startsWith("g-")) {
    const gid = selectedNodeId.slice(2);
    const draftGoal = draftGoals.find((x) => x.id === gid);
    if (!draftGoal) return null;

    // KPI mode: full GoalKPI management panel
    if (viewMode === "kpi") {
      return (
        <GoalKpiListPanel
          draftGoal={draftGoal}
          allGoals={draftGoals}
          deptActivities={deptActivities}
          onUpdateGoalKpis={onUpdateGoalKpis}
          onClose={onClose}
        />
      );
    }

    // Item mode: simple info panel
    return (
      <div className="kpid-node-config">
        <div className="kpid-config-header">
          <span className="kpid-config-title">
            {draftGoal.label}｜{draftGoal.title}
          </span>
          <button className="kpid-config-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="kpid-config-section">
          <div className="kpid-config-label">GoalKPI 數量</div>
          <p>{draftGoal.goalKpis?.length ?? 0} 個 KPI，切換 KPI 模式可管理</p>
          <div className="kpid-config-label">策略數量</div>
          <p>{draftGoal.strategies.length} 個策略</p>
          <p className="kpid-config-hint">雙擊左側標題可編輯目標名稱。</p>
        </div>
      </div>
    );
  }

  if (selectedNodeId.startsWith("s-")) {
    const sid = selectedNodeId.slice(2);
    const g = data.goals.find((g) => g.strategies.some((s) => s.id === sid));
    const s = g?.strategies.find((s) => s.id === sid);
    if (!s) return null;
    return (
      <div className="kpid-node-config">
        <div className="kpid-config-header">
          <span className="kpid-config-title">S｜{s.title}</span>
          <button className="kpid-config-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="kpid-config-section">
          {s.owners.length > 0 && (
            <>
              <div className="kpid-config-label">負責人</div>
              <p>{s.owners.join("、")}</p>
            </>
          )}
          <p className="kpid-config-hint">
            雙擊左側策略名稱可直接編輯。更多策略設定請返回 OGSM 主畫面。
          </p>
        </div>
      </div>
    );
  }

  if (selectedNodeId.startsWith("gk-")) {
    const gkId = selectedNodeId.slice(3);
    const draftGoal = draftGoals.find((g) =>
      g.goalKpis?.some((gk) => gk.id === gkId),
    );
    const gk = draftGoal?.goalKpis?.find((gk) => gk.id === gkId);
    if (!gk || !draftGoal) {
      return (
        <div className="kpid-node-config">
          <div className="kpid-config-header">
            <span className="kpid-config-title">GoalKPI</span>
            <button className="kpid-config-close" onClick={onClose}>
              ✕
            </button>
          </div>
          <p className="kpid-config-hint" style={{ padding: "12px" }}>
            找不到此 KPI，請重新整理。
          </p>
        </div>
      );
    }
    return (
      <GoalKpiConfigPanel
        gk={gk}
        draftGoal={draftGoal}
        allGoals={draftGoals}
        deptActivities={deptActivities}
        onUpdate={(updated) => onUpdateDraftGk(updated, draftGoal.id)}
        onClose={onClose}
      />
    );
  }

  if (selectedNodeId.startsWith("act-")) {
    const actId = selectedNodeId.slice(4);
    const act = deptActivities.find((a) => a.id === actId);
    if (!act) return null;
    return (
      <div className="kpid-node-config">
        <div className="kpid-config-header">
          <span className="kpid-config-title">M｜{act.rawText || "活動"}</span>
          <button className="kpid-config-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="kpid-config-section">
          <div className="kpid-config-label">活動 KPI</div>
          {act.kpis.length === 0 && <p>尚無 KPI</p>}
          {act.kpis.map((kpi) => (
            <div key={kpi.id} className="kpid-kpi-summary-row">
              <span className="kpid-kpi-summary-name">
                {kpi.name || kpi.label}
              </span>
              <span className="kpid-kpi-summary-val">
                {kpi.actual ?? "─"}&nbsp;/&nbsp;{kpi.target ?? "─"}&nbsp;
                {kpi.unit}
              </span>
              {kpi.achievementRate != null && (
                <span
                  className={`kpid-kpi-summary-rate${kpi.achievementRate >= 100 ? " done" : kpi.achievementRate >= 60 ? " ok" : " warn"}`}
                >
                  {kpi.achievementRate}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

// ─── Main KpiDesigner ─────────────────────────────────────────────────────────

export default function KpiDesigner({
  data,
  deptActivities,
  initialGoalId,
  onUpdateData,
  onAddGoal,
  onDeleteGoal,
  onAddStrategyToGoal,
  onDeleteStrategy,
  onClose: _onClose,
}: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialGoalId ? `g-${initialGoalId}` : null,
  );
  const [draftGoals, setDraftGoals] = useState<Goal[]>(() => data.goals);
  const [hasDraftGkChanges, setHasDraftGkChanges] = useState(false);
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(320);
  const dragging = useRef<{
    which: "left" | "right";
    startX: number;
    startW: number;
  } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const dx = e.clientX - dragging.current.startX;
      if (dragging.current.which === "left") {
        setLeftWidth(
          Math.max(160, Math.min(460, dragging.current.startW + dx)),
        );
      } else {
        setRightWidth(
          Math.max(220, Math.min(500, dragging.current.startW - dx)),
        );
      }
    };
    const onUp = () => {
      dragging.current = null;
      document.body.style.cursor = "";
      document.body.style.removeProperty("user-select");
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

  // Sync draftGoals when external data.goals changes (e.g. after add/delete)
  useEffect(() => {
    setDraftGoals((prev) =>
      data.goals.map((g) => {
        const draft = prev.find((d) => d.id === g.id);
        if (!draft) return g;
        return { ...g, goalKpis: draft.goalKpis };
      }),
    );
  }, [data.goals]);

  const [viewMode, setViewMode] = useState<ViewMode>("item");
  // Track previous viewMode to know when mode switches (position reset needed)
  const prevViewModeRef = useRef<ViewMode>("item");

  const [nodes, setNodes, onNodesChange] = useNodesState(
    buildItemNodes(data, deptActivities, selectedNodeId),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    buildItemEdges({ ...data, goals: draftGoals }),
  );

  // Rebuild canvas when data, draftGoals, or viewMode changes.
  // Preserve user-moved node positions when only data changes (not mode switch).
  useEffect(() => {
    const modeChanged = prevViewModeRef.current !== viewMode;
    prevViewModeRef.current = viewMode;
    const fullData = { ...data, goals: draftGoals };
    if (viewMode === "item") {
      const newNodes = buildItemNodes(fullData, deptActivities, selectedNodeId);
      if (modeChanged) {
        setNodes(newNodes);
      } else {
        setNodes((prev) => {
          const posMap = new Map(prev.map((n) => [n.id, n.position]));
          return newNodes.map((n) =>
            posMap.has(n.id) ? { ...n, position: posMap.get(n.id)! } : n,
          );
        });
      }
      setEdges(buildItemEdges(fullData));
    } else {
      const newNodes = buildKpiNodes(fullData, deptActivities, selectedNodeId);
      if (modeChanged) {
        setNodes(newNodes);
      } else {
        setNodes((prev) => {
          const posMap = new Map(prev.map((n) => [n.id, n.position]));
          return newNodes.map((n) =>
            posMap.has(n.id) ? { ...n, position: posMap.get(n.id)! } : n,
          );
        });
      }
      setEdges(buildKpiEdges(fullData));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftGoals, data, viewMode]);

  // Rebuild node highlights when selection changes
  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: { ...n.data, selected: n.id === selectedNodeId },
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  const updateDraftGk = useCallback(
    (updatedGk: GoalKPI, goalId: string) => {
      setDraftGoals((prev) =>
        prev.map((g) =>
          g.id !== goalId
            ? g
            : {
                ...g,
                goalKpis: g.goalKpis?.map((gk) =>
                  gk.id === updatedGk.id ? updatedGk : gk,
                ),
              },
        ),
      );
      setHasDraftGkChanges(true);
      if (updatedGk.goalKpiType !== "aggregate") {
        setNodes((prevNodes) => {
          const existingActIds = new Set(
            prevNodes
              .filter((n) => n.id.startsWith("act-"))
              .map((n) => n.id.slice(4)),
          );
          const newActNodes: Node[] = updatedGk.linkedKpis
            .map((l) => l.activityId)
            .filter((id) => !existingActIds.has(id))
            .map((id) => deptActivities.find((a) => a.id === id))
            .filter((a): a is DeptActivity => Boolean(a))
            .map((act, i) => ({
              id: `act-${act.id}`,
              type: "activityNode",
              position: {
                x: KPI_ACT_X,
                y:
                  prevNodes.filter((n) => n.id.startsWith("act-")).length *
                    130 +
                  i * 130,
              },
              data: { activity: act, selected: false },
            }));
          return [...prevNodes, ...newActNodes];
        });
      }
    },
    [deptActivities],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const { source, target } = connection;
      if (!source || !target) return;
      const srcGkId = source.startsWith("gk-") ? source.slice(3) : null;
      const tgtActId = target.startsWith("act-") ? target.slice(4) : null;
      const tgtGkId = target.startsWith("gk-") ? target.slice(3) : null;

      if (srcGkId && tgtActId) {
        const goal = draftGoals.find((g) =>
          g.goalKpis?.some((gk) => gk.id === srcGkId),
        );
        const gk = goal?.goalKpis?.find((gk) => gk.id === srcGkId);
        if (!gk || !goal || gk.goalKpiType === "aggregate") return;
        // Use first available KPI of this activity not yet linked
        const act = deptActivities.find((a) => a.id === tgtActId);
        const usedKpiIds = gk.linkedKpis
          .filter((l) => l.activityId === tgtActId)
          .map((l) => l.kpiId);
        const firstKpi = act?.kpis.find((k) => !usedKpiIds.includes(k.id));
        if (!firstKpi) return;
        updateDraftGk(
          {
            ...gk,
            linkedKpis: [
              ...gk.linkedKpis,
              { activityId: tgtActId, kpiId: firstKpi.id },
            ],
          },
          goal.id,
        );
      } else if (srcGkId && tgtGkId) {
        const goal = draftGoals.find((g) =>
          g.goalKpis?.some((gk) => gk.id === srcGkId),
        );
        const gk = goal?.goalKpis?.find((gk) => gk.id === srcGkId);
        if (!gk || !goal) return;
        if (gk.linkedGoalKpis?.some((l) => l.goalKpiId === tgtGkId)) return;
        updateDraftGk(
          {
            ...gk,
            goalKpiType: "aggregate",
            linkedGoalKpis: [
              ...(gk.linkedGoalKpis ?? []),
              { goalId: goal.id, goalKpiId: tgtGkId, weight: 1 },
            ],
          },
          goal.id,
        );
      }
    },
    [draftGoals, updateDraftGk, deptActivities],
  );

  const onEdgesDelete = useCallback(
    (deletedEdges: Edge[]) => {
      for (const edge of deletedEdges) {
        const srcGkId = edge.source.startsWith("gk-")
          ? edge.source.slice(3)
          : null;
        const tgtActId = edge.target.startsWith("act-")
          ? edge.target.slice(4)
          : null;
        const tgtGkId = edge.target.startsWith("gk-")
          ? edge.target.slice(3)
          : null;
        if (!srcGkId) continue;
        const goal = draftGoals.find((g) =>
          g.goalKpis?.some((gk) => gk.id === srcGkId),
        );
        const gk = goal?.goalKpis?.find((gk) => gk.id === srcGkId);
        if (!gk || !goal) continue;
        if (tgtActId) {
          updateDraftGk(
            {
              ...gk,
              linkedKpis: gk.linkedKpis.filter(
                (l) => l.activityId !== tgtActId,
              ),
            },
            goal.id,
          );
        } else if (tgtGkId) {
          updateDraftGk(
            {
              ...gk,
              linkedGoalKpis: (gk.linkedGoalKpis ?? []).filter(
                (l) => l.goalKpiId !== tgtGkId,
              ),
            },
            goal.id,
          );
        }
      }
    },
    [draftGoals, updateDraftGk],
  );

  const handleSaveGkChanges = useCallback(() => {
    let newData = data;
    for (const dg of draftGoals) {
      const original = data.goals.find((g) => g.id === dg.id);
      if (JSON.stringify(original?.goalKpis) !== JSON.stringify(dg.goalKpis)) {
        newData = {
          ...newData,
          goals: newData.goals.map((g) =>
            g.id === dg.id ? { ...dg, updatedAt: new Date().toISOString() } : g,
          ),
        };
      }
    }
    onUpdateData(newData);
    setHasDraftGkChanges(false);
  }, [draftGoals, data, onUpdateData]);

  const updateGoalKpis = useCallback((goalId: string, kpis: GoalKPI[]) => {
    setDraftGoals((prev) =>
      prev.map((g) => (g.id !== goalId ? g : { ...g, goalKpis: kpis })),
    );
    setHasDraftGkChanges(true);
  }, []);

  const addGoalKpi = useCallback((goalId: string) => {
    const newGk: GoalKPI = {
      id: genId("gk"),
      label: "新 GoalKPI",
      unit: "",
      target: null,
      aggregation: "AVERAGE",
      linkedKpis: [],
      goalKpiType: "direct",
    };
    setDraftGoals((prev) =>
      prev.map((g) =>
        g.id !== goalId
          ? g
          : { ...g, goalKpis: [...(g.goalKpis ?? []), newGk] },
      ),
    );
    setHasDraftGkChanges(true);
  }, []);

  const startDrag = (
    which: "left" | "right",
    e: React.MouseEvent,
    startW: number,
  ) => {
    e.preventDefault();
    dragging.current = { which, startX: e.clientX, startW };
    document.body.style.cursor = "col-resize";
    document.body.style.setProperty("user-select", "none");
  };

  return (
    <div className="kpid-root">
      {/* Left: mode-dependent tree */}
      {viewMode === "item" ? (
        <OgsTree
          style={{ width: leftWidth }}
          data={data}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onUpdateData={onUpdateData}
          onAddGoal={onAddGoal}
          onDeleteGoal={onDeleteGoal}
          onAddStrategyToGoal={onAddStrategyToGoal}
          onDeleteStrategy={onDeleteStrategy}
        />
      ) : (
        <KpiGoalTree
          style={{ width: leftWidth }}
          draftGoals={draftGoals}
          deptActivities={deptActivities}
          selectedNodeId={selectedNodeId}
          onSelectNode={setSelectedNodeId}
          onAddGoalKpi={addGoalKpi}
        />
      )}
      <div
        className="kpid-resize-handle"
        onMouseDown={(e) => startDrag("left", e, leftWidth)}
      />

      {/* Center: Full Canvas */}
      <div className="kpid-canvas-wrap">
        <div className="kpid-canvas-toolbar">
          <span className="kpid-canvas-title">目標編輯器 — OGSM 關係圖</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className={`kpid-mode-btn${viewMode === "item" ? " active" : ""}`}
              onClick={() => setViewMode("item")}
            >
              📋 項目模式
            </button>
            <button
              className={`kpid-mode-btn${viewMode === "kpi" ? " active" : ""}`}
              onClick={() => setViewMode("kpi")}
            >
              📊 KPI 模式
            </button>
          </div>
          {hasDraftGkChanges && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span className="kpid-unsaved-badge">KPI 未儲存</span>
              <button className="kpid-save-btn" onClick={handleSaveGkChanges}>
                💾 儲存 KPI 變更
              </button>
            </div>
          )}
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          fitView
          fitViewOptions={{ padding: 0.15, minZoom: 0.45 }}
          minZoom={0.2}
          maxZoom={2}
          deleteKeyCode="Delete"
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={16} color="#e5e7eb" />
          <Controls />
          <MiniMap nodeStrokeWidth={3} zoomable pannable />
          <Panel position="bottom-left">
            <div className="kpid-legend">
              <span className="kpid-legend-item" style={{ color: "#fb923c" }}>
                ── O線
              </span>
              <span className="kpid-legend-item" style={{ color: "#94a3b8" }}>
                ── G→S
              </span>
              <span className="kpid-legend-item" style={{ color: "#06b6d4" }}>
                ── GK直接
              </span>
              <span className="kpid-legend-item" style={{ color: "#a855f7" }}>
                ── 聚合
              </span>
              <span className="kpid-legend-item" style={{ color: "#3b82f6" }}>
                ── KPI連
              </span>
            </div>
          </Panel>
        </ReactFlow>
      </div>

      {/* Right: Node Config */}
      {selectedNodeId && (
        <>
          <div
            className="kpid-resize-handle"
            onMouseDown={(e) => startDrag("right", e, rightWidth)}
          />
          <div
            style={{
              width: rightWidth,
              flexShrink: 0,
              display: "flex",
              overflow: "hidden",
            }}
          >
            <NodeConfig
              selectedNodeId={selectedNodeId}
              viewMode={viewMode}
              data={data}
              draftGoals={draftGoals}
              deptActivities={deptActivities}
              onUpdateDraftGk={updateDraftGk}
              onUpdateGoalKpis={updateGoalKpis}
              onClose={() => setSelectedNodeId(null)}
            />
          </div>
        </>
      )}
    </div>
  );
}
