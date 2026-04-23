/**
 * KpiConfigModal — KPI 設定 Modal（Layer 2，期初設定用）
 *
 * 設定 KPI 的名稱、單位、公式類型、目標值、baseline。
 * 由 ActivityDetailPanel 的 KPI tab 觸發。
 */
import { useState, useEffect } from "react";
import type { KPI, KpiBaseline } from "../../schemas/ogsm";
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
  /** 同一活動的其他 KPI（用於 kpiRef baseline 選擇） */
  siblingKpis: KPI[];
  onSave: (updated: KPI) => void;
  onClose: () => void;
}

export default function KpiConfigModal({
  kpi,
  siblingKpis,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(kpi.name ?? kpi.label ?? "");
  const [unit, setUnit] = useState(kpi.unit ?? "");
  const [formulaType, setFormulaType] = useState<FormulaType>(
    getInitialFormulaType(kpi),
  );
  const [target, setTarget] = useState<string>(
    kpi.target !== null && kpi.target !== undefined ? String(kpi.target) : "",
  );
  const [targetGrowthRate, setTargetGrowthRate] = useState<string>(
    kpi.targetGrowthRate !== null && kpi.targetGrowthRate !== undefined
      ? String(kpi.targetGrowthRate)
      : "",
  );
  const [targetRate, setTargetRate] = useState<string>(
    kpi.targetRate !== null && kpi.targetRate !== undefined
      ? String(kpi.targetRate)
      : "",
  );
  const [baselineType, setBaselineType] = useState<"fixed" | "kpiRef">(
    kpi.baseline?.type ?? "fixed",
  );
  const [baselineFixed, setBaselineFixed] = useState<string>(
    kpi.baseline?.type === "fixed" ? String(kpi.baseline.value) : "",
  );
  const [baselineKpiRef, setBaselineKpiRef] = useState<string>(
    kpi.baseline?.type === "kpiRef" ? kpi.baseline.kpiId : "",
  );

  const handleSave = () => {
    const parsedTarget = target !== "" ? parseFloat(target) : null;
    const parsedTargetGrowthRate =
      targetGrowthRate !== "" ? parseFloat(targetGrowthRate) : null;
    const parsedTargetRate = targetRate !== "" ? parseFloat(targetRate) : null;

    let baseline: KpiBaseline | null = null;
    // direct_rate, growth, target_pct 都支持 baseline
    if (["direct_rate", "growth", "target_pct"].includes(formulaType)) {
      if (baselineType === "fixed" && baselineFixed !== "") {
        baseline = { type: "fixed", value: parseFloat(baselineFixed) };
      } else if (baselineType === "kpiRef" && baselineKpiRef) {
        baseline = { type: "kpiRef", kpiId: baselineKpiRef };
      }
    }

    const nextKpiType: KPI["kpiType"] =
      formulaType === "growth"
        ? "growth"
        : formulaType === "target_pct"
          ? "target_rate"
          : formulaType === "completion"
            ? "progress"
            : "value";

    onSave({
      ...kpi,
      name: name.trim() || undefined,
      label: name.trim() || kpi.label,
      unit: unit.trim(),
      formulaType,
      kpiType: nextKpiType,
      target:
        formulaType === "completion"
          ? null
          : (parsedTarget ?? kpi.target ?? null),
      targetGrowthRate:
        formulaType === "growth" ? parsedTargetGrowthRate : null,
      targetRate: formulaType === "target_pct" ? parsedTargetRate : null,
      baseline: ["direct_rate", "growth", "target_pct"].includes(formulaType)
        ? baseline
        : null,
    });
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
    <div className="kpi-modal-overlay" aria-hidden="true">
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：業績達成率、新增客戶數"
            />
          </label>

          {/* 單位 */}
          <label className="kpi-modal-label">
            單位
            <input
              className="kpi-modal-input"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
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
                    &nbsp;= 實際值 / 目標值 × 100%
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
                    &nbsp;= (實際值 / 目標值 × 100%) / 目標達成率 × 100%
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

          {/* 目標值 */}
          {formulaType !== "completion" && (
            <label className="kpi-modal-label">
              {formulaType === "growth" ? "目標成長率（%）" : "目標值"}
              <input
                className="kpi-modal-input"
                type="number"
                value={formulaType === "growth" ? targetGrowthRate : target}
                onChange={(e) =>
                  formulaType === "growth"
                    ? setTargetGrowthRate(e.target.value)
                    : setTarget(e.target.value)
                }
                placeholder={
                  formulaType === "growth" ? "例：20（代表 20%）" : "例：100"
                }
              />
            </label>
          )}

          {/* 百分比達成率：目標達成率 */}
          {formulaType === "target_pct" && (
            <label className="kpi-modal-label">
              目標達成率（%）
              <input
                className="kpi-modal-input"
                type="number"
                value={targetRate}
                onChange={(e) => setTargetRate(e.target.value)}
                placeholder="例：85（代表 85%）"
              />
            </label>
          )}

          {/* 基底值設定（direct_rate, growth, target_pct 皆可用） */}
          {["direct_rate", "growth", "target_pct"].includes(formulaType) && (
            <div className="kpi-modal-label">
              {formulaType === "growth"
                ? "基底值來源"
                : formulaType === "direct_rate"
                  ? "參考來源"
                  : "引用基底值來源"}
              <div className="kpi-formula-radios">
                <label className="kpi-formula-radio">
                  <input
                    type="radio"
                    value="fixed"
                    checked={baselineType === "fixed"}
                    onChange={() => setBaselineType("fixed")}
                  />
                  <span>固定值</span>
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
                  onChange={(e) => setBaselineFixed(e.target.value)}
                  placeholder="基期值，例：1000"
                  style={{ marginTop: 6 }}
                />
              )}
              {baselineType === "kpiRef" && (
                <>
                  <select
                    className="kpi-modal-input"
                    value={baselineKpiRef}
                    onChange={(e) => setBaselineKpiRef(e.target.value)}
                    style={{ marginTop: 6 }}
                  >
                    <option value="">選擇 KPI…</option>
                    {siblingKpis.map((k) => {
                      const hasActual =
                        k.actual !== null && k.actual !== undefined;
                      return (
                        <option key={k.id} value={k.id} disabled={!hasActual}>
                          {getKpiDisplayName(k)}
                          {hasActual ? ` (${k.actual})` : " (尚未設定值)"}
                        </option>
                      );
                    })}
                  </select>
                  {siblingKpis.every(
                    (k) => k.actual === null || k.actual === undefined,
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
                      ⚠ 此活動所有 KPI
                      都還沒設定值，無法使用引用基底值。請先設定其他 KPI
                      的實際值。
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
