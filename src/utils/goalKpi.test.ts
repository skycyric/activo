import { describe, test, expect } from "vitest";
import { computeGoalKpiResult } from "./goalKpi";
import type { Goal, GoalKPI, Strategy, Measure, KPI } from "../schemas/ogsm";

// ─── 測試資料工廠 ─────────────────────────────────────────────────────────────

function makeKpi(overrides: Partial<KPI> = {}): KPI {
  return {
    id: "k1",
    label: "KPI A",
    unit: "%",
    actual: 80,
    target: 100,
    achievementRate: 80,
    kpiType: "value",
    ...overrides,
  };
}

function makeMeasure(
  kpis: KPI[] = [],
  overrides: Partial<Measure> = {},
): Measure {
  return {
    id: "m1",
    rawText: "行動計畫A",
    kpis,
    status: "in-progress",
    ...overrides,
  };
}

function makeStrategy(measures: Measure[] = []): Strategy {
  return {
    id: "s1",
    title: "策略A",
    rawText: "",
    measures,
    actionPlans: [],
    owners: [],
    notes: "",
    completionRate: 0,
    manualRate: null,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeGoal(strategies: Strategy[] = [], goalKpis: GoalKPI[] = []): Goal {
  return {
    id: "g1",
    label: "G1",
    title: "目標A",
    fullText: "",
    strategies,
    goalKpis,
    completionRate: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeGoalKpi(overrides: Partial<GoalKPI> = {}): GoalKPI {
  return {
    id: "gk1",
    label: "GoalKPI A",
    unit: "%",
    target: 100,
    aggregation: "SUM",
    type: "value",
    isHeadline: false,
    thresholdGoalKpiIds: [],
    linkedKpis: [],
    ...overrides,
  };
}

// ─── type="value" SUM ─────────────────────────────────────────────────────────

describe("computeGoalKpiResult — type=value SUM", () => {
  test("connected KPI: actual SUM / target SUM, rate computed", () => {
    const kpi = makeKpi({ actual: 60, target: 100, achievementRate: null });
    const measure = makeMeasure([kpi]);
    const strategy = makeStrategy([measure]);
    const gk = makeGoalKpi({
      linkedKpis: [{ strategyId: "s1", measureId: "m1", kpiId: "k1" }],
      aggregation: "SUM",
      target: 100,
    });
    const goal = makeGoal([strategy], [gk]);
    const result = computeGoalKpiResult(gk, goal);
    expect(result.actual).toBe(60);
    expect(result.target).toBe(100);
    expect(result.rate).toBe(60);
    expect(result.isRateMode).toBe(false);
  });

  test("multiple KPIs: actual summed", () => {
    const kpi1 = makeKpi({
      id: "k1",
      actual: 40,
      target: 50,
      achievementRate: null,
    });
    const kpi2 = makeKpi({
      id: "k2",
      actual: 30,
      target: 50,
      achievementRate: null,
    });
    const measure = makeMeasure([kpi1, kpi2]);
    const strategy = makeStrategy([measure]);
    const gk = makeGoalKpi({
      linkedKpis: [
        { strategyId: "s1", measureId: "m1", kpiId: "k1" },
        { strategyId: "s1", measureId: "m1", kpiId: "k2" },
      ],
      aggregation: "SUM",
      target: null, // fallback to sumTarget
    });
    const goal = makeGoal([strategy], [gk]);
    const result = computeGoalKpiResult(gk, goal);
    expect(result.actual).toBe(70);
    expect(result.target).toBe(100); // 50+50
    expect(result.rate).toBe(70);
  });

  test("no linked KPIs → actual and rate are null", () => {
    const gk = makeGoalKpi({ linkedKpis: [], target: 100 });
    const goal = makeGoal([], [gk]);
    const result = computeGoalKpiResult(gk, goal);
    expect(result.actual).toBeNull();
    expect(result.rate).toBeNull();
    expect(result.totalCount).toBe(0);
  });
});

// ─── type="value" AVERAGE ─────────────────────────────────────────────────────

describe("computeGoalKpiResult — type=value AVERAGE", () => {
  test("uses achievementRate when present", () => {
    const kpi1 = makeKpi({ id: "k1", achievementRate: 80 });
    const kpi2 = makeKpi({ id: "k2", achievementRate: 60 });
    const measure = makeMeasure([kpi1, kpi2]);
    const strategy = makeStrategy([measure]);
    const gk = makeGoalKpi({
      linkedKpis: [
        { strategyId: "s1", measureId: "m1", kpiId: "k1" },
        { strategyId: "s1", measureId: "m1", kpiId: "k2" },
      ],
      aggregation: "AVERAGE",
      target: 100,
    });
    const goal = makeGoal([strategy], [gk]);
    const result = computeGoalKpiResult(gk, goal);
    expect(result.actual).toBe(70); // avg of 80 and 60
    expect(result.rate).toBe(70); // 70/100 * 100
    expect(result.isRateMode).toBe(true);
  });

  test("no achievementRate → fallback to actual/target average", () => {
    const kpi = makeKpi({ actual: 75, target: 100, achievementRate: null });
    const measure = makeMeasure([kpi]);
    const strategy = makeStrategy([measure]);
    const gk = makeGoalKpi({
      linkedKpis: [{ strategyId: "s1", measureId: "m1", kpiId: "k1" }],
      aggregation: "AVERAGE",
      target: 100,
    });
    const goal = makeGoal([strategy], [gk]);
    const result = computeGoalKpiResult(gk, goal);
    expect(result.actual).toBe(75);
    expect(result.rate).toBe(75);
    expect(result.isRateMode).toBe(false);
  });
});

// ─── type="progress" ──────────────────────────────────────────────────────────

describe("computeGoalKpiResult — type=progress", () => {
  test("averages actual values of linked KPIs", () => {
    const kpi1 = makeKpi({ id: "k1", actual: 50 });
    const kpi2 = makeKpi({ id: "k2", actual: 70 });
    const measure = makeMeasure([kpi1, kpi2]);
    const strategy = makeStrategy([measure]);
    const gk = makeGoalKpi({
      type: "progress",
      linkedKpis: [
        { strategyId: "s1", measureId: "m1", kpiId: "k1" },
        { strategyId: "s1", measureId: "m1", kpiId: "k2" },
      ],
      target: 100,
    });
    const goal = makeGoal([strategy], [gk]);
    const result = computeGoalKpiResult(gk, goal);
    expect(result.actual).toBe(60); // avg of 50 and 70
    expect(result.rate).toBe(60);
    expect(result.isRateMode).toBe(true);
  });

  test("no linked KPIs → rate is null", () => {
    const gk = makeGoalKpi({ type: "progress", linkedKpis: [] });
    const goal = makeGoal([], [gk]);
    const result = computeGoalKpiResult(gk, goal);
    expect(result.actual).toBeNull();
    expect(result.rate).toBeNull();
  });
});

// ─── type="pct_activity" ─────────────────────────────────────────────────────

describe("computeGoalKpiResult — type=pct_activity", () => {
  test("all activities met → actual=100%, rate=100/target*100", () => {
    const kpi = makeKpi({ id: "k1", achievementRate: 90 });
    const measure = makeMeasure([kpi], { id: "m1" });
    const strategy = makeStrategy([measure]);

    // threshGk links to m1/k1 with target 80
    const threshGk = makeGoalKpi({
      id: "thresh1",
      type: "value",
      target: 80,
      linkedKpis: [{ strategyId: "s1", measureId: "m1", kpiId: "k1" }],
    });
    // the pct_activity GoalKPI uses thresh1 as threshold
    const pctGk = makeGoalKpi({
      id: "gk_pct",
      type: "pct_activity",
      target: 60, // need 60% of activities to pass
      thresholdGoalKpiIds: ["thresh1"],
      linkedKpis: [],
    });
    const goal = makeGoal([strategy], [threshGk, pctGk]);
    const result = computeGoalKpiResult(pctGk, goal);
    // 1 activity, achievementRate 90 >= threshold 80 → met
    expect(result.metCount).toBe(1);
    expect(result.totalCount).toBe(1);
    expect(result.actual).toBe(100); // 1/1 * 100
    // rate = actual(100) / target(60) * 100 = 166%
    expect(result.rate).toBe(167); // Math.round(100/60*100)
  });

  test("no threshold GoalKPIs selected → empty activities", () => {
    const pctGk = makeGoalKpi({
      type: "pct_activity",
      target: 60,
      thresholdGoalKpiIds: [],
      linkedKpis: [],
    });
    const goal = makeGoal([], [pctGk]);
    const result = computeGoalKpiResult(pctGk, goal);
    expect(result.activities).toHaveLength(0);
    expect(result.metCount).toBe(0);
    expect(result.actual).toBeNull(); // totalCount=0 → null
  });

  test("activity not met → met=false", () => {
    const kpi = makeKpi({ id: "k1", achievementRate: 50 });
    const measure = makeMeasure([kpi], { id: "m1" });
    const strategy = makeStrategy([measure]);
    const threshGk = makeGoalKpi({
      id: "thresh1",
      type: "value",
      target: 80,
      linkedKpis: [{ strategyId: "s1", measureId: "m1", kpiId: "k1" }],
    });
    const pctGk = makeGoalKpi({
      id: "gk_pct",
      type: "pct_activity",
      target: 60,
      thresholdGoalKpiIds: ["thresh1"],
      linkedKpis: [],
    });
    const goal = makeGoal([strategy], [threshGk, pctGk]);
    const result = computeGoalKpiResult(pctGk, goal);
    expect(result.metCount).toBe(0);
    expect(result.totalCount).toBe(1);
    const activity = result.activities[0];
    expect(activity.met).toBe(false);
    expect(activity.displayRate).toBe(50);
  });
});
