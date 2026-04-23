/**
 * ActivityDetailPanel — 活動詳情側邊面板
 *
 * 取代 ActivityTable 的行內展開編輯，以獨立右側面板呈現完整活動資訊。
 * 4 個分頁：基本資料 / KPI 指標 / 行動計畫 / 備註
 */
import { useState, useEffect, useRef, useCallback } from "react";
import type {
  DeptActivity,
  WorkspaceData,
  KPI,
  ActivityPlanItem,
  AssistUnit,
  MeasureStatus,
} from "../schemas/ogsm";
import { genId } from "../utils/csvParser";
import {
  computeKpiAchievement,
  getKpiDisplayName,
  recomputeActivityKpis,
} from "../utils/kpiCalc";
import { countPlanWarnings, getPlanItemWarning } from "../utils/planWarnings";
import KpiConfigModal from "./activity/KpiConfigModal";
import AssistUnitPicker from "./activity/AssistUnitPicker";
import OwnerPicker from "./activity/OwnerPicker";
import { Tooltip } from "./ui/tooltip";

// ─── Constants ─────────────────────────────────────────────────────────────

const LS_WIDTH_KEY = "activo_activity_panel_width";
const DEFAULT_PANEL_WIDTH = 480;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 900;

const STATUS_OPTIONS: { value: MeasureStatus; label: string }[] = [
  { value: "not-started", label: "未開始" },
  { value: "attention", label: "注意" },
  { value: "in-progress", label: "進行中" },
  { value: "completed", label: "已完成" },
];

type Tab = "basic" | "kpi" | "plans" | "notes";

// ─── Helper ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | undefined) {
  return d ?? "";
}

function loadWidth(): number {
  try {
    const v = localStorage.getItem(LS_WIDTH_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n >= MIN_PANEL_WIDTH && n <= MAX_PANEL_WIDTH) return n;
    }
  } catch {
    // ignore
  }
  return DEFAULT_PANEL_WIDTH;
}

function saveWidth(w: number) {
  try {
    localStorage.setItem(LS_WIDTH_KEY, String(w));
  } catch {
    // ignore
  }
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  activity: DeptActivity;
  deptId: string;
  workspace: WorkspaceData;
  isReadOnly?: boolean;
  warnDaysBefore: number;
  /** 舊格式措施沒有 dashboardLinks，由 ActivityWithContext 傳入初始歸屬 */
  initialPeriodId?: string;
  initialGoalId?: string;
  initialStrategyId?: string;
  onUpdate: (deptId: string, activity: DeptActivity) => void;
  onDelete: (deptId: string, activityId: string) => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ActivityDetailPanel({
  activity,
  deptId,
  workspace,
  isReadOnly = false,
  warnDaysBefore,
  initialPeriodId,
  initialGoalId,
  initialStrategyId,
  onUpdate,
  onDelete,
  onClose,
  onDirtyChange,
}: Props) {
  // ── Local draft state ──────────────────────────────────────────────────────
  const [draft, setDraft] = useState<DeptActivity>(() => ({
    ...activity,
    kpis: activity.kpis ?? [],
    planItems: activity.planItems ?? [],
    warnDaysBefore: activity.warnDaysBefore ?? 3,
  }));
  const [tab, setTab] = useState<Tab>("basic");
  const [dirty, setDirty] = useState(false);
  const [statusManuallyChanged, setStatusManuallyChanged] = useState(false);

  // ── KPI Config Modal ───────────────────────────────────────────────────────
  const [configKpiId, setConfigKpiId] = useState<string | null>(null);
  const effectiveWarnDays = Math.max(
    0,
    Math.round(draft.warnDaysBefore ?? warnDaysBefore ?? 3),
  );

  // ── Panel width (draggable) ────────────────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState(loadWidth);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: panelWidth };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startX - ev.clientX;
        const newW = Math.min(
          MAX_PANEL_WIDTH,
          Math.max(MIN_PANEL_WIDTH, dragRef.current.startW + delta),
        );
        setPanelWidth(newW);
      };
      const onMouseUp = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startX - ev.clientX;
        const newW = Math.min(
          MAX_PANEL_WIDTH,
          Math.max(MIN_PANEL_WIDTH, dragRef.current.startW + delta),
        );
        saveWidth(newW);
        dragRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [panelWidth],
  );

  // ── Draft helpers ──────────────────────────────────────────────────────────
  const applyAutoAttention = (nextDraft: DeptActivity): DeptActivity => {
    if (statusManuallyChanged) return nextDraft;

    const nextWarnDays = Math.max(
      0,
      Math.round(nextDraft.warnDaysBefore ?? warnDaysBefore ?? 3),
    );
    const hasOverdue = (nextDraft.planItems ?? []).some(
      (item) => getPlanItemWarning(item, nextWarnDays) === "overdue",
    );
    if (!hasOverdue) return nextDraft;
    if (nextDraft.status === "attention") return nextDraft;
    if (nextDraft.status && nextDraft.status !== "not-started") {
      return nextDraft;
    }

    return { ...nextDraft, status: "attention" };
  };

  const patch = (partial: Partial<DeptActivity>) => {
    setDraft((d) => applyAutoAttention({ ...d, ...partial }));
    setDirty(true);
    onDirtyChange?.(true);
  };

  const handleSave = () => {
    const saved: DeptActivity = {
      ...draft,
      kpis: recomputeActivityKpis(draft.kpis ?? []),
      warnDaysBefore: effectiveWarnDays,
      updatedAt: new Date().toISOString(),
    };
    onUpdate(deptId, saved);
    setDirty(false);
    onDirtyChange?.(false);
  };

  const handleDelete = () => {
    if (!window.confirm(`確定要刪除活動「${draft.rawText}」？`)) return;
    onDelete(deptId, draft.id);
  };

  const handleRequestClose = () => {
    if (dirty && !window.confirm("有尚未儲存的修改，確定要關閉嗎？")) {
      return;
    }
    onDirtyChange?.(false);
    onClose();
  };

  // ── KPI helpers ────────────────────────────────────────────────────────────
  const patchKpi = (kpiId: string, changes: Partial<KPI>) => {
    patch({
      kpis: draft.kpis.map((k) => (k.id === kpiId ? { ...k, ...changes } : k)),
    });
  };

  const addKpi = () => {
    const newKpi: KPI = {
      id: genId(),
      label: "新 KPI",
      target: null,
      actual: null,
      unit: "",
      achievementRate: null,
      formulaType: "direct_rate",
    };
    patch({ kpis: [...draft.kpis, newKpi] });
  };

  const deleteKpi = (kpiId: string) => {
    patch({ kpis: draft.kpis.filter((k) => k.id !== kpiId) });
  };

  const handleKpiConfigSave = (updated: KPI) => {
    patchKpi(updated.id, updated);
    setConfigKpiId(null);
  };

  // ── PlanItems helpers ──────────────────────────────────────────────────────
  const planItems = draft.planItems ?? [];
  const overduePlanItems = planItems.filter(
    (item) => getPlanItemWarning(item, effectiveWarnDays) === "overdue",
  );

  const patchPlanItem = (
    itemId: string,
    changes: Partial<ActivityPlanItem>,
  ) => {
    patch({
      planItems: planItems.map((p) =>
        p.id === itemId ? { ...p, ...changes } : p,
      ),
    });
  };

  const addPlanItem = (quarter: string) => {
    const newItem: ActivityPlanItem = {
      id: genId(),
      description: "",
      quarter,
      completed: false,
      plannedEndDate: undefined,
      actualEndDate: undefined,
      dependsOnIds: [],
      linkedMeasureId: null,
    };
    patch({ planItems: [...planItems, newItem] });
  };

  const deletePlanItem = (itemId: string) => {
    patch({ planItems: planItems.filter((p) => p.id !== itemId) });
  };

  // Derive quarters from existing plan items; always include at least Q1-Q4
  const allQuarters = Array.from(
    new Set([
      "Q1",
      "Q2",
      "Q3",
      "Q4",
      ...planItems.map((p) => p.quarter ?? "Q1"),
    ]),
  ).sort();

  // ── Render ─────────────────────────────────────────────────────────────────
  const configKpi = configKpiId
    ? draft.kpis.find((k) => k.id === configKpiId)
    : null;

  return (
    <>
      {/* KPI Config Modal (portal-style, rendered at root level) */}
      {configKpi && (
        <KpiConfigModal
          kpi={configKpi}
          siblingKpis={draft.kpis.filter((k) => k.id !== configKpiId)}
          onSave={handleKpiConfigSave}
          onClose={() => setConfigKpiId(null)}
        />
      )}

      {/* Panel */}
      <div
        className="adp-panel"
        style={{ width: panelWidth }}
        data-tour="activity-detail-panel"
      >
        {/* Drag handle (left edge) */}
        <div
          className="adp-resize-handle"
          onMouseDown={handleResizeMouseDown}
          title="拖曳調整寬度"
        />

        {/* Header */}
        <div className="adp-header">
          <div className="adp-header-title" title={draft.rawText}>
            {draft.rawText || "（未命名活動）"}
          </div>
          <Tooltip content="關閉">
            <button
              className="adp-close-btn"
              onClick={handleRequestClose}
              title="關閉"
            >
              ×
            </button>
          </Tooltip>
        </div>

        {/* Tabs */}
        <div className="adp-tabs" data-tour="activity-detail-tabs">
          {(
            [
              { id: "basic", label: "基本資料" },
              {
                id: "kpi",
                label: `KPI 指標${draft.kpis.length > 0 ? ` (${draft.kpis.length})` : ""}`,
              },
              {
                id: "plans",
                label: `行動計畫${planItems.length > 0 ? ` (${planItems.length})` : ""}`,
              },
              { id: "notes", label: "備註" },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              className={`adp-tab${tab === t.id ? " adp-tab-active" : ""}`}
              onClick={() => setTab(t.id)}
              data-tour={
                t.id === "basic"
                  ? "activity-detail-tab-basic"
                  : t.id === "kpi"
                    ? "activity-detail-tab-kpi"
                    : t.id === "plans"
                      ? "activity-detail-tab-plans"
                      : "activity-detail-tab-notes"
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="adp-body">
          {tab === "basic" && (
            <div data-tour="activity-detail-basic">
              <BasicTab
                key={`${draft.id}:${initialPeriodId ?? ""}:${initialGoalId ?? ""}:${initialStrategyId ?? ""}`}
                draft={draft}
                workspace={workspace}
                isReadOnly={isReadOnly}
                deptId={deptId}
                patch={patch}
                onStatusChange={(status) => {
                  setStatusManuallyChanged(true);
                  patch({ status });
                }}
                overduePlanDescriptions={overduePlanItems.map(
                  (item) => item.description || "（未命名行動計畫）",
                )}
                initialPeriodId={initialPeriodId}
                initialGoalId={initialGoalId}
                initialStrategyId={initialStrategyId}
              />
            </div>
          )}
          {tab === "kpi" && (
            <div data-tour="activity-detail-kpi">
              <KpiTab
                kpis={draft.kpis}
                isReadOnly={isReadOnly}
                onPatchKpi={patchKpi}
                onAddKpi={addKpi}
                onDeleteKpi={deleteKpi}
                onOpenConfig={setConfigKpiId}
              />
            </div>
          )}
          {tab === "plans" && (
            <div data-tour="activity-detail-plans">
              <PlansTab
                planItems={planItems}
                quarters={allQuarters}
                warnDaysBefore={effectiveWarnDays}
                isReadOnly={isReadOnly}
                onUpdateWarnDays={(n) => patch({ warnDaysBefore: n })}
                onPatch={patchPlanItem}
                onAdd={addPlanItem}
                onDelete={deletePlanItem}
              />
            </div>
          )}
          {tab === "notes" && (
            <div data-tour="activity-detail-notes">
              <NotesTab
                notes={draft.notes ?? ""}
                isReadOnly={isReadOnly}
                onChange={(v) => patch({ notes: v })}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        {!isReadOnly && (
          <div className="adp-footer">
            <button className="adp-btn-delete" onClick={handleDelete}>
              刪除活動
            </button>
            <div className="adp-footer-right">
              {dirty && <span className="adp-dirty-indicator">● 未儲存</span>}
              <button
                className={`adp-btn-save${dirty ? " adp-btn-save-dirty" : ""}`}
                onClick={handleSave}
                disabled={!dirty}
              >
                儲存
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Tab: 基本資料 ─────────────────────────────────────────────────────────────

// 模組選項定義
const FRAMEWORK_OPTIONS: { value: string; label: string }[] = [
  { value: "ogsm", label: "OGSM目標體系" },
  { value: "standalone", label: "其他（自由節點）" },
];

function BasicTab({
  draft,
  workspace,
  isReadOnly,
  deptId,
  patch,
  onStatusChange,
  overduePlanDescriptions,
  initialPeriodId,
  initialGoalId,
  initialStrategyId,
}: {
  draft: DeptActivity;
  workspace: WorkspaceData;
  isReadOnly: boolean;
  deptId: string;
  patch: (p: Partial<DeptActivity>) => void;
  onStatusChange: (status: MeasureStatus | undefined) => void;
  overduePlanDescriptions: string[];
  initialPeriodId?: string;
  initialGoalId?: string;
  initialStrategyId?: string;
}) {
  const frameworks = draft.frameworks ?? [];
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropOpen) return;
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node))
        setDropOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [dropOpen]);

  const toggleFramework = (value: string) => {
    const next = frameworks.includes(value)
      ? frameworks.filter((f) => f !== value)
      : [...frameworks, value];
    patch({ frameworks: next.length > 0 ? next : undefined });
  };

  // OGSM 歸屬可編輯 state（多筆歸屬）
  const draftAny = draft as unknown as {
    periodId?: string;
    goalId?: string;
    strategyId?: string;
  };

  const ogsmLinks = (draft.dashboardLinks ?? []).filter(
    (l) => l.type === "ogsm",
  );

  const initialLinkForForm = ogsmLinks[0];
  const [selPeriodId, setSelPeriodId] = useState(
    initialLinkForForm?.periodId ?? draftAny.periodId ?? initialPeriodId ?? "",
  );
  const [selGoalId, setSelGoalId] = useState(
    initialLinkForForm?.goalId ?? draftAny.goalId ?? initialGoalId ?? "",
  );
  const [selStratId, setSelStratId] = useState(
    initialLinkForForm?.strategyId ??
      draftAny.strategyId ??
      initialStrategyId ??
      "",
  );

  // 目前部門的 periods
  const deptPeriods =
    workspace.departments.find((d) => d.id === deptId)?.periods ?? [];
  const selPeriod = deptPeriods.find((p) => p.id === selPeriodId);
  const goals = selPeriod?.ogsm.goals ?? [];
  const selGoal = goals.find((g) => g.id === selGoalId);
  const strategies = selGoal?.strategies ?? [];

  const addOgsmLink = () => {
    if (!selPeriodId || !selGoalId || !selStratId) return;
    const all = draft.dashboardLinks ?? [];
    const alreadyExists = all.some(
      (l) =>
        l.type === "ogsm" &&
        l.periodId === selPeriodId &&
        l.goalId === selGoalId &&
        l.strategyId === selStratId,
    );
    if (alreadyExists) return;

    patch({
      dashboardLinks: [
        ...all,
        {
          id: genId("dlink"),
          type: "ogsm",
          periodId: selPeriodId,
          goalId: selGoalId,
          strategyId: selStratId,
          exclude: false,
        },
      ],
      // 自動確保 frameworks 包含 ogsm
      frameworks: frameworks.includes("ogsm")
        ? frameworks
        : [...frameworks, "ogsm"],
    });

    setSelGoalId("");
    setSelStratId("");
  };

  const removeOgsmLink = (linkId: string) => {
    const next = (draft.dashboardLinks ?? []).filter((l) => l.id !== linkId);
    patch({ dashboardLinks: next.length > 0 ? next : undefined });
  };

  const selectedLabels =
    FRAMEWORK_OPTIONS.filter((o) => frameworks.includes(o.value))
      .map((o) => o.label)
      .join("、") || "（未選擇）";

  const overdueTooltip =
    overduePlanDescriptions.length > 0
      ? `逾期行動計畫：\n${overduePlanDescriptions
          .slice(0, 8)
          .map((desc, idx) => `${idx + 1}. ${desc}`)
          .join("\n")}${overduePlanDescriptions.length > 8 ? "\n..." : ""}`
      : undefined;

  return (
    <div className="adp-section-list">
      {/* 模組 */}
      <div className="adp-field">
        <label className="adp-field-label">模組</label>
        {isReadOnly ? (
          <span className="adp-value">
            {frameworks.length > 0
              ? FRAMEWORK_OPTIONS.filter((o) => frameworks.includes(o.value))
                  .map((o) => o.label)
                  .join("、")
              : "其他"}
          </span>
        ) : (
          <div className="adp-fw-dropdown" ref={dropRef}>
            <button
              type="button"
              className="adp-fw-trigger"
              onClick={() => setDropOpen((v) => !v)}
            >
              <span>{selectedLabels}</span>
              <span className="adp-fw-caret">{dropOpen ? "▴" : "▾"}</span>
            </button>
            {dropOpen && (
              <div className="adp-fw-menu">
                {FRAMEWORK_OPTIONS.map((opt) => (
                  <label key={opt.value} className="adp-fw-option">
                    <input
                      type="checkbox"
                      checked={frameworks.includes(opt.value)}
                      onChange={() => toggleFramework(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* OGSM 歸屬 */}
      <div className="adp-field">
        <label className="adp-field-label">OGSM 歸屬</label>
        {isReadOnly ? (
          ogsmLinks.length > 0 ? (
            <div className="adp-fw-attribution">
              {ogsmLinks.map((link) => {
                const period = workspace.departments
                  .flatMap((d) => d.periods)
                  .find((p) => p.id === link.periodId);
                const goal = period?.ogsm.goals.find(
                  (g) => g.id === link.goalId,
                );
                const strategy = goal?.strategies.find(
                  (s) => s.id === link.strategyId,
                );
                return (
                  <span key={link.id} className="adp-fw-attribution-item">
                    {period ? `${period.year} ${period.halfYear} / ` : ""}
                    {goal?.label ? `${goal.label} ` : ""}
                    {strategy ? strategy.title : (goal?.title ?? "(未對應)")}
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="adp-value">—</span>
          )
        ) : (
          <div className="adp-ogsm-selects">
            {ogsmLinks.length > 0 && (
              <div className="adp-ogsm-link-list">
                {ogsmLinks.map((link) => {
                  const period = workspace.departments
                    .flatMap((d) => d.periods)
                    .find((p) => p.id === link.periodId);
                  const goal = period?.ogsm.goals.find(
                    (g) => g.id === link.goalId,
                  );
                  const strategy = goal?.strategies.find(
                    (s) => s.id === link.strategyId,
                  );
                  return (
                    <div key={link.id} className="adp-ogsm-link-row">
                      <span className="adp-ogsm-link-text">
                        {period
                          ? `${period.year} ${period.halfYear}`
                          : "未知期別"}{" "}
                        / {goal?.label ? `${goal.label} ` : ""}
                        {strategy
                          ? strategy.title
                          : (goal?.title ?? "(未對應)")}
                      </span>
                      <button
                        type="button"
                        className="adp-ogsm-link-remove"
                        onClick={() => removeOgsmLink(link.id)}
                        title="移除此歸屬"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <select
              className="adp-select"
              value={selPeriodId}
              onChange={(e) => {
                setSelPeriodId(e.target.value);
                setSelGoalId("");
                setSelStratId("");
              }}
            >
              <option value="">期別…</option>
              {deptPeriods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.year} {p.halfYear}
                </option>
              ))}
            </select>
            <select
              className="adp-select"
              value={selGoalId}
              disabled={!selPeriodId}
              onChange={(e) => {
                setSelGoalId(e.target.value);
                setSelStratId("");
              }}
            >
              <option value="">目標…</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label ? `${g.label} ` : ""}
                  {g.title}
                </option>
              ))}
            </select>
            <select
              className="adp-select"
              value={selStratId}
              disabled={!selGoalId}
              onChange={(e) => setSelStratId(e.target.value)}
            >
              <option value="">策略…</option>
              {strategies.map((s, si) => (
                <option key={s.id} value={s.id}>
                  S{si + 1} {s.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="adp-btn-sm"
              disabled={!selPeriodId || !selGoalId || !selStratId}
              onClick={addOgsmLink}
            >
              ＋ 新增歸屬
            </button>
          </div>
        )}
      </div>

      {/* 活動名稱 */}
      <div className="adp-field">
        <label className="adp-field-label">活動名稱</label>
        <input
          className="adp-input"
          value={draft.rawText}
          disabled={isReadOnly}
          onChange={(e) => patch({ rawText: e.target.value })}
          placeholder="活動名稱…"
        />
      </div>

      {/* 主責 */}
      <div className="adp-field">
        <label className="adp-field-label">主責</label>
        {isReadOnly ? (
          <span className="adp-value">{draft.owner || "—"}</span>
        ) : (
          <OwnerPicker
            workspace={workspace}
            value={draft.owner ?? ""}
            onChange={(v) => patch({ owner: v })}
            selectClassName="adp-select"
          />
        )}
      </div>

      {/* 狀態 */}
      <div className="adp-field">
        <label className="adp-field-label" title={overdueTooltip}>
          狀態
          {overduePlanDescriptions.length > 0 ? "（預設注意）" : ""}
        </label>
        {isReadOnly ? (
          <span className="adp-value" title={overdueTooltip}>
            {STATUS_OPTIONS.find((s) => s.value === draft.status)?.label ?? "—"}
          </span>
        ) : (
          <select
            className="adp-select"
            value={draft.status ?? ""}
            title={overdueTooltip}
            onChange={(e) =>
              onStatusChange((e.target.value as MeasureStatus) || undefined)
            }
          >
            <option value="">（未設定）</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 開始 / 結束日期 */}
      <div className="adp-field adp-field-row">
        <div className="adp-field adp-field-half">
          <label className="adp-field-label">開始日期</label>
          <input
            className="adp-input"
            type="date"
            value={fmtDate(draft.startDate)}
            disabled={isReadOnly}
            onChange={(e) => patch({ startDate: e.target.value || undefined })}
          />
        </div>
        <div className="adp-field adp-field-half">
          <label className="adp-field-label">結束日期</label>
          <input
            className="adp-input"
            type="date"
            value={fmtDate(draft.endDate)}
            disabled={isReadOnly}
            onChange={(e) => patch({ endDate: e.target.value || undefined })}
          />
        </div>
      </div>

      {/* 說明 */}
      <div className="adp-field">
        <label className="adp-field-label">說明</label>
        <textarea
          className="adp-textarea"
          value={draft.description ?? ""}
          disabled={isReadOnly}
          rows={3}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="活動說明…"
        />
      </div>

      {/* 協助單位 */}
      <div className="adp-field">
        <label className="adp-field-label">協助單位</label>
        {isReadOnly ? (
          <span className="adp-value">
            {(draft.assistUnits ?? []).map((u) => u.name).join("、") || "—"}
          </span>
        ) : (
          <AssistUnitPicker
            workspace={workspace}
            value={draft.assistUnits ?? []}
            onChange={(v: AssistUnit[]) => patch({ assistUnits: v })}
          />
        )}
      </div>

      {/* 標籤 */}
      <div className="adp-field">
        <label className="adp-field-label">標籤</label>
        <TagEditor
          tags={draft.tags ?? []}
          disabled={isReadOnly}
          onChange={(tags) => patch({ tags })}
        />
      </div>
    </div>
  );
}

// ─── Tag Editor ────────────────────────────────────────────────────────────

function TagEditor({
  tags,
  disabled,
  onChange,
}: {
  tags: string[];
  disabled: boolean;
  onChange: (t: string[]) => void;
}) {
  const [inputVal, setInputVal] = useState("");

  const addTag = () => {
    const v = inputVal.trim();
    if (v && !tags.includes(v)) {
      onChange([...tags, v]);
    }
    setInputVal("");
  };

  return (
    <div className="adp-tag-editor">
      <div className="adp-tag-list">
        {tags.map((t) => (
          <span key={t} className="adp-tag">
            {t}
            {!disabled && (
              <button
                className="adp-tag-remove"
                onClick={() => onChange(tags.filter((x) => x !== t))}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {tags.length === 0 && disabled && <span className="adp-value">—</span>}
      </div>
      {!disabled && (
        <div className="adp-tag-input-row">
          <input
            className="adp-input adp-input-sm"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="輸入標籤後按 Enter"
          />
          <button className="adp-btn-sm" onClick={addTag}>
            +
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: KPI 指標 ─────────────────────────────────────────────────────────

function KpiTab({
  kpis,
  isReadOnly,
  onPatchKpi,
  onAddKpi,
  onDeleteKpi,
  onOpenConfig,
}: {
  kpis: KPI[];
  isReadOnly: boolean;
  onPatchKpi: (id: string, changes: Partial<KPI>) => void;
  onAddKpi: () => void;
  onDeleteKpi: (id: string) => void;
  onOpenConfig: (id: string) => void;
}) {
  return (
    <div className="adp-section-list">
      {kpis.length === 0 && (
        <div className="adp-empty-hint">
          尚無 KPI —{" "}
          {isReadOnly ? "此活動沒有設定 KPI。" : "點擊「＋ 新增 KPI」來建立。"}
        </div>
      )}

      {kpis.map((kpi) => {
        const siblings = kpis.filter((k) => k.id !== kpi.id);
        const achieved = computeKpiAchievement(kpi, siblings);
        return (
          <KpiRow
            key={kpi.id}
            kpi={kpi}
            achieved={achieved}
            isReadOnly={isReadOnly}
            onPatch={(changes) => onPatchKpi(kpi.id, changes)}
            onDelete={() => onDeleteKpi(kpi.id)}
            onOpenConfig={() => onOpenConfig(kpi.id)}
          />
        );
      })}

      {!isReadOnly && (
        <button className="adp-add-btn" onClick={onAddKpi}>
          ＋ 新增 KPI
        </button>
      )}
    </div>
  );
}

function KpiRow({
  kpi,
  achieved,
  isReadOnly,
  onPatch,
  onDelete,
  onOpenConfig,
}: {
  kpi: KPI;
  achieved: number | null;
  isReadOnly: boolean;
  onPatch: (c: Partial<KPI>) => void;
  onDelete: () => void;
  onOpenConfig: () => void;
}) {
  const achPct = achieved !== null ? `${achieved.toFixed(1)}%` : "—";
  const achColor =
    achieved === null
      ? "var(--text3)"
      : achieved >= 100
        ? "var(--green)"
        : achieved >= 70
          ? "var(--yellow)"
          : "var(--red)";

  return (
    <div className="adp-kpi-row">
      <div className="adp-kpi-header">
        <span className="adp-kpi-name">{getKpiDisplayName(kpi)}</span>
        <div className="adp-kpi-actions">
          {!isReadOnly && (
            <Tooltip content="KPI 設定">
              <button
                className="adp-kpi-btn"
                onClick={onOpenConfig}
                title="KPI 設定"
              >
                ⚙
              </button>
            </Tooltip>
          )}
          {!isReadOnly && (
            <Tooltip content="刪除 KPI">
              <button
                className="adp-kpi-btn adp-kpi-btn-del"
                onClick={() => {
                  if (window.confirm(`刪除 KPI「${getKpiDisplayName(kpi)}」？`))
                    onDelete();
                }}
                title="刪除"
              >
                ✕
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="adp-kpi-fields">
        {/* 目標 */}
        <div className="adp-kpi-field">
          <span className="adp-kpi-field-label">目標</span>
          {isReadOnly ? (
            <span className="adp-kpi-field-val">
              {kpi.target !== null && kpi.target !== undefined
                ? `${kpi.target} ${kpi.unit}`
                : "—"}
            </span>
          ) : (
            <div className="adp-kpi-input-unit">
              <input
                className="adp-input adp-input-sm"
                type="number"
                value={
                  kpi.target !== null && kpi.target !== undefined
                    ? kpi.target
                    : ""
                }
                onChange={(e) =>
                  onPatch({
                    target:
                      e.target.value !== "" ? parseFloat(e.target.value) : null,
                  })
                }
                placeholder="目標值"
              />
              <span className="adp-kpi-unit">{kpi.unit || "—"}</span>
            </div>
          )}
        </div>

        {/* 實際值 */}
        <div className="adp-kpi-field">
          <span className="adp-kpi-field-label">實際</span>
          {isReadOnly ? (
            <span className="adp-kpi-field-val">
              {kpi.actual !== null && kpi.actual !== undefined
                ? `${kpi.actual} ${kpi.unit}`
                : "—"}
            </span>
          ) : (
            <div className="adp-kpi-input-unit">
              <input
                className="adp-input adp-input-sm"
                type="number"
                value={
                  kpi.actual !== null && kpi.actual !== undefined
                    ? kpi.actual
                    : ""
                }
                onChange={(e) =>
                  onPatch({
                    actual:
                      e.target.value !== "" ? parseFloat(e.target.value) : null,
                  })
                }
                placeholder="實際值"
              />
              <span className="adp-kpi-unit">{kpi.unit || "—"}</span>
            </div>
          )}
        </div>

        {/* 達成率 */}
        <div className="adp-kpi-field">
          <span className="adp-kpi-field-label">達成率</span>
          <span className="adp-kpi-ach" style={{ color: achColor }}>
            {achPct}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: 行動計畫 ─────────────────────────────────────────────────────────

function PlansTab({
  planItems,
  quarters,
  warnDaysBefore,
  isReadOnly,
  onUpdateWarnDays,
  onPatch,
  onAdd,
  onDelete,
}: {
  planItems: ActivityPlanItem[];
  quarters: string[];
  warnDaysBefore: number;
  isReadOnly: boolean;
  onUpdateWarnDays: (n: number) => void;
  onPatch: (id: string, changes: Partial<ActivityPlanItem>) => void;
  onAdd: (quarter: string) => void;
  onDelete: (id: string) => void;
}) {
  const warnCounts = countPlanWarnings(planItems, warnDaysBefore);

  return (
    <div className="adp-section-list">
      <div className="adp-plan-settings-row">
        <div className="adp-plan-warn-config">
          <span className="adp-plan-meta-label">預警提前天數</span>
          <input
            className="adp-input adp-input-sm"
            type="number"
            min={0}
            step={1}
            value={warnDaysBefore}
            disabled={isReadOnly}
            onChange={(e) => {
              const next = Number(e.target.value);
              onUpdateWarnDays(Number.isFinite(next) ? Math.max(0, next) : 0);
            }}
          />
          <span className="adp-plan-meta-label">天（預設 3）</span>
        </div>
        <div className="adp-plan-warn-summary">
          <span className="adp-plan-badge overdue">
            🔴 逾期 {warnCounts.overdue}
          </span>
          <span className="adp-plan-badge warning">
            ⚠️ 即將到期 {warnCounts.warning}
          </span>
        </div>
      </div>

      {quarters.map((q) => {
        const items = planItems.filter((p) => (p.quarter ?? "Q1") === q);
        return (
          <div key={q} className="adp-plan-quarter">
            <div className="adp-plan-quarter-header">
              <span className="adp-plan-q-label">{q}</span>
              <span className="adp-plan-q-count">
                {items.filter((i) => i.completed).length}/{items.length}
              </span>
            </div>

            {items.length === 0 && (
              <div className="adp-empty-hint adp-plan-empty">
                {isReadOnly ? "此季度無計畫項目" : "點擊「＋」新增行動項目"}
              </div>
            )}

            {items.map((item) => (
              <PlanItemRow
                key={item.id}
                item={item}
                allPlanItems={planItems}
                warnDaysBefore={warnDaysBefore}
                isReadOnly={isReadOnly}
                onPatch={(c) => onPatch(item.id, c)}
                onDelete={() => {
                  if (window.confirm("刪除此行動計畫項目？")) onDelete(item.id);
                }}
              />
            ))}

            {!isReadOnly && (
              <button className="adp-plan-add-btn" onClick={() => onAdd(q)}>
                ＋ 新增項目
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlanItemRow({
  item,
  allPlanItems,
  warnDaysBefore,
  isReadOnly,
  onPatch,
  onDelete,
}: {
  item: ActivityPlanItem;
  allPlanItems: ActivityPlanItem[];
  warnDaysBefore: number;
  isReadOnly: boolean;
  onPatch: (c: Partial<ActivityPlanItem>) => void;
  onDelete: () => void;
}) {
  const warnType = getPlanItemWarning(item, warnDaysBefore);
  const dependsOnIds = item.dependsOnIds ?? [];
  const depCandidates = allPlanItems.filter((p) => p.id !== item.id);

  const toggleDependency = (depId: string) => {
    const next = new Set(dependsOnIds);
    if (next.has(depId)) {
      next.delete(depId);
      onPatch({ dependsOnIds: Array.from(next) });
      return;
    }

    const dep = allPlanItems.find((p) => p.id === depId);
    if (dep?.dependsOnIds?.includes(item.id)) {
      window.alert("不可設定直接循環依賴（A 依賴 B 且 B 依賴 A）");
      return;
    }
    next.add(depId);
    onPatch({ dependsOnIds: Array.from(next) });
  };

  return (
    <div className={`adp-plan-item${item.completed ? " adp-plan-done" : ""}`}>
      <div className="adp-plan-item-top">
        <input
          className="adp-plan-check"
          type="checkbox"
          checked={item.completed}
          disabled={isReadOnly}
          onChange={(e) => {
            const checked = e.target.checked;
            onPatch({
              completed: checked,
              actualEndDate: checked
                ? item.actualEndDate || new Date().toISOString().slice(0, 10)
                : undefined,
            });
          }}
        />
        {isReadOnly ? (
          <span
            className={`adp-plan-desc${item.completed ? " adp-plan-desc-done" : ""}`}
          >
            {item.description || "（無說明）"}
          </span>
        ) : (
          <input
            className={`adp-input adp-plan-desc-input${item.completed ? " adp-plan-desc-done" : ""}`}
            value={item.description}
            onChange={(e) => onPatch({ description: e.target.value })}
            placeholder="行動項目說明…"
          />
        )}
        {!isReadOnly && (
          <button
            className="adp-kpi-btn adp-kpi-btn-del"
            onClick={onDelete}
            title="刪除"
          >
            ✕
          </button>
        )}
      </div>

      <div className="adp-plan-item-meta">
        <span className="adp-plan-meta-label">預計完成：</span>
        <input
          className="adp-input adp-input-sm adp-plan-date"
          type="date"
          value={item.plannedEndDate ?? ""}
          disabled={isReadOnly}
          onChange={(e) =>
            onPatch({ plannedEndDate: e.target.value || undefined })
          }
        />
        <span className="adp-plan-meta-label">實際完成：</span>
        <input
          className="adp-input adp-input-sm adp-plan-date"
          type="date"
          value={item.actualEndDate ?? ""}
          disabled={isReadOnly}
          onChange={(e) =>
            onPatch({ actualEndDate: e.target.value || undefined })
          }
        />
        {warnType && (
          <span
            className={`adp-plan-badge ${warnType === "overdue" ? "overdue" : "warning"}`}
          >
            {warnType === "overdue" ? "🔴 逾期" : "⚠️ 即將到期"}
          </span>
        )}
        {item.owner !== undefined && (
          <span className="adp-plan-owner">{item.owner}</span>
        )}
      </div>

      <div className="adp-plan-item-meta adp-plan-item-deps">
        <span className="adp-plan-meta-label">前置依賴：</span>
        {depCandidates.length === 0 ? (
          <span className="adp-value">無可選項目</span>
        ) : isReadOnly ? (
          dependsOnIds.length > 0 ? (
            <div className="adp-plan-dep-list">
              {dependsOnIds.map((depId) => {
                const dep = allPlanItems.find((p) => p.id === depId);
                return (
                  <span key={depId} className="adp-plan-dep-chip">
                    {dep?.description || "（未命名項目）"}
                  </span>
                );
              })}
            </div>
          ) : (
            <span className="adp-value">無</span>
          )
        ) : (
          <div className="adp-plan-dep-list">
            {depCandidates.map((dep) => {
              const checked = dependsOnIds.includes(dep.id);
              return (
                <label key={dep.id} className="adp-plan-dep-option">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleDependency(dep.id)}
                  />
                  <span>{dep.description || "（未命名項目）"}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tab: 備註 ─────────────────────────────────────────────────────────────

function NotesTab({
  notes,
  isReadOnly,
  onChange,
}: {
  notes: string;
  isReadOnly: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="adp-section-list">
      <textarea
        className="adp-textarea adp-notes-textarea"
        value={notes}
        disabled={isReadOnly}
        rows={16}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isReadOnly ? "無備註" : "在此輸入備註…"}
      />
    </div>
  );
}
