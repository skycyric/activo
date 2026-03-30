/**
 * 型別定義已移至 src/schemas/ogsm.ts（Zod schema → z.infer 推導）
 * 這裡只做 re-export，保持所有現有 import 路徑不變。
 */
export type {
  KPI,
  PlanItem,
  ActionPlan,
  MeasureStatus,
  Measure,
  GoalKpiLink,
  GoalKPI,
  Strategy,
  Goal,
  OGSMData,
  PeriodData,
  Department,
  TeamMember,
  Team,
  WorkspaceData,
} from "../schemas/ogsm";

export { MEASURE_STATUS_VALUES } from "../schemas/ogsm";
