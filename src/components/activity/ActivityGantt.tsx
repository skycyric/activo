import { useMemo, useRef } from "react";
import type { ActivityWithContext } from "../ActivityPage";

interface Props {
  activities: ActivityWithContext[];
  allActivities: ActivityWithContext[];
  onJumpToActivity: (deptId: string, activityId: string) => void;
}

const ROW_H = 40; // px per row
const LABEL_W = 180; // px for activity label column
const STATUS_COLOR: Record<string, string> = {
  "not-started": "#cbd5e1",
  attention: "#fde68a",
  "in-progress": "#93c5fd",
  completed: "#86efac",
};

/** Parse YYYY-MM-DD to Date at UTC midnight */
function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Format a Date to YYYY-MM-DD */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Add days to a Date (returns new Date) */
function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/** Difference in whole days (a - b) */
function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export default function ActivityGantt({
  activities,
  allActivities,
  onJumpToActivity,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Only activities that have both startDate and endDate
  const datedActs = useMemo(
    () =>
      activities
        .filter((a) => a.startDate && a.endDate)
        .sort((a, b) => (a.startDate! < b.startDate! ? -1 : 1)),
    [activities],
  );

  const undatedCount = activities.length - datedActs.length;

  const { minDate, maxDate, totalDays } = useMemo(() => {
    if (datedActs.length === 0)
      return { minDate: null, maxDate: null, totalDays: 0 };
    const starts = datedActs.map((a) => parseDate(a.startDate!));
    const ends = datedActs.map((a) => parseDate(a.endDate!));
    const min = new Date(Math.min(...starts.map((d) => d.getTime())));
    const max = new Date(Math.max(...ends.map((d) => d.getTime())));
    // Add padding
    const paddedMin = addDays(min, -2);
    const paddedMax = addDays(max, 3);
    return {
      minDate: paddedMin,
      maxDate: paddedMax,
      totalDays: diffDays(paddedMax, paddedMin) + 1,
    };
  }, [datedActs]);

  // Choose tick scale: day / week / biweek / month
  // threshold tuned so tick labels never overlap at min 55px/tick spacing
  const { tickDays, tickFormat } = useMemo(() => {
    if (totalDays <= 14) return { tickDays: 1, tickFormat: "d" };
    if (totalDays <= 90) return { tickDays: 7, tickFormat: "w" };
    if (totalDays <= 180) return { tickDays: 14, tickFormat: "w" };
    return { tickDays: 30, tickFormat: "m" };
  }, [totalDays]);

  // Build tick labels
  const ticks = useMemo(() => {
    if (!minDate) return [];
    const result: { label: string; dayOffset: number }[] = [];
    let cur = new Date(minDate.getTime());
    while (cur <= maxDate!) {
      const dayOffset = diffDays(cur, minDate);
      let label = "";
      if (tickFormat === "d")
        label = `${cur.getUTCMonth() + 1}/${cur.getUTCDate()}`;
      else if (tickFormat === "w")
        label = `${cur.getUTCMonth() + 1}/${cur.getUTCDate()}`;
      else label = `${cur.getUTCFullYear()}/${cur.getUTCMonth() + 1}`;
      result.push({ label, dayOffset });
      cur = addDays(cur, tickDays);
    }
    return result;
  }, [minDate, maxDate, tickDays, tickFormat]);

  // rowIndex map for SVG arrows
  const rowIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    datedActs.forEach((a, i) => m.set(a.id, i));
    return m;
  }, [datedActs]);

  // Build dependency arrows (only between dated activities)
  const arrows = useMemo(() => {
    if (!minDate) return [];
    const result: {
      fromId: string;
      toId: string;
      fromRow: number;
      toRow: number;
      fromDayEnd: number;
      toDayStart: number;
    }[] = [];
    for (const act of datedActs) {
      if (!act.prerequisites) continue;
      for (const preId of act.prerequisites) {
        const pre = allActivities.find((a) => a.id === preId);
        if (!pre?.endDate || !pre?.startDate) continue;
        const fromRow = rowIndexMap.get(preId);
        const toRow = rowIndexMap.get(act.id);
        if (fromRow === undefined || toRow === undefined) continue;
        result.push({
          fromId: preId,
          toId: act.id,
          fromRow,
          toRow,
          fromDayEnd: diffDays(parseDate(pre.endDate), minDate),
          toDayStart: diffDays(parseDate(act.startDate!), minDate),
        });
      }
    }
    return result;
  }, [datedActs, allActivities, rowIndexMap, minDate]);

  if (activities.length === 0) {
    return (
      <div className="act-empty">
        <div className="act-empty-icon">▬</div>
        <div className="act-empty-text">沒有符合條件的活動</div>
      </div>
    );
  }

  if (datedActs.length === 0) {
    return (
      <div className="act-empty">
        <div className="act-empty-icon">▬</div>
        <div className="act-empty-text">
          請先在活動上設定起始日與結束日才能顯示甘特圖
        </div>
      </div>
    );
  }

  // Chart width is determined by container (responsive); use percentage-based px formula
  // We'll use a fixed px-per-day based on a 900px target chart width
  // Minimum 14px/day keeps bars readable; minimum 55px/tick prevents label overlap
  const CHART_W = Math.max(
    totalDays * 14,
    Math.ceil(totalDays / tickDays) * 55,
    600,
  );
  const pxPerDay = CHART_W / totalDays;
  const totalH = datedActs.length * ROW_H;

  const barLeft = (dayOffset: number) => dayOffset * pxPerDay;
  const barWidth = (start: string, end: string) => {
    const s = diffDays(parseDate(start), minDate!);
    const e = diffDays(parseDate(end), minDate!);
    return Math.max((e - s + 1) * pxPerDay, 6);
  };

  const rowY = (rowIdx: number) => rowIdx * ROW_H + ROW_H / 2;

  return (
    <div className="gantt-outer">
      {undatedCount > 0 && (
        <div className="gantt-hint">
          ⚠ 有 {undatedCount} 個活動未設定日期，不顯示於甘特圖中。
        </div>
      )}

      {/* 顏色圖例 */}
      <div className="gantt-legend">
        <span className="gantt-legend-title">說明：</span>
        <span className="gantt-legend-item">
          <span
            className="gantt-legend-dot"
            style={{ background: STATUS_COLOR["not-started"] }}
          />
          未開始
        </span>
        <span className="gantt-legend-item">
          <span
            className="gantt-legend-dot"
            style={{ background: STATUS_COLOR["attention"] }}
          />
          需注意
        </span>
        <span className="gantt-legend-item">
          <span
            className="gantt-legend-dot"
            style={{ background: STATUS_COLOR["in-progress"] }}
          />
          進行中
        </span>
        <span className="gantt-legend-item">
          <span
            className="gantt-legend-dot"
            style={{ background: STATUS_COLOR["completed"] }}
          />
          已完成
        </span>
        <span className="gantt-legend-item gantt-legend-overdue">
          <span className="gantt-legend-dot gantt-legend-dot--overdue" />
          已逾期（未完成且超過結束日）
        </span>
      </div>

      <div className="gantt-wrap" ref={containerRef}>
        {/* Left label column */}
        <div className="gantt-labels" style={{ width: LABEL_W }}>
          {/* Header placeholder */}
          <div className="gantt-label-hdr" />
          {datedActs.map((act) => (
            <div
              key={act.id}
              className="gantt-label-row"
              style={{ height: ROW_H }}
              title={act.rawText}
              onClick={() => onJumpToActivity(act.deptId, act.id)}
            >
              <span className="gantt-label-dept">{act.deptName}</span>
              <span className="gantt-label-name">{act.rawText}</span>
            </div>
          ))}
        </div>

        {/* Right chart area */}
        <div className="gantt-chart-area" style={{ flex: 1 }}>
          <div style={{ width: CHART_W, position: "relative" }}>
            {/* Tick header */}
            <div
              className="gantt-tick-hdr"
              style={{ height: ROW_H, position: "relative" }}
            >
              {ticks.map((tick) => (
                <span
                  key={tick.dayOffset}
                  className="gantt-tick-label"
                  style={{ left: barLeft(tick.dayOffset) }}
                >
                  {tick.label}
                </span>
              ))}
            </div>

            {/* Grid lines + bars */}
            <div style={{ position: "relative", height: totalH }}>
              {/* Vertical grid lines */}
              {ticks.map((tick) => (
                <div
                  key={tick.dayOffset}
                  className="gantt-grid-line"
                  style={{ left: barLeft(tick.dayOffset), height: totalH }}
                />
              ))}

              {/* Bars */}
              {datedActs.map((act, i) => {
                const left = barLeft(
                  diffDays(parseDate(act.startDate!), minDate!),
                );
                const width = barWidth(act.startDate!, act.endDate!);
                const color = STATUS_COLOR[act.status ?? "not-started"];
                const today = fmtDate(new Date());
                const overdue =
                  act.endDate! < today && act.status !== "completed";
                return (
                  <div
                    key={act.id}
                    className={`gantt-bar${overdue ? " gantt-bar-overdue" : ""}`}
                    style={{
                      left,
                      width,
                      top: i * ROW_H + 7,
                      height: ROW_H - 14,
                      background: color,
                    }}
                    title={`${act.rawText}\n${act.startDate} → ${act.endDate}`}
                    onClick={() => onJumpToActivity(act.deptId, act.id)}
                  >
                    <span className="gantt-bar-label">{act.rawText}</span>
                  </div>
                );
              })}

              {/* SVG dependency arrows */}
              <svg
                ref={svgRef}
                className="gantt-arrows-svg"
                style={{ width: CHART_W, height: totalH }}
              >
                {arrows.map((arrow, idx) => {
                  const x1 = barLeft(arrow.fromDayEnd + 1);
                  const y1 = rowY(arrow.fromRow);
                  const x2 = barLeft(arrow.toDayStart);
                  const y2 = rowY(arrow.toRow);
                  const mx = (x1 + x2) / 2;
                  return (
                    <g key={idx} className="gantt-arrow">
                      <path
                        d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                        fill="none"
                        stroke="#94a3b8"
                        strokeWidth="1.5"
                        markerEnd="url(#arrowhead)"
                      />
                    </g>
                  );
                })}
                <defs>
                  <marker
                    id="arrowhead"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M 0 0 L 6 3 L 0 6 Z" fill="#94a3b8" />
                  </marker>
                </defs>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
