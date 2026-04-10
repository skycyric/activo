import type { WorkspaceData } from "../../schemas/ogsm";
import type { ActivityWithContext } from "../ActivityPage";

export interface ActivityFilterState {
  deptId: string;
  teamId: string;
  owner: string;
  goalId: string;
  strategyId: string;
  status: string;
  startFrom: string;
  endTo: string;
  keyword: string;
}

export const EMPTY_ACTIVITY_FILTERS: ActivityFilterState = {
  deptId: "",
  teamId: "",
  owner: "",
  goalId: "",
  strategyId: "",
  status: "",
  startFrom: "",
  endTo: "",
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
    // Cascade reset on narrowing
    if (key === "deptId") {
      next.goalId = "";
      next.strategyId = "";
      next.teamId = "";
    }
    if (key === "goalId") {
      next.strategyId = "";
    }
    onChange(next);
  };

  const depts = workspace.departments;
  const activeDept = filters.deptId
    ? depts.find((d) => d.id === filters.deptId)
    : null;
  const sourceDepts = activeDept ? [activeDept] : depts;

  // Teams scoped to selected dept (or all)
  const allTeams = workspace.teams ?? [];
  const teams = activeDept
    ? allTeams.filter((t) => !t.deptId || t.deptId === activeDept.id)
    : allTeams;

  // Goals deduped by id
  const goalMap = new Map<
    string,
    { id: string; label: string; title: string }
  >();
  for (const dept of sourceDepts) {
    for (const period of dept.periods) {
      for (const g of period.ogsm.goals) {
        if (!goalMap.has(g.id)) goalMap.set(g.id, g);
      }
    }
  }
  const goals = Array.from(goalMap.values());

  // Strategies deduped by id, narrowed by goalId if set
  const stratMap = new Map<string, { id: string; title: string }>();
  for (const dept of sourceDepts) {
    for (const period of dept.periods) {
      for (const g of period.ogsm.goals) {
        if (filters.goalId && g.id !== filters.goalId) continue;
        for (const s of g.strategies) {
          if (!stratMap.has(s.id))
            stratMap.set(s.id, { id: s.id, title: s.title });
        }
      }
    }
  }
  const strategies = Array.from(stratMap.values());

  // Owners from visible activities — include both a.owner and a.owners[]
  const owners = Array.from(
    new Set(
      allActivities
        .flatMap((a) => [
          a.owner ?? "",
          ...((a as { owners?: string[] }).owners ?? []),
        ])
        .filter(Boolean),
    ),
  ).sort();

  const hasFilter = Object.values(filters).some((v) => v !== "");

  return (
    <div className="activity-filters">
      <div className="activity-filters-row">
        {/* 部門 */}
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

        {/* 團隊 */}
        {teams.length > 0 && (
          <select
            className="activity-filter-select"
            value={filters.teamId}
            onChange={(e) => set("teamId", e.target.value)}
          >
            <option value="">所有團隊</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}

        {/* 主責 */}
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

        {/* 目標 */}
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

        {/* 策略 */}
        <select
          className="activity-filter-select"
          value={filters.strategyId}
          onChange={(e) => set("strategyId", e.target.value)}
        >
          <option value="">所有策略</option>
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>

        {/* 狀態 */}
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

        {/* 開始日期 ≥ */}
        <div className="activity-filter-date-group">
          <span className="activity-filter-date-label">開始 ≥</span>
          <input
            className="activity-filter-date"
            type="date"
            value={filters.startFrom}
            onChange={(e) => set("startFrom", e.target.value)}
          />
        </div>

        {/* 結束日期 ≤ */}
        <div className="activity-filter-date-group">
          <span className="activity-filter-date-label">結束 ≤</span>
          <input
            className="activity-filter-date"
            type="date"
            value={filters.endTo}
            onChange={(e) => set("endTo", e.target.value)}
          />
        </div>

        {/* 關鍵字 */}
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
            onClick={() => onChange(EMPTY_ACTIVITY_FILTERS)}
            title="清除所有篩選"
          >
            ✕ 清除
          </button>
        )}
      </div>
    </div>
  );
}
