/**
 * KpiConfigModal — KPI 設定 Modal（Layer 2，期初設定用）
 *
 * 設定 KPI 的名稱、單位、公式類型、目標值、baseline。
 * 由 ActivityDetailPanel 的 KPI tab 觸發。
 */
import { useState } from "react";
import type { KPI, KpiBaseline } from "../../schemas/ogsm";
import { getKpiDisplayName } from "../../utils/kpiCalc";
import { Tooltip } from "../ui/tooltip";

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
  const [formulaType, setFormulaType] = useState<"direct_rate" | "growth">(
    kpi.formulaType ?? "direct_rate",
  );
  const [target, setTarget] = useState<string>(
    kpi.target !== null && kpi.target !== undefined ? String(kpi.target) : "",
  );
  const [targetGrowthRate, setTargetGrowthRate] = useState<string>(
    kpi.targetGrowthRate !== null && kpi.targetGrowthRate !== undefined
      ? String(kpi.targetGrowthRate)
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
    let baseline: KpiBaseline | null = null;
    if (formulaType === "growth") {
      if (baselineType === "fixed" && baselineFixed !== "") {
        baseline = { type: "fixed", value: parseFloat(baselineFixed) };
      } else if (baselineType === "kpiRef" && baselineKpiRef) {
        baseline = { type: "kpiRef", kpiId: baselineKpiRef };
      }
    }

    onSave({
      ...kpi,
      name: name.trim() || undefined,
      label: name.trim() || kpi.label,
      unit: unit.trim(),
      formulaType,
      target: target !== "" ? parseFloat(target) : null,
      targetGrowthRate:
        formulaType === "growth" && targetGrowthRate !== ""
          ? parseFloat(targetGrowthRate)
          : (kpi.targetGrowthRate ?? null),
      baseline,
    });
  };

  return (
    <div className="kpi-modal-overlay" onClick={onClose}>
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
            </div>
          </div>

          {/* 目標值 */}
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

          {/* 成長型：基底設定 */}
          {formulaType === "growth" && (
            <div className="kpi-modal-label">
              基底值來源
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
                <select
                  className="kpi-modal-input"
                  value={baselineKpiRef}
                  onChange={(e) => setBaselineKpiRef(e.target.value)}
                  style={{ marginTop: 6 }}
                >
                  <option value="">選擇 KPI…</option>
                  {siblingKpis.map((k) => (
                    <option key={k.id} value={k.id}>
                      {getKpiDisplayName(k)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="kpi-modal-footer">
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
