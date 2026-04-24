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

/**
 * Deprecated 欄位政策：
 * - parse-only：允許讀取舊檔，正規化後可暫時保留原值供相容邏輯參考
 * - compat-write-forbidden：允許解析舊檔，但 canonical writer 不得寫回
 */
export const DEPRECATED_PARSE_ONLY_FIELDS = [
  "KPI.label",
  "KPI.kpiType",
  "KPI.baseValue",
  "KPI.currentValue",
  "OgsmLink",
] as const;

export const DEPRECATED_COMPAT_WRITE_FORBIDDEN_FIELDS = [
  "Strategy.owner",
  "DeptActivity.ogsmLink",
  "DeptActivity.excludeFromOgsm",
  "DeptActivity.actionPlans",
] as const;

// ── Primitives ───────────────────────────────────────────────────────────────

/** ISO 日期字串，格式 YYYY-MM-DD */
const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected ISO date YYYY-MM-DD")
  .optional();

// ── KPI ──────────────────────────────────────────────────────────────────────

/**
 * KPI baseline：成長型公式的分母（起點值）。
 * - fixed：固定常數
 * - kpiRef：引用同一活動內另一個 KPI 的 actual 值（限同活動內）
 */
export const KpiBaselineSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fixed"), value: z.number() }),
  z.object({ type: z.literal("kpiRef"), kpiId: z.string() }),
]);

export const KPISchema = z.object({
  id: z.string(),
  bizKey: z.string().optional(),
  /** 使用者自訂 KPI 名稱，如「業績達成率」「新增客戶數」 */
  name: z.string().optional(),
  /** @deprecated 改用 name；label 保留供舊資料讀取 */
  label: z.string(),
  target: z.number().nullable(),
  actual: z.number().nullable(),
  unit: z.string(),
  /**
   * 計算達成率的公式類型：
   * - "direct_rate"：achievementRate = actual / resolvedBaseline × 100
   * - "growth"：achievementRate = ((actual / resolvedBaseline - 1) × 100) / targetGrowthRate × 100
   * - "target_pct"：achievementRate = ((actual / resolvedBaseline) × 100) - targetRate
   * - "completion"：achievementRate = actual（0-100 完成率）
   * 未設定時沿用舊 kpiType 欄位行為（向下相容）。
   */
  formulaType: z
    .enum(["direct_rate", "growth", "target_pct", "completion"])
    .optional(),
  /**
   * 基底值/參考值來源（formulaType="direct_rate"|"growth"|"target_pct" 時可用）。
   * - "direct_rate" 時：actual / baseline.value × 100%（baseline 即目標值分母）
   * - "growth" 時：(actual / baseline - 1) × 100%（baseline 作為基期值）
   * - "target_pct" 時：((actual / baseline) × 100%) - targetRate（與目標百分比的差距）
   * - "completion" 時：不適用
   *
   * baseline 類型：
   * - fixed：固定常數
   * - kpiRef：同活動內另一個 KPI 的 actual 值
   */
  baseline: KpiBaselineSchema.nullable().optional(),
  /**
   * 達成率（唯讀計算值）。
   * 由 computeKpiAchievement() 計算後寫入，不應手動填入。
   * 保留欄位是為了讓 GoalKPI 聚合計算讀取快照值。
   */
  achievementRate: z.number().nullable(),
  /**
   * @deprecated 改用 formulaType。
   * "value"       ＝量化型（預設）
   * "progress"    ＝進度型（actual 為 0-100 完成度）
   * "growth"      ＝成長型（輸入基期值與現值，計算成長率；可選填目標成長率）
   * "target_rate" ＝目標率型（和量化型相同填法，但達成率需再與目標率比較看成效）
   */
  kpiType: z.enum(["value", "progress", "growth", "target_rate"]).optional(),
  /** @deprecated 改用 baseline: { type:"fixed", value } */
  baseValue: z.number().nullable().optional(),
  /** @deprecated 改用 actual */
  currentValue: z.number().nullable().optional(),
  /** 成長型目標成長率（%）；formulaType="growth" 時作為分母 */
  targetGrowthRate: z.number().nullable().optional(),
  /** 目標率型專用：目標達成率（%） */
  targetRate: z.number().nullable().optional(),
});

// ── PlanItem ──────────────────────────────────────────────────────────────────

export const PlanItemSchema = z.object({
  id: z.string(),
  bizKey: z.string().optional(),
  description: z.string(),
  plannedEndDate: IsoDate,
  actualEndDate: IsoDate,
  completed: z.boolean(),
  dependsOnIds: z.array(z.string()).optional(),
  linkedMeasureId: z.string().nullable().optional(),
  owner: z.string().optional(),
  notes: z.string().optional(),
});

// ── ActionPlan ────────────────────────────────────────────────────────────────

export const ActionPlanSchema = z.object({
  id: z.string(),
  bizKey: z.string().optional(),
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
  bizKey: z.string().optional(),
  rawText: z.string(),
  kpis: z.array(KPISchema),
  /** 每個活動自己的預警提前天數（到期日前 n 天開始 warning），預設 3 */
  warnDaysBefore: z.number().optional(),
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

// ── OgsmLink ──────────────────────────────────────────────────────────────────

/**
 * 指向 OGSM 樹中某個 Strategy 的定位資訊。
 * @deprecated 使用 DashboardLink (type="ogsm") 取代
 */
export const OgsmLinkSchema = z.object({
  periodId: z.string(),
  goalId: z.string(),
  strategyId: z.string(),
});

// ── DashboardLink ─────────────────────────────────────────────────────────────

/**
 * 活動與某個儀表板的連結（多對多）。
 * type = "ogsm" → 帶 periodId / goalId / strategyId。
 * 未來可擴充其他 type（okr、roadmap 等），只需加各自欄位。
 */
export const DashboardLinkSchema = z.object({
  id: z.string(),
  bizKey: z.string().optional(),
  /** 儀表板類型，目前支援 "ogsm"，設計為可延伸字串 */
  type: z.string(),
  // ── OGSM 專屬欄位 ──────────────────────────────────────────────────────────
  /**
   * 期別 id。語意上建議使用 YYYY-H1 / YYYY-H2（例如 2026-H1），
   * 但為相容舊資料，仍允許既有任意 id 字串。
   */
  periodId: z.string().optional(),
  goalId: z.string().optional(),
  strategyId: z.string().optional(),
  /** true = 本活動不計入此連結儀表板的指標計算 */
  exclude: z.boolean().default(false),
});

/**
 * 關聯式模型：活動與儀表板之間的連結表（Department 層）。
 * 以 activityId 作外鍵，對應 dept.activities[].id。
 */
export const ActivityDashboardLinkSchema = DashboardLinkSchema.extend({
  activityId: z.string(),
});

// ── ActivityPlanItem ──────────────────────────────────────────────────────────

/**
 * 活動層的平坦行動計畫項目（不再透過 ActionPlan 包裹）。
 * quarter 直接掛在項目上，取代原先 ActionPlan.quarter 的層級。
 */
export const ActivityPlanItemSchema = PlanItemSchema.extend({
  /** 所屬季度，e.g. "Q1" / "Q2" */
  quarter: z.string().optional(),
});

// ── DeptActivity ──────────────────────────────────────────────────────────────

/**
 * 部門層一等公民活動（Activity-First 架構核心資料實體）。
 * 繼承 Measure 所有欄位（id、rawText、kpis、status…）。
 *
 * 正式欄位（V3）：
 * - dashboardLinks：活動掛載的儀表板連結（OGSM / 未來 OKR…）
 * - tags：自由標籤
 * - planItems：平坦化行動計畫項目
 *
 * 已棄用欄位（保留供 migration 讀取，勿直接寫入）：
 * - ogsmLink / excludeFromOgsm / actionPlans
 */
export const DeptActivitySchema = MeasureSchema.extend({
  // ── V3 正式欄位 ────────────────────────────────────────────────────────────
  /** 儀表板連結列表（取代 ogsmLink + excludeFromOgsm） */
  dashboardLinks: z.array(DashboardLinkSchema).optional(),
  /** 自由標籤，如「Q1重點」「跨部門」 */
  tags: z.array(z.string()).optional(),
  /**
   * 活動所屬框架列表，控制此活動可被哪些目標管理模組選取。
   * 例：["ogsm"] = 可在 OGSM KpiDesigner 的 M/S 選取器中出現
   *     ["standalone"] = 可掛在 FreeNode 下
   * 空陣列或 undefined = 僅能在 ActivityPage 中看到，不出現在目標編輯器選取器
   */
  frameworks: z.array(z.string()).optional(),
  /** 平坦行動計畫項目（取代 actionPlans 巢狀結構） */
  planItems: z.array(ActivityPlanItemSchema).optional(),
  /** 活動生命週期起始期別（跨年/跨H活動用；僅資料結構，不影響 KPI 計算） */
  lifecycleStartPeriodId: z.string().optional(),
  /** 活動生命週期結束期別；未結束可為 undefined */
  lifecycleEndPeriodId: z.string().optional(),
  // ── 已棄用欄位（migration 讀取用，勿直接寫入）──────────────────────────────
  /** @deprecated 使用 dashboardLinks 取代 */
  ogsmLink: OgsmLinkSchema.optional(),
  /** @deprecated 使用 dashboardLinks[].exclude 取代 */
  excludeFromOgsm: z.boolean().optional(),
  /** @deprecated 使用 planItems 取代 */
  actionPlans: z.array(ActionPlanSchema).optional(),
  // ── 其他維持欄位 ───────────────────────────────────────────────────────────
  owners: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

// ── Strategy ──────────────────────────────────────────────────────────────────

export const StrategySchema = z.object({
  id: z.string(),
  bizKey: z.string().optional(),
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
  /** Tombstone: 使用者刻意清空的欄位名稱清單（用於 merge 時區分「未填」與「主動清空」） */
  clearedFields: z.array(z.string()).optional(),
});

// ── Goal ──────────────────────────────────────────────────────────────────────

export const GoalKpiLinkSchema = z.object({
  /** V3 後以 activityId 直接對應 dept.activities[].id */
  activityId: z.string(),
  kpiId: z.string(),
});

export const GoalKPISchema = z.object({
  id: z.string(),
  bizKey: z.string().optional(),
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
  /**
   * Phase 6B：GoalKPI 類型
   * "direct"    ＝ 直接連结活動 M KPI（linkedKpis 計算，預設行為）
   * "aggregate" ＝ 聚合引用其他 GoalKPI（linkedGoalKpis 加權平均）
   */
  goalKpiType: z.enum(["direct", "aggregate"]).default("direct"),
  /**
   * aggregate 專用：引用其他 Goal 的 GoalKPI，並指定權重（權重加總應≒1）
   */
  linkedGoalKpis: z
    .array(
      z.object({
        goalId: z.string(),
        goalKpiId: z.string(),
        weight: z.number().min(0).max(1),
      }),
    )
    .optional(),
});

export const GoalSchema = z.object({
  id: z.string(),
  bizKey: z.string().optional(),
  label: z.string(),
  title: z.string(),
  fullText: z.string(),
  strategies: z.array(StrategySchema),
  completionRate: z.number(),
  goalKpis: z.array(GoalKPISchema).optional(),
  updatedAt: z.string().optional(),
  /** Tombstone: 使用者刻意清空的欄位名稱清單 */
  clearedFields: z.array(z.string()).optional(),
});

// ── FreeNode ──────────────────────────────────────────────────────────────────

/**
 * 目標編輯器畫布中的自由節點（非 OGSM 層級）。
 * 可代表：未掛任何框架的孤立任務、跨框架目標、公司政策節點等。
 * 與 DeptActivity 透過 linkedActivityIds 連結（多對多）。
 */
export const FreeNodeSchema = z.object({
  id: z.string(),
  bizKey: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  /** 連結的 DeptActivity id 列表（活動由 ActivityPage 統一管理） */
  linkedActivityIds: z.array(z.string()).default([]),
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
  /** 目標編輯器畫布中的自由節點（非 OGSM 層疊，可選） */
  freeNodes: z.array(FreeNodeSchema).optional(),
});

// ── Workspace ─────────────────────────────────────────────────────────────────

export const PeriodDataSchema = z.object({
  id: z.string(),
  bizKey: z.string().optional(),
  halfYear: z.enum(["H1", "H2"]),
  year: z.number(),
  ogsm: OGSMDataSchema,
});

export const DepartmentSchema = z.object({
  id: z.string(),
  bizKey: z.string().optional(),
  name: z.string(),
  periods: z.array(PeriodDataSchema),
  /** 部門直屬活動清單（activity-first 架構的核心） */
  activities: z.array(DeptActivitySchema).optional(),
  /** 關聯式模型：活動與儀表板關係表（V1 導入，與 activities[].dashboardLinks 並存相容） */
  activityLinks: z.array(ActivityDashboardLinkSchema).optional(),
});

export const TeamMemberSchema = z.object({
  id: z.string(),
  bizKey: z.string().optional(),
  name: z.string(),
});

export const TeamSchema = z.object({
  id: z.string(),
  bizKey: z.string().optional(),
  name: z.string(),
  deptId: z.string().optional(), // 所屬部門
  members: z.array(TeamMemberSchema),
  updatedAt: z.string().optional(),
  /** Tombstone: 使用者刻意清空的欄位名稱清單 */
  clearedFields: z.array(z.string()).optional(),
});

export const WorkspaceDataSchema = z.object({
  departments: z.array(DepartmentSchema),
  version: z.number(),
  savedAt: z.string().optional(),
  deletedIds: z.array(z.string()).optional(),
  teams: z.array(TeamSchema).optional(),
  _migratedPhase2: z.boolean().optional(),
  _migratedPhase3: z.boolean().optional(),
  /** true = 已執行 activity-first 遷移，dept.activities[] 為主要資料來源 */
  _migratedActivityFirst: z.boolean().optional(),
  /** true = 已執行 V3 遷移：ogsmLink→dashboardLinks, actionPlans→planItems */
  _migratedV3: z.boolean().optional(),
  /** true = 已執行 FrameworksV1 遷移：dept.activities 中無 frameworks 的補設 ["ogsm"] */
  _migratedFrameworksV1: z.boolean().optional(),
  /** true = 已執行 TimelineV1：多筆 OGSM 歸屬去重 + lifecycle 欄位補值 */
  _migratedTimelineV1: z.boolean().optional(),
  /** true = 已執行 RelationalV1：建立 departments[].activityLinks 並與 activities[].dashboardLinks 同步 */
  _migratedRelationalV1: z.boolean().optional(),
  warnDaysBefore: z.number().optional(),
});

// ── Inferred TypeScript types ─────────────────────────────────────────────────
// 這些 type 由 schema 推導，與 src/types/ogsm.ts re-export 的保持一致

export type KPI = z.infer<typeof KPISchema>;
export type KpiBaseline = z.infer<typeof KpiBaselineSchema>;
export type AssistUnit = z.infer<typeof AssistUnitSchema>;
export type PlanItem = z.infer<typeof PlanItemSchema>;
export type ActionPlan = z.infer<typeof ActionPlanSchema>;
export type MeasureStatus = z.infer<typeof MeasureStatusSchema>;
export type Measure = z.infer<typeof MeasureSchema>;
export type OgsmLink = z.infer<typeof OgsmLinkSchema>;
export type DashboardLink = z.infer<typeof DashboardLinkSchema>;
export type ActivityDashboardLink = z.infer<typeof ActivityDashboardLinkSchema>;
export type ActivityPlanItem = z.infer<typeof ActivityPlanItemSchema>;
export type DeptActivity = z.infer<typeof DeptActivitySchema>;
export type GoalKpiLink = z.infer<typeof GoalKpiLinkSchema>;
export type FreeNode = z.infer<typeof FreeNodeSchema>;
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
