import { describe, test, expect } from "vitest";
import {
  getPlanItemWarning,
  countPlanWarnings,
  countStrategyWarnings,
  computePctActivityRate,
} from "./planWarnings";
import type { PlanItem, Strategy, Goal, GoalKPI } from "../schemas/ogsm";

// ─── 測試資料工廠 ──────────────────────────────────────────────────────────────

const TODAY = "2026-04-01"; // 固定今天，讓測試不受時間影響

function makePlanItem(overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: "item1",
    description: "行動項目",
    completed: false,
    linkedMeasureId: undefined,
    ...overrides,
  };
}

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: "s1",
    title: "S1",
    rawText: "",
    measures: [],
    actionPlans: [],
    owners: [],
    notes: "",
    completionRate: 0,
    manualRate: null,
    ...overrides,
  };
}

// ─── getPlanItemWarning ────────────────────────────────────────────────────────

describe("getPlanItemWarning", () => {
  test("已完成的項目永遠回傳 null", () => {
    const item = makePlanItem({
      completed: true,
      plannedEndDate: "2026-01-01",
    });
    expect(getPlanItemWarning(item, 7)).toBeNull();
  });

  test("沒有截止日的項目回傳 null", () => {
    const item = makePlanItem({ completed: false });
    expect(getPlanItemWarning(item, 7)).toBeNull();
  });

  test("截止日在過去 → overdue", () => {
    const item = makePlanItem({ plannedEndDate: "2026-01-01" });
    expect(getPlanItemWarning(item, 7)).toBe("overdue");
  });

  test("截止日在 warnDays 內（今天）→ warning", () => {
    const item = makePlanItem({ plannedEndDate: TODAY });
    expect(getPlanItemWarning(item, 7)).toBe("warning");
  });

  test("截止日在 warnDays 外（30 天後）→ null", () => {
    const item = makePlanItem({ plannedEndDate: "2026-05-01" });
    expect(getPlanItemWarning(item, 7)).toBeNull();
  });

  test("截止日恰好在 warnDays 當天 → warning", () => {
    const item = makePlanItem({ plannedEndDate: "2026-04-08" }); // TODAY + 7 days
    expect(getPlanItemWarning(item, 7)).toBe("warning");
  });
});

// ─── countPlanWarnings ────────────────────────────────────────────────────────

describe("countPlanWarnings", () => {
  test("全部完成的項目 → 0 overdue, 0 warning", () => {
    const items = [
      makePlanItem({ completed: true, plannedEndDate: "2026-01-01" }),
      makePlanItem({ completed: true, plannedEndDate: "2026-01-01" }),
    ];
    expect(countPlanWarnings(items, 7)).toEqual({ overdue: 0, warning: 0 });
  });

  test("混合狀態正確計數", () => {
    const items = [
      makePlanItem({ id: "a", plannedEndDate: "2026-01-01" }), // overdue
      makePlanItem({ id: "b", plannedEndDate: TODAY }), // warning
      makePlanItem({ id: "c", plannedEndDate: "2026-05-01" }), // ok
      makePlanItem({ id: "d", completed: true, plannedEndDate: "2026-01-01" }), // done
    ];
    expect(countPlanWarnings(items, 7)).toEqual({ overdue: 1, warning: 1 });
  });

  test("空陣列 → 全 0", () => {
    expect(countPlanWarnings([], 7)).toEqual({ overdue: 0, warning: 0 });
  });
});

// ─── countStrategyWarnings ────────────────────────────────────────────────────

describe("countStrategyWarnings", () => {
  test("策略有多個 actionPlan，每個都有 items → 合計逾期數", () => {
    const s = makeStrategy({
      actionPlans: [
        {
          id: "ap1",
          quarter: "Q1",
          title: "",
          items: [makePlanItem({ id: "i1", plannedEndDate: "2026-01-01" })],
        },
        {
          id: "ap2",
          quarter: "Q2",
          title: "",
          items: [
            makePlanItem({ id: "i2", plannedEndDate: "2026-01-01" }),
            makePlanItem({ id: "i3", plannedEndDate: "2026-05-01" }),
          ],
        },
      ],
    });
    const result = countStrategyWarnings(s, 7);
    expect(result.overdue).toBe(2);
    expect(result.warning).toBe(0);
  });

  test("無 actionPlan 的策略 → 0/0", () => {
    const s = makeStrategy();
    expect(countStrategyWarnings(s, 7)).toEqual({ overdue: 0, warning: 0 });
  });
});

// ─── computePctActivityRate ───────────────────────────────────────────────────

function makeGoalWithKpis(
  threshGkId: string,
  threshTarget: number,
  kpiActual: number,
  kpiTarget: number,
): { goal: Goal; pctGk: GoalKPI } {
  const strategyId = "s1";
  const measureId = "m1";
  const kpiId = "k1";
  const threshGk: GoalKPI = {
    id: threshGkId,
    label: "門檻 KPI",
    unit: "%",
    target: threshTarget,
    aggregation: "AVERAGE",
    type: "value",
    isHeadline: false,
    linkedKpis: [{ strategyId, measureId, kpiId }],
    thresholdGoalKpiIds: [],
  };
  const pctGk: GoalKPI = {
    id: "gk_pct",
    label: "整體達標%",
    unit: "%",
    target: 60,
    aggregation: "SUM",
    type: "pct_activity",
    isHeadline: false,
    linkedKpis: [],
    thresholdGoalKpiIds: [threshGkId],
  };
  const goal: Goal = {
    id: "g1",
    label: "G1",
    title: "目標",
    fullText: "",
    completionRate: 0,
    goalKpis: [threshGk, pctGk],
    strategies: [
      {
        id: strategyId,
        title: "S",
        rawText: "",
        measures: [
          {
            id: measureId,
            rawText: "活動A",
            kpis: [
              {
                id: kpiId,
                label: "KPI A",
                unit: "%",
                target: kpiTarget,
                actual: kpiActual,
                achievementRate:
                  kpiTarget > 0 ? (kpiActual / kpiTarget) * 100 : null,
              },
            ],
          },
        ],
        actionPlans: [],
        owners: [],
        notes: "",
        completionRate: 0,
        manualRate: null,
      },
    ],
  };
  return { goal, pctGk };
}

describe("computePctActivityRate", () => {
  test("無 thresholdGoalKpiIds → 回傳 null", () => {
    const pctGk: GoalKPI = {
      id: "gk_pct",
      label: "達標%",
      unit: "%",
      target: 60,
      aggregation: "SUM",
      type: "pct_activity",
      isHeadline: false,
      linkedKpis: [],
      thresholdGoalKpiIds: [],
    };
    const goal: Goal = {
      id: "g1",
      label: "G1",
      title: "G",
      fullText: "",
      completionRate: 0,
      strategies: [],
    };
    expect(computePctActivityRate(pctGk, goal)).toBeNull();
  });

  test("1 個活動達標（actual 100 >= threshold 60）→ 100%/60 ≈ 167", () => {
    const { goal, pctGk } = makeGoalWithKpis("thresh1", 60, 100, 100);
    // KPI achievementRate = 100%, threshold=60 → met=true
    // actualPct = 100/1 = 100%, target=60 → rate = round(100/60*100) = 167
    const rate = computePctActivityRate(pctGk, goal);
    expect(rate).toBe(167);
  });

  test("1 個活動未達標（actual 0 / target 100）→ 0/60 = 0", () => {
    const { goal, pctGk } = makeGoalWithKpis("thresh1", 60, 0, 100);
    // achievementRate = 0%, threshold=60 → not met
    // actualPct = 0%
    const rate = computePctActivityRate(pctGk, goal);
    expect(rate).toBe(0);
  });

  test("target=0 → 回傳 null（避免除以零）", () => {
    const { goal, pctGk } = makeGoalWithKpis("thresh1", 60, 100, 100);
    const modifiedPctGk = { ...pctGk, target: 0 };
    expect(computePctActivityRate(modifiedPctGk, goal)).toBeNull();
  });

  test("門檻 GoalKPI target 為 null → 忽略，無活動 → 回傳 null", () => {
    const threshGk: GoalKPI = {
      id: "thresh1",
      label: "門檻",
      unit: "%",
      target: null,
      aggregation: "AVERAGE",
      type: "value",
      isHeadline: false,
      linkedKpis: [{ strategyId: "s1", measureId: "m1", kpiId: "k1" }],
      thresholdGoalKpiIds: [],
    };
    const pctGk: GoalKPI = {
      id: "gk_pct",
      label: "達標%",
      unit: "%",
      target: 60,
      aggregation: "SUM",
      type: "pct_activity",
      isHeadline: false,
      linkedKpis: [],
      thresholdGoalKpiIds: ["thresh1"],
    };
    const goal: Goal = {
      id: "g1",
      label: "G1",
      title: "G",
      fullText: "",
      completionRate: 0,
      goalKpis: [threshGk, pctGk],
      strategies: [],
    };
    // threshGk.target=null → skip → no activities → null
    expect(computePctActivityRate(pctGk, goal)).toBeNull();
  });
});
