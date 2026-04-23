import { useState } from "react";
import type {
  WorkspaceData,
  DeptActivity,
  AssistUnit,
} from "../../schemas/ogsm";
import { genId } from "../../utils/csvParser";
import {
  generateUniqueBizKey,
  getActivityScopeExistingKeys,
} from "../../utils/bizKey";
import AssistUnitPicker from "./AssistUnitPicker";
import OwnerPicker from "./OwnerPicker";

interface FormData {
  deptId: string;
  rawText: string;
  description: string;
  owner: string;
  startDate: string;
  endDate: string;
  assistUnits: AssistUnit[];
  // OGSM 連結（選填）
  periodId: string;
  goalId: string;
  stratId: string;
}

const EMPTY_FORM: FormData = {
  deptId: "",
  rawText: "",
  description: "",
  owner: "",
  startDate: "",
  endDate: "",
  assistUnits: [],
  periodId: "",
  goalId: "",
  stratId: "",
};

function toDeptCode(name: string | undefined): string {
  const base = (name ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (base || "DEPT").slice(0, 12);
}

function parseGoalOrder(label: string | undefined, fallback: number): number {
  const matched = (label ?? "").match(/^G(\d+)/i);
  const parsed = matched ? Number.parseInt(matched[1], 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

interface Props {
  workspace: WorkspaceData;
  fixedDeptId?: string;
  onAdd: (deptId: string, activity: DeptActivity) => void;
  onClose: () => void;
}

export default function ActivityAddModal({
  workspace,
  fixedDeptId,
  onAdd,
  onClose,
}: Props) {
  const [form, setForm] = useState<FormData>(() => ({
    ...EMPTY_FORM,
    deptId: fixedDeptId ?? "",
  }));

  const set = <K extends keyof FormData>(key: K, value: FormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // OGSM 連結用下拉選項
  const depts = workspace.departments;
  const activeDept = depts.find((d) => d.id === form.deptId);
  const periods = activeDept?.periods ?? [];
  const activePeriod = periods.find((p) => p.id === form.periodId);
  const goals = activePeriod?.ogsm.goals ?? [];
  const activeGoal = goals.find((g) => g.id === form.goalId);
  const strategies = activeGoal?.strategies ?? [];
  const [showOgsmLink, setShowOgsmLink] = useState(false);

  const canSubmit = !!form.deptId && !!form.rawText.trim();
  const hasOgsmLinkSelection =
    !!form.periodId || !!form.goalId || !!form.stratId;
  const isDirty =
    !!form.rawText.trim() ||
    !!form.description.trim() ||
    !!form.owner.trim() ||
    !!form.startDate ||
    !!form.endDate ||
    form.assistUnits.length > 0 ||
    !!form.periodId ||
    !!form.goalId ||
    !!form.stratId;

  const handleRequestClose = () => {
    if (isDirty && !window.confirm("尚有未儲存的內容，確定要關閉嗎？")) {
      return;
    }
    onClose();
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const assistUnits = form.assistUnits.length ? form.assistUnits : undefined;

    const dashboardLinks: NonNullable<DeptActivity["dashboardLinks"]> =
      form.periodId && form.goalId && form.stratId
        ? [
            {
              id: genId("dlink"),
              type: "ogsm",
              periodId: form.periodId,
              goalId: form.goalId,
              strategyId: form.stratId,
              exclude: false,
            },
          ]
        : [];

    const goalIndex = goals.findIndex((g) => g.id === form.goalId);
    const goalOrder =
      goalIndex >= 0
        ? parseGoalOrder(goals[goalIndex]?.label, goalIndex + 1)
        : undefined;
    const strategyIndex = strategies.findIndex((s) => s.id === form.stratId);
    const strategyOrder = strategyIndex >= 0 ? strategyIndex + 1 : undefined;
    const activityOrder = (activeDept?.activities?.length ?? 0) + 1;

    const activity: DeptActivity = {
      id: genId("msr"),
      bizKey: generateUniqueBizKey({
        input: {
          entityType: "activity",
          year: activePeriod?.year,
          halfYear: activePeriod?.halfYear,
          deptCode: toDeptCode(activeDept?.name),
          goalOrder,
          strategyOrder,
          activityOrder,
        },
        existingKeys: getActivityScopeExistingKeys(
          activeDept?.activities ?? [],
          form.periodId && form.goalId && form.stratId
            ? {
                periodId: form.periodId,
                goalId: form.goalId,
                strategyId: form.stratId,
              }
            : undefined,
        ),
      }),
      rawText: form.rawText.trim(),
      kpis: [],
      warnDaysBefore: 3,
      description: form.description.trim() || undefined,
      owner: form.owner.trim() || undefined,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      assistUnits,
      status: "not-started",
      updatedAt: new Date().toISOString(),
      dashboardLinks: dashboardLinks.length ? dashboardLinks : undefined,
    };
    onAdd(form.deptId, activity);
    onClose();
  };

  return (
    <div
      className="act-modal-overlay"
      onClick={handleRequestClose}
      data-tour="activity-add-modal"
    >
      <div className="act-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="act-modal-header">
          <h3 className="act-modal-title">新增活動</h3>
          <button className="act-modal-close" onClick={handleRequestClose}>
            ×
          </button>
        </div>

        {/* Body */}
        <div className="act-modal-body">
          <div className="act-modal-form-grid">
            {/* 選部門 */}
            <label className="act-modal-label">
              部門 <span className="act-required">*</span>
              {fixedDeptId ? (
                <input
                  className="act-modal-input"
                  value={depts.find((d) => d.id === form.deptId)?.name ?? ""}
                  readOnly
                />
              ) : (
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
              )}
            </label>

            {/* 活動名稱 */}
            <label className="act-modal-label act-modal-label-full">
              行動計劃名稱 <span className="act-required">*</span>
              <input
                className="act-modal-input"
                value={form.rawText}
                onChange={(e) => set("rawText", e.target.value)}
                placeholder="活動名稱"
              />
            </label>

            {/* 活動說明 */}
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

            {/* 主責 */}
            <div className="act-modal-label">
              主責
              <OwnerPicker
                workspace={workspace}
                value={form.owner}
                selectClassName="act-modal-input"
                onChange={(name) => set("owner", name)}
              />
            </div>

            {/* 協助單位 */}
            <div className="act-modal-label act-modal-label-full">
              協助單位
              <AssistUnitPicker
                workspace={workspace}
                value={form.assistUnits}
                selectClassName="act-modal-input"
                onChange={(units) => set("assistUnits", units)}
              />
            </div>

            {/* 日期 */}
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

            {/* OGSM 連結（選填） */}
            <div className="act-modal-label act-modal-label-full">
              <button
                type="button"
                className="act-modal-ogsm-toggle"
                data-tour="activity-add-ogsm-link"
                onClick={() => setShowOgsmLink((v) => !v)}
              >
                <span>OGSM 連結（選填）</span>
                <span>
                  {showOgsmLink || hasOgsmLinkSelection ? "收合" : "展開"}
                </span>
              </button>
              {showOgsmLink || hasOgsmLinkSelection ? (
                <>
                  <div className="act-modal-breadcrumb">
                    連結後此活動的 KPI 將計入對應策略的完成率
                  </div>
                  <div className="act-modal-step-content">
                    <select
                      className="act-modal-select"
                      value={form.periodId}
                      onChange={(e) => {
                        set("periodId", e.target.value);
                        set("goalId", "");
                        set("stratId", "");
                      }}
                      disabled={!form.deptId}
                    >
                      <option value="">選期別…</option>
                      {periods.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.year} {p.halfYear}
                        </option>
                      ))}
                    </select>
                    <select
                      className="act-modal-select"
                      value={form.goalId}
                      onChange={(e) => {
                        set("goalId", e.target.value);
                        set("stratId", "");
                      }}
                      disabled={!form.periodId}
                    >
                      <option value="">選目標…</option>
                      {goals.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label} {g.title}
                        </option>
                      ))}
                    </select>
                    <select
                      className="act-modal-select"
                      value={form.stratId}
                      onChange={(e) => set("stratId", e.target.value)}
                      disabled={!form.goalId}
                    >
                      <option value="">選策略…</option>
                      {strategies.map((s, si) => (
                        <option key={s.id} value={s.id}>
                          S{si + 1} {s.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="act-modal-footer">
          <button className="act-modal-prev" onClick={handleRequestClose}>
            取消
          </button>
          <div className="act-modal-footer-right">
            <button
              className="act-modal-submit"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              新增活動
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
