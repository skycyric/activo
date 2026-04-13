/**
 * KPI 達成率計算工具（純函式，供 ActivityDetailPanel 和 goalKpi.ts 共用）
 *
 * 設計原則：
 * - `achievementRate` 是計算值，不應存入資料（snapshot 除外）
 * - 所有計算路徑都需處理 null/undefined 輸入，安全回傳 null
 */
import type { KPI } from "../schemas/ogsm";

/**
 * 解析成長型 KPI 的基底值。
 * - baseline.type === "fixed"  → 直接用 baseline.value
 * - baseline.type === "kpiRef" → 從同活動兄弟 KPI 的 actual 取值
 * - 無 baseline 定義           → fallback 到舊有 baseValue 欄位
 */
export function resolveBaseline(kpi: KPI, siblingKpis: KPI[]): number | null {
  if (kpi.baseline) {
    if (kpi.baseline.type === "fixed") {
      return kpi.baseline.value;
    }
    if (kpi.baseline.type === "kpiRef") {
      const baseline = kpi.baseline;
      const ref = siblingKpis.find((k) => k.id === baseline.kpiId);
      return ref?.actual ?? null;
    }
  }
  // fallback：舊 baseValue 欄位
  return kpi.baseValue ?? null;
}

/**
 * 計算單一 KPI 的達成率（0–200+，百分比）。
 *
 * formulaType 優先：
 *   - "direct_rate"：actual / target × 100
 *   - "growth"：((actual / baseline − 1) × 100) / targetGrowthRate × 100
 *
 * 無 formulaType 時 fallback 到舊 kpiType 行為（向下相容）。
 *
 * @param kpi         - 要計算的 KPI
 * @param siblingKpis - 同一活動的其他 KPI（用於 kpiRef baseline 解析）
 * @returns           - 達成率（%），無法計算時回傳 null
 */
export function computeKpiAchievement(
  kpi: KPI,
  siblingKpis: KPI[] = [],
): number | null {
  const fType = kpi.formulaType;

  // ── 新路徑：formulaType 明確指定 ─────────────────────────────────────────
  if (fType === "direct_rate") {
    if (kpi.actual === null || kpi.actual === undefined) return null;
    if (!kpi.target) return null;
    return Math.round((kpi.actual / kpi.target) * 10000) / 100;
  }

  if (fType === "growth") {
    const actual = kpi.actual ?? null;
    if (actual === null) return null;
    const baseline = resolveBaseline(kpi, siblingKpis);
    if (baseline === null || baseline === 0) return null;
    const growthRate = ((actual - baseline) / baseline) * 100;
    const targetGrowth = kpi.targetGrowthRate ?? null;
    if (targetGrowth === null || targetGrowth === 0) {
      // 有成長率但無目標承諾：直接回傳成長率作達成率
      return Math.round(growthRate * 100) / 100;
    }
    return Math.round((growthRate / targetGrowth) * 10000) / 100;
  }

  // ── 舊路徑：kpiType fallback（向下相容） ────────────────────────────────
  const kType = kpi.kpiType ?? "value";

  if (kType === "progress") {
    // actual 就是完成率（0–100），直接回傳
    return kpi.actual ?? null;
  }

  if (kType === "growth") {
    const actual = kpi.currentValue ?? kpi.actual ?? null;
    if (actual === null) return null;
    const base = resolveBaseline(kpi, siblingKpis);
    if (base === null || base === 0) return null;
    const growthRate = ((actual - base) / base) * 100;
    const tgr = kpi.targetGrowthRate ?? null;
    if (tgr === null || tgr === 0) return Math.round(growthRate * 100) / 100;
    return Math.round((growthRate / tgr) * 10000) / 100;
  }

  if (kType === "target_rate") {
    if (kpi.actual === null || kpi.actual === undefined) return null;
    if (!kpi.target) return null;
    const rawRate = (kpi.actual / kpi.target) * 100;
    const targetRate = kpi.targetRate ?? null;
    if (targetRate === null || targetRate === 0)
      return Math.round(rawRate * 100) / 100;
    return Math.round((rawRate / targetRate) * 10000) / 100;
  }

  // value（預設）：actual / target × 100
  if (kpi.actual === null || kpi.actual === undefined) return null;
  if (!kpi.target) return null;
  return Math.round((kpi.actual / kpi.target) * 10000) / 100;
}

/**
 * 計算活動內所有 KPI 的達成率，並回傳更新後的 KPI 陣列（achievementRate 已計算）。
 * 用於在儲存前同步更新 snapshot。
 */
export function recomputeActivityKpis(kpis: KPI[]): KPI[] {
  return kpis.map((kpi) => ({
    ...kpi,
    achievementRate: computeKpiAchievement(kpi, kpis),
  }));
}

/**
 * 取得 KPI 的顯示名稱：優先 name，fallback label。
 */
export function getKpiDisplayName(kpi: KPI): string {
  return kpi.name?.trim() || kpi.label?.trim() || "KPI";
}
