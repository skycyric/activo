import { useState } from "react";
import type {
  MeasureStatus,
  WorkspaceData,
  DeptActivity,
} from "../../schemas/ogsm";
import type { ActivityWithContext } from "../ActivityPage";

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

interface Props {
  activities: ActivityWithContext[];
  allActivities: ActivityWithContext[];
  workspace: WorkspaceData;
  expandedId: string | null;
  onSetExpandedId: (id: string | null) => void;
  ownerFilter: string;
  onUpdateActivity: (deptId: string, activity: DeptActivity) => void;
  onDeleteActivity: (deptId: string, activityId: string) => void;
  onJumpToActivity: (deptId: string, activityId: string) => void;
}

function formatDate(d: string | undefined): string {
  if (!d) return "";
  return d.replace(/-/g, "/");
}

export default function ActivityTable({
  activities,
  allActivities,
  workspace,
  expandedId,
  onSetExpandedId,
  onUpdateActivity,
  onDeleteActivity,
  onJumpToActivity,
}: Props) {
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: "startDate",
    dir: "asc",
  });

  const lookupTeam = (owner: string | undefined): string => {
    if (!owner) return "";
    for (const t of workspace.teams ?? []) {
      if (t.members.some((m) => m.name === owner)) return t.name;
    }
    return "";
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
    if (act.isReadOnly) return;
    onUpdateActivity(act.deptId, {
      ...act,
      status,
      updatedAt: new Date().toISOString(),
    });
  };

  const findById = (id: string) => allActivities.find((a) => a.id === id);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort.field !== field) return <span className="act-sort-icon"></span>;
    return (
      <span className="act-sort-icon active">
        {sort.dir === "asc" ? "" : ""}
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
        <div className="act-empty-icon"></div>
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
              <tr
                key={act.id}
                className={`act-row${isExpanded ? " expanded" : ""}`}
              >
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
                    ></span>
                  )}
                  {relCount > 0 && (
                    <span className="act-rel-badge" title="有關聯活動">
                      {relCount}
                    </span>
                  )}
                </td>
                <td className="act-td act-td-desc">
                  <span className="act-desc-text" title={act.description}>
                    {act.description || ""}
                  </span>
                </td>
                <td className="act-td">
                  <span className="act-dept-badge">{act.deptName}</span>
                </td>
                <td className="act-td">
                  {lookupTeam(act.owner) !== "" ? (
                    <span className="act-team-badge">
                      {lookupTeam(act.owner)}
                    </span>
                  ) : (
                    ""
                  )}
                </td>
                <td className="act-td">
                  {act.owner ? (
                    <span className="act-owner-badge">{act.owner}</span>
                  ) : (
                    ""
                  )}
                </td>
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
                    ""
                  )}
                </td>
                <td className="act-td act-td-date">
                  {formatDate(act.startDate)}
                </td>
                <td className="act-td act-td-date">
                  {formatDate(act.endDate)}
                </td>
                <td className="act-td act-td-status">
                  <select
                    className={`act-status-select ${si.cls}`}
                    value={act.status ?? "not-started"}
                    disabled={act.isReadOnly}
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
                <td className="act-td act-td-actions">
                  <button
                    className="act-action-btn act-edit-btn"
                    title="開啟詳情面板"
                    onClick={() => onSetExpandedId(isExpanded ? null : act.id)}
                  >
                    ✏️
                  </button>
                  <button
                    className="act-action-btn act-jump-btn"
                    title="跳至 OGSM 策略面板"
                    onClick={() => onJumpToActivity(act.deptId, act.id)}
                  >
                    🔗
                  </button>
                  {!act.isReadOnly && (
                    <button
                      className="act-action-btn act-del-btn"
                      title="刪除活動"
                      onClick={() => onDeleteActivity(act.deptId, act.id)}
                    >
                      🗑
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {sorted.map((act) => {
        if (expandedId !== act.id) return null;
        const prereqs = act.prerequisites ?? [];
        const related = act.relatedActivities ?? [];
        if (prereqs.length === 0 && related.length === 0) return null;
        return (
          <div key={`${act.id}-rel`} className="act-rel-readonly-bar">
            {prereqs.length > 0 && (
              <span className="act-rel-readonly-section">
                <span className="act-rel-title">前置依賴：</span>
                {prereqs.map((id) => {
                  const t = findById(id);
                  const done = t?.status === "completed";
                  return (
                    <span
                      key={id}
                      className={`act-rel-chip act-rel-pre${done ? " act-rel-done" : ""}`}
                    >
                      {t?.rawText ?? id}
                      <span className="act-mini-status">
                        {done ? " " : " "}
                      </span>
                    </span>
                  );
                })}
              </span>
            )}
            {related.length > 0 && (
              <span className="act-rel-readonly-section">
                <span className="act-rel-title">關聯活動：</span>
                {related.map((id) => {
                  const t = findById(id);
                  return (
                    <span key={id} className="act-rel-chip act-rel-linked">
                      {t?.rawText ?? id}
                    </span>
                  );
                })}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
