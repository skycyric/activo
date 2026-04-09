import type { Measure } from "../../schemas/ogsm";
import type { ActivityWithContext } from "../ActivityPage";
import ActivityCard from "./ActivityCard";

interface Props {
  activities: ActivityWithContext[];
  allActivities: ActivityWithContext[];
  onUpdateMeasure: (
    deptId: string,
    periodId: string,
    goalId: string,
    stratId: string,
    measure: Measure,
  ) => void;
  onJumpToMeasure: (
    deptId: string,
    periodId: string,
    goalId: string,
    stratId: string,
    measureId: string,
  ) => void;
}

export default function ActivityCardGrid({
  activities,
  allActivities,
  onUpdateMeasure,
  onJumpToMeasure,
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
      {sorted.map((act) => (
        <ActivityCard
          key={act.id}
          act={act}
          allActivities={allActivities}
          onUpdateMeasure={onUpdateMeasure}
          onJumpToMeasure={onJumpToMeasure}
        />
      ))}
    </div>
  );
}
