import { describe, test, expect } from "vitest";
import {
  getPlanItemWarning,
  countPlanWarnings,
  countStrategyWarnings,
  isLateCompletion,
  isPlannedEndDateOutsideQuarter,
} from "./planWarnings";
import type { PlanItem, Strategy } from "../schemas/ogsm";

// ─── 動態日期計算工具（相對於今天，使測試不依賴固定日期）────────────────────────

/**
 * 以本地時區計算距今 n 天的日期（YYYY-MM-DD）。
 * 注意：必須使用本地日期格式化，toISOString() 輸出 UTC 時間，
 * 在 UTC+ 時區中會導致「今天」變成「昨天」。
 */
function daysFromToday(n: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 方便的別名
const PAST = daysFromToday(-90); // 過去（一定逾期）
const TODAY = daysFromToday(0); // 今天（在 warnDays=7 內）
const WARN7 = daysFromToday(7); // warnDays=7 邊界（最後一天 warning）
const FUTURE = daysFromToday(30); // 未來（超出 warnDays，無警示）

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
    const item = makePlanItem({ plannedEndDate: PAST });
    expect(getPlanItemWarning(item, 7)).toBe("overdue");
  });

  test("截止日在 warnDays 內（今天）→ warning", () => {
    const item = makePlanItem({ plannedEndDate: TODAY });
    expect(getPlanItemWarning(item, 7)).toBe("warning");
  });

  test("截止日在 warnDays 外（30 天後）→ null", () => {
    const item = makePlanItem({ plannedEndDate: FUTURE });
    expect(getPlanItemWarning(item, 7)).toBeNull();
  });

  test("截止日恰好在 warnDays 當天 → warning", () => {
    const item = makePlanItem({ plannedEndDate: WARN7 }); // TODAY + 7 days
    expect(getPlanItemWarning(item, 7)).toBe("warning");
  });

  test("已填實際完成日且準時（≤ 預計完成日）→ null，即使今天已逾期", () => {
    const item = makePlanItem({
      plannedEndDate: PAST,
      actualEndDate: PAST, // 準時填入，等於預計完成日
    });
    expect(getPlanItemWarning(item, 7)).toBeNull();
  });

  test("已填實際完成日且早於預計完成日 → null", () => {
    const item = makePlanItem({
      plannedEndDate: "2026-01-10",
      actualEndDate: "2026-01-05",
    });
    expect(getPlanItemWarning(item, 7)).toBeNull();
  });

  test("已填實際完成日但晚於預計完成日（延遲）→ 仍回傳 overdue（由 isLateCompletion 另行標示）", () => {
    // actualEndDate > plannedEndDate 且未勾 completed → 逾期警示保留
    const item = makePlanItem({
      plannedEndDate: "2026-01-10",
      actualEndDate: "2026-01-20",
    });
    expect(getPlanItemWarning(item, 7)).toBe("overdue");
  });
});

// ─── countPlanWarnings ────────────────────────────────────────────────────────

describe("countPlanWarnings", () => {
  test("全部完成的項目 → 0 overdue, 0 warning", () => {
    const items = [
      makePlanItem({ completed: true, plannedEndDate: PAST }),
      makePlanItem({ completed: true, plannedEndDate: PAST }),
    ];
    expect(countPlanWarnings(items, 7)).toEqual({ overdue: 0, warning: 0 });
  });

  test("混合狀態正確計數", () => {
    const items = [
      makePlanItem({ id: "a", plannedEndDate: PAST }), // overdue
      makePlanItem({ id: "b", plannedEndDate: TODAY }), // warning
      makePlanItem({ id: "c", plannedEndDate: FUTURE }), // ok
      makePlanItem({ id: "d", completed: true, plannedEndDate: PAST }), // done
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
          items: [makePlanItem({ id: "i1", plannedEndDate: PAST })],
        },
        {
          id: "ap2",
          quarter: "Q2",
          title: "",
          items: [
            makePlanItem({ id: "i2", plannedEndDate: PAST }),
            makePlanItem({ id: "i3", plannedEndDate: FUTURE }),
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

describe("isPlannedEndDateOutsideQuarter", () => {
  test("預計完成日在所屬季度內 → false", () => {
    const item = {
      ...makePlanItem({ plannedEndDate: "2026-03-20" }),
      quarter: "Q1",
    } as PlanItem & { quarter?: string };
    expect(isPlannedEndDateOutsideQuarter(item)).toBe(false);
  });

  test("預計完成日超出所屬季度 → true", () => {
    const item = {
      ...makePlanItem({ plannedEndDate: "2026-04-10" }),
      quarter: "Q1",
    } as PlanItem & { quarter?: string };
    expect(isPlannedEndDateOutsideQuarter(item)).toBe(true);
  });

  test("缺少季度或日期時不報錯 → false", () => {
    expect(
      isPlannedEndDateOutsideQuarter({
        ...makePlanItem(),
        quarter: "Q1",
      } as PlanItem & {
        quarter?: string;
      }),
    ).toBe(false);
    expect(
      isPlannedEndDateOutsideQuarter(
        makePlanItem({ plannedEndDate: "2026-04-10" }) as PlanItem & {
          quarter?: string;
        },
      ),
    ).toBe(false);
  });

  test("提供 period 時，同年且 quarter/halfYear 相符 → false", () => {
    const item = {
      ...makePlanItem({ plannedEndDate: "2026-10-10" }),
      periodId: "p2",
      quarter: "Q4",
    } as PlanItem & { quarter?: string; periodId?: string };
    expect(
      isPlannedEndDateOutsideQuarter(item, { year: 2026, halfYear: "H2" }),
    ).toBe(false);
  });

  test("提供 period 時，跨到下一年度但歸屬正確 → false", () => {
    const item = {
      ...makePlanItem({ plannedEndDate: "2027-01-15" }),
      periodId: "p3",
      quarter: "Q1",
    } as PlanItem & { quarter?: string; periodId?: string };
    expect(
      isPlannedEndDateOutsideQuarter(item, { year: 2027, halfYear: "H1" }),
    ).toBe(false);
  });

  test("提供 period 時，年份不符 → true", () => {
    const item = {
      ...makePlanItem({ plannedEndDate: "2027-01-15" }),
      periodId: "p2",
      quarter: "Q1",
    } as PlanItem & { quarter?: string; periodId?: string };
    expect(
      isPlannedEndDateOutsideQuarter(item, { year: 2026, halfYear: "H2" }),
    ).toBe(true);
  });

  test("提供 period 時，quarter 與 halfYear 不相容 → true", () => {
    const item = {
      ...makePlanItem({ plannedEndDate: "2026-10-10" }),
      periodId: "p1",
      quarter: "Q4",
    } as PlanItem & { quarter?: string; periodId?: string };
    expect(
      isPlannedEndDateOutsideQuarter(item, { year: 2026, halfYear: "H1" }),
    ).toBe(true);
  });
});

// ─── isLateCompletion ─────────────────────────────────────────────────────────

describe("isLateCompletion", () => {
  test("未完成的項目回傳 false", () => {
    const item = makePlanItem({
      completed: false,
      plannedEndDate: "2026-01-10",
      actualEndDate: "2026-01-20",
    });
    expect(isLateCompletion(item)).toBe(false);
  });

  test("已完成但無實際完成日回傳 false", () => {
    const item = makePlanItem({
      completed: true,
      plannedEndDate: "2026-01-10",
    });
    expect(isLateCompletion(item)).toBe(false);
  });

  test("已完成但無預計完成日回傳 false", () => {
    const item = makePlanItem({
      completed: true,
      actualEndDate: "2026-01-20",
    });
    expect(isLateCompletion(item)).toBe(false);
  });

  test("實際完成日 > 預計完成日 → true（延遲完成）", () => {
    const item = makePlanItem({
      completed: true,
      plannedEndDate: "2026-01-10",
      actualEndDate: "2026-01-20",
    });
    expect(isLateCompletion(item)).toBe(true);
  });

  test("實際完成日 = 預計完成日 → false（準時完成）", () => {
    const item = makePlanItem({
      completed: true,
      plannedEndDate: "2026-01-10",
      actualEndDate: "2026-01-10",
    });
    expect(isLateCompletion(item)).toBe(false);
  });

  test("實際完成日 < 預計完成日 → false（提早完成）", () => {
    const item = makePlanItem({
      completed: true,
      plannedEndDate: "2026-01-10",
      actualEndDate: "2026-01-05",
    });
    expect(isLateCompletion(item)).toBe(false);
  });
});
