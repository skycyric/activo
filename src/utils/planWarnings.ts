import type { PlanItem, Strategy } from "../schemas/ogsm";

export interface PlanWarnCounts {
  overdue: number;
  warning: number;
}

/** 計算單一 PlanItem 的警示狀態（未完成才適用） */
export function getPlanItemWarning(
  item: PlanItem,
  warnDays: number,
): "overdue" | "warning" | null {
  if (item.completed || !item.plannedEndDate) return null;
  // 已填實際完成日且準時（≤ 預計完成日）→ 不顯示警示
  if (item.actualEndDate && item.actualEndDate <= item.plannedEndDate)
    return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(item.plannedEndDate);
  end.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((end.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return "overdue";
  if (diffDays <= warnDays) return "warning";
  return null;
}

/** 已完成但實際完成日晚於預計完成日 */
export function isLateCompletion(item: PlanItem): boolean {
  if (!item.completed || !item.plannedEndDate || !item.actualEndDate)
    return false;
  return item.actualEndDate > item.plannedEndDate;
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
