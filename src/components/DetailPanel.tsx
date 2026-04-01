import React, { useState, useEffect, useCallback, useRef } from "react";
import type {
  Strategy,
  KPI,
  Measure,
  MeasureStatus,
  Team,
  TeamMember,
  ActionPlan,
  PlanItem,
} from "../schemas/ogsm";
import { genId } from "../utils/csvParser";
import { getPlanItemWarning } from "../utils/planWarnings";

interface Props {
  strategy: Strategy;
  onClose: () => void;
  onUpdate: (s: Strategy) => void;
  onDelete: () => void;
  teams: Team[];
  allMembers: TeamMember[];
  warnDaysBefore: number;
  onUpdateWarnDaysBefore: (n: number) => void;
}

function InlineEdit({
  value,
  onSave,
  className = "",
  placeholder = "點擊編輯…",
  multiline = false,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const commit = () => {
    onSave(draft);
    setEditing(false);
  };

  if (!editing) {
    return (
      <span
        className={`inline-edit-view ${className}`}
        onDoubleClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="雙擊編輯"
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
          if (e.key === "Escape") setEditing(false);
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
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  kpi,
  onUpdate,
  onDelete,
  linkedTotal,
  linkedDone,
}: {
  kpi: KPI;
  onUpdate: (k: KPI) => void;
  onDelete: () => void;
  linkedTotal?: number;
  linkedDone?: number;
}) {
  const isProgress = kpi.kpiType === "progress";
  const hasActual = kpi.actual !== null && kpi.actual !== undefined;
  // 進度型：直接用 actual 作為圓環值（target 固定 100，achievementRate = actual）
  const rawRate = isProgress
    ? hasActual
      ? kpi.actual
      : null
    : hasActual
      ? kpi.achievementRate
      : null;
  const rate = rawRate ?? 0;
  const rateIsNull = rawRate === null || rawRate === undefined;
  const size = 72;
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(rate, 100) / 100) * circ;
  const color =
    rate >= 100
      ? "#10b981"
      : rate >= 70
        ? "#6366f1"
        : rate >= 40
          ? "#f59e0b"
          : rate > 0
            ? "#ef4444"
            : "#4b5563";

  return (
    <div className="kpi-card">
      <svg width={size} height={size} style={{ flexShrink: 0 }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={5}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={5}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        <text
          x={size / 2}
          y={size / 2 + 5}
          textAnchor="middle"
          fill={color}
          fontSize={11}
          fontWeight="800"
        >
          {rateIsNull ? "—" : `${Math.round(rate)}%`}
        </text>
      </svg>
      <div className="kpi-card-info" style={{ flex: 1 }}>
        <InlineEdit
          value={kpi.label}
          onSave={(v) => onUpdate({ ...kpi, label: v })}
          className="kpi-label-edit"
          placeholder="KPI 名稱"
        />
        {/* 類型標籤：唯讀，建立時已定，不可切換 */}
        <span
          style={{
            display: "inline-block",
            fontSize: 10,
            padding: "1px 7px",
            marginBottom: 4,
            borderRadius: 10,
            border: `1px solid ${isProgress ? "#a78bfa" : "#d1d5db"}`,
            background: isProgress ? "#f5f3ff" : "#f9fafb",
            color: isProgress ? "#7c3aed" : "#6b7280",
          }}
        >
          {isProgress ? "進度型" : "量化型"}
        </span>
        {typeof linkedTotal !== "undefined" && linkedTotal > 0 && (
          <div style={{ fontSize: 10, color: "var(--text)", marginBottom: 6 }}>
            關聯項目：{linkedDone}/{linkedTotal} 項
          </div>
        )}
        <div className="kpi-inputs">
          <label className="kpi-field">
            {isProgress ? "進度" : "達成率"}
            <span
              className="kpi-num-input"
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "#f3f4f6",
                cursor: "default",
              }}
            >
              {hasActual && kpi.achievementRate != null
                ? Math.round(kpi.achievementRate)
                : "—"}
            </span>
            %
          </label>
          <label className="kpi-field">
            目標
            <input
              type="number"
              min={0}
              value={kpi.target ?? ""}
              placeholder="—"
              className="kpi-num-input"
              readOnly={isProgress}
              style={
                isProgress
                  ? { background: "#f3f4f6", cursor: "default" }
                  : undefined
              }
              onChange={(e) => {
                const target =
                  e.target.value === "" ? null : parseFloat(e.target.value);
                let rate: number | null = null;
                if (target !== null && target > 0 && kpi.actual !== null)
                  rate = (kpi.actual / target) * 100;
                else if (
                  kpi.actual !== null &&
                  (target === null || target === 0)
                )
                  rate = 0;
                onUpdate({ ...kpi, target, achievementRate: rate });
              }}
            />
          </label>
          <label className="kpi-field">
            實際
            <input
              type="number"
              min={0}
              value={kpi.actual ?? ""}
              placeholder="—"
              className="kpi-num-input"
              onChange={(e) => {
                const actual =
                  e.target.value === "" ? null : parseFloat(e.target.value);
                let rate: number | null = null;
                if (actual !== null && kpi.target !== null && kpi.target > 0)
                  rate = (actual / kpi.target) * 100;
                onUpdate({ ...kpi, actual, achievementRate: rate });
              }}
            />
          </label>
          {!isProgress && (
            <label className="kpi-field">
              單位
              <input
                type="text"
                value={kpi.unit}
                placeholder="人/筆…"
                className="kpi-num-input"
                style={{ width: 44 }}
                onChange={(e) => onUpdate({ ...kpi, unit: e.target.value })}
              />
            </label>
          )}
        </div>
      </div>
      <button className="kpi-delete-btn" onClick={onDelete} title="刪除 KPI">
        🗑
      </button>
    </div>
  );
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

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
  allMembers,
  warnDaysBefore,
  onUpdateWarnDaysBefore,
}: Props) {
  const [tab, setTab] = useState<"measure" | "plans" | "notes">("measure");
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
      map[m.id] = true;
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

  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem("ogsm_panel_width");
    return saved ? parseInt(saved, 10) : 800;
  });

  useEffect(() => {
    localStorage.setItem("ogsm_panel_width", panelWidth.toString());
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

  // KPI helpers
  const updateKPI = (msrId: string, kpiId: string, updated: KPI) => {
    onUpdate({
      ...strategy,
      measures: strategy.measures.map((m) =>
        m.id !== msrId
          ? m
          : {
              ...m,
              kpis: m.kpis.map((k) => (k.id === kpiId ? updated : k)),
            },
      ),
    });
  };
  const deleteKPI = (msrId: string, kpiId: string) => {
    const kpiLabel =
      strategy.measures
        .find((m) => m.id === msrId)
        ?.kpis.find((k) => k.id === kpiId)?.label ?? "此 KPI";
    if (!window.confirm(`確定要刪除「${kpiLabel}」嗎？`)) return;
    onUpdate({
      ...strategy,
      measures: strategy.measures.map((m) =>
        m.id !== msrId
          ? m
          : { ...m, kpis: m.kpis.filter((k) => k.id !== kpiId) },
      ),
    });
  };
  // addKPI removed — KPIs should be added under a specific Measure via UI

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
              !readOnly &&
              updatePlanItem(item.id, { plannedEndDate: e.target.value })
            }
          />
        </td>
        <td>
          <input
            type="date"
            className="plan-tbl-date plan-tbl-actual"
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
    return textOk;
  }

  // Plan helpers (plans are managed via Measures and fixed quarters)

  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const preferred = strategy.measures[0]?.quarter;
  const [selectedQuarter, setSelectedQuarter] = useState<string>(
    preferred && quarters.includes(preferred) ? preferred : "Q1",
  );

  // Drag & drop for measures (move or copy)
  const dragMsrId = useRef<string | null>(null);
  const onMeasureDragStart = (e: React.DragEvent, msrId: string) => {
    const copy = e.ctrlKey || e.metaKey; // Ctrl/Cmd to copy
    e.dataTransfer.setData(
      "application/ogsm-measure",
      `${msrId}|${copy ? "copy" : "move"}`,
    );
    e.dataTransfer.effectAllowed = copy ? "copy" : "move";
    dragMsrId.current = msrId;
  };
  const onMeasureDragEnd = () => {
    dragMsrId.current = null;
  };
  const onMeasureDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onMeasureDrop = (e: React.DragEvent, targetQuarter: string) => {
    e.preventDefault();
    const payload = e.dataTransfer.getData("application/ogsm-measure");
    if (!payload) return;
    const [msrId, mode] = payload.split("|");
    const src = strategy.measures.find((m) => m.id === msrId);
    if (!src) return;
    if (mode === "copy") {
      const copy: Measure = {
        ...src,
        id: genId("msr"),
        quarter: targetQuarter,
      };
      onUpdate({ ...strategy, measures: [...strategy.measures, copy] });
    } else {
      onUpdate({
        ...strategy,
        measures: strategy.measures.map((m) =>
          m.id === msrId ? { ...m, quarter: targetQuarter } : m,
        ),
      });
    }
  };

  const copyMeasure = (msrId: string) => {
    const src = strategy.measures.find((m) => m.id === msrId);
    if (!src) return;
    const copy: Measure = {
      ...src,
      id: genId("msr"),
      kpis: src.kpis.map((k) => ({ ...k, id: genId("kpi") })),
    };
    onUpdate({ ...strategy, measures: [...strategy.measures, copy] });
  };

  // Measure helpers (活動/項目)
  // Owner helpers
  const ownersList = strategy.owners;
  const setOwners = (names: string[]) =>
    onUpdate({ ...strategy, owners: names });
  const removeOwner = (name: string) =>
    setOwners(ownersList.filter((n) => n !== name));

  const addMeasure = (quarter?: string) => {
    const nm: Measure = {
      id: genId("msr"),
      rawText: "新活動",
      kpis: [],
      quarter: quarter ?? selectedQuarter,
      status: "not-started",
    };
    onUpdate({ ...strategy, measures: [...strategy.measures, nm] });
  };

  const deleteMeasure = (msrId: string) => {
    const linkedCount = strategy.actionPlans
      .flatMap((p) => p.items)
      .filter((i) => i.linkedMeasureId === msrId).length;
    const msrName =
      strategy.measures.find((m) => m.id === msrId)?.rawText || "此活動";
    const msg =
      linkedCount > 0
        ? `確定要刪除「${msrName}」嗎？\n將同時刪除 ${linkedCount} 筆關聯的行動計畫項目。`
        : `確定要刪除「${msrName}」嗎？`;
    if (!window.confirm(msg)) return;
    const newMeasures = strategy.measures.filter((m) => m.id !== msrId);
    const newActionPlans = strategy.actionPlans.map((p) => ({
      ...p,
      items: p.items.filter((i) => i.linkedMeasureId !== msrId),
    }));
    onUpdate({
      ...strategy,
      measures: newMeasures,
      actionPlans: newActionPlans,
    });
  };

  const addKpiToMeasure = (msrId: string, kpiType: "value" | "progress") => {
    const newKpi: KPI = {
      id: genId("kpi"),
      label: kpiType === "progress" ? "新進度指標" : "新 KPI",
      target: kpiType === "progress" ? 100 : null,
      actual: null,
      unit: kpiType === "progress" ? "%" : "%",
      achievementRate: null,
      kpiType,
    };
    onUpdate({
      ...strategy,
      measures: strategy.measures.map((m) =>
        m.id === msrId ? { ...m, kpis: [...m.kpis, newKpi] } : m,
      ),
    });
    setKpiDropdownMsrId(null);
  };

  const defaultCollapsed = () => {
    const map: Record<string, boolean> = {};
    strategy.measures.forEach((m) => {
      map[m.id] = true;
    });
    return map;
  };
  const [measureCollapsed, setMeasureCollapsed] =
    useState<Record<string, boolean>>(defaultCollapsed);

  // 新增 KPI Dropdown：記錄目前展開選單的 measure id
  const [kpiDropdownMsrId, setKpiDropdownMsrId] = useState<string | null>(null);

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
  const hasActiveFilter = searchQuery.trim() !== "" || filterOwner !== "all";

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
    return ownerOk && textOk;
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
            <button
              className="detail-del-btn"
              onClick={onDelete}
              title="刪除策略"
            >
              🗑 刪除
            </button>
          </div>
        </div>

        <div className="detail-meta">
          {teams.length > 0 ? (
            <div className="owners-editor" ref={ownerDropRef}>
              {ownersList.map((name) => (
                <span key={name} className="owner-chip">
                  {name}
                  <button
                    className="owner-chip-remove"
                    onClick={() => removeOwner(name)}
                    title="移除"
                  >
                    ×
                  </button>
                </span>
              ))}
              {teams.filter((t) => !ownersList.includes(t.name)).length > 0 && (
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
            {/* 衡量指標（活動/項目 -> KPI） */}
            <div className="msec-header">
              <span className="msec-badge msec-effect">衡量指標</span>
              <span className="msec-desc">
                活動/專案可新增、刪除與摺疊，每個活動可包含多個 KPI，
                目前以季度欄位管理。
              </span>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {quarters.map((q) => (
                  <button
                    key={q}
                    className={`detail-tab quarter-drop-tab ${selectedQuarter === q ? "active" : ""}`}
                    onClick={() => setSelectedQuarter(q)}
                    onDragOver={(e) => {
                      if (q !== selectedQuarter) {
                        e.preventDefault();
                        e.currentTarget.classList.add("drag-over");
                      }
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove("drag-over");
                    }}
                    onDrop={(e) => {
                      e.currentTarget.classList.remove("drag-over");
                      if (q !== selectedQuarter) {
                        onMeasureDrop(e, q);
                      }
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="measure-list"
              onDragOver={onMeasureDragOver}
              onDrop={(e) => onMeasureDrop(e, selectedQuarter)}
            >
              {strategy.measures
                .filter((m) => {
                  // Hide if doesn't match search/filter
                  if (hasActiveFilter && !measureMatchesFilter(m)) return false;
                  return (m.quarter ?? selectedQuarter) === selectedQuarter;
                })
                .map((m) => {
                  const collapsed = !!measureCollapsed[m.id];
                  return (
                    <div
                      key={m.id}
                      className="measure-block"
                      style={{ marginBottom: 12 }}
                    >
                      <div
                        className="plan-section-header"
                        style={{ alignItems: "center" }}
                      >
                        <span
                          className="measure-drag-handle"
                          title="拖曳移動到其他季度（按住 Ctrl 為複製）"
                          draggable
                          onDragStart={(e) => onMeasureDragStart(e, m.id)}
                          onDragEnd={onMeasureDragEnd}
                        >
                          ⠿
                        </span>
                        <span
                          className={`plan-collapse-arrow${collapsed ? " collapsed" : ""}`}
                          onClick={() =>
                            setMeasureCollapsed((s) => ({
                              ...s,
                              [m.id]: !s[m.id],
                            }))
                          }
                          style={{ cursor: "pointer" }}
                        >
                          ▾
                        </span>
                        <InlineEdit
                          value={m.rawText || ""}
                          onSave={(v) =>
                            onUpdate({
                              ...strategy,
                              measures: strategy.measures.map((ms) =>
                                ms.id === m.id ? { ...ms, rawText: v } : ms,
                              ),
                            })
                          }
                          className="plan-title-edit"
                          placeholder="活動名稱/專案名稱"
                        />
                        {allMembers.length > 0 ? (
                          <select
                            className="owner-select"
                            value={m.owner ?? ""}
                            onChange={(e) =>
                              onUpdate({
                                ...strategy,
                                measures: strategy.measures.map((ms) =>
                                  ms.id === m.id
                                    ? { ...ms, owner: e.target.value }
                                    : ms,
                                ),
                              })
                            }
                          >
                            <option value="">選擇主責者</option>
                            {teams.map((t) => (
                              <optgroup key={t.id} label={t.name}>
                                {t.members.map((mb) => (
                                  <option key={mb.id} value={mb.name}>
                                    {mb.name}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        ) : (
                          <InlineEdit
                            value={m.owner ?? ""}
                            onSave={(v) =>
                              onUpdate({
                                ...strategy,
                                measures: strategy.measures.map((ms) =>
                                  ms.id === m.id ? { ...ms, owner: v } : ms,
                                ),
                              })
                            }
                            className="owner-chip owner-edit"
                            placeholder="主責者"
                          />
                        )}
                        <label className="measure-date-label">
                          最後更新
                          <input
                            type="date"
                            className="measure-date-input"
                            value={(m.updatedAt ?? "").slice(0, 10)}
                            title="最後更新日期"
                            onChange={(e) =>
                              onUpdate({
                                ...strategy,
                                measures: strategy.measures.map((ms) =>
                                  ms.id === m.id
                                    ? {
                                        ...ms,
                                        updatedAt: e.target.value
                                          ? new Date(
                                              e.target.value,
                                            ).toISOString()
                                          : undefined,
                                      }
                                    : ms,
                                ),
                              })
                            }
                          />
                        </label>
                        <select
                          className="measure-status-select"
                          value={m.status ?? "not-started"}
                          style={{
                            color:
                              (m.status ?? "not-started") === "completed"
                                ? "#059669"
                                : (m.status ?? "not-started") === "attention"
                                  ? "#b45309"
                                  : (m.status ?? "not-started") ===
                                      "in-progress"
                                    ? "#2563eb"
                                    : "#6b7280",
                            borderColor:
                              (m.status ?? "not-started") === "completed"
                                ? "#a7f3d0"
                                : (m.status ?? "not-started") === "attention"
                                  ? "#fcd34d"
                                  : (m.status ?? "not-started") ===
                                      "in-progress"
                                    ? "#bfdbfe"
                                    : "#d1d5db",
                            background:
                              (m.status ?? "not-started") === "completed"
                                ? "#ecfdf5"
                                : (m.status ?? "not-started") === "attention"
                                  ? "#fffbeb"
                                  : (m.status ?? "not-started") ===
                                      "in-progress"
                                    ? "#eff6ff"
                                    : "#f9fafb",
                          }}
                          onChange={(e) =>
                            onUpdate({
                              ...strategy,
                              measures: strategy.measures.map((ms) =>
                                ms.id === m.id
                                  ? {
                                      ...ms,
                                      status: e.target.value as MeasureStatus,
                                    }
                                  : ms,
                              ),
                            })
                          }
                        >
                          <option value="not-started">未開始</option>
                          <option value="attention">需注意</option>
                          <option value="in-progress">進行中</option>
                          <option value="completed">已完成</option>
                        </select>
                        <div
                          style={{
                            marginLeft: "auto",
                            display: "flex",
                            gap: 8,
                          }}
                        >
                          <button
                            className="detail-add-btn"
                            onClick={() => copyMeasure(m.id)}
                            title="複製此活動"
                            style={{ padding: "6px 10px" }}
                          >
                            📋 複製
                          </button>
                          <div style={{ position: "relative" }}>
                            <button
                              className="detail-add-btn"
                              style={{ padding: "6px 10px" }}
                              onClick={() =>
                                setKpiDropdownMsrId(
                                  kpiDropdownMsrId === m.id ? null : m.id,
                                )
                              }
                            >
                              + 新增 KPI ▾
                            </button>
                            {kpiDropdownMsrId === m.id && (
                              <>
                                {/* 點擊外部關閉 */}
                                <div
                                  style={{
                                    position: "fixed",
                                    inset: 0,
                                    zIndex: 99,
                                  }}
                                  onClick={() => setKpiDropdownMsrId(null)}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "calc(100% + 4px)",
                                    right: 0,
                                    zIndex: 100,
                                    background: "#fff",
                                    border: "1px solid #e5e7eb",
                                    borderRadius: 8,
                                    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                                    minWidth: 130,
                                    overflow: "hidden",
                                  }}
                                >
                                  {(
                                    [
                                      ["value", "📐 量化型"],
                                      ["progress", "📊 進度型"],
                                    ] as const
                                  ).map(([type, label]) => (
                                    <button
                                      key={type}
                                      style={{
                                        display: "block",
                                        width: "100%",
                                        padding: "9px 14px",
                                        textAlign: "left",
                                        background: "none",
                                        border: "none",
                                        fontSize: 13,
                                        cursor: "pointer",
                                        color: "#374151",
                                      }}
                                      onMouseEnter={(e) =>
                                        ((
                                          e.currentTarget as HTMLButtonElement
                                        ).style.background = "#f3f4f6")
                                      }
                                      onMouseLeave={(e) =>
                                        ((
                                          e.currentTarget as HTMLButtonElement
                                        ).style.background = "none")
                                      }
                                      onClick={() => {
                                        addKpiToMeasure(m.id, type);
                                      }}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                          <button
                            className="plan-del-btn"
                            onClick={() => deleteMeasure(m.id)}
                            title="刪除活動"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                      {!collapsed && (
                        <div className="kpi-list-wrap">
                          <div className="kpi-list">
                            {m.kpis.map((k) => {
                              const linkedItems = strategy.actionPlans
                                .flatMap((p) => p.items)
                                .filter((i) => i.linkedMeasureId === m.id);
                              const linkedTotal = linkedItems.length;
                              const linkedDone = linkedItems.filter(
                                (i) => i.completed,
                              ).length;
                              return (
                                <KpiCard
                                  key={k.id}
                                  kpi={k}
                                  linkedTotal={linkedTotal}
                                  linkedDone={linkedDone}
                                  onUpdate={(updated) =>
                                    updateKPI(m.id, k.id, updated)
                                  }
                                  onDelete={() => deleteKPI(m.id, k.id)}
                                />
                              );
                            })}
                          </div>
                          {m.kpis.length === 0 && (
                            <p className="kpi-list-empty">
                              尚未新增 KPI，點擊「新增 KPI」開始記錄。
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="detail-add-btn" onClick={() => addMeasure()}>
                + 新增活動（於所選季度）
              </button>
            </div>
          </div>
        )}

        {tab === "plans" && (
          <div className="plans-tab-content">
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
                  value={warnDaysBefore}
                  onChange={(e) =>
                    onUpdateWarnDaysBefore(
                      Math.max(1, parseInt(e.target.value) || 7),
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
                // Deduplicate
                const seen = new Set<string>();
                const dedupItems = itemsForMeasure.filter((i) => {
                  if (seen.has(i.id)) return false;
                  seen.add(i.id);
                  return true;
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
                        <button
                          className="plan-add-item"
                          onClick={() => addChecklistItemToMeasure(m.id)}
                        >
                          + 新增項目
                        </button>
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
              // Deduplicate
              const seen = new Set<string>();
              const dedupUnlinked = unlinkedItems.filter((i) => {
                if (seen.has(i.id)) return false;
                seen.add(i.id);
                return true;
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
            />
          </div>
        )}
      </div>
    </aside>
  );
}
