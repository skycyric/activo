import type { WorkspaceData } from "../../schemas/ogsm";
import type { ActivityWithContext } from "../ActivityPage";

export interface ActivityFilterState {
  deptId: string;
  periodId: string;
  goalId: string;
  status: string;
  owner: string;
  keyword: string;
}

const EMPTY_FILTERS: ActivityFilterState = {
  deptId: "",
  periodId: "",
  goalId: "",
  status: "",
  owner: "",
  keyword: "",
};

const STATUS_LABELS: Record<string, string> = {
  "not-started": "未開始",
  attention: "注意",
  "in-progress": "進行中",
  completed: "已完成",
};

interface Props {
  workspace: WorkspaceData;
  allActivities: ActivityWithContext[];
  filters: ActivityFilterState;
  onChange: (f: ActivityFilterState) => void;
}

export default function ActivityFilters({
  workspace,
  allActivities,
  filters,
  onChange,
}: Props) {
  const set = (key: keyof ActivityFilterState, value: string) => {
    const next = { ...filters, [key]: value };
    // Cascade reset on narrowing filter
    if (key === "deptId") {
      next.periodId = "";
      next.goalId = "";
    }
    if (key === "periodId") {
      next.goalId = "";
    }
    onChange(next);
  };

  const depts = workspace.departments;
  const activeDept = filters.deptId
    ? depts.find((d) => d.id === filters.deptId)
    : null;
  const periods = activeDept
    ? activeDept.periods
    : depts.flatMap((d) => d.periods);
  const activePeriod = filters.periodId
    ? periods.find((p) => p.id === filters.periodId)
    : null;

  // Dedupe goals across periods
  const goalMap = new Map<
    string,
    { id: string; label: string; title: string }
  >();
  const sourceGoals = activePeriod
    ? activePeriod.ogsm.goals
    : periods.flatMap((p) => p.ogsm.goals);
  for (const g of sourceGoals) {
    if (!goalMap.has(g.id)) goalMap.set(g.id, g);
  }
  const goals = Array.from(goalMap.values());

  const owners = Array.from(
    new Set(allActivities.map((a) => a.owner ?? "").filter(Boolean)),
  ).sort();

  const hasFilter = Object.values(filters).some((v) => v !== "");

  return (
    <div className="activity-filters">
      <div className="activity-filters-row">
        <select
          className="activity-filter-select"
          value={filters.deptId}
          onChange={(e) => set("deptId", e.target.value)}
        >
          <option value="">所有部門</option>
          {depts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <select
          className="activity-filter-select"
          value={filters.periodId}
          onChange={(e) => set("periodId", e.target.value)}
        >
          <option value="">所有期別</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.year} {p.halfYear}
            </option>
          ))}
        </select>

        <select
          className="activity-filter-select"
          value={filters.goalId}
          onChange={(e) => set("goalId", e.target.value)}
        >
          <option value="">所有目標</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label} {g.title}
            </option>
          ))}
        </select>

        <select
          className="activity-filter-select"
          value={filters.status}
          onChange={(e) => set("status", e.target.value)}
        >
          <option value="">所有狀態</option>
          {Object.entries(STATUS_LABELS).map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>

        <select
          className="activity-filter-select"
          value={filters.owner}
          onChange={(e) => set("owner", e.target.value)}
        >
          <option value="">所有主責</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <input
          className="activity-filter-input"
          type="text"
          placeholder="關鍵字搜尋…"
          value={filters.keyword}
          onChange={(e) => set("keyword", e.target.value)}
        />

        {hasFilter && (
          <button
            className="activity-filter-clear"
            onClick={() => onChange(EMPTY_FILTERS)}
            title="清除所有篩選"
          >
            ✕ 清除
          </button>
        )}
      </div>
    </div>
  );
}
