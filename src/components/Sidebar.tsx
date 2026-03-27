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
  const [addPeriodTitle, setAddPeriodTitle] = useState("");

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

  const handleAddPeriodConfirm = () => {
    const raw = addPeriodTitle.trim().toUpperCase();
    const yearMatch = raw.match(/(\d{4})/);
    const halfMatch = raw.match(/H[12]/);
    if (!yearMatch || !halfMatch) {
      alert("格式錯誤，請輸入如「2026 H1」");
      return;
    }
    onAddPeriod(
      activeDeptId,
      halfMatch[0] as "H1" | "H2",
      parseInt(yearMatch[1]),
    );
    setShowAddPeriod(false);
    setAddPeriodTitle("");
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
              title={"重命名部門"}
              onClick={() =>
                activeDept && startRenameDept(activeDept.id, activeDept.name)
              }
            >
              {"✏️"}
            </button>
            <button
              className="dept-action-btn"
              title={"新增部門"}
              onClick={onAddDept}
            >
              {"＋"}
            </button>
            {workspace.departments.length > 1 && (
              <button
                className="dept-action-btn dept-action-del"
                title={"刪除部門"}
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
                  title={"刪除此期間"}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeletePeriod(activeDeptId, p.id);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            className="period-tab-add"
            title={"新增期間"}
            onClick={() => setShowAddPeriod((v) => !v)}
          >
            {"＋"}
          </button>
        </div>

        {showAddPeriod && (
          <div className="period-add-form">
            <input
              className="period-add-select"
              type="text"
              placeholder="例: 2026 H1"
              value={addPeriodTitle}
              onChange={(e) => setAddPeriodTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddPeriodConfirm();
                if (e.key === "Escape") setShowAddPeriod(false);
              }}
              autoFocus
            />
            <button
              className="period-add-confirm"
              onClick={handleAddPeriodConfirm}
            >
              {"新增"}
            </button>
            <button
              className="period-add-cancel"
              onClick={() => setShowAddPeriod(false)}
            >
              ×
            </button>
          </div>
        )}
      </div>
      {/* O Level */}
      <button
        className={`sidebar-o sidebar-o-btn ${isOverview ? "active" : ""}`}
        onClick={onSelectOverview}
      >
        <span className="sidebar-obj-badge">O</span>
        <span className="sidebar-o-obj-text">
          {data.objectives.deptO || (
            <span style={{ color: "#64748b" }}>{"部門總目標尚未設定"}</span>
          )}
        </span>
      </button>
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
              </div>

              {isActive && (
                <div className="sidebar-strategies">
                  {goal.strategies.map((s: Strategy, si: number) => (
                    <button
                      key={s.id}
                      className={`sidebar-strategy-btn ${s.id === selectedStrategyId ? "active" : ""}`}
                      onClick={() => onSelectStrategy(s.id)}
                    >
                      <span className="strategy-badge">{`S${si + 1}`}</span>
                      <span className="sidebar-s-title">{s.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="sidebar-resizer" onMouseDown={handleMouseDown} />
    </aside>
  );
}
