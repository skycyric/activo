import { useState, useEffect, useCallback } from "react";
import type { OGSMData, Goal, Strategy, WorkspaceData } from "../types/ogsm";

interface Props {
  workspace: WorkspaceData;
  activeDeptId: string;
  activePeriodId: string;
  data: OGSMData;
  selectedGoalId: string | null;
  selectedStrategyId: string | null;
  onSwitchDept: (id: string) => void;
  onAddDept: () => void;
  onRenameDept: (id: string, name: string) => void;
  onDeleteDept: (id: string) => void;
  onSwitchPeriod: (id: string) => void;
  onAddPeriod: (deptId: string, halfYear: "H1" | "H2", year: number) => void;
  onDeletePeriod: (deptId: string, periodId: string) => void;
  onSelectGoal: (id: string) => void;
  onSelectStrategy: (id: string) => void;
  onSelectOverview: () => void;
  onAddGoal: () => void;
  onDeleteGoal: (id: string) => void;
}

function MiniRing({ rate, size = 36 }: { rate: number; size?: number }) {
  const r = (size - 4) / 2;
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
            : "#374151";
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#374151"
        strokeWidth={3}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text
        x={size / 2}
        y={size / 2 + 4}
        textAnchor="middle"
        fill={color}
        fontSize={9}
        fontWeight="700"
      >
        {rate > 0 ? `${rate}%` : "\u2014"}
      </text>
    </svg>
  );
}

export default function Sidebar({
  workspace,
  activeDeptId,
  activePeriodId,
  data,
  selectedGoalId,
  selectedStrategyId,
  onSwitchDept,
  onAddDept,
  onRenameDept,
  onDeleteDept,
  onSwitchPeriod,
  onAddPeriod,
  onDeletePeriod,
  onSelectGoal,
  onSelectStrategy,
  onSelectOverview,
  onAddGoal,
  onDeleteGoal,
}: Props) {
  const isOverview = selectedGoalId === null;
  const activeDept = workspace.departments.find((d) => d.id === activeDeptId);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem("ogsm_sidebar_width");
    return saved ? parseInt(saved, 10) : 280;
  });

  useEffect(() => {
    localStorage.setItem("ogsm_sidebar_width", sidebarWidth.toString());
  }, [sidebarWidth]);

  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editingDeptName, setEditingDeptName] = useState("");
  const [showAddPeriod, setShowAddPeriod] = useState(false);
  const [addPeriodKey, setAddPeriodKey] = useState("");

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sidebarWidth;
      const onMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = Math.max(
          200,
          Math.min(600, startWidth + (moveEvent.clientX - startX)),
        );
        setSidebarWidth(newWidth);
      };
      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [sidebarWidth],
  );

  const startRenameDept = (id: string, name: string) => {
    setEditingDeptId(id);
    setEditingDeptName(name);
  };

  const commitRenameDept = () => {
    if (editingDeptId && editingDeptName.trim()) {
      onRenameDept(editingDeptId, editingDeptName.trim());
    }
    setEditingDeptId(null);
  };

  const existingKeys = new Set(
    activeDept?.periods.map((p) => `${p.year}-${p.halfYear}`) ?? [],
  );
  const currentYear = new Date().getFullYear();
  const periodOptions: { year: number; halfYear: "H1" | "H2"; key: string }[] =
    [];
  for (let y = currentYear - 1; y <= currentYear + 2; y++) {
    for (const h of ["H1", "H2"] as const) {
      const key = `${y}-${h}`;
      if (!existingKeys.has(key))
        periodOptions.push({ year: y, halfYear: h, key });
    }
  }

  const handleOpenAddPeriod = () => {
    if (periodOptions.length > 0 && !addPeriodKey) {
      setAddPeriodKey(periodOptions[0].key);
    }
    setShowAddPeriod((v) => !v);
  };

  const handleAddPeriodConfirm = () => {
    const opt =
      periodOptions.find((o) => o.key === addPeriodKey) ?? periodOptions[0];
    if (!opt) return;
    onAddPeriod(activeDeptId, opt.halfYear, opt.year);
    setShowAddPeriod(false);
    setAddPeriodKey("");
  };

  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      {/* Department + Period selector */}
      <div className="dept-selector">
        <div className="dept-header-row">
          {editingDeptId === activeDeptId ? (
            <input
              className="dept-name-input"
              value={editingDeptName}
              onChange={(e) => setEditingDeptName(e.target.value)}
              onBlur={commitRenameDept}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRenameDept();
                if (e.key === "Escape") setEditingDeptId(null);
              }}
              autoFocus
            />
          ) : (
            <select
              className="dept-select"
              value={activeDeptId}
              onChange={(e) => onSwitchDept(e.target.value)}
            >
              {workspace.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <div className="dept-actions">
            <button
              className="dept-action-btn"
              title={"\u91cd\u547d\u540d\u90e8\u9580"}
              onClick={() =>
                activeDept && startRenameDept(activeDept.id, activeDept.name)
              }
            >
              {"\u270f\ufe0f"}
            </button>
            <button
              className="dept-action-btn"
              title={"\u65b0\u589e\u90e8\u9580"}
              onClick={onAddDept}
            >
              {"\uff0b"}
            </button>
            {workspace.departments.length > 1 && (
              <button
                className="dept-action-btn dept-action-del"
                title={"\u522a\u9664\u90e8\u9580"}
                onClick={() => onDeleteDept(activeDeptId)}
              >
                {"\u{1f5d1}"}
              </button>
            )}
          </div>
        </div>

        <div className="period-tabs-row">
          {activeDept?.periods.map((p) => (
            <div
              key={p.id}
              className={`period-tab-wrap ${p.id === activePeriodId ? "active" : ""}`}
            >
              <button
                className={`period-tab ${p.id === activePeriodId ? "active" : ""}`}
                onClick={() => onSwitchPeriod(p.id)}
              >
                {p.year} {p.halfYear}
              </button>
              {activeDept.periods.length > 1 && (
                <button
                  className="period-tab-del"
                  title={"\u522a\u9664\u6b64\u671f\u9593"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePeriod(activeDeptId, p.id);
                  }}
                >
                  &times;
                </button>
              )}
            </div>
          ))}
          <button
            className="period-tab-add"
            title={"\u65b0\u589e\u671f\u9593"}
            onClick={handleOpenAddPeriod}
          >
            {"\uff0b"}
          </button>
        </div>

        {showAddPeriod && (
          <div className="period-add-form">
            {periodOptions.length === 0 ? (
              <span className="period-add-empty">
                {"\u8fd1\u5e74\u671f\u9593\u5df2\u5168\u90e8\u5efa\u7acb"}
              </span>
            ) : (
              <>
                <select
                  className="period-add-select"
                  value={addPeriodKey || periodOptions[0]?.key}
                  onChange={(e) => setAddPeriodKey(e.target.value)}
                >
                  {periodOptions.map((o) => (
                    <option key={o.key} value={o.key}>
                      {o.year} {o.halfYear}
                    </option>
                  ))}
                </select>
                <button
                  className="period-add-confirm"
                  onClick={handleAddPeriodConfirm}
                >
                  {"\u65b0\u589e"}
                </button>
              </>
            )}
            <button
              className="period-add-cancel"
              onClick={() => setShowAddPeriod(false)}
            >
              &times;
            </button>
          </div>
        )}
      </div>

      {/* O Level */}
      <button
        className={`sidebar-o sidebar-o-btn ${isOverview ? "active" : ""}`}
        onClick={onSelectOverview}
      >
        <MiniRing rate={data.overallRate} size={44} />
        <div className="sidebar-o-text">
          <div className="sidebar-o-label">
            {"\u90e8\u9580\u7e3d\u76ee\u6a19"}{" "}
            {isOverview && (
              <span
                style={{
                  fontSize: 9,
                  background: "rgba(99,102,241,.3)",
                  borderRadius: 4,
                  padding: "1px 5px",
                }}
              >
                {"\u7e3d\u89bd"}
              </span>
            )}
          </div>
          <div className="sidebar-o-sub">
            {data.period} {"\u00b7"} {"\u6574\u9ad4\u5b8c\u6210\u7387"}
          </div>
        </div>
      </button>
      <div className="sidebar-divider" />
      <div className="sidebar-objective">
        <div
          className="sidebar-obj-badge"
          style={{ alignSelf: "flex-start", marginTop: 2 }}
        >
          O
        </div>
        <p className="sidebar-obj-text">
          {data.objectives.deptO || (
            <span style={{ color: "#64748b" }}>
              {"\u90e8\u9580\u7e3d\u76ee\u6a19\u5c1a\u672a\u8a2d\u5b9a"}
            </span>
          )}
        </p>
      </div>
      <div className="sidebar-divider" />

      {/* G -> S Nav */}
      <nav className="sidebar-nav">
        {data.goals.map((goal: Goal) => {
          const isActive = goal.id === selectedGoalId;
          return (
            <div key={goal.id} className="sidebar-goal-group">
              <div
                className={`sidebar-goal-btn ${isActive ? "active" : ""}`}
                onClick={() => onSelectGoal(goal.id)}
              >
                <div className="sidebar-goal-left">
                  <span className="goal-badge">{goal.label}</span>
                  <span className="sidebar-goal-title">{goal.title}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <button
                    className="sidebar-icon-btn"
                    title={"\u522a\u9664\u76ee\u6a19"}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteGoal(goal.id);
                    }}
                  >
                    {"\u{1f5d1}"}
                  </button>
                  <MiniRing rate={goal.completionRate} size={32} />
                </div>
              </div>

              {isActive && (
                <div className="sidebar-strategies">
                  {goal.strategies.map((s: Strategy) => (
                    <button
                      key={s.id}
                      className={`sidebar-strategy-btn ${s.id === selectedStrategyId ? "active" : ""}`}
                      onClick={() => onSelectStrategy(s.id)}
                    >
                      <span
                        className="sidebar-s-dot"
                        style={{
                          background:
                            s.completionRate >= 100
                              ? "#10b981"
                              : s.completionRate >= 70
                                ? "#6366f1"
                                : s.completionRate >= 40
                                  ? "#f59e0b"
                                  : s.completionRate > 0
                                    ? "#ef4444"
                                    : "#6b7280",
                          marginTop: 4,
                          flexShrink: 0,
                        }}
                      />
                      <span className="sidebar-s-title">{s.title}</span>
                      <span
                        className="sidebar-s-rate"
                        style={{
                          color:
                            s.completionRate >= 100
                              ? "#10b981"
                              : s.completionRate >= 70
                                ? "#6366f1"
                                : s.completionRate >= 40
                                  ? "#f59e0b"
                                  : s.completionRate > 0
                                    ? "#ef4444"
                                    : "#6b7280",
                        }}
                      >
                        {s.completionRate > 0
                          ? `${s.completionRate}%`
                          : "\u2014"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <button className="sidebar-add-goal" onClick={onAddGoal}>
          {"\uff0b \u65b0\u589e\u76ee\u6a19\uff08G\uff09"}
        </button>
      </nav>
      <div className="sidebar-resizer" onMouseDown={handleMouseDown} />
    </aside>
  );
}
