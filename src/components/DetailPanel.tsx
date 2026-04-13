import React, { useState, useEffect, useCallback, useRef } from "react";
import type {
  Strategy,
  Measure,
  Team,
  ActionPlan,
  PlanItem,
  DeptActivity,
} from "../schemas/ogsm";
import { genId } from "../utils/csvParser";
import { getPlanItemWarning } from "../utils/planWarnings";

interface Props {
  strategy: Strategy;
  onClose: () => void;
  onUpdate: (s: Strategy) => void;
  onDelete: () => void;
  teams: Team[];
  warnDaysBefore: number;
  onUpdateWarnDaysBefore: (n: number) => void;
  initialTab?: "measure" | "plans" | "notes";
  initialWarnFilter?: "overdue" | "warning" | null;
  initialMeasureId?: string;
  isReadOnly?: boolean;
  /**
   * dept.activities[] 中 ogsmLink.strategyId === strategy.id 的活動清單。
   * 用於顯示「計入 OGSM」toggle；未提供時 toggle 不顯示。
   */
  linkedDeptActivities?: DeptActivity[];
  /** 切換活動是否計入 OGSM 指標 */
  onToggleExcludeFromOgsm?: (
    activityId: string,
    exclude: boolean,
    strategyId: string,
  ) => void;
  /** 導覽到活動頁面（從 M tab 的「前往活動頁面」按鈕觸發） */
  onNavigateToActivityPage?: () => void;
  /** 開啟特定活動的 ActivityDetailPanel（從 M tab 的「編輯」按鈕觸發） */
  onOpenActivityDetail?: (activityId: string) => void;
}

function InlineEdit({
  value,
  onSave,
  className = "",
  placeholder = "點擊編輯…",
  multiline = false,
  disabled = false,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // 用 ref 旗標避免 Escape 後 onBlur 仍觸發 commit
  const cancelledRef = React.useRef(false);

  const commit = () => {
    if (cancelledRef.current) return;
    onSave(draft);
    setEditing(false);
  };

  const cancel = () => {
    cancelledRef.current = true;
    setDraft(value);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span
        className={`inline-edit-view ${className}`}
        onDoubleClick={() => {
          if (disabled) return;
          cancelledRef.current = false;
          setDraft(value);
          setEditing(true);
        }}
        title={disabled ? "唯讀" : "雙擊編輯"}
      >
        {value || (
          <span style={{ color: "#4b5563", fontStyle: "italic" }}>
            {placeholder.replace("點擊", "雙擊")}
          </span>
        )}
      </span>
    );
  }
  if (multiline) {
    return (
      <textarea
        className={`inline-edit-input ${className}`}
        value={draft}
        autoFocus
        rows={4}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
      />
    );
  }
  return (
    <input
      className={`inline-edit-input ${className}`}
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") cancel();
      }}
    />
  );
}

/**
 * Parse date string and return {month, day}
 */
function parseMonthDay(s: string) {
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { month: parseInt(iso[2]), day: parseInt(iso[3]) };
  // MM/DD
  const md = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (md) return { month: parseInt(md[1]), day: parseInt(md[2]) };
  return null;
}

/**
 * Check if a plan item's date range overlaps with a given quarter
 */
function doesItemOverlapQuarter(item: PlanItem, quarter: string): boolean {
  const endDate = item.plannedEndDate;
  if (!endDate) return false;
  const e = parseMonthDay(endDate);
  if (!e) return false;
  const qMonths: Record<string, [number, number]> = {
    Q1: [1, 3],
    Q2: [4, 6],
    Q3: [7, 9],
    Q4: [10, 12],
  };
  const [qStart, qEnd] = qMonths[quarter] ?? [1, 3];
  return e.month >= qStart && e.month <= qEnd;
}

function doesMeasureOverlapQuarter(
  measure: Measure,
  linkedItems: PlanItem[],
  quarter: string,
): boolean {
  const qMonths: Record<string, [number, number]> = {
    Q1: [1, 3],
    Q2: [4, 6],
    Q3: [7, 9],
    Q4: [10, 12],
  };
  const [qStart, qEnd] = qMonths[quarter] ?? [1, 3];

  const s = measure.startDate ? parseMonthDay(measure.startDate) : null;
  const e = measure.endDate ? parseMonthDay(measure.endDate) : null;
  if (s) {
    const endMonth = e ? e.month : s.month;
    return s.month <= qEnd && endMonth >= qStart;
  }

  // Backward-compatible fallback for old JSON where measure dates are missing.
  return linkedItems.some((item) => doesItemOverlapQuarter(item, quarter));
}

// ─── Detail Panel ──────────────────────────────────────────────────────────────

export default function DetailPanel({
  strategy,
  onClose,
  onUpdate,
  onDelete,
  teams,
  warnDaysBefore,
  onUpdateWarnDaysBefore,
  initialTab,
  initialWarnFilter,
  initialMeasureId,
  isReadOnly = false,
  linkedDeptActivities,
  onToggleExcludeFromOgsm,
  onNavigateToActivityPage,
  onOpenActivityDetail,
}: Props) {
  const [tab, setTab] = useState<"measure" | "plans" | "notes">(
    initialMeasureId ? "plans" : (initialTab ?? "measure"),
  );
  const [warnFilter, setWarnFilter] = useState<"overdue" | "warning" | null>(
    initialWarnFilter ?? null,
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterOwner, setFilterOwner] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [ownerDropOpen, setOwnerDropOpen] = useState(false);
  const ownerDropRef = useRef<HTMLDivElement>(null);
  const [planSectionCollapsed, setPlanSectionCollapsed] = useState<
    Record<string, boolean>
  >(() => {
    const map: Record<string, boolean> = {};
    strategy.measures.forEach((m) => {
      if (initialMeasureId) {
        // Only expand the target measure, collapse the rest
        map[m.id] = m.id !== initialMeasureId;
      } else {
        // If opened with a warnFilter, expand all sections so filtered items are visible
        map[m.id] = initialWarnFilter ? false : true;
      }
    });
    return map;
  });
  useEffect(() => {
    if (!ownerDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        ownerDropRef.current &&
        !ownerDropRef.current.contains(e.target as Node)
      )
        setOwnerDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ownerDropOpen]);

  const [warnDaysLocal, setWarnDaysLocal] = useState<string>(
    String(warnDaysBefore),
  );
  useEffect(() => {
    setWarnDaysLocal(String(warnDaysBefore));
  }, [warnDaysBefore]);

  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem("ogsm_panel_width");
    return saved ? parseInt(saved, 10) : 800;
  });

  useEffect(() => {
    try {
      localStorage.setItem("ogsm_panel_width", panelWidth.toString());
    } catch {
      // best-effort; ignore quota or privacy-mode errors
    }
  }, [panelWidth]);

  const dragCtrlRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      dragCtrlRef.current?.abort();
    },
    [],
  );
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragCtrlRef.current?.abort();
      const ctrl = new AbortController();
      dragCtrlRef.current = ctrl;
      const startX = e.clientX;
      const startWidth = panelWidth;
      document.addEventListener(
        "mousemove",
        (moveEvent: MouseEvent) => {
          // Panel is on right edge, deltaX < 0 means drag left -> width increases
          const newWidth = Math.max(
            400,
            Math.min(1200, startWidth - (moveEvent.clientX - startX)),
          );
          setPanelWidth(newWidth);
        },
        { signal: ctrl.signal },
      );
      document.addEventListener("mouseup", () => ctrl.abort(), {
        signal: ctrl.signal,
      });
    },
    [panelWidth],
  );

  // ─── Action Plan helpers ──────────────────────────────────────────────────────

  const addChecklistItemToMeasure = (msrId: string) => {
    const newItem: PlanItem = {
      id: genId("item"),
      description: "",
      owner: "",
      completed: false,
      linkedMeasureId: msrId,
    };
    const existingAp = strategy.actionPlans.find(
      (p) => p.quarter === selectedQuarter,
    );
    if (existingAp) {
      // Add item to the existing plan, preserving all other plans
      const newActionPlans = strategy.actionPlans.map((p) =>
        p.id === existingAp.id ? { ...p, items: [...p.items, newItem] } : p,
      );
      onUpdate({ ...strategy, actionPlans: newActionPlans });
    } else {
      const ap: ActionPlan = {
        id: genId("plan"),
        quarter: selectedQuarter,
        title: selectedQuarter + " 計畫",
        items: [newItem],
      };
      onUpdate({
        ...strategy,
        actionPlans: [...strategy.actionPlans, ap],
      });
    }
  };

  const updatePlanItem = (id: string, patch: Partial<PlanItem>) => {
    onUpdate({
      ...strategy,
      actionPlans: strategy.actionPlans.map((p) => ({
        ...p,
        items: p.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      })),
    });
  };

  const quarterFromDate = (dateStr: string): string | null => {
    const m = dateStr.match(/^(\d{4})-(\d{1,2})-\d{1,2}$/);
    if (!m) return null;
    const month = parseInt(m[2]);
    if (month <= 3) return "Q1";
    if (month <= 6) return "Q2";
    if (month <= 9) return "Q3";
    return "Q4";
  };

  const updatePlannedEndDate = (id: string, newDate: string) => {
    const currentAp = strategy.actionPlans.find((p) =>
      p.items.some((i) => i.id === id),
    );
    if (!currentAp) {
      updatePlanItem(id, { plannedEndDate: newDate });
      return;
    }
    const targetQ = newDate ? quarterFromDate(newDate) : null;
    if (!targetQ || targetQ === currentAp.quarter) {
      updatePlanItem(id, { plannedEndDate: newDate });
      return;
    }
    // Move item to the matching quarter's ActionPlan
    const item = currentAp.items.find((i) => i.id === id);
    if (!item) return;
    const updatedItem = { ...item, plannedEndDate: newDate };
    let newPlans = strategy.actionPlans.map((p) =>
      p.id === currentAp.id
        ? { ...p, items: p.items.filter((i) => i.id !== id) }
        : p,
    );
    const targetAp = newPlans.find((p) => p.quarter === targetQ);
    if (targetAp) {
      newPlans = newPlans.map((p) =>
        p.id === targetAp.id ? { ...p, items: [...p.items, updatedItem] } : p,
      );
    } else {
      newPlans = [
        ...newPlans,
        {
          id: genId("plan"),
          quarter: targetQ,
          title: targetQ + " 計畫",
          items: [updatedItem],
        },
      ];
    }
    onUpdate({ ...strategy, actionPlans: newPlans });
  };

  const deletePlanItem = (id: string, desc: string) => {
    if (!window.confirm(`確定要刪除「${desc || "此項目"}」嗎？`)) return;
    onUpdate({
      ...strategy,
      actionPlans: strategy.actionPlans.map((p) => ({
        ...p,
        items: p.items.filter((it) => it.id !== id),
      })),
    });
  };

  const updateMeasureDateRange = (
    measureId: string,
    patch: Partial<Pick<Measure, "startDate" | "endDate">>,
  ) => {
    onUpdate({
      ...strategy,
      measures: strategy.measures.map((ms) =>
        ms.id === measureId ? { ...ms, ...patch } : ms,
      ),
    });
  };

  const renderPlanItemRow = (
    item: PlanItem,
    extra?: React.ReactNode,
    readOnly: boolean = false,
  ) => {
    const warn = getPlanItemWarning(item, warnDaysBefore);
    let daysLeft: number | null = null;
    if (warn === "warning" && item.plannedEndDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const end = new Date(item.plannedEndDate);
      end.setHours(0, 0, 0, 0);
      daysLeft = Math.ceil((end.getTime() - today.getTime()) / 86400000);
    }
    const isActualLate =
      !!item.actualEndDate &&
      !!item.plannedEndDate &&
      item.actualEndDate > item.plannedEndDate;
    return (
      <tr
        key={item.id}
        className={`${item.completed ? "plan-row-done" : ""}${warn === "overdue" ? " plan-row-overdue" : warn === "warning" ? " plan-row-warning" : ""}${readOnly ? " plan-row-readonly" : ""}`}
      >
        <td className="plan-tbl-check">
          <input
            type="checkbox"
            disabled={readOnly}
            checked={item.completed}
            onChange={() =>
              !readOnly &&
              updatePlanItem(item.id, { completed: !item.completed })
            }
          />
        </td>
        <td className="plan-tbl-name">
          {warn === "overdue" && (
            <span className="plan-warn-badge plan-warn-overdue" title="已逾期">
              🔴
            </span>
          )}
          {warn === "warning" && (
            <span
              className="plan-warn-badge plan-warn-near"
              title={`距截止日 ${daysLeft} 天`}
            >
              ⚠️{daysLeft}d
            </span>
          )}
          {extra}
          <input
            className="plan-tbl-desc"
            disabled={readOnly}
            value={item.description}
            placeholder="新項目"
            onChange={(e) =>
              !readOnly &&
              updatePlanItem(item.id, { description: e.target.value })
            }
          />
        </td>
        <td>
          <input
            type="date"
            className="plan-tbl-date"
            disabled={readOnly}
            value={item.plannedEndDate ?? ""}
            title="預計完成"
            onChange={(e) =>
              !readOnly && updatePlannedEndDate(item.id, e.target.value)
            }
          />
        </td>
        <td>
          <input
            type="date"
            className={`plan-tbl-date plan-tbl-actual${isActualLate ? " plan-tbl-date--late" : ""}`}
            disabled={readOnly}
            value={item.actualEndDate ?? ""}
            title="實際完成"
            onChange={(e) =>
              !readOnly &&
              updatePlanItem(item.id, { actualEndDate: e.target.value })
            }
          />
        </td>
        <td>
          <input
            className="plan-tbl-notes"
            disabled={readOnly}
            value={item.notes ?? ""}
            placeholder="備註"
            onChange={(e) =>
              !readOnly && updatePlanItem(item.id, { notes: e.target.value })
            }
          />
        </td>
        <td className="plan-tbl-del">
          <button
            className="plan-item-del"
            disabled={readOnly}
            onClick={() =>
              !readOnly && deletePlanItem(item.id, item.description)
            }
          >
            🗑
          </button>
        </td>
      </tr>
    );
  };

  function planItemMatchesFilter(item: PlanItem): boolean {
    const q = searchQuery.trim().toLowerCase();
    const textOk = !q || item.description.toLowerCase().includes(q);
    if (!textOk) return false;
    if (warnFilter) {
      const w = getPlanItemWarning(item, warnDaysBefore);
      return w === warnFilter;
    }
    return true;
  }

  // Plan helpers (plans are managed via Measures and fixed quarters)

  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const preferred = strategy.measures[0]?.quarter;
  const [selectedQuarter, setSelectedQuarter] = useState<string>(
    preferred && quarters.includes(preferred) ? preferred : "Q1",
  );

  // Owner helpers
  const ownersList = strategy.owners;
  const setOwners = (names: string[]) =>
    onUpdate({ ...strategy, owners: names });
  const removeOwner = (name: string) =>
    setOwners(ownersList.filter((n) => n !== name));

  const allKpisCount = strategy.measures.reduce((n, m) => n + m.kpis.length, 0);
  // Plan items count
  const totalItems = strategy.actionPlans.flatMap((p) => p.items).length;
  const doneItems = strategy.actionPlans
    .flatMap((p) => p.items)
    .filter((i) => i.completed).length;
  const progressRate =
    totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
  const progressColor =
    progressRate >= 100
      ? "#10b981"
      : progressRate >= 70
        ? "#6366f1"
        : progressRate >= 40
          ? "#f59e0b"
          : progressRate > 0
            ? "#ef4444"
            : "#4b5563";

  // ─── Filter helpers ──────────────────────────────────────────────────────────
  const hasActiveFilter =
    searchQuery.trim() !== "" || filterOwner !== "all" || warnFilter !== null;

  // Collect unique owners from measures + plan items
  const measureOwners = Array.from(
    new Set(
      strategy.measures
        .map((m) => m.owner?.trim())
        .concat(
          strategy.actionPlans
            .flatMap((p) => p.items)
            .map((i) => i.owner?.trim()),
        )
        .filter(Boolean) as string[],
    ),
  ).sort();

  function measureMatchesFilter(m: Measure): boolean {
    const q = searchQuery.trim().toLowerCase();
    const ownerOk =
      filterOwner === "all" || (m.owner ?? "").includes(filterOwner);
    const textOk =
      !q ||
      (m.rawText ?? "").toLowerCase().includes(q) ||
      (m.owner ?? "").toLowerCase().includes(q);
    if (!ownerOk || !textOk) return false;
    // warnFilter：該分區必須有至少一個命中的 plan item，否則整區隱藏
    if (warnFilter) {
      const linkedItems = strategy.actionPlans
        .flatMap((p) => p.items)
        .filter((i) => i.linkedMeasureId === m.id);
      return linkedItems.some(
        (i) => getPlanItemWarning(i, warnDaysBefore) === warnFilter,
      );
    }
    return true;
  }

  const clearFilters = () => {
    setSearchQuery("");
    setFilterOwner("all");
  };

  return (
    <aside className="detail-panel" style={{ width: panelWidth }}>
      <div className="panel-resizer" onMouseDown={handleMouseDown} />
      {/* Header */}
      <div className="detail-header">
        <div className="detail-header-toprow">
          <InlineEdit
            value={strategy.title}
            onSave={(v) => onUpdate({ ...strategy, title: v })}
            className="detail-title-edit"
            placeholder="策略名稱"
            disabled={isReadOnly}
          />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 4,
              flexShrink: 0,
              alignItems: "flex-end",
            }}
          >
            <button className="detail-close" onClick={onClose}>
              ✕
            </button>
            {!isReadOnly && (
              <button
                className="detail-del-btn"
                onClick={onDelete}
                title="刪除策略"
              >
                🗑 刪除
              </button>
            )}
          </div>
        </div>

        <div className="detail-meta">
          {teams.length > 0 ? (
            <div className="owners-editor" ref={ownerDropRef}>
              {ownersList.map((name) => (
                <span key={name} className="owner-chip">
                  {name}
                  {!isReadOnly && (
                    <button
                      className="owner-chip-remove"
                      onClick={() => removeOwner(name)}
                      title="移除"
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
              {!isReadOnly &&
                teams.filter((t) => !ownersList.includes(t.name)).length >
                  0 && (
                  <div className="owner-add-wrap">
                    <button
                      className="owner-add-btn"
                      onClick={() => setOwnerDropOpen((v) => !v)}
                    >
                      ＋ 負責單位
                    </button>
                    {ownerDropOpen && (
                      <div className="owner-dropdown">
                        {teams
                          .filter((t) => !ownersList.includes(t.name))
                          .map((t) => (
                            <button
                              key={t.id}
                              className="owner-dropdown-item"
                              onClick={() => {
                                setOwners([...ownersList, t.name]);
                                setOwnerDropOpen(false);
                              }}
                            >
                              {t.name}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              {ownersList.length === 0 && (
                <span className="owner-placeholder">選擇負責單位…</span>
              )}
            </div>
          ) : (
            <InlineEdit
              value={strategy.owners[0] ?? ""}
              onSave={(v) => onUpdate({ ...strategy, owners: v ? [v] : [] })}
              className="owner-chip owner-edit"
              placeholder="負責單位"
              disabled={isReadOnly}
            />
          )}
        </div>

        {/* 進度指標 */}
        <div className="detail-dual-rate">
          <div className="dual-rate-item">
            <span className="dual-rate-num" style={{ color: progressColor }}>
              {totalItems > 0 ? `${progressRate}%` : "—"}
            </span>
            <div className="dual-rate-meta">
              <span className="dual-rate-badge progress-badge">📋 進度</span>
              <span className="dual-rate-sub">
                {doneItems}/{totalItems} 項
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="detail-filter-bar">
        <div className="detail-filter-row">
          <div className="detail-filter-search-wrap">
            <span className="detail-filter-icon">🔍</span>
            <input
              className="detail-filter-search"
              placeholder="搜尋活動或負責人…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="detail-filter-clear-x"
                onClick={() => setSearchQuery("")}
              >
                ✕
              </button>
            )}
          </div>
          <button
            className={`detail-filter-toggle ${showFilters ? "active" : ""}`}
            onClick={() => setShowFilters((v) => !v)}
            title="進階篩選"
          >
            ▼ 篩選
          </button>
          {hasActiveFilter && (
            <button className="detail-filter-clear-all" onClick={clearFilters}>
              清除篩選
            </button>
          )}
        </div>
        {showFilters && (
          <div className="detail-filter-expanded">
            <label className="detail-filter-label">
              <span>主責者</span>
              <select
                className="detail-filter-select"
                value={filterOwner}
                onChange={(e) => setFilterOwner(e.target.value)}
              >
                <option value="all">全部</option>
                {measureOwners.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="detail-tabs">
        <button
          className={`detail-tab ${tab === "measure" ? "active" : ""}`}
          onClick={() => setTab("measure")}
        >
          📊 成效指標 {allKpisCount > 0 ? `(${allKpisCount})` : ""}
        </button>
        <button
          className={`detail-tab ${tab === "plans" ? "active" : ""}`}
          onClick={() => setTab("plans")}
        >
          📅 行動計劃 {totalItems > 0 ? `${doneItems}/${totalItems}` : ""}
        </button>
        <button
          className={`detail-tab ${tab === "notes" ? "active" : ""}`}
          onClick={() => setTab("notes")}
        >
          📝 備註
        </button>
      </div>

      <div className="detail-body">
        {tab === "measure" && (
          <div>
            {/* Phase 3: Activity-First — 顯示 linkedDeptActivities，不再直接編輯 measures[] */}
            <div
              className="msec-header"
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <span className="msec-badge msec-effect">連結活動</span>
              <span className="msec-desc" style={{ flex: 1 }}>
                此策略的活動清單由「活動頁面」集中管理，可至活動頁面新增或編輯。
              </span>
              {onNavigateToActivityPage && (
                <button
                  className="detail-add-btn"
                  onClick={onNavigateToActivityPage}
                  style={{ whiteSpace: "nowrap" }}
                >
                  前往活動頁面 →
                </button>
              )}
            </div>

            {!linkedDeptActivities || linkedDeptActivities.length === 0 ? (
              <div
                style={{
                  color: "#9ca3af",
                  padding: "32px 0",
                  textAlign: "center",
                  fontSize: 14,
                }}
              >
                尚無連結活動。請至活動頁面新增活動，並選擇此策略為連結目標。
              </div>
            ) : (
              <div className="measure-list">
                {linkedDeptActivities.map((act) => {
                  const isExcluded =
                    act.dashboardLinks?.find(
                      (l) => l.type === "ogsm" && l.strategyId === strategy.id,
                    )?.exclude === true;

                  const statusColor: Record<string, string> = {
                    completed: "#059669",
                    attention: "#b45309",
                    "in-progress": "#2563eb",
                    "not-started": "#6b7280",
                  };
                  const statusBg: Record<string, string> = {
                    completed: "#ecfdf5",
                    attention: "#fffbeb",
                    "in-progress": "#eff6ff",
                    "not-started": "#f9fafb",
                  };
                  const statusBorder: Record<string, string> = {
                    completed: "#a7f3d0",
                    attention: "#fcd34d",
                    "in-progress": "#bfdbfe",
                    "not-started": "#d1d5db",
                  };
                  const statusLabel: Record<string, string> = {
                    "not-started": "未開始",
                    attention: "需注意",
                    "in-progress": "進行中",
                    completed: "已完成",
                  };
                  const s = act.status ?? "not-started";

                  return (
                    <div
                      key={act.id}
                      className={`measure-block${isExcluded ? " measure-block--excluded" : ""}`}
                      style={{ marginBottom: 8 }}
                    >
                      <div
                        className="plan-section-header"
                        style={{ alignItems: "center", gap: 8 }}
                      >
                        {/* 狀態徽章（唯讀） */}
                        <span
                          style={{
                            fontSize: 12,
                            padding: "2px 8px",
                            borderRadius: 12,
                            border: `1px solid ${statusBorder[s]}`,
                            color: statusColor[s],
                            background: statusBg[s],
                            flexShrink: 0,
                          }}
                        >
                          {statusLabel[s]}
                        </span>

                        {/* 活動名稱 */}
                        <span
                          className="plan-title-edit"
                          style={{ flex: 1, fontWeight: 500 }}
                        >
                          {act.rawText || "(未命名活動)"}
                        </span>

                        {/* 主責者 */}
                        {act.owner && (
                          <span className="owner-chip">{act.owner}</span>
                        )}

                        {/* 日期範圍 */}
                        {(act.startDate || act.endDate) && (
                          <span
                            style={{
                              fontSize: 12,
                              color: "#6b7280",
                              flexShrink: 0,
                            }}
                          >
                            {act.startDate ?? "?"} ～ {act.endDate ?? "?"}
                          </span>
                        )}

                        {/* 計入 OGSM toggle */}
                        {onToggleExcludeFromOgsm && (
                          <label
                            className="measure-ogsm-toggle"
                            title={
                              isExcluded
                                ? "此活動不計入 OGSM 指標（點擊恢復）"
                                : "此活動計入 OGSM 指標（點擊排除）"
                            }
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              disabled={isReadOnly}
                              onChange={(e) =>
                                onToggleExcludeFromOgsm(
                                  act.id,
                                  !e.target.checked,
                                  strategy.id,
                                )
                              }
                            />
                            <span
                              className={
                                isExcluded ? "ogsm-toggle-label--excluded" : ""
                              }
                            >
                              計入OGSM
                            </span>
                          </label>
                        )}

                        {/* KPI 數量 */}
                        {act.kpis && act.kpis.length > 0 && (
                          <span
                            style={{
                              fontSize: 11,
                              color: "#6b7280",
                              background: "#f3f4f6",
                              borderRadius: 8,
                              padding: "2px 6px",
                              flexShrink: 0,
                            }}
                          >
                            KPI × {act.kpis.length}
                          </span>
                        )}

                        {/* 編輯按鈕 */}
                        {(onOpenActivityDetail || onNavigateToActivityPage) && (
                          <button
                            className="detail-add-btn"
                            onClick={() => {
                              if (onOpenActivityDetail) {
                                onOpenActivityDetail(act.id);
                              } else {
                                onNavigateToActivityPage?.();
                              }
                            }}
                            title="在活動頁面編輯此活動"
                            style={{ padding: "4px 8px", flexShrink: 0 }}
                          >
                            編輯 →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "plans" && (
          <div className="plans-tab-content">
            {warnFilter && (
              <div className="plan-warn-filter-bar">
                <span
                  className={`meta-tag ${warnFilter === "overdue" ? "meta-warn-overdue" : "meta-warn-near"}`}
                >
                  {warnFilter === "overdue" ? "🔴 逾期篩選中" : "⚠️ 預警篩選中"}
                </span>
                <button
                  className="plan-warn-filter-clear"
                  onClick={() => setWarnFilter(null)}
                >
                  ✕ 清除篩選
                </button>
              </div>
            )}
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 12,
                flexWrap: "wrap",
              }}
            >
              {quarters.map((q) => (
                <button
                  key={q}
                  className={`detail-tab ${selectedQuarter === q ? "active" : ""}`}
                  onClick={() => setSelectedQuarter(q)}
                >
                  {q}
                </button>
              ))}
              <label
                className="plan-warn-setting"
                style={{ marginLeft: "auto" }}
                title="距預計完成日幾天內未完成時顯示警告"
              >
                ⏰ 預警
                <input
                  type="number"
                  className="plan-warn-days-input"
                  min={1}
                  max={60}
                  value={warnDaysLocal}
                  onChange={(e) => setWarnDaysLocal(e.target.value)}
                  onBlur={() =>
                    onUpdateWarnDaysBefore(
                      Math.max(1, parseInt(warnDaysLocal) || 7),
                    )
                  }
                />
                天前
              </label>
            </div>

            {/* For the selected quarter, show each Measure's checklist items */}
            {strategy.measures
              .filter((m) => {
                // Hide if doesn't match search filter
                if (hasActiveFilter && !measureMatchesFilter(m)) return false;
                // Show measure if it belongs to this quarter
                if ((m.quarter ?? selectedQuarter) === selectedQuarter)
                  return true;
                // Otherwise, use activity (Measure) date range to decide cross-quarter visibility.
                const linkedItems = strategy.actionPlans
                  .flatMap((p) => p.items)
                  .filter((i) => i.linkedMeasureId === m.id);
                const hasOverlap = doesMeasureOverlapQuarter(
                  m,
                  linkedItems,
                  selectedQuarter,
                );
                return hasOverlap;
              })
              .map((m) => {
                const linkedItems = strategy.actionPlans
                  .flatMap((p) => p.items)
                  .filter((i) => i.linkedMeasureId === m.id);
                const measureOverlapsSelectedQuarter =
                  doesMeasureOverlapQuarter(m, linkedItems, selectedQuarter);
                const itemsForMeasure = linkedItems
                  .filter((i) => {
                    // Item belongs to this quarter's ActionPlan,
                    // or this activity spans into the selected quarter.
                    const inQuarterPlan = strategy.actionPlans
                      .filter((p) => p.quarter === selectedQuarter)
                      .flatMap((p) => p.items)
                      .some((pi) => pi.id === i.id);
                    return inQuarterPlan || measureOverlapsSelectedQuarter;
                  })
                  .filter((i) => !hasActiveFilter || planItemMatchesFilter(i));
                // Deduplicate and sort by planned end date
                const seen = new Set<string>();
                const dedupItems = itemsForMeasure
                  .filter((i) => {
                    if (seen.has(i.id)) return false;
                    seen.add(i.id);
                    return true;
                  })
                  .sort((a, b) => {
                    if (!a.plannedEndDate && !b.plannedEndDate) return 0;
                    if (!a.plannedEndDate) return 1;
                    if (!b.plannedEndDate) return -1;
                    return a.plannedEndDate.localeCompare(b.plannedEndDate);
                  });
                const isFromOtherQuarter =
                  (m.quarter ?? selectedQuarter) !== selectedQuarter;
                const doneCount = dedupItems.filter(
                  (it) => it.completed,
                ).length;
                const totalCount = dedupItems.length;
                const sectionCollapsed = !!planSectionCollapsed[m.id];
                const sectionProgress =
                  totalCount > 0
                    ? Math.round((doneCount / totalCount) * 100)
                    : 0;
                return (
                  <div key={m.id} className="plan-section-card">
                    <div
                      className="plan-section-card-header"
                      onClick={() =>
                        setPlanSectionCollapsed((s) => ({
                          ...s,
                          [m.id]: !s[m.id],
                        }))
                      }
                    >
                      <span
                        className={`plan-collapse-arrow${sectionCollapsed ? " collapsed" : ""}`}
                      >
                        ▾
                      </span>
                      {isFromOtherQuarter && (
                        <span
                          className="synced-badge synced-badge-sm"
                          title={`來源: ${m.quarter}`}
                        >
                          ↩ {m.quarter}
                        </span>
                      )}
                      <span className="plan-section-card-title">
                        {m.rawText || "活動"}
                      </span>
                      <span
                        className="plan-section-date-range"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <input
                          type="date"
                          className="plan-section-date-input"
                          value={m.startDate ?? ""}
                          title="活動開始日"
                          onChange={(e) =>
                            updateMeasureDateRange(m.id, {
                              startDate: e.target.value || undefined,
                            })
                          }
                        />
                        <span className="plan-section-date-sep">~</span>
                        <input
                          type="date"
                          className="plan-section-date-input"
                          value={m.endDate ?? ""}
                          title="活動結束日"
                          onChange={(e) =>
                            updateMeasureDateRange(m.id, {
                              endDate: e.target.value || undefined,
                            })
                          }
                        />
                      </span>
                      {m.owner && (
                        <span className="plan-section-card-owner">
                          {m.owner}
                        </span>
                      )}
                      <span className="plan-section-card-count">
                        {doneCount}/{totalCount}
                      </span>
                      <div className="plan-section-card-bar">
                        <div
                          className="plan-section-card-bar-fill"
                          style={{
                            width: `${sectionProgress}%`,
                            background:
                              sectionProgress >= 100
                                ? "#10b981"
                                : sectionProgress > 0
                                  ? "#6366f1"
                                  : "#e5e7eb",
                          }}
                        />
                      </div>
                    </div>
                    {!sectionCollapsed && (
                      <div className="plan-section-card-body">
                        <table className="plan-table">
                          <thead>
                            <tr>
                              <th>✓</th>
                              <th>項目名稱</th>
                              <th>預計完成</th>
                              <th>實際完成</th>
                              <th>備註</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {dedupItems.map((item) => {
                              const itemSourceQuarter =
                                strategy.actionPlans.find((p) =>
                                  p.items.some((pi) => pi.id === item.id),
                                )?.quarter;
                              const isFromOtherQ =
                                itemSourceQuarter !== selectedQuarter;
                              return renderPlanItemRow(
                                item,
                                isFromOtherQ && itemSourceQuarter ? (
                                  <span
                                    className="synced-badge synced-badge-sm"
                                    title={`來源: ${itemSourceQuarter}（唯讀）`}
                                  >
                                    ↩ {itemSourceQuarter}
                                  </span>
                                ) : null,
                                isFromOtherQ,
                              );
                            })}
                          </tbody>
                        </table>
                        {!isReadOnly && (
                          <button
                            className="plan-add-item"
                            onClick={() => addChecklistItemToMeasure(m.id)}
                          >
                            + 新增項目
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* Unlinked items — items without linkedMeasureId */}
            {(() => {
              const unlinkedItems = strategy.actionPlans
                .flatMap((p) => p.items)
                .filter((i) => !i.linkedMeasureId)
                .filter((i) => {
                  const inQuarterPlan = strategy.actionPlans
                    .filter((p) => p.quarter === selectedQuarter)
                    .flatMap((p) => p.items)
                    .some((pi) => pi.id === i.id);
                  return (
                    inQuarterPlan || doesItemOverlapQuarter(i, selectedQuarter)
                  );
                })
                .filter((i) => !hasActiveFilter || planItemMatchesFilter(i));
              // Deduplicate and sort by planned end date
              const seen = new Set<string>();
              const dedupUnlinked = unlinkedItems
                .filter((i) => {
                  if (seen.has(i.id)) return false;
                  seen.add(i.id);
                  return true;
                })
                .sort((a, b) => {
                  if (!a.plannedEndDate && !b.plannedEndDate) return 0;
                  if (!a.plannedEndDate) return 1;
                  if (!b.plannedEndDate) return -1;
                  return a.plannedEndDate.localeCompare(b.plannedEndDate);
                });
              if (dedupUnlinked.length === 0) return null;
              const doneCount = dedupUnlinked.filter(
                (it) => it.completed,
              ).length;
              const totalCount = dedupUnlinked.length;
              const sectionCollapsed = !!planSectionCollapsed["__unlinked__"];
              const sectionProgress =
                totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
              return (
                <div className="plan-section-card">
                  <div
                    className="plan-section-card-header"
                    onClick={() =>
                      setPlanSectionCollapsed((s) => ({
                        ...s,
                        ["__unlinked__"]: !s["__unlinked__"],
                      }))
                    }
                  >
                    <span
                      className={`plan-collapse-arrow${sectionCollapsed ? " collapsed" : ""}`}
                    >
                      ▾
                    </span>
                    <span className="plan-section-card-title">未分類項目</span>
                    <span className="plan-section-card-count">
                      {doneCount}/{totalCount}
                    </span>
                    <div className="plan-section-card-bar">
                      <div
                        className="plan-section-card-bar-fill"
                        style={{
                          width: `${sectionProgress}%`,
                          background:
                            sectionProgress >= 100
                              ? "#10b981"
                              : sectionProgress > 0
                                ? "#6366f1"
                                : "#e5e7eb",
                        }}
                      />
                    </div>
                  </div>
                  {!sectionCollapsed && (
                    <div className="plan-section-card-body">
                      <table className="plan-table">
                        <thead>
                          <tr>
                            <th>✓</th>
                            <th>項目名稱</th>
                            <th>預計完成</th>
                            <th>實際完成</th>
                            <th>備註</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {dedupUnlinked.map((item) =>
                            renderPlanItemRow(item, undefined, false),
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {tab === "notes" && (
          <div className="notes-wrap">
            <InlineEdit
              value={strategy.notes}
              multiline
              onSave={(v) => onUpdate({ ...strategy, notes: v })}
              className="notes-textarea"
              placeholder="在此記錄備注、決策或補充說明…"
              disabled={isReadOnly}
            />
          </div>
        )}
      </div>
    </aside>
  );
}
