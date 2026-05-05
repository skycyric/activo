import { describe, expect, test } from "vitest";
import { computeKpiAchievement } from "./kpiCalc";
import type { KPI } from "../schemas/ogsm";

function makeKpi(partial: Partial<KPI>): KPI {
  return {
    id: "KPI-1",
    label: "KPI-1",
    unit: "%",
    target: null,
    actual: null,
    achievementRate: null,
    ...partial,
  };
}

describe("kpiCalc formulaType v2", () => {
  test("formulaType=target_pct: returns actualPercent from actual / baseline", () => {
    const kpi = makeKpi({
      formulaType: "target_pct",
      actual: 60,
      baseline: { type: "fixed", value: 80 },
      targetRate: 50,
    });
    // actualPercent=60/80*100=75%
    expect(computeKpiAchievement(kpi, [])).toBe(75);
  });

  test("formulaType=completion: returns actual directly", () => {
    const kpi = makeKpi({
      formulaType: "completion",
      actual: 85,
      target: 999,
    });
    expect(computeKpiAchievement(kpi, [])).toBe(85);
  });

  test("formulaType=growth with kpiRef baseline: resolves referenced KPI actual", () => {
    const ref = makeKpi({ id: "KPI-REF", actual: 200, unit: "件" });
    const kpi = makeKpi({
      id: "KPI-G",
      formulaType: "growth",
      actual: 260,
      targetGrowthRate: 20,
      baseline: { type: "kpiRef", kpiId: "KPI-REF" },
      unit: "件",
    });
    // growthRate=(260-200)/200*100=30; 30/20*100=150
    expect(computeKpiAchievement(kpi, [ref])).toBe(150);
  });

  test("formulaType=direct_rate with kpiRef baseline: uses ref actual as denominator", () => {
    const ref = makeKpi({ id: "KPI-REF", actual: 50 });
    const kpi = makeKpi({
      id: "KPI-DR",
      formulaType: "direct_rate",
      actual: 60,
      baseline: { type: "kpiRef", kpiId: "KPI-REF" },
    });
    // achievement = 60/50*100 = 120%
    expect(computeKpiAchievement(kpi, [ref])).toBe(120);
  });

  test("formulaType=target_pct with kpiRef baseline: uses ref actual as baseline", () => {
    const ref = makeKpi({ id: "KPI-REF", actual: 80 });
    const kpi = makeKpi({
      id: "KPI-TP",
      formulaType: "target_pct",
      actual: 64,
      targetRate: 80,
      baseline: { type: "kpiRef", kpiId: "KPI-REF" },
    });
    // actualPercent = (64/80)*100 = 80%
    expect(computeKpiAchievement(kpi, [ref])).toBe(80);
  });

  test("formulaType=target_pct with kpiRef baseline: unit mismatch should return null", () => {
    const ref = makeKpi({ id: "KPI-REF", actual: 80, unit: "%" });
    const kpi = makeKpi({
      id: "KPI-TP",
      formulaType: "target_pct",
      actual: 64,
      targetRate: 80,
      unit: "件",
      baseline: { type: "kpiRef", kpiId: "KPI-REF" },
    });
    expect(computeKpiAchievement(kpi, [ref])).toBeNull();
  });
});
