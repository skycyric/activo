import { describe, test, expect } from "vitest";
import { computeGoalKpiResult } from "./goalKpi";
import {
  computeKpiAchievement,
  resolveBaseline,
  recomputeActivityKpis,
} from "./kpiCalc";
import type { Goal, GoalKPI, DeptActivity, KPI } from "../schemas/ogsm";

// 測試資料工廠

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

function makeDeptActivity(
  kpis: KPI[] = [],
  overrides: Partial<DeptActivity> = {},
): DeptActivity {
  return {
    id: "a1",
    rawText: "活動A",
    kpis,
    status: "in-progress",
    ...overrides,
  };
}

function makeGoal(goalKpis: GoalKPI[] = []): Goal {
  return {
    id: "g1",
    label: "G1",
    title: "目標A",
    fullText: "",
    strategies: [],
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
    goalKpiType: "direct",
    ...overrides,
  };
}

// type="value" SUM

describe("computeGoalKpiResult  type=value SUM", () => {
  test("connected KPI: actual SUM / target SUM, rate computed", () => {
    const kpi = makeKpi({ actual: 60, target: 100, achievementRate: null });
    const activity = makeDeptActivity([kpi]);
    const gk = makeGoalKpi({
      linkedKpis: [{ activityId: "a1", kpiId: "k1" }],
      aggregation: "SUM",
      target: 100,
    });
    const goal = makeGoal([gk]);
    const result = computeGoalKpiResult(gk, goal, [activity]);
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
    const activity = makeDeptActivity([kpi1, kpi2]);
    const gk = makeGoalKpi({
      linkedKpis: [
        { activityId: "a1", kpiId: "k1" },
        { activityId: "a1", kpiId: "k2" },
      ],
      aggregation: "SUM",
      target: null,
    });
    const goal = makeGoal([gk]);
    const result = computeGoalKpiResult(gk, goal, [activity]);
    expect(result.actual).toBe(70);
    expect(result.target).toBe(100);
    expect(result.rate).toBe(70);
  });

  test("no linked KPIs -> actual and rate are null", () => {
    const gk = makeGoalKpi({ linkedKpis: [], target: 100 });
    const goal = makeGoal([gk]);
    const result = computeGoalKpiResult(gk, goal, []);
    expect(result.actual).toBeNull();
    expect(result.rate).toBeNull();
    expect(result.totalCount).toBe(0);
  });
});

// type="value" AVERAGE

describe("computeGoalKpiResult  type=value AVERAGE", () => {
  test("uses computed achievementRate (actual/target) for each KPI", () => {
    // k1: actual=80, target=100 → computed=80
    // k2: actual=60, target=100 → computed=60
    // average = 70
    const kpi1 = makeKpi({ id: "k1", actual: 80, achievementRate: 80 });
    const kpi2 = makeKpi({ id: "k2", actual: 60, achievementRate: 60 });
    const activity = makeDeptActivity([kpi1, kpi2]);
    const gk = makeGoalKpi({
      linkedKpis: [
        { activityId: "a1", kpiId: "k1" },
        { activityId: "a1", kpiId: "k2" },
      ],
      aggregation: "AVERAGE",
      target: 100,
    });
    const goal = makeGoal([gk]);
    const result = computeGoalKpiResult(gk, goal, [activity]);
    expect(result.actual).toBe(70);
    expect(result.rate).toBe(70);
    expect(result.isRateMode).toBe(true);
  });

  test("null actual -> computed=null -> fallback to actual/target average (isRateMode=false)", () => {
    // actual=null means computeKpiAchievement returns null → falls to actual/target fallback
    const kpi = makeKpi({
      actual: null as unknown as number,
      target: 100,
      achievementRate: null,
    });
    const activity = makeDeptActivity([kpi]);
    const gk = makeGoalKpi({
      linkedKpis: [{ activityId: "a1", kpiId: "k1" }],
      aggregation: "AVERAGE",
      target: 100,
    });
    const goal = makeGoal([gk]);
    const result = computeGoalKpiResult(gk, goal, [activity]);
    // actual=null → actual ?? 0 = 0; target=100 → rate = 0
    expect(result.isRateMode).toBe(false);
    expect(result.actual).toBe(0);
  });
});

// type="progress"

describe("computeGoalKpiResult  type=progress", () => {
  test("averages actual values of linked KPIs", () => {
    const kpi1 = makeKpi({ id: "k1", actual: 50 });
    const kpi2 = makeKpi({ id: "k2", actual: 70 });
    const activity = makeDeptActivity([kpi1, kpi2]);
    const gk = makeGoalKpi({
      type: "progress",
      linkedKpis: [
        { activityId: "a1", kpiId: "k1" },
        { activityId: "a1", kpiId: "k2" },
      ],
      target: 100,
    });
    const goal = makeGoal([gk]);
    const result = computeGoalKpiResult(gk, goal, [activity]);
    expect(result.actual).toBe(60);
    expect(result.rate).toBe(60);
    expect(result.isRateMode).toBe(true);
  });

  test("no linked KPIs -> rate is null", () => {
    const gk = makeGoalKpi({ type: "progress", linkedKpis: [] });
    const goal = makeGoal([gk]);
    const result = computeGoalKpiResult(gk, goal, []);
    expect(result.actual).toBeNull();
    expect(result.rate).toBeNull();
  });
});

// type="pct_activity"

describe("computeGoalKpiResult  type=pct_activity", () => {
  test("all activities met -> actual=100%, rate=167", () => {
    const kpi = makeKpi({ id: "k1", achievementRate: 90 });
    const activity = makeDeptActivity([kpi], { id: "a1" });
    const threshGk = makeGoalKpi({
      id: "thresh1",
      type: "value",
      target: 80,
      linkedKpis: [{ activityId: "a1", kpiId: "k1" }],
    });
    const pctGk = makeGoalKpi({
      id: "gk_pct",
      type: "pct_activity",
      target: 60,
      thresholdGoalKpiIds: ["thresh1"],
      linkedKpis: [],
    });
    const goal = makeGoal([threshGk, pctGk]);
    const result = computeGoalKpiResult(pctGk, goal, [activity]);
    expect(result.metCount).toBe(1);
    expect(result.totalCount).toBe(1);
    expect(result.actual).toBe(100);
    expect(result.rate).toBe(167);
  });

  test("no threshold GoalKPIs selected -> empty activities", () => {
    const pctGk = makeGoalKpi({
      type: "pct_activity",
      target: 60,
      thresholdGoalKpiIds: [],
      linkedKpis: [],
    });
    const goal = makeGoal([pctGk]);
    const result = computeGoalKpiResult(pctGk, goal, []);
    expect(result.activities).toHaveLength(0);
    expect(result.metCount).toBe(0);
    expect(result.actual).toBeNull();
  });

  test("activity not met -> met=false", () => {
    // actual=50, target=100 → computed=50 < thresh.target=80 → not met
    const kpi = makeKpi({ id: "k1", actual: 50, achievementRate: 50 });
    const activity = makeDeptActivity([kpi], { id: "a1" });
    const threshGk = makeGoalKpi({
      id: "thresh1",
      type: "value",
      target: 80,
      linkedKpis: [{ activityId: "a1", kpiId: "k1" }],
    });
    const pctGk = makeGoalKpi({
      id: "gk_pct",
      type: "pct_activity",
      target: 60,
      thresholdGoalKpiIds: ["thresh1"],
      linkedKpis: [],
    });
    const goal = makeGoal([threshGk, pctGk]);
    const result = computeGoalKpiResult(pctGk, goal, [activity]);
    expect(result.metCount).toBe(0);
    expect(result.totalCount).toBe(1);
    const act = result.activities[0];
    expect(act.met).toBe(false);
    expect(act.displayRate).toBe(50);
  });

  test("conflict: same activity in two thresholds with different KPIs — first threshold wins by default", () => {
    // thresh1 links activity a1 with KPI k1 (actual=90 → computed=90, target=80) → met
    // thresh2 links activity a1 with KPI k2 (actual=50 → computed=50, target=80) → not met
    // No override → sources[0] = thresh1 → met=true, displayRate=90
    const k1 = makeKpi({ id: "k1", actual: 90, achievementRate: 90 });
    const k2 = makeKpi({ id: "k2", actual: 50, achievementRate: 50 });
    const activity = makeDeptActivity([k1, k2], { id: "a1" });
    const thresh1 = makeGoalKpi({
      id: "thresh1",
      type: "value",
      target: 80,
      linkedKpis: [{ activityId: "a1", kpiId: "k1" }],
    });
    const thresh2 = makeGoalKpi({
      id: "thresh2",
      type: "value",
      target: 80,
      linkedKpis: [{ activityId: "a1", kpiId: "k2" }],
    });
    const pctGk = makeGoalKpi({
      id: "gk_pct",
      type: "pct_activity",
      target: 60,
      thresholdGoalKpiIds: ["thresh1", "thresh2"],
      linkedKpis: [],
    });
    const goal = makeGoal([thresh1, thresh2, pctGk]);
    const result = computeGoalKpiResult(pctGk, goal, [activity]);
    expect(result.totalCount).toBe(1);
    const act = result.activities[0];
    expect(act.isConflict).toBe(true);
    // first source wins → thresh1's KPI (k1, rate=90) is used
    expect(act.displayRate).toBe(90);
    expect(act.chosenSrcId).toBe("thresh1");
    expect(act.met).toBe(true);
    expect(act.chosenTarget).toBe(80);
  });

  test("conflict: override selects the not-met threshold", () => {
    const k1 = makeKpi({ id: "k1", actual: 90, achievementRate: 90 });
    const k2 = makeKpi({ id: "k2", actual: 50, achievementRate: 50 });
    const activity = makeDeptActivity([k1, k2], { id: "a1" });
    const thresh1 = makeGoalKpi({
      id: "thresh1",
      type: "value",
      target: 80,
      linkedKpis: [{ activityId: "a1", kpiId: "k1" }],
    });
    const thresh2 = makeGoalKpi({
      id: "thresh2",
      type: "value",
      target: 80,
      linkedKpis: [{ activityId: "a1", kpiId: "k2" }],
    });
    const pctGk = makeGoalKpi({
      id: "gk_pct",
      type: "pct_activity",
      target: 60,
      thresholdGoalKpiIds: ["thresh1", "thresh2"],
      linkedKpis: [],
      activitySourceOverrides: { a1: "thresh2" }, // user picks thresh2
    });
    const goal = makeGoal([thresh1, thresh2, pctGk]);
    const result = computeGoalKpiResult(pctGk, goal, [activity]);
    const act = result.activities[0];
    expect(act.isConflict).toBe(true);
    expect(act.chosenSrcId).toBe("thresh2");
    expect(act.displayRate).toBe(50);
    expect(act.met).toBe(false);
  });

  test("conflict: same KPI in both thresholds — rate not double-counted", () => {
    // Both thresh1 and thresh2 link the same (activity a1, KPI k1)
    // k1: actual=70, target=100 → computed=70 >= thresh.target=60 → met
    // With fix (only iterate chosen threshold), rate is pushed exactly once
    const k1 = makeKpi({ id: "k1", actual: 70, achievementRate: 70 });
    const activity = makeDeptActivity([k1], { id: "a1" });
    const thresh1 = makeGoalKpi({
      id: "thresh1",
      type: "value",
      target: 60,
      linkedKpis: [{ activityId: "a1", kpiId: "k1" }],
    });
    const thresh2 = makeGoalKpi({
      id: "thresh2",
      type: "value",
      target: 60,
      linkedKpis: [{ activityId: "a1", kpiId: "k1" }],
    });
    const pctGk = makeGoalKpi({
      id: "gk_pct",
      type: "pct_activity",
      target: 60,
      thresholdGoalKpiIds: ["thresh1", "thresh2"],
      linkedKpis: [],
    });
    const goal = makeGoal([thresh1, thresh2, pctGk]);
    const result = computeGoalKpiResult(pctGk, goal, [activity]);
    const act = result.activities[0];
    expect(act.isConflict).toBe(true);
    expect(act.displayRate).toBe(70); // not averaged from two copies
    expect(act.met).toBe(true);
  });
});

// ── computeKpiAchievement：target = 0 邊界案例 ────────────────────────────

describe("computeKpiAchievement  target=0 edge cases", () => {
  function makeBase(overrides: Partial<KPI> = {}): KPI {
    return {
      id: "k1",
      label: "KPI",
      unit: "%",
      actual: 0,
      target: 0,
      achievementRate: null,
      ...overrides,
    };
  }

  test("value (default): actual=0, target=0 → 100", () => {
    expect(computeKpiAchievement(makeBase())).toBe(100);
  });

  test("value (default): actual=5, target=0 → null (除以零)", () => {
    expect(computeKpiAchievement(makeBase({ actual: 5 }))).toBeNull();
  });

  test("value (default): target=null → null", () => {
    expect(computeKpiAchievement(makeBase({ target: null }))).toBeNull();
  });

  test("formulaType=direct_rate: actual=0, target=0 → 100", () => {
    expect(
      computeKpiAchievement(makeBase({ formulaType: "direct_rate" })),
    ).toBe(100);
  });

  test("formulaType=direct_rate: actual=10, target=0 → null", () => {
    expect(
      computeKpiAchievement(
        makeBase({ actual: 10, formulaType: "direct_rate" }),
      ),
    ).toBeNull();
  });

  test("kpiType=target_rate: actual=0, target=0 → 100", () => {
    expect(computeKpiAchievement(makeBase({ kpiType: "target_rate" }))).toBe(
      100,
    );
  });

  test("kpiType=target_rate: actual=50, target=0 → null", () => {
    expect(
      computeKpiAchievement(makeBase({ actual: 50, kpiType: "target_rate" })),
    ).toBeNull();
  });

  test("normal case unaffected: actual=80, target=100 → 80", () => {
    expect(computeKpiAchievement(makeBase({ actual: 80, target: 100 }))).toBe(
      80,
    );
  });
});

// ── resolveBaseline ────────────────────────────────────────────────────────────

describe("resolveBaseline", () => {
  function makeKpiFull(overrides: Partial<KPI> = {}): KPI {
    return {
      id: "k1",
      label: "K",
      unit: "",
      actual: 0,
      target: 100,
      achievementRate: null,
      ...overrides,
    };
  }

  test("baseline.type=fixed → 直接回傳 baseline.value", () => {
    const kpi = makeKpiFull({ baseline: { type: "fixed", value: 50 } });
    expect(resolveBaseline(kpi, [])).toBe(50);
  });

  test("baseline.type=kpiRef，有對應 sibling → 回傳 sibling.actual", () => {
    const kpi = makeKpiFull({ baseline: { type: "kpiRef", kpiId: "k2" } });
    const sibling = makeKpiFull({ id: "k2", actual: 30 });
    expect(resolveBaseline(kpi, [sibling])).toBe(30);
  });

  test("baseline.type=kpiRef，找不到 sibling → null", () => {
    const kpi = makeKpiFull({
      baseline: { type: "kpiRef", kpiId: "k_missing" },
    });
    expect(resolveBaseline(kpi, [])).toBeNull();
  });

  test("無 baseline，有舊 baseValue → 回傳 baseValue", () => {
    const kpi = makeKpiFull({ baseValue: 20 });
    expect(resolveBaseline(kpi, [])).toBe(20);
  });

  test("無任何 baseline → null", () => {
    const kpi = makeKpiFull();
    expect(resolveBaseline(kpi, [])).toBeNull();
  });
});

// ── computeKpiAchievement — formulaType=growth ────────────────────────────────

describe("computeKpiAchievement — formulaType=growth", () => {
  function growthKpi(overrides: Partial<KPI> = {}): KPI {
    return {
      id: "k1",
      label: "K",
      unit: "",
      actual: 150,
      target: null,
      achievementRate: null,
      formulaType: "growth",
      baseline: { type: "fixed", value: 100 },
      targetGrowthRate: 50,
      ...overrides,
    };
  }

  test("正常計算：actual=150, baseline=100, targetGrowthRate=50 → 100%", () => {
    // growthRate = (150-100)/100 * 100 = 50; 50/50 * 100 = 100
    expect(computeKpiAchievement(growthKpi())).toBe(100);
  });

  test("baseline=0 → null（除以零）", () => {
    const kpi = growthKpi({ baseline: { type: "fixed", value: 0 } });
    expect(computeKpiAchievement(kpi)).toBeNull();
  });

  test("actual=null → null", () => {
    const kpi = growthKpi({ actual: null as unknown as number });
    expect(computeKpiAchievement(kpi)).toBeNull();
  });

  test("targetGrowthRate=null → 直接回傳成長率（無目標承諾）", () => {
    // growthRate = (150-100)/100 * 100 = 50
    const kpi = growthKpi({ targetGrowthRate: null });
    expect(computeKpiAchievement(kpi)).toBe(50);
  });

  test("targetGrowthRate=0 → 直接回傳成長率", () => {
    const kpi = growthKpi({ targetGrowthRate: 0 });
    expect(computeKpiAchievement(kpi)).toBe(50);
  });
});

// ── computeKpiAchievement — kpiType=progress（legacy）────────────────────────

describe("computeKpiAchievement — kpiType=progress (legacy)", () => {
  function progressKpi(overrides: Partial<KPI> = {}): KPI {
    return {
      id: "k1",
      label: "K",
      unit: "",
      target: 100,
      achievementRate: null,
      kpiType: "progress",
      actual: 70,
      ...overrides,
    };
  }

  test("actual=70 → 直接回傳 70（不除以 target）", () => {
    expect(computeKpiAchievement(progressKpi())).toBe(70);
  });

  test("actual=null → null", () => {
    expect(
      computeKpiAchievement(progressKpi({ actual: null as unknown as number })),
    ).toBeNull();
  });
});

// ── computeKpiAchievement — kpiType=growth（legacy）──────────────────────────

describe("computeKpiAchievement — kpiType=growth (legacy)", () => {
  function legacyGrowthKpi(overrides: Partial<KPI> = {}): KPI {
    return {
      id: "k1",
      label: "K",
      unit: "",
      target: null,
      achievementRate: null,
      kpiType: "growth",
      actual: 120,
      baseValue: 100,
      targetGrowthRate: 20,
      ...overrides,
    };
  }

  test("baseValue + actual + targetGrowthRate 正常計算", () => {
    // growthRate = (120-100)/100 * 100 = 20; 20/20 * 100 = 100
    expect(computeKpiAchievement(legacyGrowthKpi())).toBe(100);
  });

  test("currentValue 優先於 actual", () => {
    // currentValue=110: growthRate = (110-100)/100*100 = 10; 10/20*100 = 50
    const kpi = legacyGrowthKpi({ currentValue: 110 });
    expect(computeKpiAchievement(kpi)).toBe(50);
  });

  test("baseValue=0 → null（除以零）", () => {
    expect(computeKpiAchievement(legacyGrowthKpi({ baseValue: 0 }))).toBeNull();
  });
});

// ── computeKpiAchievement — kpiType=target_rate（legacy）─────────────────────

describe("computeKpiAchievement — kpiType=target_rate (legacy)", () => {
  function targetRateKpi(overrides: Partial<KPI> = {}): KPI {
    return {
      id: "k1",
      label: "K",
      unit: "",
      achievementRate: null,
      kpiType: "target_rate",
      actual: 90,
      target: 100,
      targetRate: 50,
      ...overrides,
    };
  }

  test("targetRate=50, actual=90, target=100 → rawRate=90, 90/50×100=180", () => {
    expect(computeKpiAchievement(targetRateKpi())).toBe(180);
  });

  test("targetRate=null → 直接回傳 rawRate（actual/target×100）", () => {
    expect(computeKpiAchievement(targetRateKpi({ targetRate: null }))).toBe(90);
  });

  test("targetRate=0 → 直接回傳 rawRate（避免除以零）", () => {
    expect(computeKpiAchievement(targetRateKpi({ targetRate: 0 }))).toBe(90);
  });

  test("target=0, actual=0 → 100（達成）", () => {
    expect(computeKpiAchievement(targetRateKpi({ target: 0, actual: 0 }))).toBe(
      100,
    );
  });
});

// ── recomputeActivityKpis ─────────────────────────────────────────────────────

describe("recomputeActivityKpis", () => {
  test("陣列中每個 KPI 的 achievementRate 都被計算並更新", () => {
    const kpis: KPI[] = [
      {
        id: "k1",
        label: "K1",
        unit: "",
        actual: 80,
        target: 100,
        achievementRate: null,
      },
      {
        id: "k2",
        label: "K2",
        unit: "",
        actual: 50,
        target: 100,
        achievementRate: null,
      },
    ];
    const result = recomputeActivityKpis(kpis);
    expect(result[0].achievementRate).toBe(80);
    expect(result[1].achievementRate).toBe(50);
    // 原始陣列不被修改
    expect(kpis[0].achievementRate).toBeNull();
  });

  test("有 kpiRef baseline 的 growth KPI 能正確找到 sibling", () => {
    const kpis: KPI[] = [
      {
        id: "base_k",
        label: "Baseline",
        unit: "",
        actual: 100,
        target: null,
        achievementRate: null,
      },
      {
        id: "growth_k",
        label: "Growth",
        unit: "",
        actual: 150,
        target: null,
        achievementRate: null,
        formulaType: "growth" as const,
        baseline: { type: "kpiRef" as const, kpiId: "base_k" },
        targetGrowthRate: 50,
      },
    ];
    const result = recomputeActivityKpis(kpis);
    // growth: (150-100)/100*100=50; 50/50*100=100
    expect(result[1].achievementRate).toBe(100);
  });

  test("空陣列 → 回傳空陣列", () => {
    expect(recomputeActivityKpis([])).toHaveLength(0);
  });
});
