import { useMemo, useState } from "react";
import type { ActivityWithContext } from "../ActivityPage";

interface Props {
  activities: ActivityWithContext[];
  onJumpToActivity: (deptId: string, activityId: string) => void;
}

interface CalEntry {
  date: string; // YYYY-MM-DD
  activityId: string;
  deptId: string;
  activityName: string;
  description: string;
  completed: boolean;
  activityStatus: string;
  source: "activity" | "plan";
  isEventStart: boolean;
  isEventEnd: boolean;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const STATUS_DOT: Record<string, string> = {
  "not-started": "#94a3b8",
  attention: "#f59e0b",
  "in-progress": "#3b82f6",
  completed: "#22c55e",
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export default function ActivityCalendar({
  activities,
  onJumpToActivity,
}: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  // Collect calendar entries from both plan items and activity date range.
  const entries = useMemo<CalEntry[]>(() => {
    const result: CalEntry[] = [];
    for (const act of activities) {
      if (act.showActivityInCalendar && act.startDate) {
        const startStr = act.startDate;
        const endStr = act.endDate ?? act.startDate;
        const start = new Date(startStr + "T00:00:00");
        const end = new Date(endStr + "T00:00:00");
        const cap = new Date(start.getTime() + 365 * 86400000);
        const safeEnd = end > cap ? cap : end;
        const cur = new Date(start);
        while (cur <= safeEnd) {
          const dateStr = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
          result.push({
            activityId: act.id,
            deptId: act.deptId,
            activityName: act.rawText,
            description: act.description ?? "",
            completed: act.status === "completed",
            activityStatus: act.status ?? "not-started",
            source: "activity",
            date: dateStr,
            isEventStart: dateStr === startStr,
            isEventEnd: dateStr === endStr,
          });
          cur.setDate(cur.getDate() + 1);
        }
      }

      for (const item of act.planItems ?? []) {
        const base = {
          activityId: act.id,
          deptId: act.deptId,
          activityName: act.rawText,
          description: item.description,
          completed: item.completed,
          activityStatus: act.status ?? "not-started",
          source: "plan" as const,
        };

        // event-range entries (one per day from eventStartDate to eventEndDate)
        if (item.showInCalendar && item.eventStartDate) {
          const startStr = item.eventStartDate;
          const endStr = item.eventEndDate ?? item.eventStartDate;
          const start = new Date(startStr + "T00:00:00");
          const end = new Date(endStr + "T00:00:00");
          // safety cap: max 180-day range
          const cap = new Date(start.getTime() + 180 * 86400000);
          const safeEnd = end > cap ? cap : end;
          const cur = new Date(start);
          while (cur <= safeEnd) {
            const dateStr = `${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}-${pad2(cur.getDate())}`;
            result.push({
              ...base,
              date: dateStr,
              isEventStart: dateStr === startStr,
              isEventEnd: dateStr === endStr,
            });
            cur.setDate(cur.getDate() + 1);
          }
        }
      }
    }
    result.sort((a, b) => a.date.localeCompare(b.date));
    return result;
  }, [activities]);

  // Group by date string
  const byDate = useMemo(() => {
    const m = new Map<string, CalEntry[]>();
    for (const e of entries) {
      const list = m.get(e.date) ?? [];
      list.push(e);
      m.set(e.date, list);
    }
    return m;
  }, [entries]);

  const goMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const monthPrefix = `${pad2(year)}-${pad2(month + 1)}`;
  const todayStr = `${pad2(today.getFullYear())}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = `${year} 年 ${month + 1} 月`;

  const thisMonthCount = entries.filter((e) =>
    e.date.startsWith(monthPrefix),
  ).length;

  return (
    <div className="act-cal-outer">
      {/* Nav bar */}
      <div className="act-cal-nav">
        <button className="act-cal-nav-btn" onClick={() => goMonth(-1)}>
          ◀
        </button>
        <span className="act-cal-month-label">{monthLabel}</span>
        <button className="act-cal-nav-btn" onClick={() => goMonth(1)}>
          ▶
        </button>
        <button
          className="act-cal-nav-btn act-cal-today-btn"
          onClick={() => {
            setYear(today.getFullYear());
            setMonth(today.getMonth());
          }}
        >
          今天
        </button>
        <span className="act-cal-count">
          {thisMonthCount > 0 ? `本月 ${thisMonthCount} 個日程` : "本月無日程"}
        </span>
        {entries.length === 0 && (
          <span className="act-cal-hint">
            尚無項目。可在活動基本資料勾選「📅
            活動期間」，或在行動計畫設定執行期間後勾選「📅 月曆」。
          </span>
        )}
      </div>

      {/* Month grid */}
      <div className="act-cal-grid-wrap">
        {/* Weekday header */}
        <div className="act-cal-week-header">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className={`act-cal-weekday${d === "日" || d === "六" ? " weekend" : ""}`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="act-cal-grid">
          {/* leading empty cells */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => (
            <div key={`e${i}`} className="act-cal-cell act-cal-cell-empty" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${monthPrefix}-${pad2(day)}`;
            const items = byDate.get(dateStr) ?? [];
            const isToday = dateStr === todayStr;
            const isWeekend = [0, 6].includes(
              new Date(year, month, day).getDay(),
            );
            return (
              <div
                key={dateStr}
                className={[
                  "act-cal-cell",
                  isToday ? "act-cal-today" : "",
                  isWeekend ? "act-cal-weekend" : "",
                  items.length > 0 ? "act-cal-has-items" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <span className={`act-cal-day-num${isToday ? " today" : ""}`}>
                  {day}
                </span>
                <div className="act-cal-items">
                  {items.map((entry, idx) => {
                    const dotColor = entry.completed
                      ? STATUS_DOT.completed
                      : (STATUS_DOT[entry.activityStatus] ??
                        STATUS_DOT["not-started"]);
                    const eventMark = entry.isEventStart
                      ? "▶"
                      : entry.isEventEnd
                        ? "◼"
                        : "─";
                    const sourceLabel =
                      entry.source === "activity" ? "活動期間" : "執行期間";
                    return (
                      <button
                        key={`${entry.activityId}-${dateStr}-${idx}`}
                        className={[
                          "act-cal-item",
                          "act-cal-item-event",
                          entry.completed ? "done" : "",
                          entry.isEventStart ? "event-start" : "",
                          entry.isEventEnd ? "event-end" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() =>
                          onJumpToActivity(entry.deptId, entry.activityId)
                        }
                        title={`${entry.activityName}：${entry.description || "（無說明）"}（${sourceLabel}${entry.isEventStart ? "開始" : entry.isEventEnd ? "結束" : "中"}）`}
                      >
                        <span
                          className="act-cal-dot"
                          style={{ background: dotColor }}
                        />
                        <span className="act-cal-item-body">
                          <span className="act-cal-event-mark">
                            {eventMark}
                          </span>
                          <span className="act-cal-act-name">
                            {entry.activityName}
                          </span>
                          {entry.description && (
                            <span className="act-cal-item-desc">
                              {entry.description}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="act-cal-legend">
        {(
          [
            ["not-started", "未開始"],
            ["attention", "需注意"],
            ["in-progress", "進行中"],
            ["completed", "已完成"],
          ] as const
        ).map(([status, label]) => (
          <span key={status} className="act-cal-legend-item">
            <span
              className="act-cal-legend-dot"
              style={{ background: STATUS_DOT[status] }}
            />
            {label}
          </span>
        ))}
        <span className="act-cal-legend-hint">
          圓點顏色 = 活動狀態・已完成項目以刪除線標示
        </span>
      </div>
    </div>
  );
}
