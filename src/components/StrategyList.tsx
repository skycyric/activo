import { useState, useRef, useEffect } from "react";
import type {
  Goal,
  GoalKPI,
  GoalKpiLink,
  Strategy,
  Team,
  DeptActivity,
} from "../schemas/ogsm";
import { genId } from "../utils/csvParser";
import { countStrategyWarnings } from "../utils/planWarnings";
import { computeGoalKpiResult } from "../utils/goalKpi";

interface Props {
  goal: Goal | null;
  strategies: Strategy[];
  selectedStrategyId: string | null;
  onSelectStrategy: (id: string, warnFilter?: "overdue" | "warning") => void;
  onAddStrategy: () => void;
  onUpdateGoal: (g: Goal) => void;
  onDeleteGoal: (id: string) => void;
  filterOwner: string;
  onFilterOwner: (v: string) => void;
  teams: Team[];
  warnDaysBefore: number;
  isReadOnly?: boolean;
  /** V3 架構：部門活動清單，用於 GoalKPI 連結查找 */
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
  // Measures-based stats: count measures and count measures considered as "???"
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
            {/* Measures-based summary */}
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
  onAddStrategy,
  onUpdateGoal,
  onDeleteGoal,
  filterOwner,
  onFilterOwner,
  teams,
  warnDaysBefore,
  isReadOnly = false,
  deptActivities = [],
}: Props) {
  const [editingGoalTitle, setEditingGoalTitle] = useState(false);
  const [titleText, setTitleText] = useState("");
  const [showKpiPanel, setShowKpiPanel] = useState(false);
  const [editingKpiId, setEditingKpiId] = useState<string | null>(null);
  const [kpiForm, setKpiForm] = useState<{
    label: string;
    unit: string;
    target: string;
    aggregation: "SUM" | "AVERAGE";
    type: "value" | "pct_activity" | "progress";
    isHeadline: boolean;
    thresholdGoalKpiIds: string[];
  }>({
    label: "",
    unit: "%",
    target: "",
    aggregation: "SUM",
    type: "value",
    isHeadline: false,
    thresholdGoalKpiIds: [],
  });
  const [showLinkPicker, setShowLinkPicker] = useState<string | null>(null); // goalKpiId
  const [linkPickerSearch, setLinkPickerSearch] = useState("");
  const [showThresholdPicker, setShowThresholdPicker] = useState<string | null>(
    null,
  ); // goalKpiId
  const [showActivityBreakdown, setShowActivityBreakdown] = useState<
    string | null
  >(null); // goalKpiId
  const [editingPctId, setEditingPctId] = useState<string | null>(null);
  const [pctForm, setPctForm] = useState<{
    label: string;
    target: string;
  }>({
    label: "",
    target: "60",
  });
  const [topH, setTopH] = useState(260);
  const dragState = useRef<{ startY: number; startH: number } | null>(null);
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current) return;
      const delta = e.clientY - dragState.current.startY;
      setTopH(Math.max(80, Math.min(700, dragState.current.startH + delta)));
    };
    const onUp = () => {
      dragState.current = null;
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, []);

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

  // Compute aggregated actual/target for a GoalKPI
  // type="value"        : AVERAGE/SUM of linked KPI values (existing logic)
  // type="pct_activity" : % of activities (across thresholdGoalKpiIds) where
  //                       actual >= at least one threshold GoalKPI's target (OR logic)
  // type="progress"     : average actual of linked progress-type KPIs
  // computeGoalKpi 已抽取至 utils/goalKpi.ts（computeGoalKpiResult）
  const computeGoalKpi = (gk: GoalKPI) =>
    computeGoalKpiResult(gk, goal!, deptActivities);
  const saveKpi = () => {
    if (!kpiForm.label.trim()) return;
    const targetVal =
      kpiForm.target.trim() !== "" ? parseFloat(kpiForm.target) : null;
    if (editingKpiId && editingKpiId !== "new") {
      const updated = goalKpis.map((gk) =>
        gk.id === editingKpiId
          ? {
              ...gk,
              label: kpiForm.label.trim(),
              unit: kpiForm.unit.trim(),
              target:
                targetVal === null || Number.isNaN(targetVal)
                  ? null
                  : targetVal,
              aggregation: kpiForm.aggregation,
              type: kpiForm.type,
              isHeadline: kpiForm.isHeadline,
              thresholdGoalKpiIds: kpiForm.thresholdGoalKpiIds,
            }
          : gk,
      );
      onUpdateGoal({ ...goal, goalKpis: updated });
    } else {
      const newKpi: GoalKPI = {
        id: genId("gkpi"),
        label: kpiForm.label.trim(),
        unit: kpiForm.unit.trim(),
        target:
          targetVal === null || Number.isNaN(targetVal) ? null : targetVal,
        aggregation: kpiForm.aggregation,
        type: kpiForm.type,
        isHeadline: kpiForm.isHeadline,
        thresholdGoalKpiIds: kpiForm.thresholdGoalKpiIds,
        linkedKpis: [],
        goalKpiType: "direct",
      };
      onUpdateGoal({ ...goal, goalKpis: [...goalKpis, newKpi] });
    }
    setEditingKpiId(null);
    setKpiForm({
      label: "",
      unit: "%",
      target: "",
      aggregation: "SUM",
      type: "value",
      isHeadline: false,
      thresholdGoalKpiIds: [],
    });
  };

  const savePct = () => {
    if (!pctForm.label.trim()) return;
    const targetVal =
      pctForm.target.trim() !== "" ? parseFloat(pctForm.target) : null;
    if (editingPctId && editingPctId !== "new") {
      const updated = goalKpis.map((gk) =>
        gk.id === editingPctId
          ? {
              ...gk,
              label: pctForm.label.trim(),
              target:
                targetVal === null || Number.isNaN(targetVal)
                  ? null
                  : targetVal,
            }
          : gk,
      );
      onUpdateGoal({ ...goal, goalKpis: updated });
    } else {
      const newKpi: GoalKPI = {
        id: genId("gkpi"),
        label: pctForm.label.trim(),
        unit: "%",
        target:
          targetVal === null || Number.isNaN(targetVal) ? null : targetVal,
        aggregation: "SUM",
        type: "pct_activity",
        isHeadline: false,
        thresholdGoalKpiIds: [],
        linkedKpis: [],
        goalKpiType: "direct",
      };
      onUpdateGoal({ ...goal, goalKpis: [...goalKpis, newKpi] });
    }
    setEditingPctId(null);
    setPctForm({
      label: "",
      target: "60",
    });
  };

  const deleteKpi = (id: string) => {
    const label = goalKpis.find((gk) => gk.id === id)?.label ?? "未知 KPI";
    if (!window.confirm(`確定要刪除 KPI「${label}」？`)) return;
    onUpdateGoal({ ...goal, goalKpis: goalKpis.filter((gk) => gk.id !== id) });
  };

  const toggleHeadline = (id: string) => {
    onUpdateGoal({
      ...goal,
      goalKpis: goalKpis.map((gk) =>
        gk.id === id ? { ...gk, isHeadline: !gk.isHeadline } : gk,
      ),
    });
  };

  const toggleLink = (goalKpiId: string, link: GoalKpiLink) => {
    const gk = goalKpis.find((g) => g.id === goalKpiId);
    if (!gk) return;
    const exists = gk.linkedKpis.some(
      (l) => l.activityId === link.activityId && l.kpiId === link.kpiId,
    );
    const updated = exists
      ? gk.linkedKpis.filter(
          (l) => !(l.activityId === link.activityId && l.kpiId === link.kpiId),
        )
      : [...gk.linkedKpis, link];
    onUpdateGoal({
      ...goal,
      goalKpis: goalKpis.map((g) =>
        g.id === goalKpiId ? { ...g, linkedKpis: updated } : g,
      ),
    });
  };
  const toggleThreshold = (goalKpiId: string, threshId: string) => {
    const gk = goalKpis.find((g) => g.id === goalKpiId);
    if (!gk) return;
    const current = gk.thresholdGoalKpiIds ?? [];
    const isRemoving = current.includes(threshId);
    const updated = isRemoving
      ? current.filter((id) => id !== threshId)
      : [...current, threshId];
    // ?????????????????????????activitySourceOverrides
    const cleanedOverrides = isRemoving
      ? Object.fromEntries(
          Object.entries(gk.activitySourceOverrides ?? {}).filter(
            ([, v]) => v !== threshId,
          ),
        )
      : (gk.activitySourceOverrides ?? {});
    onUpdateGoal({
      ...goal,
      goalKpis: goalKpis.map((g) =>
        g.id === goalKpiId
          ? {
              ...g,
              thresholdGoalKpiIds: updated,
              activitySourceOverrides: cleanedOverrides,
            }
          : g,
      ),
    });
  };

  const activityKpis = goalKpis.filter(
    (gk) => (gk.type ?? "value") === "pct_activity",
  );
  const otherKpis = goalKpis.filter(
    (gk) => (gk.type ?? "value") !== "pct_activity",
  );
  const headlineKpis = otherKpis.filter((gk) => gk.isHeadline);
  const detailKpis = otherKpis.filter((gk) => !gk.isHeadline);

  const renderGkCard = (gk: GoalKPI) => {
    const {
      actual,
      target,
      rate: kRate,
      isRateMode,
      metCount,
      totalCount,
      activities,
    } = computeGoalKpi(gk);
    const kColor =
      kRate === null
        ? "#6b7280"
        : kRate >= 100
          ? "#10b981"
          : kRate >= 70
            ? "#6366f1"
            : kRate >= 40
              ? "#f59e0b"
              : "#ef4444";
    const gkType = gk.type ?? "value";
    const isEditing =
      gkType === "pct_activity"
        ? editingPctId === gk.id
        : editingKpiId === gk.id;
    const isLinking = showLinkPicker === gk.id;
    const isLinkingThreshold = showThresholdPicker === gk.id;
    return (
      <div key={gk.id} className="g-kpi-card">
        {isEditing && gkType === "pct_activity" ? (
          <div className="g-kpi-form-row">
            <input
              className="g-kpi-input"
              placeholder="請輸入活動名稱"
              value={pctForm.label}
              onChange={(e) =>
                setPctForm({ ...pctForm, label: e.target.value })
              }
              autoFocus
            />
            <div className="g-kpi-target-wrap">
              <input
                className="g-kpi-input g-kpi-target"
                type="number"
                placeholder="目標達成率 %"
                value={pctForm.target}
                onChange={(e) =>
                  setPctForm({ ...pctForm, target: e.target.value })
                }
              />
              <span className="g-kpi-target-unit">%</span>
            </div>
            <button className="g-kpi-btn-save" onClick={savePct}>
              儲存
            </button>
            <button
              className="g-kpi-btn-cancel"
              onClick={() => setEditingPctId(null)}
            >
              取消
            </button>
          </div>
        ) : isEditing ? (
          <div className="g-kpi-form-row">
            <input
              className="g-kpi-input"
              placeholder="KPI 名稱"
              value={kpiForm.label}
              onChange={(e) =>
                setKpiForm({ ...kpiForm, label: e.target.value })
              }
            />
            <input
              className="g-kpi-input g-kpi-target"
              type="number"
              placeholder="目標值"
              value={kpiForm.target}
              onChange={(e) =>
                setKpiForm({ ...kpiForm, target: e.target.value })
              }
            />
            <input
              className="g-kpi-input g-kpi-unit"
              placeholder="單位"
              value={kpiForm.unit}
              onChange={(e) => setKpiForm({ ...kpiForm, unit: e.target.value })}
            />
            <select
              className="g-kpi-select"
              value={kpiForm.type}
              onChange={(e) =>
                setKpiForm({
                  ...kpiForm,
                  type: e.target.value as "value" | "pct_activity" | "progress",
                })
              }
            >
              <option value="value">數值</option>
              <option value="progress">進度</option>
            </select>
            {kpiForm.type === "value" && (
              <select
                className="g-kpi-select"
                value={kpiForm.aggregation}
                onChange={(e) =>
                  setKpiForm({
                    ...kpiForm,
                    aggregation: e.target.value as "SUM" | "AVERAGE",
                  })
                }
              >
                <option value="SUM">加總</option>
                <option value="AVERAGE">平均</option>
              </select>
            )}
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={kpiForm.isHeadline}
                onChange={(e) =>
                  setKpiForm({ ...kpiForm, isHeadline: e.target.checked })
                }
              />
              主要 KPI
            </label>
            <button className="g-kpi-btn-save" onClick={saveKpi}>
              儲存
            </button>
            <button
              className="g-kpi-btn-cancel"
              onClick={() => setEditingKpiId(null)}
            >
              取消
            </button>
          </div>
        ) : (
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
                  ? `🔗 ${(gk.thresholdGoalKpiIds ?? []).length} 個門檻 GoalKPI`
                  : `🔗 ${gk.linkedKpis.length} 個連結`}
              </span>
            </div>
            <div className="g-kpi-card-right">
              <span className="g-kpi-value">
                <span className="g-kpi-val-label">實際</span>
                {actual !== null ? actual.toLocaleString() : "--"}
                {isRateMode ? "%" : actual !== null ? ` ${gk.unit}` : ""}{" "}
                {(gk.type ?? "value") === "pct_activity" &&
                  metCount !== null && (
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      {metCount}/{totalCount}{" "}
                    </span>
                  )}{" "}
                <span className="g-kpi-val-sep">/</span>
                <span className="g-kpi-val-label">目標</span>
                {target !== null ? target.toLocaleString() : "--"}
                {isRateMode ? "%" : ` ${gk.unit}`}
              </span>
              {gkType !== "pct_activity" && (
                <span className="g-kpi-rate" style={{ color: kColor }}>
                  {kRate !== null ? `${kRate}%` : "--"}
                </span>
              )}
            </div>
            <div className="g-kpi-card-actions">
              {!isReadOnly &&
                (gkType === "pct_activity" ? (
                  <button
                    className="g-kpi-btn-link"
                    onClick={() => {
                      setShowThresholdPicker(isLinkingThreshold ? null : gk.id);
                      setShowLinkPicker(null);
                    }}
                  >
                    🔗 設定門檻
                  </button>
                ) : (
                  <button
                    className="g-kpi-btn-link"
                    onClick={() => {
                      setShowLinkPicker(isLinking ? null : gk.id);
                      setLinkPickerSearch("");
                    }}
                  >
                    🔗 連結
                  </button>
                ))}
              {!isReadOnly && gkType !== "pct_activity" && (
                <button
                  className="g-kpi-btn-headline"
                  onClick={() => toggleHeadline(gk.id)}
                  title={gk.isHeadline ? "取消設為主要 KPI" : "設為主要 KPI"}
                >
                  {gk.isHeadline ? "⭐" : "--"}
                </button>
              )}
              {!isReadOnly && (
                <button
                  className="g-kpi-btn-edit"
                  onClick={() => {
                    if (gkType === "pct_activity") {
                      setEditingPctId(gk.id);
                      setPctForm({
                        label: gk.label,
                        target:
                          gk.target !== null && gk.target !== undefined
                            ? String(gk.target)
                            : "60",
                      });
                    } else {
                      setEditingKpiId(gk.id);
                      setKpiForm({
                        label: gk.label,
                        unit: gk.unit,
                        target:
                          gk.target !== null && gk.target !== undefined
                            ? String(gk.target)
                            : "",
                        aggregation: gk.aggregation,
                        type: gk.type ?? "value",
                        isHeadline: gk.isHeadline ?? false,
                        thresholdGoalKpiIds: gk.thresholdGoalKpiIds ?? [],
                      });
                    }
                  }}
                >
                  編輯{" "}
                </button>
              )}
              {!isReadOnly && (
                <button
                  className="g-kpi-btn-del"
                  onClick={() => deleteKpi(gk.id)}
                >
                  刪除
                </button>
              )}
            </div>
          </div>
        )}
        {!isEditing && kRate !== null && (
          <div className="g-kpi-bar-wrap">
            <div className="g-kpi-bar">
              <div
                style={{
                  width: `${Math.min(kRate, 100)}%`,
                  height: "100%",
                  background: kColor,
                  borderRadius: "4px",
                  transition: "width 0.6s ease",
                }}
              />
            </div>
          </div>
        )}
        {/* ?????????pct_activity ?????*/}
        {isLinkingThreshold &&
          (() => {
            const selectedIds = gk.thresholdGoalKpiIds ?? [];
            const overrides = gk.activitySourceOverrides ?? {};
            const availableGks = goalKpis.filter(
              (g) => g.id !== gk.id && (g.type ?? "value") !== "pct_activity",
            );

            // 以 activityId 為 key，判斷同一個活動是否被多個 threshGk 引用
            const measureCoverage = new Map<
              string,
              {
                threshGkId: string;
                threshGkLabel: string;
                measureRawText: string;
              }[]
            >();
            for (const tid of selectedIds) {
              const tGk = goalKpis.find((g) => g.id === tid);
              if (!tGk) continue;
              // 同一 activityId 在同一 threshGk 只記一次
              const seenMeasures = new Set<string>();
              for (const link of tGk.linkedKpis) {
                if (seenMeasures.has(link.activityId)) continue;
                seenMeasures.add(link.activityId);
                if (!measureCoverage.has(link.activityId))
                  measureCoverage.set(link.activityId, []);
                // 從 deptActivities 取 rawText
                const act = deptActivities.find(
                  (a) => a.id === link.activityId,
                );
                measureCoverage.get(link.activityId)?.push({
                  threshGkId: tid,
                  threshGkLabel: tGk.label,
                  measureRawText: act?.rawText ?? "未知度量指標",
                });
              }
            }
            const conflictedMeasures = Array.from(measureCoverage.entries())
              .filter(([, srcs]) => srcs.length > 1)
              .map(([measureId, srcs]) => ({ measureId, srcs }));

            const setOverride = (measureId: string, threshGkId: string) => {
              onUpdateGoal({
                ...goal,
                goalKpis: goalKpis.map((g) =>
                  g.id === gk.id
                    ? {
                        ...g,
                        activitySourceOverrides: {
                          ...overrides,
                          [measureId]: threshGkId,
                        },
                      }
                    : g,
                ),
              });
            };

            return (
              <div className="g-kpi-link-picker">
                <div className="g-kpi-link-picker-title">選取門檻 GoalKPI </div>
                <div className="g-kpi-link-hint">
                  勾選哪些 GoalKPI 作為活動達標率的門檻來源{" "}
                </div>
                {availableGks.length === 0 ? (
                  <div className="g-kpi-link-empty">
                    目前沒有可選的 GoalKPI，請先建立已連結 M KPI 的 GoalKPI{" "}
                  </div>
                ) : (
                  availableGks.map((g) => {
                    const checked = selectedIds.includes(g.id);
                    return (
                      <label
                        key={g.id}
                        className={`g-kpi-link-item${checked ? " linked" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleThreshold(gk.id, g.id)}
                        />
                        <span className="g-kpi-link-k">{g.label}</span>
                        <span className="g-kpi-link-val">
                          目標{" "}
                          {g.target !== null && g.target !== undefined
                            ? g.target
                            : "--"}
                          {g.unit}
                          {" / "}
                          {g.linkedKpis.length} 個已連結{" "}
                        </span>
                      </label>
                    );
                  })
                )}
                {conflictedMeasures.length > 0 && (
                  <div className="g-pct-conflict-section">
                    <div className="g-pct-conflict-title">
                      ⚠️ 衝突 {conflictedMeasures.length} 個度量指標同時被多個
                      GoalKPI 引用，請選擇要使用的來源{" "}
                    </div>
                    {conflictedMeasures.map(({ measureId, srcs }) => {
                      const chosenId =
                        overrides[measureId] &&
                        srcs.some((s) => s.threshGkId === overrides[measureId])
                          ? overrides[measureId]
                          : srcs[0].threshGkId;
                      return (
                        <div key={measureId} className="g-pct-conflict-measure">
                          <div className="g-pct-conflict-measure-name">
                            度量：{srcs[0].measureRawText}
                          </div>
                          <div className="g-pct-conflict-reason">
                            被多個來源引用：{" "}
                            {srcs
                              .map((s) => `「${s.threshGkLabel}」`)
                              .join("、")}
                          </div>
                          <div className="g-pct-conflict-radios">
                            {srcs.map((src) => {
                              const srcGk = goalKpis.find(
                                (g) => g.id === src.threshGkId,
                              );
                              return (
                                <label
                                  key={src.threshGkId}
                                  className={`g-pct-conflict-radio${chosenId === src.threshGkId ? " chosen" : ""}`}
                                >
                                  <input
                                    type="radio"
                                    name={`conflict-${gk.id}-${measureId}`}
                                    checked={chosenId === src.threshGkId}
                                    onChange={() =>
                                      setOverride(measureId, src.threshGkId)
                                    }
                                  />
                                  <span className="g-pct-conflict-radio-label">
                                    {src.threshGkLabel}
                                  </span>
                                  <span className="g-pct-conflict-radio-hint">
                                    目標 {srcGk?.target ?? "--"}
                                    {srcGk?.unit ?? "%"}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
        {/* M KPI ?????????value / progress ?????*/}
        {isLinking && (
          <div className="g-kpi-link-picker">
            <div className="g-kpi-link-picker-title">選擇連結的 M KPI</div>
            <input
              className="g-kpi-link-search"
              placeholder="搜尋 KPI 或度量指標"
              value={linkPickerSearch}
              onChange={(e) => setLinkPickerSearch(e.target.value)}
              autoFocus
            />
            {(() => {
              const q = linkPickerSearch.trim().toLowerCase();
              const rows = deptActivities
                .flatMap((a) => a.kpis.map((k) => ({ a, k })))
                .filter(({ k }) => {
                  const mKpiType = k.kpiType ?? "value";
                  return gkType === "progress"
                    ? mKpiType === "progress"
                    : mKpiType !== "progress";
                })
                .filter(
                  ({ a, k }) =>
                    !q ||
                    a.rawText.toLowerCase().includes(q) ||
                    k.label.toLowerCase().includes(q),
                );
              if (rows.length === 0)
                return (
                  <div className="g-kpi-link-empty">
                    {q
                      ? "找不到符合的結果"
                      : gkType === "progress"
                        ? "沒有可連結的進度型 KPI 度量指標"
                        : "沒有可連結的數值型 M KPI 度量指標"}
                  </div>
                );
              return rows.map(({ a, k }) => {
                const link: GoalKpiLink = {
                  activityId: a.id,
                  kpiId: k.id,
                };
                const linked = gk.linkedKpis.some(
                  (l) => l.activityId === a.id && l.kpiId === k.id,
                );
                return (
                  <label
                    key={`${a.id}-${k.id}`}
                    className={`g-kpi-link-item${linked ? " linked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={linked}
                      onChange={() => toggleLink(gk.id, link)}
                    />
                    <span className="g-kpi-link-m">
                      {a.rawText.substring(0, 20) || ""}
                    </span>
                    <span className="g-kpi-link-k">{k.label}</span>
                    <span className="g-kpi-link-val">
                      實際{" "}
                      {k.actual !== null && k.actual !== undefined
                        ? k.actual.toLocaleString()
                        : "--"}
                      {" / "}
                      {k.target !== null && k.target !== undefined
                        ? k.target.toLocaleString()
                        : "--"}
                    </span>
                  </label>
                );
              });
            })()}
          </div>
        )}
        {/* ???????????ct_activity ??????????????? */}
        {gkType === "pct_activity" && (
          <div className="g-kpi-activity-breakdown">
            {(gk.thresholdGoalKpiIds ?? []).length === 0 ? (
              <div className="g-kpi-activity-empty">
                尚未設定任何門檻 GoalKPI，請點擊上方「🔗 設定門檻」按鈕
              </div>
            ) : activities.length === 0 ? (
              <div className="g-kpi-activity-empty">
                所選的 GoalKPI 尚未連結任何 M KPI，請先為 GoalKPI 新增連結{" "}
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
                  {showActivityBreakdown === gk.id ? "▲" : "▶"} 達標{" "}
                  {activities.filter((a) => !a.met).length} 未達標
                </button>
                {showActivityBreakdown === gk.id && (
                  <div className="g-kpi-activity-list">
                    {activities
                      .filter((a) => a.met)
                      .map((a) => (
                        <div
                          key={a.measureId}
                          className="g-kpi-activity-row met"
                        >
                          <span className="g-kpi-activity-icon">✅</span>
                          <span className="g-kpi-activity-text">
                            {(a.measureRawText || "").substring(0, 28)}
                          </span>
                          {a.isConflict && (
                            <span className="g-pct-src-badge">
                              {a.chosenSrcLabel}{" "}
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
                    {activities
                      .filter((a) => !a.met)
                      .map((a) => (
                        <div
                          key={a.measureId}
                          className="g-kpi-activity-row unmet"
                        >
                          <span className="g-kpi-activity-icon">❌</span>
                          <span className="g-kpi-activity-text">
                            {(a.measureRawText || "").substring(0, 28)}
                          </span>
                          {a.isConflict && (
                            <span className="g-pct-src-badge">
                              {a.chosenSrcLabel}{" "}
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
      <div
        className="goal-header"
        style={{ height: topH, overflowY: "auto", flexShrink: 0 }}
      >
        <div className="goal-header-top">
          <span className="goal-label-badge">{goal.label}</span>
          {editingGoalTitle ? (
            <input
              className="goal-title-input"
              autoFocus
              value={titleText}
              style={{
                flex: 1,
                fontSize: 22,
                fontWeight: 800,
                padding: 4,
                background: "rgba(99,102,241,.1)",
                border: "none",
                borderRadius: 6,
                color: "var(--text)",
                outline: "none",
              }}
              onChange={(e) => setTitleText(e.target.value)}
              onBlur={() => {
                if (titleText.trim() !== goal.title)
                  onUpdateGoal({ ...goal, title: titleText.trim() });
                setEditingGoalTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (titleText.trim() !== goal.title)
                    onUpdateGoal({ ...goal, title: titleText.trim() });
                  setEditingGoalTitle(false);
                }
                if (e.key === "Escape") setEditingGoalTitle(false);
              }}
            />
          ) : (
            <h1
              className="goal-header-title"
              onDoubleClick={() => {
                if (isReadOnly) return;
                setTitleText(goal.title);
                setEditingGoalTitle(true);
              }}
              title="雙擊可編輯目標標題"
            >
              {goal.title || (
                <span style={{ color: "#6b7280", fontStyle: "italic" }}>
                  （尚未輸入標題）{" "}
                </span>
              )}
            </h1>
          )}
          {!isReadOnly && (
            <button
              className="detail-del-btn"
              onClick={() => onDeleteGoal(goal.id)}
              title="刪除此目標"
              style={{ marginLeft: "auto" }}
            >
              🗑 刪除
            </button>
          )}
        </div>

        {/* ?????????????????pct_activity?????? KPI ????????*/}
        <div className="g-pct-panel">
          <div className="g-pct-panel-header">
            <span className="g-pct-panel-title">活動達標率</span>
          </div>
          <div className="g-pct-panel-cards">
            {activityKpis.length === 0 && editingPctId !== "new" && (
              <div className="g-kpi-empty">
                尚未建立活動達標率 KPI，點擊下方按鈕新增{" "}
              </div>
            )}
            {activityKpis.map(renderGkCard)}
            {!isReadOnly && editingPctId !== "new" && (
              <button
                className="g-kpi-toggle g-pct-add-btn"
                onClick={() => {
                  setEditingPctId("new");
                  setPctForm({ label: "", target: "60" });
                }}
              >
                ＋ 新增活動達標率 KPI{" "}
              </button>
            )}
            {editingPctId === "new" && (
              <div className="g-pct-new-form">
                <div className="g-kpi-form-row">
                  <input
                    className="g-kpi-input"
                    placeholder="請輸入活動達標率 KPI 名稱"
                    value={pctForm.label}
                    onChange={(e) =>
                      setPctForm({ ...pctForm, label: e.target.value })
                    }
                    autoFocus
                  />
                  <div className="g-kpi-target-wrap">
                    <input
                      className="g-kpi-input g-kpi-target"
                      type="number"
                      placeholder="目標 %"
                      value={pctForm.target}
                      onChange={(e) =>
                        setPctForm({ ...pctForm, target: e.target.value })
                      }
                    />
                    <span className="g-kpi-target-unit">%</span>
                  </div>
                  <button className="g-kpi-btn-save" onClick={savePct}>
                    儲存
                  </button>
                  <button
                    className="g-kpi-btn-cancel"
                    onClick={() => setEditingPctId(null)}
                  >
                    取消
                  </button>
                </div>
                <div className="g-pct-form-hint">
                  此 KPI 根據設定的 GoalKPI 門檻來計算活動達標率，M KPI 度量指標
                  需達到目標 %，活動 % 才算達標{" "}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* G KPI ??? */}
        <div className="g-kpi-panel">
          <div className="g-kpi-panel-header">
            <span className="g-kpi-panel-title">目標 KPI 清單</span>
            <button
              className="g-kpi-toggle"
              onClick={() => setShowKpiPanel((v) => !v)}
            >
              {showKpiPanel ? "▲ 收起" : "▽ 展開"}
            </button>
          </div>

          {headlineKpis.length > 0 && (
            <div
              className={`g-kpi-headline-area${showKpiPanel ? "" : " g-kpi-headline-area--collapsed"}`}
            >
              <span className="g-kpi-headline-label">主要指標</span>
              {headlineKpis.map(renderGkCard)}
            </div>
          )}

          {showKpiPanel && (
            <div className="g-kpi-panel-body">
              {detailKpis.length === 0 && (
                <div className="g-kpi-empty">
                  {otherKpis.length === 0
                    ? "找不到符合的進度型 KPI 度量指標"
                    : "尚未設定 KPI，點擊「＋新增 KPI」按鈕新增"}
                </div>
              )}
              {detailKpis.map(renderGkCard)}
              {editingKpiId === "new" ? (
                <div className="g-kpi-form-row">
                  <input
                    className="g-kpi-input"
                    placeholder="KPI 名稱"
                    value={kpiForm.label}
                    onChange={(e) =>
                      setKpiForm({ ...kpiForm, label: e.target.value })
                    }
                    autoFocus
                  />
                  <input
                    className="g-kpi-input g-kpi-target"
                    type="number"
                    placeholder="目標值"
                    value={kpiForm.target}
                    onChange={(e) =>
                      setKpiForm({ ...kpiForm, target: e.target.value })
                    }
                  />
                  <input
                    className="g-kpi-input g-kpi-unit"
                    placeholder="單位"
                    value={kpiForm.unit}
                    onChange={(e) =>
                      setKpiForm({ ...kpiForm, unit: e.target.value })
                    }
                  />
                  <select
                    className="g-kpi-select"
                    value={kpiForm.type}
                    onChange={(e) =>
                      setKpiForm({
                        ...kpiForm,
                        type: e.target.value as
                          | "value"
                          | "pct_activity"
                          | "progress",
                      })
                    }
                  >
                    <option value="value">數值</option>
                    <option value="progress">進度</option>
                  </select>
                  {kpiForm.type === "value" && (
                    <select
                      className="g-kpi-select"
                      value={kpiForm.aggregation}
                      onChange={(e) =>
                        setKpiForm({
                          ...kpiForm,
                          aggregation: e.target.value as "SUM" | "AVERAGE",
                        })
                      }
                    >
                      <option value="SUM">加總</option>
                      <option value="AVERAGE">平均</option>
                    </select>
                  )}
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={kpiForm.isHeadline}
                      onChange={(e) =>
                        setKpiForm({ ...kpiForm, isHeadline: e.target.checked })
                      }
                    />
                    主要 KPI
                  </label>
                  <button className="g-kpi-btn-save" onClick={saveKpi}>
                    儲存
                  </button>
                  <button
                    className="g-kpi-btn-cancel"
                    onClick={() => setEditingKpiId(null)}
                  >
                    取消
                  </button>
                </div>
              ) : (
                !isReadOnly && (
                  <button
                    className="g-kpi-btn-add"
                    onClick={() => {
                      setEditingKpiId("new");
                      setKpiForm({
                        label: "",
                        unit: "%",
                        target: "",
                        aggregation: "SUM",
                        type: "value",
                        isHeadline: false,
                        thresholdGoalKpiIds: [],
                      });
                    }}
                  >
                    ＋ 新增 KPI
                  </button>
                )
              )}
            </div>
          )}
        </div>

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
          {!isReadOnly && (
            <button className="sl-add-strategy" onClick={onAddStrategy}>
              ＋ 新增策略{" "}
            </button>
          )}
        </div>
      </div>

      <div
        className="list-vsplitter"
        onMouseDown={(e) => {
          e.preventDefault();
          dragState.current = { startY: e.clientY, startH: topH };
        }}
      />

      <div className="strategy-rows">
        {strategies.length === 0 && (
          <div className="empty-state small">
            <p>目前此目標下沒有任何策略，請點擊「新增策略」按鈕開始。</p>
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
