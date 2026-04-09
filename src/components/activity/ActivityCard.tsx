import type { Measure, MeasureStatus } from "../../schemas/ogsm";
import type { ActivityWithContext } from "../ActivityPage";

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  "not-started": { label: "未開始", cls: "status-not-started" },
  attention: { label: "注意", cls: "status-attention" },
  "in-progress": { label: "進行中", cls: "status-in-progress" },
  completed: { label: "已完成", cls: "status-completed" },
};

const ALL_STATUSES: MeasureStatus[] = [
  "not-started",
  "attention",
  "in-progress",
  "completed",
];

interface Props {
  act: ActivityWithContext;
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

function isOverdue(endDate: string | undefined): boolean {
  if (!endDate) return false;
  return endDate < new Date().toISOString().slice(0, 10);
}

export default function ActivityCard({
  act,
  allActivities,
  onUpdateMeasure,
  onJumpToMeasure,
}: Props) {
  const si =
    STATUS_INFO[act.status ?? "not-started"] ?? STATUS_INFO["not-started"];

  const isBlocked = act.prerequisites?.some((id) => {
    const pre = allActivities.find((a) => a.id === id);
    return pre && pre.status !== "completed";
  });

  const overdue = isOverdue(act.endDate) && act.status !== "completed";

  const updateStatus = (status: MeasureStatus) => {
    onUpdateMeasure(act.deptId, act.periodId, act.goalId, act.strategyId, {
      ...act,
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div
      className="act-card"
      onClick={() =>
        onJumpToMeasure(
          act.deptId,
          act.periodId,
          act.goalId,
          act.strategyId,
          act.id,
        )
      }
      title="點擊前往行動計劃"
    >
      {/* Name row */}
      <div className="act-card-name">
        <span className="act-card-name-text">{act.rawText || "未命名"}</span>
        {isBlocked && (
          <span className="act-prereq-warn" title="有前置活動尚未完成">
            ⚠
          </span>
        )}
      </div>

      {/* Badges */}
      <div className="act-card-badges">
        <span className="act-dept-badge">{act.deptName}</span>
        {act.owner && <span className="act-owner-badge">{act.owner}</span>}
      </div>

      {/* Date range */}
      {(act.startDate || act.endDate) && (
        <div className={`act-card-dates${overdue ? " overdue" : ""}`}>
          {act.startDate?.replace(/-/g, "/") ?? "?"} →{" "}
          {act.endDate?.replace(/-/g, "/") ?? "?"}
          {overdue && <span className="act-card-overdue-label"> 逾期</span>}
        </div>
      )}

      {/* Status select (stop click propagation so card onClick doesn't fire) */}
      <div onClick={(e) => e.stopPropagation()}>
        <select
          className={`act-status-select act-card-status ${si.cls}`}
          value={act.status ?? "not-started"}
          onChange={(e) => updateStatus(e.target.value as MeasureStatus)}
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_INFO[s].label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
