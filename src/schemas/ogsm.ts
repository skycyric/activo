/**
 * OGSM Power Tool — Runtime Schemas (Single Source of Truth)
 *
 * 這裡是整個專案資料結構的唯一定義點。
 * - Zod schema 提供「執行期驗證」
 * - TypeScript type 由 z.infer 推導，不需另外宣告 interface
 *
 * src/types/ogsm.ts 只負責 re-export 這裡的 type，讓現有 import 路徑不需改動。
 */
import { z } from "zod";

// ── Primitives ───────────────────────────────────────────────────────────────

/** ISO 日期字串，格式 YYYY-MM-DD */
const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD")
  .optional();

// ── KPI ──────────────────────────────────────────────────────────────────────

export const KPISchema = z.object({
  id: z.string(),
  label: z.string(),
  target: z.number().nullable(),
  actual: z.number().nullable(),
  unit: z.string(),
  achievementRate: z.number().nullable(),
  /**
   * "value"       ＝量化型（預設）
   * "progress"    ＝進度型（actual 為 0-100 完成度）
   * "growth"      ＝成長型（輸入基期值與現值，計算成長率；可選填目標成長率）
   * "target_rate" ＝目標率型（和量化型相同填法，但達成率需再與目標率比較看成效）
   */
  kpiType: z.enum(["value", "progress", "growth", "target_rate"]).optional(),
  /** 成長型專用：基期值（成長計算的起點） */
  baseValue: z.number().nullable().optional(),
  /** 成長型專用：現值（當前量測值） */
  currentValue: z.number().nullable().optional(),
  /** 成長型專用：目標成長率（%，選填；有值才顯示達成圓環） */
  targetGrowthRate: z.number().nullable().optional(),
  /** 目標率型專用：目標達成率（%，選填；有值時圓環顯示 achievementRate/targetRate） */
  targetRate: z.number().nullable().optional(),
});

// ── PlanItem ──────────────────────────────────────────────────────────────────

export const PlanItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  plannedEndDate: IsoDate,
  actualEndDate: IsoDate,
  completed: z.boolean(),
  linkedMeasureId: z.string().nullable().optional(),
  owner: z.string().optional(),
  notes: z.string().optional(),
});

// ── ActionPlan ────────────────────────────────────────────────────────────────

export const ActionPlanSchema = z.object({
  id: z.string(),
  quarter: z.string(),
  title: z.string(),
  items: z.array(PlanItemSchema),
});

// ── AssistUnit ────────────────────────────────────────────────────────────────

/** 協助單位：可指向部門（dept）或小組（team） */
export const AssistUnitSchema = z.object({
  type: z.enum(["dept", "team"]),
  id: z.string(),
  name: z.string(),
});

// ── Measure ───────────────────────────────────────────────────────────────────

export const MeasureStatusSchema = z.enum([
  "not-started",
  "attention",
  "in-progress",
  "completed",
]);

export const MeasureSchema = z.object({
  id: z.string(),
  rawText: z.string(),
  kpis: z.array(KPISchema),
  quarter: z.string().optional(),
  owner: z.string().optional(),
  updatedAt: z.string().optional(),
  status: MeasureStatusSchema.optional(),
  budget: z.number().optional(),
  personDays: z.number().optional(),
  startDate: IsoDate, // 活動起始日
  endDate: IsoDate, // 活動結束日
  description: z.string().optional(), // 活動說明
  assistUnits: z.array(AssistUnitSchema).optional(), // 協助單位
  prerequisites: z.array(z.string()).optional(), // 前置依賴（Measure id[]）
  relatedActivities: z.array(z.string()).optional(), // 關聯活動（Measure id[]）
});

// ── Strategy ──────────────────────────────────────────────────────────────────

export const StrategySchema = z.object({
  id: z.string(),
  title: z.string(),
  rawText: z.string(),
  measures: z.array(MeasureSchema),
  q1Text: z.string().optional(), // legacy CSV import field; migrated to actionPlans on load
  q2Text: z.string().optional(), // legacy CSV import field; migrated to actionPlans on load
  actionPlans: z.array(ActionPlanSchema),
  owner: z.string().optional(), // deprecated: read-only, migrated to owners on load
  owners: z.array(z.string()).default([]), // multi-owner (canonical)
  notes: z.string(),
  completionRate: z.number(), // 0-200, computed from KPIs
  manualRate: z.number().nullable(),
  updatedAt: z.string().optional(),
});

// ── Goal ──────────────────────────────────────────────────────────────────────

export const GoalKpiLinkSchema = z.object({
  strategyId: z.string(),
  measureId: z.string(),
  kpiId: z.string(),
});

export const GoalKPISchema = z.object({
  id: z.string(),
  label: z.string(),
  unit: z.string(),
  target: z.number().nullable(),
  aggregation: z.enum(["SUM", "AVERAGE"]),
  linkedKpis: z.array(GoalKpiLinkSchema),
  /**
   * "value"        ＝ 量化值聚合（用 aggregation 決定 SUM/AVERAGE，預設）
   * "pct_activity" ＝ 活動達標率：linked KPI 中 actual≥target 的比例
   * "progress"     ＝ 進度完成率：linked 進度型 KPI 的 actual 平均
   */
  type: z.enum(["value", "pct_activity", "progress"]).optional(),
  /**
   * true = 顯示在 Goal 主要指標區（常駐可見）
   * false/undefined = 收在「目標 KPI 看板」細節區（可展開）
   */
  isHeadline: z.boolean().optional(),
  /**
   * pct_activity 專用：選取其他 GoalKPI 的 id 作為門檻參照。
   * 每個 id 對應一組「M KPI 集合 + 達標門檻」：
   *   - M KPI 集合 = 該 GoalKPI 的 linkedKpis 所連結的 M KPI
   *   - 達標門檻   = 該 GoalKPI 的 target
   */
  thresholdGoalKpiIds: z.array(z.string()).optional(),
  /**
   * pct_activity 專用：當同一個活動（Measure）被多個來源 GoalKPI 覆蓋時，
   * 讓使用者指定「以哪個 GoalKPI 的目標來判斷該活動是否達標」。
   * key   = measureId
   * value = thresholdGoalKpiId（必須出現在 thresholdGoalKpiIds 中）
   */
  activitySourceOverrides: z.record(z.string(), z.string()).optional(),
});

export const GoalSchema = z.object({
  id: z.string(),
  label: z.string(),
  title: z.string(),
  fullText: z.string(),
  strategies: z.array(StrategySchema),
  completionRate: z.number(),
  goalKpis: z.array(GoalKPISchema).optional(),
  updatedAt: z.string().optional(),
});

// ── OGSMData ──────────────────────────────────────────────────────────────────

export const OGSMDataSchema = z.object({
  objectives: z.object({
    orgO: z.string(),
    deptO: z.string(),
  }),
  goals: z.array(GoalSchema),
  period: z.string(),
  importedAt: z.string(),
  overallRate: z.number(),
});

// ── Workspace ─────────────────────────────────────────────────────────────────

export const PeriodDataSchema = z.object({
  id: z.string(),
  halfYear: z.enum(["H1", "H2"]),
  year: z.number(),
  ogsm: OGSMDataSchema,
});

export const DepartmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  periods: z.array(PeriodDataSchema),
});

export const TeamMemberSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const TeamSchema = z.object({
  id: z.string(),
  name: z.string(),
  deptId: z.string().optional(), // 所屬部門
  members: z.array(TeamMemberSchema),
  updatedAt: z.string().optional(),
});

export const WorkspaceDataSchema = z.object({
  departments: z.array(DepartmentSchema),
  version: z.number(),
  savedAt: z.string().optional(),
  deletedIds: z.array(z.string()).optional(),
  teams: z.array(TeamSchema).optional(),
  _migratedPhase2: z.boolean().optional(),
  _migratedPhase3: z.boolean().optional(),
  warnDaysBefore: z.number().optional(),
});

// ── Inferred TypeScript types ─────────────────────────────────────────────────
// 這些 type 由 schema 推導，與 src/types/ogsm.ts re-export 的保持一致

export type KPI = z.infer<typeof KPISchema>;
export type AssistUnit = z.infer<typeof AssistUnitSchema>;
export type PlanItem = z.infer<typeof PlanItemSchema>;
export type ActionPlan = z.infer<typeof ActionPlanSchema>;
export type MeasureStatus = z.infer<typeof MeasureStatusSchema>;
export type Measure = z.infer<typeof MeasureSchema>;
export type GoalKpiLink = z.infer<typeof GoalKpiLinkSchema>;
export type GoalKPI = z.infer<typeof GoalKPISchema>;
export type Strategy = Omit<z.infer<typeof StrategySchema>, "owner"> & {
  readonly owner?: string; // deprecated: parse-only, never write; use `owners`
};
export type Goal = z.infer<typeof GoalSchema>;
export type OGSMData = z.infer<typeof OGSMDataSchema>;
export type PeriodData = z.infer<typeof PeriodDataSchema>;
export type Department = z.infer<typeof DepartmentSchema>;
export type TeamMember = z.infer<typeof TeamMemberSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type WorkspaceData = z.infer<typeof WorkspaceDataSchema>;
