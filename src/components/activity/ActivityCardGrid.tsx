import type { DeptActivity } from "../../schemas/ogsm";
import type { ActivityWithContext } from "../ActivityPage";
import ActivityCard from "./ActivityCard";

interface Props {
  activities: ActivityWithContext[];
  allActivities: ActivityWithContext[];
  onUpdateActivity: (deptId: string, activity: DeptActivity) => void;
  onJumpToActivity: (deptId: string, activityId: string) => void;
}

export default function ActivityCardGrid({
  activities,
  allActivities,
  onUpdateActivity,
  onJumpToActivity,
}: Props) {
  if (activities.length === 0) {
    return (
      <div className="act-empty">
        <div className="act-empty-icon">⊞</div>
        <div className="act-empty-text">沒有符合條件的活動</div>
      </div>
    );
  }

  const sorted = [...activities].sort((a, b) =>
    (a.startDate ?? "9999") < (b.startDate ?? "9999") ? -1 : 1,
  );

  return (
    <div className="card-grid">
      {sorted.map((act, idx) => (
        <div
          key={act.id}
          data-tour={idx === 0 ? "activity-card-detail" : undefined}
        >
          <ActivityCard
            act={act}
            allActivities={allActivities}
            onUpdateActivity={onUpdateActivity}
            onJumpToActivity={onJumpToActivity}
          />
        </div>
      ))}
    </div>
  );
}
