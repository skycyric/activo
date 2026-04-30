/**
 * ActivityDetailPanel — 活動詳情側邊面板
 *
 * 取代 ActivityTable 的行內展開編輯，以獨立右側面板呈現完整活動資訊。
 * 4 個分頁：基本資料 / KPI 指標 / 行動計畫 / 備註
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type {
  DeptActivity,
  WorkspaceData,
  KPI,
  ActivityPlanItem,
  AssistUnit,
  MeasureStatus,
  TagDictionaryItem,
} from "../schemas/ogsm";
import { genId } from "../utils/csvParser";
import {
  computeKpiAchievement,
  getKpiDisplayName,
  recomputeActivityKpis,
  resolveBaseline,
} from "../utils/kpiCalc";
import {
  countPlanWarnings,
  getPlanItemWarning,
  isPlannedEndDateOutsideQuarter,
  isLateCompletion,
} from "../utils/planWarnings";
import KpiConfigModal from "./activity/KpiConfigModal";
import AssistUnitPicker from "./activity/AssistUnitPicker";
import OwnerPicker from "./activity/OwnerPicker";
import { Tooltip } from "./ui/tooltip";

// ─── Constants ─────────────────────────────────────────────────────────────

const LS_WIDTH_KEY = "activo_activity_panel_width";
const DEFAULT_PANEL_WIDTH = 480;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 900;
const MAX_ACTIVITY_TAGS = 5;

const STATUS_OPTIONS: { value: MeasureStatus; label: string }[] = [
  { value: "not-started", label: "未開始" },
  { value: "attention", label: "注意" },
  { value: "in-progress", label: "進行中" },
  { value: "completed", label: "已完成" },
];

type Tab = "basic" | "kpi" | "plans" | "notes";

type QuarterPlanViewItem = {
  item: ActivityPlanItem;
  isMirror: boolean;
  sourceQuarter: string;
};

type ActivityTemplateSource = {
  deptId: string;
  deptName: string;
  activity: DeptActivity;
};

type KpiTemplateCandidate = {
  templateId: string;
  sourceDeptId: string;
  sourceDeptName: string;
  sourceActivityId: string;
  sourceActivityName: string;
  title: string;
  subtitle: string;
  searchText: string;
  kpi: KPI;
};

type PlanTemplateCandidate = {
  templateId: string;
  sourceDeptId: string;
  sourceDeptName: string;
  sourceActivityId: string;
  sourceActivityName: string;
  sourceQuarter: string;
  title: string;
  subtitle: string;
  searchText: string;
  item: ActivityPlanItem;
};

// ─── Helper ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | undefined) {
  return d ?? "";
}

function toIsoDateInputValue(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getQuarterFromIsoDate(iso: string | undefined) {
  if (!iso) return null;
  const parts = iso.split("-");
  if (parts.length < 2) return null;
  const month = Number(parts[1]);
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return `Q${Math.floor((month - 1) / 3) + 1}`;
}

function cloneKpiFromTemplate(source: KPI): KPI {
  return {
    ...source,
    id: genId(),
    bizKey: undefined,
    actual: null,
    achievementRate: null,
    confirmedAt: undefined,
  };
}

function clonePlanItemFromTemplate(
  source: ActivityPlanItem,
  quarter: string,
): ActivityPlanItem {
  const sourceQuarter = source.quarter ?? "Q1";
  const keepSchedule = sourceQuarter === quarter;
  return {
    ...source,
    id: genId(),
    bizKey: undefined,
    quarter,
    completed: false,
    actualEndDate: undefined,
    dependsOnIds: [],
    linkedMeasureId: null,
    showInCalendar: false,
    plannedEndDate: keepSchedule ? source.plannedEndDate : undefined,
    eventStartDate: keepSchedule ? source.eventStartDate : undefined,
    eventEndDate: keepSchedule ? source.eventEndDate : undefined,
  };
}

function fmtDateOnly(value: string | undefined) {
  const d = toIsoDateInputValue(value);
  return d ? d.replace(/-/g, "/") : "—";
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
  forcedTab?: Tab | null;
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
  forcedTab = null,
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
  const [tab, setTab] = useState<Tab>(forcedTab ?? "basic");
  const [dirty, setDirty] = useState(false);

  // Sync forcedTab during render (React "setState during render" pattern)
  // avoids triggering an extra re-render cycle compared to useEffect.
  const [prevForcedTab, setPrevForcedTab] = useState<Tab | null | undefined>(
    forcedTab,
  );
  if (forcedTab && forcedTab !== prevForcedTab) {
    setPrevForcedTab(forcedTab);
    setTab(forcedTab);
  }

  // ── KPI Config Modal ───────────────────────────────────────────────────────
  const [configKpiDraft, setConfigKpiDraft] = useState<KPI | null>(null);
  const [showKpiTemplateModal, setShowKpiTemplateModal] = useState(false);
  const [planTemplateQuarter, setPlanTemplateQuarter] = useState<string | null>(
    null,
  );
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
  const patch = (partial: Partial<DeptActivity>) => {
    setDraft((d) => ({ ...d, ...partial }));
    setDirty(true);
    onDirtyChange?.(true);
  };

  const handleSave = () => {
    const invalidQuarterPlans = (draft.planItems ?? []).filter(
      isPlannedEndDateOutsideQuarter,
    );
    if (invalidQuarterPlans.length > 0) {
      const invalidNames = invalidQuarterPlans
        .slice(0, 3)
        .map((item) => item.description || "（未命名行動計畫）")
        .join("、");
      window.alert(
        `有行動計畫的預計完成日不在所屬季度內，請先修正後再儲存：${invalidNames}${invalidQuarterPlans.length > 3 ? " 等" : ""}`,
      );
      setTab("plans");
      return;
    }

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
  const commitKpi = (kpiId: string, changes: Partial<KPI>) => {
    patch({
      kpis: draft.kpis.map((k) => (k.id === kpiId ? { ...k, ...changes } : k)),
    });
  };

  const patchKpi = (kpiId: string, changes: Partial<KPI>) => {
    if (configKpiDraft?.id === kpiId) {
      setConfigKpiDraft((current) =>
        current && current.id === kpiId ? { ...current, ...changes } : current,
      );
      return;
    }
    commitKpi(kpiId, changes);
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

  const addKpiFromTemplate = (source: KPI) => {
    patch({ kpis: [...draft.kpis, cloneKpiFromTemplate(source)] });
  };

  const deleteKpi = (kpiId: string) => {
    patch({ kpis: draft.kpis.filter((k) => k.id !== kpiId) });
  };

  const openKpiConfig = (kpiId: string) => {
    const current = draft.kpis.find((k) => k.id === kpiId);
    if (!current) return;
    setConfigKpiDraft({
      ...current,
      baseline: current.baseline ? { ...current.baseline } : current.baseline,
    });
  };

  const handleKpiConfigSave = (updated: KPI) => {
    commitKpi(updated.id, updated);
    setConfigKpiDraft(null);
  };

  const handleKpiConfigClose = () => {
    setConfigKpiDraft(null);
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

  const addPlanItemFromTemplate = (
    quarter: string,
    source: ActivityPlanItem,
  ) => {
    patch({
      planItems: [...planItems, clonePlanItemFromTemplate(source, quarter)],
    });
  };

  const activityTemplateSources = useMemo<ActivityTemplateSource[]>(() => {
    const sources: ActivityTemplateSource[] = [];

    workspace.departments.forEach((department) => {
      let hasCurrentActivity = false;
      (department.activities ?? []).forEach((activity) => {
        const nextActivity =
          department.id === deptId && activity.id === draft.id
            ? draft
            : activity;
        if (department.id === deptId && nextActivity.id === draft.id) {
          hasCurrentActivity = true;
        }
        sources.push({
          deptId: department.id,
          deptName: department.name,
          activity: nextActivity,
        });
      });

      if (department.id === deptId && !hasCurrentActivity) {
        sources.push({
          deptId: department.id,
          deptName: department.name,
          activity: draft,
        });
      }
    });

    return sources;
  }, [deptId, draft, workspace.departments]);

  const kpiTemplateCandidates = useMemo<KpiTemplateCandidate[]>(
    () =>
      activityTemplateSources.flatMap(({ deptId, deptName, activity }) =>
        (activity.kpis ?? []).map((kpi) => {
          const activityName = activity.rawText || "（未命名活動）";
          const title = getKpiDisplayName(kpi);
          return {
            templateId: `${deptId}:${activity.id}:kpi:${kpi.id}`,
            sourceDeptId: deptId,
            sourceDeptName: deptName,
            sourceActivityId: activity.id,
            sourceActivityName: activityName,
            title,
            subtitle: `${deptName} / ${activityName}`,
            searchText:
              `${title} ${kpi.label ?? ""} ${activityName} ${deptName}`.toLowerCase(),
            kpi,
          };
        }),
      ),
    [activityTemplateSources],
  );

  const planTemplateCandidates = useMemo<PlanTemplateCandidate[]>(
    () =>
      activityTemplateSources.flatMap(({ deptId, deptName, activity }) =>
        (activity.planItems ?? []).map((item) => {
          const activityName = activity.rawText || "（未命名活動）";
          const sourceQuarter = item.quarter ?? "Q1";
          const title = item.description || "（無說明）";
          return {
            templateId: `${deptId}:${activity.id}:plan:${item.id}`,
            sourceDeptId: deptId,
            sourceDeptName: deptName,
            sourceActivityId: activity.id,
            sourceActivityName: activityName,
            sourceQuarter,
            title,
            subtitle: `${deptName} / ${activityName} / ${sourceQuarter}`,
            searchText:
              `${title} ${activityName} ${deptName} ${sourceQuarter} ${item.owner ?? ""} ${item.notes ?? ""}`.toLowerCase(),
            item,
          };
        }),
      ),
    [activityTemplateSources],
  );

  // Derive quarters from existing plan items; always include at least Q1-Q4
  const allQuarters = Array.from(
    new Set([
      "Q1",
      "Q2",
      "Q3",
      "Q4",
      ...planItems.map((p) => p.quarter ?? "Q1"),
      ...planItems
        .map((p) => getQuarterFromIsoDate(p.actualEndDate))
        .filter((quarter): quarter is string => quarter !== null),
    ]),
  ).sort();

  // ── Render ─────────────────────────────────────────────────────────────────
  const displayKpis = configKpiDraft
    ? draft.kpis.map((k) => (k.id === configKpiDraft.id ? configKpiDraft : k))
    : draft.kpis;
  const configKpi = configKpiDraft;
  const originalConfigKpi = configKpiDraft
    ? (draft.kpis.find((k) => k.id === configKpiDraft.id) ?? null)
    : null;

  return (
    <>
      {/* KPI Config Modal (portal-style, rendered at root level) */}
      {configKpi && originalConfigKpi && (
        <KpiConfigModal
          kpi={configKpi}
          originalKpi={originalConfigKpi}
          siblingKpis={displayKpis.filter((k) => k.id !== configKpi.id)}
          onChange={setConfigKpiDraft}
          onSave={handleKpiConfigSave}
          onClose={handleKpiConfigClose}
        />
      )}
      {showKpiTemplateModal && (
        <KpiTemplateModal
          currentDeptId={deptId}
          candidates={kpiTemplateCandidates}
          onCreateBlank={() => {
            addKpi();
            setShowKpiTemplateModal(false);
          }}
          onApplyTemplate={(template) => {
            addKpiFromTemplate(template);
            setShowKpiTemplateModal(false);
          }}
          onClose={() => setShowKpiTemplateModal(false)}
        />
      )}
      {planTemplateQuarter && (
        <PlanTemplateModal
          currentDeptId={deptId}
          quarter={planTemplateQuarter}
          candidates={planTemplateCandidates}
          onCreateBlank={() => {
            addPlanItem(planTemplateQuarter);
            setPlanTemplateQuarter(null);
          }}
          onApplyTemplate={(template) => {
            addPlanItemFromTemplate(planTemplateQuarter, template);
            setPlanTemplateQuarter(null);
          }}
          onClose={() => setPlanTemplateQuarter(null)}
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
                kpis={displayKpis}
                isReadOnly={isReadOnly}
                onPatchKpi={patchKpi}
                onRequestAddKpi={() => setShowKpiTemplateModal(true)}
                onDeleteKpi={deleteKpi}
                onOpenConfig={openKpiConfig}
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
                onRequestAdd={(quarter) => setPlanTemplateQuarter(quarter)}
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

  const upsertLegacyOgsmLinkFromSelection = (
    periodId: string,
    goalId: string,
    strategyId: string,
  ) => {
    if (!periodId || !goalId || !strategyId) return;
    const all = draft.dashboardLinks ?? [];
    if (all.some((l) => l.type === "ogsm")) return;

    patch({
      dashboardLinks: [
        ...all,
        {
          id: genId("dlink"),
          type: "ogsm",
          periodId,
          goalId,
          strategyId,
          exclude: false,
        },
      ],
      // 舊資料從 fallback 歸屬切換時，同步補上 ogsm framework
      frameworks: frameworks.includes("ogsm")
        ? frameworks
        : [...frameworks, "ogsm"],
    });
  };

  const applyOgsmSelectionToDraft = (
    periodId: string,
    goalId: string,
    strategyId: string,
  ) => {
    if (!periodId || !goalId || !strategyId) return;
    const all = draft.dashboardLinks ?? [];
    const ogsmOnly = all.filter((l) => l.type === "ogsm");

    // 舊資料（尚未有 OGSM link）: 直接建立第一筆 link
    if (ogsmOnly.length === 0) {
      upsertLegacyOgsmLinkFromSelection(periodId, goalId, strategyId);
      return;
    }

    // 單一 OGSM link: 視為「切換歸屬」，直接更新該筆並觸發 dirty
    if (ogsmOnly.length === 1) {
      const current = ogsmOnly[0];
      if (
        current.periodId === periodId &&
        current.goalId === goalId &&
        current.strategyId === strategyId
      ) {
        return;
      }
      patch({
        dashboardLinks: all.map((l) =>
          l.id === current.id
            ? {
                ...l,
                periodId,
                goalId,
                strategyId,
              }
            : l,
        ),
        frameworks: frameworks.includes("ogsm")
          ? frameworks
          : [...frameworks, "ogsm"],
      });
    }
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
              aria-label="OGSM 期別"
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
              aria-label="OGSM 目標"
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
              aria-label="OGSM 策略"
              value={selStratId}
              disabled={!selGoalId}
              onChange={(e) => {
                const nextStratId = e.target.value;
                setSelStratId(nextStratId);
                // 單一 OGSM 歸屬視為切換；舊資料則建立第一筆 link
                applyOgsmSelectionToDraft(selPeriodId, selGoalId, nextStratId);
              }}
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

      <div className="adp-field">
        <label className="adp-field-label">活動日期加入月曆</label>
        {isReadOnly ? (
          <span className="adp-value">
            {draft.showActivityInCalendar ? "已加入" : "未加入"}
          </span>
        ) : (
          <label
            className={`adp-plan-calendar-toggle${!draft.startDate ? " disabled" : ""}`}
            title={
              !draft.startDate
                ? "需先設定開始日期才能加入月曆"
                : draft.showActivityInCalendar
                  ? "點擊取消在月曆顯示活動期間"
                  : "點擊在月曆顯示活動期間"
            }
          >
            <input
              type="checkbox"
              checked={draft.showActivityInCalendar ?? false}
              disabled={!draft.startDate}
              onChange={(e) =>
                patch({ showActivityInCalendar: e.target.checked })
              }
            />
            <span>📅 活動期間</span>
          </label>
        )}
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
          dictionary={workspace.tagDictionary ?? []}
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
  dictionary,
  tags,
  disabled,
  onChange,
}: {
  dictionary: TagDictionaryItem[];
  tags: string[];
  disabled: boolean;
  onChange: (t: string[]) => void;
}) {
  const [searchVal, setSearchVal] = useState("");
  const activeOptions = dictionary.filter((item) => item.status === "active");
  const normalizedSearch = searchVal.trim().toLocaleLowerCase("zh-TW");
  const filteredOptions = activeOptions.filter((item) => {
    if (tags.includes(item.name)) return false;
    if (!normalizedSearch) return true;
    return item.name.toLocaleLowerCase("zh-TW").includes(normalizedSearch);
  });

  const addTag = (name: string) => {
    if (tags.includes(name) || tags.length >= MAX_ACTIVITY_TAGS) return;
    onChange([...tags, name]);
    setSearchVal("");
  };

  return (
    <div className="adp-tag-editor">
      <div className="adp-tag-list">
        {tags.map((t) => (
          <span key={t} className="adp-tag">
            {t}
            {!disabled && (
              <button
                type="button"
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
            value={searchVal}
            disabled={
              activeOptions.length === 0 || tags.length >= MAX_ACTIVITY_TAGS
            }
            onChange={(e) => setSearchVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filteredOptions[0]) {
                e.preventDefault();
                addTag(filteredOptions[0].name);
              }
            }}
            placeholder={
              activeOptions.length === 0
                ? "請先到標籤管理建立標籤"
                : tags.length >= MAX_ACTIVITY_TAGS
                  ? `已達上限 ${MAX_ACTIVITY_TAGS} 個`
                  : "搜尋既有標籤"
            }
          />
          <span className="adp-tag-meta">
            已選 {tags.length}/{MAX_ACTIVITY_TAGS}
          </span>
        </div>
      )}
      {!disabled &&
        filteredOptions.length > 0 &&
        tags.length < MAX_ACTIVITY_TAGS && (
          <div className="adp-tag-suggestions">
            {filteredOptions.slice(0, 12).map((item) => (
              <button
                key={item.id}
                type="button"
                className="adp-tag-suggestion"
                onClick={() => addTag(item.name)}
              >
                {item.name}
              </button>
            ))}
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
  onRequestAddKpi,
  onDeleteKpi,
  onOpenConfig,
}: {
  kpis: KPI[];
  isReadOnly: boolean;
  onPatchKpi: (id: string, changes: Partial<KPI>) => void;
  onRequestAddKpi: () => void;
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
        const baseline = resolveBaseline(kpi, siblings);
        return (
          <KpiRow
            key={kpi.id}
            kpi={kpi}
            achieved={achieved}
            baseline={baseline}
            isReadOnly={isReadOnly}
            onPatch={(changes) => onPatchKpi(kpi.id, changes)}
            onDelete={() => onDeleteKpi(kpi.id)}
            onOpenConfig={() => onOpenConfig(kpi.id)}
          />
        );
      })}

      {!isReadOnly && (
        <button className="adp-add-btn" onClick={onRequestAddKpi}>
          ＋ 新增 KPI
        </button>
      )}
    </div>
  );
}

function KpiRow({
  kpi,
  achieved,
  baseline,
  isReadOnly,
  onPatch,
  onDelete,
  onOpenConfig,
}: {
  kpi: KPI;
  achieved: number | null;
  baseline: number | null;
  isReadOnly: boolean;
  onPatch: (c: Partial<KPI>) => void;
  onDelete: () => void;
  onOpenConfig: () => void;
}) {
  const formulaType =
    kpi.formulaType ??
    (kpi.kpiType === "growth"
      ? "growth"
      : kpi.kpiType === "target_rate"
        ? "target_pct"
        : kpi.kpiType === "progress"
          ? "completion"
          : "direct_rate");
  const targetPctActualPercent =
    formulaType === "target_pct" &&
    kpi.actual !== null &&
    kpi.actual !== undefined &&
    baseline !== null &&
    baseline !== undefined &&
    baseline !== 0
      ? (kpi.actual / baseline) * 100
      : null;
  const targetPctTargetPercent =
    formulaType === "target_pct" ? (kpi.targetRate ?? null) : null;
  const achPct = achieved !== null ? `${achieved.toFixed(1)}%` : "—";
  const achColor =
    achieved === null
      ? "var(--text3)"
      : formulaType === "target_pct"
        ? targetPctActualPercent !== null && targetPctTargetPercent !== null
          ? targetPctActualPercent >= targetPctTargetPercent
            ? "var(--green)"
            : targetPctActualPercent >= targetPctTargetPercent - 10
              ? "var(--yellow)"
              : "var(--red)"
          : "var(--text3)"
        : achieved >= 100
          ? "var(--green)"
          : achieved >= 70
            ? "var(--yellow)"
            : "var(--red)";
  const formulaLabel =
    formulaType === "growth"
      ? "成長率"
      : formulaType === "target_pct"
        ? "百分比達成率"
        : formulaType === "completion"
          ? "完成率"
          : "直接達成率";
  const showTarget = formulaType !== "completion";
  const targetLabel =
    formulaType === "growth"
      ? "目標成長率"
      : formulaType === "target_pct"
        ? "目標百分比"
        : "目標";
  const targetUnit =
    formulaType === "growth" || formulaType === "target_pct"
      ? "%"
      : kpi.unit || "—";
  const targetValue =
    formulaType === "growth"
      ? kpi.targetGrowthRate
      : formulaType === "target_pct"
        ? kpi.targetRate
        : formulaType === "completion"
          ? null
          : formulaType === "direct_rate"
            ? (baseline ?? kpi.target)
            : kpi.target;
  const achLabel =
    formulaType === "target_pct" ? "實際達成% / 目標%" : "達成率";
  const achText =
    formulaType === "target_pct"
      ? `${
          targetPctActualPercent !== null
            ? `${targetPctActualPercent.toFixed(1)}%`
            : "—"
        } / ${
          targetPctTargetPercent !== null
            ? `${targetPctTargetPercent.toFixed(1)}%`
            : "—"
        }`
      : achPct;

  return (
    <div className="adp-kpi-row">
      <div className="adp-kpi-header">
        {!isReadOnly ? (
          <button
            type="button"
            className="adp-kpi-header-main"
            onClick={onOpenConfig}
            title={`編輯 KPI 設定：${getKpiDisplayName(kpi)}`}
          >
            <span className="adp-kpi-name-row">
              <span className="adp-kpi-name">{getKpiDisplayName(kpi)}</span>
              <span className="adp-kpi-formula-pill">{formulaLabel}</span>
            </span>
            <span className="adp-kpi-config-hint">
              點這裡編輯名稱、公式、基底來源
            </span>
          </button>
        ) : (
          <div className="adp-kpi-header-main adp-kpi-header-main-readonly">
            <span className="adp-kpi-name-row">
              <span className="adp-kpi-name">{getKpiDisplayName(kpi)}</span>
              <span className="adp-kpi-formula-pill">{formulaLabel}</span>
            </span>
          </div>
        )}
        <div className="adp-kpi-actions">
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
        {showTarget && (
          <div className="adp-kpi-field">
            <span className="adp-kpi-field-label">{targetLabel}</span>
            {isReadOnly ? (
              <span className="adp-kpi-field-val">
                {targetValue !== null && targetValue !== undefined
                  ? `${targetValue} ${targetUnit}`
                  : "—"}
              </span>
            ) : (
              <div className="adp-kpi-input-unit">
                <input
                  className="adp-input adp-input-sm"
                  type="number"
                  value={
                    targetValue !== null && targetValue !== undefined
                      ? targetValue
                      : ""
                  }
                  onChange={(e) => {
                    const value =
                      e.target.value !== "" ? parseFloat(e.target.value) : null;
                    if (formulaType === "growth") {
                      onPatch({ targetGrowthRate: value });
                      return;
                    }
                    if (formulaType === "target_pct") {
                      onPatch({ targetRate: value });
                      return;
                    }
                    onPatch({ target: value });
                  }}
                  placeholder={
                    formulaType === "growth"
                      ? "目標成長率"
                      : formulaType === "target_pct"
                        ? "目標百分比"
                        : "目標值"
                  }
                />
                <span className="adp-kpi-unit">{targetUnit}</span>
              </div>
            )}
          </div>
        )}

        {/* 實際值 */}
        <div className="adp-kpi-field">
          <span className="adp-kpi-field-label">
            {formulaType === "completion" ? "完成率" : "實際"}
          </span>
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

        {/* 基底值（成長型、百分比達成率在配置 baseline 時顯示） */}
        {["growth", "target_pct"].includes(formulaType) && kpi.baseline && (
          <div className="adp-kpi-field">
            <span className="adp-kpi-field-label">
              {formulaType === "growth" ? "基底" : "基底"}
            </span>
            <span className="adp-kpi-field-val">
              {baseline !== null && baseline !== undefined
                ? `${baseline} ${kpi.unit}`
                : "—"}
            </span>
          </div>
        )}

        {/* 達成率 */}
        <div className="adp-kpi-field">
          <span className="adp-kpi-field-label">{achLabel}</span>
          <span className="adp-kpi-ach" style={{ color: achColor }}>
            {achText}
          </span>
        </div>

        <div className="adp-kpi-field">
          <span className="adp-kpi-field-label">最後更新日期</span>
          {isReadOnly ? (
            <span className="adp-kpi-field-val">
              {fmtDateOnly(kpi.confirmedAt)}
            </span>
          ) : (
            <input
              className="adp-input adp-input-sm"
              type="date"
              aria-label="最後更新日期"
              value={toIsoDateInputValue(kpi.confirmedAt)}
              onChange={(e) =>
                onPatch({ confirmedAt: e.target.value || undefined })
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function KpiTemplateModal({
  currentDeptId,
  candidates,
  onCreateBlank,
  onApplyTemplate,
  onClose,
}: {
  currentDeptId: string;
  candidates: KpiTemplateCandidate[];
  onCreateBlank: () => void;
  onApplyTemplate: (template: KPI) => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<"current-dept" | "all-depts">(
    "current-dept",
  );
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const filteredCandidates = useMemo(
    () =>
      candidates.filter((candidate) => {
        if (
          scope === "current-dept" &&
          candidate.sourceDeptId !== currentDeptId
        ) {
          return false;
        }
        const keyword = query.trim().toLowerCase();
        return !keyword || candidate.searchText.includes(keyword);
      }),
    [candidates, currentDeptId, query, scope],
  );

  return (
    <div className="adp-template-modal-overlay">
      <div
        className="adp-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adp-kpi-template-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adp-template-modal-header">
          <span
            id="adp-kpi-template-title"
            className="adp-template-modal-title"
          >
            新增 KPI
          </span>
          <Tooltip content="關閉模板選擇">
            <button className="adp-template-modal-close" onClick={onClose}>
              ×
            </button>
          </Tooltip>
        </div>

        <div className="adp-template-modal-body">
          <p className="adp-template-modal-hint">
            可沿用其他活動的 KPI 設定；不會帶入實際值、達成率或最後更新日期。
          </p>

          <div className="adp-template-filters">
            <label className="adp-template-filter-field">
              範圍
              <select
                className="adp-template-filter-input"
                value={scope}
                onChange={(e) =>
                  setScope(e.target.value as "current-dept" | "all-depts")
                }
              >
                <option value="current-dept">僅目前部門</option>
                <option value="all-depts">全部部門</option>
              </select>
            </label>

            <label className="adp-template-filter-field adp-template-filter-field-grow">
              搜尋
              <input
                className="adp-template-filter-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋 KPI 名稱、活動或部門"
              />
            </label>
          </div>

          <div className="adp-template-option-list">
            {filteredCandidates.length === 0 ? (
              <div className="adp-empty-hint">
                目前沒有符合條件的 KPI 模板。
              </div>
            ) : (
              filteredCandidates.map((candidate) => (
                <button
                  key={candidate.templateId}
                  type="button"
                  className="adp-template-option"
                  onClick={() => onApplyTemplate(candidate.kpi)}
                >
                  <span className="adp-template-option-title">
                    {candidate.title}
                  </span>
                  <span className="adp-template-option-subtitle">
                    {candidate.subtitle}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="adp-template-modal-footer">
          <button className="adp-template-btn-cancel" onClick={onClose}>
            取消
          </button>
          <button className="adp-template-btn-primary" onClick={onCreateBlank}>
            空白建立
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanTemplateModal({
  currentDeptId,
  quarter,
  candidates,
  onCreateBlank,
  onApplyTemplate,
  onClose,
}: {
  currentDeptId: string;
  quarter: string;
  candidates: PlanTemplateCandidate[];
  onCreateBlank: () => void;
  onApplyTemplate: (template: ActivityPlanItem) => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<"current-dept" | "all-depts">(
    "current-dept",
  );
  const [sameQuarterOnly, setSameQuarterOnly] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const filteredCandidates = useMemo(
    () =>
      candidates.filter((candidate) => {
        if (
          scope === "current-dept" &&
          candidate.sourceDeptId !== currentDeptId
        ) {
          return false;
        }
        if (sameQuarterOnly && candidate.sourceQuarter !== quarter) {
          return false;
        }
        const keyword = query.trim().toLowerCase();
        return !keyword || candidate.searchText.includes(keyword);
      }),
    [candidates, currentDeptId, query, quarter, sameQuarterOnly, scope],
  );

  return (
    <div className="adp-template-modal-overlay">
      <div
        className="adp-template-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adp-plan-template-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adp-template-modal-header">
          <span
            id="adp-plan-template-title"
            className="adp-template-modal-title"
          >
            新增行動項目 · {quarter}
          </span>
          <Tooltip content="關閉模板選擇">
            <button className="adp-template-modal-close" onClick={onClose}>
              ×
            </button>
          </Tooltip>
        </div>

        <div className="adp-template-modal-body">
          <p className="adp-template-modal-hint">
            會保留說明與備註，但不帶入完成狀態、實際完成日與依賴關係；跨季套用時也會清空時程欄位。
          </p>

          <div className="adp-template-filters">
            <label className="adp-template-filter-field">
              範圍
              <select
                className="adp-template-filter-input"
                value={scope}
                onChange={(e) =>
                  setScope(e.target.value as "current-dept" | "all-depts")
                }
              >
                <option value="current-dept">僅目前部門</option>
                <option value="all-depts">全部部門</option>
              </select>
            </label>

            <label className="adp-template-filter-field">
              季度
              <select
                className="adp-template-filter-input"
                value={sameQuarterOnly ? "same" : "all"}
                onChange={(e) => setSameQuarterOnly(e.target.value === "same")}
              >
                <option value="same">同季度優先</option>
                <option value="all">不限季度</option>
              </select>
            </label>

            <label className="adp-template-filter-field adp-template-filter-field-grow">
              搜尋
              <input
                className="adp-template-filter-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜尋項目說明、活動、部門或備註"
              />
            </label>
          </div>

          <div className="adp-template-option-list">
            {filteredCandidates.length === 0 ? (
              <div className="adp-empty-hint">目前沒有符合條件的行動模板。</div>
            ) : (
              filteredCandidates.map((candidate) => (
                <button
                  key={candidate.templateId}
                  type="button"
                  className="adp-template-option"
                  onClick={() => onApplyTemplate(candidate.item)}
                >
                  <span className="adp-template-option-title">
                    {candidate.title}
                  </span>
                  <span className="adp-template-option-subtitle">
                    {candidate.subtitle}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="adp-template-modal-footer">
          <button className="adp-template-btn-cancel" onClick={onClose}>
            取消
          </button>
          <button className="adp-template-btn-primary" onClick={onCreateBlank}>
            空白建立
          </button>
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
  onRequestAdd,
  onDelete,
}: {
  planItems: ActivityPlanItem[];
  quarters: string[];
  warnDaysBefore: number;
  isReadOnly: boolean;
  onUpdateWarnDays: (n: number) => void;
  onPatch: (id: string, changes: Partial<ActivityPlanItem>) => void;
  onRequestAdd: (quarter: string) => void;
  onDelete: (id: string) => void;
}) {
  const [crossQuarterMode, setCrossQuarterMode] = useState(false);
  const warnCounts = countPlanWarnings(planItems, warnDaysBefore);

  const sortByPlannedEndDate = (a: ActivityPlanItem, b: ActivityPlanItem) => {
    const ad = a.plannedEndDate ?? "9999-12-31";
    const bd = b.plannedEndDate ?? "9999-12-31";
    const byDate = ad.localeCompare(bd, "en");
    if (byDate !== 0) return byDate;
    return (a.description ?? "").localeCompare(b.description ?? "", "zh-TW");
  };

  const quarterGroups = useMemo(
    () =>
      quarters.map((quarter) => {
        const primaryItems = planItems
          .filter((item) => (item.quarter ?? "Q1") === quarter)
          .sort(sortByPlannedEndDate)
          .map<QuarterPlanViewItem>((item) => ({
            item,
            isMirror: false,
            sourceQuarter: item.quarter ?? "Q1",
          }));

        const mirroredItems = crossQuarterMode
          ? planItems
              .filter((item) => {
                if (!item.completed || !item.actualEndDate) return false;
                const actualQuarter = getQuarterFromIsoDate(item.actualEndDate);
                const sourceQuarter = item.quarter ?? "Q1";
                return actualQuarter === quarter && sourceQuarter !== quarter;
              })
              .sort((a, b) => {
                const byActual = (
                  a.actualEndDate ?? "9999-12-31"
                ).localeCompare(b.actualEndDate ?? "9999-12-31", "en");
                if (byActual !== 0) return byActual;
                return sortByPlannedEndDate(a, b);
              })
              .map<QuarterPlanViewItem>((item) => ({
                item,
                isMirror: true,
                sourceQuarter: item.quarter ?? "Q1",
              }))
          : [];

        return { quarter, primaryItems, mirroredItems };
      }),
    [crossQuarterMode, planItems, quarters],
  );

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
          <button
            type="button"
            className={`adp-plan-view-toggle${crossQuarterMode ? " active" : ""}`}
            onClick={() => setCrossQuarterMode((v) => !v)}
          >
            {crossQuarterMode ? "隱藏跨季映射" : "跨季追蹤"}
          </button>
        </div>
      </div>

      {quarterGroups.map(({ quarter, primaryItems, mirroredItems }) => {
        const visibleItems = [...primaryItems, ...mirroredItems];
        return (
          <div key={quarter} className="adp-plan-quarter">
            <div className="adp-plan-quarter-header">
              <span className="adp-plan-q-label">{quarter}</span>
              <span className="adp-plan-q-count">
                {visibleItems.filter((entry) => entry.item.completed).length}/
                {visibleItems.length}
              </span>
            </div>

            {visibleItems.length === 0 && (
              <div className="adp-empty-hint adp-plan-empty">
                {isReadOnly ? "此季度無計畫項目" : "點擊「＋」新增行動項目"}
              </div>
            )}

            {primaryItems.map(({ item }) => (
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

            {mirroredItems.length > 0 && (
              <div className="adp-plan-mirror-block">
                <div className="adp-plan-mirror-label">跨季完成（唯讀）</div>
                {mirroredItems.map(({ item, sourceQuarter }) => (
                  <PlanItemRow
                    key={`${quarter}:${item.id}:mirror`}
                    item={item}
                    allPlanItems={planItems}
                    warnDaysBefore={warnDaysBefore}
                    isReadOnly
                    showQuarterTag
                    mirrorFromQuarter={sourceQuarter}
                    onPatch={() => {}}
                    onDelete={() => {}}
                  />
                ))}
              </div>
            )}

            {!isReadOnly && (
              <button
                className="adp-plan-add-btn"
                onClick={() => onRequestAdd(quarter)}
              >
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
  showQuarterTag = false,
  mirrorFromQuarter,
  onPatch,
  onDelete,
}: {
  item: ActivityPlanItem;
  allPlanItems: ActivityPlanItem[];
  warnDaysBefore: number;
  isReadOnly: boolean;
  showQuarterTag?: boolean;
  mirrorFromQuarter?: string;
  onPatch: (c: Partial<ActivityPlanItem>) => void;
  onDelete: () => void;
}) {
  const warnType = getPlanItemWarning(item, warnDaysBefore);
  const lateCompletion = isLateCompletion(item);
  const plannedQuarterMismatch = isPlannedEndDateOutsideQuarter(item);
  const dependsOnIds = item.dependsOnIds ?? [];
  const depCandidates = allPlanItems.filter((p) => p.id !== item.id);
  const [showEventDates, setShowEventDates] = useState(
    !!(item.eventStartDate || item.eventEndDate),
  );

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
              ...(checked
                ? {
                    actualEndDate:
                      item.actualEndDate ||
                      new Date().toISOString().slice(0, 10),
                  }
                : {}),
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

      {showQuarterTag && (
        <div className="adp-plan-item-meta">
          <span className="adp-plan-badge adp-plan-badge-quarter">
            {(item.quarter ?? "Q1").toUpperCase()}
          </span>
          {mirrorFromQuarter && (
            <span className="synced-badge synced-badge-sm">
              來自 {mirrorFromQuarter}
            </span>
          )}
        </div>
      )}

      <div className="adp-plan-item-meta">
        <span className="adp-plan-meta-label">預計完成：</span>
        <input
          className="adp-input adp-input-sm adp-plan-date"
          type="date"
          value={item.plannedEndDate ?? ""}
          disabled={isReadOnly}
          onChange={(e) => {
            const val = e.target.value || undefined;
            onPatch({
              plannedEndDate: val,
              // 清除日期時同步取消月曆顯示
              ...(val ? {} : { showInCalendar: false }),
            });
          }}
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
        {lateCompletion && (
          <span className="adp-plan-badge late">⏰ 延遲完成</span>
        )}
        {plannedQuarterMismatch && (
          <span className="adp-plan-badge invalid-quarter">
            ❗ 預計完成日不在 {(item.quarter ?? "Q1").toUpperCase()}
          </span>
        )}
        {item.owner !== undefined && (
          <span className="adp-plan-owner">{item.owner}</span>
        )}
      </div>

      {/* 備註：唯讀且空白時隱藏 */}
      {(!isReadOnly || item.notes) && (
        <div className="adp-plan-item-notes">
          {isReadOnly ? (
            <span className="adp-plan-notes-text">{item.notes}</span>
          ) : (
            <textarea
              className="adp-plan-notes-input"
              value={item.notes ?? ""}
              rows={1}
              placeholder="備註…"
              onChange={(e) => onPatch({ notes: e.target.value || undefined })}
            />
          )}
        </div>
      )}

      {/* 執行期間：記錄活動實際起訖日（不同於任務截止日） */}
      {showEventDates || item.eventStartDate || item.eventEndDate ? (
        <div className="adp-plan-item-meta adp-plan-item-event-dates">
          <span className="adp-plan-meta-label adp-plan-event-label">
            執行期間：
          </span>
          <input
            className="adp-input adp-input-sm adp-plan-date"
            type="date"
            value={item.eventStartDate ?? ""}
            disabled={isReadOnly}
            title="執行開始日"
            onChange={(e) =>
              onPatch({ eventStartDate: e.target.value || undefined })
            }
          />
          <span className="adp-plan-event-sep">～</span>
          <input
            className="adp-input adp-input-sm adp-plan-date"
            type="date"
            value={item.eventEndDate ?? ""}
            disabled={isReadOnly}
            title="執行結束日"
            onChange={(e) =>
              onPatch({ eventEndDate: e.target.value || undefined })
            }
          />
          {/* 月曆勾選：需有執行開始日才可啟用 */}
          <label
            className={`adp-plan-calendar-toggle${!item.eventStartDate ? " disabled" : ""}`}
            title={
              !item.eventStartDate
                ? "需先設定「執行開始日」才能加入月曆"
                : item.showInCalendar
                  ? "點擊取消在月曆顯示"
                  : "點擊後將在月曆顯示此執行期間"
            }
          >
            <input
              type="checkbox"
              checked={item.showInCalendar ?? false}
              disabled={isReadOnly || !item.eventStartDate}
              onChange={(e) => onPatch({ showInCalendar: e.target.checked })}
            />
            <span>📅 月曆</span>
          </label>
          {!isReadOnly && (
            <button
              className="adp-plan-event-clear"
              title="清除執行期間"
              onClick={() => {
                setShowEventDates(false);
                onPatch({
                  eventStartDate: undefined,
                  eventEndDate: undefined,
                  showInCalendar: false,
                });
              }}
            >
              ✕
            </button>
          )}
        </div>
      ) : !isReadOnly ? (
        <div className="adp-plan-item-meta">
          <button
            className="adp-plan-event-add"
            onClick={() => setShowEventDates(true)}
          >
            + 執行期間
          </button>
        </div>
      ) : null}

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
