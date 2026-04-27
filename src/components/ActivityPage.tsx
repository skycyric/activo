import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { WorkspaceData, DeptActivity } from "../schemas/ogsm";
import ActivityFilters from "./activity/ActivityFilters";
import {
  type ActivityFilterState,
  EMPTY_ACTIVITY_FILTERS,
} from "./activity/activityFilterState";
import ActivityTable from "./activity/ActivityTable";
import ActivityKanban from "./activity/ActivityKanban";
import ActivityCardGrid from "./activity/ActivityCardGrid";
import ActivityGantt from "./activity/ActivityGantt";
import ActivityPlanGantt from "./activity/ActivityPlanGantt";
import ActivityCalendar from "./activity/ActivityCalendar";
import ActivityGraphView from "./activity/ActivityGraphView";
import ActivityAddModal from "./activity/ActivityAddModal";
import ActivityDetailPanel from "./ActivityDetailPanel";
import { hasCanonicalDeptActivities } from "../utils/activityCompat";
import { useTour } from "../contexts/TourContext";

export interface ActivityWithContext extends DeptActivity {
  deptId: string;
  deptName: string;
  /** 來自 ogsmLink.periodId，或空字串（standalone 活動）*/
  periodId: string;
  /** 來自 OGSM 期間標籤，如「2026 H1」；standalone 活動為空字串 */
  periodLabel: string;
  /** 來自 ogsmLink.goalId，或空字串 */
  goalId: string;
  /** 目標標題字串；standalone 活動為空字串 */
  goalTitle: string;
  /** 來自 ogsmLink.strategyId，或空字串 */
  strategyId: string;
  /** 策略標題字串；standalone 活動為空字串 */
  strategyTitle: string;
  isReadOnly: boolean;
}

type ActivityView =
  | "table"
  | "kanban"
  | "gantt"
  | "cards"
  | "calendar"
  | "graph";

const EMPTY_FILTERS = EMPTY_ACTIVITY_FILTERS;

const VIEWS: { id: ActivityView; label: string; icon: string }[] = [
  { id: "table", label: "列表", icon: "☰" },
  { id: "kanban", label: "看板", icon: "▦" },
  { id: "gantt", label: "甘特", icon: "▬" },
  { id: "cards", label: "卡片牆", icon: "⊞" },
  { id: "calendar", label: "月曆", icon: "📅" },
  { id: "graph", label: "關聯圖", icon: "○" },
];

interface Props {
  workspace: WorkspaceData;
  activeDeptId: string;
  view?: ActivityView;
  ganttSubView?: "activity" | "plan";
  onViewChange?: (view: ActivityView) => void;
  onGanttSubViewChange?: (view: "activity" | "plan") => void;
  readOnlyDeptIds?: string[];
  onUpdateActivity: (deptId: string, activity: DeptActivity) => void;
  onDeleteActivity: (deptId: string, activityId: string) => void;
  onAddActivity: (deptId: string, activity: DeptActivity) => void;
  onJumpToActivity: (
    deptId: string,
    activityId: string,
    routeHint?: {
      activityPageView?: ActivityView;
      activityGanttSubView?: "activity" | "plan";
    },
  ) => void;
  /** 從外部（DetailPanel M tab）預先開啟某活動 ID */
  initialSelectedActivityId?: string | null;
  /** controlled detail id 變更回呼（含關閉時傳 null） */
  onSelectedActivityIdChange?: (activityId: string | null) => void;
}

export default function ActivityPage({
  workspace,
  activeDeptId,
  view: controlledView,
  ganttSubView: controlledGanttSubView,
  onViewChange,
  onGanttSubViewChange,
  readOnlyDeptIds,
  onUpdateActivity,
  onDeleteActivity,
  onAddActivity,
  onJumpToActivity,
  initialSelectedActivityId,
  onSelectedActivityIdChange,
}: Props) {
  const { startPageTour, isActive, step } = useTour();
  const [internalView, setInternalView] = useState<ActivityView>(
    controlledView ?? "table",
  );
  const [internalGanttSubView, setInternalGanttSubView] = useState<
    "activity" | "plan"
  >(controlledGanttSubView ?? "activity");
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState<ActivityFilterState>(() => ({
    ...EMPTY_FILTERS,
    owners: (() => {
      try {
        const raw = localStorage.getItem("activo_filter_owners");
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
          ? parsed.filter((x): x is string => typeof x === "string")
          : [];
      } catch {
        return [];
      }
    })(),
  }));
  const [localExpandedId, setLocalExpandedId] = useState<string | null>(null);
  const [localSelectedActivityId, setLocalSelectedActivityId] = useState<
    string | null
  >(initialSelectedActivityId ?? null);

  const isViewControlled = controlledView !== undefined;
  const isGanttSubViewControlled = controlledGanttSubView !== undefined;
  const isDetailControlled = initialSelectedActivityId !== undefined;
  const forcedDetailTab =
    isActive && step?.page === "activity"
      ? ((
          {
            "activity-detail-basic": "basic",
            "activity-detail-kpi": "kpi",
            "activity-detail-plans": "plans",
            "activity-detail-notes": "notes",
          } as const
        )[step.id] ?? null)
      : null;

  /** Tracks whether the currently open detail panel has unsaved changes. */
  const panelDirtyRef = useRef(false);

  const view = controlledView ?? internalView;
  const ganttSubView = controlledGanttSubView ?? internalGanttSubView;
  const selectedActivityId = isDetailControlled
    ? (initialSelectedActivityId ?? null)
    : localSelectedActivityId;
  const expandedId = isDetailControlled
    ? (initialSelectedActivityId ?? null)
    : localExpandedId;

  /** Returns false (and shows a confirm) if the panel is dirty and the user cancels switching. */
  const confirmSwitchAway = useCallback(
    (nextId: string | null) =>
      nextId === null ||
      nextId === selectedActivityId ||
      !panelDirtyRef.current ||
      window.confirm("有尚未儲存的修改，切換後將會放棄，確定繼續嗎？"),
    [selectedActivityId],
  );

  const setView = useCallback(
    (next: ActivityView) => {
      if (!isViewControlled) setInternalView(next);
      onViewChange?.(next);
    },
    [isViewControlled, onViewChange],
  );

  const setGanttSubView = useCallback(
    (next: "activity" | "plan") => {
      if (!isGanttSubViewControlled) setInternalGanttSubView(next);
      onGanttSubViewChange?.(next);
    },
    [isGanttSubViewControlled, onGanttSubViewChange],
  );

  const handleOpenActivityDetail = useCallback(
    (deptId: string, activityId: string) => {
      onViewChange?.(view);
      onGanttSubViewChange?.(ganttSubView);
      onJumpToActivity(deptId, activityId, {
        activityPageView: view,
        activityGanttSubView: ganttSubView,
      });
    },
    [ganttSubView, onGanttSubViewChange, onJumpToActivity, onViewChange, view],
  );

  // Persist owner filters to localStorage
  useEffect(() => {
    try {
      if (filters.owners.length > 0) {
        localStorage.setItem(
          "activo_filter_owners",
          JSON.stringify(filters.owners),
        );
      } else {
        localStorage.removeItem("activo_filter_owners");
      }
    } catch {
      // best-effort
    }
  }, [filters.owners]);

  // Table row selection should open/close panel and keep one expanded row.
  const handleSetExpandedId = useCallback(
    (id: string | null) => {
      if (!confirmSwitchAway(id)) return;
      panelDirtyRef.current = false;
      if (!isDetailControlled) {
        setLocalExpandedId(id);
        setLocalSelectedActivityId(id);
      }
      if (id !== null) setView("table");
    },
    [confirmSwitchAway, isDetailControlled, setView],
  );

  // Open activity detail panel (without forcing table view)
  const handleSelectActivity = useCallback(
    (id: string | null) => {
      if (!confirmSwitchAway(id)) return;
      panelDirtyRef.current = false;
      if (!isDetailControlled) {
        setLocalSelectedActivityId(id);
        setLocalExpandedId(id); // keep table row highlight in sync
      }
      onSelectedActivityIdChange?.(id);
    },
    [confirmSwitchAway, isDetailControlled, onSelectedActivityIdChange],
  );

  // Flatten all activities from all depts.
  // Compatibility contract: prefer canonical dept.activities, and only read
  // legacy strategy.measures when a department has not been materialized into
  // the activity-first model yet.
  const allActivities = useMemo<ActivityWithContext[]>(() => {
    const result: ActivityWithContext[] = [];
    for (const dept of workspace.departments) {
      const isReadOnly = readOnlyDeptIds?.includes(dept.id) ?? false;
      const isCrossDept = dept.id !== activeDeptId;

      // 建立 OGSM 上下文查找表："periodId|goalId|strategyId" → 顯示標籤
      type OgsmCtx = {
        periodLabel: string;
        goalTitle: string;
        strategyTitle: string;
      };
      const ogsmCtx = new Map<string, OgsmCtx>();
      for (const period of dept.periods) {
        const periodLabel = `${period.year} ${period.halfYear}`;
        for (const goal of period.ogsm.goals) {
          for (const strategy of goal.strategies) {
            ogsmCtx.set(`${period.id}|${goal.id}|${strategy.id}`, {
              periodLabel,
              goalTitle: goal.title,
              strategyTitle: strategy.title,
            });
          }
        }
      }

      if (hasCanonicalDeptActivities(dept)) {
        // ─ Activity-first 路徑（遷移後）────────────────────────────────
        for (const activity of dept.activities ?? []) {
          const ogsmLinks = (activity.dashboardLinks ?? []).filter(
            (l) => l.type === "ogsm",
          );
          const firstLink = ogsmLinks[0];
          const ogsmCtxList = ogsmLinks
            .map((link) =>
              ogsmCtx.get(`${link.periodId}|${link.goalId}|${link.strategyId}`),
            )
            .filter(
              (
                x,
              ): x is {
                periodLabel: string;
                goalTitle: string;
                strategyTitle: string;
              } => !!x,
            );
          const unique = (vals: string[]) =>
            Array.from(new Set(vals.filter(Boolean)));
          result.push({
            ...activity,
            // 相容未遷移資料：有 dashboardLink 但 frameworks 未設則補為 ogsm
            frameworks:
              activity.frameworks && activity.frameworks.length > 0
                ? activity.frameworks
                : ogsmLinks.length > 0
                  ? ["ogsm"]
                  : undefined,
            deptId: dept.id,
            deptName: dept.name,
            isReadOnly: isReadOnly || isCrossDept,
            // 相容既有欄位：保留第一筆 id 做篩選；文字顯示改為多筆合併
            periodId: firstLink?.periodId ?? "",
            periodLabel: unique(ogsmCtxList.map((c) => c.periodLabel)).join(
              "、",
            ),
            goalId: firstLink?.goalId ?? "",
            goalTitle: unique(ogsmCtxList.map((c) => c.goalTitle)).join("、"),
            strategyId: firstLink?.strategyId ?? "",
            strategyTitle: unique(ogsmCtxList.map((c) => c.strategyTitle)).join(
              "、",
            ),
          });
        }
      } else {
        // ─ Fallback：遷移前舊 OGSM 遍歷路徑──────────────────────────────
        for (const period of dept.periods) {
          const periodLabel = `${period.year} ${period.halfYear}`;
          for (const goal of period.ogsm.goals) {
            for (const strategy of goal.strategies) {
              for (const measure of strategy.measures) {
                const mRaw = measure as unknown as { frameworks?: string[] };
                result.push({
                  ...measure,
                  // 舊格式 measures 必屬於 OGSM
                  frameworks: mRaw.frameworks?.length
                    ? mRaw.frameworks
                    : ["ogsm"],
                  deptId: dept.id,
                  deptName: dept.name,
                  periodId: period.id,
                  periodLabel,
                  goalId: goal.id,
                  goalTitle: goal.title,
                  strategyId: strategy.id,
                  strategyTitle: strategy.title,
                  isReadOnly: isReadOnly || isCrossDept,
                });
              }
            }
          }
        }
      }
    }
    return result;
  }, [workspace, readOnlyDeptIds, activeDeptId]);

  const departments = workspace.departments;
  const teams = useMemo(() => workspace.teams ?? [], [workspace.teams]);

  // Apply filters
  const filtered = useMemo<ActivityWithContext[]>(() => {
    const deptSet = new Set(filters.deptIds);
    const teamSet = new Set(filters.teamIds);
    const ownerSet = new Set(filters.owners);
    const frameworkSet = new Set(filters.frameworks);
    const periodSet = new Set(filters.periodIds);
    const goalSet = new Set(filters.goalIds);
    const strategySet = new Set(filters.strategyIds);
    const statusSet = new Set(filters.statuses);

    const periodLabelById = new Map<string, string>();
    for (const dept of departments) {
      for (const period of dept.periods) {
        periodLabelById.set(period.id, `${period.year} ${period.halfYear}`);
      }
    }

    // Pre-build member names for selected teams (for owner-based matching)
    const selectedTeamMemberNames =
      teamSet.size > 0
        ? new Set(
            teams
              .filter((t) => teamSet.has(t.id))
              .flatMap((t) => t.members)
              .map((m) => m.name),
          )
        : null;

    return allActivities.filter((a) => {
      if (deptSet.size > 0 && !deptSet.has(a.deptId)) return false;

      if (teamSet.size > 0 && selectedTeamMemberNames) {
        const isAssistUnit = a.assistUnits?.some(
          (u) => u.type === "team" && teamSet.has(u.id),
        );
        const ownerInTeam =
          (a.owner && selectedTeamMemberNames.has(a.owner)) ||
          (a as { owners?: string[] }).owners?.some((o) =>
            selectedTeamMemberNames.has(o),
          );
        if (!isAssistUnit && !ownerInTeam) return false;
      }

      if (ownerSet.size > 0) {
        const ownerList: string[] = [
          a.owner ?? "",
          ...((a as { owners?: string[] }).owners ?? []),
        ];
        if (!ownerList.some((owner) => ownerSet.has(owner))) return false;
      }

      if (frameworkSet.size > 0) {
        const fw = a.frameworks ?? [];
        const hasOgsmLink = (a.dashboardLinks ?? []).some(
          (l) => l.type === "ogsm",
        );

        const isNone = fw.length === 0 && !hasOgsmLink && !a.strategyId;
        const matchedFrameworks = new Set<string>(fw);
        if (hasOgsmLink || a.strategyId) matchedFrameworks.add("ogsm");
        if (isNone) matchedFrameworks.add("_none");

        if (![...frameworkSet].some((value) => matchedFrameworks.has(value))) {
          return false;
        }
      }

      const ogsmLinks = (a.dashboardLinks ?? []).filter(
        (l) => l.type === "ogsm",
      );
      if (periodSet.size > 0 || goalSet.size > 0 || strategySet.size > 0) {
        const matchesOgsmLink = ogsmLinks.some((link) => {
          if (periodSet.size > 0) {
            const label = periodLabelById.get(link.periodId ?? "") ?? "";
            if (!periodSet.has(label)) return false;
          }
          if (goalSet.size > 0 && !goalSet.has(link.goalId ?? "")) return false;
          if (strategySet.size > 0 && !strategySet.has(link.strategyId ?? ""))
            return false;
          return true;
        });

        const activityPeriodLabelSet = new Set(
          (a.periodLabel || "")
            .split("、")
            .map((x) => x.trim())
            .filter(Boolean),
        );

        // 舊資料 fallback：沒有 dashboardLinks 時用扁平欄位判斷
        const matchesLegacy =
          ogsmLinks.length === 0 &&
          (periodSet.size === 0 ||
            [...periodSet].some((label) =>
              activityPeriodLabelSet.has(label),
            )) &&
          (goalSet.size === 0 || goalSet.has(a.goalId)) &&
          (strategySet.size === 0 || strategySet.has(a.strategyId));

        if (!matchesOgsmLink && !matchesLegacy) return false;
      }

      if (statusSet.size > 0 && !statusSet.has(a.status ?? "")) return false;
      if (filters.tags.length > 0) {
        const actTags = new Set(a.tags ?? []);
        if (!filters.tags.some((t) => actTags.has(t))) return false;
      }
      if (filters.startFrom && a.startDate && a.startDate < filters.startFrom)
        return false;
      if (filters.endTo && a.endDate && a.endDate > filters.endTo) return false;
      if (filters.keyword) {
        const kw = filters.keyword.toLowerCase();
        const haystack = [
          a.rawText,
          a.description ?? "",
          a.owner ?? "",
          a.goalTitle,
          a.strategyTitle,
          a.deptName,
          ...(a.tags ?? []),
          ...(a.assistUnits?.map((u) => u.name) ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });
  }, [allActivities, departments, filters, teams]);

  const hasFilter =
    filters.deptIds.length > 0 ||
    filters.teamIds.length > 0 ||
    filters.owners.length > 0 ||
    filters.frameworks.length > 0 ||
    filters.periodIds.length > 0 ||
    filters.goalIds.length > 0 ||
    filters.strategyIds.length > 0 ||
    filters.statuses.length > 0 ||
    filters.tags.length > 0 ||
    filters.startFrom !== "" ||
    filters.endTo !== "" ||
    filters.keyword !== "";

  // Resolve selected activity from allActivities
  const selectedActivity = selectedActivityId
    ? (allActivities.find((a) => a.id === selectedActivityId) ?? null)
    : null;

  const isActiveDeptReadOnly = readOnlyDeptIds?.includes(activeDeptId) ?? false;

  useEffect(() => {
    if (!isActive || step?.page !== "activity") return;

    const detailStepIds = new Set([
      "activity-detail-tabs",
      "activity-detail-basic",
      "activity-detail-kpi",
      "activity-detail-plans",
      "activity-detail-notes",
    ]);
    const shouldShowAddModal =
      step.id === "activity-add-modal" || step.id === "activity-add-ogsm-link";

    setShowAddModal(shouldShowAddModal);

    if (step.id === "activity-gantt-subtabs") {
      setView("gantt");
      setGanttSubView("activity");
      return;
    }

    if (step.id === "activity-card-detail") {
      setView("cards");
      return;
    }

    if (!detailStepIds.has(step.id)) return;

    const nextActivity =
      selectedActivity ?? filtered[0] ?? allActivities[0] ?? null;
    if (!nextActivity || nextActivity.id === selectedActivityId) return;

    panelDirtyRef.current = false;
    if (!isDetailControlled) {
      setLocalSelectedActivityId(nextActivity.id);
      setLocalExpandedId(nextActivity.id);
    }
    onSelectedActivityIdChange?.(nextActivity.id);
  }, [
    allActivities,
    filtered,
    isActive,
    isDetailControlled,
    onSelectedActivityIdChange,
    selectedActivity,
    selectedActivityId,
    setGanttSubView,
    setView,
    step,
  ]);

  return (
    <div className="activity-page">
      {/* Page header */}
      <div className="activity-page-header">
        <div className="activity-title-row">
          <h2 className="activity-page-title">活動總覽</h2>
          <span
            className="activity-count-badge"
            data-tour="activity-count-badge"
          >
            {hasFilter
              ? `${filtered.length} / ${allActivities.length}`
              : allActivities.length}{" "}
            個活動
          </span>
        </div>
        <div className="activity-header-right">
          <button
            className="page-tour-btn"
            onClick={() => startPageTour("activity")}
          >
            🔎 本頁導覽
          </button>
          <div
            className="activity-view-tabs"
            data-tour="activity-view-switcher"
          >
            {VIEWS.map((v) => (
              <button
                key={v.id}
                className={`activity-view-tab${view === v.id ? " active" : ""}`}
                onClick={() => setView(v.id)}
                title={v.label}
              >
                <span className="activity-view-tab-icon">{v.icon}</span>
                <span className="activity-view-tab-label">{v.label}</span>
              </button>
            ))}
          </div>
          <button
            className="activity-add-btn"
            data-tour="activity-add-btn"
            onClick={() => setShowAddModal(true)}
            disabled={isActiveDeptReadOnly}
            title={isActiveDeptReadOnly ? "目前部門為唯讀" : "新增活動"}
          >
            ＋ 新增活動
          </button>
        </div>
      </div>

      {/* Filters */}
      <div data-tour="activity-filter">
        <ActivityFilters
          workspace={workspace}
          filters={filters}
          tagDictionary={workspace.tagDictionary}
          onChange={setFilters}
        />
      </div>

      {/* View area + detail panel (two-column) */}
      <div className="activity-main-row">
        <div className="activity-view-area">
          {view === "table" && (
            <ActivityTable
              activities={filtered}
              allActivities={allActivities}
              workspace={workspace}
              expandedId={expandedId}
              onSetExpandedId={handleSetExpandedId}
              ownerFilter={filters.owners.join("、")}
              onUpdateActivity={onUpdateActivity}
              onDeleteActivity={onDeleteActivity}
              onJumpToActivity={handleOpenActivityDetail}
            />
          )}
          {view === "kanban" && (
            <ActivityKanban
              activities={filtered}
              allActivities={allActivities}
              onUpdateActivity={onUpdateActivity}
              onJumpToActivity={handleOpenActivityDetail}
            />
          )}
          {view === "gantt" && (
            <div className="activity-gantt-shell">
              <div
                className="activity-gantt-subtabs"
                data-tour="activity-gantt-subtabs"
              >
                <button
                  className={`activity-gantt-subtab${ganttSubView === "activity" ? " active" : ""}`}
                  onClick={() => setGanttSubView("activity")}
                >
                  活動甘特
                </button>
                <button
                  className={`activity-gantt-subtab${ganttSubView === "plan" ? " active" : ""}`}
                  onClick={() => setGanttSubView("plan")}
                >
                  計畫甘特
                </button>
              </div>

              {ganttSubView === "activity" ? (
                <ActivityGantt
                  activities={filtered}
                  allActivities={allActivities}
                  onJumpToActivity={handleOpenActivityDetail}
                />
              ) : (
                <ActivityPlanGantt
                  activities={filtered}
                  onJumpToActivity={handleOpenActivityDetail}
                />
              )}
            </div>
          )}
          {view === "cards" && (
            <ActivityCardGrid
              activities={filtered}
              allActivities={allActivities}
              onUpdateActivity={onUpdateActivity}
              onJumpToActivity={handleOpenActivityDetail}
            />
          )}
          {view === "calendar" && (
            <ActivityCalendar
              activities={filtered}
              onJumpToActivity={handleOpenActivityDetail}
            />
          )}
          {view === "graph" && (
            <ActivityGraphView
              activities={filtered}
              allActivities={allActivities}
              tagDictionary={workspace.tagDictionary}
              onJumpToActivity={handleOpenActivityDetail}
            />
          )}
        </div>

        {/* Detail panel */}
        {selectedActivity && (
          <ActivityDetailPanel
            key={selectedActivity.id}
            activity={selectedActivity}
            deptId={selectedActivity.deptId}
            workspace={workspace}
            isReadOnly={selectedActivity.isReadOnly}
            warnDaysBefore={7}
            forcedTab={forcedDetailTab}
            initialPeriodId={selectedActivity.periodId || undefined}
            initialGoalId={selectedActivity.goalId || undefined}
            initialStrategyId={selectedActivity.strategyId || undefined}
            onDirtyChange={(d) => {
              panelDirtyRef.current = d;
            }}
            onUpdate={(deptId, act) => {
              onUpdateActivity(deptId, act);
            }}
            onDelete={(deptId, actId) => {
              onDeleteActivity(deptId, actId);
              handleSelectActivity(null);
            }}
            onClose={() => handleSelectActivity(null)}
          />
        )}
      </div>

      {/* Add modal */}
      {showAddModal && (
        <ActivityAddModal
          workspace={workspace}
          fixedDeptId={activeDeptId}
          onAdd={onAddActivity}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
