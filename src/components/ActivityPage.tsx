import { useState, useMemo, useCallback } from "react";
import type { WorkspaceData, Measure, DeptActivity } from "../schemas/ogsm";
import ActivityFilters, {
  type ActivityFilterState,
  EMPTY_ACTIVITY_FILTERS,
} from "./activity/ActivityFilters";
import ActivityTable from "./activity/ActivityTable";
import ActivityKanban from "./activity/ActivityKanban";
import ActivityCardGrid from "./activity/ActivityCardGrid";
import ActivityGantt from "./activity/ActivityGantt";
import ActivityCalendar from "./activity/ActivityCalendar";
import ActivityAddModal from "./activity/ActivityAddModal";

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

type ActivityView = "table" | "kanban" | "gantt" | "cards" | "calendar";

const EMPTY_FILTERS = EMPTY_ACTIVITY_FILTERS;

const VIEWS: { id: ActivityView; label: string; icon: string }[] = [
  { id: "table", label: "列表", icon: "☰" },
  { id: "kanban", label: "看板", icon: "▦" },
  { id: "gantt", label: "甘特", icon: "▬" },
  { id: "cards", label: "卡片牆", icon: "⊞" },
  { id: "calendar", label: "月曆", icon: "📅" },
];

interface Props {
  workspace: WorkspaceData;
  readOnlyDeptIds?: string[];
  onUpdateMeasure: (
    deptId: string,
    periodId: string,
    goalId: string,
    stratId: string,
    measure: Measure,
  ) => void;
  onDeleteMeasure: (
    deptId: string,
    periodId: string,
    goalId: string,
    stratId: string,
    measureId: string,
  ) => void;
  onAddMeasure: (
    deptId: string,
    periodId: string,
    goalId: string,
    stratId: string,
    measure: Measure,
  ) => void;
  onJumpToMeasure: (
    deptId: string,
    periodId: string,
    goalId: string,
    stratId: string,
    measureId: string,
  ) => void;
}

export default function ActivityPage({
  workspace,
  readOnlyDeptIds,
  onUpdateMeasure,
  onDeleteMeasure,
  onAddMeasure,
  onJumpToMeasure,
}: Props) {
  const [view, setView] = useState<ActivityView>("table");
  const [showAddModal, setShowAddModal] = useState(false);
  const [filters, setFilters] = useState<ActivityFilterState>(EMPTY_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // When a chip/card is clicked from non-table views, jump to table + expand
  const handleSetExpandedId = useCallback((id: string | null) => {
    setExpandedId(id);
    if (id !== null) setView("table");
  }, []);

  // Flatten all activities from all depts
  // Phase 3: 優先讀取 dept.activities[]（activity-first），遷移前 fallback 舊 OGSM 遍歷
  const allActivities = useMemo<ActivityWithContext[]>(() => {
    const result: ActivityWithContext[] = [];
    for (const dept of workspace.departments) {
      const isReadOnly = readOnlyDeptIds?.includes(dept.id) ?? false;

      // 建立 OGSM 上下文查找表："periodId|goalId|strategyId" → 顯示標籤
      type OgsmCtx = { periodLabel: string; goalTitle: string; strategyTitle: string };
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

      if (dept.activities && dept.activities.length > 0) {
        // ─ Activity-first 路徑（遷移後）────────────────────────────────
        for (const activity of dept.activities) {
          const link = activity.ogsmLink;
          const ctx = link
            ? ogsmCtx.get(`${link.periodId}|${link.goalId}|${link.strategyId}`)
            : undefined;
          result.push({
            ...activity,
            deptId: dept.id,
            deptName: dept.name,
            isReadOnly,
            periodId: link?.periodId ?? "",
            periodLabel: ctx?.periodLabel ?? "",
            goalId: link?.goalId ?? "",
            goalTitle: ctx?.goalTitle ?? "",
            strategyId: link?.strategyId ?? "",
            strategyTitle: ctx?.strategyTitle ?? "",
          });
        }
      } else {
        // ─ Fallback：遷移前舊 OGSM 遍歷路徑──────────────────────────────
        for (const period of dept.periods) {
          const periodLabel = `${period.year} ${period.halfYear}`;
          for (const goal of period.ogsm.goals) {
            for (const strategy of goal.strategies) {
              for (const measure of strategy.measures) {
                result.push({
                  ...measure,
                  deptId: dept.id,
                  deptName: dept.name,
                  periodId: period.id,
                  periodLabel,
                  goalId: goal.id,
                  goalTitle: goal.title,
                  strategyId: strategy.id,
                  strategyTitle: strategy.title,
                  isReadOnly,
                });
              }
            }
          }
        }
      }
    }
    return result;
  }, [workspace, readOnlyDeptIds]);

  // Apply filters
  const filtered = useMemo<ActivityWithContext[]>(() => {
    return allActivities.filter((a) => {
      if (filters.deptId && a.deptId !== filters.deptId) return false;
      if (
        filters.teamId &&
        !a.assistUnits?.some(
          (u) => u.type === "team" && u.id === filters.teamId,
        )
      )
        return false;
      if (filters.owner && a.owner !== filters.owner) return false;
      if (filters.goalId && a.goalId !== filters.goalId) return false;
      if (filters.strategyId && a.strategyId !== filters.strategyId)
        return false;
      if (filters.status && a.status !== filters.status) return false;
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
          ...(a.assistUnits?.map((u) => u.name) ?? []),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(kw)) return false;
      }
      return true;
    });
  }, [allActivities, filters]);

  const hasFilter = Object.values(filters).some((v) => v !== "");

  return (
    <div className="activity-page">
      {/* Page header */}
      <div className="activity-page-header">
        <div className="activity-title-row">
          <h2 className="activity-page-title">活動總覽</h2>
          <span className="activity-count-badge">
            {hasFilter
              ? `${filtered.length} / ${allActivities.length}`
              : allActivities.length}{" "}
            個活動
          </span>
        </div>
        <div className="activity-header-right">
          <div className="activity-view-tabs">
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
            onClick={() => setShowAddModal(true)}
          >
            ＋ 新增活動
          </button>
        </div>
      </div>

      {/* Filters */}
      <ActivityFilters
        workspace={workspace}
        allActivities={allActivities}
        filters={filters}
        onChange={setFilters}
      />

      {/* View area */}
      <div className="activity-view-area">
        {view === "table" && (
          <ActivityTable
            activities={filtered}
            allActivities={allActivities}
            workspace={workspace}
            expandedId={expandedId}
            onSetExpandedId={handleSetExpandedId}
            onUpdateMeasure={onUpdateMeasure}
            onDeleteMeasure={onDeleteMeasure}
            onJumpToMeasure={onJumpToMeasure}
          />
        )}
        {view === "kanban" && (
          <ActivityKanban
            activities={filtered}
            allActivities={allActivities}
            onUpdateMeasure={onUpdateMeasure}
            onJumpToMeasure={onJumpToMeasure}
          />
        )}
        {view === "gantt" && (
          <ActivityGantt
            activities={filtered}
            allActivities={allActivities}
            onJumpToMeasure={onJumpToMeasure}
          />
        )}
        {view === "cards" && (
          <ActivityCardGrid
            activities={filtered}
            allActivities={allActivities}
            onUpdateMeasure={onUpdateMeasure}
            onJumpToMeasure={onJumpToMeasure}
          />
        )}
        {view === "calendar" && (
          <ActivityCalendar
            activities={filtered}
            onJumpToMeasure={onJumpToMeasure}
          />
        )}
      </div>

      {/* Add modal */}
      {showAddModal && (
        <ActivityAddModal
          workspace={workspace}
          onAdd={onAddMeasure}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}
