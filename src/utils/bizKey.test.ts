import { describe, expect, test } from "vitest";
import {
  generateBizKey,
  generateUniqueBizKey,
  generateUniqueGoalBizKey,
  generateUniqueStrategyBizKey,
  getActivityScopeExistingKeys,
  resolveActivityBizKeyScope,
  isValidBizKey,
} from "./bizKey";

describe("bizKey", () => {
  test("goal template uses year/half/dept/goal order", () => {
    const key = generateBizKey({
      entityType: "goal",
      year: 2026,
      halfYear: "H1",
      deptCode: "商務發展部",
      goalOrder: 2,
    });

    expect(key).toBe("GOAL-2026-H1-DEPT-G2");
    expect(isValidBizKey(key)).toBe(true);
  });

  test("activity template includes hierarchical orders", () => {
    const key = generateBizKey({
      entityType: "activity",
      year: 2026,
      halfYear: "H2",
      deptCode: "BD",
      goalOrder: 1,
      strategyOrder: 3,
      activityOrder: 12,
    });

    expect(key).toBe("ACT-2026-H2-BD-G1-S03-A012");
    expect(isValidBizKey(key)).toBe(true);
  });

  test("appends version suffix when version > 1", () => {
    const key = generateBizKey({
      entityType: "strategy",
      year: 2026,
      halfYear: "H1",
      deptCode: "design team",
      goalOrder: 4,
      strategyOrder: 7,
      version: 2,
    });

    expect(key).toBe("STR-2026-H1-DESIGN-TEAM-G4-S07-V2");
  });

  test("normalizes invalid characters and enforces max length", () => {
    const key = generateBizKey({
      entityType: "activityLink",
      year: 2026,
      halfYear: "H1",
      deptCode: "very long dept code with spaces",
      activityOrder: 99,
      targetCode:
        "target@#with$%^invalid&*chars-and-a-very-very-long-fragment-to-trim",
    });

    expect(isValidBizKey(key)).toBe(true);
    expect(key.length).toBeLessThanOrEqual(64);
    expect(key.includes("_")).toBe(false);
  });

  test("invalid key detection", () => {
    expect(isValidBizKey("BAD_key")).toBe(false);
    expect(isValidBizKey("BAD--KEY")).toBe(false);
  });

  test("unique generation increments order token when scoped key exists", () => {
    const key = generateUniqueBizKey({
      input: {
        entityType: "goal",
        year: 2026,
        halfYear: "H1",
        deptCode: "BD",
        goalOrder: 1,
      },
      existingKeys: ["GOAL-2026-H1-BD-G1"],
    });

    expect(key).toBe("GOAL-2026-H1-BD-G2");
  });

  test("unique generation falls back to suffix for non-ordered entities", () => {
    const key = generateUniqueBizKey({
      input: {
        entityType: "period",
        year: 2026,
        halfYear: "H1",
        deptCode: "BD",
      },
      existingKeys: ["PER-2026-H1-BD"],
    });

    expect(key).toBe("PER-2026-H1-BD-01");
  });

  test("goal scope helper checks against goals in same scope", () => {
    const key = generateUniqueGoalBizKey({
      year: 2026,
      halfYear: "H1",
      deptCode: "BD",
      goalOrder: 1,
      goals: [{ bizKey: "GOAL-2026-H1-BD-G1" }],
    });

    expect(key).toBe("GOAL-2026-H1-BD-G2");
  });

  test("strategy scope helper checks against sibling strategies", () => {
    const key = generateUniqueStrategyBizKey({
      year: 2026,
      halfYear: "H1",
      deptCode: "BD",
      goalOrder: 2,
      strategyOrder: 1,
      strategies: [{ bizKey: "STR-2026-H1-BD-G2-S01" }],
    });

    expect(key).toBe("STR-2026-H1-BD-G2-S02");
  });

  test("activity scope helper filters same ogsm strategy only", () => {
    const keys = getActivityScopeExistingKeys(
      [
        {
          bizKey: "ACT-2026-H1-BD-G1-S01-A001",
          dashboardLinks: [
            {
              type: "ogsm",
              periodId: "p1",
              goalId: "g1",
              strategyId: "s1",
            },
          ],
        },
        {
          bizKey: "ACT-2026-H1-BD-G1-S02-A001",
          dashboardLinks: [
            {
              type: "ogsm",
              periodId: "p1",
              goalId: "g1",
              strategyId: "s2",
            },
          ],
        },
      ],
      { periodId: "p1", goalId: "g1", strategyId: "s1" },
    );

    expect(keys).toEqual(["ACT-2026-H1-BD-G1-S01-A001"]);
  });

  test("resolve activity scope from dashboard links", () => {
    const scope = resolveActivityBizKeyScope([
      {
        type: "other",
      },
      {
        type: "ogsm",
        periodId: "p1",
        goalId: "g1",
        strategyId: "s1",
      },
    ]);

    expect(scope).toEqual({ periodId: "p1", goalId: "g1", strategyId: "s1" });
  });
});
