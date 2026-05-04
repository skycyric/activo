import { useEffect, useRef, useState } from "react";
import type {
  MeasureStatus,
  WorkspaceData,
  DeptActivity,
} from "../../schemas/ogsm";
import type { ActivityWithContext } from "../ActivityPage";
import { Tooltip } from "../ui/tooltip";

type SortField = "rawText" | "deptName" | "owner" | "startDate" | "status";
type SortDir = "asc" | "desc";
type ColumnId =
  | "rawText"
  | "description"
  | "frameworks"
  | "period"
  | "goal"
  | "strategy"
  | "deptName"
  | "team"
  | "owner"
  | "assistUnits"
  | "startDate"
  | "endDate"
  | "status"
  | "tags"
  | "actions";

type ColumnConfig = {
  id: ColumnId;
  label: string;
  width: number;
  minWidth: number;
  sortable?: boolean;
  sortField?: SortField;
  className?: string;
};

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

const FRAMEWORK_LABELS: Record<string, string> = {
  ogsm: "OGSM目標體系",
  standalone: "其他（自由節點）",
};

const COLUMN_CONFIG: ColumnConfig[] = [
  {
    id: "rawText",
    label: "行動計劃名稱",
    width: 280,
    minWidth: 72,
    sortable: true,
    sortField: "rawText",
  },
  { id: "description", label: "活動說明", width: 220, minWidth: 72 },
  { id: "frameworks", label: "模組", width: 180, minWidth: 68 },
  { id: "period", label: "期間", width: 140, minWidth: 68 },
  { id: "goal", label: "Goal", width: 240, minWidth: 72 },
  { id: "strategy", label: "Strategy", width: 260, minWidth: 72 },
  {
    id: "deptName",
    label: "部門",
    width: 100,
    minWidth: 68,
    sortable: true,
    sortField: "deptName",
  },
  { id: "team", label: "團隊", width: 120, minWidth: 68 },
  {
    id: "owner",
    label: "主責",
    width: 110,
    minWidth: 68,
    sortable: true,
    sortField: "owner",
  },
  { id: "assistUnits", label: "協助單位", width: 160, minWidth: 72 },
  {
    id: "startDate",
    label: "起始日",
    width: 110,
    minWidth: 78,
    sortable: true,
    sortField: "startDate",
  },
  { id: "endDate", label: "結束日", width: 110, minWidth: 78 },
  {
    id: "status",
    label: "狀態",
    width: 120,
    minWidth: 78,
    sortable: true,
    sortField: "status",
  },
  { id: "tags", label: "標籤", width: 180, minWidth: 80 },
  {
    id: "actions",
    label: "操作",
    width: 80,
    minWidth: 80,
    className: "act-th-actions",
  },
];

const DEFAULT_COLUMN_WIDTHS = COLUMN_CONFIG.reduce<Record<ColumnId, number>>(
  (acc, column) => {
    acc[column.id] = column.width;
    return acc;
  },
  {} as Record<ColumnId, number>,
);

const REQUIRED_COLUMNS: ColumnId[] = ["rawText", "status", "actions"];
const COLUMN_VISIBILITY_STORAGE_KEY = "activity_table_visible_columns";

function buildDefaultVisibility(): Record<ColumnId, boolean> {
  return COLUMN_CONFIG.reduce<Record<ColumnId, boolean>>(
    (acc, column) => {
      acc[column.id] = true;
      return acc;
    },
    {} as Record<ColumnId, boolean>,
  );
}

interface Props {
  activities: ActivityWithContext[];
  allActivities: ActivityWithContext[];
  workspace: WorkspaceData;
  expandedId: string | null;
  ownerFilter: string;
  onUpdateActivity: (deptId: string, activity: DeptActivity) => void;
  onDeleteActivity: (deptId: string, activityId: string) => void;
  onJumpToActivity: (deptId: string, activityId: string) => void;
  onJumpToOgsm?: (activity: ActivityWithContext) => void;
}

function formatDate(d: string | undefined): string {
  if (!d) return "";
  return d.replace(/-/g, "/");
}

function formatFrameworks(activity: ActivityWithContext): string {
  const frameworks = activity.frameworks ?? [];
  const normalized =
    frameworks.length > 0
      ? frameworks
      : (activity.dashboardLinks ?? []).some((link) => link.type === "ogsm") ||
          activity.strategyId
        ? ["ogsm"]
        : [];

  if (normalized.length === 0) return "未分類";

  return Array.from(new Set(normalized))
    .map((value) => FRAMEWORK_LABELS[value] ?? value)
    .join("、");
}

export default function ActivityTable({
  activities,
  allActivities,
  workspace,
  expandedId,
  onUpdateActivity,
  onDeleteActivity,
  onJumpToActivity,
  onJumpToOgsm,
}: Props) {
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const [sort, setSort] = useState<{ field: SortField; dir: SortDir }>({
    field: "startDate",
    dir: "asc",
  });
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const [hasManualResize, setHasManualResize] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState<
    Record<ColumnId, boolean>
  >(() => {
    const defaults = buildDefaultVisibility();
    try {
      const raw = localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw) as Partial<Record<ColumnId, boolean>>;
      for (const c of COLUMN_CONFIG) {
        if (typeof parsed[c.id] === "boolean") defaults[c.id] = parsed[c.id]!;
      }
      for (const required of REQUIRED_COLUMNS) defaults[required] = true;
      return defaults;
    } catch {
      return defaults;
    }
  });
  const resizeStateRef = useRef<{
    columnId: ColumnId;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) return;

      const column = COLUMN_CONFIG.find(
        (item) => item.id === resizeState.columnId,
      );
      if (!column) return;

      const nextWidth = Math.max(
        column.minWidth,
        resizeState.startWidth + (event.clientX - resizeState.startX),
      );

      setColumnWidths((prev) => {
        if (prev[resizeState.columnId] === nextWidth) return prev;
        return {
          ...prev,
          [resizeState.columnId]: nextWidth,
        };
      });
    };

    const stopResize = () => {
      if (!resizeStateRef.current) return;
      resizeStateRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      stopResize();
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        COLUMN_VISIBILITY_STORAGE_KEY,
        JSON.stringify(columnVisibility),
      );
    } catch {
      // best-effort
    }
  }, [columnVisibility]);

  useEffect(() => {
    if (hasManualResize) return;

    const fitToContainer = () => {
      const wrap = tableWrapRef.current;
      if (!wrap) return;

      const visible = COLUMN_CONFIG.filter((c) => columnVisibility[c.id]);
      if (visible.length === 0) return;

      const availableWidth = Math.max(0, wrap.clientWidth - 2);
      if (availableWidth <= 0) return;

      const baseWidth = visible.reduce((sum, c) => sum + c.width, 0);
      const minWidth = visible.reduce((sum, c) => sum + c.minWidth, 0);
      const targetWidth = Math.max(availableWidth, minWidth);
      const scale = baseWidth > 0 ? targetWidth / baseWidth : 1;

      setColumnWidths((prev) => {
        const next = { ...prev };
        for (const column of visible) {
          next[column.id] = Math.max(
            column.minWidth,
            Math.round(column.width * scale),
          );
        }
        return next;
      });
    };

    fitToContainer();
    window.addEventListener("resize", fitToContainer);
    return () => window.removeEventListener("resize", fitToContainer);
  }, [columnVisibility, hasManualResize]);

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
  const visibleColumns = COLUMN_CONFIG.filter((c) => columnVisibility[c.id]);
  const tableWidth = visibleColumns.reduce(
    (sum, column) => sum + columnWidths[column.id],
    0,
  );

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
        {sort.dir === "asc" ? "▲" : "▼"}
      </span>
    );
  };

  const startResize = (event: React.PointerEvent, columnId: ColumnId) => {
    event.preventDefault();
    event.stopPropagation();
    setHasManualResize(true);
    resizeStateRef.current = {
      columnId,
      startX: event.clientX,
      startWidth: columnWidths[columnId],
    };
  };

  const toggleColumnVisibility = (columnId: ColumnId) => {
    if (REQUIRED_COLUMNS.includes(columnId)) return;
    setColumnVisibility((prev) => ({
      ...prev,
      [columnId]: !prev[columnId],
    }));
  };

  const resetColumns = () => {
    setColumnVisibility(buildDefaultVisibility());
    setHasManualResize(false);
  };

  if (activities.length === 0) {
    return (
      <div className="act-empty">
        <div className="act-empty-icon"></div>
        <div className="act-empty-text">沒有符合條件的活動</div>
      </div>
    );
  }

  return (
    <div className="act-table-wrap" ref={tableWrapRef}>
      <div className="act-table-toolbar">
        <details className="act-colvis-dropdown">
          <summary className="act-colvis-trigger">欄位顯示</summary>
          <div className="act-colvis-menu">
            {COLUMN_CONFIG.map((column) => {
              const isRequired = REQUIRED_COLUMNS.includes(column.id);
              return (
                <label key={column.id} className="act-colvis-item">
                  <input
                    type="checkbox"
                    checked={columnVisibility[column.id]}
                    disabled={isRequired}
                    onChange={() => toggleColumnVisibility(column.id)}
                  />
                  <span>
                    {column.label}
                    {isRequired ? "（固定）" : ""}
                  </span>
                </label>
              );
            })}
            <button
              type="button"
              className="act-colvis-reset"
              onClick={resetColumns}
            >
              還原預設欄位與寬度
            </button>
          </div>
        </details>
      </div>
      <table
        className="act-table"
        style={{ width: `${tableWidth}px`, minWidth: "100%" }}
      >
        <colgroup>
          {visibleColumns.map((column) => (
            <col
              key={column.id}
              style={{ width: `${columnWidths[column.id]}px` }}
            />
          ))}
        </colgroup>
        <thead>
          <tr>
            {visibleColumns.map((column) => (
              <th
                key={column.id}
                className={`act-th${column.sortable ? " sortable" : ""}${column.className ? ` ${column.className}` : ""}`}
                onClick={
                  column.sortable && column.sortField
                    ? () => toggleSort(column.sortField!)
                    : undefined
                }
              >
                <div className="act-th-content">
                  <span className="act-th-label">{column.label}</span>
                  {column.sortable && column.sortField ? (
                    <SortIcon field={column.sortField} />
                  ) : null}
                </div>
                {column.id !== "actions" ? (
                  <span
                    className="act-col-resizer"
                    onPointerDown={(event) => startResize(event, column.id)}
                  />
                ) : null}
              </th>
            ))}
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
                onClick={() => onJumpToActivity(act.deptId, act.id)}
                style={{ cursor: "pointer" }}
              >
                {columnVisibility.rawText && (
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
                )}
                {columnVisibility.description && (
                  <td className="act-td act-td-desc">
                    <span className="act-desc-text" title={act.description}>
                      {act.description || ""}
                    </span>
                  </td>
                )}
                {columnVisibility.frameworks && (
                  <td className="act-td act-td-meta">
                    <span
                      className="act-meta-text"
                      title={formatFrameworks(act)}
                    >
                      {formatFrameworks(act)}
                    </span>
                  </td>
                )}
                {columnVisibility.period && (
                  <td className="act-td act-td-meta">
                    <span className="act-meta-text" title={act.periodLabel}>
                      {act.periodLabel || "-"}
                    </span>
                  </td>
                )}
                {columnVisibility.goal && (
                  <td className="act-td act-td-meta">
                    <span className="act-meta-text" title={act.goalTitle}>
                      {act.goalTitle || "-"}
                    </span>
                  </td>
                )}
                {columnVisibility.strategy && (
                  <td className="act-td act-td-meta">
                    <span className="act-meta-text" title={act.strategyTitle}>
                      {act.strategyTitle || "-"}
                    </span>
                  </td>
                )}
                {columnVisibility.deptName && (
                  <td className="act-td">
                    <span className="act-dept-badge">{act.deptName}</span>
                  </td>
                )}
                {columnVisibility.team && (
                  <td className="act-td">
                    {lookupTeam(act.owner) !== "" ? (
                      <span className="act-team-badge">
                        {lookupTeam(act.owner)}
                      </span>
                    ) : (
                      ""
                    )}
                  </td>
                )}
                {columnVisibility.owner && (
                  <td className="act-td">
                    {act.owner ? (
                      <span className="act-owner-badge">{act.owner}</span>
                    ) : (
                      ""
                    )}
                  </td>
                )}
                {columnVisibility.assistUnits && (
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
                )}
                {columnVisibility.startDate && (
                  <td className="act-td act-td-date">
                    {formatDate(act.startDate)}
                  </td>
                )}
                {columnVisibility.endDate && (
                  <td className="act-td act-td-date">
                    {formatDate(act.endDate)}
                  </td>
                )}
                {columnVisibility.status && (
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
                )}
                {columnVisibility.tags && (
                  <td className="act-td act-td-tags">
                    {act.tags && act.tags.length > 0 ? (
                      <div className="act-card-tags">
                        {act.tags.map((tag) => (
                          <span key={tag} className="act-card-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : (
                      ""
                    )}
                  </td>
                )}
                {columnVisibility.actions && (
                  <td className="act-td act-td-actions">
                    {(() => {
                      const canJumpToOgsm = Boolean(
                        act.goalId && act.strategyId,
                      );
                      return (
                        <>
                          <Tooltip
                            content={
                              canJumpToOgsm
                                ? "跳到 OGSM 策略詳情"
                                : "此活動尚未連結到 OGSM"
                            }
                          >
                            <button
                              className="act-action-btn act-jump-btn"
                              title={
                                canJumpToOgsm
                                  ? "跳到 OGSM 策略詳情"
                                  : "此活動尚未連結到 OGSM"
                              }
                              disabled={!canJumpToOgsm || !onJumpToOgsm}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!canJumpToOgsm || !onJumpToOgsm) return;
                                onJumpToOgsm(act);
                              }}
                            >
                              🔗
                            </button>
                          </Tooltip>
                          {!act.isReadOnly && (
                            <Tooltip content="刪除活動">
                              <button
                                className="act-action-btn act-del-btn"
                                title="刪除活動"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteActivity(act.deptId, act.id);
                                }}
                              >
                                🗑
                              </button>
                            </Tooltip>
                          )}
                        </>
                      );
                    })()}
                  </td>
                )}
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
