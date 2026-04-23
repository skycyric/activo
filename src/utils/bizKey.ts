export type BizEntityType =
  | "department"
  | "period"
  | "goal"
  | "strategy"
  | "activity"
  | "kpi"
  | "actionPlan"
  | "planItem"
  | "goalKpi"
  | "dashboardLink"
  | "team"
  | "teamMember"
  | "freeNode"
  | "activityLink";

export interface GenerateBizKeyInput {
  entityType: BizEntityType;
  year?: number;
  halfYear?: "H1" | "H2";
  deptCode?: string;
  goalOrder?: number;
  strategyOrder?: number;
  activityOrder?: number;
  kpiOrder?: number;
  goalKpiOrder?: number;
  planOrder?: number;
  itemOrder?: number;
  linkOrder?: number;
  teamOrder?: number;
  memberOrder?: number;
  freeNodeOrder?: number;
  quarter?: "Q1" | "Q2" | "Q3" | "Q4";
  targetCode?: string;
  version?: number;
}

export interface GenerateUniqueBizKeyInput {
  input: GenerateBizKeyInput;
  existingKeys: Iterable<string | undefined | null>;
  maxAttempts?: number;
}

type BizKeyCarrier = { bizKey?: string | null };

type OgsmLinkLike = {
  type?: string;
  periodId?: string;
  goalId?: string;
  strategyId?: string;
};

type ActivityCarrier = BizKeyCarrier & {
  dashboardLinks?: ReadonlyArray<OgsmLinkLike>;
};

export interface ActivityBizKeyScope {
  periodId: string;
  goalId: string;
  strategyId: string;
}

export interface GenerateUniqueGoalBizKeyInput {
  year?: number;
  halfYear?: "H1" | "H2";
  deptCode?: string;
  goalOrder?: number;
  goals: ReadonlyArray<BizKeyCarrier>;
}

export interface GenerateUniqueStrategyBizKeyInput {
  year?: number;
  halfYear?: "H1" | "H2";
  deptCode?: string;
  goalOrder?: number;
  strategyOrder?: number;
  strategies: ReadonlyArray<BizKeyCarrier>;
}

const BIZKEY_RE = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function token(value: string | number | undefined, maxLen = 24): string {
  if (value === undefined || value === null) return "";
  const normalized = String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.slice(0, maxLen);
}

function order(prefix: string, value: number | undefined, width = 2): string {
  if (!value || value <= 0) return "";
  return `${prefix}${String(value).padStart(width, "0")}`;
}

function join(parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join("-");
}

export function generateBizKey(input: GenerateBizKeyInput): string {
  const yyyy = input.year ? String(input.year) : "";
  const hh = input.halfYear;
  const dep = token(input.deptCode, 12) || "DEPT";
  const gno = order("G", input.goalOrder, 1);
  const sno = order("S", input.strategyOrder, 2);
  const ano = order("A", input.activityOrder, 3);
  const kno = order("K", input.kpiOrder, 2);
  const gkno = order("K", input.goalKpiOrder, 2);
  const pno = order("P", input.planOrder, 2);
  const ino = order("I", input.itemOrder, 2);
  const lno = order("L", input.linkOrder, 2);
  const tno = order("T", input.teamOrder, 2);
  const mno = order("M", input.memberOrder, 2);
  const fno = order("F", input.freeNodeOrder, 2);
  const qx = token(input.quarter, 2);
  const target = token(input.targetCode, 16) || "TARGET";

  const base = (() => {
    switch (input.entityType) {
      case "department":
        return join(["DEP", yyyy, dep]);
      case "period":
        return join(["PER", yyyy, hh, dep]);
      case "goal":
        return join(["GOAL", yyyy, hh, dep, gno]);
      case "strategy":
        return join(["STR", yyyy, hh, dep, gno, sno]);
      case "activity":
        return join(["ACT", yyyy, hh, dep, gno, sno, ano]);
      case "kpi":
        return join(["KPI", yyyy, hh, dep, gno, sno, ano, kno]);
      case "actionPlan":
        return join(["PLN", yyyy, hh, dep, gno, sno, qx, pno]);
      case "planItem":
        return join(["PIT", yyyy, hh, dep, gno, sno, ano, qx, ino]);
      case "goalKpi":
        return join(["GKPI", yyyy, hh, dep, gno, gkno]);
      case "dashboardLink":
        return join(["DLK", yyyy, hh, dep, ano, lno]);
      case "team":
        return join(["TEAM", dep, tno]);
      case "teamMember":
        return join(["MBR", dep, tno, mno]);
      case "freeNode":
        return join(["FREE", yyyy, hh, dep, fno]);
      case "activityLink":
        return join(["ALK", yyyy, hh, dep, ano, target]);
      default:
        return "";
    }
  })();

  const v = input.version && input.version > 1 ? `V${input.version}` : "";
  const key = join([base, v]);
  return token(key, 64);
}

function withIncrementedOrder(
  input: GenerateBizKeyInput,
  step: number,
): GenerateBizKeyInput {
  const next = { ...input };
  switch (input.entityType) {
    case "goal":
      next.goalOrder = (input.goalOrder ?? 0) + step;
      return next;
    case "strategy":
      next.strategyOrder = (input.strategyOrder ?? 0) + step;
      return next;
    case "activity":
      next.activityOrder = (input.activityOrder ?? 0) + step;
      return next;
    case "kpi":
      next.kpiOrder = (input.kpiOrder ?? 0) + step;
      return next;
    case "actionPlan":
      next.planOrder = (input.planOrder ?? 0) + step;
      return next;
    case "planItem":
      next.itemOrder = (input.itemOrder ?? 0) + step;
      return next;
    case "goalKpi":
      next.goalKpiOrder = (input.goalKpiOrder ?? 0) + step;
      return next;
    case "dashboardLink":
      next.linkOrder = (input.linkOrder ?? 0) + step;
      return next;
    case "team":
      next.teamOrder = (input.teamOrder ?? 0) + step;
      return next;
    case "teamMember":
      next.memberOrder = (input.memberOrder ?? 0) + step;
      return next;
    case "freeNode":
      next.freeNodeOrder = (input.freeNodeOrder ?? 0) + step;
      return next;
    default:
      return next;
  }
}

function supportsOrderedIncrement(entityType: BizEntityType): boolean {
  return (
    entityType !== "department" &&
    entityType !== "period" &&
    entityType !== "activityLink"
  );
}

export function generateUniqueBizKey({
  input,
  existingKeys,
  maxAttempts = 999,
}: GenerateUniqueBizKeyInput): string {
  const existing = new Set(
    Array.from(existingKeys)
      .filter((k): k is string => typeof k === "string" && k.length > 0)
      .map((k) => k.toUpperCase()),
  );

  const base = generateBizKey(input);
  if (!existing.has(base.toUpperCase())) return base;

  if (supportsOrderedIncrement(input.entityType)) {
    for (let i = 1; i <= maxAttempts; i++) {
      const next = generateBizKey(withIncrementedOrder(input, i));
      if (!existing.has(next.toUpperCase())) return next;
    }
  }

  for (let i = 1; i <= maxAttempts; i++) {
    const suffixed = `${base}-${String(i).padStart(2, "0")}`;
    const normalized = token(suffixed, 64);
    if (!existing.has(normalized.toUpperCase())) return normalized;
  }

  return token(`${base}-${Date.now().toString(36).toUpperCase()}`, 64);
}

export function getGoalScopeExistingKeys(
  goals: ReadonlyArray<BizKeyCarrier>,
): string[] {
  return goals.map((g) => g.bizKey ?? "");
}

export function getStrategyScopeExistingKeys(
  strategies: ReadonlyArray<BizKeyCarrier>,
): string[] {
  return strategies.map((s) => s.bizKey ?? "");
}

export function resolveActivityBizKeyScope(
  links: ReadonlyArray<OgsmLinkLike> | undefined,
): ActivityBizKeyScope | undefined {
  const link = (links ?? []).find(
    (l) => l.type === "ogsm" && l.periodId && l.goalId && l.strategyId,
  );
  if (!link?.periodId || !link.goalId || !link.strategyId) return undefined;
  return {
    periodId: link.periodId,
    goalId: link.goalId,
    strategyId: link.strategyId,
  };
}

export function getActivityScopeExistingKeys(
  activities: ReadonlyArray<ActivityCarrier>,
  scope?: ActivityBizKeyScope,
): string[] {
  if (!scope) return activities.map((a) => a.bizKey ?? "");

  return activities
    .filter((a) =>
      (a.dashboardLinks ?? []).some(
        (l) =>
          l.type === "ogsm" &&
          l.periodId === scope.periodId &&
          l.goalId === scope.goalId &&
          l.strategyId === scope.strategyId,
      ),
    )
    .map((a) => a.bizKey ?? "");
}

export function generateUniqueGoalBizKey({
  year,
  halfYear,
  deptCode,
  goalOrder,
  goals,
}: GenerateUniqueGoalBizKeyInput): string {
  return generateUniqueBizKey({
    input: {
      entityType: "goal",
      year,
      halfYear,
      deptCode,
      goalOrder,
    },
    existingKeys: getGoalScopeExistingKeys(goals),
  });
}

export function generateUniqueStrategyBizKey({
  year,
  halfYear,
  deptCode,
  goalOrder,
  strategyOrder,
  strategies,
}: GenerateUniqueStrategyBizKeyInput): string {
  return generateUniqueBizKey({
    input: {
      entityType: "strategy",
      year,
      halfYear,
      deptCode,
      goalOrder,
      strategyOrder,
    },
    existingKeys: getStrategyScopeExistingKeys(strategies),
  });
}

export function isValidBizKey(key: string): boolean {
  return BIZKEY_RE.test(key) && key.length <= 64;
}
