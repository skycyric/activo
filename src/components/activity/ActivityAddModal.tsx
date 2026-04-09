import { useState } from "react";
import type { WorkspaceData, Measure, AssistUnit } from "../../schemas/ogsm";
import { genId } from "../../utils/csvParser";
import AssistUnitPicker from "./AssistUnitPicker";
import OwnerPicker from "./OwnerPicker";

type Step = 1 | 2 | 3 | 4 | 5;

interface FormData {
  deptId: string;
  periodId: string;
  goalId: string;
  stratId: string;
  rawText: string;
  description: string;
  owner: string;
  startDate: string;
  endDate: string;
  assistUnits: AssistUnit[];
}

const EMPTY_FORM: FormData = {
  deptId: "",
  periodId: "",
  goalId: "",
  stratId: "",
  rawText: "",
  description: "",
  owner: "",
  startDate: "",
  endDate: "",
  assistUnits: [],
};

interface Props {
  workspace: WorkspaceData;
  onAdd: (
    deptId: string,
    periodId: string,
    goalId: string,
    stratId: string,
    measure: Measure,
  ) => void;
  onClose: () => void;
}

export default function ActivityAddModal({ workspace, onAdd, onClose }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Derive options per step
  const depts = workspace.departments;
  const activeDept = depts.find((d) => d.id === form.deptId);
  const periods = activeDept?.periods ?? [];
  const activePeriod = periods.find((p) => p.id === form.periodId);
  const goals = activePeriod?.ogsm.goals ?? [];
  const activeGoal = goals.find((g) => g.id === form.goalId);
  const strategies = activeGoal?.strategies ?? [];

  const canNext: Record<Step, boolean> = {
    1: !!form.deptId,
    2: !!form.periodId,
    3: !!form.goalId,
    4: !!form.stratId,
    5: !!form.rawText.trim(),
  };

  const next = () => {
    if (canNext[step] && step < 5) setStep((s) => (s + 1) as Step);
  };

  const prev = () => {
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  const handleSubmit = () => {
    if (!form.rawText.trim()) return;
    const assistUnits = form.assistUnits.length ? form.assistUnits : undefined;

    const measure: Measure = {
      id: genId("msr"),
      rawText: form.rawText.trim(),
      kpis: [],
      description: form.description.trim() || undefined,
      owner: form.owner.trim() || undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      assistUnits,
      status: "not-started",
      updatedAt: new Date().toISOString(),
    };
    onAdd(form.deptId, form.periodId, form.goalId, form.stratId, measure);
    onClose();
  };

  const STEPS = ["選部門", "選期別", "選目標", "選策略", "填內容"];

  return (
    <div className="act-modal-overlay" onClick={onClose}>
      <div className="act-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="act-modal-header">
          <h3 className="act-modal-title">新增活動</h3>
          <button className="act-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        {/* Step indicator */}
        <div className="act-modal-steps">
          {STEPS.map((label, i) => {
            const s = (i + 1) as Step;
            return (
              <div
                key={s}
                className={`act-step-item${step === s ? " active" : ""}${s < step ? " done" : ""}`}
              >
                <span className="act-step-num">{s < step ? "✓" : s}</span>
                <span className="act-step-label">{label}</span>
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="act-modal-body">
          {step === 1 && (
            <div className="act-modal-step-content">
              <label className="act-modal-label">
                選擇部門
                <select
                  className="act-modal-select"
                  value={form.deptId}
                  onChange={(e) => {
                    set("deptId", e.target.value);
                    set("periodId", "");
                    set("goalId", "");
                    set("stratId", "");
                  }}
                  autoFocus
                >
                  <option value="">-- 請選擇 --</option>
                  {depts.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="act-modal-step-content">
              <div className="act-modal-breadcrumb">{activeDept?.name}</div>
              <label className="act-modal-label">
                選擇期別
                <select
                  className="act-modal-select"
                  value={form.periodId}
                  onChange={(e) => {
                    set("periodId", e.target.value);
                    set("goalId", "");
                    set("stratId", "");
                  }}
                  autoFocus
                >
                  <option value="">-- 請選擇 --</option>
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.year} {p.halfYear}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step === 3 && (
            <div className="act-modal-step-content">
              <div className="act-modal-breadcrumb">
                {activeDept?.name} › {activePeriod?.year}{" "}
                {activePeriod?.halfYear}
              </div>
              <label className="act-modal-label">
                選擇目標
                <select
                  className="act-modal-select"
                  value={form.goalId}
                  onChange={(e) => {
                    set("goalId", e.target.value);
                    set("stratId", "");
                  }}
                  autoFocus
                >
                  <option value="">-- 請選擇 --</option>
                  {goals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label} {g.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step === 4 && (
            <div className="act-modal-step-content">
              <div className="act-modal-breadcrumb">
                {activeDept?.name} › {activePeriod?.year}{" "}
                {activePeriod?.halfYear} › {activeGoal?.label}{" "}
                {activeGoal?.title}
              </div>
              <label className="act-modal-label">
                選擇策略
                <select
                  className="act-modal-select"
                  value={form.stratId}
                  onChange={(e) => set("stratId", e.target.value)}
                  autoFocus
                >
                  <option value="">-- 請選擇 --</option>
                  {strategies.map((s, si) => (
                    <option key={s.id} value={s.id}>
                      S{si + 1} {s.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {step === 5 && (
            <div className="act-modal-step-content act-modal-form-grid">
              <label className="act-modal-label act-modal-label-full">
                行動計劃名稱 <span className="act-required">*</span>
                <input
                  className="act-modal-input"
                  value={form.rawText}
                  onChange={(e) => set("rawText", e.target.value)}
                  placeholder="活動名稱"
                  autoFocus
                />
              </label>
              <label className="act-modal-label act-modal-label-full">
                活動說明
                <textarea
                  className="act-modal-textarea"
                  value={form.description}
                  rows={3}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="補充說明、目的或備註…"
                />
              </label>
              <div className="act-modal-label">
                主責
                <OwnerPicker
                  workspace={workspace}
                  value={form.owner}
                  selectClassName="act-modal-input"
                  onChange={(name) => set("owner", name)}
                />
              </div>
              <div className="act-modal-label act-modal-label-full">
                協助單位
                <AssistUnitPicker
                  workspace={workspace}
                  value={form.assistUnits}
                  selectClassName="act-modal-input"
                  onChange={(units) => set("assistUnits", units)}
                />
              </div>
              <label className="act-modal-label">
                起始日
                <input
                  className="act-modal-input"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => set("startDate", e.target.value)}
                />
              </label>
              <label className="act-modal-label">
                結束日
                <input
                  className="act-modal-input"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => set("endDate", e.target.value)}
                />
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="act-modal-footer">
          <button
            className="act-modal-prev"
            onClick={prev}
            disabled={step === 1}
          >
            ← 上一步
          </button>
          <div className="act-modal-footer-right">
            {step < 5 ? (
              <button
                className="act-modal-next"
                onClick={next}
                disabled={!canNext[step]}
              >
                下一步 →
              </button>
            ) : (
              <button
                className="act-modal-submit"
                onClick={handleSubmit}
                disabled={!form.rawText.trim()}
              >
                新增活動
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
