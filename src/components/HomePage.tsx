import { useMemo } from "react";
import type { WorkspaceData, DeptActivity } from "../schemas/ogsm";

interface Props {
  workspace: WorkspaceData;
  readOnlyDeptIds?: string[];
  onSwitchToActivities: (deptId?: string) => void;
  onSwitchToOgsm: (deptId?: string) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAllActivitiesForDept(
  dept: WorkspaceData["departments"][number],
): DeptActivity[] {
  // Primary: dept.activities[]
  if (dept.activities && dept.activities.length > 0) {
    return dept.activities;
  }
  // Fallback: flatten from OGSM tree
  const result: DeptActivity[] = [];
  for (const period of dept.periods) {
    for (const goal of period.ogsm.goals) {
      for (const strategy of goal.strategies) {
        for (const m of strategy.measures) {
          // Cast Measure to DeptActivity — they share the same base schema
          result.push(m as unknown as DeptActivity);
        }
      }
    }
  }
  return result;
}

function parseDate(d?: string): Date | null {
  if (!d) return null;
  const parsed = new Date(d);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function HomePage({
  workspace,
  readOnlyDeptIds,
  onSwitchToActivities,
  onSwitchToOgsm,
}: Props) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const weekEnd = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d;
  }, [today]);

  // ── Per-dept metrics ──────────────────────────────────────────────────────
  const deptRows = useMemo(() => {
    return workspace.departments.map((dept) => {
      const activities = getAllActivitiesForDept(dept);
      const total = activities.length;
      const completed = activities.filter(
        (a) => a.status === "completed",
      ).length;
      const inProgress = activities.filter(
        (a) => a.status === "in-progress",
      ).length;
      const overdue = activities.filter((a) => {
        const end = parseDate(a.endDate);
        return end && end < today && a.status !== "completed";
      }).length;
      const dueSoon = activities.filter((a) => {
        const end = parseDate(a.endDate);
        return (
          end && end >= today && end <= weekEnd && a.status !== "completed"
        );
      }).length;

      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      const isReadOnly = readOnlyDeptIds?.includes(dept.id) ?? false;

      return {
        dept,
        total,
        completed,
        inProgress,
        overdue,
        dueSoon,
        pct,
        isReadOnly,
      };
    });
  }, [workspace, readOnlyDeptIds, today, weekEnd]);

  // ── Global stat totals ────────────────────────────────────────────────────
  const stats = useMemo(() => {
    let totalInProgress = 0;
    let totalDueSoon = 0;
    let totalOverdue = 0;
    let totalCompleted = 0;

    for (const row of deptRows) {
      totalInProgress += row.inProgress;
      totalDueSoon += row.dueSoon;
      totalOverdue += row.overdue;
      totalCompleted += row.completed;
    }

    return { totalInProgress, totalDueSoon, totalOverdue, totalCompleted };
  }, [deptRows]);

  // ── Read persisted owner filter (for recent list only; stats always show all) ──
  const activeOwnerFilter = useMemo(() => {
    try {
      return localStorage.getItem("activo_filter_owner") ?? "";
    } catch {
      return "";
    }
  }, []);

  // ── Recent activities (max 8, sorted by endDate asc) ─────────────────────
  interface RecentItem {
    activity: DeptActivity;
    deptId: string;
    deptName: string;
    endDate: Date;
    isOverdue: boolean;
    isDueSoon: boolean;
  }

  const recentActivities = useMemo((): RecentItem[] => {
    const items: RecentItem[] = [];
    for (const dept of workspace.departments) {
      const activities = getAllActivitiesForDept(dept);
      for (const a of activities) {
        const end = parseDate(a.endDate);
        if (!end) continue;
        // Apply owner filter: check a.owner and a.owners[]
        if (activeOwnerFilter) {
          const ownerList: string[] = [
            a.owner ?? "",
            ...((a as { owners?: string[] }).owners ?? []),
          ];
          if (!ownerList.includes(activeOwnerFilter)) continue;
        }
        items.push({
          activity: a,
          deptId: dept.id,
          deptName: dept.name,
          endDate: end,
          isOverdue: end < today && a.status !== "completed",
          isDueSoon: end >= today && end <= weekEnd && a.status !== "completed",
        });
      }
    }
    items.sort((a, b) => a.endDate.getTime() - b.endDate.getTime());
    return items.slice(0, 8);
  }, [workspace, today, weekEnd, activeOwnerFilter]);

  // ── Render ────────────────────────────────────────────────────────────────

  const fmtDate = (d: Date) =>
    `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;

  return (
    <main className="home-page">
      {/* ── 頁首 ── */}
      <div className="home-header">
        <h1 className="home-title">總覽</h1>
        <p className="home-subtitle">
          {workspace.departments.length} 個部門・
          {deptRows.reduce((s, r) => s + r.total, 0)} 個活動
        </p>
      </div>

      {/* ── 統計卡片列 ── */}
      <div className="home-stat-row">
        <StatCard
          label="進行中"
          value={stats.totalInProgress}
          color="var(--accent)"
          icon="▶"
        />
        <StatCard
          label="本週到期"
          value={stats.totalDueSoon}
          color="#f59e0b"
          icon="⏳"
        />
        <StatCard
          label="逾期"
          value={stats.totalOverdue}
          color="#ef4444"
          icon="⚠"
        />
        <StatCard
          label="已完成"
          value={stats.totalCompleted}
          color="#22c55e"
          icon="✓"
        />
      </div>

      {/* ── 部門活動狀態 ── */}
      <section className="home-section">
        <h2 className="home-section-title">部門活動狀態</h2>
        <div className="home-dept-list">
          {deptRows.map((row) => (
            <div
              key={row.dept.id}
              className="home-dept-row"
              onClick={() => onSwitchToActivities(row.dept.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  onSwitchToActivities(row.dept.id);
              }}
            >
              <div className="home-dept-info">
                <span className="home-dept-name">{row.dept.name}</span>
                {row.isReadOnly && (
                  <span className="home-dept-badge home-dept-badge--readonly">
                    唯讀
                  </span>
                )}
                {row.overdue > 0 && (
                  <span className="home-dept-badge home-dept-badge--overdue">
                    {row.overdue} 逾期
                  </span>
                )}
              </div>
              <div className="home-dept-progress-wrap">
                <div className="home-dept-progress-bar">
                  <div
                    className="home-dept-progress-fill"
                    style={{ width: `${row.pct}%` }}
                  />
                </div>
                <span className="home-dept-pct">{row.pct}%</span>
              </div>
              <span className="home-dept-count">{row.total} 個活動</span>
              <span className="home-dept-arrow">›</span>
            </div>
          ))}
          {workspace.departments.length === 0 && (
            <p className="home-empty">尚無部門資料</p>
          )}
        </div>
      </section>

      {/* ── 近期活動 ── */}
      {recentActivities.length > 0 && (
        <section className="home-section">
        <h2 className="home-section-title">
          近期活動（依到期日排序）
          {activeOwnerFilter && (
            <span className="home-owner-filter-note">
              · 篩選：{activeOwnerFilter}
            </span>
          )}
        </h2>
          <div className="home-recent-list">
            {recentActivities.map((item) => {
              let statusIcon = "·";
              let rowClass = "home-recent-row";
              if (item.activity.status === "completed") {
                statusIcon = "✓";
                rowClass += " home-recent-row--done";
              } else if (item.isOverdue) {
                statusIcon = "⚠";
                rowClass += " home-recent-row--overdue";
              } else if (item.isDueSoon) {
                statusIcon = "⏳";
                rowClass += " home-recent-row--soon";
              }

              const owners: string[] =
                (item.activity as DeptActivity & { owners?: string[] })
                  .owners ?? [];
              const ownerLabel =
                owners.length > 0
                  ? owners.slice(0, 2).join("・") +
                    (owners.length > 2 ? ` +${owners.length - 2}` : "")
                  : item.activity.owner || "";

              return (
                <div
                  key={`${item.deptId}-${item.activity.id}`}
                  className={rowClass}
                  onClick={() => onSwitchToActivities(item.deptId)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ")
                      onSwitchToActivities(item.deptId);
                  }}
                >
                  <span className="home-recent-icon">{statusIcon}</span>
                  <span className="home-recent-date">
                    {fmtDate(item.endDate)}
                  </span>
                  <span className="home-recent-title">
                    {item.activity.rawText || `活動 ${item.activity.id}`}
                  </span>
                  <span className="home-recent-dept">{item.deptName}</span>
                  {ownerLabel && (
                    <span className="home-recent-owner">{ownerLabel}</span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}

// ── StatCard subcomponent ─────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: string;
}) {
  return (
    <div className="home-stat-card">
      <span className="home-stat-icon" style={{ color }}>
        {icon}
      </span>
      <span className="home-stat-value" style={{ color }}>
        {value}
      </span>
      <span className="home-stat-label">{label}</span>
    </div>
  );
}
