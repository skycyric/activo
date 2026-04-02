/**
 * GoalKPI 計算邏輯（共用純函式）
 *
 * 供 StrategyList（完整計算）和 OverviewPage（只取 rate）共用，
 * 避免 value / progress 計算邏輯在兩個元件中重複實作。
 */
import type { Goal, GoalKPI, GoalKpiLink } from "../schemas/ogsm";

// ─── 回傳型別 ─────────────────────────────────────────────────────────────────

export interface GoalKpiActivity {
  measureId: string;
  measureRawText: string;
  chosenSrcId: string | null;
  chosenSrcLabel: string | null;
  chosenTarget: number | null;
  displayRate: number | null;
  met: boolean;
  isConflict: boolean;
  conflictSourceNames: string | null;
  allSources: {
    threshGkId: string;
    threshGkLabel: string;
    threshTarget: number;
    kpiIds: string[];
  }[];
}

export interface GoalKpiResult {
  actual: number | null;
  target: number | null;
  rate: number | null;
  isRateMode: boolean;
  metCount: number | null;
  totalCount: number;
  activities: GoalKpiActivity[];
}

// ─── 主要計算函式 ─────────────────────────────────────────────────────────────

/**
 * 計算單一 GoalKPI 的完整資訊（actual / target / rate / activities）。
 *
 * @param gk   - 要計算的 GoalKPI 設定
 * @param goal - 所屬 Goal（提供 strategies 與 goalKpis 參照）
 */
export function computeGoalKpiResult(gk: GoalKPI, goal: Goal): GoalKpiResult {
  const gkType = gk.type ?? "value";
  const goalKpis = goal.goalKpis ?? [];
  const emptyActivities: GoalKpiActivity[] = [];

  // ── 整體達標狀況（pct_activity）─────────────────────────────────────────────
  if (gkType === "pct_activity") {
    const overrides = gk.activitySourceOverrides ?? {};
    const measureMap = new Map<
      string,
      {
        measureId: string;
        measureRawText: string;
        sources: {
          threshGkId: string;
          threshGkLabel: string;
          threshTarget: number;
          kpiIds: string[];
        }[];
      }
    >();
    for (const threshId of gk.thresholdGoalKpiIds ?? []) {
      const threshGk = goalKpis.find((g) => g.id === threshId);
      if (
        !threshGk ||
        threshGk.target === null ||
        threshGk.target === undefined
      )
        continue;
      for (const link of threshGk.linkedKpis) {
        if (!measureMap.has(link.measureId)) {
          const s = (goal.strategies ?? []).find(
            (s) => s.id === link.strategyId,
          );
          const m = s?.measures.find((m) => m.id === link.measureId);
          measureMap.set(link.measureId, {
            measureId: link.measureId,
            measureRawText: m?.rawText ?? "（未知活動）",
            sources: [],
          });
        }
        const entry = measureMap.get(link.measureId)!;
        const existing = entry.sources.find(
          (src) => src.threshGkId === threshId,
        );
        if (existing) {
          existing.kpiIds.push(link.kpiId);
        } else {
          entry.sources.push({
            threshGkId: threshId,
            threshGkLabel: threshGk.label,
            threshTarget: threshGk.target,
            kpiIds: [link.kpiId],
          });
        }
      }
    }

    const activities = Array.from(measureMap.values()).map((entry) => {
      const chosenSrcId =
        overrides[entry.measureId] &&
        entry.sources.some((s) => s.threshGkId === overrides[entry.measureId])
          ? overrides[entry.measureId]
          : entry.sources[0]?.threshGkId;
      const chosen = entry.sources.find((s) => s.threshGkId === chosenSrcId);
      const isConflict = entry.sources.length > 1;

      let met = false;
      let displayRate: number | null = null;
      if (chosen) {
        const rates: number[] = [];
        for (const threshId of gk.thresholdGoalKpiIds ?? []) {
          const threshGk = goalKpis.find((g) => g.id === threshId);
          if (!threshGk) continue;
          for (const link of threshGk.linkedKpis) {
            if (link.measureId !== entry.measureId) continue;
            if (!chosen.kpiIds.includes(link.kpiId)) continue;
            const s = (goal.strategies ?? []).find(
              (s) => s.id === link.strategyId,
            );
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
          displayRate = parseFloat(
            (rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1),
          );
          met = displayRate >= chosen.threshTarget;
        }
      }

      const conflictSourceNames = isConflict
        ? entry.sources.map((s) => s.threshGkLabel).join(" vs ")
        : null;

      return {
        measureId: entry.measureId,
        measureRawText: entry.measureRawText,
        chosenSrcId: chosenSrcId ?? null,
        chosenSrcLabel: chosen?.threshGkLabel ?? null,
        chosenTarget: chosen?.threshTarget ?? null,
        displayRate,
        met,
        isConflict,
        conflictSourceNames,
        allSources: entry.sources,
      };
    });

    const totalCount = activities.length;
    const metCount = activities.filter((a) => a.met).length;
    const actualPct =
      totalCount > 0 ? Math.round((metCount / totalCount) * 1000) / 10 : 0;
    const target = gk.target ?? 60;
    const rate = target > 0 ? Math.round((actualPct / target) * 100) : null;
    return {
      actual: totalCount > 0 ? actualPct : null,
      target,
      rate: totalCount > 0 ? rate : null,
      isRateMode: true,
      metCount,
      totalCount,
      activities,
    };
  }

  // ── 共用：收集 linked KPI 量化值 ─────────────────────────────────────────────
  const values = gk.linkedKpis.flatMap((link: GoalKpiLink) => {
    const s = (goal.strategies ?? []).find((s) => s.id === link.strategyId);
    if (!s) return [];
    const m = s.measures.find((m) => m.id === link.measureId);
    if (!m) return [];
    const k = m.kpis.find((k) => k.id === link.kpiId);
    if (!k) return [];
    return [
      {
        actual: k.actual ?? 0,
        target: k.target ?? 0,
        achievementRate: k.achievementRate,
      },
    ];
  });

  const gTarget = gk.target ?? null;

  if (values.length === 0) {
    return {
      actual: null,
      target: gTarget,
      rate: null,
      isRateMode: gkType !== "value" || gk.aggregation === "AVERAGE",
      metCount: null,
      totalCount: 0,
      activities: emptyActivities,
    };
  }

  // ── 進度完成率（progress）────────────────────────────────────────────────────
  if (gkType === "progress") {
    const sum = values.reduce((a, v) => a + v.actual, 0);
    const avgActual = Math.round((sum / values.length) * 10) / 10;
    const target = gTarget !== null ? gTarget : 100;
    const rate = target > 0 ? Math.round((avgActual / target) * 100) : null;
    return {
      actual: avgActual,
      target,
      rate,
      isRateMode: true,
      metCount: null,
      totalCount: values.length,
      activities: emptyActivities,
    };
  }

  // ── 量化值：AVERAGE / SUM ─────────────────────────────────────────────────────
  if (gk.aggregation === "AVERAGE") {
    const rates = values
      .map((v) => v.achievementRate)
      .filter((r): r is number => r !== null && r !== undefined);
    if (rates.length === 0) {
      const avgActual =
        Math.round(
          (values.reduce((a, v) => a + v.actual, 0) / values.length) * 10,
        ) / 10;
      const avgTarget =
        Math.round(
          (values.reduce((a, v) => a + v.target, 0) / values.length) * 10,
        ) / 10;
      const fallbackTarget = gTarget !== null ? gTarget : avgTarget;
      const rate =
        fallbackTarget > 0
          ? Math.round((avgActual / fallbackTarget) * 100)
          : null;
      return {
        actual: avgActual,
        target: fallbackTarget,
        rate,
        isRateMode: false,
        metCount: null,
        totalCount: values.length,
        activities: emptyActivities,
      };
    }
    const avgRate =
      Math.round((rates.reduce((a, r) => a + r, 0) / rates.length) * 10) / 10;
    const target = gTarget !== null ? gTarget : 100;
    const rate = Math.round((avgRate / target) * 100);
    return {
      actual: avgRate,
      target,
      rate,
      isRateMode: true,
      metCount: null,
      totalCount: values.length,
      activities: emptyActivities,
    };
  } else {
    // SUM
    const sumActual = values.reduce((a, v) => a + v.actual, 0);
    const sumTarget = values.reduce((a, v) => a + v.target, 0);
    const target = gTarget !== null ? gTarget : sumTarget;
    const rate = target > 0 ? Math.round((sumActual / target) * 100) : null;
    return {
      actual: sumActual,
      target,
      rate,
      isRateMode: false,
      metCount: null,
      totalCount: values.length,
      activities: emptyActivities,
    };
  }
}
