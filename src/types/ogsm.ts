export type Status =
  | "completed"
  | "on-track"
  | "at-risk"
  | "behind"
  | "not-started";

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
  // single date in MM/DD or range via startDate/endDate
  date?: string;
  startDate?: string;
  endDate?: string;
  description: string;
  completed: boolean;
  linkedMeasureId?: string | null;
  owner?: string;
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
}

export interface Strategy {
  id: string;
  title: string;
  rawText: string;
  measures: Measure[];
  q1Text: string;
  q2Text: string;
  actionPlans: ActionPlan[];
  owner: string;
  notes: string;
  completionRate: number; // 0-200, computed from KPIs
  manualRate: number | null; // user override
  status: Status;
}

export interface Goal {
  id: string;
  label: string; // G1, G2, G3
  title: string;
  fullText: string;
  strategies: Strategy[];
  completionRate: number; // average of strategies
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
}

export interface WorkspaceData {
  departments: Department[];
  version: number;
  teams?: Team[];
  _migratedClearOwners?: boolean;
}
