export interface KPI {
  id: string;
  label: string;
  target: number | null;
  actual: number | null;
  unit: string;
  achievementRate: number | null; // 0-200 (>100 = exceeded)
}

export interface PlanItem {
  id: string;
  description: string;
  plannedStartDate?: string; // 預計開始日 (ISO YYYY-MM-DD)
  actualStartDate?: string; // 實際開始日
  plannedEndDate?: string; // 預計完成日
  actualEndDate?: string; // 實際完成日
  completed: boolean;
  linkedMeasureId?: string | null;
  owner?: string;
  notes?: string; // 備註／卡住原因
}

export interface ActionPlan {
  id: string;
  quarter: string;
  title: string;
  items: PlanItem[];
}

export interface Measure {
  id: string;
  rawText: string;
  kpis: KPI[];
  quarter?: string;
  owner?: string;
  updatedAt?: string;
  status?: string;
  budget?: number;
  personDays?: number;
  startDate?: string; // 活動起始日 (ISO)
  endDate?: string; // 活動結束日 (ISO)
}

export interface Strategy {
  id: string;
  title: string;
  rawText: string;
  measures: Measure[];
  q1Text: string;
  q2Text: string;
  actionPlans: ActionPlan[];
  owner: string; // legacy single-owner (kept for backward compat)
  owners?: string[]; // multi-owner (preferred)
  notes: string;
  completionRate: number; // 0-200, computed from KPIs
  manualRate: number | null; // user override
  updatedAt?: string; // ISO timestamp, for merge conflict resolution
}

export interface GoalKpiLink {
  strategyId: string;
  measureId: string;
  kpiId: string;
}

export interface GoalKPI {
  id: string;
  label: string; // 指標名稱，如「整體綁定率」
  unit: string; // 單位，如「%」、「人」
  target: number | null; // G 層級自訂目標值（選填）
  aggregation: "SUM" | "AVERAGE";
  linkedKpis: GoalKpiLink[];
}

export interface Goal {
  id: string;
  label: string; // G1, G2, G3
  title: string;
  fullText: string;
  strategies: Strategy[];
  completionRate: number; // average of strategies
  goalKpis?: GoalKPI[];
  updatedAt?: string; // ISO timestamp, for merge conflict resolution
}

export interface OGSMData {
  objectives: {
    orgO: string;
    deptO: string;
  };
  goals: Goal[];
  period: string;
  importedAt: string;
  overallRate: number;
}

export interface PeriodData {
  id: string;
  halfYear: "H1" | "H2";
  year: number;
  ogsm: OGSMData;
}

export interface Department {
  id: string;
  name: string;
  periods: PeriodData[];
}

export interface TeamMember {
  id: string;
  name: string;
}

export interface Team {
  id: string;
  name: string;
  members: TeamMember[];
  updatedAt?: string; // ISO timestamp, for merge conflict resolution
}

export interface WorkspaceData {
  departments: Department[];
  version: number;
  savedAt?: string; // ISO timestamp written to file on each disk save
  deletedIds?: string[]; // tombstone list: ids of deleted goals / strategies / teams
  teams?: Team[];
  _migratedClearOwners?: boolean;
}
