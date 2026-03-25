import { useState } from "react";
import type { Goal, GoalKPI, GoalKpiLink, Strategy, Team } from "../types/ogsm";
import { genId } from "../utils/csvParser";

interface Props {
  goal: Goal | null;
  strategies: Strategy[];
  selectedStrategyId: string | null;
  onSelectStrategy: (id: string) => void;
  onAddStrategy: () => void;
  onUpdateGoal: (g: Goal) => void;
  onDeleteStrategy: (id: string) => void;
  filterOwner: string;
  onFilterOwner: (v: string) => void;
  teams: Team[];
}

function StrategyRow({
  s,
  index,
  selected,
  onClick,
  onDelete,
}: {
  s: Strategy;
  index: number;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  // Measures-based stats: count measures and count measures considered as "達標"
  const measuresTotal = s.measures.length;
  const measuresAchieved = s.measures.filter(
    (m) => m.status === "completed",
  ).length;
  const allItems = s.actionPlans.flatMap((p) => p.items);
  const totalItems = allItems.length;
  const doneItems = allItems.filter((i) => i.completed).length;
  const progressRate =
    totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
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
            {(s.owners ?? (s.owner ? [s.owner] : [])).map((name) => (
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
          </div>
        </div>
      </div>
      <div className="strategy-row-right">
        <button
          className="row-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="刪除策略"
        >
          🗑
        </button>
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
  onDeleteStrategy,
  filterOwner,
  onFilterOwner,
  teams,
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
  }>({ label: "", unit: "%", target: "", aggregation: "SUM" });
  const [showLinkPicker, setShowLinkPicker] = useState<string | null>(null); // goalKpiId
  const [linkPickerSearch, setLinkPickerSearch] = useState("");

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
  // AVERAGE mode: averages achievementRate of linked M KPIs (already in %)
  // SUM mode: sums raw actual values vs G-level target
  const computeGoalKpi = (gk: GoalKPI) => {
    const values = gk.linkedKpis.flatMap((link: GoalKpiLink) => {
      const s = strategies.find((s) => s.id === link.strategyId);
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
    if (values.length === 0)
      return {
        actual: null,
        target: gTarget,
        rate: null,
        isRateMode: gk.aggregation === "AVERAGE",
      };

    if (gk.aggregation === "AVERAGE") {
      // Use achievementRate directly and average across linked KPIs
      const rates = values
        .map((v) => v.achievementRate)
        .filter((r): r is number => r !== null && r !== undefined);
      if (rates.length === 0) {
        // Fallback: compute from raw values
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
        };
      }
      const avgRate =
        Math.round((rates.reduce((a, r) => a + r, 0) / rates.length) * 10) / 10;
      const target = gTarget !== null ? gTarget : 100;
      const rate = Math.round((avgRate / target) * 100);
      return { actual: avgRate, target, rate, isRateMode: true };
    } else {
      // SUM: aggregate raw actual vs G-level target
      const sumActual = values.reduce((a, v) => a + v.actual, 0);
      const sumTarget = values.reduce((a, v) => a + v.target, 0);
      const target = gTarget !== null ? gTarget : sumTarget;
      const rate = target > 0 ? Math.round((sumActual / target) * 100) : null;
      return { actual: sumActual, target, rate, isRateMode: false };
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
              target: isNaN(targetVal as number) ? null : targetVal,
              aggregation: kpiForm.aggregation,
            }
          : gk,
      );
      onUpdateGoal({ ...goal, goalKpis: updated });
    } else {
      const newKpi: GoalKPI = {
        id: genId(),
        label: kpiForm.label.trim(),
        unit: kpiForm.unit.trim(),
        target: isNaN(targetVal as number) ? null : targetVal,
        aggregation: kpiForm.aggregation,
        linkedKpis: [],
      };
      onUpdateGoal({ ...goal, goalKpis: [...goalKpis, newKpi] });
    }
    setEditingKpiId(null);
    setKpiForm({ label: "", unit: "%", target: "", aggregation: "SUM" });
  };

  const deleteKpi = (id: string) => {
    const label = goalKpis.find((gk) => gk.id === id)?.label ?? "此指標";
    if (!window.confirm(`確定要刪除 G 層級指標「${label}」嗎？`)) return;
    onUpdateGoal({ ...goal, goalKpis: goalKpis.filter((gk) => gk.id !== id) });
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
  return (
    <div className="strategy-list">
      <div className="goal-header">
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

          {showKpiPanel && (
            <div className="g-kpi-panel-body">
              {goalKpis.length === 0 && (
                <div className="g-kpi-empty">
                  尚未設定 KPI，點選下方「＋ 新增指標」開始
                </div>
              )}
              {goalKpis.map((gk) => {
                const {
                  actual,
                  target,
                  rate: kRate,
                  isRateMode,
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
                const isEditing = editingKpiId === gk.id;
                const isLinking = showLinkPicker === gk.id;
                return (
                  <div key={gk.id} className="g-kpi-card">
                    {isEditing ? (
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
                          onChange={(e) =>
                            setKpiForm({ ...kpiForm, unit: e.target.value })
                          }
                        />
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
                            {gk.aggregation === "SUM"
                              ? "加總數值"
                              : "平均達成率"}{" "}
                            · {gk.linkedKpis.length} 個來源
                          </span>
                        </div>
                        <div className="g-kpi-card-right">
                          <span className="g-kpi-value">
                            <span className="g-kpi-val-label">實際</span>
                            {actual !== null ? actual.toLocaleString() : "—"}
                            {isRateMode
                              ? "%"
                              : actual !== null
                                ? ` ${gk.unit}`
                                : ""}
                            <span className="g-kpi-val-sep">/</span>
                            <span className="g-kpi-val-label">目標</span>
                            {target !== null ? target.toLocaleString() : "—"}
                            {isRateMode ? "%" : ` ${gk.unit}`}
                          </span>
                          <span
                            className="g-kpi-rate"
                            style={{ color: kColor }}
                          >
                            {kRate !== null ? `${kRate}%` : "—"}
                          </span>
                        </div>
                        <div className="g-kpi-card-actions">
                          <button
                            className="g-kpi-btn-link"
                            onClick={() => {
                              setShowLinkPicker(isLinking ? null : gk.id);
                              setLinkPickerSearch("");
                            }}
                          >
                            🔗 連結
                          </button>
                          <button
                            className="g-kpi-btn-edit"
                            onClick={() => {
                              setEditingKpiId(gk.id);
                              setKpiForm({
                                label: gk.label,
                                unit: gk.unit,
                                target:
                                  gk.target !== null && gk.target !== undefined
                                    ? String(gk.target)
                                    : "",
                                aggregation: gk.aggregation,
                              });
                            }}
                          >
                            ✎
                          </button>
                          <button
                            className="g-kpi-btn-del"
                            onClick={() => deleteKpi(gk.id)}
                          >
                            ✕
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
                    {isLinking && (
                      <div className="g-kpi-link-picker">
                        <div className="g-kpi-link-picker-title">
                          選擇要納入的 M KPI
                        </div>
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
                  </div>
                );
              })}
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
          <button className="btn-add" onClick={onAddStrategy}>
            + 新增策略（S）
          </button>
        </div>
      </div>

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
            onDelete={() => onDeleteStrategy(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
