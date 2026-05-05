import type { Department, DeptActivity, OGSMData } from "../schemas/ogsm";

export type ActivityReadSource = "dept.activities" | "strategy.measures";

export function hasCanonicalDeptActivities(
  dept: Department | undefined,
): boolean {
  return (dept?.activities?.length ?? 0) > 0;
}

export function getLegacyStrategyMeasureActivities(
  ogsm: OGSMData,
): DeptActivity[] {
  return ogsm.goals.flatMap((goal) =>
    goal.strategies.flatMap((strategy) => strategy.measures as DeptActivity[]),
  );
}

export function getDeptActivitiesForPeriodRead(
  dept: Department | undefined,
  ogsm: OGSMData,
): { activities: DeptActivity[]; source: ActivityReadSource } {
  if (hasCanonicalDeptActivities(dept)) {
    return {
      activities: dept!.activities ?? [],
      source: "dept.activities",
    };
  }

  return {
    activities: getLegacyStrategyMeasureActivities(ogsm),
    source: "strategy.measures",
  };
}
