/**
 * ActivityDetailPanel — 活動詳情側邊面板
 *
 * 取代 ActivityTable 的行內展開編輯，以獨立右側面板呈現完整活動資訊。
 * 4 個分頁：基本資料 / KPI 指標 / 行動計畫 / 備註
 */
import { useState, useEffect, useRef, useCallback } from "react";
import type {
  DeptActivity,
  WorkspaceData,
  KPI,
  ActivityPlanItem,
  AssistUnit,
  MeasureStatus,
} from "../schemas/ogsm";
import { genId } from "../utils/csvParser";
import {
  computeKpiAchievement,
  getKpiDisplayName,
  recomputeActivityKpis,
} from "../utils/kpiCalc";
import KpiConfigModal from "./activity/KpiConfigModal";
import AssistUnitPicker from "./activity/AssistUnitPicker";
import OwnerPicker from "./activity/OwnerPicker";

// ─── Constants ─────────────────────────────────────────────────────────────

const LS_WIDTH_KEY = "activo_activity_panel_width";
const DEFAULT_PANEL_WIDTH = 480;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 900;

const STATUS_OPTIONS: { value: MeasureStatus; label: string }[] = [
  { value: "not-started", label: "未開始" },
  { value: "attention", label: "注意" },
  { value: "in-progress", label: "進行中" },
  { value: "completed", label: "已完成" },
];

type Tab = "basic" | "kpi" | "plans" | "notes";

// ─── Helper ─────────────────────────────────────────────────────────────────

function fmtDate(d: string | undefined) {
  return d ?? "";
}

function loadWidth(): number {
  try {
    const v = localStorage.getItem(LS_WIDTH_KEY);
    if (v) {
      const n = parseInt(v, 10);
      if (!isNaN(n) && n >= MIN_PANEL_WIDTH && n <= MAX_PANEL_WIDTH) return n;
    }
  } catch {
    // ignore
  }
  return DEFAULT_PANEL_WIDTH;
}

function saveWidth(w: number) {
  try {
    localStorage.setItem(LS_WIDTH_KEY, String(w));
  } catch {
    // ignore
  }
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface Props {
  activity: DeptActivity;
  deptId: string;
  workspace: WorkspaceData;
  isReadOnly?: boolean;
  warnDaysBefore: number;
  onUpdate: (deptId: string, activity: DeptActivity) => void;
  onDelete: (deptId: string, activityId: string) => void;
  onClose: () => void;
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function ActivityDetailPanel({
  activity,
  deptId,
  workspace,
  isReadOnly = false,
  onUpdate,
  onDelete,
  onClose,
}: Props) {
  // ── Local draft state ──────────────────────────────────────────────────────
  const [draft, setDraft] = useState<DeptActivity>(() => ({
    ...activity,
    kpis: activity.kpis ?? [],
    planItems: activity.planItems ?? [],
  }));

  // Sync draft when activity prop changes (e.g. switched to new activity)
  useEffect(() => {
    setDraft({
      ...activity,
      kpis: activity.kpis ?? [],
      planItems: activity.planItems ?? [],
    });
    setTab("basic");
  }, [activity.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [tab, setTab] = useState<Tab>("basic");
  const [dirty, setDirty] = useState(false);

  // ── KPI Config Modal ───────────────────────────────────────────────────────
  const [configKpiId, setConfigKpiId] = useState<string | null>(null);

  // ── Panel width (draggable) ────────────────────────────────────────────────
  const [panelWidth, setPanelWidth] = useState(loadWidth);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startW: panelWidth };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startX - ev.clientX;
        const newW = Math.min(
          MAX_PANEL_WIDTH,
          Math.max(MIN_PANEL_WIDTH, dragRef.current.startW + delta),
        );
        setPanelWidth(newW);
      };
      const onMouseUp = (ev: MouseEvent) => {
        if (!dragRef.current) return;
        const delta = dragRef.current.startX - ev.clientX;
        const newW = Math.min(
          MAX_PANEL_WIDTH,
          Math.max(MIN_PANEL_WIDTH, dragRef.current.startW + delta),
        );
        saveWidth(newW);
        dragRef.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [panelWidth],
  );

  // ── Draft helpers ──────────────────────────────────────────────────────────
  const patch = (partial: Partial<DeptActivity>) => {
    setDraft((d) => ({ ...d, ...partial }));
    setDirty(true);
  };

  const handleSave = () => {
    const saved: DeptActivity = {
      ...draft,
      kpis: recomputeActivityKpis(draft.kpis ?? []),
      updatedAt: new Date().toISOString(),
    };
    onUpdate(deptId, saved);
    setDirty(false);
  };

  const handleDelete = () => {
    if (!window.confirm(`確定要刪除活動「${draft.rawText}」？`)) return;
    onDelete(deptId, draft.id);
  };

  // ── KPI helpers ────────────────────────────────────────────────────────────
  const patchKpi = (kpiId: string, changes: Partial<KPI>) => {
    patch({
      kpis: draft.kpis.map((k) => (k.id === kpiId ? { ...k, ...changes } : k)),
    });
  };

  const addKpi = () => {
    const newKpi: KPI = {
      id: genId(),
      label: "新 KPI",
      target: null,
      actual: null,
      unit: "",
      achievementRate: null,
      formulaType: "direct_rate",
    };
    patch({ kpis: [...draft.kpis, newKpi] });
  };

  const deleteKpi = (kpiId: string) => {
    patch({ kpis: draft.kpis.filter((k) => k.id !== kpiId) });
  };

  const handleKpiConfigSave = (updated: KPI) => {
    patchKpi(updated.id, updated);
    setConfigKpiId(null);
  };

  // ── PlanItems helpers ──────────────────────────────────────────────────────
  const planItems = draft.planItems ?? [];

  const patchPlanItem = (
    itemId: string,
    changes: Partial<ActivityPlanItem>,
  ) => {
    patch({
      planItems: planItems.map((p) =>
        p.id === itemId ? { ...p, ...changes } : p,
      ),
    });
  };

  const addPlanItem = (quarter: string) => {
    const newItem: ActivityPlanItem = {
      id: genId(),
      description: "",
      quarter,
      completed: false,
      plannedEndDate: undefined,
      actualEndDate: undefined,
      linkedMeasureId: null,
    };
    patch({ planItems: [...planItems, newItem] });
  };

  const deletePlanItem = (itemId: string) => {
    patch({ planItems: planItems.filter((p) => p.id !== itemId) });
  };

  // Derive quarters from existing plan items; always include at least Q1-Q4
  const allQuarters = Array.from(
    new Set([
      "Q1",
      "Q2",
      "Q3",
      "Q4",
      ...planItems.map((p) => p.quarter ?? "Q1"),
    ]),
  ).sort();

  // ── Render ─────────────────────────────────────────────────────────────────
  const configKpi = configKpiId
    ? draft.kpis.find((k) => k.id === configKpiId)
    : null;

  return (
    <>
      {/* KPI Config Modal (portal-style, rendered at root level) */}
      {configKpi && (
        <KpiConfigModal
          kpi={configKpi}
          siblingKpis={draft.kpis.filter((k) => k.id !== configKpiId)}
          onSave={handleKpiConfigSave}
          onClose={() => setConfigKpiId(null)}
        />
      )}

      {/* Panel */}
      <div className="adp-panel" style={{ width: panelWidth }}>
        {/* Drag handle (left edge) */}
        <div
          className="adp-resize-handle"
          onMouseDown={handleResizeMouseDown}
          title="拖曳調整寬度"
        />

        {/* Header */}
        <div className="adp-header">
          <div className="adp-header-title" title={draft.rawText}>
            {draft.rawText || "（未命名活動）"}
          </div>
          <button className="adp-close-btn" onClick={onClose} title="關閉">
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="adp-tabs">
          {(
            [
              { id: "basic", label: "基本資料" },
              {
                id: "kpi",
                label: `KPI 指標${draft.kpis.length > 0 ? ` (${draft.kpis.length})` : ""}`,
              },
              {
                id: "plans",
                label: `行動計畫${planItems.length > 0 ? ` (${planItems.length})` : ""}`,
              },
              { id: "notes", label: "備註" },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              className={`adp-tab${tab === t.id ? " adp-tab-active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="adp-body">
          {tab === "basic" && (
            <BasicTab
              draft={draft}
              workspace={workspace}
              isReadOnly={isReadOnly}
              patch={patch}
            />
          )}
          {tab === "kpi" && (
            <KpiTab
              kpis={draft.kpis}
              isReadOnly={isReadOnly}
              onPatchKpi={patchKpi}
              onAddKpi={addKpi}
              onDeleteKpi={deleteKpi}
              onOpenConfig={setConfigKpiId}
            />
          )}
          {tab === "plans" && (
            <PlansTab
              planItems={planItems}
              quarters={allQuarters}
              isReadOnly={isReadOnly}
              onPatch={patchPlanItem}
              onAdd={addPlanItem}
              onDelete={deletePlanItem}
            />
          )}
          {tab === "notes" && (
            <NotesTab
              notes={draft.notes ?? ""}
              isReadOnly={isReadOnly}
              onChange={(v) => patch({ notes: v })}
            />
          )}
        </div>

        {/* Footer */}
        {!isReadOnly && (
          <div className="adp-footer">
            <button className="adp-btn-delete" onClick={handleDelete}>
              刪除活動
            </button>
            <div className="adp-footer-right">
              {dirty && <span className="adp-dirty-indicator">● 未儲存</span>}
              <button
                className={`adp-btn-save${dirty ? " adp-btn-save-dirty" : ""}`}
                onClick={handleSave}
                disabled={!dirty}
              >
                儲存
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Tab: 基本資料 ─────────────────────────────────────────────────────────────

function BasicTab({
  draft,
  workspace,
  isReadOnly,
  patch,
}: {
  draft: DeptActivity;
  workspace: WorkspaceData;
  isReadOnly: boolean;
  patch: (p: Partial<DeptActivity>) => void;
}) {
  return (
    <div className="adp-section-list">
      {/* 活動名稱 */}
      <div className="adp-field">
        <label className="adp-field-label">活動名稱</label>
        <input
          className="adp-input"
          value={draft.rawText}
          disabled={isReadOnly}
          onChange={(e) => patch({ rawText: e.target.value })}
          placeholder="活動名稱…"
        />
      </div>

      {/* 主責 */}
      <div className="adp-field">
        <label className="adp-field-label">主責</label>
        {isReadOnly ? (
          <span className="adp-value">{draft.owner || "—"}</span>
        ) : (
          <OwnerPicker
            workspace={workspace}
            value={draft.owner ?? ""}
            onChange={(v) => patch({ owner: v })}
            selectClassName="adp-select"
          />
        )}
      </div>

      {/* 狀態 */}
      <div className="adp-field">
        <label className="adp-field-label">狀態</label>
        {isReadOnly ? (
          <span className="adp-value">
            {STATUS_OPTIONS.find((s) => s.value === draft.status)?.label ?? "—"}
          </span>
        ) : (
          <select
            className="adp-select"
            value={draft.status ?? ""}
            onChange={(e) =>
              patch({ status: (e.target.value as MeasureStatus) || undefined })
            }
          >
            <option value="">（未設定）</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 開始 / 結束日期 */}
      <div className="adp-field adp-field-row">
        <div className="adp-field adp-field-half">
          <label className="adp-field-label">開始日期</label>
          <input
            className="adp-input"
            type="date"
            value={fmtDate(draft.startDate)}
            disabled={isReadOnly}
            onChange={(e) => patch({ startDate: e.target.value || undefined })}
          />
        </div>
        <div className="adp-field adp-field-half">
          <label className="adp-field-label">結束日期</label>
          <input
            className="adp-input"
            type="date"
            value={fmtDate(draft.endDate)}
            disabled={isReadOnly}
            onChange={(e) => patch({ endDate: e.target.value || undefined })}
          />
        </div>
      </div>

      {/* 說明 */}
      <div className="adp-field">
        <label className="adp-field-label">說明</label>
        <textarea
          className="adp-textarea"
          value={draft.description ?? ""}
          disabled={isReadOnly}
          rows={3}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="活動說明…"
        />
      </div>

      {/* 協助單位 */}
      <div className="adp-field">
        <label className="adp-field-label">協助單位</label>
        {isReadOnly ? (
          <span className="adp-value">
            {(draft.assistUnits ?? []).map((u) => u.name).join("、") || "—"}
          </span>
        ) : (
          <AssistUnitPicker
            workspace={workspace}
            value={draft.assistUnits ?? []}
            onChange={(v: AssistUnit[]) => patch({ assistUnits: v })}
          />
        )}
      </div>

      {/* 標籤 */}
      <div className="adp-field">
        <label className="adp-field-label">標籤</label>
        <TagEditor
          tags={draft.tags ?? []}
          disabled={isReadOnly}
          onChange={(tags) => patch({ tags })}
        />
      </div>
    </div>
  );
}

// ─── Tag Editor ────────────────────────────────────────────────────────────

function TagEditor({
  tags,
  disabled,
  onChange,
}: {
  tags: string[];
  disabled: boolean;
  onChange: (t: string[]) => void;
}) {
  const [inputVal, setInputVal] = useState("");

  const addTag = () => {
    const v = inputVal.trim();
    if (v && !tags.includes(v)) {
      onChange([...tags, v]);
    }
    setInputVal("");
  };

  return (
    <div className="adp-tag-editor">
      <div className="adp-tag-list">
        {tags.map((t) => (
          <span key={t} className="adp-tag">
            {t}
            {!disabled && (
              <button
                className="adp-tag-remove"
                onClick={() => onChange(tags.filter((x) => x !== t))}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {tags.length === 0 && disabled && <span className="adp-value">—</span>}
      </div>
      {!disabled && (
        <div className="adp-tag-input-row">
          <input
            className="adp-input adp-input-sm"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="輸入標籤後按 Enter"
          />
          <button className="adp-btn-sm" onClick={addTag}>
            +
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Tab: KPI 指標 ─────────────────────────────────────────────────────────

function KpiTab({
  kpis,
  isReadOnly,
  onPatchKpi,
  onAddKpi,
  onDeleteKpi,
  onOpenConfig,
}: {
  kpis: KPI[];
  isReadOnly: boolean;
  onPatchKpi: (id: string, changes: Partial<KPI>) => void;
  onAddKpi: () => void;
  onDeleteKpi: (id: string) => void;
  onOpenConfig: (id: string) => void;
}) {
  return (
    <div className="adp-section-list">
      {kpis.length === 0 && (
        <div className="adp-empty-hint">
          尚無 KPI —{" "}
          {isReadOnly ? "此活動沒有設定 KPI。" : "點擊「＋ 新增 KPI」來建立。"}
        </div>
      )}

      {kpis.map((kpi) => {
        const siblings = kpis.filter((k) => k.id !== kpi.id);
        const achieved = computeKpiAchievement(kpi, siblings);
        return (
          <KpiRow
            key={kpi.id}
            kpi={kpi}
            achieved={achieved}
            isReadOnly={isReadOnly}
            onPatch={(changes) => onPatchKpi(kpi.id, changes)}
            onDelete={() => onDeleteKpi(kpi.id)}
            onOpenConfig={() => onOpenConfig(kpi.id)}
          />
        );
      })}

      {!isReadOnly && (
        <button className="adp-add-btn" onClick={onAddKpi}>
          ＋ 新增 KPI
        </button>
      )}
    </div>
  );
}

function KpiRow({
  kpi,
  achieved,
  isReadOnly,
  onPatch,
  onDelete,
  onOpenConfig,
}: {
  kpi: KPI;
  achieved: number | null;
  isReadOnly: boolean;
  onPatch: (c: Partial<KPI>) => void;
  onDelete: () => void;
  onOpenConfig: () => void;
}) {
  const achPct = achieved !== null ? `${achieved.toFixed(1)}%` : "—";
  const achColor =
    achieved === null
      ? "var(--text3)"
      : achieved >= 100
        ? "var(--green)"
        : achieved >= 70
          ? "var(--yellow)"
          : "var(--red)";

  return (
    <div className="adp-kpi-row">
      <div className="adp-kpi-header">
        <span className="adp-kpi-name">{getKpiDisplayName(kpi)}</span>
        <div className="adp-kpi-actions">
          {!isReadOnly && (
            <button
              className="adp-kpi-btn"
              onClick={onOpenConfig}
              title="KPI 設定"
            >
              ⚙
            </button>
          )}
          {!isReadOnly && (
            <button
              className="adp-kpi-btn adp-kpi-btn-del"
              onClick={() => {
                if (window.confirm(`刪除 KPI「${getKpiDisplayName(kpi)}」？`))
                  onDelete();
              }}
              title="刪除"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="adp-kpi-fields">
        {/* 目標 */}
        <div className="adp-kpi-field">
          <span className="adp-kpi-field-label">目標</span>
          {isReadOnly ? (
            <span className="adp-kpi-field-val">
              {kpi.target !== null && kpi.target !== undefined
                ? `${kpi.target} ${kpi.unit}`
                : "—"}
            </span>
          ) : (
            <div className="adp-kpi-input-unit">
              <input
                className="adp-input adp-input-sm"
                type="number"
                value={
                  kpi.target !== null && kpi.target !== undefined
                    ? kpi.target
                    : ""
                }
                onChange={(e) =>
                  onPatch({
                    target:
                      e.target.value !== "" ? parseFloat(e.target.value) : null,
                  })
                }
                placeholder="目標值"
              />
              <span className="adp-kpi-unit">{kpi.unit || "—"}</span>
            </div>
          )}
        </div>

        {/* 實際值 */}
        <div className="adp-kpi-field">
          <span className="adp-kpi-field-label">實際</span>
          {isReadOnly ? (
            <span className="adp-kpi-field-val">
              {kpi.actual !== null && kpi.actual !== undefined
                ? `${kpi.actual} ${kpi.unit}`
                : "—"}
            </span>
          ) : (
            <div className="adp-kpi-input-unit">
              <input
                className="adp-input adp-input-sm"
                type="number"
                value={
                  kpi.actual !== null && kpi.actual !== undefined
                    ? kpi.actual
                    : ""
                }
                onChange={(e) =>
                  onPatch({
                    actual:
                      e.target.value !== "" ? parseFloat(e.target.value) : null,
                  })
                }
                placeholder="實際值"
              />
              <span className="adp-kpi-unit">{kpi.unit || "—"}</span>
            </div>
          )}
        </div>

        {/* 達成率 */}
        <div className="adp-kpi-field">
          <span className="adp-kpi-field-label">達成率</span>
          <span className="adp-kpi-ach" style={{ color: achColor }}>
            {achPct}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Tab: 行動計畫 ─────────────────────────────────────────────────────────

function PlansTab({
  planItems,
  quarters,
  isReadOnly,
  onPatch,
  onAdd,
  onDelete,
}: {
  planItems: ActivityPlanItem[];
  quarters: string[];
  isReadOnly: boolean;
  onPatch: (id: string, changes: Partial<ActivityPlanItem>) => void;
  onAdd: (quarter: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="adp-section-list">
      {quarters.map((q) => {
        const items = planItems.filter((p) => (p.quarter ?? "Q1") === q);
        return (
          <div key={q} className="adp-plan-quarter">
            <div className="adp-plan-quarter-header">
              <span className="adp-plan-q-label">{q}</span>
              <span className="adp-plan-q-count">
                {items.filter((i) => i.completed).length}/{items.length}
              </span>
            </div>

            {items.length === 0 && (
              <div className="adp-empty-hint adp-plan-empty">
                {isReadOnly ? "此季度無計畫項目" : "點擊「＋」新增行動項目"}
              </div>
            )}

            {items.map((item) => (
              <PlanItemRow
                key={item.id}
                item={item}
                isReadOnly={isReadOnly}
                onPatch={(c) => onPatch(item.id, c)}
                onDelete={() => {
                  if (window.confirm("刪除此行動計畫項目？")) onDelete(item.id);
                }}
              />
            ))}

            {!isReadOnly && (
              <button className="adp-plan-add-btn" onClick={() => onAdd(q)}>
                ＋ 新增項目
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PlanItemRow({
  item,
  isReadOnly,
  onPatch,
  onDelete,
}: {
  item: ActivityPlanItem;
  isReadOnly: boolean;
  onPatch: (c: Partial<ActivityPlanItem>) => void;
  onDelete: () => void;
}) {
  return (
    <div className={`adp-plan-item${item.completed ? " adp-plan-done" : ""}`}>
      <div className="adp-plan-item-top">
        <input
          className="adp-plan-check"
          type="checkbox"
          checked={item.completed}
          disabled={isReadOnly}
          onChange={(e) => onPatch({ completed: e.target.checked })}
        />
        {isReadOnly ? (
          <span
            className={`adp-plan-desc${item.completed ? " adp-plan-desc-done" : ""}`}
          >
            {item.description || "（無說明）"}
          </span>
        ) : (
          <input
            className={`adp-input adp-plan-desc-input${item.completed ? " adp-plan-desc-done" : ""}`}
            value={item.description}
            onChange={(e) => onPatch({ description: e.target.value })}
            placeholder="行動項目說明…"
          />
        )}
        {!isReadOnly && (
          <button
            className="adp-kpi-btn adp-kpi-btn-del"
            onClick={onDelete}
            title="刪除"
          >
            ✕
          </button>
        )}
      </div>

      <div className="adp-plan-item-meta">
        <span className="adp-plan-meta-label">截止：</span>
        <input
          className="adp-input adp-input-sm adp-plan-date"
          type="date"
          value={item.plannedEndDate ?? ""}
          disabled={isReadOnly}
          onChange={(e) =>
            onPatch({ plannedEndDate: e.target.value || undefined })
          }
        />
        {item.owner !== undefined && (
          <span className="adp-plan-owner">{item.owner}</span>
        )}
      </div>
    </div>
  );
}

// ─── Tab: 備註 ─────────────────────────────────────────────────────────────

function NotesTab({
  notes,
  isReadOnly,
  onChange,
}: {
  notes: string;
  isReadOnly: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="adp-section-list">
      <textarea
        className="adp-textarea adp-notes-textarea"
        value={notes}
        disabled={isReadOnly}
        rows={16}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isReadOnly ? "無備註" : "在此輸入備註…"}
      />
    </div>
  );
}
