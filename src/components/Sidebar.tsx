import { useState, useEffect, useCallback, useRef } from "react";
import type { OGSMData, Goal, Strategy, WorkspaceData } from "../schemas/ogsm";

interface Props {
  workspace: WorkspaceData;
  activeDeptId: string;
  activePeriodId: string;
  data: OGSMData;
  selectedGoalId: string | null;
  selectedStrategyId: string | null;
  onSwitchPeriod: (id: string) => void;
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
  onSwitchPeriod,
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
      // Ignore localStorage errors in privacy mode.
    }
  }, [sidebarWidth]);

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

  return (
    <aside className="sidebar" style={{ width: sidebarWidth }}>
      <button
        className={`sidebar-o sidebar-o-btn ${isOverview ? "active" : ""}`}
        onClick={onSelectOverview}
      >
        <span className="sidebar-obj-badge">O</span>
        <span className="sidebar-o-obj-text">
          {data.objectives.deptO || (
            <span style={{ color: "#64748b" }}>部門總目標尚未設定</span>
          )}
        </span>
      </button>

      {activeDept && activeDept.periods.length > 0 && (
        <div className="sidebar-h-tabs">
          <div className="period-tabs-row">
            {activeDept.periods.map((p) => (
              <button
                key={p.id}
                className={`period-tab ${p.id === activePeriodId ? "active" : ""}`}
                onClick={() => onSwitchPeriod(p.id)}
              >
                {p.year} {p.halfYear}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="sidebar-divider" />

      <nav className="sidebar-nav" data-tour="ogsm-sidebar">
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
