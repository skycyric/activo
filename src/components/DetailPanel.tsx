import { useState, useEffect, useCallback } from "react";
import type {
  Strategy,
  ActionPlan,
  PlanItem,
  KPI,
  Measure,
} from "../types/ogsm";
import { genId, computeStatus } from "../utils/csvParser";

interface Props {
  strategy: Strategy;
  period: string | null;
  onClose: () => void;
  onUpdate: (s: Strategy) => void;
  onDelete: () => void;
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
    onSave(draft || value);
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
          <span style={{ color: "#9ca3af", fontStyle: "italic" }}>
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
        onBlur={commit}
      />
    );
  }
  return (
    <input
      className={`inline-edit-input ${className}`}
      value={draft}
      autoFocus
      onChange={(e) => setDraft(e.target.value)}
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
  displayRate,
  linkedTotal,
  linkedDone,
}: {
  kpi: KPI;
  onUpdate: (k: KPI) => void;
  onDelete: () => void;
  displayRate?: number | null;
  linkedTotal?: number;
  linkedDone?: number;
}) {
  const rawRate = displayRate ?? kpi.achievementRate;
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
            : "#9ca3af";

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
        {typeof linkedTotal !== "undefined" && linkedTotal > 0 && (
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 6 }}>
            關聯項目：{linkedDone}/{linkedTotal} 項
          </div>
        )}
        <div className="kpi-inputs">
          <label className="kpi-field">
            達成率
            <span
              className="kpi-num-input"
              style={{
                display: "inline-flex",
                alignItems: "center",
                background: "#f3f4f6",
                cursor: "default",
              }}
            >
              {kpi.achievementRate != null
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
                else if (actual !== null) rate = 0;
                onUpdate({ ...kpi, actual, achievementRate: rate });
              }}
            />
          </label>
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
        </div>
      </div>
      <button className="kpi-delete-btn" onClick={onDelete} title="刪除 KPI">
        ✕
      </button>
    </div>
  );
}

// PlanSection removed — plans are now derived from Measures per selected quarter

// ─── Date helpers ──────────────────────────────────────────────────────────────
function parseMonthDay(s: string) {
  // YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { month: parseInt(iso[2]), day: parseInt(iso[3]) };
  // MM/DD
  const md = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (md) return { month: parseInt(md[1]), day: parseInt(md[2]) };
  return null;
}

function toIsoDate(s: string | undefined, year: number): string {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return "";
}

function getQuarterForMonth(month: number): string {
  if (month <= 3) return "Q1";
  if (month <= 6) return "Q2";
  if (month <= 9) return "Q3";
  return "Q4";
}

function getSpannedQuarters(
  startDate: string | undefined,
  endDate: string | undefined,
): string[] {
  if (!startDate) return [];
  const s = parseMonthDay(startDate);
  if (!s) return [];
  if (!endDate) return [getQuarterForMonth(s.month)];
  const e = parseMonthDay(endDate);
  if (!e) return [getQuarterForMonth(s.month)];
  const quarters: string[] = [];
  for (let m = s.month; m <= e.month; m++) {
    const q = getQuarterForMonth(m);
    if (!quarters.includes(q)) quarters.push(q);
  }
  return quarters;
}

/** Determine the "source" quarter for a plan item (earliest quarter based on start date). */
function getItemSourceQuarter(item: PlanItem): string | null {
  const d = parseMonthDay(item.startDate ?? item.date ?? "");
  if (!d) return null;
  return getQuarterForMonth(d.month);
}

// Cross-quarter sync: when a plan item's dates span multiple quarters,
// ensure copies exist in each relevant quarter's action plan.
function syncItemAcrossQuarters(
  actionPlans: ActionPlan[],
  item: PlanItem,
  currentQuarter: string,
): ActionPlan[] {
  const quarters = getSpannedQuarters(
    item.startDate ?? item.date,
    item.endDate,
  );
  if (quarters.length <= 1) {
    // Remove copies from other quarters
    return actionPlans.map((p) =>
      p.quarter === currentQuarter
        ? p
        : { ...p, items: p.items.filter((it) => it.id !== item.id) },
    );
  }
  // Get the latest version of the item from the current quarter
  const latest =
    actionPlans
      .filter((p) => p.quarter === currentQuarter)
      .flatMap((p) => p.items)
      .find((it) => it.id === item.id) ?? item;

  let result = [...actionPlans];
  for (const q of quarters) {
    if (q === currentQuarter) continue;
    const apIdx = result.findIndex((p) => p.quarter === q);
    if (apIdx >= 0) {
      const existing = result[apIdx].items.find((it) => it.id === item.id);
      if (!existing) {
        result[apIdx] = {
          ...result[apIdx],
          items: [...result[apIdx].items, { ...latest }],
        };
      } else {
        result[apIdx] = {
          ...result[apIdx],
          items: result[apIdx].items.map((it) =>
            it.id === item.id ? { ...latest } : it,
          ),
        };
      }
    } else {
      result.push({
        id: genId("plan"),
        quarter: q,
        title: q + " 計畫",
        items: [{ ...latest }],
      });
    }
  }
  // Remove from quarters that the item no longer spans
  const allQ = ["Q1", "Q2", "Q3", "Q4"];
  for (const q of allQ) {
    if (q === currentQuarter || quarters.includes(q)) continue;
    result = result.map((p) =>
      p.quarter === q
        ? { ...p, items: p.items.filter((it) => it.id !== item.id) }
        : p,
    );
  }
  return result;
}

// ─── Plan Calendar View (Monthly Grid) ────────────────────────────────────────
function PlanCalendarView({
  plans,
  year,
}: {
  plans: ActionPlan[];
  year: number;
}) {
  // expand items, handling ranges (startDate/endDate) by producing one entry per day
  const items = plans
    .flatMap((p) =>
      p.items.flatMap((i) => {
        const entries: any[] = [];
        if (i.startDate && i.endDate) {
          const s = parseMonthDay(i.startDate);
          const e = parseMonthDay(i.endDate);
          if (s && e) {
            // assume same year
            const yearNum = year;
            let cur = new Date(yearNum, s.month - 1, s.day);
            const end = new Date(yearNum, e.month - 1, e.day);
            while (cur <= end) {
              entries.push({
                ...i,
                planTitle: p.title,
                month: cur.getMonth() + 1,
                day: cur.getDate(),
              });
              cur.setDate(cur.getDate() + 1);
            }
          }
        } else if (i.date || i.startDate) {
          const d = parseMonthDay(i.date ?? i.startDate ?? "");
          if (d)
            entries.push({
              ...i,
              planTitle: p.title,
              month: d.month,
              day: d.day,
            });
        }
        return entries;
      }),
    )
    .filter((i) => i.month > 0 && i.day > 0);

  if (items.length === 0)
    return <div className="plan-empty">沒有包含日期的計畫項目可顯示於月曆</div>;

  const months = Array.from(new Set(items.map((i) => i.month))).sort(
    (a, b) => a - b,
  );

  return (
    <div className="plan-cal-grid-wrap">
      {months.map((m) => {
        const firstDay = new Date(year, m - 1, 1).getDay();
        const daysInMonth = new Date(year, m, 0).getDate();
        const startOffset = firstDay === 0 ? 6 : firstDay - 1;
        const cells: (number | null)[] = [];
        for (let i = 0; i < startOffset; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);
        const monthItems = items.filter((i) => i.month === m);
        return (
          <div key={m} className="cal-month-block">
            <div className="cal-month-title">
              {m} 月 {year}
            </div>
            <div className="cal-week-header">
              {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                <div key={d} className="cal-weekday">
                  {d}
                </div>
              ))}
            </div>
            <div className="cal-grid">
              {cells.map((day, idx) => {
                if (!day)
                  return <div key={idx} className="cal-cell cal-cell-empty" />;
                const dayItems = monthItems.filter((i) => i.day === day);
                return (
                  <div
                    key={idx}
                    className={`cal-cell${dayItems.length > 0 ? " cal-cell-active" : ""}`}
                  >
                    <span className="cal-day-num">{day}</span>
                    {dayItems.map((item) => (
                      <div
                        key={item.id}
                        className={`cal-event${item.completed ? " done" : ""}`}
                        title={`${item.planTitle}: ${item.description}`}
                      >
                        <span className="cal-event-dot" />
                        <span className="cal-event-text">
                          {item.description}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Plan Gantt View (Weekly) ──────────────────────────────────────────────────
function PlanGanttView({ plans, year }: { plans: ActionPlan[]; year: number }) {
  const rawItems = plans.flatMap((p) =>
    p.items.map((i) => ({ ...i, planId: p.id, planTitle: p.title })),
  );

  // normalize to jsStart/jsEnd for both single-date and ranges
  const normItems = rawItems
    .map((i) => {
      if (i.startDate && i.endDate) {
        const s = parseMonthDay(i.startDate);
        const e = parseMonthDay(i.endDate);
        if (!s || !e) return null;
        return {
          ...i,
          jsStart: new Date(year, s.month - 1, s.day),
          jsEnd: new Date(year, e.month - 1, e.day),
        };
      }
      const d = parseMonthDay(i.date ?? i.startDate ?? "");
      if (!d) return null;
      const js = new Date(year, d.month - 1, d.day);
      return { ...i, jsStart: js, jsEnd: js };
    })
    .filter((x): x is any => !!x);

  if (normItems.length === 0)
    return <div className="plan-empty">沒有包含日期的計畫項目可顯示甘特圖</div>;

  const getMonday = (d: Date): Date => {
    const copy = new Date(d);
    const day = copy.getDay();
    copy.setDate(copy.getDate() - (day === 0 ? 6 : day - 1));
    copy.setHours(0, 0, 0, 0);
    return copy;
  };

  const minTs = Math.min(...normItems.map((i) => i.jsStart.getTime()));
  const maxTs = Math.max(...normItems.map((i) => i.jsEnd.getTime()));
  const startWeek = getMonday(new Date(minTs));
  const endWeek = getMonday(new Date(maxTs));

  const weeks: Date[] = [];
  const cur = new Date(startWeek);
  while (cur <= endWeek) {
    weeks.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }

  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

  return (
    <div className="plan-gantt-weekly">
      <div className="gantt-weekly-scroll">
        <table className="gantt-weekly-table">
          <thead>
            <tr>
              <th className="gantt-head-label">計畫項目</th>
              {weeks.map((w, i) => (
                <th key={i} className="gantt-head-week">
                  {fmt(w)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {normItems.map((item) => (
              <tr key={item.id}>
                <td
                  className="gantt-item-label"
                  title={`${item.planTitle}: ${item.description}`}
                >
                  <span
                    className={`gantt-item-dot${item.completed ? " done" : ""}`}
                  />
                  {item.description.length > 18
                    ? item.description.substring(0, 18) + "\u2026"
                    : item.description}
                </td>
                {weeks.map((w, wi) => {
                  const weekEnd = new Date(w);
                  weekEnd.setDate(weekEnd.getDate() + 6);
                  const overlap = item.jsStart <= weekEnd && item.jsEnd >= w;
                  return (
                    <td
                      key={wi}
                      className={`gantt-week-cell${overlap ? (item.completed ? " done" : " active") : ""}`}
                      title={
                        overlap
                          ? `${item.startDate ?? item.date}${item.endDate ? " - " + item.endDate : ""} ${item.description}`
                          : undefined
                      }
                    >
                      {overlap && <span className="gantt-week-dot" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Detail Panel ──────────────────────────────────────────────────────────────

export default function DetailPanel({
  strategy,
  period,
  onClose,
  onUpdate,
  onDelete,
}: Props) {
  const year = period
    ? parseInt(period.match(/\d{4}/)?.[0] ?? "") || new Date().getFullYear()
    : new Date().getFullYear();
  const [tab, setTab] = useState<"measure" | "plans" | "notes">("measure");
  const [planView, setPlanView] = useState<"list" | "calendar" | "gantt">(
    "list",
  );
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem("ogsm_panel_width");
    return saved ? parseInt(saved, 10) : 800;
  });

  useEffect(() => {
    localStorage.setItem("ogsm_panel_width", panelWidth.toString());
  }, [panelWidth]);

  // Auto-sync cross-quarter plan items on load
  useEffect(() => {
    let synced = [...strategy.actionPlans];
    let changed = false;
    for (const ap of strategy.actionPlans) {
      for (const item of ap.items) {
        const quarters = getSpannedQuarters(
          item.startDate ?? item.date,
          item.endDate,
        );
        if (quarters.length > 1) {
          const before = JSON.stringify(synced);
          synced = syncItemAcrossQuarters(synced, item, ap.quarter);
          if (JSON.stringify(synced) !== before) changed = true;
        }
      }
    }
    if (changed) {
      onUpdate({ ...strategy, actionPlans: synced });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy.id]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = panelWidth;
      const onMouseMove = (moveEvent: MouseEvent) => {
        // Panel is on right edge, deltaX < 0 means drag left -> width increases
        const newWidth = Math.max(
          400,
          Math.min(1200, startWidth - (moveEvent.clientX - startX)),
        );
        setPanelWidth(newWidth);
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [panelWidth],
  );

  const effectiveRate = strategy.manualRate ?? strategy.completionRate;
  const effectColor =
    effectiveRate >= 100
      ? "#10b981"
      : effectiveRate >= 70
        ? "#6366f1"
        : effectiveRate >= 40
          ? "#f59e0b"
          : effectiveRate > 0
            ? "#ef4444"
            : "#6b7280";

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

  // Plan helpers (plans are managed via Measures and fixed quarters)

  const quarters = ["Q1", "Q2", "Q3", "Q4"];
  const preferred =
    strategy.actionPlans[0]?.quarter ?? strategy.measures[0]?.quarter;
  const [selectedQuarter, setSelectedQuarter] = useState<string>(
    preferred && quarters.includes(preferred) ? preferred : "Q1",
  );

  // Drag & drop for measures (move or copy)
  const onMeasureDragStart = (e: React.DragEvent, msrId: string) => {
    const copy = e.ctrlKey || e.metaKey; // Ctrl/Cmd to copy
    e.dataTransfer.setData(
      "application/ogsm-measure",
      `${msrId}|${copy ? "copy" : "move"}`,
    );
    e.dataTransfer.effectAllowed = copy ? "copy" : "move";
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

  const addChecklistItemToMeasure = (msrId: string) => {
    // ensure there's an actionPlan for selectedQuarter
    let ap = strategy.actionPlans.find((p) => p.quarter === selectedQuarter);
    if (!ap) {
      ap = {
        id: genId("plan"),
        quarter: selectedQuarter,
        title: selectedQuarter + " 計畫",
        items: [],
      };
    }
    const newItem: PlanItem = {
      id: genId("item"),
      date: "",
      description: "",
      owner: "",
      completed: false,
      linkedMeasureId: msrId,
    };
    const newActionPlans = strategy.actionPlans
      .filter((p) => p.quarter !== selectedQuarter)
      .concat({ ...ap, items: [...(ap.items || []), newItem] });
    onUpdate({ ...strategy, actionPlans: newActionPlans });
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
  const addMeasure = (quarter?: string) => {
    const nm: Measure = {
      id: genId("msr"),
      rawText: "新活動",
      kpis: [],
      quarter: quarter ?? selectedQuarter,
    };
    onUpdate({ ...strategy, measures: [...strategy.measures, nm] });
  };

  const deleteMeasure = (msrId: string) => {
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

  const addKpiToMeasure = (msrId: string) => {
    const newKpi: KPI = {
      id: genId("kpi"),
      label: "新 KPI",
      target: null,
      actual: null,
      unit: "%",
      achievementRate: null,
    };
    onUpdate({
      ...strategy,
      measures: strategy.measures.map((m) =>
        m.id === msrId ? { ...m, kpis: [...m.kpis, newKpi] } : m,
      ),
    });
  };

  const [measureCollapsed, setMeasureCollapsed] = useState<
    Record<string, boolean>
  >({});

  const allKpis = strategy.measures.flatMap((m) =>
    m.kpis.map((k) => ({ ...k, msrId: m.id })),
  );
  // removed legacy helpers allMeasures/q1/q2 as quarters are dynamic and plans are measure-driven
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
            : "#6b7280";

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
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <button
              className="detail-del-btn"
              onClick={onDelete}
              title="刪除策略"
            >
              🗑 刪除
            </button>
            <button className="detail-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="detail-meta">
          <InlineEdit
            value={strategy.owner}
            onSave={(v) => onUpdate({ ...strategy, owner: v })}
            className="owner-chip owner-edit"
            placeholder="負責人"
          />
        </div>

        {/* 進度 + 成效 雙指標 */}
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
          <div className="dual-rate-divider" />
          <div className="dual-rate-item" style={{ flex: "1.5 1 0" }}>
            <span className="dual-rate-num" style={{ color: effectColor }}>
              {effectiveRate > 0 ? `${Math.round(effectiveRate)}%` : "—"}
            </span>
            <div className="dual-rate-meta">
              <span className="dual-rate-badge effect-badge">🎯 成效</span>
              <span className="dual-rate-sub">
                {strategy.manualRate !== null ? "手動設定" : "KPI 均值"}
              </span>
            </div>
            <div className="detail-rate-input-wrap">
              <input
                className="rate-input"
                type="number"
                min={0}
                max={200}
                placeholder="覆寫成效 %…"
                defaultValue={strategy.manualRate ?? ""}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  onUpdate({
                    ...strategy,
                    manualRate: isNaN(v) ? null : v,
                    status: isNaN(v) ? strategy.status : computeStatus(v),
                  });
                }}
              />
              {strategy.manualRate !== null && (
                <button
                  className="rate-reset"
                  onClick={() => onUpdate({ ...strategy, manualRate: null })}
                >
                  重置
                </button>
              )}
            </div>
          </div>
        </div>
        <div className="dual-rate-bars">
          <div className="dual-bar-row">
            <span className="dual-bar-label">進度</span>
            <div className="detail-progress-bar-bg" style={{ flex: 1 }}>
              <div
                className="detail-progress-bar-fill"
                style={{
                  width: `${Math.min(progressRate, 100)}%`,
                  background: progressColor,
                }}
              />
            </div>
          </div>
          <div className="dual-bar-row">
            <span className="dual-bar-label">成效</span>
            <div className="detail-progress-bar-bg" style={{ flex: 1 }}>
              <div
                className="detail-progress-bar-fill"
                style={{
                  width: `${Math.min(effectiveRate, 100)}%`,
                  background: effectColor,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="detail-tabs">
        <button
          className={`detail-tab ${tab === "measure" ? "active" : ""}`}
          onClick={() => setTab("measure")}
        >
          📊 成效指標 {allKpis.length > 0 ? `(${allKpis.length})` : ""}
        </button>
        <button
          className={`detail-tab ${tab === "plans" ? "active" : ""}`}
          onClick={() => setTab("plans")}
        >
          📅 行動計畫 {totalItems > 0 ? `${doneItems}/${totalItems}` : ""}
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
                活動/專案（可新增/刪除/摺疊），每個活動可含多個
                KPI。活動以季度為單位管理。
              </span>
              {strategy.measures.length > 0 && (
                <span className="msec-rate" style={{ color: effectColor }}>
                  {Math.round(effectiveRate)}%
                </span>
              )}
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
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <input
                  placeholder="搜尋活動或項目…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{ padding: "6px 8px", borderRadius: 6 }}
                />
              </div>
            </div>

            <div
              className="measure-list"
              onDragOver={onMeasureDragOver}
              onDrop={(e) => onMeasureDrop(e, selectedQuarter)}
            >
              {strategy.measures
                .filter((m) => {
                  // Show measure if it belongs to this quarter
                  if ((m.quarter ?? selectedQuarter) === selectedQuarter)
                    return true;
                  // Also show if it has plan items synced into this quarter
                  const hasItems = strategy.actionPlans
                    .filter((p) => p.quarter === selectedQuarter)
                    .flatMap((p) => p.items)
                    .some((i) => i.linkedMeasureId === m.id);
                  return hasItems;
                })
                .map((m) => {
                  const collapsed = !!measureCollapsed[m.id];
                  const isSyncedMeasure =
                    (m.quarter ?? selectedQuarter) !== selectedQuarter;
                  return (
                    <div
                      key={m.id}
                      className={`measure-block${isSyncedMeasure ? " synced-readonly" : ""}`}
                      draggable={!isSyncedMeasure}
                      onDragStart={
                        isSyncedMeasure
                          ? undefined
                          : (e) => onMeasureDragStart(e, m.id)
                      }
                      style={{ marginBottom: 12 }}
                    >
                      <div
                        className="plan-section-header"
                        style={{ alignItems: "center" }}
                      >
                        {isSyncedMeasure ? (
                          <span
                            className="synced-badge"
                            title={`來源: ${m.quarter}`}
                          >
                            ↩ {m.quarter}
                          </span>
                        ) : (
                          <span
                            className="measure-drag-handle"
                            title="拖曳移動到其他季度（按住 Ctrl 為複製）"
                          >
                            ⠿
                          </span>
                        )}
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
                          onSave={
                            isSyncedMeasure
                              ? () => {}
                              : (v) =>
                                  onUpdate({
                                    ...strategy,
                                    measures: strategy.measures.map((ms) =>
                                      ms.id === m.id
                                        ? { ...ms, rawText: v }
                                        : ms,
                                    ),
                                  })
                          }
                          className="plan-title-edit"
                          placeholder="活動名稱/專案名稱"
                        />
                        {!isSyncedMeasure && (
                          <>
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
                            <label className="measure-date-label">
                              最後更新
                              <input
                                type="date"
                                className="measure-date-input"
                                value={m.updatedAt ?? ""}
                                title="最後更新日期"
                                onChange={(e) =>
                                  onUpdate({
                                    ...strategy,
                                    measures: strategy.measures.map((ms) =>
                                      ms.id === m.id
                                        ? { ...ms, updatedAt: e.target.value }
                                        : ms,
                                    ),
                                  })
                                }
                              />
                            </label>
                            <select
                              className="measure-status-select"
                              value={m.status ?? "not-started"}
                              onChange={(e) =>
                                onUpdate({
                                  ...strategy,
                                  measures: strategy.measures.map((ms) =>
                                    ms.id === m.id
                                      ? { ...ms, status: e.target.value }
                                      : ms,
                                  ),
                                })
                              }
                            >
                              <option value="not-started">未開始</option>
                              <option value="in-progress">進行中</option>
                              <option value="completed">已完成</option>
                            </select>
                          </>
                        )}
                        <div
                          style={{
                            marginLeft: "auto",
                            display: "flex",
                            gap: 8,
                          }}
                        >
                          {!isSyncedMeasure && (
                            <>
                              <button
                                className="detail-add-btn"
                                onClick={() => copyMeasure(m.id)}
                                title="複製此活動"
                                style={{ padding: "6px 10px" }}
                              >
                                📋 複製
                              </button>
                              <button
                                className="detail-add-btn"
                                onClick={() => addKpiToMeasure(m.id)}
                                style={{ padding: "6px 10px" }}
                              >
                                + 新增 KPI
                              </button>
                              <button
                                className="plan-del-btn"
                                onClick={() => deleteMeasure(m.id)}
                                title="刪除活動"
                              >
                                ✕
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {!collapsed && (
                        <div style={{ padding: "8px 6px" }}>
                          <div className="kpi-list">
                            {m.kpis.map((k) => {
                              const linkedItems = strategy.actionPlans
                                .flatMap((p) => p.items)
                                .filter((i) => i.linkedMeasureId === m.id);
                              const linkedTotal = linkedItems.length;
                              const linkedDone = linkedItems.filter(
                                (i) => i.completed,
                              ).length;
                              const displayRate =
                                k.achievementRate === null && linkedTotal > 0
                                  ? Math.round((linkedDone / linkedTotal) * 100)
                                  : null;
                              return (
                                <KpiCard
                                  key={k.id}
                                  kpi={k}
                                  displayRate={displayRate}
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

            {/* 進度 */}
            <div className="msec-header" style={{ marginTop: 20 }}>
              <span className="msec-badge msec-progress">進度</span>
              <span className="msec-desc">行動計畫勾選自動計算</span>
              <span className="msec-rate" style={{ color: progressColor }}>
                {totalItems > 0 ? `${progressRate}%` : "—"}
              </span>
            </div>
            {totalItems > 0 ? (
              <div className="msec-progress-body">
                <div className="detail-progress-bar-bg">
                  <div
                    className="detail-progress-bar-fill"
                    style={{
                      width: `${Math.min(progressRate, 100)}%`,
                      background: progressColor,
                    }}
                  />
                </div>
                <span className="msec-progress-stat">
                  {doneItems} / {totalItems} 項已完成
                </span>
              </div>
            ) : (
              <div className="plan-empty" style={{ paddingLeft: 0 }}>
                尚未建立行動計畫項目
              </div>
            )}
          </div>
        )}

        {tab === "plans" && (
          <div className="plans-tab-content">
            <div className="plan-view-toggle">
              <button
                className={`view-btn ${planView === "list" ? "active" : ""}`}
                onClick={() => setPlanView("list")}
              >
                ☑ 清單
              </button>
              <button
                className={`view-btn ${planView === "calendar" ? "active" : ""}`}
                onClick={() => setPlanView("calendar")}
              >
                📅 月曆
              </button>
              <button
                className={`view-btn ${planView === "gantt" ? "active" : ""}`}
                onClick={() => setPlanView("gantt")}
              >
                📊 甘特圖
              </button>
            </div>

            {planView === "list" && (
              <div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 8,
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
                </div>

                {/* For the selected quarter, show each Measure's checklist items (derived, cannot add plan blocks) */}
                {strategy.measures
                  .filter((m) => {
                    // Show measure if it belongs to this quarter
                    if ((m.quarter ?? selectedQuarter) === selectedQuarter)
                      return true;
                    // Also show measure if it has synced plan items in this quarter
                    const hasItems = strategy.actionPlans
                      .filter((p) => p.quarter === selectedQuarter)
                      .flatMap((p) => p.items)
                      .some((i) => i.linkedMeasureId === m.id);
                    return hasItems;
                  })
                  .map((m) => {
                    const itemsForMeasure = strategy.actionPlans
                      .filter((p) => p.quarter === selectedQuarter)
                      .flatMap((p) => p.items)
                      .filter((i) => i.linkedMeasureId === m.id);
                    const isSyncedSection =
                      (m.quarter ?? selectedQuarter) !== selectedQuarter;
                    return (
                      <div
                        key={m.id}
                        className="plan-section"
                        style={{ marginBottom: 12 }}
                      >
                        <div className="plan-section-header">
                          {isSyncedSection && (
                            <span
                              className="synced-badge"
                              title={`來源: ${m.quarter}`}
                            >
                              ↩ {m.quarter}
                            </span>
                          )}
                          <span className="plan-badge">
                            {m.rawText || "活動"}
                          </span>
                          <InlineEdit
                            value={m.rawText || ""}
                            onSave={
                              isSyncedSection
                                ? () => {}
                                : (v) =>
                                    onUpdate({
                                      ...strategy,
                                      measures: strategy.measures.map((ms) =>
                                        ms.id === m.id
                                          ? { ...ms, rawText: v }
                                          : ms,
                                      ),
                                    })
                            }
                            className="plan-title-edit"
                          />
                          <span className="plan-progress">
                            {
                              itemsForMeasure.filter((it) => it.completed)
                                .length
                            }
                            /{itemsForMeasure.length}
                          </span>
                        </div>
                        <div className="plan-items">
                          {itemsForMeasure.map((item) => {
                            const itemSource = getItemSourceQuarter(item);
                            const isItemSynced =
                              itemSource !== null &&
                              itemSource !== selectedQuarter;
                            return (
                              <div
                                key={item.id}
                                className={`plan-item ${item.completed ? "done" : ""}${isItemSynced ? " synced-readonly" : ""}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={item.completed}
                                  disabled={isItemSynced}
                                  onChange={() => {
                                    const newActionPlans =
                                      strategy.actionPlans.map((p) => ({
                                        ...p,
                                        items: p.items.map((it) =>
                                          it.id === item.id
                                            ? {
                                                ...it,
                                                completed: !it.completed,
                                              }
                                            : it,
                                        ),
                                      }));
                                    onUpdate({
                                      ...strategy,
                                      actionPlans: newActionPlans,
                                    });
                                  }}
                                />
                                {isItemSynced && (
                                  <span
                                    className="synced-badge synced-badge-sm"
                                    title={`來源: ${itemSource}`}
                                  >
                                    ↩ {itemSource}
                                  </span>
                                )}
                                <input
                                  type="date"
                                  className="plan-date-input"
                                  value={toIsoDate(
                                    item.startDate ?? item.date,
                                    year,
                                  )}
                                  title="起始日期"
                                  readOnly={isItemSynced}
                                  onChange={
                                    isItemSynced
                                      ? undefined
                                      : (e) => {
                                          const v = e.target.value;
                                          const updatedItem = {
                                            ...item,
                                            startDate: v,
                                            date: v,
                                          };
                                          let newActionPlans =
                                            strategy.actionPlans.map((p) => ({
                                              ...p,
                                              items: p.items.map((it) =>
                                                it.id === item.id
                                                  ? {
                                                      ...it,
                                                      startDate: v,
                                                      date: v,
                                                    }
                                                  : it,
                                              ),
                                            }));
                                          newActionPlans =
                                            syncItemAcrossQuarters(
                                              newActionPlans,
                                              {
                                                ...updatedItem,
                                                endDate: item.endDate,
                                              },
                                              selectedQuarter,
                                            );
                                          onUpdate({
                                            ...strategy,
                                            actionPlans: newActionPlans,
                                          });
                                        }
                                  }
                                />
                                <input
                                  type="date"
                                  className="plan-date-input"
                                  value={toIsoDate(item.endDate, year)}
                                  title="結束日期"
                                  readOnly={isItemSynced}
                                  onChange={
                                    isItemSynced
                                      ? undefined
                                      : (e) => {
                                          const v = e.target.value;
                                          const updatedItem = {
                                            ...item,
                                            endDate: v,
                                          };
                                          let newActionPlans =
                                            strategy.actionPlans.map((p) => ({
                                              ...p,
                                              items: p.items.map((it) =>
                                                it.id === item.id
                                                  ? { ...it, endDate: v }
                                                  : it,
                                              ),
                                            }));
                                          newActionPlans =
                                            syncItemAcrossQuarters(
                                              newActionPlans,
                                              updatedItem,
                                              selectedQuarter,
                                            );
                                          onUpdate({
                                            ...strategy,
                                            actionPlans: newActionPlans,
                                          });
                                        }
                                  }
                                />
                                <input
                                  className="plan-desc-input"
                                  value={item.description}
                                  placeholder="新項目"
                                  readOnly={isItemSynced}
                                  onChange={
                                    isItemSynced
                                      ? undefined
                                      : (e) => {
                                          const newActionPlans =
                                            strategy.actionPlans.map((p) => ({
                                              ...p,
                                              items: p.items.map((it) =>
                                                it.id === item.id
                                                  ? {
                                                      ...it,
                                                      description:
                                                        e.target.value,
                                                    }
                                                  : it,
                                              ),
                                            }));
                                          onUpdate({
                                            ...strategy,
                                            actionPlans: newActionPlans,
                                          });
                                        }
                                  }
                                />

                                {!isItemSynced && (
                                  <button
                                    className="plan-item-del"
                                    onClick={() => {
                                      const newActionPlans =
                                        strategy.actionPlans.map((p) => ({
                                          ...p,
                                          items: p.items.filter(
                                            (it) => it.id !== item.id,
                                          ),
                                        }));
                                      onUpdate({
                                        ...strategy,
                                        actionPlans: newActionPlans,
                                      });
                                    }}
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            );
                          })}
                          <button
                            className="plan-add-item"
                            onClick={() => addChecklistItemToMeasure(m.id)}
                          >
                            + 新增項目
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            {planView === "calendar" && (
              <PlanCalendarView plans={strategy.actionPlans} year={year} />
            )}
            {planView === "gantt" && (
              <PlanGanttView plans={strategy.actionPlans} year={year} />
            )}
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
