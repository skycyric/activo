/**
 * KpiConfigModal — KPI 設定 Modal（Layer 2，期初設定用）
 *
 * 設定 KPI 的名稱、單位、公式類型、目標值/目標百分比、baseline。
 * 由 ActivityDetailPanel 的 KPI tab 觸發。
 */
import { useEffect, useState } from "react";
import type { KPI } from "../../schemas/ogsm";
import { getKpiDisplayName } from "../../utils/kpiCalc";
import { Tooltip } from "../ui/tooltip";

type FormulaType = "direct_rate" | "growth" | "target_pct" | "completion";

function getInitialFormulaType(kpi: KPI): FormulaType {
  if (kpi.formulaType) return kpi.formulaType;
  if (kpi.kpiType === "growth") return "growth";
  if (kpi.kpiType === "target_rate") return "target_pct";
  if (kpi.kpiType === "progress") return "completion";
  return "direct_rate";
}

interface Props {
  kpi: KPI;
  originalKpi: KPI;
  /** 同一活動的其他 KPI（用於 kpiRef baseline 選擇） */
  siblingKpis: KPI[];
  onChange: (updated: KPI) => void;
  onSave: (updated: KPI) => void;
  onClose: () => void;
}

export default function KpiConfigModal({
  kpi,
  originalKpi,
  siblingKpis,
  onChange,
  onSave,
  onClose,
}: Props) {
  const formulaType = getInitialFormulaType(kpi);
  const [baselineMode, setBaselineMode] = useState<"fixed" | "kpiRef">(
    kpi.baseline?.type ?? "fixed",
  );
  const baselineType = baselineMode;
  const baselineFixed =
    kpi.baseline?.type === "fixed"
      ? String(kpi.baseline.value)
      : formulaType === "direct_rate" &&
          kpi.target !== null &&
          kpi.target !== undefined
        ? String(kpi.target)
        : "";
  const baselineKpiRef =
    kpi.baseline?.type === "kpiRef" ? kpi.baseline.kpiId : "";
  const currentUnit = (kpi.unit ?? "").trim();

  useEffect(() => {
    setBaselineMode(kpi.baseline?.type ?? "fixed");
  }, [kpi.baseline?.type]);

  const patchDraft = (changes: Partial<KPI>) => {
    onChange({ ...kpi, ...changes });
  };

  const setFormulaType = (nextFormulaType: FormulaType) => {
    const nextKpiType: KPI["kpiType"] =
      nextFormulaType === "growth"
        ? "growth"
        : nextFormulaType === "target_pct"
          ? "target_rate"
          : nextFormulaType === "completion"
            ? "progress"
            : "value";

    if (nextFormulaType === "completion") {
      patchDraft({
        formulaType: nextFormulaType,
        kpiType: nextKpiType,
        target: null,
        targetGrowthRate: null,
        targetRate: null,
        baseline: null,
      });
      return;
    }

    if (nextFormulaType === "growth") {
      patchDraft({
        formulaType: nextFormulaType,
        kpiType: nextKpiType,
        target: null,
        targetRate: null,
        baseline:
          kpi.baseline?.type === "kpiRef"
            ? kpi.baseline
            : kpi.baseline?.type === "fixed"
              ? kpi.baseline
              : null,
      });
      return;
    }

    if (nextFormulaType === "target_pct") {
      patchDraft({
        formulaType: nextFormulaType,
        kpiType: nextKpiType,
        target: null,
        targetGrowthRate: null,
        baseline:
          kpi.baseline?.type === "kpiRef"
            ? kpi.baseline
            : kpi.baseline?.type === "fixed"
              ? kpi.baseline
              : null,
      });
      return;
    }

    patchDraft({
      formulaType: nextFormulaType,
      kpiType: nextKpiType,
      targetGrowthRate: null,
      targetRate: null,
      baseline:
        kpi.baseline?.type === "kpiRef"
          ? kpi.baseline
          : {
              type: "fixed",
              value:
                kpi.baseline?.type === "fixed"
                  ? kpi.baseline.value
                  : (kpi.target ?? 0),
            },
      target:
        kpi.baseline?.type === "fixed"
          ? kpi.baseline.value
          : (kpi.target ?? null),
    });
  };

  const setBaselineType = (nextBaselineType: "fixed" | "kpiRef") => {
    setBaselineMode(nextBaselineType);
    if (nextBaselineType === "fixed") {
      patchDraft({
        baseline: {
          type: "fixed",
          value:
            kpi.baseline?.type === "fixed"
              ? kpi.baseline.value
              : (kpi.target ?? 0),
        },
        target:
          formulaType === "direct_rate"
            ? kpi.baseline?.type === "fixed"
              ? kpi.baseline.value
              : (kpi.target ?? null)
            : kpi.target,
      });
      return;
    }

    patchDraft({
      baseline: { type: "kpiRef", kpiId: baselineKpiRef || "" },
      target: formulaType === "direct_rate" ? null : kpi.target,
    });
  };

  const normalizeForSave = (draftKpi: KPI): KPI => {
    const nextFormulaType = getInitialFormulaType(draftKpi);
    const nextKpiType: KPI["kpiType"] =
      nextFormulaType === "growth"
        ? "growth"
        : nextFormulaType === "target_pct"
          ? "target_rate"
          : nextFormulaType === "completion"
            ? "progress"
            : "value";

    if (nextFormulaType === "completion") {
      return {
        ...draftKpi,
        formulaType: nextFormulaType,
        kpiType: nextKpiType,
        target: null,
        targetGrowthRate: null,
        targetRate: null,
        baseline: null,
      };
    }

    if (nextFormulaType === "growth") {
      return {
        ...draftKpi,
        formulaType: nextFormulaType,
        kpiType: nextKpiType,
        target: null,
        targetRate: null,
        baseline:
          draftKpi.baseline?.type === "kpiRef"
            ? draftKpi.baseline.kpiId
              ? draftKpi.baseline
              : null
            : draftKpi.baseline?.type === "fixed"
              ? draftKpi.baseline
              : null,
      };
    }

    if (nextFormulaType === "target_pct") {
      return {
        ...draftKpi,
        formulaType: nextFormulaType,
        kpiType: nextKpiType,
        target: null,
        targetGrowthRate: null,
        baseline:
          draftKpi.baseline?.type === "kpiRef"
            ? draftKpi.baseline.kpiId
              ? draftKpi.baseline
              : null
            : draftKpi.baseline?.type === "fixed"
              ? draftKpi.baseline
              : null,
      };
    }

    return {
      ...draftKpi,
      formulaType: nextFormulaType,
      kpiType: nextKpiType,
      target:
        draftKpi.baseline?.type === "fixed"
          ? draftKpi.baseline.value
          : draftKpi.target,
      targetGrowthRate: null,
      targetRate: null,
      baseline:
        draftKpi.baseline?.type === "kpiRef"
          ? draftKpi.baseline.kpiId
            ? draftKpi.baseline
            : null
          : draftKpi.baseline?.type === "fixed"
            ? draftKpi.baseline
            : null,
    };
  };

  const handleSave = () => {
    onSave(normalizeForSave(kpi));
  };

  // 防止 click-outside 意外關閉，只允許 Esc 鍵
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="kpi-modal-overlay" role="dialog" aria-modal="true">
      <div className="kpi-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kpi-modal-header">
          <span className="kpi-modal-title">
            KPI 設定 — {getKpiDisplayName(kpi)}
          </span>
          <Tooltip content="關閉設定">
            <button className="kpi-modal-close" onClick={onClose}>
              ×
            </button>
          </Tooltip>
        </div>

        <div className="kpi-modal-body">
          {/* 名稱 */}
          <label className="kpi-modal-label">
            KPI 名稱
            <input
              className="kpi-modal-input"
              value={kpi.name ?? kpi.label ?? ""}
              onChange={(e) => {
                const nextName = e.target.value;
                patchDraft({
                  name: nextName.trim() || undefined,
                  label: nextName.trim() || originalKpi.label,
                });
              }}
              placeholder="例：業績達成率、新增客戶數"
            />
          </label>

          {/* 單位 */}
          <label className="kpi-modal-label">
            單位
            <input
              className="kpi-modal-input"
              value={kpi.unit ?? ""}
              onChange={(e) => patchDraft({ unit: e.target.value })}
              placeholder="例：%、件、人、萬元"
            />
          </label>

          {/* 公式類型 */}
          <div className="kpi-modal-label">
            達成率公式
            <div className="kpi-formula-radios">
              <label className="kpi-formula-radio">
                <input
                  type="radio"
                  value="direct_rate"
                  checked={formulaType === "direct_rate"}
                  onChange={() => setFormulaType("direct_rate")}
                />
                <span>
                  <strong>直接達成率</strong>
                  <span className="kpi-formula-desc">
                    &nbsp;= 實際值 / 基底值（目標值）× 100%
                  </span>
                </span>
              </label>
              <label className="kpi-formula-radio">
                <input
                  type="radio"
                  value="growth"
                  checked={formulaType === "growth"}
                  onChange={() => setFormulaType("growth")}
                />
                <span>
                  <strong>成長率</strong>
                  <span className="kpi-formula-desc">
                    &nbsp;= (實際值 / 基底 − 1) / 目標成長率 × 100%
                  </span>
                </span>
              </label>
              <label className="kpi-formula-radio">
                <input
                  type="radio"
                  value="target_pct"
                  checked={formulaType === "target_pct"}
                  onChange={() => setFormulaType("target_pct")}
                />
                <span>
                  <strong>百分比達成率</strong>
                  <span className="kpi-formula-desc">
                    &nbsp;= (實際值 / 基底值 × 100%) - 目標百分比
                  </span>
                </span>
              </label>
              <label className="kpi-formula-radio">
                <input
                  type="radio"
                  value="completion"
                  checked={formulaType === "completion"}
                  onChange={() => setFormulaType("completion")}
                />
                <span>
                  <strong>完成率</strong>
                  <span className="kpi-formula-desc">
                    &nbsp;= 直接採用實際值（0-100）
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* 成長率：目標成長率 */}
          {formulaType === "growth" && (
            <label className="kpi-modal-label">
              目標成長率（%）
              <input
                className="kpi-modal-input"
                type="number"
                value={
                  kpi.targetGrowthRate !== null &&
                  kpi.targetGrowthRate !== undefined
                    ? String(kpi.targetGrowthRate)
                    : ""
                }
                onChange={(e) =>
                  patchDraft({
                    targetGrowthRate:
                      e.target.value !== "" ? parseFloat(e.target.value) : null,
                  })
                }
                placeholder="例：20（代表 20%）"
              />
            </label>
          )}

          {/* 百分比達成率：目標百分比 */}
          {formulaType === "target_pct" && (
            <label className="kpi-modal-label">
              目標百分比（%）
              <input
                className="kpi-modal-input"
                type="number"
                value={
                  kpi.targetRate !== null && kpi.targetRate !== undefined
                    ? String(kpi.targetRate)
                    : ""
                }
                onChange={(e) =>
                  patchDraft({
                    targetRate:
                      e.target.value !== "" ? parseFloat(e.target.value) : null,
                  })
                }
                placeholder="例：80（代表目標百分比 80%）"
              />
            </label>
          )}

          {/* 基底值設定（direct_rate, growth, target_pct 皆可用） */}
          {["direct_rate", "growth", "target_pct"].includes(formulaType) && (
            <div className="kpi-modal-label">
              {formulaType === "growth"
                ? "基底值來源"
                : formulaType === "direct_rate"
                  ? "目標值來源"
                  : "基底值來源"}
              <div className="kpi-formula-radios">
                <label className="kpi-formula-radio">
                  <input
                    type="radio"
                    value="fixed"
                    checked={baselineType === "fixed"}
                    onChange={() => setBaselineType("fixed")}
                  />
                  <span>
                    {formulaType === "direct_rate" ? "固定目標值" : "固定值"}
                  </span>
                </label>
                {siblingKpis.length > 0 && (
                  <label className="kpi-formula-radio">
                    <input
                      type="radio"
                      value="kpiRef"
                      checked={baselineType === "kpiRef"}
                      onChange={() => setBaselineType("kpiRef")}
                    />
                    <span>引用此活動的另一個 KPI</span>
                  </label>
                )}
              </div>
              {baselineType === "fixed" && (
                <input
                  className="kpi-modal-input"
                  type="number"
                  value={baselineFixed}
                  onChange={(e) => {
                    const nextValue =
                      e.target.value !== "" ? parseFloat(e.target.value) : null;
                    patchDraft({
                      baseline:
                        nextValue === null
                          ? null
                          : { type: "fixed", value: nextValue },
                      target:
                        formulaType === "direct_rate" ? nextValue : kpi.target,
                    });
                  }}
                  placeholder={
                    formulaType === "growth"
                      ? "基期值，例：1000"
                      : formulaType === "target_pct"
                        ? "基底值，例：100"
                        : "目標值，例：100"
                  }
                  style={{ marginTop: 6 }}
                />
              )}
              {baselineType === "kpiRef" && (
                <>
                  <select
                    className="kpi-modal-input"
                    value={baselineKpiRef}
                    onChange={(e) => {
                      const nextKpiId = e.target.value;
                      patchDraft({
                        baseline: nextKpiId
                          ? { type: "kpiRef", kpiId: nextKpiId }
                          : null,
                        target:
                          formulaType === "direct_rate" ? null : kpi.target,
                      });
                    }}
                    style={{ marginTop: 6 }}
                  >
                    <option value="">選擇 KPI…</option>
                    {siblingKpis.map((k) => {
                      const hasActual =
                        k.actual !== null && k.actual !== undefined;
                      const refUnit = (k.unit ?? "").trim();
                      const sameUnit =
                        !currentUnit || !refUnit || currentUnit === refUnit;
                      const selectable = hasActual && sameUnit;
                      return (
                        <option key={k.id} value={k.id} disabled={!selectable}>
                          {getKpiDisplayName(k)}
                          {hasActual
                            ? sameUnit
                              ? ` (${k.actual})`
                              : ` (${k.actual}，單位不一致)`
                            : " (尚未設定值)"}
                        </option>
                      );
                    })}
                  </select>
                  {siblingKpis.every(
                    (k) =>
                      k.actual === null ||
                      k.actual === undefined ||
                      ((k.unit ?? "").trim() &&
                        currentUnit &&
                        (k.unit ?? "").trim() !== currentUnit),
                  ) && (
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#dc2626",
                        marginTop: 6,
                        padding: "6px 8px",
                        backgroundColor: "#fee2e2",
                        borderRadius: "4px",
                      }}
                    >
                      ⚠ 此活動沒有可引用的
                      KPI（可能尚未設定實際值或單位不一致）。
                      請先補齊實際值，並確認 KPI 單位一致。
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="kpi-modal-footer">
          <div
            style={{ fontSize: "12px", color: "#64748b", marginRight: "auto" }}
          >
            按 Esc 可取消
          </div>
          <button className="kpi-modal-btn-cancel" onClick={onClose}>
            取消
          </button>
          <button className="kpi-modal-btn-save" onClick={handleSave}>
            儲存
          </button>
        </div>
      </div>
    </div>
  );
}
