import { useMemo } from "react";
import type { WorkspaceData, DeptActivity } from "../schemas/ogsm";

// ── App cards definition ──────────────────────────────────────────────────────

interface AppCard {
  id: string;
  icon: string;
  title: string;
  desc: string;
}

const APP_CARDS: AppCard[] = [
  { id: "ogsm", icon: "📊", title: "OGSM 儀表板", desc: "目標策略管理" },
  { id: "activities", icon: "📋", title: "活動管理", desc: "跨部門活動追蹤" },
  { id: "settings", icon: "⚙️", title: "部門設定", desc: "成員與期間設定" },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  workspace: WorkspaceData;
  activeDeptId: string;
  activePeriodLabel: string;
  readOnlyDeptIds?: string[];
  onSwitchToActivities: (deptId?: string) => void;
  onSwitchToOgsm: () => void;
  onSwitchToDeptSettings: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getAllActivitiesForDept(
  dept: WorkspaceData["departments"][number],
): DeptActivity[] {
  if (dept.activities && dept.activities.length > 0) return dept.activities;
  const result: DeptActivity[] = [];
  for (const period of dept.periods)
    for (const goal of period.ogsm.goals)
      for (const strategy of goal.strategies)
        for (const m of strategy.measures)
          result.push(m as unknown as DeptActivity);
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
  activeDeptId,
  activePeriodLabel,
  onSwitchToActivities,
  onSwitchToOgsm,
  onSwitchToDeptSettings,
}: Props) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const weekEnd = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return d;
  }, [today]);

  const activeDept =
    workspace.departments.find((d) => d.id === activeDeptId) ??
    workspace.departments[0];

  // ── Global stats (all depts) ──────────────────────────────────────────────
  const stats = useMemo(() => {
    let inProgress = 0, dueSoon = 0, overdue = 0, completed = 0;
    for (const dept of workspace.departments) {
      for (const a of getAllActivitiesForDept(dept)) {
        const end = parseDate(a.endDate);
        if (a.status === "completed") completed++;
        else if (a.status === "in-progress") inProgress++;
        if (end && end < today && a.status !== "completed") overdue++;
        if (end && end >= today && end <= weekEnd && a.status !== "completed")
          dueSoon++;
      }
    }
    return { inProgress, dueSoon, overdue, completed };
  }, [workspace, today, weekEnd]);

  // ── Read persisted owner filter (recent list only) ────────────────────────
  const activeOwnerFilter = useMemo(() => {
    try { return localStorage.getItem("activo_filter_owner") ?? ""; }
    catch { return ""; }
  }, []);

  // ── Recent activities ─────────────────────────────────────────────────────
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
      for (const a of getAllActivitiesForDept(dept)) {
        const end = parseDate(a.endDate);
        if (!end) continue;
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

  const handleCardClick = (id: string) => {
    if (id === "ogsm") onSwitchToOgsm();
    else if (id === "activities") onSwitchToActivities();
    else if (id === "settings") onSwitchToDeptSettings();
  };

  const fmtDate = (d: Date) =>
    `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;

  return (
    <main className="home-page">
      {/* ── 歡迎區 ── */}
      <div className="home-welcome">
        <div className="home-welcome-dept">
          {activeDept?.name ?? workspace.departments[0]?.name ?? "我的工作區"}
        </div>
        <div className="home-welcome-period">{activePeriodLabel}</div>
      </div>

      {/* ── App icon grid ── */}
      <div className="home-app-grid">
        {APP_CARDS.map((card) => (
          <button
            key={card.id}
            className="home-app-card"
            onClick={() => handleCardClick(card.id)}
          >
            <span className="home-app-icon">{card.icon}</span>
            <span className="home-app-title">{card.title}</span>
            <span className="home-app-desc">{card.desc}</span>
          </button>
        ))}
      </div>

      {/* ── 快速統計列 ── */}
      <div className="home-stat-strip">
        <StatPill icon="▶" label="進行中" value={stats.inProgress} color="var(--accent)" />
        <StatPill icon="⏳" label="本週到期" value={stats.dueSoon} color="#f59e0b" />
        <StatPill icon="⚠" label="逾期" value={stats.overdue} color="#ef4444" />
        <StatPill icon="✓" label="已完成" value={stats.completed} color="#22c55e" />
      </div>

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
                  <span className="home-recent-date">{fmtDate(item.endDate)}</span>
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

// ── StatPill subcomponent ─────────────────────────────────────────────────────

function StatPill({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="home-stat-pill">
      <span className="home-stat-pill-icon" style={{ color }}>{icon}</span>
      <span className="home-stat-pill-value" style={{ color }}>{value}</span>
      <span className="home-stat-pill-label">{label}</span>
    </div>
  );
}

