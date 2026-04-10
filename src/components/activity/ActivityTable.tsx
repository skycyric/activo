import { useState, useRef } from "react";
import type {
  Measure,
  MeasureStatus,
  WorkspaceData,
  AssistUnit,
} from "../../schemas/ogsm";
import type { ActivityWithContext } from "../ActivityPage";
import AssistUnitPicker from "./AssistUnitPicker";
import OwnerPicker from "./OwnerPicker";

type SortField = "rawText" | "deptName" | "owner" | "startDate" | "status";
type SortDir = "asc" | "desc";

const STATUS_INFO: Record<string, { label: string; cls: string }> = {
  "not-started": { label: "未開始", cls: "status-not-started" },
  attention: { label: "注意", cls: "status-attention" },
  "in-progress": { label: "進行中", cls: "status-in-progress" },
  completed: { label: "已完成", cls: "status-completed" },
};

const ALL_STATUSES: MeasureStatus[] = [
  "not-started",
  "attention",
  "in-progress",
  "completed",
];

interface EditState {
  activityId: string;
  rawText: string;
  description: string;
  owner: string;
  startDate: string;
  endDate: string;
  assistUnits: AssistUnit[];
  prerequisites: string[];
  relatedActivities: string[];
  addingPrereqId: string;
  addingRelatedId: string;
}

interface Props {
  activities: ActivityWithContext[];
  allActivities: ActivityWithContext[];
  workspace: WorkspaceData;
  expandedId: string | null;
  onSetExpandedId: (id: string | null) => void;
  onUpdateMeasure: (
    deptId: string,
    periodId: string,
    goalId: string,
    stratId: string,
    measure: Measure,
  ) => void;
  onDeleteMeasure: (
    deptId: string,
    periodId: string,
    goalId: string,
    stratId: string,
    measureId: string,
  ) => void;
  onJumpToMeasure: (
    deptId: string,
    periodId: string,
    goalId: string,
    stratId: string,
    measureId: string,
  ) => void;
}

function formatDate(d: string | undefined): string {
  if (!d) return "—";
  return d.replace(/-/g, "/");
}

export default function ActivityTable({
  activities,
  allActivities,
  workspace,
  expandedId,
  onSetExpandedId,
  onUpdateMeasure,
  onDeleteMeasure,
  onJumpToMeasure,
}: Props) {
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: "startDate",
    dir: "asc",
  });
  const [editState, setEditState] = useState<EditState | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // owner 名稱 → 所屬團隊名稱
  const lookupTeam = (owner: string | undefined): string => {
    if (!owner) return "—";
    for (const t of workspace.teams ?? []) {
      if (t.members.some((m) => m.name === owner)) return t.name;
    }
    return "—";
  };

  const toggleSort = (field: SortField) => {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: "asc" },
    );
  };

  const sorted = [...activities].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const va = (a[sort.field] ?? "") as string;
    const vb = (b[sort.field] ?? "") as string;
    return va.localeCompare(vb, "zh-TW") * dir;
  });

  const updateStatus = (act: ActivityWithContext, status: MeasureStatus) => {
    onUpdateMeasure(act.deptId, act.periodId, act.goalId, act.strategyId, {
      ...act,
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  const openEdit = (act: ActivityWithContext) => {
    onSetExpandedId(act.id);
    setEditState({
      activityId: act.id,
      rawText: act.rawText,
      description: act.description ?? "",
      owner: act.owner ?? "",
      startDate: act.startDate ?? "",
      endDate: act.endDate ?? "",
      assistUnits: act.assistUnits ?? [],
      prerequisites: act.prerequisites ?? [],
      relatedActivities: act.relatedActivities ?? [],
      addingPrereqId: "",
      addingRelatedId: "",
    });
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const closeEdit = () => {
    onSetExpandedId(null);
    setEditState(null);
  };

  const commitEdit = (act: ActivityWithContext) => {
    if (!editState) return;
    onUpdateMeasure(act.deptId, act.periodId, act.goalId, act.strategyId, {
      ...act,
      rawText: editState.rawText.trim() || act.rawText,
      description: editState.description.trim() || undefined,
      owner: editState.owner.trim() || undefined,
      startDate: editState.startDate || undefined,
      endDate: editState.endDate || undefined,
      assistUnits: editState.assistUnits.length
        ? editState.assistUnits
        : undefined,
      prerequisites: editState.prerequisites.length
        ? editState.prerequisites
        : undefined,
      relatedActivities: editState.relatedActivities.length
        ? editState.relatedActivities
        : undefined,
      updatedAt: new Date().toISOString(),
    });
    closeEdit();
  };

  const findById = (id: string) => allActivities.find((a) => a.id === id);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort.field !== field) return <span className="act-sort-icon">⇅</span>;
    return (
      <span className="act-sort-icon active">
        {sort.dir === "asc" ? "↑" : "↓"}
      </span>
    );
  };

  const Th = ({
    field,
    label,
    width,
  }: {
    field: SortField;
    label: string;
    width?: string;
  }) => (
    <th
      className="act-th sortable"
      style={width ? { width } : undefined}
      onClick={() => toggleSort(field)}
    >
      {label}
      <SortIcon field={field} />
    </th>
  );

  if (activities.length === 0) {
    return (
      <div className="act-empty">
        <div className="act-empty-icon">📋</div>
        <div className="act-empty-text">沒有符合條件的活動</div>
      </div>
    );
  }

  return (
    <div className="act-table-wrap">
      <table className="act-table">
        <thead>
          <tr>
            <Th field="rawText" label="行動計劃名稱" width="220px" />
            <th className="act-th" style={{ width: "160px" }}>
              活動說明
            </th>
            <Th field="deptName" label="部門" width="100px" />
            <th className="act-th" style={{ width: "100px" }}>
              團隊
            </th>
            <Th field="owner" label="主責" width="90px" />
            <th className="act-th" style={{ width: "100px" }}>
              協助單位
            </th>
            <Th field="startDate" label="起始日" width="90px" />
            <th className="act-th" style={{ width: "90px" }}>
              結束日
            </th>
            <Th field="status" label="狀態" width="110px" />
            <th className="act-th act-th-actions" style={{ width: "80px" }}>
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((act) => {
            const isExpanded = expandedId === act.id;
            const si =
              STATUS_INFO[act.status ?? "not-started"] ??
              STATUS_INFO["not-started"];
            const relCount =
              (act.prerequisites?.length ?? 0) +
              (act.relatedActivities?.length ?? 0);
            const isBlocked = act.prerequisites?.some((id) => {
              const pre = allActivities.find((a) => a.id === id);
              return pre && pre.status !== "completed";
            });

            return (
              <>
                <tr
                  key={act.id}
                  className={`act-row${isExpanded ? " expanded" : ""}`}
                >
                  {/* 行動計劃名稱 */}
                  <td className="act-td act-td-name">
                    <span className="act-name-text" title={act.rawText}>
                      {act.rawText || (
                        <span className="act-empty-label">未命名</span>
                      )}
                    </span>
                    {isBlocked && (
                      <span
                        className="act-prereq-warn"
                        title="有前置活動尚未完成"
                      >
                        ⚠
                      </span>
                    )}
                    {relCount > 0 && (
                      <span className="act-rel-badge" title="有關聯活動">
                        {relCount}
                      </span>
                    )}
                  </td>
                  {/* 活動說明 */}
                  <td className="act-td act-td-desc">
                    <span className="act-desc-text" title={act.description}>
                      {act.description || "—"}
                    </span>
                  </td>
                  {/* 部門 */}
                  <td className="act-td">
                    <span className="act-dept-badge">{act.deptName}</span>
                  </td>
                  {/* 團隊 */}
                  <td className="act-td">
                    {lookupTeam(act.owner) !== "—" ? (
                      <span className="act-team-badge">
                        {lookupTeam(act.owner)}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {/* 主責 */}
                  <td className="act-td">
                    {act.owner ? (
                      <span className="act-owner-badge">{act.owner}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  {/* 協助單位 */}
                  <td className="act-td act-td-assist">
                    {act.assistUnits?.length ? (
                      <div className="act-assist-badges">
                        {act.assistUnits.map((u) => (
                          <span
                            key={u.id}
                            className={`act-assist-badge act-assist-${u.type}`}
                          >
                            {u.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  {/* 起始日 */}
                  <td className="act-td act-td-date">
                    {formatDate(act.startDate)}
                  </td>
                  {/* 結束日 */}
                  <td className="act-td act-td-date">
                    {formatDate(act.endDate)}
                  </td>
                  {/* 狀態 */}
                  <td className="act-td act-td-status">
                    <select
                      className={`act-status-select ${si.cls}`}
                      value={act.status ?? "not-started"}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        updateStatus(act, e.target.value as MeasureStatus)
                      }
                    >
                      {ALL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_INFO[s].label}
                        </option>
                      ))}
                    </select>
                  </td>
                  {/* 操作 */}
                  <td className="act-td act-td-actions">
                    <button
                      className="act-action-btn act-edit-btn"
                      title="快速編輯"
                      onClick={() => (isExpanded ? closeEdit() : openEdit(act))}
                    >
                      ✏️
                    </button>
                    <button
                      className="act-action-btn act-jump-btn"
                      title="跳至 DetailPanel"
                      onClick={() =>
                        onJumpToMeasure(
                          act.deptId,
                          act.periodId,
                          act.goalId,
                          act.strategyId,
                          act.id,
                        )
                      }
                    >
                      🔗
                    </button>
                    {!act.isReadOnly && (
                      <button
                        className="act-action-btn act-del-btn"
                        title="刪除活動"
                        onClick={() =>
                          onDeleteMeasure(
                            act.deptId,
                            act.periodId,
                            act.goalId,
                            act.strategyId,
                            act.id,
                          )
                        }
                      >
                        🗑
                      </button>
                    )}
                  </td>
                </tr>

                {/* 展開的快速編輯列 */}
                {isExpanded && editState?.activityId === act.id && (
                  <tr key={`${act.id}-edit`} className="act-expand-row">
                    <td colSpan={10}>
                      <div className="act-edit-form">
                        <div className="act-edit-grid">
                          {/* 行動計劃名稱 */}
                          <label className="act-edit-label">
                            行動計劃名稱
                            <input
                              ref={nameInputRef}
                              className="act-edit-input"
                              value={editState.rawText}
                              onChange={(e) =>
                                setEditState((s) =>
                                  s ? { ...s, rawText: e.target.value } : s,
                                )
                              }
                              placeholder="活動名稱"
                            />
                          </label>
                          {/* 主責 */}
                          <div className="act-edit-label">
                            主責
                            <OwnerPicker
                              workspace={workspace}
                              value={editState.owner}
                              selectClassName="act-edit-input"
                              onChange={(name) =>
                                setEditState((s) =>
                                  s ? { ...s, owner: name } : s,
                                )
                              }
                            />
                          </div>
                          {/* 起始日 */}
                          <label className="act-edit-label">
                            起始日
                            <input
                              className="act-edit-input"
                              type="date"
                              value={editState.startDate}
                              onChange={(e) =>
                                setEditState((s) =>
                                  s ? { ...s, startDate: e.target.value } : s,
                                )
                              }
                            />
                          </label>
                          {/* 結束日 */}
                          <label className="act-edit-label">
                            結束日
                            <input
                              className="act-edit-input"
                              type="date"
                              value={editState.endDate}
                              onChange={(e) =>
                                setEditState((s) =>
                                  s ? { ...s, endDate: e.target.value } : s,
                                )
                              }
                            />
                          </label>
                          {/* 協助單位 */}
                          <div className="act-edit-label">
                            協助單位
                            <AssistUnitPicker
                              workspace={workspace}
                              value={editState.assistUnits}
                              selectClassName="act-edit-input"
                              onChange={(units) =>
                                setEditState((s) =>
                                  s ? { ...s, assistUnits: units } : s,
                                )
                              }
                            />
                          </div>
                          {/* 活動說明 */}
                          <label className="act-edit-label act-edit-desc-label">
                            活動說明
                            <textarea
                              className="act-edit-textarea"
                              value={editState.description}
                              rows={3}
                              onChange={(e) =>
                                setEditState((s) =>
                                  s ? { ...s, description: e.target.value } : s,
                                )
                              }
                              placeholder="補充說明…"
                            />
                          </label>
                        </div>

                        {/* 關聯活動（可編輯） */}
                        <div className="act-edit-relations">
                          {/* 前置依賴 */}
                          <div className="act-rel-section">
                            <span className="act-rel-title">前置依賴：</span>
                            <div className="act-rel-chips-row">
                              {editState.prerequisites.map((id) => {
                                const target = findById(id);
                                const tsi =
                                  STATUS_INFO[
                                    target?.status ?? "not-started"
                                  ] ?? STATUS_INFO["not-started"];
                                const isDone = target?.status === "completed";
                                return (
                                  <span
                                    key={id}
                                    className="act-rel-chip act-rel-pre"
                                  >
                                    <button
                                      type="button"
                                      className="act-rel-chip-jump"
                                      title="跳轉至此活動"
                                      onClick={() =>
                                        target && onSetExpandedId(target.id)
                                      }
                                    >
                                      {target?.rawText ?? id}
                                    </button>
                                    <span
                                      className={`act-mini-status ${
                                        isDone
                                          ? "act-mini-done"
                                          : "act-mini-blocked"
                                      }`}
                                      title={tsi.label}
                                    >
                                      {isDone ? "✓" : "⚠"}
                                    </span>
                                    <button
                                      type="button"
                                      className="act-rel-chip-remove"
                                      onClick={() =>
                                        setEditState((s) =>
                                          s
                                            ? {
                                                ...s,
                                                prerequisites:
                                                  s.prerequisites.filter(
                                                    (x) => x !== id,
                                                  ),
                                              }
                                            : s,
                                        )
                                      }
                                    >
                                      ×
                                    </button>
                                  </span>
                                );
                              })}
                              <select
                                className="act-rel-add-select"
                                value={editState.addingPrereqId}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v)
                                    setEditState((s) =>
                                      s
                                        ? {
                                            ...s,
                                            prerequisites: [
                                              ...new Set([
                                                ...s.prerequisites,
                                                v,
                                              ]),
                                            ],
                                            addingPrereqId: "",
                                          }
                                        : s,
                                    );
                                }}
                              >
                                <option value="">＋ 新增前置</option>
                                {allActivities
                                  .filter(
                                    (a) =>
                                      a.id !== act.id &&
                                      !editState.prerequisites.includes(a.id),
                                  )
                                  .map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.deptName} › {a.rawText}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                          {/* 關聯活動 */}
                          <div className="act-rel-section">
                            <span className="act-rel-title">關聯活動：</span>
                            <div className="act-rel-chips-row">
                              {editState.relatedActivities.map((id) => {
                                const target = findById(id);
                                return (
                                  <span
                                    key={id}
                                    className="act-rel-chip act-rel-linked"
                                  >
                                    <button
                                      type="button"
                                      className="act-rel-chip-jump"
                                      title="跳轉至此活動"
                                      onClick={() =>
                                        target && onSetExpandedId(target.id)
                                      }
                                    >
                                      {target?.rawText ?? id}
                                    </button>
                                    <button
                                      type="button"
                                      className="act-rel-chip-remove"
                                      onClick={() =>
                                        setEditState((s) =>
                                          s
                                            ? {
                                                ...s,
                                                relatedActivities:
                                                  s.relatedActivities.filter(
                                                    (x) => x !== id,
                                                  ),
                                              }
                                            : s,
                                        )
                                      }
                                    >
                                      ×
                                    </button>
                                  </span>
                                );
                              })}
                              <select
                                className="act-rel-add-select"
                                value={editState.addingRelatedId}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (v)
                                    setEditState((s) =>
                                      s
                                        ? {
                                            ...s,
                                            relatedActivities: [
                                              ...new Set([
                                                ...s.relatedActivities,
                                                v,
                                              ]),
                                            ],
                                            addingRelatedId: "",
                                          }
                                        : s,
                                    );
                                }}
                              >
                                <option value="">＋ 新增關聯</option>
                                {allActivities
                                  .filter(
                                    (a) =>
                                      a.id !== act.id &&
                                      !editState.relatedActivities.includes(
                                        a.id,
                                      ),
                                  )
                                  .map((a) => (
                                    <option key={a.id} value={a.id}>
                                      {a.deptName} › {a.rawText}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        <div className="act-edit-actions">
                          <button
                            className="act-edit-save"
                            onClick={() => commitEdit(act)}
                          >
                            儲存
                          </button>
                          <button
                            className="act-edit-cancel"
                            onClick={closeEdit}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
