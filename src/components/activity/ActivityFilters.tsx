import type { WorkspaceData } from "../../schemas/ogsm";

export interface ActivityFilterState {
  deptIds: string[];
  teamIds: string[];
  owners: string[];
  frameworks: string[];
  periodIds: string[];
  goalIds: string[];
  strategyIds: string[];
  statuses: string[];
  startFrom: string;
  endTo: string;
  keyword: string;
}

export const EMPTY_ACTIVITY_FILTERS: ActivityFilterState = {
  deptIds: [],
  teamIds: [],
  owners: [],
  frameworks: [],
  periodIds: [],
  goalIds: [],
  strategyIds: [],
  statuses: [],
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

type Option = {
  value: string;
  label: string;
};

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
  const toggleInList = (key: keyof ActivityFilterState, value: string) => {
    const current = filters[key];
    if (!Array.isArray(current)) return;

    const nextSet = new Set(current);
    if (nextSet.has(value)) nextSet.delete(value);
    else nextSet.add(value);

    const next: ActivityFilterState = {
      ...filters,
      [key]: Array.from(nextSet),
    } as ActivityFilterState;

    if (key === "deptIds") {
      next.teamIds = [];
      next.periodIds = [];
      next.goalIds = [];
      next.strategyIds = [];
    }

    if (key === "frameworks" && !next.frameworks.includes("ogsm")) {
      next.periodIds = [];
      next.goalIds = [];
      next.strategyIds = [];
    }

    onChange(next);
  };

  const setText = (key: "startFrom" | "endTo" | "keyword", value: string) => {
    onChange({ ...filters, [key]: value });
  };

  const depts = workspace.departments;
  const selectedDeptIdSet = new Set(filters.deptIds);
  const sourceDepts =
    selectedDeptIdSet.size > 0
      ? depts.filter((d) => selectedDeptIdSet.has(d.id))
      : depts;

  // Teams scoped to selected dept (or all)
  const allTeams = workspace.teams ?? [];
  const teams =
    selectedDeptIdSet.size > 0
      ? allTeams.filter((t) => !t.deptId || selectedDeptIdSet.has(t.deptId))
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

  // Periods deduped by label (e.g. "2026 H1")
  const periodLabelSet = new Set<string>();
  for (const dept of sourceDepts) {
    for (const period of dept.periods) {
      periodLabelSet.add(`${period.year} ${period.halfYear}`);
    }
  }
  const periods = Array.from(periodLabelSet.values()).sort((a, b) =>
    a.localeCompare(b, "zh-TW"),
  );

  // Strategies deduped by id, narrowed by goalId if set
  const stratMap = new Map<string, { id: string; title: string }>();
  const selectedPeriodLabelSet = new Set(filters.periodIds);
  const selectedGoalIdSet = new Set(filters.goalIds);
  for (const dept of sourceDepts) {
    for (const period of dept.periods) {
      const periodLabel = `${period.year} ${period.halfYear}`;
      if (
        selectedPeriodLabelSet.size > 0 &&
        !selectedPeriodLabelSet.has(periodLabel)
      ) {
        continue;
      }
      for (const g of period.ogsm.goals) {
        if (selectedGoalIdSet.size > 0 && !selectedGoalIdSet.has(g.id))
          continue;
        for (const s of g.strategies) {
          if (!stratMap.has(s.id))
            stratMap.set(s.id, { id: s.id, title: s.title });
        }
      }
    }
  }
  const strategies = Array.from(stratMap.values());

  // Owners should come from team settings (single source of truth), not activity data.
  const selectedTeamIdSet = new Set(filters.teamIds);
  const ownerSourceTeams =
    selectedTeamIdSet.size > 0
      ? teams.filter((t) => selectedTeamIdSet.has(t.id))
      : teams;
  const owners = Array.from(
    new Set(
      ownerSourceTeams
        .flatMap((t) => t.members ?? [])
        .map((m) => m.name?.trim() ?? "")
        .filter(Boolean),
    ),
  ).sort();

  const hasFilter =
    filters.deptIds.length > 0 ||
    filters.teamIds.length > 0 ||
    filters.owners.length > 0 ||
    filters.frameworks.length > 0 ||
    filters.periodIds.length > 0 ||
    filters.goalIds.length > 0 ||
    filters.strategyIds.length > 0 ||
    filters.statuses.length > 0 ||
    filters.startFrom !== "" ||
    filters.endTo !== "" ||
    filters.keyword !== "";

  const deptOptions: Option[] = depts.map((d) => ({
    value: d.id,
    label: d.name,
  }));
  const teamOptions: Option[] = teams.map((t) => ({
    value: t.id,
    label: t.name,
  }));
  const ownerOptions: Option[] = owners.map((o) => ({ value: o, label: o }));
  const frameworkOptions: Option[] = [
    ...FRAMEWORK_OPTIONS,
    { value: FRAMEWORK_NONE, label: "未分類" },
  ];
  const periodOptions: Option[] = periods.map((label) => ({
    value: label,
    label,
  }));
  const goalOptions: Option[] = goals.map((g) => ({
    value: g.id,
    label: `${g.label} ${g.title}`,
  }));
  const strategyOptions: Option[] = strategies.map((s) => ({
    value: s.id,
    label: s.title,
  }));
  const statusOptions: Option[] = Object.entries(STATUS_LABELS).map(
    ([value, label]) => ({ value, label }),
  );

  return (
    <div className="activity-filters">
      <div className="activity-filters-row">
        <MultiSelectDropdown
          title="部門"
          values={filters.deptIds}
          options={deptOptions}
          onToggle={(value) => toggleInList("deptIds", value)}
        />

        {teamOptions.length > 0 && (
          <MultiSelectDropdown
            title="團隊"
            values={filters.teamIds}
            options={teamOptions}
            onToggle={(value) => toggleInList("teamIds", value)}
          />
        )}

        <MultiSelectDropdown
          title="主責"
          values={filters.owners}
          options={ownerOptions}
          onToggle={(value) => toggleInList("owners", value)}
        />

        <MultiSelectDropdown
          title="模組"
          values={filters.frameworks}
          options={frameworkOptions}
          onToggle={(value) => toggleInList("frameworks", value)}
        />

        <MultiSelectDropdown
          title="期間"
          values={filters.periodIds}
          options={periodOptions}
          onToggle={(value) => toggleInList("periodIds", value)}
        />

        <MultiSelectDropdown
          title="Goal"
          values={filters.goalIds}
          options={goalOptions}
          onToggle={(value) => toggleInList("goalIds", value)}
        />

        <MultiSelectDropdown
          title="Strategy"
          values={filters.strategyIds}
          options={strategyOptions}
          onToggle={(value) => toggleInList("strategyIds", value)}
        />

        <MultiSelectDropdown
          title="狀態"
          values={filters.statuses}
          options={statusOptions}
          onToggle={(value) => toggleInList("statuses", value)}
        />

        {/* 開始日期 ≥ */}
        <div className="activity-filter-date-group">
          <span className="activity-filter-date-label">開始 ≥</span>
          <input
            className="activity-filter-date"
            type="date"
            value={filters.startFrom}
            onChange={(e) => setText("startFrom", e.target.value)}
          />
        </div>

        {/* 結束日期 ≤ */}
        <div className="activity-filter-date-group">
          <span className="activity-filter-date-label">結束 ≤</span>
          <input
            className="activity-filter-date"
            type="date"
            value={filters.endTo}
            onChange={(e) => setText("endTo", e.target.value)}
          />
        </div>

        {/* 關鍵字 */}
        <input
          className="activity-filter-input"
          type="text"
          placeholder="關鍵字搜尋…"
          value={filters.keyword}
          onChange={(e) => setText("keyword", e.target.value)}
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

function MultiSelectDropdown({
  title,
  values,
  options,
  onToggle,
}: {
  title: string;
  values: string[];
  options: Option[];
  onToggle: (value: string) => void;
}) {
  const selectedText = values.length === 0 ? "全部" : `已選 ${values.length}`;

  return (
    <details className="activity-filter-multi">
      <summary className="activity-filter-multi-trigger">
        <span className="activity-filter-multi-title">{title}</span>
        <span className="activity-filter-multi-value">{selectedText}</span>
        <span className="activity-filter-multi-caret" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="activity-filter-multi-menu">
        {options.length === 0 ? (
          <div className="activity-filter-multi-empty">沒有可選項目</div>
        ) : (
          options.map((option) => (
            <label key={option.value} className="activity-filter-multi-option">
              <input
                type="checkbox"
                checked={values.includes(option.value)}
                onChange={() => onToggle(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))
        )}
      </div>
    </details>
  );
}
