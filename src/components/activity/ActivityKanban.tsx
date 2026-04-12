import type { DeptActivity, MeasureStatus } from "../../schemas/ogsm";
import type { ActivityWithContext } from "../ActivityPage";
import ActivityCard from "./ActivityCard";

interface Props {
  activities: ActivityWithContext[];
  allActivities: ActivityWithContext[];
  onUpdateActivity: (deptId: string, activity: DeptActivity) => void;
  onJumpToActivity: (deptId: string, activityId: string) => void;
}

const COLUMNS: { status: MeasureStatus; label: string; cls: string }[] = [
  { status: "not-started", label: "未開始", cls: "kanban-col-grey" },
  { status: "attention", label: "需關注", cls: "kanban-col-yellow" },
  { status: "in-progress", label: "進行中", cls: "kanban-col-blue" },
  { status: "completed", label: "已完成", cls: "kanban-col-green" },
];

export default function ActivityKanban({
  activities,
  allActivities,
  onUpdateActivity,
  onJumpToActivity,
}: Props) {
  const byStatus = (status: MeasureStatus) =>
    activities.filter((a) => (a.status ?? "not-started") === status);

  if (activities.length === 0) {
    return (
      <div className="act-empty">
        <div className="act-empty-icon">▦</div>
        <div className="act-empty-text">沒有符合條件的活動</div>
      </div>
    );
  }

  return (
    <div className="kanban-board">
      {COLUMNS.map((col) => {
        const cards = byStatus(col.status);
        return (
          <div key={col.status} className={`kanban-col ${col.cls}`}>
            <div className="kanban-col-hdr">
              <span className="kanban-col-title">{col.label}</span>
              <span className="kanban-col-count">{cards.length}</span>
            </div>
            <div className="kanban-col-cards">
              {cards.length === 0 ? (
                <div className="kanban-col-empty">無活動</div>
              ) : (
                cards.map((act) => (
                  <ActivityCard
                    key={act.id}
                    act={act}
                    allActivities={allActivities}
                    onUpdateActivity={onUpdateActivity}
                    onJumpToActivity={onJumpToActivity}
                  />
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
