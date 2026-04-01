import type { PlanItem, Strategy, GoalKPI, Goal } from "../schemas/ogsm";

export interface PlanWarnCounts {
  overdue: number;
  warning: number;
}

/** 計算單一 PlanItem 的警示狀態 */
export function getPlanItemWarning(
  item: PlanItem,
  warnDays: number,
): "overdue" | "warning" | null {
  if (item.completed || !item.plannedEndDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(item.plannedEndDate);
  end.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((end.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= warnDays) return "warning";
  return null;
}

/** 計算一組 PlanItem 的逾期 / 即將到期數量 */
export function countPlanWarnings(
  items: PlanItem[],
  warnDays: number,
): PlanWarnCounts {
  let overdue = 0;
  let warning = 0;
  for (const item of items) {
    const w = getPlanItemWarning(item, warnDays);
    if (w === "overdue") overdue++;
    else if (w === "warning") warning++;
  }
  return { overdue, warning };
}

/** 計算一個 Strategy 下所有 PlanItem 的警示數量 */
export function countStrategyWarnings(
  s: Strategy,
  warnDays: number,
): PlanWarnCounts {
  const items = s.actionPlans.flatMap((p) => p.items);
  return countPlanWarnings(items, warnDays);
}

/**
 * pct_activity 達標率計算（與 StrategyList.computeGoalKpi 一致，含 activitySourceOverrides 處理）。
 * 返回 0‒200+ 的整數百分比，或 null（無活動資料）。
 */
export function computePctActivityRate(gk: GoalKPI, goal: Goal): number | null {
  const goalKpis = goal.goalKpis ?? [];
  const strategies = goal.strategies;
  const overrides = gk.activitySourceOverrides ?? {};

  // measureId → { sources: { threshGkId, threshTarget, kpiIds[] }[] }
  const measureMap = new Map<
    string,
    {
      sources: { threshGkId: string; threshTarget: number; kpiIds: string[] }[];
    }
  >();

  for (const threshId of gk.thresholdGoalKpiIds ?? []) {
    const threshGk = goalKpis.find((g) => g.id === threshId);
    if (!threshGk || threshGk.target === null || threshGk.target === undefined)
      continue;
    for (const link of threshGk.linkedKpis) {
      if (!measureMap.has(link.measureId)) {
        measureMap.set(link.measureId, { sources: [] });
      }
      const entry = measureMap.get(link.measureId)!;
      const existing = entry.sources.find((src) => src.threshGkId === threshId);
      if (existing) {
        existing.kpiIds.push(link.kpiId);
      } else {
        entry.sources.push({
          threshGkId: threshId,
          threshTarget: threshGk.target,
          kpiIds: [link.kpiId],
        });
      }
    }
  }

  const totalCount = measureMap.size;
  if (totalCount === 0) return null;

  let metCount = 0;
  for (const [measureId, entry] of measureMap) {
    // 決定用哪個來源：優先用 override，否則用第一個
    const chosenSrcId =
      overrides[measureId] &&
      entry.sources.some((s) => s.threshGkId === overrides[measureId])
        ? overrides[measureId]
        : entry.sources[0]?.threshGkId;
    const chosen = entry.sources.find((s) => s.threshGkId === chosenSrcId);
    if (!chosen) continue;

    const rates: number[] = [];
    for (const threshId of gk.thresholdGoalKpiIds ?? []) {
      const threshGk = goalKpis.find((g) => g.id === threshId);
      if (!threshGk) continue;
      for (const link of threshGk.linkedKpis) {
        if (link.measureId !== measureId) continue;
        if (!chosen.kpiIds.includes(link.kpiId)) continue;
        const s = strategies.find((s) => s.id === link.strategyId);
        const m = s?.measures.find((m) => m.id === link.measureId);
        const k = m?.kpis.find((k) => k.id === link.kpiId);
        if (!k) continue;
        const r =
          k.achievementRate ??
          (k.target !== null && k.target !== undefined && k.target > 0
            ? ((k.actual ?? 0) / k.target) * 100
            : null);
        if (r !== null) rates.push(r);
      }
    }
    if (rates.length > 0) {
      const displayRate = rates.reduce((a, b) => a + b, 0) / rates.length;
      if (displayRate >= chosen.threshTarget) metCount++;
    }
  }

  const actualPct = (metCount / totalCount) * 100;
  const target = gk.target ?? 60;
  if (target <= 0) return null;
  return Math.round((actualPct / target) * 100);
}
