import { useState, useMemo } from "react";
import type { ActivityWithContext } from "../ActivityPage";

interface Props {
  activities: ActivityWithContext[];
  onJumpToActivity: (deptId: string, activityId: string) => void;
}

const STATUS_COLOR: Record<string, string> = {
  "not-started": "#cbd5e1",
  attention: "#fde68a",
  "in-progress": "#93c5fd",
  completed: "#86efac",
};

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** First weekday (0=Sun) of given year/month */
function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

export default function ActivityCalendar({
  activities,
  onJumpToActivity,
}: Props) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based

  const prevMonth = () => {
    if (month === 1) {
      setYear((y) => y - 1);
      setMonth(12);
    } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) {
      setYear((y) => y + 1);
      setMonth(1);
    } else setMonth((m) => m + 1);
  };

  const days = daysInMonth(year, month);
  const offset = firstWeekday(year, month); // cells before day 1

  const todayStr = ymd(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate(),
  );

  // Activities visible in this month: must overlap [month start, month end]
  const monthStart = ymd(year, month, 1);
  const monthEnd = ymd(year, month, days);

  const visible = useMemo(
    () =>
      activities.filter(
        (a) =>
          a.startDate &&
          a.endDate &&
          a.startDate <= monthEnd &&
          a.endDate >= monthStart,
      ),
    [activities, monthStart, monthEnd],
  );

  // For each day, get activities overlapping that day (max 3 shown)
  const MAX_PER_DAY = 3;

  const getActivitiesForDay = (dateStr: string) =>
    visible.filter((a) => a.startDate! <= dateStr && a.endDate! >= dateStr);

  // Build grid cells
  const totalCells = Math.ceil((offset + days) / 7) * 7;

  return (
    <div className="cal-outer">
      {/* Header */}
      <div className="cal-header">
        <button className="cal-nav-btn" onClick={prevMonth}>
          ◀
        </button>
        <span className="cal-month-label">
          {year} 年 {month} 月
        </span>
        <button className="cal-nav-btn" onClick={nextMonth}>
          ▶
        </button>
        <span className="cal-activity-count">
          {visible.length} 個活動在本月
        </span>
      </div>

      {/* Weekday headers */}
      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="cal-wd-hdr">
            {w}
          </div>
        ))}

        {/* Day cells */}
        {Array.from({ length: totalCells }).map((_, cellIdx) => {
          const dayNum = cellIdx - offset + 1;
          const isInMonth = dayNum >= 1 && dayNum <= days;
          if (!isInMonth)
            return <div key={cellIdx} className="cal-cell cal-cell-out" />;

          const dateStr = ymd(year, month, dayNum);
          const isToday = dateStr === todayStr;
          const dayActs = getActivitiesForDay(dateStr);
          const overflow = dayActs.length - MAX_PER_DAY;

          return (
            <div
              key={cellIdx}
              className={`cal-cell${isToday ? " cal-today" : ""}`}
            >
              <span className="cal-day-num">{dayNum}</span>
              <div className="cal-day-acts">
                {dayActs.slice(0, MAX_PER_DAY).map((act) => (
                  <button
                    key={act.id}
                    className="cal-act-strip"
                    style={{
                      background: STATUS_COLOR[act.status ?? "not-started"],
                    }}
                    title={`${act.rawText}\n${act.startDate} → ${act.endDate}`}
                    onClick={() => onJumpToActivity(act.deptId, act.id)}
                  >
                    {act.rawText}
                  </button>
                ))}
                {overflow > 0 && (
                  <span className="cal-act-more">+{overflow} 更多</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
