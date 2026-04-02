import { useState, useEffect, useCallback, useRef } from "react";
import type { OGSMData, Goal, Strategy, WorkspaceData } from "../schemas/ogsm";

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
  onCopyPeriod: (
    deptId: string,
    sourcePeriodId: string,
    halfYear: "H1" | "H2",
    year: number,
  ) => void;
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
  onCopyPeriod,
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
    try {
      localStorage.setItem("ogsm_sidebar_width", sidebarWidth.toString());
    } catch {
      // best-effort; ignore quota or privacy-mode errors
    }
  }, [sidebarWidth]);

  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editingDeptName, setEditingDeptName] = useState("");
  const [showAddPeriod, setShowAddPeriod] = useState(false);
  const [addPeriodTitle, setAddPeriodTitle] = useState("");
  // copy mode: stores the source period id when user clicks 📋
  const [copySourceId, setCopySourceId] = useState<string | null>(null);

  const dragCtrlRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      dragCtrlRef.current?.abort();
    },
    [],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragCtrlRef.current?.abort();
      const ctrl = new AbortController();
      dragCtrlRef.current = ctrl;
      const startX = e.clientX;
      const startWidth = sidebarWidth;
      document.addEventListener(
        "mousemove",
        (moveEvent: MouseEvent) => {
          const newWidth = Math.max(
            200,
            Math.min(600, startWidth + (moveEvent.clientX - startX)),
          );
          setSidebarWidth(newWidth);
        },
        { signal: ctrl.signal },
      );
      document.addEventListener("mouseup", () => ctrl.abort(), {
        signal: ctrl.signal,
      });
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
      alert(`格式錯誤，請輸入如「${new Date().getFullYear()} H1」`);
      return;
    }
    const halfYear = halfMatch[0] as "H1" | "H2";
    const year = parseInt(yearMatch[1]);
    if (copySourceId) {
      onCopyPeriod(activeDeptId, copySourceId, halfYear, year);
    } else {
      onAddPeriod(activeDeptId, halfYear, year);
    }
    setShowAddPeriod(false);
    setAddPeriodTitle("");
    setCopySourceId(null);
  };

  const openCopyForm = (periodId: string) => {
    setCopySourceId(periodId);
    setShowAddPeriod(true);
    setAddPeriodTitle("");
  };

  const closeAddForm = () => {
    setShowAddPeriod(false);
    setAddPeriodTitle("");
    setCopySourceId(null);
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
              <button
                className="period-tab-copy"
                title={"複製此期間"}
                onClick={(e) => {
                  e.stopPropagation();
                  openCopyForm(p.id);
                }}
              >
                📋
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
                  🗑
                </button>
              )}
            </div>
          ))}
          <button
            className="period-tab-add"
            title={"新增期間"}
            onClick={() => {
              setCopySourceId(null);
              setShowAddPeriod((v) => !v);
            }}
          >
            {"＋"}
          </button>
        </div>

        {showAddPeriod && (
          <div className="period-add-form">
            {copySourceId && (
              <span className="period-copy-label">
                📋 複製自：
                {activeDept?.periods.find((p) => p.id === copySourceId)
                  ? `${
                      activeDept.periods.find((p) => p.id === copySourceId)!
                        .year
                    } ${
                      activeDept.periods.find((p) => p.id === copySourceId)!
                        .halfYear
                    }`
                  : ""}
              </span>
            )}
            <input
              className="period-add-select"
              type="text"
              placeholder={
                copySourceId ? "目標期間, 如: 2026 H2" : "例: 2026 H1"
              }
              value={addPeriodTitle}
              onChange={(e) => setAddPeriodTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddPeriodConfirm();
                if (e.key === "Escape") closeAddForm();
              }}
              autoFocus
            />
            <button
              className="period-add-confirm"
              onClick={handleAddPeriodConfirm}
            >
              {copySourceId ? "複製" : "新增"}
            </button>
            <button className="period-add-cancel" onClick={closeAddForm}>
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
