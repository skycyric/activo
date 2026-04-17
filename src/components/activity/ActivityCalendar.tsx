import { useMemo } from "react";
import {
  Calendar,
  Views,
  dateFnsLocalizer,
  type Event,
} from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { zhTW } from "date-fns/locale/zh-TW";
import "react-big-calendar/lib/css/react-big-calendar.css";
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

type ActivityEvent = Event & {
  activity: ActivityWithContext;
  deptId: string;
  activityId: string;
};

function normalizeDateRange(
  activity: ActivityWithContext,
): { start: Date; end: Date } | null {
  const start = activity.startDate;
  const end = activity.endDate;
  if (!start && !end) return null;

  // If only one side exists, treat it as a single-day activity.
  const normalizedStart = start ?? end!;
  const normalizedEnd = end ?? start!;
  const [safeStart, safeEnd] =
    normalizedStart <= normalizedEnd
      ? [normalizedStart, normalizedEnd]
      : [normalizedEnd, normalizedStart];

  // Parse YYYY-MM-DD to Date
  const startDate = new Date(`${safeStart}T00:00:00`);
  const endDate = new Date(`${safeEnd}T23:59:59`);

  return { start: startDate, end: endDate };
}

// dateFnsLocalizer 設定
const locales = {
  "zh-TW": zhTW,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: zhTW }),
  getDay: (date: Date) => getDay(date),
  locales,
});

export default function ActivityCalendar({
  activities,
  onJumpToActivity,
}: Props) {
  // Convert activities to RBC Event format
  const events: ActivityEvent[] = useMemo(
    () =>
      activities
        .map((activity) => {
          const dateRange = normalizeDateRange(activity);
          if (!dateRange) return null;

          return {
            id: activity.id,
            title: activity.rawText,
            start: dateRange.start,
            end: dateRange.end,
            activity,
            deptId: activity.deptId,
            activityId: activity.id,
            resource: activity,
          } as ActivityEvent;
        })
        .filter((e): e is ActivityEvent => !!e),
    [activities],
  );

  // Get total visible activities count
  const visibleCount = events.length;

  // Event style getter: apply status color
  const eventStyleGetter = (event: ActivityEvent) => {
    const backgroundColor =
      STATUS_COLOR[event.activity.status ?? "not-started"];
    return {
      style: {
        backgroundColor,
        borderRadius: "3px",
        opacity: 0.9,
        color: "#1e293b",
        border: "0px",
        display: "block",
      },
    };
  };

  // Handle event selection
  const handleSelectEvent = (event: ActivityEvent) => {
    onJumpToActivity(event.deptId, event.activityId);
  };

  // Translations for RBC messages (month view only)
  const messages = {
    next: "下個月",
    previous: "上個月",
    today: "今天",
    month: "月",
    week: "週",
    day: "日",
    agenda: "待辦",
    date: "日期",
    time: "時間",
    event: "活動",
    noEventsInRange: "本月無活動",
    showMore: (total: number) => `+${total} 更多`,
  };

  return (
    <div className="cal-outer">
      <div className="cal-header">
        <span className="cal-activity-count">{visibleCount} 個活動在本月</span>
      </div>
      <div style={{ maxHeight: "calc(100vh - 300px)", overflow: "auto" }}>
        <Calendar
          localizer={localizer}
          events={events}
          defaultView={Views.MONTH}
          views={[Views.MONTH]}
          defaultDate={new Date()}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventStyleGetter}
          messages={messages}
          style={{ height: "auto", minHeight: "600px" }}
          popup
          selectable={false}
        />
      </div>
    </div>
  );
}
