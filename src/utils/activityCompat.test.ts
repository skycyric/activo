import { describe, expect, it } from "vitest";
import type { Department, DeptActivity, OGSMData } from "../schemas/ogsm";
import {
  getDeptActivitiesForPeriodRead,
  getLegacyStrategyMeasureActivities,
  hasCanonicalDeptActivities,
} from "./activityCompat";

function createActivity(id: string): DeptActivity {
  return {
    id,
    rawText: id,
    status: "not-started",
    owners: [],
    kpis: [],
    dashboardLinks: [],
    planItems: [],
    notes: "",
  };
}

function createOgsm(measureIds: string[]): OGSMData {
  return {
    objectives: { orgO: "", deptO: "" },
    goals: [
      {
        id: "goal-1",
        label: "Goal 1",
        title: "Goal 1",
        fullText: "Goal 1",
        strategies: [
          {
            id: "strategy-1",
            title: "Strategy 1",
            rawText: "Strategy 1",
            notes: "",
            owner: undefined,
            owners: [],
            q1Text: undefined,
            q2Text: undefined,
            actionPlans: [],
            measures: measureIds.map((id) => createActivity(id)),
            completionRate: 0,
            manualRate: null,
            updatedAt: undefined,
            clearedFields: undefined,
          },
        ],
        goalKpis: [],
        completionRate: 0,
        updatedAt: undefined,
        clearedFields: undefined,
      },
    ],
    period: "2026 H1",
    importedAt: "2026-04-20T00:00:00.000Z",
    overallRate: 0,
  };
}

function createDepartment(activityIds: string[]): Department {
  return {
    id: "dept-1",
    name: "Dept 1",
    periods: [],
    activities: activityIds.map((id) => createActivity(id)),
  };
}

describe("activityCompat", () => {
  it("prefers canonical dept.activities when present", () => {
    const dept = createDepartment(["activity-1"]);
    const ogsm = createOgsm(["legacy-1"]);

    expect(hasCanonicalDeptActivities(dept)).toBe(true);
    expect(getDeptActivitiesForPeriodRead(dept, ogsm)).toEqual({
      activities: dept.activities ?? [],
      source: "dept.activities",
    });
  });

  it("falls back to strategy.measures when dept.activities is empty", () => {
    const dept = createDepartment([]);
    const ogsm = createOgsm(["legacy-1", "legacy-2"]);

    expect(hasCanonicalDeptActivities(dept)).toBe(false);
    expect(
      getLegacyStrategyMeasureActivities(ogsm).map((activity) => activity.id),
    ).toEqual(["legacy-1", "legacy-2"]);
    expect(getDeptActivitiesForPeriodRead(dept, ogsm)).toEqual({
      activities: getLegacyStrategyMeasureActivities(ogsm),
      source: "strategy.measures",
    });
  });
});
