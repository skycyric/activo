import { useEffect, useMemo, useState } from "react";
import type { ActivityPlanItem } from "../../schemas/ogsm";
import type { ActivityWithContext } from "../ActivityPage";
import { getPlanItemWarning, isLateCompletion } from "../../utils/planWarnings";

interface Props {
  activities: ActivityWithContext[];
  onJumpToActivity: (deptId: string, activityId: string) => void;
  warnDaysBefore?: number;
}

const ROW_H = 36;
const LABEL_W = 280;

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

type Row =
  | {
      kind: "group";
      key: string;
      activity: ActivityWithContext;
    }
  | {
      kind: "item";
      key: string;
      activity: ActivityWithContext;
      item: ActivityPlanItem;
    };

export default function ActivityPlanGantt({
  activities,
  onJumpToActivity,
  warnDaysBefore = 7,
}: Props) {
  const activitiesWithPlans = useMemo(
    () =>
      activities
        .filter((a) => (a.planItems?.length ?? 0) > 0)
        .sort((a, b) =>
          (a.rawText || "").localeCompare(b.rawText || "", "zh-TW"),
        ),
    [activities],
  );

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const next: Record<string, boolean> = {};
    for (const act of activitiesWithPlans) {
      next[act.id] = expanded[act.id] ?? true;
    }
    setExpanded(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activitiesWithPlans.map((a) => a.id).join("|")]);

  const rows = useMemo<Row[]>(() => {
    const next: Row[] = [];
    for (const act of activitiesWithPlans) {
      next.push({ kind: "group", key: `grp:${act.id}`, activity: act });
      if (!expanded[act.id]) continue;
      const items = [...(act.planItems ?? [])].sort((a, b) => {
        const ad = a.plannedEndDate ?? "9999-12-31";
        const bd = b.plannedEndDate ?? "9999-12-31";
        return ad.localeCompare(bd, "en");
      });
      for (const item of items) {
        next.push({
          kind: "item",
          key: `item:${act.id}:${item.id}`,
          activity: act,
          item,
        });
      }
    }
    return next;
  }, [activitiesWithPlans, expanded]);

  const datePoints = useMemo(() => {
    const points: string[] = [];
    for (const act of activitiesWithPlans) {
      for (const item of act.planItems ?? []) {
        if (item.plannedEndDate) points.push(item.plannedEndDate);
        if (item.actualEndDate) points.push(item.actualEndDate);
      }
    }
    return points.sort((a, b) => a.localeCompare(b));
  }, [activitiesWithPlans]);

  const undatedCount = useMemo(() => {
    let n = 0;
    for (const act of activitiesWithPlans) {
      for (const item of act.planItems ?? []) {
        if (!item.plannedEndDate && !item.actualEndDate) n += 1;
      }
    }
    return n;
  }, [activitiesWithPlans]);

  const { minDate, maxDate, totalDays } = useMemo(() => {
    if (datePoints.length === 0) {
      return {
        minDate: null as Date | null,
        maxDate: null as Date | null,
        totalDays: 0,
      };
    }
    const min = parseDate(datePoints[0]);
    const max = parseDate(datePoints[datePoints.length - 1]);
    const paddedMin = addDays(min, -2);
    const paddedMax = addDays(max, 3);
    return {
      minDate: paddedMin,
      maxDate: paddedMax,
      totalDays: diffDays(paddedMax, paddedMin) + 1,
    };
  }, [datePoints]);

  const { tickDays, tickFormat } = useMemo(() => {
    if (totalDays <= 60) return { tickDays: 7, tickFormat: "d" as const };
    if (totalDays <= 180) return { tickDays: 14, tickFormat: "w" as const };
    return { tickDays: 30, tickFormat: "m" as const };
  }, [totalDays]);

  const ticks = useMemo(() => {
    if (!minDate || !maxDate)
      return [] as { dayOffset: number; label: string }[];
    const list: { dayOffset: number; label: string }[] = [];
    let cur = new Date(minDate.getTime());
    while (cur <= maxDate) {
      const dayOffset = diffDays(cur, minDate);
      const label =
        tickFormat === "m"
          ? `${cur.getUTCFullYear()}/${cur.getUTCMonth() + 1}`
          : `${cur.getUTCMonth() + 1}/${cur.getUTCDate()}`;
      list.push({ dayOffset, label });
      cur = addDays(cur, tickDays);
    }
    return list;
  }, [minDate, maxDate, tickDays, tickFormat]);

  const rowIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r, idx) => {
      if (r.kind === "item") map.set(`${r.activity.id}:${r.item.id}`, idx);
    });
    return map;
  }, [rows]);

  const arrows = useMemo(() => {
    if (!minDate)
      return [] as {
        from: string;
        to: string;
        x1: number;
        x2: number;
        y1: number;
        y2: number;
      }[];
    const list: {
      from: string;
      to: string;
      x1: number;
      x2: number;
      y1: number;
      y2: number;
    }[] = [];
    for (const act of activitiesWithPlans) {
      if (!expanded[act.id]) continue;
      const byId = new Map((act.planItems ?? []).map((i) => [i.id, i]));
      for (const item of act.planItems ?? []) {
        if (!item.plannedEndDate || !item.dependsOnIds?.length) continue;
        const toKey = `${act.id}:${item.id}`;
        const toRow = rowIndexMap.get(toKey);
        if (toRow === undefined) continue;
        const toDay = diffDays(parseDate(item.plannedEndDate), minDate);
        for (const depId of item.dependsOnIds) {
          const dep = byId.get(depId);
          if (!dep?.plannedEndDate) continue;
          const fromKey = `${act.id}:${depId}`;
          const fromRow = rowIndexMap.get(fromKey);
          if (fromRow === undefined) continue;
          list.push({
            from: depId,
            to: item.id,
            x1: diffDays(parseDate(dep.plannedEndDate), minDate),
            x2: toDay,
            y1: fromRow,
            y2: toRow,
          });
        }
      }
    }
    return list;
  }, [activitiesWithPlans, expanded, rowIndexMap, minDate]);

  if (activities.length === 0) {
    return (
      <div className="act-empty">
        <div className="act-empty-icon">▬</div>
        <div className="act-empty-text">沒有符合條件的活動</div>
      </div>
    );
  }

  if (activitiesWithPlans.length === 0) {
    return (
      <div className="act-empty">
        <div className="act-empty-icon">▬</div>
        <div className="act-empty-text">目前篩選條件下沒有行動計畫項目</div>
      </div>
    );
  }

  if (!minDate) {
    return (
      <div className="act-empty">
        <div className="act-empty-icon">▬</div>
        <div className="act-empty-text">
          請至少設定行動計畫的預計完成日，才能顯示計畫甘特
        </div>
      </div>
    );
  }

  // Minimum 12px/day keeps milestones readable; minimum 55px/tick prevents label overlap
  const CHART_W = Math.max(
    totalDays * 12,
    Math.ceil(totalDays / tickDays) * 55,
    680,
  );
  const pxPerDay = CHART_W / totalDays;
  const totalH = rows.length * ROW_H;
  const dayToX = (dayOffset: number) => dayOffset * pxPerDay;
  const rowToY = (idx: number) => idx * ROW_H + ROW_H / 2;

  return (
    <div className="gantt-outer plan-gantt-outer">
      {undatedCount > 0 && (
        <div className="gantt-hint">
          ⚠ 有 {undatedCount} 個項目未設定日期，不顯示在圖上。
        </div>
      )}

      <div className="gantt-wrap">
        <div
          className="gantt-labels plan-gantt-labels"
          style={{ width: LABEL_W }}
        >
          <div className="gantt-label-hdr" style={{ height: ROW_H }}>
            活動 / 行動計畫
          </div>
          {rows.map((row) => {
            if (row.kind === "group") {
              const itemCount = row.activity.planItems?.length ?? 0;
              const open = expanded[row.activity.id] ?? true;
              return (
                <div
                  key={row.key}
                  className="plan-gantt-group-row"
                  style={{ height: ROW_H }}
                >
                  <button
                    className="plan-gantt-group-toggle"
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [row.activity.id]: !(prev[row.activity.id] ?? true),
                      }))
                    }
                    title={open ? "收合" : "展開"}
                  >
                    {open ? "▾" : "▸"}
                  </button>
                  <button
                    className="plan-gantt-group-name"
                    onClick={() =>
                      onJumpToActivity(row.activity.deptId, row.activity.id)
                    }
                    title="前往活動詳情"
                  >
                    {row.activity.rawText || "（未命名活動）"}
                  </button>
                  <span className="plan-gantt-group-count">{itemCount}</span>
                </div>
              );
            }

            const warn = getPlanItemWarning(row.item, warnDaysBefore);
            const late = isLateCompletion(row.item);
            const stateClass = row.item.completed
              ? late
                ? "late"
                : "done"
              : (warn ?? "");
            const stateLabel = row.item.completed
              ? late
                ? "延遲完成"
                : "已完成"
              : warn === "overdue"
                ? "逾期"
                : warn === "warning"
                  ? "即將到期"
                  : "進行中";
            return (
              <div
                key={row.key}
                className="plan-gantt-item-label"
                style={{ height: ROW_H }}
              >
                <span
                  className="plan-gantt-item-title"
                  title={row.item.description}
                >
                  {row.item.description || "（未命名項目）"}
                </span>
                <span
                  className={`plan-gantt-item-state${stateClass ? " " + stateClass : ""}`}
                >
                  {stateLabel}
                </span>
              </div>
            );
          })}
        </div>

        <div className="gantt-chart-area" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ width: CHART_W, position: "relative" }}>
            <div
              className="gantt-tick-hdr"
              style={{ height: ROW_H, position: "relative" }}
            >
              {ticks.map((tick) => (
                <span
                  key={tick.dayOffset}
                  className="gantt-tick-label"
                  style={{ left: dayToX(tick.dayOffset) }}
                >
                  {tick.label}
                </span>
              ))}
            </div>

            <div style={{ position: "relative", height: totalH }}>
              {ticks.map((tick) => (
                <div
                  key={tick.dayOffset}
                  className="gantt-grid-line"
                  style={{ left: dayToX(tick.dayOffset), height: totalH }}
                />
              ))}

              {rows.map((row, idx) => {
                const top = idx * ROW_H;
                if (row.kind === "group") {
                  return (
                    <div
                      key={row.key}
                      className="plan-gantt-group-band"
                      style={{ top, height: ROW_H }}
                    />
                  );
                }

                if (!row.item.plannedEndDate) return null;
                const x = dayToX(
                  diffDays(parseDate(row.item.plannedEndDate), minDate),
                );
                const warn = getPlanItemWarning(row.item, warnDaysBefore);
                const late = isLateCompletion(row.item);
                const msClass = row.item.completed
                  ? late
                    ? "late"
                    : "done"
                  : (warn ?? "");
                return (
                  <div
                    key={row.key}
                    className={`plan-gantt-milestone${msClass ? " " + msClass : ""}`}
                    style={{ left: x, top: top + ROW_H / 2 }}
                    title={`${row.item.description || "（未命名項目）"}\n預計完成: ${row.item.plannedEndDate}${row.item.actualEndDate ? `\n實際完成: ${row.item.actualEndDate}` : ""}`}
                  />
                );
              })}

              <svg
                className="gantt-arrows-svg"
                style={{ width: CHART_W, height: totalH }}
              >
                {arrows.map((arrow, idx) => {
                  const x1 = dayToX(arrow.x1 + 1);
                  const y1 = rowToY(arrow.y1);
                  const x2 = dayToX(arrow.x2);
                  const y2 = rowToY(arrow.y2);
                  const mx = (x1 + x2) / 2;
                  return (
                    <g
                      key={`${arrow.from}-${arrow.to}-${idx}`}
                      className="gantt-arrow plan-gantt-arrow"
                    >
                      <path
                        d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                        fill="none"
                        stroke="#64748b"
                        strokeWidth="1.5"
                        markerEnd="url(#planArrowhead)"
                      />
                    </g>
                  );
                })}
                <defs>
                  <marker
                    id="planArrowhead"
                    markerWidth="6"
                    markerHeight="6"
                    refX="5"
                    refY="3"
                    orient="auto"
                  >
                    <path d="M 0 0 L 6 3 L 0 6 Z" fill="#64748b" />
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
