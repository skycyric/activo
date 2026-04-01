import { useState, useRef, useEffect } from "react";
import type {
  Goal,
  GoalKPI,
  GoalKpiLink,
  Strategy,
  Team,
} from "../schemas/ogsm";
import { genId } from "../utils/csvParser";
import { countStrategyWarnings } from "../utils/planWarnings";

interface Props {
  goal: Goal | null;
  strategies: Strategy[];
  selectedStrategyId: string | null;
  onSelectStrategy: (id: string) => void;
  onAddStrategy: () => void;
  onUpdateGoal: (g: Goal) => void;
  onDeleteGoal: (id: string) => void;
  filterOwner: string;
  onFilterOwner: (v: string) => void;
  teams: Team[];
  warnDaysBefore: number;
}

function StrategyRow({
  s,
  index,
  selected,
  onClick,
  warnDaysBefore,
}: {
  s: Strategy;
  index: number;
  selected: boolean;
  onClick: () => void;
  warnDaysBefore: number;
}) {
  // Measures-based stats: count measures and count measures considered as "達標"
  const measuresTotal = s.measures.length;
  const measuresAchieved = s.measures.filter(
    (m) => m.status === "completed",
  ).length;
  const progressRate =
    measuresTotal > 0
      ? Math.round((measuresAchieved / measuresTotal) * 100)
      : 0;
  const effectiveRate = s.manualRate ?? progressRate;
  const barColor =
    effectiveRate >= 100
      ? "#10b981"
      : effectiveRate >= 70
        ? "#6366f1"
        : effectiveRate >= 40
          ? "#f59e0b"
          : effectiveRate > 0
            ? "#ef4444"
            : "#374151";
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
        <span className="strategy-row-dot" style={{ background: barColor }} />
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
              <span className="meta-tag">📊 {kpiCount} KPI</span>
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
            {hasDays && <span className="meta-tag">🕐 {sDays} 人/天</span>}
            {warnCounts.overdue > 0 && (
              <span className="meta-tag meta-warn-overdue">
                🔴 {warnCounts.overdue}
              </span>
            )}
            {warnCounts.warning > 0 && (
              <span className="meta-tag meta-warn-near">
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
          <div className="empty-icon">🎯</div>
          <h2>選擇左側的目標（G）</h2>
          <p>點選 G1、G2 或 G3 查看策略列表</p>
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
  const computeGoalKpi = (gk: GoalKPI) => {
    const gkType = gk.type ?? "value";

    // ── 整體達標狀況：以「活動（Measure）」為計算單位 ──────────────────────────
    // 流程：
    //   1. 遍歷所選來源 GoalKPI → 收集每個 Measure 被哪些來源覆蓋
    //   2. 衝突（同一 Measure 被多個來源覆蓋）→ 查 activitySourceOverrides 決定用哪個
    //      若未設定 override → 預設用第一個覆蓋它的來源（先選先得）
    //   3. 判斷達標：該 Measure 底下、被選定來源連結的 KPI 達成率 >= 來源 GoalKPI 的 target
    if (gkType === "pct_activity") {
      const overrides = gk.activitySourceOverrides ?? {};
      // measureMap: measureId → { measureId, measureRawText, sources: { threshGkId, threshGk, kpiIds[] }[] }
      const measureMap = new Map<
        string,
        {
          measureId: string;
          measureRawText: string;
          sources: {
            threshGkId: string;
            threshGkLabel: string;
            threshTarget: number;
            kpiIds: string[];
          }[];
        }
      >();
      for (const threshId of gk.thresholdGoalKpiIds ?? []) {
        const threshGk = goalKpis.find((g) => g.id === threshId);
        if (
          !threshGk ||
          threshGk.target === null ||
          threshGk.target === undefined
        )
          continue;
        for (const link of threshGk.linkedKpis) {
          if (!measureMap.has(link.measureId)) {
            const s = (goal.strategies ?? []).find(
              (s) => s.id === link.strategyId,
            );
            const m = s?.measures.find((m) => m.id === link.measureId);
            measureMap.set(link.measureId, {
              measureId: link.measureId,
              measureRawText: m?.rawText ?? "（未知活動）",
              sources: [],
            });
          }
          const entry = measureMap.get(link.measureId)!;
          const existing = entry.sources.find(
            (src) => src.threshGkId === threshId,
          );
          if (existing) {
            existing.kpiIds.push(link.kpiId);
          } else {
            entry.sources.push({
              threshGkId: threshId,
              threshGkLabel: threshGk.label,
              threshTarget: threshGk.target,
              kpiIds: [link.kpiId],
            });
          }
        }
      }

      const activities = Array.from(measureMap.values()).map((entry) => {
        // 決定用哪個來源判斷：優先用 override，否則用第一個
        const chosenSrcId =
          overrides[entry.measureId] &&
          entry.sources.some((s) => s.threshGkId === overrides[entry.measureId])
            ? overrides[entry.measureId]
            : entry.sources[0]?.threshGkId;
        const chosen = entry.sources.find((s) => s.threshGkId === chosenSrcId);
        const isConflict = entry.sources.length > 1;

        // 計算達成率：chosen 來源底下連結的 KPI，取平均 achievementRate
        let met = false;
        let displayRate: number | null = null;
        if (chosen) {
          // 找到所有 KPI
          const rates: number[] = [];
          for (const threshId of gk.thresholdGoalKpiIds ?? []) {
            const threshGk = goalKpis.find((g) => g.id === threshId);
            if (!threshGk) continue;
            for (const link of threshGk.linkedKpis) {
              if (link.measureId !== entry.measureId) continue;
              if (!chosen.kpiIds.includes(link.kpiId)) continue;
              const s = (goal.strategies ?? []).find(
                (s) => s.id === link.strategyId,
              );
              const m = s?.measures.find((m) => m.id === link.measureId);
              const k = m?.kpis.find((k) => k.id === link.kpiId);
              if (!k) continue;
              const r =
                k.achievementRate ??
                (k.target !== null && k.target !== undefined && k.target > 0
                  ? ((k.actual ?? 0) / k.target) * 100
                  : null);
              if (r !== null) rates.push(r);
            }
          }
          if (rates.length > 0) {
            displayRate = parseFloat(
              (rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1),
            );
            met = displayRate >= chosen.threshTarget;
          }
        }

        const conflictSourceNames = isConflict
          ? entry.sources.map((s) => s.threshGkLabel).join(" vs ")
          : null;

        return {
          measureId: entry.measureId,
          measureRawText: entry.measureRawText,
          chosenSrcId: chosenSrcId ?? null,
          chosenSrcLabel: chosen?.threshGkLabel ?? null,
          chosenTarget: chosen?.threshTarget ?? null,
          displayRate,
          met,
          isConflict,
          conflictSourceNames,
          allSources: entry.sources,
        };
      });

      const totalCount = activities.length;
      const metCount = activities.filter((a) => a.met).length;
      const actualPct =
        totalCount > 0 ? Math.round((metCount / totalCount) * 1000) / 10 : 0;
      const target = gk.target ?? 60;
      const rate = target > 0 ? Math.round((actualPct / target) * 100) : null;
      return {
        actual: totalCount > 0 ? actualPct : null,
        target,
        rate: totalCount > 0 ? rate : null,
        isRateMode: true,
        metCount,
        totalCount,
        activities,
      };
    }

    const values = gk.linkedKpis.flatMap((link: GoalKpiLink) => {
      const s = (goal.strategies ?? []).find((s) => s.id === link.strategyId);
      if (!s) return [];
      const m = s.measures.find((m) => m.id === link.measureId);
      if (!m) return [];
      const k = m.kpis.find((k) => k.id === link.kpiId);
      if (!k) return [];
      return [
        {
          actual: k.actual ?? 0,
          target: k.target ?? 0,
          achievementRate: k.achievementRate,
        },
      ];
    });
    const gTarget = gk.target ?? null;
    const emptyActivities: {
      measureId: string;
      measureRawText: string;
      chosenSrcId: string | null;
      chosenSrcLabel: string | null;
      chosenTarget: number | null;
      displayRate: number | null;
      met: boolean;
      isConflict: boolean;
      conflictSourceNames: string | null;
      allSources: {
        threshGkId: string;
        threshGkLabel: string;
        threshTarget: number;
        kpiIds: string[];
      }[];
    }[] = [];
    if (values.length === 0)
      return {
        actual: null,
        target: gTarget,
        rate: null,
        isRateMode: gkType !== "value" || gk.aggregation === "AVERAGE",
        metCount: null as number | null,
        totalCount: 0,
        activities: emptyActivities,
      };

    // ── 進度完成率：linked 進度型 KPI 的 actual 平均 ──────────────────────────
    if (gkType === "progress") {
      const sum = values.reduce((a, v) => a + v.actual, 0);
      const avgActual = Math.round((sum / values.length) * 10) / 10;
      const target = gTarget !== null ? gTarget : 100;
      const rate = target > 0 ? Math.round((avgActual / target) * 100) : null;
      return {
        actual: avgActual,
        target,
        rate,
        isRateMode: true,
        metCount: null as number | null,
        totalCount: values.length,
        activities: emptyActivities,
      };
    }

    // ── 量化值：原有 AVERAGE / SUM 邏輯 ───────────────────────────────────────
    if (gk.aggregation === "AVERAGE") {
      const rates = values
        .map((v) => v.achievementRate)
        .filter((r): r is number => r !== null && r !== undefined);
      if (rates.length === 0) {
        const avgActual =
          Math.round(
            (values.reduce((a, v) => a + v.actual, 0) / values.length) * 10,
          ) / 10;
        const avgTarget =
          Math.round(
            (values.reduce((a, v) => a + v.target, 0) / values.length) * 10,
          ) / 10;
        const fallbackTarget = gTarget !== null ? gTarget : avgTarget;
        const rate =
          fallbackTarget > 0
            ? Math.round((avgActual / fallbackTarget) * 100)
            : null;
        return {
          actual: avgActual,
          target: fallbackTarget,
          rate,
          isRateMode: false,
          metCount: null as number | null,
          totalCount: values.length,
          activities: emptyActivities,
        };
      }
      const avgRate =
        Math.round((rates.reduce((a, r) => a + r, 0) / rates.length) * 10) / 10;
      const target = gTarget !== null ? gTarget : 100;
      const rate = Math.round((avgRate / target) * 100);
      return {
        actual: avgRate,
        target,
        rate,
        isRateMode: true,
        metCount: null as number | null,
        totalCount: values.length,
        activities: emptyActivities,
      };
    } else {
      const sumActual = values.reduce((a, v) => a + v.actual, 0);
      const sumTarget = values.reduce((a, v) => a + v.target, 0);
      const target = gTarget !== null ? gTarget : sumTarget;
      const rate = target > 0 ? Math.round((sumActual / target) * 100) : null;
      return {
        actual: sumActual,
        target,
        rate,
        isRateMode: false,
        metCount: null as number | null,
        totalCount: values.length,
        activities: emptyActivities,
      };
    }
  };

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
    const label = goalKpis.find((gk) => gk.id === id)?.label ?? "此指標";
    if (!window.confirm(`確定要刪除 G 層級指標「${label}」嗎？`)) return;
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
      (l) =>
        l.strategyId === link.strategyId &&
        l.measureId === link.measureId &&
        l.kpiId === link.kpiId,
    );
    const updated = exists
      ? gk.linkedKpis.filter(
          (l) =>
            !(
              l.strategyId === link.strategyId &&
              l.measureId === link.measureId &&
              l.kpiId === link.kpiId
            ),
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
    // 取消勾選時，清除所有指向該來源的 activitySourceOverrides
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
              placeholder="整體達標狀況名稱"
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
                placeholder="達標門檻 %"
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
              placeholder="指標名稱"
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
              <option value="value">量化值</option>
              <option value="progress">進度完成率</option>
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
              主要
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
                  ? "整體達標狀況"
                  : gkType === "progress"
                    ? "進度完成率"
                    : gk.aggregation === "SUM"
                      ? "加總數值"
                      : "平均達成率"}{" "}
                {gkType === "pct_activity"
                  ? `· ${(gk.thresholdGoalKpiIds ?? []).length} 個來源 GoalKPI`
                  : `· ${gk.linkedKpis.length} 個來源`}
              </span>
            </div>
            <div className="g-kpi-card-right">
              <span className="g-kpi-value">
                <span className="g-kpi-val-label">實際</span>
                {actual !== null ? actual.toLocaleString() : "—"}
                {isRateMode ? "%" : actual !== null ? ` ${gk.unit}` : ""}{" "}
                {(gk.type ?? "value") === "pct_activity" &&
                  metCount !== null && (
                    <span style={{ fontSize: 11, color: "#6b7280" }}>
                      （{metCount}/{totalCount}）
                    </span>
                  )}{" "}
                <span className="g-kpi-val-sep">/</span>
                <span className="g-kpi-val-label">目標</span>
                {target !== null ? target.toLocaleString() : "—"}
                {isRateMode ? "%" : ` ${gk.unit}`}
              </span>
              {gkType !== "pct_activity" && (
                <span className="g-kpi-rate" style={{ color: kColor }}>
                  {kRate !== null ? `${kRate}%` : "—"}
                </span>
              )}
            </div>
            <div className="g-kpi-card-actions">
              {gkType === "pct_activity" ? (
                <button
                  className="g-kpi-btn-link"
                  onClick={() => {
                    setShowThresholdPicker(isLinkingThreshold ? null : gk.id);
                    setShowLinkPicker(null);
                  }}
                >
                  🎯 選取來源
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
              )}
              {gkType !== "pct_activity" && (
                <button
                  className="g-kpi-btn-headline"
                  onClick={() => toggleHeadline(gk.id)}
                  title={gk.isHeadline ? "取消主要指標" : "設為主要指標"}
                >
                  {gk.isHeadline ? "★" : "☆"}
                </button>
              )}
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
                ✎
              </button>
              <button
                className="g-kpi-btn-del"
                onClick={() => deleteKpi(gk.id)}
              >
                🗑
              </button>
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
        {/* 來源選擇器（pct_activity 專用） */}
        {isLinkingThreshold &&
          (() => {
            const selectedIds = gk.thresholdGoalKpiIds ?? [];
            const overrides = gk.activitySourceOverrides ?? {};
            const availableGks = goalKpis.filter(
              (g) => g.id !== gk.id && (g.type ?? "value") !== "pct_activity",
            );

            // 建立 measureId → 覆蓋它的來源列表（用於偵測衝突）
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
              // 取得唯一的 measureId 集合
              const seenMeasures = new Set<string>();
              for (const link of tGk.linkedKpis) {
                if (seenMeasures.has(link.measureId)) continue;
                seenMeasures.add(link.measureId);
                if (!measureCoverage.has(link.measureId))
                  measureCoverage.set(link.measureId, []);
                // 找 rawText
                const s = (goal.strategies ?? []).find(
                  (s) => s.id === link.strategyId,
                );
                const m = s?.measures.find((m) => m.id === link.measureId);
                measureCoverage.get(link.measureId)?.push({
                  threshGkId: tid,
                  threshGkLabel: tGk.label,
                  measureRawText: m?.rawText ?? "（未知活動）",
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
                <div className="g-kpi-link-picker-title">
                  選擇來源 GoalKPI（可複選）
                </div>
                <div className="g-kpi-link-hint">
                  選取後，系統統計其連結的活動中，有幾個達到該 GoalKPI 的目標值
                </div>
                {availableGks.length === 0 ? (
                  <div className="g-kpi-link-empty">
                    此目標下尚無可用的 GoalKPI（請先在「目標 KPI
                    看板」建立指標並連結 M KPI）
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
                            : "—"}
                          {g.unit}
                          {" · "}
                          {g.linkedKpis.length} 個活動
                        </span>
                      </label>
                    );
                  })
                )}
                {conflictedMeasures.length > 0 && (
                  <div className="g-pct-conflict-section">
                    <div className="g-pct-conflict-title">
                      ⚠️ 以下 {conflictedMeasures.length}{" "}
                      個活動同時被多個來源覆蓋，請選擇要用哪個來源的目標值來判斷達標：
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
                            📋 {srcs[0].measureRawText}
                          </div>
                          <div className="g-pct-conflict-reason">
                            此活動同時出現在：
                            {srcs
                              .map((s) => `「${s.threshGkLabel}」`)
                              .join(" 和 ")}
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
                                    目標 {srcGk?.target ?? "—"}
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
        {/* M KPI 連結選擇器（value / progress 專用） */}
        {isLinking && (
          <div className="g-kpi-link-picker">
            <div className="g-kpi-link-picker-title">選擇要納入的 M KPI</div>
            <input
              className="g-kpi-link-search"
              placeholder="搜尋策略、行動計畫或 KPI 名稱…"
              value={linkPickerSearch}
              onChange={(e) => setLinkPickerSearch(e.target.value)}
              autoFocus
            />
            {(() => {
              const q = linkPickerSearch.trim().toLowerCase();
              const rows = strategies
                .flatMap((s, si) =>
                  s.measures.flatMap((m) =>
                    m.kpis.map((k) => ({ s, si, m, k })),
                  ),
                )
                .filter(({ k }) => {
                  const mKpiType = k.kpiType ?? "value";
                  return gkType === "progress"
                    ? mKpiType === "progress"
                    : mKpiType !== "progress";
                })
                .filter(
                  ({ s, m, k }) =>
                    !q ||
                    s.title.toLowerCase().includes(q) ||
                    m.rawText.toLowerCase().includes(q) ||
                    k.label.toLowerCase().includes(q),
                );
              if (rows.length === 0)
                return (
                  <div className="g-kpi-link-empty">
                    {q
                      ? "無符合結果"
                      : gkType === "progress"
                        ? "此目標下尚無進度型 KPI 可連結"
                        : "此目標下尚無 M 的 KPI 可連結"}
                  </div>
                );
              return rows.map(({ s, si, m, k }) => {
                const link: GoalKpiLink = {
                  strategyId: s.id,
                  measureId: m.id,
                  kpiId: k.id,
                };
                const linked = gk.linkedKpis.some(
                  (l) =>
                    l.strategyId === s.id &&
                    l.measureId === m.id &&
                    l.kpiId === k.id,
                );
                return (
                  <label
                    key={`${s.id}-${m.id}-${k.id}`}
                    className={`g-kpi-link-item${linked ? " linked" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={linked}
                      onChange={() => toggleLink(gk.id, link)}
                    />
                    <span className="g-kpi-link-s">S{si + 1}</span>
                    <span className="g-kpi-link-m">
                      {m.rawText.substring(0, 20) || "（無名稱）"}
                    </span>
                    <span className="g-kpi-link-k">{k.label}</span>
                    <span className="g-kpi-link-val">
                      實
                      {k.actual !== null && k.actual !== undefined
                        ? k.actual.toLocaleString()
                        : "—"}
                      {" / 標"}
                      {k.target !== null && k.target !== undefined
                        ? k.target.toLocaleString()
                        : "—"}
                    </span>
                  </label>
                );
              });
            })()}
          </div>
        )}
        {/* 活動達標明細（pct_activity 專屬看板，永遠顯示） */}
        {gkType === "pct_activity" && (
          <div className="g-kpi-activity-breakdown">
            {(gk.thresholdGoalKpiIds ?? []).length === 0 ? (
              <div className="g-kpi-activity-empty">
                尚未選取來源，請點選上方 🎯 選取來源 勾選 GoalKPI
                作為活動分析來源
              </div>
            ) : activities.length === 0 ? (
              <div className="g-kpi-activity-empty">
                已選門檻，但門檻 GoalKPI 尚未連結任何 M KPI（請先在對應 GoalKPI
                設定 🔗 連結）
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
                  {showActivityBreakdown === gk.id ? "▲" : "▼"} 活動明細（
                  {activities.filter((a) => a.met).length} ✅ /{" "}
                  {activities.filter((a) => !a.met).length} ❌）
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
                            {(a.measureRawText || "（無名稱）").substring(
                              0,
                              28,
                            )}
                          </span>
                          {a.isConflict && (
                            <span className="g-pct-src-badge">
                              依「{a.chosenSrcLabel}」
                            </span>
                          )}
                          <span className="g-kpi-activity-detail">
                            {a.displayRate !== null
                              ? `${a.displayRate.toFixed(1)}%`
                              : "—"}
                            {" / 目標 "}
                            {a.chosenTarget ?? "—"}%
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
                            {(a.measureRawText || "（無名稱）").substring(
                              0,
                              28,
                            )}
                          </span>
                          {a.isConflict && (
                            <span className="g-pct-src-badge">
                              依「{a.chosenSrcLabel}」
                            </span>
                          )}
                          <span className="g-kpi-activity-detail">
                            {a.displayRate !== null
                              ? `${a.displayRate.toFixed(1)}%`
                              : "—"}
                            {" / 目標 "}
                            {a.chosenTarget ?? "—"}%
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
                setTitleText(goal.title);
                setEditingGoalTitle(true);
              }}
              title="雙擊編輯目標說明"
            >
              {goal.title || (
                <span style={{ color: "#6b7280", fontStyle: "italic" }}>
                  雙擊輸入目標說明…
                </span>
              )}
            </h1>
          )}
          <button
            className="detail-del-btn"
            onClick={() => onDeleteGoal(goal.id)}
            title="刪除目標"
            style={{ marginLeft: "auto" }}
          >
            🗑 刪除
          </button>
        </div>

        {/* 整體達標狀況專屬看板（pct_activity，顯示在 KPI 看板上方） */}
        <div className="g-pct-panel">
          <div className="g-pct-panel-header">
            <span className="g-pct-panel-title">🎯 整體達標狀況</span>
          </div>
          <div className="g-pct-panel-cards">
            {activityKpis.length === 0 && editingPctId !== "new" && (
              <div className="g-kpi-empty">
                尚未設定整體達標狀況，點選下方「＋ 新增」開始
              </div>
            )}
            {activityKpis.map(renderGkCard)}
            {editingPctId !== "new" && (
              <button
                className="g-kpi-toggle g-pct-add-btn"
                onClick={() => {
                  setEditingPctId("new");
                  setPctForm({ label: "", target: "60" });
                }}
              >
                ＋ 新增整體達標狀況
              </button>
            )}
            {editingPctId === "new" && (
              <div className="g-pct-new-form">
                <div className="g-kpi-form-row">
                  <input
                    className="g-kpi-input"
                    placeholder="名稱（如：整體活動達標狀況）"
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
                      placeholder="達標 %"
                      value={pctForm.target}
                      onChange={(e) =>
                        setPctForm({ ...pctForm, target: e.target.value })
                      }
                    />
                    <span className="g-kpi-target-unit">%</span>
                  </div>
                  <button className="g-kpi-btn-save" onClick={savePct}>
                    新增
                  </button>
                  <button
                    className="g-kpi-btn-cancel"
                    onClick={() => setEditingPctId(null)}
                  >
                    取消
                  </button>
                </div>
                <div className="g-pct-form-hint">
                  建立後，點卡片上的「🎯 選取來源」，從清單中勾選 GoalKPI
                  作為活動來源。系統會統計其中有多少個 M KPI「實際對比結果 ≥
                  自身目標」，并計算占所選活動的 %。達到此處設定的 %
                  門檻即為達標。
                </div>
              </div>
            )}
          </div>
        </div>

        {/* G KPI 看板 */}
        <div className="g-kpi-panel">
          <div className="g-kpi-panel-header">
            <span className="g-kpi-panel-title">📊 目標 KPI 看板</span>
            <button
              className="g-kpi-toggle"
              onClick={() => setShowKpiPanel((v) => !v)}
            >
              {showKpiPanel ? "收起 ▲" : "展開 ▼"}
            </button>
          </div>

          {headlineKpis.length > 0 && (
            <div
              className={`g-kpi-headline-area${showKpiPanel ? "" : " g-kpi-headline-area--collapsed"}`}
            >
              <span className="g-kpi-headline-label">⭐ 主要指標</span>
              {headlineKpis.map(renderGkCard)}
            </div>
          )}

          {showKpiPanel && (
            <div className="g-kpi-panel-body">
              {detailKpis.length === 0 && (
                <div className="g-kpi-empty">
                  {otherKpis.length === 0
                    ? "尚未設定 KPI，點選下方「＋ 新增指標」開始"
                    : "所有 KPI 已設為主要指標，可點選 ★ 解除"}
                </div>
              )}
              {detailKpis.map(renderGkCard)}
              {editingKpiId === "new" ? (
                <div className="g-kpi-form-row">
                  <input
                    className="g-kpi-input"
                    placeholder="指標名稱（如：整體綁定率）"
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
                    <option value="value">量化值</option>
                    <option value="progress">進度完成率</option>
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
                    主要
                  </label>
                  <button className="g-kpi-btn-save" onClick={saveKpi}>
                    新增
                  </button>
                  <button
                    className="g-kpi-btn-cancel"
                    onClick={() => setEditingKpiId(null)}
                  >
                    取消
                  </button>
                </div>
              ) : (
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
                  ＋ 新增指標
                </button>
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
              <option value="all">全部負責單位</option>
              {teams.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <button className="sl-add-strategy" onClick={onAddStrategy}>
            ＋ 新增策略（S）
          </button>
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
            <p>沒有符合篩選條件的策略，或尚未新增策略</p>
          </div>
        )}
        {strategies.map((s, i) => (
          <StrategyRow
            key={s.id}
            s={s}
            index={i}
            selected={s.id === selectedStrategyId}
            onClick={() => onSelectStrategy(s.id)}
            warnDaysBefore={warnDaysBefore}
          />
        ))}
      </div>
    </div>
  );
}
