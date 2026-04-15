import React, { useState, useCallback, useEffect, useRef } from "react";
import type {
  OGSMData,
  Goal,
  GoalKPI,
  Strategy,
  DeptActivity,
  FreeNode,
  KPI,
  PeriodData,
} from "../schemas/ogsm";
import { genId } from "../utils/csvParser";
import { computeGoalKpiResult } from "../utils/goalKpi";
import { computeKpiAchievement } from "../utils/kpiCalc";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  data: OGSMData;
  deptActivities: DeptActivity[];
  availablePeriods?: PeriodData[];
  initialGoalId?: string;
  isReadOnly?: boolean;
  periodId?: string;
  onSwitchPeriod?: (periodId: string) => void;
  onAddPeriod?: (halfYear: "H1" | "H2", year: number) => void;
  onCopyPeriod?: (
    sourcePeriodId: string,
    halfYear: "H1" | "H2",
    year: number,
  ) => void;
  onDeletePeriod?: (periodId: string) => void;
  onUpdateData: (d: OGSMData) => void;
  onDraftStateChange?: (hasDraft: boolean) => void;
  onUpdateActivity?: (act: DeptActivity) => void;
  onAddGoal: () => void;
  onDeleteGoal: (id: string) => void;
  onAddStrategyToGoal: (goalId: string) => void;
  onDeleteStrategy: (stratId: string) => void;
}

type ViewMode = "item" | "kpi";
type ModuleId = "ogsm" | "other" | null;

// ─── Item Canvas (replaces React Flow canvas) ────────────────────────────────

interface ItemCanvasProps {
  data: OGSMData;
  deptActivities: DeptActivity[];
  freeNodes: FreeNode[];
  periods: PeriodData[];
  activePeriodId?: string;
  onSwitchPeriod?: (periodId: string) => void;
  selectedNodeId: string | null;
  moduleId: ModuleId;
  onSelectNode: (id: string) => void;
}

function ItemCanvas({
  data,
  freeNodes,
  periods,
  activePeriodId,
  onSwitchPeriod,
  selectedNodeId,
  moduleId,
  onSelectNode,
}: ItemCanvasProps) {
  if (!moduleId) {
    return (
      <div className="kpid-canvas-empty">
        <div className="kpid-canvas-empty-icon">🎯</div>
        <div>請從上方下拉選單選擇模組</div>
      </div>
    );
  }

  if (moduleId === "other") {
    return (
      <div className="kpid-item-canvas">
        {freeNodes.length === 0 ? (
          <div className="kpid-canvas-empty">
            <div className="kpid-canvas-empty-icon">📋</div>
            <div>尚無自由節點，請從左側面板新增</div>
          </div>
        ) : (
          <div className="kpid-free-cards">
            {freeNodes.map((fn) => {
              const sel = selectedNodeId === `free-${fn.id}`;
              return (
                <div
                  key={fn.id}
                  className={`kpid-s-node kpid-cnv-free${sel ? " selected" : ""}`}
                  onClick={() => onSelectNode(`free-${fn.id}`)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="kpid-s-header">
                    <span className="kpid-s-badge">其</span>
                    <span className="kpid-s-title">
                      {fn.name || "自由節點"}
                    </span>
                  </div>
                  {fn.description && (
                    <div className="kpid-s-m-list">
                      <div className="kpid-s-m-item">
                        <span className="kpid-s-m-name">{fn.description}</span>
                      </div>
                    </div>
                  )}
                  {(fn.linkedActivityIds?.length ?? 0) > 0 && (
                    <div className="kpid-s-m-list">
                      <div className="kpid-s-m-item">
                        <span className="kpid-s-m-dot">🔗</span>
                        <span className="kpid-s-m-name">
                          {fn.linkedActivityIds.length} 個連結活動
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // OGSM mode: O → G → S org-tree (reuse OverviewPage structure)
  return (
    <div className="kpid-item-canvas">
      {data.goals.length === 0 ? (
        <div className="kpid-canvas-empty">
          <div className="kpid-canvas-empty-icon">🎯</div>
          <div>尚無目標，請從左側面板新增</div>
        </div>
      ) : (
        <div className="org-tree-wrap">
          <ul className="org-root">
            <li>
              {/* O node */}
              <div
                className={`org-node org-node-o${selectedNodeId === "o" ? " selected" : ""}`}
                onClick={() => onSelectNode("o")}
                role="button"
                tabIndex={0}
              >
                <span className="org-badge org-badge-o">O</span>
                <span className="org-title">
                  {data.objectives?.deptO || (
                    <em style={{ color: "#a16207" }}>點擊設定部門目標…</em>
                  )}
                </span>
              </div>

              {periods.length > 0 && (
                <div
                  className="org-h-tabs"
                  role="tablist"
                  aria-label="OGSM half-year"
                >
                  {periods.map((p) => {
                    const isActive = p.id === activePeriodId;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        className={`org-h-tab ${isActive ? "active" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSwitchPeriod?.(p.id);
                        }}
                      >
                        {p.year}-{p.halfYear}
                      </button>
                    );
                  })}
                </div>
              )}

              <ul className="org-children">
                {data.goals.map((g) => (
                  <li key={g.id}>
                    {/* G node */}
                    <div
                      className={`org-node org-node-g${selectedNodeId === `g-${g.id}` ? " selected" : ""}`}
                      onClick={() => onSelectNode(`g-${g.id}`)}
                      role="button"
                      tabIndex={0}
                    >
                      <span className="org-badge org-badge-g">{g.label}</span>
                      <span className="org-title">
                        {g.title || <em>(未命名)</em>}
                      </span>
                    </div>

                    {g.strategies.length > 0 && (
                      <ul className="org-children">
                        {g.strategies.map((s, si) => (
                          <li key={s.id}>
                            {/* S node */}
                            <div
                              className={`org-node org-node-s${selectedNodeId === `s-${s.id}` ? " selected" : ""}`}
                              onClick={() => onSelectNode(`s-${s.id}`)}
                              role="button"
                              tabIndex={0}
                            >
                              <span className="org-badge org-badge-s">{`S${si + 1}`}</span>
                              <span className="org-title">
                                {s.title || <em>(未命名)</em>}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── KPI helpers ────────────────────────────────────────────────────────────

/** G-KPI = aggregate 或 pct_activity（達標活動比率），G-sub-KPI = 其餘直接值型 */
function isGKpi(gk: GoalKPI): boolean {
  return gk.goalKpiType === "aggregate" || gk.type === "pct_activity";
}

/** 計算一個 G-sub-KPI 下各連結活動的達標數 / 總數 */
function getSubGkActivityStats(
  subGk: GoalKPI,
  deptActivities: DeptActivity[],
): { metCount: number; totalCount: number } {
  // 先收集所有有效 actId（totalCount 含沒有 rate 資料的活動）
  const allActIds = new Set<string>();
  const actRates = new Map<string, number[]>();
  for (const link of subGk.linkedKpis) {
    const actId =
      link.activityId ||
      ((link as unknown as Record<string, string>).measureId ?? "");
    if (!actId) continue;
    allActIds.add(actId);
    const act = deptActivities.find((a) => a.id === actId);
    const kpi = act?.kpis.find((k) => k.id === link.kpiId);
    if (!kpi) continue;
    const r =
      computeKpiAchievement(kpi, act?.kpis ?? []) ?? kpi.achievementRate;
    if (r == null) continue;
    if (!actRates.has(actId)) actRates.set(actId, []);
    actRates.get(actId)!.push(r);
  }
  const threshold = subGk.target ?? 0;
  let metCount = 0;
  for (const actId of allActIds) {
    const rates = actRates.get(actId);
    if (!rates || rates.length === 0) continue; // 無資料 → 未達標
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    if (avg >= threshold) metCount++;
  }
  return { metCount, totalCount: allActIds.size };
}

// ─── KPI Computation Tree ────────────────────────────────────────────────────

interface GkComputeTreeProps {
  gk: GoalKPI;
  goal: Goal;
  deptActivities: DeptActivity[];
  allGoals: Goal[];
}

function GkComputeTree({
  gk,
  goal,
  deptActivities,
  allGoals,
}: GkComputeTreeProps) {
  // G-KPI 聚合型：顯示加權 GoalKPI 來源
  if (gk.goalKpiType === "aggregate") {
    const links = gk.linkedGoalKpis ?? [];
    if (links.length === 0) {
      return <div className="kpid-ctree-empty">尚未連結任何來源 GoalKPI</div>;
    }
    return (
      <div className="kpid-ctree-wrap">
        {links.map((link, i) => {
          const srcGoal = allGoals.find((g) => g.id === link.goalId) ?? goal;
          const srcGk = (srcGoal.goalKpis ?? []).find(
            (g) => g.id === link.goalKpiId,
          );
          const result = srcGk
            ? computeGoalKpiResult(srcGk, srcGoal, deptActivities, allGoals)
            : null;
          const rate = result?.rate;
          const color =
            rate != null
              ? rate >= 100
                ? "#16a34a"
                : rate >= 60
                  ? "#d97706"
                  : "#dc2626"
              : "#94a3b8";
          return (
            <div key={i} className="kpid-ctree-row">
              <span className="kpid-ctree-tag agg">×{link.weight}</span>
              <span className="kpid-ctree-src">
                {srcGoal.label}／{srcGk?.label ?? "(未知)"}
              </span>
              <span className="kpid-ctree-rate-val" style={{ color }}>
                {rate != null ? `${rate}%` : "─"}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // G-KPI pct_activity 型：顯示 result.activities 達標清單
  if (gk.type === "pct_activity") {
    const result = computeGoalKpiResult(gk, goal, deptActivities, allGoals);
    const acts = result.activities;
    if (acts.length === 0) {
      return <div className="kpid-ctree-empty">尚未有符合門檻的活動資料</div>;
    }
    return (
      <div className="kpid-ctree-wrap">
        {acts.map((a, i) => {
          const rate = a.displayRate;
          const color =
            rate != null
              ? rate >= 100
                ? "#16a34a"
                : rate >= 60
                  ? "#d97706"
                  : "#dc2626"
              : "#94a3b8";
          return (
            <div key={i} className={`kpid-ctree-row${a.met ? " met" : ""}`}>
              <span className={`kpid-ctree-met-icon`}>{a.met ? "✓" : "✗"}</span>
              <span className="kpid-ctree-src">{a.measureRawText}</span>
              <span className="kpid-ctree-rate-val" style={{ color }}>
                {rate != null ? `${rate}%` : "─"}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  // G-sub-KPI 直接型：按活動分組顯示 KPI 實績
  const links = gk.linkedKpis ?? [];
  if (links.length === 0) {
    return <div className="kpid-ctree-empty">尚未連結任何活動 KPI</div>;
  }

  const seen = new Set<string>();
  type ActGroup = {
    actId: string;
    act: DeptActivity | undefined;
    kpis: Array<{
      link: { activityId: string; kpiId: string };
      kpi: KPI | undefined;
    }>;
  };
  const actGroups: ActGroup[] = [];
  for (const link of links) {
    const actId =
      link.activityId || (link as Record<string, string>).measureId || "";
    if (!seen.has(actId)) {
      seen.add(actId);
      const act = deptActivities.find((a) => a.id === actId);
      actGroups.push({ actId, act, kpis: [] });
    }
    const group = actGroups.find((g) => g.actId === actId)!;
    const kpi = group.act?.kpis.find((k) => k.id === link.kpiId);
    group.kpis.push({ link, kpi });
  }

  return (
    <div className="kpid-ctree-wrap">
      {actGroups.map(({ actId, act, kpis }) => (
        <div key={actId} className="kpid-ctree-act-group">
          <div className="kpid-ctree-act-name">
            <span className="kpid-ctree-tag direct">活動</span>
            {act?.rawText ?? actId}
          </div>
          {kpis.map(({ kpi }, ki) => {
            const rate = kpi?.achievementRate;
            const color =
              rate != null
                ? rate >= 100
                  ? "#16a34a"
                  : rate >= 60
                    ? "#d97706"
                    : "#dc2626"
                : "#94a3b8";
            return (
              <div key={ki} className="kpid-ctree-row sub">
                <span className="kpid-ctree-kpi-name">
                  {kpi?.name || kpi?.label || "(未知 KPI)"}
                </span>
                <span className="kpid-ctree-val">
                  {kpi
                    ? `${kpi.actual ?? "─"} / ${kpi.target ?? "─"}${kpi.unit ? ` ${kpi.unit}` : ""}`
                    : "─"}
                </span>
                <span className="kpid-ctree-rate-val" style={{ color }}>
                  {rate != null ? `${rate}%` : "─"}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface GkCardProps {
  gk: GoalKPI;
  goal: Goal;
  deptActivities: DeptActivity[];
  allGoals: Goal[];
  selected: boolean;
  onSelectNode: () => void;
}

function GkCard({
  gk,
  goal,
  deptActivities,
  allGoals,
  selected,
  onSelectNode,
}: GkCardProps) {
  const [expanded, setExpanded] = useState(false);
  const result = computeGoalKpiResult(gk, goal, deptActivities, allGoals);
  const gkKpi = isGKpi(gk);
  const hasLinks =
    gk.goalKpiType === "aggregate"
      ? (gk.linkedGoalKpis?.length ?? 0) > 0
      : gk.type === "pct_activity"
        ? true // pct_activity always shows tree (uses result.activities)
        : (gk.linkedKpis?.length ?? 0) > 0;

  return (
    <div
      className={`kpid-gk-node${gkKpi ? " agg" : ""}${selected ? " selected" : ""}${expanded ? " expanded" : ""}`}
      onClick={onSelectNode}
      role="button"
      tabIndex={0}
    >
      <div className="kpid-gk-header">
        <span className="kpid-gk-label" title={gk.label}>
          {gk.label}
        </span>
      </div>
      <div className="kpid-gk-rate">
        {gk.type === "pct_activity" ? (
          <>
            <strong
              style={{
                color:
                  result.actual != null && result.actual >= (gk.target ?? 60)
                    ? "#16a34a"
                    : result.actual != null &&
                        result.actual >= (gk.target ?? 60) * 0.6
                      ? "#d97706"
                      : "#dc2626",
              }}
            >
              {result.actual != null ? `${result.actual}%` : "─"}
            </strong>
            {" / 目標 "}
            {gk.target ?? "─"}%
          </>
        ) : (
          <>
            <strong
              style={{
                color:
                  result.rate != null
                    ? result.rate >= 100
                      ? "#16a34a"
                      : result.rate >= 60
                        ? "#d97706"
                        : "#dc2626"
                    : undefined,
              }}
            >
              {result.actual ?? "─"}
              {gk.unit ? ` ${gk.unit}` : ""}
            </strong>
            {" / 目標 "}
            {gk.target ?? "─"}
            {gk.unit ? ` ${gk.unit}` : ""}
          </>
        )}
      </div>
      {gk.type === "pct_activity" && result.metCount != null && (
        <div className="kpid-gk-actval">
          {result.metCount}&nbsp;/&nbsp;{result.totalCount}&nbsp;活動達標
        </div>
      )}
      {hasLinks && (
        <button
          className="kpid-ctree-toggle"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
        >
          {expanded ? "▲ 收合來源" : "▼ 展開來源"}
        </button>
      )}
      {expanded && (
        <GkComputeTree
          gk={gk}
          goal={goal}
          deptActivities={deptActivities}
          allGoals={allGoals}
        />
      )}
    </div>
  );
}

// ─── KPI Canvas ───────────────────────────────────────────────────────────────

interface KpiCanvasProps {
  draftGoals: Goal[];
  deptActivities: DeptActivity[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}

function KpiCanvas({
  draftGoals,
  deptActivities,
  selectedNodeId,
  onSelectNode,
}: KpiCanvasProps) {
  const [collapsedGoals, setCollapsedGoals] = useState<Set<string>>(new Set());
  const toggleCollapse = (gId: string) =>
    setCollapsedGoals((prev) => {
      const next = new Set(prev);
      next.has(gId) ? next.delete(gId) : next.add(gId);
      return next;
    });
  if (draftGoals.length === 0) {
    return (
      <div className="kpid-canvas-empty">
        <div className="kpid-canvas-empty-icon">📊</div>
        <div>尚無目標，請切換到「項目模式」先建立目標</div>
      </div>
    );
  }

  return (
    <div className="kpid-kpi-canvas">
      {draftGoals.map((g) => {
        const gkpis = g.goalKpis ?? [];
        return (
          <div key={g.id} className="kpid-kpi-goal-group">
            <div
              className={`kpid-kpi-goal-header${selectedNodeId === `g-${g.id}` ? " selected" : ""}`}
              onClick={() => onSelectNode(`g-${g.id}`)}
              role="button"
              tabIndex={0}
            >
              <button
                className="kpid-kpi-collapse-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCollapse(g.id);
                }}
                title={collapsedGoals.has(g.id) ? "展開" : "折疊"}
              >
                {collapsedGoals.has(g.id) ? "▶" : "▼"}
              </button>
              <span className="kpid-g-label">{g.label}</span>
              <span style={{ marginLeft: 8, fontWeight: 500, fontSize: 13 }}>
                {g.title}
              </span>
              <span className="kpid-kpi-goal-count">{gkpis.length} 個 KPI</span>
            </div>
            {!collapsedGoals.has(g.id) && (
              <div className="kpid-kpi-gk-row">
                {gkpis.length === 0 ? (
                  <div className="kpid-kpi-no-gk">
                    尚無 GoalKPI，可從左側面板或點擊上方目標後在右側新增
                  </div>
                ) : (
                  (() => {
                    const aggKpis = gkpis.filter(isGKpi);
                    const directKpis = gkpis.filter((gk) => !isGKpi(gk));
                    const renderCard = (gk: GoalKPI) => (
                      <GkCard
                        key={gk.id}
                        gk={gk}
                        goal={g}
                        deptActivities={deptActivities}
                        allGoals={draftGoals}
                        selected={selectedNodeId === `gk-${gk.id}`}
                        onSelectNode={() => onSelectNode(`gk-${gk.id}`)}
                      />
                    );
                    return (
                      <>
                        {aggKpis.length > 0 && (
                          <>
                            <div className="kpid-canvas-subhead">G-KPI</div>
                            {aggKpis.map(renderCard)}
                          </>
                        )}
                        {directKpis.length > 0 && (
                          <>
                            <div
                              className={`kpid-canvas-subhead${aggKpis.length > 0 ? " sub" : ""}`}
                            >
                              G-sub-KPI
                            </div>
                            {directKpis.map(renderCard)}
                          </>
                        )}
                      </>
                    );
                  })()
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface GoalKpiConfigPanelProps {
  gk: GoalKPI;
  draftGoal: Goal;
  allGoals: Goal[];
  deptActivities: DeptActivity[];
  onUpdate: (updated: GoalKPI) => void;
  onDelete: () => void;
  onClose: () => void;
}

function GoalKpiConfigPanel({
  gk,
  draftGoal,
  allGoals,
  deptActivities,
  onUpdate,
  onDelete,
  onClose,
}: GoalKpiConfigPanelProps) {
  const isAgg = gk.goalKpiType === "aggregate";
  const isPctActivity = gk.type === "pct_activity";
  const [kpiSearch, setKpiSearch] = useState("");
  const [kpiPickerOpen, setKpiPickerOpen] = useState(false);
  const [gkSearch, setGkSearch] = useState("");
  const [gkPickerOpen, setGkPickerOpen] = useState(false);
  return (
    <div className="kpid-node-config">
      {/* Header */}
      <div className="kpid-config-header">
        <span className="kpid-config-title">GK｜{gk.label}</span>
        <button
          className="kpid-config-close kpid-config-delete"
          title="刪除此 KPI"
          onClick={onDelete}
        >
          🗑
        </button>
        <button className="kpid-config-close" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Label */}
      <div className="kpid-config-section">
        <div className="kpid-config-label">KPI 標籤</div>
        <input
          className="kpid-config-input"
          value={gk.label}
          onChange={(e) => onUpdate({ ...gk, label: e.target.value })}
        />
      </div>

      {/* Target & Unit */}
      <div className="kpid-config-section">
        <div className="kpid-config-label">目標值 / 單位</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="kpid-config-input"
            style={{ width: 80 }}
            type="number"
            value={gk.target ?? ""}
            onChange={(e) =>
              onUpdate({
                ...gk,
                target: e.target.value ? parseFloat(e.target.value) : null,
              })
            }
          />
          <input
            className="kpid-config-input"
            style={{ width: 60 }}
            placeholder="單位"
            value={gk.unit ?? ""}
            onChange={(e) => onUpdate({ ...gk, unit: e.target.value })}
          />
        </div>
      </div>

      {/* ── pct_activity：搜尋選取 G-sub-KPI ─────────────────── */}
      {isPctActivity ? (
        <div className="kpid-config-section">
          <div className="kpid-kpi-link-picker">
            <div className="kpid-config-label" style={{ marginBottom: 4 }}>
              連結 G-sub-KPI
            </div>
            <input
              className="g-kpi-link-search"
              placeholder="🔍 點擊搜尋並選擇 G-sub-KPI..."
              value={gkSearch}
              onChange={(e) => setGkSearch(e.target.value)}
              onFocus={() => setGkPickerOpen(true)}
              onBlur={() => setTimeout(() => setGkPickerOpen(false), 150)}
            />
            {gkPickerOpen && (
              <div
                className="kpid-kpi-link-list"
                onMouseDown={(e) => e.preventDefault()}
              >
                {(() => {
                  const q = gkSearch.trim().toLowerCase();
                  const available = (draftGoal.goalKpis ?? []).filter(
                    (subGk) => !isGKpi(subGk),
                  );
                  const filtered = q
                    ? available.filter((sg) =>
                        sg.label.toLowerCase().includes(q),
                      )
                    : available;
                  const isSelected = (sg: GoalKPI) =>
                    (gk.thresholdGoalKpiIds ?? []).includes(sg.id);
                  const sorted = [
                    ...filtered.filter(isSelected),
                    ...filtered.filter((sg) => !isSelected(sg)),
                  ];
                  if (sorted.length === 0)
                    return (
                      <div className="g-kpi-link-empty">
                        {q ? "找不到符合結果" : "此目標沒有 G-sub-KPI"}
                      </div>
                    );
                  return sorted.map((subGk) => {
                    const selected = isSelected(subGk);
                    const stats = getSubGkActivityStats(subGk, deptActivities);
                    return (
                      <label
                        key={subGk.id}
                        className={`g-kpi-link-item${selected ? " linked" : ""}`}
                        onClick={() => {
                          const ids = gk.thresholdGoalKpiIds ?? [];
                          onUpdate({
                            ...gk,
                            thresholdGoalKpiIds: selected
                              ? ids.filter((id) => id !== subGk.id)
                              : [...ids, subGk.id],
                          });
                        }}
                      >
                        <input type="checkbox" checked={selected} readOnly />
                        <span className="g-kpi-link-m">{subGk.label}</span>
                        <span className="g-kpi-link-k">
                          {subGk.target != null
                            ? `門檻 ${subGk.target}${subGk.unit ? ` ${subGk.unit}` : ""}`
                            : ""}
                        </span>
                        {stats.totalCount > 0 && (
                          <span className="g-kpi-link-val">
                            {stats.metCount}/{stats.totalCount} 活動達標
                          </span>
                        )}
                      </label>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* 已選取 G-sub-KPI 實績 */}
          {(gk.thresholdGoalKpiIds ?? []).length > 0 && (
            <div className="kpid-linked-summary">
              <div className="kpid-config-label" style={{ marginTop: 8 }}>
                G-sub-KPI 實績
              </div>
              {(gk.thresholdGoalKpiIds ?? []).map((gkId) => {
                const subGk = (draftGoal.goalKpis ?? []).find(
                  (g) => g.id === gkId,
                );
                if (!subGk) return null;
                const stats = getSubGkActivityStats(subGk, deptActivities);
                const pct =
                  stats.totalCount > 0
                    ? Math.round((stats.metCount / stats.totalCount) * 100)
                    : null;
                return (
                  <div key={gkId} className="kpid-kpi-summary-row">
                    <span className="kpid-kpi-summary-name">{subGk.label}</span>
                    <span className="kpid-kpi-summary-val">
                      {stats.metCount}&nbsp;/&nbsp;{stats.totalCount}
                      &nbsp;活動達標
                    </span>
                    {pct != null && (
                      <span
                        className={`kpid-kpi-summary-rate${pct >= 100 ? " done" : pct >= 60 ? " ok" : " warn"}`}
                      >
                        {pct}%
                      </span>
                    )}
                    <button
                      className="kpid-remove-btn"
                      onClick={() =>
                        onUpdate({
                          ...gk,
                          thresholdGoalKpiIds: (
                            gk.thresholdGoalKpiIds ?? []
                          ).filter((id) => id !== gkId),
                        })
                      }
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : isAgg ? (
        /* ── aggregate：搜尋選取 GoalKPI ──────────────────────── */
        <div className="kpid-config-section">
          <div className="kpid-kpi-link-picker">
            <div className="kpid-config-label" style={{ marginBottom: 4 }}>
              連結 GoalKPI
            </div>
            <input
              className="g-kpi-link-search"
              placeholder="🔍 點擊搜尋並選擇 GoalKPI..."
              value={gkSearch}
              onChange={(e) => setGkSearch(e.target.value)}
              onFocus={() => setGkPickerOpen(true)}
              onBlur={() => setTimeout(() => setGkPickerOpen(false), 150)}
            />
            {gkPickerOpen && (
              <div
                className="kpid-kpi-link-list"
                onMouseDown={(e) => e.preventDefault()}
              >
                {(() => {
                  const q = gkSearch.trim().toLowerCase();
                  const available = allGoals.flatMap((goal) =>
                    (goal.goalKpis ?? [])
                      .filter((subGk) => subGk.id !== gk.id)
                      .map((subGk) => ({ goal, subGk })),
                  );
                  const filtered = q
                    ? available.filter(
                        ({ goal, subGk }) =>
                          goal.label.toLowerCase().includes(q) ||
                          subGk.label.toLowerCase().includes(q),
                      )
                    : available;
                  const isLinked = (subGk: GoalKPI) =>
                    (gk.linkedGoalKpis ?? []).some(
                      (l) => l.goalKpiId === subGk.id,
                    );
                  const sorted = [
                    ...filtered.filter(({ subGk }) => isLinked(subGk)),
                    ...filtered.filter(({ subGk }) => !isLinked(subGk)),
                  ];
                  if (sorted.length === 0)
                    return (
                      <div className="g-kpi-link-empty">
                        {q ? "找不到符合結果" : "沒有可連結的 GoalKPI"}
                      </div>
                    );
                  return sorted.map(({ goal, subGk }) => {
                    const linked = isLinked(subGk);
                    const subResult = computeGoalKpiResult(
                      subGk,
                      goal,
                      deptActivities,
                      allGoals,
                    );
                    const rate = subResult.rate;
                    return (
                      <label
                        key={`${goal.id}::${subGk.id}`}
                        className={`g-kpi-link-item${linked ? " linked" : ""}`}
                        onClick={() => {
                          if (linked) {
                            onUpdate({
                              ...gk,
                              linkedGoalKpis: (gk.linkedGoalKpis ?? []).filter(
                                (l) => l.goalKpiId !== subGk.id,
                              ),
                            });
                          } else {
                            onUpdate({
                              ...gk,
                              goalKpiType: "aggregate",
                              linkedGoalKpis: [
                                ...(gk.linkedGoalKpis ?? []),
                                {
                                  goalId: goal.id,
                                  goalKpiId: subGk.id,
                                  weight: 1,
                                },
                              ],
                            });
                          }
                        }}
                      >
                        <input type="checkbox" checked={linked} readOnly />
                        <span className="g-kpi-link-m">{goal.label}</span>
                        <span className="g-kpi-link-k">{subGk.label}</span>
                        {rate != null && (
                          <span className="g-kpi-link-val">{rate}%</span>
                        )}
                      </label>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* 已選取 GoalKPI 實績 + 權重 */}
          {(gk.linkedGoalKpis ?? []).length > 0 && (
            <div className="kpid-linked-summary">
              <div className="kpid-config-label" style={{ marginTop: 8 }}>
                GoalKPI 實績
              </div>
              {(gk.linkedGoalKpis ?? []).map((link, idx) => {
                const srcGoal = allGoals.find((g) => g.id === link.goalId);
                const srcGk = srcGoal?.goalKpis?.find(
                  (g) => g.id === link.goalKpiId,
                );
                const subResult =
                  srcGk && srcGoal
                    ? computeGoalKpiResult(
                        srcGk,
                        srcGoal,
                        deptActivities,
                        allGoals,
                      )
                    : null;
                const rate = subResult?.rate ?? null;
                return (
                  <div key={link.goalKpiId} className="kpid-kpi-summary-row">
                    <span className="kpid-kpi-summary-name">
                      {srcGoal?.label}&nbsp;/&nbsp;
                      {srcGk?.label ?? link.goalKpiId}
                    </span>
                    <span
                      className="kpid-kpi-summary-val"
                      style={{ display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <span
                        style={{
                          fontSize: 10,
                          color: "#94a3b8",
                          flexShrink: 0,
                        }}
                      >
                        權重
                      </span>
                      <input
                        type="number"
                        className="kpid-weight-input"
                        step={0.05}
                        min={0}
                        max={1}
                        value={link.weight}
                        onChange={(e) => {
                          const w = parseFloat(e.target.value);
                          onUpdate({
                            ...gk,
                            linkedGoalKpis: (gk.linkedGoalKpis ?? []).map(
                              (l, i) =>
                                i === idx
                                  ? { ...l, weight: isNaN(w) ? 0 : w }
                                  : l,
                            ),
                          });
                        }}
                      />
                    </span>
                    {rate != null && (
                      <span
                        className={`kpid-kpi-summary-rate${rate >= 100 ? " done" : rate >= 60 ? " ok" : " warn"}`}
                      >
                        {rate}%
                      </span>
                    )}
                    <button
                      className="kpid-remove-btn"
                      onClick={() =>
                        onUpdate({
                          ...gk,
                          linkedGoalKpis: (gk.linkedGoalKpis ?? []).filter(
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
            </div>
          )}

          {/* 權重加總提示 */}
          {(gk.linkedGoalKpis ?? []).length > 0 &&
            (() => {
              const sum = (gk.linkedGoalKpis ?? []).reduce(
                (a, l) => a + l.weight,
                0,
              );
              const pct = Math.round(sum * 100);
              return Math.abs(sum - 1) > 0.01 ? (
                <div className="kpid-weight-warn">
                  警告：權重加總 = {pct}%，建議調整至 100%
                </div>
              ) : (
                <div className="kpid-weight-ok">✓ 權重加總 = {pct}%</div>
              );
            })()}
        </div>
      ) : (
        /* ── G-sub-KPI：搜尋選取 M KPI ────────────────────────── */
        <div className="kpid-config-section">
          <div className="kpid-kpi-link-picker">
            <div className="kpid-config-label" style={{ marginBottom: 4 }}>
              新增連結 M KPI
            </div>
            <input
              className="g-kpi-link-search"
              placeholder="🔍 點擊搜尋並選擇 M KPI..."
              value={kpiSearch}
              onChange={(e) => setKpiSearch(e.target.value)}
              onFocus={() => setKpiPickerOpen(true)}
              onBlur={() => setTimeout(() => setKpiPickerOpen(false), 150)}
            />
            {kpiPickerOpen && (
              <div
                className="kpid-kpi-link-list"
                onMouseDown={(e) => e.preventDefault()}
              >
                {(() => {
                  const q = kpiSearch.trim().toLowerCase();
                  const rows = deptActivities.flatMap((act) =>
                    (act.kpis ?? []).map((kpi) => ({ act, kpi })),
                  );
                  const filtered = rows.filter(({ act, kpi }) => {
                    if (q) {
                      const actLabel = (act.rawText || act.id).toLowerCase();
                      const kpiLabel = (
                        kpi.name ||
                        kpi.label ||
                        kpi.id
                      ).toLowerCase();
                      if (!actLabel.includes(q) && !kpiLabel.includes(q))
                        return false;
                    }
                    return true;
                  });
                  if (filtered.length === 0)
                    return (
                      <div className="g-kpi-link-empty">
                        {q ? "找不到符合的結果" : "此部門沒有 M KPI"}
                      </div>
                    );
                  const isLinked = ({
                    act,
                    kpi,
                  }: {
                    act: { id: string };
                    kpi: { id: string };
                  }) =>
                    gk.linkedKpis.some(
                      (l) =>
                        (l.activityId ||
                          ((l as unknown as Record<string, string>).measureId ??
                            "")) === act.id && l.kpiId === kpi.id,
                    );
                  const sortedFiltered = [
                    ...filtered.filter(isLinked),
                    ...filtered.filter((r) => !isLinked(r)),
                  ];
                  return sortedFiltered.map(({ act, kpi }) => {
                    const linked = isLinked({ act, kpi });
                    return (
                      <label
                        key={`${act.id}::${kpi.id}`}
                        className={`g-kpi-link-item${linked ? " linked" : ""}`}
                        onClick={() => {
                          if (linked) {
                            onUpdate({
                              ...gk,
                              linkedKpis: gk.linkedKpis.filter(
                                (l) =>
                                  !(
                                    (l.activityId ||
                                      ((l as unknown as Record<string, string>)
                                        .measureId ??
                                        "")) === act.id && l.kpiId === kpi.id
                                  ),
                              ),
                            });
                          } else {
                            onUpdate({
                              ...gk,
                              linkedKpis: [
                                ...gk.linkedKpis,
                                { activityId: act.id, kpiId: kpi.id },
                              ],
                            });
                          }
                        }}
                      >
                        <input type="checkbox" checked={linked} readOnly />
                        <span className="g-kpi-link-m">
                          {(act.rawText || act.id).substring(0, 20)}
                        </span>
                        <span className="g-kpi-link-k">
                          {kpi.name || kpi.label || kpi.id}
                        </span>
                        {(kpi.actual != null || kpi.target != null) && (
                          <span className="g-kpi-link-val">
                            {kpi.actual ?? "--"} / {kpi.target ?? "--"}
                          </span>
                        )}
                      </label>
                    );
                  });
                })()}
              </div>
            )}
          </div>
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
                      {act?.rawText ?? actId}&nbsp;/&nbsp;
                      {kpi.name || kpi.label || link.kpiId}
                    </span>
                    <span className="kpid-kpi-summary-val">
                      {kpi.actual ?? "─"}&nbsp;/&nbsp;{kpi.target ?? "─"}
                      {kpi.unit ? <>&nbsp;({kpi.unit})</> : null}
                    </span>
                    {rate != null && (
                      <span
                        className={`kpid-kpi-summary-rate${rate >= 100 ? " done" : rate >= 60 ? " ok" : " warn"}`}
                      >
                        {Math.round(rate * 10) / 10}%
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
            {isPctActivity ? (
              <>
                <div className="kpid-preview-row">
                  <span>達標活動數</span>
                  <strong>
                    {result.metCount ?? "─"}&nbsp;/&nbsp;{result.totalCount}
                  </strong>
                </div>
                <div className="kpid-preview-row">
                  <span>達標率</span>
                  <strong>
                    {result.actual != null ? `${result.actual}%` : "─"}
                  </strong>
                </div>
                {(result.activities ?? []).length > 0 &&
                  (() => {
                    const metActs = (result.activities ?? []).filter(
                      (a) => a.met,
                    );
                    const unmetActs = (result.activities ?? []).filter(
                      (a) => !a.met,
                    );
                    return (
                      <div className="kpid-preview-act-list">
                        {metActs.length > 0 && (
                          <>
                            <div className="kpid-preview-act-section met">
                              ✓ 達標 ({metActs.length})
                            </div>
                            {metActs.map((a) => (
                              <div
                                key={a.activityId}
                                className="kpid-preview-act-row met"
                              >
                                <span
                                  className="kpid-preview-act-name"
                                  title={a.measureRawText}
                                >
                                  {a.measureRawText}
                                </span>
                                <span className="kpid-preview-act-rate met">
                                  {a.displayRate != null
                                    ? `${a.displayRate}%`
                                    : "─"}
                                  {a.chosenTarget != null && (
                                    <span className="kpid-preview-act-thresh">
                                      &nbsp;≥{a.chosenTarget}%
                                    </span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                        {unmetActs.length > 0 && (
                          <>
                            <div className="kpid-preview-act-section unmet">
                              ✗ 未達標 ({unmetActs.length})
                            </div>
                            {unmetActs.map((a) => (
                              <div
                                key={a.activityId}
                                className="kpid-preview-act-row unmet"
                              >
                                <span
                                  className="kpid-preview-act-name"
                                  title={a.measureRawText}
                                >
                                  {a.measureRawText}
                                </span>
                                <span className="kpid-preview-act-rate unmet">
                                  {a.displayRate != null
                                    ? `${a.displayRate}%`
                                    : "無資料"}
                                  {a.chosenTarget != null && (
                                    <span className="kpid-preview-act-thresh">
                                      &nbsp;≥{a.chosenTarget}%
                                    </span>
                                  )}
                                </span>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    );
                  })()}
              </>
            ) : isAgg ? (
              <div className="kpid-preview-row">
                <span>加權平均達成率</span>
                <strong>
                  {result.actual != null ? `${result.actual}%` : "─"}
                </strong>
              </div>
            ) : (
              <>
                {(() => {
                  const linkedValues = gk.linkedKpis.flatMap((link) => {
                    const actId =
                      link.activityId ||
                      ((link as unknown as Record<string, string>).measureId ??
                        "");
                    const act = deptActivities.find((a) => a.id === actId);
                    const kpi = act?.kpis.find((k) => k.id === link.kpiId);
                    if (!kpi) return [];
                    return [
                      { actual: kpi.actual ?? 0, target: kpi.target ?? 0 },
                    ];
                  });
                  const formulaStr =
                    linkedValues.length > 1
                      ? `(${linkedValues.map((v) => v.actual).join(" + ")}) / (${linkedValues.map((v) => v.target).join(" + ")})`
                      : linkedValues.length === 1
                        ? `${linkedValues[0].actual} / ${linkedValues[0].target}`
                        : null;
                  return (
                    <>
                      <div className="kpid-preview-row">
                        <span>實際值</span>
                        <strong>
                          {result.actual ?? "─"}
                          {gk.unit ? ` ${gk.unit}` : ""}
                        </strong>
                      </div>
                      {formulaStr && (
                        <div className="kpid-preview-formula-row">
                          <span className="kpid-preview-formula">
                            = {formulaStr}
                          </span>
                        </div>
                      )}
                    </>
                  );
                })()}
                <div className="kpid-preview-row">
                  <span>目標值</span>
                  <strong>
                    {result.target ?? "─"}&nbsp;{gk.unit}
                  </strong>
                </div>
              </>
            )}
            {isAgg && (
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
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ─── NodeTypeManager (left panel for item mode) ───────────────────────────────

interface NodeTypeManagerProps {
  data: OGSMData;
  deptActivities: DeptActivity[];
  freeNodes: FreeNode[];
  periods?: PeriodData[];
  activePeriodId?: string;
  onSwitchPeriod?: (periodId: string) => void;
  isReadOnly?: boolean;
  onAddPeriod?: (halfYear: "H1" | "H2", year: number) => void;
  onCopyPeriod?: (
    sourcePeriodId: string,
    halfYear: "H1" | "H2",
    year: number,
  ) => void;
  onDeletePeriod?: (periodId: string) => void;
  selectedNodeId: string | null;
  moduleId: ModuleId;
  onSelectNode: (id: string) => void;
  onUpdateData: (d: OGSMData) => void;
  onAddGoal: () => void;
  onDeleteGoal: (id: string) => void;
  onCopyGoal: (id: string) => void;
  onAddStrategy: (goalId: string) => void;
  onDeleteStrategy: (stratId: string) => void;
  onCopyStrategy: (stratId: string) => void;
  onAddFreeNode: () => void;
  onDeleteFreeNode: (id: string) => void;
  onCopyFreeNode: (id: string) => void;
  style?: React.CSSProperties;
}

function NodeTypeManager({
  data,
  deptActivities: _deptActivities,
  freeNodes,
  periods = [],
  activePeriodId,
  onSwitchPeriod,
  isReadOnly = false,
  onAddPeriod,
  onCopyPeriod,
  onDeletePeriod,
  selectedNodeId,
  moduleId,
  onSelectNode,
  onUpdateData,
  onAddGoal,
  onDeleteGoal,
  onCopyGoal,
  onAddStrategy,
  onDeleteStrategy,
  onCopyStrategy,
  onAddFreeNode,
  onDeleteFreeNode,
  onCopyFreeNode,
  style,
}: NodeTypeManagerProps) {
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [addingStratFor, setAddingStratFor] = React.useState<string | null>(
    null,
  );
  const [periodForm, setPeriodForm] = React.useState<{
    mode: "add" | "copy";
    year: number;
    halfYear: "H1" | "H2";
  } | null>(null);

  const toggle = (key: string) =>
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="ntm-root" style={style}>
      {!moduleId && (
        <div className="ntm-no-module">請先從頂部下拉選單選擇模組</div>
      )}
      {moduleId === "ogsm" && (
        <>
          {/* ── O Section ─────────────────────────────────── */}
          <div className="ntm-section-header" onClick={() => toggle("o")}>
            <button className="ntm-collapse-btn">
              {collapsed["o"] ? "▶" : "▼"}
            </button>
            <span className="ntm-section-label">組織目標 O</span>
            <span className="ntm-count-badge">1</span>
          </div>
          {!collapsed["o"] && (
            <>
              <div
                className={`ntm-item-row${selectedNodeId === "o" ? " selected" : ""}`}
                onClick={() => onSelectNode("o")}
              >
                <span className="ntm-type-badge o">O</span>
                <span className="ntm-item-label">
                  {data.objectives.deptO || "（未設定）"}
                </span>
              </div>
              {(periods.length > 0 || !isReadOnly) && (
                <div
                  className="ntm-h-tabs"
                  role="tablist"
                  aria-label="left panel half-year tabs"
                >
                  {periods.map((p) => {
                    const isActive = p.id === activePeriodId;
                    return (
                      <span key={p.id} className="ntm-h-tab-wrap">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={isActive}
                          className={`ntm-h-tab ${isActive ? "active" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onSwitchPeriod?.(p.id);
                          }}
                        >
                          {p.year}-{p.halfYear}
                        </button>
                        {!isReadOnly && periods.length > 1 && (
                          <button
                            className="ntm-period-del-btn"
                            title={`刪除 ${p.year} ${p.halfYear}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeletePeriod?.(p.id);
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </span>
                    );
                  })}
                  {!isReadOnly && activePeriodId && (
                    <button
                      className="ntm-period-copy-btn"
                      title="複製目前期間到新期間"
                      onClick={(e) => {
                        e.stopPropagation();
                        const activeP = periods.find(
                          (p) => p.id === activePeriodId,
                        );
                        if (activeP) {
                          const nextHalf: "H1" | "H2" =
                            activeP.halfYear === "H1" ? "H2" : "H1";
                          const nextYear =
                            activeP.halfYear === "H2"
                              ? activeP.year + 1
                              : activeP.year;
                          setPeriodForm({
                            mode: "copy",
                            year: nextYear,
                            halfYear: nextHalf,
                          });
                        }
                      }}
                    >
                      ⧉
                    </button>
                  )}
                  {!isReadOnly && (
                    <button
                      className="ntm-period-add-btn"
                      title="新增空白期間"
                      onClick={(e) => {
                        e.stopPropagation();
                        const lastP = periods[periods.length - 1];
                        const nextHalf: "H1" | "H2" = lastP
                          ? lastP.halfYear === "H1"
                            ? "H2"
                            : "H1"
                          : "H1";
                        const nextYear = lastP
                          ? lastP.halfYear === "H2"
                            ? lastP.year + 1
                            : lastP.year
                          : new Date().getFullYear();
                        setPeriodForm({
                          mode: "add",
                          year: nextYear,
                          halfYear: nextHalf,
                        });
                      }}
                    >
                      ＋
                    </button>
                  )}
                </div>
              )}
              {periodForm && (
                <div className="ntm-period-form">
                  <span className="ntm-period-form-title">
                    {periodForm.mode === "add" ? "新增期間" : "複製期間"}
                  </span>
                  <input
                    type="number"
                    className="ntm-period-year-input"
                    value={periodForm.year}
                    min={2020}
                    max={2099}
                    onChange={(e) =>
                      setPeriodForm((f) =>
                        f
                          ? {
                              ...f,
                              year: parseInt(e.target.value) || f.year,
                            }
                          : null,
                      )
                    }
                  />
                  <div className="ntm-period-half-btns">
                    {(["H1", "H2"] as const).map((h) => (
                      <button
                        key={h}
                        className={`ntm-period-half-btn${periodForm.halfYear === h ? " active" : ""}`}
                        onClick={() =>
                          setPeriodForm((f) =>
                            f ? { ...f, halfYear: h } : null,
                          )
                        }
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                  <div className="ntm-period-form-actions">
                    <button
                      className="ntm-period-confirm-btn"
                      onClick={() => {
                        if (periodForm.mode === "add") {
                          onAddPeriod?.(periodForm.halfYear, periodForm.year);
                        } else {
                          if (activePeriodId)
                            onCopyPeriod?.(
                              activePeriodId,
                              periodForm.halfYear,
                              periodForm.year,
                            );
                        }
                        setPeriodForm(null);
                      }}
                    >
                      {periodForm.mode === "add" ? "新增" : "複製"}
                    </button>
                    <button
                      className="ntm-period-cancel-btn"
                      onClick={() => setPeriodForm(null)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── G Section ─────────────────────────────────── */}
          <div className="ntm-section-header" onClick={() => toggle("g")}>
            <button className="ntm-collapse-btn">
              {collapsed["g"] ? "▶" : "▼"}
            </button>
            <span className="ntm-section-label">目標 G</span>
            <span className="ntm-count-badge">{data.goals.length}</span>
            <button
              className="ntm-add-btn"
              title="新增目標"
              onClick={(e) => {
                e.stopPropagation();
                onAddGoal();
              }}
            >
              ＋
            </button>
          </div>
          {!collapsed["g"] && (
            <>
              {data.goals.length === 0 && (
                <div className="ntm-empty">尚無目標，按 ＋ 新增</div>
              )}
              {data.goals.map((g) => (
                <div
                  key={g.id}
                  className={`ntm-item-row${selectedNodeId === `g-${g.id}` ? " selected" : ""}`}
                  onClick={() => onSelectNode(`g-${g.id}`)}
                >
                  <span className="ntm-type-badge g">G</span>
                  <span className="ntm-item-label" title={g.title}>
                    {g.label} {g.title}
                  </span>
                  <div className="ntm-item-actions">
                    <button
                      className="ntm-action-btn"
                      title="複製目標"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopyGoal(g.id);
                      }}
                    >
                      ⧉
                    </button>
                    <button
                      className="ntm-action-btn del"
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
              ))}
            </>
          )}

          {/* ── S Section ─────────────────────────────────── */}
          <div className="ntm-section-header" onClick={() => toggle("s")}>
            <button className="ntm-collapse-btn">
              {collapsed["s"] ? "▶" : "▼"}
            </button>
            <span className="ntm-section-label">策略 S</span>
            <span className="ntm-count-badge">
              {data.goals.reduce((n, g) => n + g.strategies.length, 0)}
            </span>
            <button
              className="ntm-add-btn"
              title="新增策略"
              onClick={(e) => {
                e.stopPropagation();
                if (data.goals.length === 1) {
                  onAddStrategy(data.goals[0].id);
                } else {
                  setAddingStratFor(addingStratFor ? null : "__pick__");
                }
              }}
            >
              ＋
            </button>
          </div>
          {addingStratFor === "__pick__" && (
            <div className="ntm-goal-picker">
              <span>選擇目標：</span>
              {data.goals.map((g) => (
                <button
                  key={g.id}
                  className="ntm-goal-pick-btn"
                  onClick={() => {
                    onAddStrategy(g.id);
                    setAddingStratFor(null);
                  }}
                >
                  {g.label}
                </button>
              ))}
              <button
                className="ntm-goal-pick-cancel"
                onClick={() => setAddingStratFor(null)}
              >
                取消
              </button>
            </div>
          )}
          {!collapsed["s"] && (
            <>
              {data.goals.flatMap((g) => g.strategies).length === 0 && (
                <div className="ntm-empty">尚無策略，按 ＋ 新增</div>
              )}
              {data.goals.flatMap((g) =>
                g.strategies.map((s) => (
                  <div
                    key={s.id}
                    className={`ntm-item-row${selectedNodeId === `s-${s.id}` ? " selected" : ""}`}
                    onClick={() => onSelectNode(`s-${s.id}`)}
                  >
                    <span className="ntm-type-badge s">S</span>
                    <span className="ntm-item-label" title={s.title}>
                      <span className="ntm-parent-hint">{g.label}</span>{" "}
                      {s.title}
                    </span>
                    <div className="ntm-item-actions">
                      <button
                        className="ntm-action-btn"
                        title="複製策略"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopyStrategy(s.id);
                        }}
                      >
                        ⧉
                      </button>
                      <button
                        className="ntm-action-btn del"
                        title="刪除策略"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteStrategy(s.id);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )),
              )}
            </>
          )}
        </>
      )}

      {moduleId === "other" && (
        <>
          {/* ── 自由節點 Section ──────────────────────────── */}
          <div className="ntm-section-header" onClick={() => toggle("free")}>
            <button className="ntm-collapse-btn">
              {collapsed["free"] ? "▶" : "▼"}
            </button>
            <span className="ntm-section-label">其他 (自由節點)</span>
            <span className="ntm-count-badge">{freeNodes.length}</span>
            <button
              className="ntm-add-btn"
              title="新增自由節點"
              onClick={(e) => {
                e.stopPropagation();
                onAddFreeNode();
              }}
            >
              ＋
            </button>
          </div>
          {!collapsed["free"] && (
            <>
              {freeNodes.length === 0 && (
                <div className="ntm-empty">按 ＋ 新增自由節點</div>
              )}
              {freeNodes.map((fn) => (
                <div
                  key={fn.id}
                  className={`ntm-item-row${selectedNodeId === `free-${fn.id}` ? " selected" : ""}`}
                  onClick={() => onSelectNode(`free-${fn.id}`)}
                >
                  <span className="ntm-type-badge free">其</span>
                  <span className="ntm-item-label">
                    {fn.name || "自由節點"}
                  </span>
                  <div className="ntm-item-actions">
                    <button
                      className="ntm-action-btn"
                      title="複製"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopyFreeNode(fn.id);
                      }}
                    >
                      ⧉
                    </button>
                    <button
                      className="ntm-action-btn del"
                      title="刪除"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFreeNode(fn.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}

      {/* dummy usage to avoid unused-var — onUpdateData used by NodeConfig */}
      {void onUpdateData}
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
  onAddGoalKpiOfType: (goalId: string, type: "direct" | "aggregate") => void;
  onDeleteGoalKpi: (gkId: string) => void;
  onCopyGoalKpi: (gkId: string) => void;
  style?: React.CSSProperties;
}

function KpiGoalTree({
  draftGoals,
  deptActivities,
  selectedNodeId,
  onSelectNode,
  onAddGoalKpiOfType,
  onDeleteGoalKpi,
  onCopyGoalKpi,
  style,
}: KpiGoalTreeProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  return (
    <div className="kpid-ogs-tree" style={style}>
      <div className="kpid-tree-section-label">KPI 模式 — 目標 GoalKPI</div>
      <div className="kpid-tree-g-list">
        {draftGoals.map((g) => {
          const gkpis = g.goalKpis ?? [];
          const aggKpis = gkpis.filter(isGKpi);
          const directKpis = gkpis.filter((gk) => !isGKpi(gk));
          const gkpiKey = `${g.id}-gkpi`;
          const subKey = `${g.id}-sub`;

          const renderGkRow = (gk: GoalKPI) => {
            const result = computeGoalKpiResult(
              gk,
              g,
              deptActivities,
              draftGoals,
            );
            const isPct = gk.type === "pct_activity";
            const isAggType = gk.goalKpiType === "aggregate";

            let badgeText: string;
            let badgeClass: string;
            if (isPct) {
              const pct = result.actual ?? 0;
              const tgt = gk.target ?? 60;
              badgeClass =
                pct >= tgt ? " done" : pct >= tgt * 0.6 ? " ok" : " warn";
              badgeText =
                result.actual != null
                  ? `${result.actual}% / ${gk.target ?? "─"}%`
                  : "─";
            } else if (isAggType) {
              const rate = result.rate;
              badgeClass =
                rate !== null
                  ? rate >= 100
                    ? " done"
                    : rate >= 60
                      ? " ok"
                      : " warn"
                  : "";
              badgeText = rate !== null ? `${rate}%` : "─";
            } else {
              const rate = result.rate;
              badgeClass =
                rate !== null
                  ? rate >= 100
                    ? " done"
                    : rate >= 60
                      ? " ok"
                      : " warn"
                  : "";
              badgeText =
                result.actual != null || result.target != null
                  ? `${result.actual ?? "─"}${gk.unit ? ` ${gk.unit}` : ""} / ${result.target ?? "─"}${gk.unit ? ` ${gk.unit}` : ""}`
                  : "─";
            }

            return (
              <div
                key={gk.id}
                className={`kpid-tree-gk-full-row${selectedNodeId === `gk-${gk.id}` ? " selected" : ""}`}
                onClick={() => onSelectNode(`gk-${gk.id}`)}
              >
                <div className="kpid-tree-gk-row-main">
                  <span className="kpid-tree-gk-fullname" title={gk.label}>
                    {gk.isHeadline && (
                      <span className="kpid-tree-gk-star">★ </span>
                    )}
                    {gk.label}
                  </span>
                  <span className={`kpid-tree-gk-pct${badgeClass}`}>
                    {badgeText}
                  </span>
                  <div className="ntm-item-actions kpid-tree-gk-actions">
                    <button
                      className="ntm-action-btn"
                      title="複製"
                      onClick={(e) => {
                        e.stopPropagation();
                        onCopyGoalKpi(gk.id);
                      }}
                    >
                      ⧉
                    </button>
                    <button
                      className="ntm-action-btn del"
                      title="刪除"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteGoalKpi(gk.id);
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                {isPct && result.metCount != null && (
                  <div className="kpid-tree-gk-row-vals">
                    {result.metCount}&nbsp;/&nbsp;{result.totalCount}
                    &nbsp;活動達標
                  </div>
                )}
              </div>
            );
          };

          return (
            <div key={g.id} className="kpid-tree-g-item">
              {/* G header — click to select */}
              <div
                className={`kpid-tree-g-header${selectedNodeId === `g-${g.id}` ? " selected" : ""}`}
                onClick={() => onSelectNode(`g-${g.id}`)}
              >
                <span className="kpid-tree-g-label">{g.label}</span>
                <span className="kpid-tree-g-title">{g.title}</span>
              </div>

              {/* G-KPI section */}
              <div
                className="ntm-section-header kpid-tree-sub-header"
                onClick={() => toggle(gkpiKey)}
              >
                <button className="ntm-collapse-btn">
                  {collapsed.has(gkpiKey) ? "▶" : "▼"}
                </button>
                <span className="ntm-section-label">G-KPI</span>
                <span className="ntm-count-badge">{aggKpis.length}</span>
                <button
                  className="ntm-add-btn"
                  title="新增 G-KPI"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddGoalKpiOfType(g.id, "aggregate");
                  }}
                >
                  ＋
                </button>
              </div>
              {!collapsed.has(gkpiKey) && aggKpis.length > 0 && (
                <div className="kpid-tree-gk-rows">
                  {aggKpis.map(renderGkRow)}
                </div>
              )}

              {/* G-sub-KPI section */}
              <div
                className="ntm-section-header kpid-tree-sub-header"
                onClick={() => toggle(subKey)}
              >
                <button className="ntm-collapse-btn">
                  {collapsed.has(subKey) ? "▶" : "▼"}
                </button>
                <span className="ntm-section-label">G-sub-KPI</span>
                <span className="ntm-count-badge">{directKpis.length}</span>
                <button
                  className="ntm-add-btn"
                  title="新增 G-sub-KPI"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddGoalKpiOfType(g.id, "direct");
                  }}
                >
                  ＋
                </button>
              </div>
              {!collapsed.has(subKey) && directKpis.length > 0 && (
                <div className="kpid-tree-gk-rows">
                  {directKpis.map(renderGkRow)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Goal KPI Summary Panel (right panel for G node in KPI mode) ───────────────

interface GoalKpiSummaryPanelProps {
  draftGoal: Goal;
  allGoals: Goal[];
  deptActivities: DeptActivity[];
  onSelectGk: (gkId: string) => void;
  onUpdateGoalKpis: (goalId: string, kpis: GoalKPI[]) => void;
  onDeleteGoalKpi: (gkId: string) => void;
  onCopyGoalKpi: (gkId: string) => void;
  onAddGoalKpiOfType: (goalId: string, type: "direct" | "aggregate") => void;
  onClose: () => void;
}

function GoalKpiSummaryPanel({
  draftGoal,
  allGoals,
  deptActivities,
  onSelectGk,
  onUpdateGoalKpis: _onUpdateGoalKpis,
  onDeleteGoalKpi,
  onCopyGoalKpi,
  onAddGoalKpiOfType,
  onClose,
}: GoalKpiSummaryPanelProps) {
  const gkpis = draftGoal.goalKpis ?? [];
  const results = gkpis.map((gk) => ({
    gk,
    result: computeGoalKpiResult(gk, draftGoal, deptActivities, allGoals),
  }));
  const metCount = results.filter(
    ({ result }) => (result.rate ?? 0) >= 100,
  ).length;
  const ratedResults = results.filter(({ result }) => result.rate !== null);
  const overallRate =
    ratedResults.length > 0
      ? Math.round(
          (ratedResults.reduce((s, { result }) => s + (result.rate ?? 0), 0) /
            ratedResults.length) *
            10,
        ) / 10
      : null;

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
    _onUpdateGoalKpis(draftGoal.id, [...gkpis, newGk]);
  };
  void addGk; // keep for potential future use

  const aggKpis = gkpis.filter(isGKpi);
  const directKpis = gkpis.filter((gk) => !isGKpi(gk));

  const renderGkRow = (gk: GoalKPI) => {
    const r = results.find((x) => x.gk.id === gk.id)?.result;
    const isPct = gk.type === "pct_activity";
    const isAggType = gk.goalKpiType === "aggregate";

    let rateText: string;
    let rateClass: string;
    if (isPct) {
      const pct = r?.actual ?? 0;
      const tgt = gk.target ?? 60;
      rateClass = pct >= tgt ? " done" : pct >= tgt * 0.6 ? " ok" : " warn";
      rateText =
        r?.actual != null ? `${r.actual}% / ${gk.target ?? "─"}%` : "─";
    } else if (isAggType) {
      const rate = r?.rate ?? null;
      rateClass =
        rate !== null
          ? rate >= 100
            ? " done"
            : rate >= 60
              ? " ok"
              : " warn"
          : "";
      rateText = rate !== null ? `${rate}%` : "─";
    } else {
      const rate = r?.rate ?? null;
      rateClass =
        rate !== null
          ? rate >= 100
            ? " done"
            : rate >= 60
              ? " ok"
              : " warn"
          : "";
      rateText =
        r && (r.actual !== null || r.target !== null)
          ? `${r.actual ?? "─"}${gk.unit ? ` ${gk.unit}` : ""} / ${r.target ?? "─"}${gk.unit ? ` ${gk.unit}` : ""}`
          : "─";
    }

    return (
      <div
        key={gk.id}
        className="kpid-gks-row"
        onClick={() => onSelectGk(gk.id)}
        title="點擊進入 KPI 設定"
        role="button"
        tabIndex={0}
      >
        <span className="kpid-gks-name">
          {gk.isHeadline && <span className="kpid-tree-gk-star">★ </span>}
          {gk.label}
        </span>
        {isPct && r?.metCount != null && (
          <span className="kpid-gks-vals">
            {r.metCount}&nbsp;/&nbsp;{r.totalCount}&nbsp;活動達標
          </span>
        )}
        <span className={`kpid-gks-rate${rateClass}`}>{rateText}</span>
        <div className="ntm-item-actions kpid-gks-row-actions">
          <button
            className="ntm-action-btn"
            title="複製"
            onClick={(e) => {
              e.stopPropagation();
              onCopyGoalKpi(gk.id);
            }}
          >
            ⧉
          </button>
          <button
            className="ntm-action-btn del"
            title="刪除"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteGoalKpi(gk.id);
            }}
          >
            ✕
          </button>
        </div>
        <span className="kpid-gks-arrow">›</span>
      </div>
    );
  };

  return (
    <div className="kpid-node-config">
      <div className="kpid-config-header">
        <span className="kpid-config-title">{draftGoal.label}｜KPI 總覽</span>
        <button className="kpid-config-close" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="kpid-g-summary-bar">
        <span className="kpid-g-summary-met">
          達標&nbsp;<strong>{metCount}</strong>&nbsp;/&nbsp;{gkpis.length}
        </span>
        {overallRate !== null && (
          <span
            className={`kpid-g-summary-rate${
              overallRate >= 100 ? " done" : overallRate >= 60 ? " ok" : " warn"
            }`}
          >
            整體&nbsp;<strong>{overallRate}%</strong>
          </span>
        )}
      </div>

      <div className="kpid-config-section">
        {gkpis.length === 0 ? (
          <div className="kpid-empty-links">
            尚無 GoalKPI，按下方「＋ 新增」建立
          </div>
        ) : (
          <>
            {aggKpis.length > 0 && (
              <>
                <div className="kpid-gks-subhead">G-KPI</div>
                {aggKpis.map(renderGkRow)}
              </>
            )}
            {directKpis.length > 0 && (
              <>
                <div
                  className={`kpid-gks-subhead${
                    aggKpis.length > 0 ? " sub" : ""
                  }`}
                >
                  G-sub-KPI
                </div>
                {directKpis.map(renderGkRow)}
              </>
            )}
          </>
        )}
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button
            className="kpid-gks-add-btn"
            onClick={() => onAddGoalKpiOfType(draftGoal.id, "direct")}
          >
            ＋ G-sub-KPI
          </button>
          <button
            className="kpid-gks-add-btn"
            onClick={() => onAddGoalKpiOfType(draftGoal.id, "aggregate")}
          >
            ＋ G-KPI
          </button>
        </div>
      </div>
      <p
        className="kpid-config-hint"
        style={{ padding: "0 14px 12px", marginTop: 0 }}
      >
        點擊各列可進入 KPI 詳細設定
      </p>
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
  freeNodes: FreeNode[];
  periodId?: string;
  isReadOnly?: boolean;
  onUpdateData: (d: OGSMData) => void;
  onUpdateFreeNode: (fn: FreeNode) => void;
  onUpdateDraftGk: (gk: GoalKPI, goalId: string) => void;
  onUpdateGoalKpis: (goalId: string, kpis: GoalKPI[]) => void;
  onDeleteGoalKpi: (gkId: string) => void;
  onCopyGoalKpi: (gkId: string) => void;
  onAddGoalKpiOfType: (goalId: string, type: "direct" | "aggregate") => void;
  onSelectNode: (id: string) => void;
  onUpdateActivity?: (act: DeptActivity) => void;
  onClose: () => void;
}

function NodeConfig({
  selectedNodeId,
  viewMode,
  data,
  draftGoals,
  deptActivities,
  freeNodes,
  periodId,
  isReadOnly = false,
  onUpdateData,
  onUpdateFreeNode,
  onUpdateDraftGk,
  onUpdateGoalKpis,
  onDeleteGoalKpi,
  onCopyGoalKpi,
  onAddGoalKpiOfType,
  onSelectNode,
  onUpdateActivity,
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
          <div className="kpid-config-label">部門目標</div>
          <textarea
            className="kpid-config-textarea"
            rows={4}
            value={data.objectives.deptO}
            onChange={(e) =>
              onUpdateData({
                ...data,
                objectives: { ...data.objectives, deptO: e.target.value },
              })
            }
          />
          {data.objectives.orgO && (
            <>
              <div className="kpid-config-label" style={{ marginTop: 8 }}>
                組織目標（唯讀）
              </div>
              <p className="kpid-config-hint">{data.objectives.orgO}</p>
            </>
          )}
        </div>
      </div>
    );
  }

  if (selectedNodeId.startsWith("g-")) {
    const gid = selectedNodeId.slice(2);
    const draftGoal = draftGoals.find((x) => x.id === gid);
    if (!draftGoal) return null;

    if (viewMode === "kpi") {
      return (
        <GoalKpiSummaryPanel
          draftGoal={draftGoal}
          allGoals={draftGoals}
          deptActivities={deptActivities}
          onSelectGk={(gkId) => onSelectNode(`gk-${gkId}`)}
          onUpdateGoalKpis={onUpdateGoalKpis}
          onDeleteGoalKpi={onDeleteGoalKpi}
          onCopyGoalKpi={onCopyGoalKpi}
          onAddGoalKpiOfType={onAddGoalKpiOfType}
          onClose={onClose}
        />
      );
    }

    // Item mode: editable G panel
    const goal = data.goals.find((g) => g.id === gid)!;
    return (
      <div className="kpid-node-config">
        <div className="kpid-config-header">
          <span className="kpid-config-title">
            G｜{goal.label} {goal.title}
          </span>
          <button className="kpid-config-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="kpid-config-section">
          <div className="kpid-config-label">標題 (Title)</div>
          <textarea
            className="kpid-config-textarea"
            rows={3}
            value={goal.title}
            onChange={(e) =>
              onUpdateData({
                ...data,
                goals: data.goals.map((g) =>
                  g.id !== gid
                    ? g
                    : {
                        ...g,
                        title: e.target.value,
                        updatedAt: new Date().toISOString(),
                      },
                ),
              })
            }
          />
          <div className="kpid-config-label">說明 (Description)</div>
          <textarea
            className="kpid-config-textarea"
            rows={4}
            value={goal.fullText ?? ""}
            onChange={(e) =>
              onUpdateData({
                ...data,
                goals: data.goals.map((g) =>
                  g.id !== gid
                    ? g
                    : {
                        ...g,
                        fullText: e.target.value,
                        updatedAt: new Date().toISOString(),
                      },
                ),
              })
            }
          />
          <div className="kpid-config-hint">
            GoalKPI：{draftGoal.goalKpis?.length ?? 0} 個 | 策略：
            {goal.strategies.length} 個
          </div>
        </div>
      </div>
    );
  }

  if (selectedNodeId.startsWith("s-")) {
    const sid = selectedNodeId.slice(2);
    const parentGoal = data.goals.find((g) =>
      g.strategies.some((s) => s.id === sid),
    );
    const s = parentGoal?.strategies.find((s) => s.id === sid);
    if (!s || !parentGoal) return null;

    // Activities linked to this strategy (scoped to current period if provided)
    const linkedActs = deptActivities.filter((a) =>
      (a.dashboardLinks ?? []).some(
        (dl) =>
          dl.type === "ogsm" &&
          dl.strategyId === sid &&
          (!periodId || dl.periodId === periodId),
      ),
    );

    return (
      <div className="kpid-node-config">
        <div className="kpid-config-header">
          <span className="kpid-config-title">S｜{s.title}</span>
          <button className="kpid-config-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="kpid-config-section">
          <div className="kpid-config-label">標題 (Title)</div>
          <textarea
            className="kpid-config-textarea"
            rows={3}
            value={s.title}
            onChange={(e) =>
              onUpdateData({
                ...data,
                goals: data.goals.map((g) =>
                  g.id !== parentGoal.id
                    ? g
                    : {
                        ...g,
                        strategies: g.strategies.map((st) =>
                          st.id !== sid
                            ? st
                            : {
                                ...st,
                                title: e.target.value,
                                updatedAt: new Date().toISOString(),
                              },
                        ),
                      },
                ),
              })
            }
          />
          <div className="kpid-config-label">說明 (Description)</div>
          <textarea
            className="kpid-config-textarea"
            rows={3}
            value={s.notes ?? ""}
            onChange={(e) =>
              onUpdateData({
                ...data,
                goals: data.goals.map((g) =>
                  g.id !== parentGoal.id
                    ? g
                    : {
                        ...g,
                        strategies: g.strategies.map((st) =>
                          st.id !== sid
                            ? st
                            : {
                                ...st,
                                notes: e.target.value,
                                updatedAt: new Date().toISOString(),
                              },
                        ),
                      },
                ),
              })
            }
          />
          {linkedActs.length > 0 && (
            <>
              <div className="kpid-config-label" style={{ marginTop: 8 }}>
                已連結措施 M ({linkedActs.length})
              </div>
              {linkedActs.map((a) => (
                <div key={a.id} className="kpid-kpi-summary-row">
                  <span className="kpid-kpi-summary-name">
                    {a.rawText || a.id}
                  </span>
                  {!isReadOnly && onUpdateActivity && (
                    <button
                      className="kpid-remove-btn"
                      title="統除連結"
                      onClick={() => {
                        const other = (a.dashboardLinks ?? []).filter(
                          (l) =>
                            !(
                              l.type === "ogsm" &&
                              l.strategyId === sid &&
                              (!periodId || l.periodId === periodId)
                            ),
                        );
                        onUpdateActivity({
                          ...a,
                          dashboardLinks: other.length ? other : undefined,
                        });
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
          {!isReadOnly &&
            onUpdateActivity &&
            (() => {
              const unlinkable = deptActivities.filter(
                (a) =>
                  !(a.dashboardLinks ?? []).some(
                    (l) =>
                      l.type === "ogsm" &&
                      l.strategyId === sid &&
                      (!periodId || l.periodId === periodId),
                  ),
              );
              if (unlinkable.length === 0) return null;
              const goalId = parentGoal.id;
              return (
                <>
                  <div className="kpid-config-label" style={{ marginTop: 8 }}>
                    新增活動連結
                  </div>
                  <select
                    className="kpid-add-select"
                    value=""
                    onChange={(e) => {
                      if (!e.target.value) return;
                      const target = deptActivities.find(
                        (a) => a.id === e.target.value,
                      );
                      if (!target) return;
                      const allLinks = target.dashboardLinks ?? [];
                      const exists = allLinks.some(
                        (l) =>
                          l.type === "ogsm" &&
                          l.periodId === (periodId ?? "") &&
                          l.goalId === goalId &&
                          l.strategyId === sid,
                      );
                      if (exists) return;
                      onUpdateActivity({
                        ...target,
                        dashboardLinks: [
                          ...allLinks,
                          {
                            id: genId("dlink"),
                            type: "ogsm",
                            periodId: periodId ?? "",
                            goalId,
                            strategyId: sid,
                            exclude: false,
                          },
                        ],
                        frameworks: (target.frameworks ?? []).includes("ogsm")
                          ? target.frameworks
                          : [...(target.frameworks ?? []), "ogsm"],
                      });
                    }}
                  >
                    <option value="">── 選擇活動連結……</option>
                    {unlinkable.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.rawText || a.id}
                      </option>
                    ))}
                  </select>
                </>
              );
            })()}
        </div>
      </div>
    );
  }

  if (selectedNodeId.startsWith("m-")) {
    const actId = selectedNodeId.slice(2);
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
          {act.kpis.length === 0 && (
            <p className="kpid-config-hint">尚無 KPI</p>
          )}
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
          <p className="kpid-config-hint" style={{ marginTop: 8 }}>
            如需編輯此活動或 KPI，請至「活動管理」頁面。
          </p>
        </div>
      </div>
    );
  }

  if (selectedNodeId.startsWith("free-")) {
    const fnId = selectedNodeId.slice(5);
    const fn = freeNodes.find((f) => f.id === fnId);
    if (!fn) return null;
    const linkedActs = deptActivities.filter((a) =>
      fn.linkedActivityIds.includes(a.id),
    );
    const standaloneActs = deptActivities.filter(
      (a) =>
        (a.frameworks ?? []).includes("standalone") &&
        !fn.linkedActivityIds.includes(a.id),
    );

    return (
      <div className="kpid-node-config">
        <div className="kpid-config-header">
          <span className="kpid-config-title">
            其他｜{fn.name || "自由節點"}
          </span>
          <button className="kpid-config-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="kpid-config-section">
          <div className="kpid-config-label">名稱</div>
          <input
            className="kpid-config-input"
            value={fn.name}
            onChange={(e) => onUpdateFreeNode({ ...fn, name: e.target.value })}
          />
          <div className="kpid-config-label">說明</div>
          <textarea
            className="kpid-config-textarea"
            rows={3}
            value={fn.description ?? ""}
            onChange={(e) =>
              onUpdateFreeNode({ ...fn, description: e.target.value })
            }
          />
          {linkedActs.length > 0 && (
            <>
              <div className="kpid-config-label" style={{ marginTop: 8 }}>
                已連結活動 ({linkedActs.length})
              </div>
              {linkedActs.map((a) => (
                <div key={a.id} className="kpid-linked-row">
                  <span className="kpid-linked-name">{a.rawText || a.id}</span>
                  <button
                    className="kpid-remove-btn"
                    onClick={() =>
                      onUpdateFreeNode({
                        ...fn,
                        linkedActivityIds: fn.linkedActivityIds.filter(
                          (id) => id !== a.id,
                        ),
                      })
                    }
                  >
                    ✕
                  </button>
                </div>
              ))}
            </>
          )}
          {standaloneActs.length > 0 && (
            <>
              <div className="kpid-config-label" style={{ marginTop: 8 }}>
                新增活動連結
              </div>
              <select
                className="kpid-add-select"
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  onUpdateFreeNode({
                    ...fn,
                    linkedActivityIds: [
                      ...fn.linkedActivityIds,
                      e.target.value,
                    ],
                  });
                }}
              >
                <option value="">── 選擇活動...</option>
                {standaloneActs.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.rawText || a.id}
                  </option>
                ))}
              </select>
            </>
          )}
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
        onDelete={() => {
          onDeleteGoalKpi(gkId);
          onClose();
        }}
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
  availablePeriods = [],
  initialGoalId,
  isReadOnly = false,
  periodId,
  onSwitchPeriod,
  onAddPeriod,
  onCopyPeriod,
  onDeletePeriod,
  onUpdateData,
  onDraftStateChange,
  onUpdateActivity,
  onAddGoal,
  onDeleteGoal,
  onAddStrategyToGoal,
  onDeleteStrategy,
}: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    initialGoalId ? `g-${initialGoalId}` : null,
  );
  const [draftGoals, setDraftGoals] = useState<Goal[]>(() => data.goals);
  const [hasDraftGkChanges, setHasDraftGkChanges] = useState(false);
  /** Tracks which goal IDs have uncommitted local GoalKPI changes (Bug 4: prevent remote sync overwrite) */
  const draftGoalIds = useRef<Set<string>>(new Set());

  // Notify parent whenever draft state changes (used for navigation guard)
  useEffect(() => {
    onDraftStateChange?.(hasDraftGkChanges);
  }, [hasDraftGkChanges, onDraftStateChange]);

  // Guard onUpdateData in read-only mode
  const safeUpdateData = useCallback(
    (d: OGSMData) => {
      if (isReadOnly) return;
      onUpdateData(d);
    },
    [isReadOnly, onUpdateData],
  );
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(320);
  const dragging = useRef<{
    which: "left" | "right";
    startX: number;
    startW: number;
  } | null>(null);

  // ── FreeNodes state ────────────────────────────────────────────────────────
  const [freeNodes, setFreeNodes] = useState<FreeNode[]>(
    () => data.freeNodes ?? [],
  );

  const commitFreeNodes = useCallback(
    (next: FreeNode[]) => {
      setFreeNodes(next);
      safeUpdateData({ ...data, freeNodes: next });
    },
    [data, safeUpdateData],
  );

  useEffect(() => {
    setFreeNodes(data.freeNodes ?? []);
  }, [data.freeNodes]);

  const addFreeNode = useCallback(() => {
    const fn: FreeNode = {
      id: genId("fn"),
      name: "新自由節點",
      description: "",
      linkedActivityIds: [],
    };
    commitFreeNodes([...(data.freeNodes ?? []), fn]);
    setSelectedNodeId(`free-${fn.id}`);
  }, [data.freeNodes, commitFreeNodes]);

  const deleteFreeNode = useCallback(
    (id: string) => {
      commitFreeNodes((data.freeNodes ?? []).filter((f) => f.id !== id));
      setSelectedNodeId((prev) => (prev === `free-${id}` ? null : prev));
    },
    [data.freeNodes, commitFreeNodes],
  );

  const updateFreeNode = useCallback(
    (fn: FreeNode) => {
      commitFreeNodes(
        (data.freeNodes ?? []).map((f) => (f.id === fn.id ? fn : f)),
      );
    },
    [data.freeNodes, commitFreeNodes],
  );

  const copyFreeNode = useCallback(
    (id: string) => {
      const orig = (data.freeNodes ?? []).find((f) => f.id === id);
      if (!orig) return;
      const copy: FreeNode = {
        ...orig,
        id: genId("fn"),
        name: `${orig.name} (複製)`,
        linkedActivityIds: [],
      };
      commitFreeNodes([...(data.freeNodes ?? []), copy]);
    },
    [data.freeNodes, commitFreeNodes],
  );

  // ── Goal handlers ──────────────────────────────────────────────────────────
  const copyGoal = useCallback(
    (id: string) => {
      // Bug 3 fix: use draftGoals to capture unsaved GoalKPI changes in the copy
      const orig = draftGoals.find((g) => g.id === id);
      if (!orig) return;
      const copy: Goal = {
        ...orig,
        id: genId("goa"),
        title: `${orig.title} (副本)`,
        strategies: [],
        goalKpis: (orig.goalKpis ?? []).map((gk) => ({
          ...gk,
          id: genId("gk"),
        })),
        completionRate: 0,
        updatedAt: new Date().toISOString(),
      };
      safeUpdateData({ ...data, goals: [...data.goals, copy] });
    },
    [draftGoals, data, safeUpdateData],
  );

  // ── Strategy handlers ──────────────────────────────────────────────────────
  const copyStrategy = useCallback(
    (stratId: string) => {
      const parentGoal = data.goals.find((g) =>
        g.strategies.some((s) => s.id === stratId),
      );
      const orig = parentGoal?.strategies.find((s) => s.id === stratId);
      if (!orig || !parentGoal) return;
      const copy: Strategy = {
        ...orig,
        id: genId("str"),
        title: `${orig.title} (複製)`,
        measures: [],
        actionPlans: [],
        completionRate: 0,
        manualRate: null,
        updatedAt: new Date().toISOString(),
      };
      safeUpdateData({
        ...data,
        goals: data.goals.map((g) =>
          g.id !== parentGoal.id
            ? g
            : { ...g, strategies: [...g.strategies, copy] },
        ),
      });
    },
    [data, onUpdateData],
  );

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
        // Bug 4 fix: only preserve local draft goalKpis if this goal has uncommitted
        // local changes; otherwise accept the incoming remote version
        if (draftGoalIds.current.has(g.id)) {
          return { ...g, goalKpis: draft.goalKpis };
        }
        return g;
      }),
    );
  }, [data.goals]);

  const [viewMode, setViewMode] = useState<ViewMode>("item");
  const [moduleId, setModuleId] = useState<ModuleId>(null);

  const updateDraftGk = useCallback((updatedGk: GoalKPI, goalId: string) => {
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
    draftGoalIds.current.add(goalId);
    setHasDraftGkChanges(true);
  }, []);

  // Bug 1: draft guard is handled in App.tsx via tryCloseKpiDesigner + onDraftStateChange
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
    draftGoalIds.current.clear();
    setHasDraftGkChanges(false);
  }, [draftGoals, data, onUpdateData, isReadOnly]);

  const updateGoalKpis = useCallback((goalId: string, kpis: GoalKPI[]) => {
    setDraftGoals((prev) =>
      prev.map((g) => (g.id !== goalId ? g : { ...g, goalKpis: kpis })),
    );
    draftGoalIds.current.add(goalId);
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
    draftGoalIds.current.add(goalId);
    setHasDraftGkChanges(true);
  }, []);

  // 新增指定套型（direct=G-sub-KPI, aggregate=G-KPI）
  const addGoalKpiOfType = useCallback(
    (goalId: string, type: "direct" | "aggregate") => {
      const newGk: GoalKPI = {
        id: genId("gk"),
        label: type === "aggregate" ? "新 G-KPI" : "新 G-sub-KPI",
        unit: "",
        target: null,
        aggregation: "AVERAGE",
        linkedKpis: [],
        goalKpiType: type,
      };
      setDraftGoals((prev) =>
        prev.map((g) =>
          g.id !== goalId
            ? g
            : { ...g, goalKpis: [...(g.goalKpis ?? []), newGk] },
        ),
      );
      draftGoalIds.current.add(goalId);
      setHasDraftGkChanges(true);
      // 自動切換到新 GK （需知道 id）
      setSelectedNodeId(`gk-${newGk.id}`);
    },
    [],
  );

  const deleteGoalKpi = useCallback((gkId: string) => {
    setDraftGoals((prev) =>
      prev.map((g) => {
        if ((g.goalKpis ?? []).some((gk) => gk.id === gkId)) {
          draftGoalIds.current.add(g.id);
        }
        return {
          ...g,
          goalKpis: (g.goalKpis ?? []).filter((gk) => gk.id !== gkId),
        };
      }),
    );
    setHasDraftGkChanges(true);
    setSelectedNodeId((prev) => (prev === `gk-${gkId}` ? null : prev));
  }, []);

  const copyGoalKpi = useCallback((gkId: string) => {
    setDraftGoals((prev) =>
      prev.map((g) => {
        const idx = (g.goalKpis ?? []).findIndex((gk) => gk.id === gkId);
        if (idx === -1) return g;
        draftGoalIds.current.add(g.id);
        const src = g.goalKpis![idx];
        const copy: GoalKPI = {
          ...src,
          id: genId("gk"),
          label: src.label + " (副本)",
        };
        const next = [...g.goalKpis!];
        next.splice(idx + 1, 0, copy);
        return { ...g, goalKpis: next };
      }),
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
      {/* Bug 2 fix: read-only banner */}
      {isReadOnly && (
        <div className="kpid-readonly-banner">
          👁 檢視模式：此部門為唯讀，無法編輯
        </div>
      )}
      {/* Left: module select + panel */}
      <div className="kpid-root-inner">
        <div className="kpid-left-wrap" style={{ width: leftWidth }}>
          <div className="kpid-left-module-bar">
            <select
              className="kpid-left-module-select"
              value={moduleId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setModuleId(v === "" ? null : (v as "ogsm" | "other"));
                setSelectedNodeId(null);
              }}
            >
              <option value="">── 請選擇模組 ──</option>
              <option value="ogsm">OGSM 目標體系</option>
              <option value="other">其他（自由節點）</option>
            </select>
          </div>
          {moduleId === "ogsm" && viewMode === "kpi" ? (
            <KpiGoalTree
              draftGoals={draftGoals}
              deptActivities={deptActivities}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
              onAddGoalKpi={addGoalKpi}
              onAddGoalKpiOfType={addGoalKpiOfType}
              onDeleteGoalKpi={deleteGoalKpi}
              onCopyGoalKpi={copyGoalKpi}
            />
          ) : (
            <NodeTypeManager
              data={data}
              deptActivities={deptActivities}
              freeNodes={freeNodes}
              periods={availablePeriods}
              activePeriodId={periodId}
              onSwitchPeriod={onSwitchPeriod}
              isReadOnly={isReadOnly}
              onAddPeriod={onAddPeriod}
              onCopyPeriod={onCopyPeriod}
              onDeletePeriod={onDeletePeriod}
              selectedNodeId={selectedNodeId}
              moduleId={moduleId}
              onSelectNode={setSelectedNodeId}
              onUpdateData={safeUpdateData}
              onAddGoal={onAddGoal}
              onDeleteGoal={onDeleteGoal}
              onCopyGoal={copyGoal}
              onAddStrategy={onAddStrategyToGoal}
              onDeleteStrategy={onDeleteStrategy}
              onCopyStrategy={copyStrategy}
              onAddFreeNode={addFreeNode}
              onDeleteFreeNode={deleteFreeNode}
              onCopyFreeNode={copyFreeNode}
            />
          )}
        </div>
        <div
          className="kpid-resize-handle"
          onMouseDown={(e) => startDrag("left", e, leftWidth)}
        />

        {/* Center: Canvas */}
        <div className="kpid-canvas-wrap">
          <div className="kpid-canvas-toolbar">
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
                disabled={moduleId !== "ogsm"}
                title={
                  moduleId !== "ogsm" ? "KPI 模式僅支援 OGSM 模組" : undefined
                }
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
          {viewMode === "kpi" && moduleId === "ogsm" ? (
            <KpiCanvas
              draftGoals={draftGoals}
              deptActivities={deptActivities}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
            />
          ) : (
            <ItemCanvas
              data={{ ...data, goals: draftGoals, freeNodes }}
              deptActivities={deptActivities}
              freeNodes={freeNodes}
              periods={availablePeriods}
              activePeriodId={periodId}
              onSwitchPeriod={onSwitchPeriod}
              selectedNodeId={selectedNodeId}
              moduleId={moduleId}
              onSelectNode={setSelectedNodeId}
            />
          )}
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
                freeNodes={freeNodes}
                periodId={periodId}
                isReadOnly={isReadOnly}
                onUpdateData={onUpdateData}
                onUpdateFreeNode={updateFreeNode}
                onUpdateDraftGk={updateDraftGk}
                onUpdateGoalKpis={updateGoalKpis}
                onDeleteGoalKpi={deleteGoalKpi}
                onCopyGoalKpi={copyGoalKpi}
                onAddGoalKpiOfType={addGoalKpiOfType}
                onSelectNode={setSelectedNodeId}
                onUpdateActivity={onUpdateActivity}
                onClose={() => setSelectedNodeId(null)}
              />
            </div>
          </>
        )}
      </div>
      {/* /kpid-root-inner */}
    </div>
  );
}
