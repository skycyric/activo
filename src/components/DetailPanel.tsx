import React, { useState, useEffect, useCallback, useRef } from "react";
import type {
  Strategy,
  KPI,
  Measure,
  Team,
  TeamMember,
  ActionPlan,
  PlanItem,
} from "../types/ogsm";
import { genId } from "../utils/csvParser";

interface Props {
  strategy: Strategy;
  period: string | null;
  onClose: () => void;
  onUpdate: (s: Strategy) => void;
  onDelete: () => void;
  teams: Team[];
  allMembers: TeamMember[];
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
  const hasActual = kpi.actual !== null && kpi.actual !== undefined;
  const rawRate = hasActual ? kpi.achievementRate : null;
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
        {typeof linkedTotal !== "undefined" && linkedTotal > 0 && (
          <div style={{ fontSize: 10, color: "var(--text)", marginBottom: 6 }}>
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
 * Convert date string to ISO format YYYY-MM-DD
 */
function toIsoDate(s: string | undefined, year: number): string {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (m) return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return "";
}

/**
 * Check if a plan item's date range overlaps with a given quarter
 */
function doesItemOverlapQuarter(item: PlanItem, quarter: string): boolean {
  const start = item.startDate ?? item.date;
  if (!start) return false;
  const s = parseMonthDay(start);
  if (!s) return false;
  const e = item.endDate ? parseMonthDay(item.endDate) : null;
  const endMonth = e ? e.month : s.month;
  const qMonths: Record<string, [number, number]> = {
    Q1: [1, 3],
    Q2: [4, 6],
    Q3: [7, 9],
    Q4: [10, 12],
  };
  const [qStart, qEnd] = qMonths[quarter] ?? [1, 3];
  return s.month <= qEnd && endMonth >= qStart;
}

/**
 * Parse ActionPlan from q1Text/q2Text
 */
function parseActionPlans(q1Text: string, q2Text: string): ActionPlan[] {
  const plans: ActionPlan[] = [];

  function parseQ(text: string, quarter: "Q1" | "Q2") {
    if (!text.trim()) return;
    const sectionRe = /【([^】]+)】/g;
    const sections: Array<{ title: string; start: number }> = [];
    let m;
    while ((m = sectionRe.exec(text)) !== null) {
      sections.push({ title: m[1], start: m.index + m[0].length });
    }

    if (sections.length === 0) {
      plans.push({
        id: genId("plan"),
        quarter,
        title: `${quarter} 行動計畫`,
        items: parseItems(text),
      });
      return;
    }

    for (let i = 0; i < sections.length; i++) {
      const content = text.substring(
        sections[i].start,
        i + 1 < sections.length
          ? sections[i + 1].start - sections[i + 1].title.length - 2
          : text.length,
      );
      plans.push({
        id: genId("plan"),
        quarter,
        title: sections[i].title,
        items: parseItems(content),
      });
    }
  }

  function parseItems(text: string): PlanItem[] {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        // Try date range first: M/D-M/D or M/D~M/D
        const rangeMatch = line.match(
          /^(\d{1,2}\/\d{1,2})\s*[-~]\s*(\d{1,2}\/\d{1,2})/,
        );
        if (rangeMatch) {
          const description = line.substring(rangeMatch[0].length).trim();
          const completed = /完成|結案|啟動/.test(description);
          return {
            id: genId("item"),
            startDate: rangeMatch[1],
            endDate: rangeMatch[2],
            description,
            completed,
          };
        }
        const dateMatch = line.match(/^(\d+\/\d+(?:\/\d+)?)/);
        const date = dateMatch ? dateMatch[1] : "";
        const description = dateMatch
          ? line.substring(dateMatch[0].length).trim()
          : line;
        const completed =
          /完成|結案|啟動/.test(description) && /^\d+\/\d+/.test(line);
        return { id: genId("item"), date, description, completed };
      });
  }

  parseQ(q1Text, "Q1");
  parseQ(q2Text, "Q2");
  return plans;
}

// ─── Detail Panel ──────────────────────────────────────────────────────────────

export default function DetailPanel({
  strategy,
  period: _period,
  onClose,
  onUpdate,
  onDelete,
  teams,
  allMembers,
}: Props) {
  const year = _period
    ? parseInt(_period.match(/\d{4}/)?.[0] ?? "") || new Date().getFullYear()
    : new Date().getFullYear();
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

  // Initialize actionPlans from q1Text/q2Text if not already present
  useEffect(() => {
    if (
      strategy.actionPlans.length === 0 &&
      (strategy.q1Text || strategy.q2Text)
    ) {
      const generated = parseActionPlans(strategy.q1Text, strategy.q2Text);
      if (generated.length > 0) {
        onUpdate({ ...strategy, actionPlans: generated });
      }
    }
  }, [strategy.q1Text, strategy.q2Text]);

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
      date: "",
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

  function planItemMatchesFilter(item: PlanItem): boolean {
    const q = searchQuery.trim().toLowerCase();
    const ownerOk =
      filterOwner === "all" || (item.owner ?? "").includes(filterOwner);
    const textOk =
      !q ||
      item.description.toLowerCase().includes(q) ||
      (item.owner ?? "").toLowerCase().includes(q);
    return ownerOk && textOk;
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
  const ownersList =
    strategy.owners ?? (strategy.owner ? [strategy.owner] : []);
  const setOwners = (names: string[]) =>
    onUpdate({ ...strategy, owners: names, owner: names[0] ?? "" });
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

  const defaultCollapsed = () => {
    const map: Record<string, boolean> = {};
    strategy.measures.forEach((m) => {
      map[m.id] = true;
    });
    return map;
  };
  const [measureCollapsed, setMeasureCollapsed] =
    useState<Record<string, boolean>>(defaultCollapsed);

  const allKpis = strategy.measures.flatMap((m) =>
    m.kpis.map((k) => ({ ...k, msrId: m.id })),
  );
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
              value={strategy.owner}
              onSave={(v) =>
                onUpdate({ ...strategy, owner: v, owners: v ? [v] : [] })
              }
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
          📊 成效指標 {allKpis.length > 0 ? `(${allKpis.length})` : ""}
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
                  const isFromOtherQuarter =
                    (m.quarter ?? selectedQuarter) !== selectedQuarter;
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
                        {isFromOtherQuarter ? (
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
                            draggable
                            onDragStart={(e) => onMeasureDragStart(e, m.id)}
                            onDragEnd={onMeasureDragEnd}
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
                          style={{
                            color:
                              (m.status ?? "not-started") === "completed"
                                ? "#059669"
                                : (m.status ?? "not-started") === "in-progress"
                                  ? "#2563eb"
                                  : "#6b7280",
                            borderColor:
                              (m.status ?? "not-started") === "completed"
                                ? "#a7f3d0"
                                : (m.status ?? "not-started") === "in-progress"
                                  ? "#bfdbfe"
                                  : "#d1d5db",
                            background:
                              (m.status ?? "not-started") === "completed"
                                ? "#ecfdf5"
                                : (m.status ?? "not-started") === "in-progress"
                                  ? "#eff6ff"
                                  : "#f9fafb",
                          }}
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

            {/* For the selected quarter, show each Measure's checklist items */}
            {strategy.measures
              .filter((m) => {
                // Hide if doesn't match search filter
                if (hasActiveFilter && !measureMatchesFilter(m)) return false;
                // Show measure if it belongs to this quarter
                if ((m.quarter ?? selectedQuarter) === selectedQuarter)
                  return true;
                // Also show measure if it has linked items whose dates overlap this quarter
                const hasOverlap = strategy.actionPlans
                  .flatMap((p) => p.items)
                  .some(
                    (i) =>
                      i.linkedMeasureId === m.id &&
                      doesItemOverlapQuarter(i, selectedQuarter),
                  );
                return hasOverlap;
              })
              .map((m) => {
                const itemsForMeasure = strategy.actionPlans
                  .flatMap((p) => p.items)
                  .filter((i) => i.linkedMeasureId === m.id)
                  .filter((i) => {
                    // Item belongs to this quarter's ActionPlan, or its dates overlap
                    const inQuarterPlan = strategy.actionPlans
                      .filter((p) => p.quarter === selectedQuarter)
                      .flatMap((p) => p.items)
                      .some((pi) => pi.id === i.id);
                    return (
                      inQuarterPlan ||
                      doesItemOverlapQuarter(i, selectedQuarter)
                    );
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
                        {dedupItems.map((item) => {
                          // Find which quarter's ActionPlan this item lives in
                          const itemSourceQuarter = strategy.actionPlans.find(
                            (p) => p.items.some((pi) => pi.id === item.id),
                          )?.quarter;
                          const isFromOtherQ =
                            itemSourceQuarter !== selectedQuarter;
                          return (
                            <div
                              key={item.id}
                              className={`plan-item ${item.completed ? "done" : ""}`}
                            >
                              <input
                                type="checkbox"
                                checked={item.completed}
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
                              {isFromOtherQ && itemSourceQuarter && (
                                <span
                                  className="synced-badge synced-badge-sm"
                                  title={`來源: ${itemSourceQuarter}`}
                                >
                                  ↩ {itemSourceQuarter}
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
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const newActionPlans =
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
                                  onUpdate({
                                    ...strategy,
                                    actionPlans: newActionPlans,
                                  });
                                }}
                              />
                              <input
                                type="date"
                                className="plan-date-input"
                                value={toIsoDate(item.endDate, year)}
                                title="結束日期"
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const newActionPlans =
                                    strategy.actionPlans.map((p) => ({
                                      ...p,
                                      items: p.items.map((it) =>
                                        it.id === item.id
                                          ? { ...it, endDate: v }
                                          : it,
                                      ),
                                    }));
                                  onUpdate({
                                    ...strategy,
                                    actionPlans: newActionPlans,
                                  });
                                }}
                              />
                              <input
                                className="plan-desc-input"
                                value={item.description}
                                placeholder="新項目"
                                onChange={(e) => {
                                  const newActionPlans =
                                    strategy.actionPlans.map((p) => ({
                                      ...p,
                                      items: p.items.map((it) =>
                                        it.id === item.id
                                          ? {
                                              ...it,
                                              description: e.target.value,
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
                              <input
                                className="plan-notes-input"
                                value={item.notes ?? ""}
                                placeholder="備註"
                                onChange={(e) => {
                                  const newActionPlans =
                                    strategy.actionPlans.map((p) => ({
                                      ...p,
                                      items: p.items.map((it) =>
                                        it.id === item.id
                                          ? { ...it, notes: e.target.value }
                                          : it,
                                      ),
                                    }));
                                  onUpdate({
                                    ...strategy,
                                    actionPlans: newActionPlans,
                                  });
                                }}
                              />

                              <button
                                className="plan-item-del"
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `確定要刪除「${item.description || "此項目"}」嗎？`,
                                    )
                                  )
                                    return;
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
                      {dedupUnlinked.map((item) => (
                        <div
                          key={item.id}
                          className={`plan-item ${item.completed ? "done" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() => {
                              const newActionPlans = strategy.actionPlans.map(
                                (p) => ({
                                  ...p,
                                  items: p.items.map((it) =>
                                    it.id === item.id
                                      ? { ...it, completed: !it.completed }
                                      : it,
                                  ),
                                }),
                              );
                              onUpdate({
                                ...strategy,
                                actionPlans: newActionPlans,
                              });
                            }}
                          />
                          <input
                            type="date"
                            className="plan-date-input"
                            value={toIsoDate(item.startDate ?? item.date, year)}
                            title="起始日期"
                            onChange={(e) => {
                              const v = e.target.value;
                              const newActionPlans = strategy.actionPlans.map(
                                (p) => ({
                                  ...p,
                                  items: p.items.map((it) =>
                                    it.id === item.id
                                      ? { ...it, startDate: v, date: v }
                                      : it,
                                  ),
                                }),
                              );
                              onUpdate({
                                ...strategy,
                                actionPlans: newActionPlans,
                              });
                            }}
                          />
                          <input
                            type="date"
                            className="plan-date-input"
                            value={toIsoDate(item.endDate, year)}
                            title="結束日期"
                            onChange={(e) => {
                              const v = e.target.value;
                              const newActionPlans = strategy.actionPlans.map(
                                (p) => ({
                                  ...p,
                                  items: p.items.map((it) =>
                                    it.id === item.id
                                      ? { ...it, endDate: v }
                                      : it,
                                  ),
                                }),
                              );
                              onUpdate({
                                ...strategy,
                                actionPlans: newActionPlans,
                              });
                            }}
                          />
                          <input
                            className="plan-desc-input"
                            value={item.description}
                            placeholder="項目描述"
                            onChange={(e) => {
                              const newActionPlans = strategy.actionPlans.map(
                                (p) => ({
                                  ...p,
                                  items: p.items.map((it) =>
                                    it.id === item.id
                                      ? {
                                          ...it,
                                          description: e.target.value,
                                        }
                                      : it,
                                  ),
                                }),
                              );
                              onUpdate({
                                ...strategy,
                                actionPlans: newActionPlans,
                              });
                            }}
                          />
                          <input
                            className="plan-notes-input"
                            value={item.notes ?? ""}
                            placeholder="備註"
                            onChange={(e) => {
                              const newActionPlans = strategy.actionPlans.map(
                                (p) => ({
                                  ...p,
                                  items: p.items.map((it) =>
                                    it.id === item.id
                                      ? { ...it, notes: e.target.value }
                                      : it,
                                  ),
                                }),
                              );
                              onUpdate({
                                ...strategy,
                                actionPlans: newActionPlans,
                              });
                            }}
                          />
                          <button
                            className="plan-item-del"
                            onClick={() => {
                              if (
                                !window.confirm(
                                  `確定要刪除「${item.description || "此項目"}」嗎？`,
                                )
                              )
                                return;
                              const newActionPlans = strategy.actionPlans.map(
                                (p) => ({
                                  ...p,
                                  items: p.items.filter(
                                    (it) => it.id !== item.id,
                                  ),
                                }),
                              );
                              onUpdate({
                                ...strategy,
                                actionPlans: newActionPlans,
                              });
                            }}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
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
