import type { WorkspaceData } from "../../schemas/ogsm";

export interface ActivityFilterState {
  deptId: string;
  teamId: string;
  owner: string;
  framework: string;
  periodId: string;
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
  framework: "",
  periodId: "",
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

const FRAMEWORK_OPTIONS: { value: string; label: string }[] = [
  { value: "ogsm", label: "OGSM目標體系" },
  { value: "standalone", label: "其他（自由節點）" },
];

const FRAMEWORK_NONE = "_none";

interface Props {
  workspace: WorkspaceData;
  filters: ActivityFilterState;
  onChange: (f: ActivityFilterState) => void;
}

export default function ActivityFilters({
  workspace,
  filters,
  onChange,
}: Props) {
  const set = (key: keyof ActivityFilterState, value: string) => {
    const next = { ...filters, [key]: value };
    // Cascade reset on narrowing
    if (key === "deptId") {
      next.periodId = "";
      next.goalId = "";
      next.strategyId = "";
      next.teamId = "";
    }
    if (key === "framework" && value !== "ogsm") {
      next.periodId = "";
      next.goalId = "";
      next.strategyId = "";
    }
    if (key === "periodId") {
      next.goalId = "";
      next.strategyId = "";
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

  // Periods deduped by id, narrowed by framework=ogsm
  const periodMap = new Map<
    string,
    { id: string; year: number; halfYear: string; label: string }
  >();
  if (filters.framework === "ogsm") {
    for (const dept of sourceDepts) {
      for (const period of dept.periods) {
        if (!periodMap.has(period.id)) {
          periodMap.set(period.id, {
            id: period.id,
            year: period.year,
            halfYear: period.halfYear,
            label: `${period.year} ${period.halfYear}`,
          });
        }
      }
    }
  }
  const periods = Array.from(periodMap.values()).sort(
    (a, b) => a.year - b.year || a.halfYear.localeCompare(b.halfYear),
  );

  // Strategies deduped by id, narrowed by goalId if set
  const stratMap = new Map<string, { id: string; title: string }>();
  for (const dept of sourceDepts) {
    for (const period of dept.periods) {
      if (filters.periodId && period.id !== filters.periodId) continue;
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

  // Owners should come from team settings (single source of truth), not activity data.
  const ownerSourceTeams = filters.teamId
    ? teams.filter((t) => t.id === filters.teamId)
    : teams;
  const owners = Array.from(
    new Set(
      ownerSourceTeams
        .flatMap((t) => t.members ?? [])
        .map((m) => m.name?.trim() ?? "")
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

        {/* 模組 */}
        <select
          className="activity-filter-select"
          value={filters.framework}
          onChange={(e) => set("framework", e.target.value)}
        >
          <option value="">所有模組</option>
          {FRAMEWORK_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          <option value={FRAMEWORK_NONE}>其他</option>
        </select>

        {/* 期間 - 只在選擇 OGSM 模組時顯示 */}
        {filters.framework === "ogsm" && (
          <select
            className="activity-filter-select"
            value={filters.periodId}
            onChange={(e) => set("periodId", e.target.value)}
          >
            <option value="">所有期間</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        )}

        {/* 目標 - 只在選擇 OGSM 模組時顯示 */}
        {filters.framework === "ogsm" && (
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
        )}

        {/* 策略 - 只在選擇 OGSM 模組時顯示 */}
        {filters.framework === "ogsm" && (
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
        )}

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
