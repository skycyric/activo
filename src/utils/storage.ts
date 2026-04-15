import {
  type OGSMData,
  type WorkspaceData,
  type Department,
  type PeriodData,
  type Strategy,
  type ActionPlan,
  type PlanItem,
  type DeptActivity,
  type DashboardLink,
  type ActivityDashboardLink,
  WorkspaceDataSchema,
  OGSMDataSchema,
} from "../schemas/ogsm";
import { genId } from "./csvParser";

const WORKSPACE_KEY = "ogsm_workspace_v1";
const LEGACY_KEY = "ogsm_power_tool_data";

/**
 * 在開發期間驗證資料是否符合 schema，不符合時印出 console.warn。
 * 不阻斷執行，避免破壞已有存檔資料。
 */
export function validateOrWarn<T>(
  schema: {
    safeParse: (v: unknown) => {
      success: boolean;
      error?: { message: string };
    };
  },
  data: T,
  context: string,
): void {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(
      `[schema] ${context} — 資料不符合 schema:`,
      result.error?.message,
    );
  }
}

export function saveWorkspace(ws: WorkspaceData): void {
  try {
    normalizeWorkspaceData(ws);
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(ws));
  } catch (e) {
    console.error("Failed to save workspace", e);
  }
}

export function loadWorkspace(): WorkspaceData | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return null;
    const ws: WorkspaceData = JSON.parse(raw);
    if (normalizeWorkspaceData(ws)) {
      try {
        localStorage.setItem(WORKSPACE_KEY, JSON.stringify(ws));
      } catch (e) {
        console.error("Failed to save workspace", e);
      }
    }
    validateOrWarn(WorkspaceDataSchema, ws, "loadWorkspace");
    return ws;
  } catch {
    return null;
  }
}

function toIsoDateLoose(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return undefined;
  // Cannot reliably infer year from MM/DD alone; skip to avoid corrupting historical dates
  return undefined;
}

function migrateMeasureDateRangeFromPlanItems(strategy: Strategy): boolean {
  let changed = false;
  for (const measure of strategy.measures) {
    const linked = strategy.actionPlans
      .flatMap((ap) => ap.items)
      .filter((it) => it.linkedMeasureId === measure.id);
    if (linked.length === 0) continue;

    const ends = linked
      .map((it) => toIsoDateLoose(it.plannedEndDate))
      .filter((d): d is string => !!d)
      .sort();

    if (!measure.endDate && ends.length > 0) {
      measure.endDate = ends[ends.length - 1];
      changed = true;
    }
  }
  return changed;
}

/**
 * Legacy migration only: dedupe old ActionPlan items left by the historic
 * cross-quarter sync mechanism. This keeps backward compatibility for older
 * saved JSON, but ActionPlan items are no longer the primary UI data source.
 */
function migrateSyncDuplicates(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    for (const period of dept.periods) {
      for (const goal of period.ogsm.goals) {
        for (const strategy of goal.strategies) {
          const seen = new Set<string>();
          for (const ap of strategy.actionPlans) {
            const before = ap.items.length;
            ap.items = ap.items.filter((item) => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            });
            // Strip legacy sourceQuarter field
            for (const item of ap.items) {
              if ("sourceQuarter" in item) {
                delete (item as Record<string, unknown>).sourceQuarter;
                changed = true;
              }
            }
            if (ap.items.length !== before) changed = true;
          }
        }
      }
    }
  }
  return changed;
}

/**
 * Migrate old PlanItem date fields to the current plannedEndDate / actualEndDate fields.
 * Also cleans up legacy plannedStartDate / actualStartDate if still present.
 */
function migratePlanItemDateFields(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    for (const period of dept.periods) {
      for (const goal of period.ogsm.goals) {
        for (const strategy of goal.strategies) {
          for (const ap of strategy.actionPlans) {
            for (const item of ap.items) {
              const raw = item as unknown as Record<string, unknown>;
              const hasLegacy =
                "date" in raw ||
                "startDate" in raw ||
                "endDate" in raw ||
                "plannedStartDate" in raw ||
                "actualStartDate" in raw;
              if (hasLegacy) {
                if (!item.plannedEndDate) {
                  item.plannedEndDate =
                    toIsoDateLoose(
                      (raw.endDate as string | undefined) ??
                        (raw.plannedEndDate as string | undefined) ??
                        (raw.startDate as string | undefined) ??
                        (raw.date as string | undefined),
                    ) ?? undefined;
                }
                delete raw.date;
                delete raw.startDate;
                delete raw.endDate;
                delete raw.plannedStartDate;
                delete raw.actualStartDate;
                changed = true;
              }
            }
          }
        }
      }
    }
  }
  return changed;
}

/**
 * Parse ActionPlan entries from the legacy q1Text / q2Text CSV fields.
 * Equivalent to the parseActionPlans logic formerly in DetailPanel.tsx;
 * moved here so the migration runs at load time, not inside the render cycle.
 */
function parseActionPlansForMigration(
  q1Text: string,
  q2Text: string,
  year: number,
): ActionPlan[] {
  const plans: ActionPlan[] = [];

  function toIsoForYear(s: string | undefined): string | undefined {
    if (!s) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (m) return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    return undefined;
  }

  function parseItems(text: string): PlanItem[] {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const rangeMatch = line.match(
          /^(\d{1,2}\/\d{1,2})\s*[-~]\s*(\d{1,2}\/\d{1,2})/,
        );
        if (rangeMatch) {
          const description = line.substring(rangeMatch[0].length).trim();
          return {
            id: genId("item"),
            plannedEndDate: toIsoForYear(rangeMatch[2]),
            description,
            completed: /完成|結案|啟動/.test(description),
          };
        }
        const dateMatch = line.match(/^(\d+\/\d+(?:\/\d+)?)/);
        const date = dateMatch ? dateMatch[1] : "";
        const description = dateMatch
          ? line.substring(dateMatch[0].length).trim()
          : line;
        return {
          id: genId("item"),
          plannedEndDate: toIsoForYear(date) ?? undefined,
          description,
          completed:
            /完成|結案|啟動/.test(description) && /^\d+\/\d+/.test(line),
        };
      });
  }

  function parseQ(text: string, quarter: "Q1" | "Q2") {
    if (!text.trim()) return;
    const sectionRe = /【([^】]+)】/g;
    const sections: Array<{ title: string; start: number }> = [];
    let m;
    while ((m = sectionRe.exec(text)) !== null) {
      sections.push({ title: m[1], start: m.index + m[0].length });
    }
    if (sections.length === 0) {
      plans.push({
        id: genId("plan"),
        quarter,
        title: `${quarter} 行動計畫`,
        items: parseItems(text),
      });
      return;
    }
    for (let i = 0; i < sections.length; i++) {
      const content = text.substring(
        sections[i].start,
        i + 1 < sections.length
          ? sections[i + 1].start - sections[i + 1].title.length - 2
          : text.length,
      );
      plans.push({
        id: genId("plan"),
        quarter,
        title: sections[i].title,
        items: parseItems(content),
      });
    }
  }

  parseQ(q1Text, "Q1");
  parseQ(q2Text, "Q2");
  return plans;
}

/**
 * One-time migration: populate actionPlans from q1Text / q2Text for strategies
 * that were imported from CSV before the Measure model replaced ActionPlans.
 * Idempotent — only fills strategies whose actionPlans array is still empty.
 */
function migrateActionPlansFromQText(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    for (const period of dept.periods) {
      for (const goal of period.ogsm.goals) {
        for (const strategy of goal.strategies) {
          if (
            strategy.actionPlans.length === 0 &&
            (strategy.q1Text || strategy.q2Text)
          ) {
            const generated = parseActionPlansForMigration(
              strategy.q1Text ?? "",
              strategy.q2Text ?? "",
              period.year,
            );
            if (generated.length > 0) {
              strategy.actionPlans = generated;
              changed = true;
            }
          }
        }
      }
    }
  }
  return changed;
}

export function migrateOwnerToOwners(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    for (const period of dept.periods) {
      for (const goal of period.ogsm.goals) {
        for (const strategy of goal.strategies) {
          if (
            (!strategy.owners || strategy.owners.length === 0) &&
            strategy.owner
          ) {
            strategy.owners = [strategy.owner];
            changed = true;
          }
          if (strategy.owner !== undefined) {
            strategy.owner = undefined;
            changed = true;
          }
        }
      }
    }
  }
  return changed;
}

/**
 * V3 遷移：
 * 1. ogsmLink → dashboardLinks[{ type:"ogsm", ...ogsmLink, exclude }]
 * 2. actionPlans 平坦化 → planItems（每 item 加 quarter）
 * 3. 清除己棄用欄位：ogsmLink / excludeFromOgsm / actionPlans
 * 4. 若 dept.activities 已有資料，清空 strategy.measures[]
 */
export function migrateToV3(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    for (const activity of dept.activities ?? []) {
      // 1. ogsmLink → dashboardLinks
      if (
        activity.ogsmLink &&
        (!activity.dashboardLinks || activity.dashboardLinks.length === 0)
      ) {
        activity.dashboardLinks = [
          {
            id: genId("dlink"),
            type: "ogsm",
            periodId: activity.ogsmLink.periodId,
            goalId: activity.ogsmLink.goalId,
            strategyId: activity.ogsmLink.strategyId,
            exclude: activity.excludeFromOgsm ?? false,
          },
        ];
        changed = true;
      }
      if (activity.ogsmLink !== undefined) {
        activity.ogsmLink = undefined;
        changed = true;
      }
      if (activity.excludeFromOgsm !== undefined) {
        activity.excludeFromOgsm = undefined;
        changed = true;
      }
      // 2. actionPlans 平坦化 → planItems
      if (
        activity.actionPlans &&
        activity.actionPlans.length > 0 &&
        !activity.planItems
      ) {
        activity.planItems = activity.actionPlans.flatMap((ap) =>
          ap.items.map((item) => ({ ...item, quarter: ap.quarter })),
        );
        changed = true;
      }
      if (activity.actionPlans !== undefined) {
        activity.actionPlans = undefined;
        changed = true;
      }
    }
    // 3. 清空 strategy.measures[] （活動已遷移處）
    if (dept.activities && dept.activities.length > 0) {
      for (const period of dept.periods) {
        for (const goal of period.ogsm.goals) {
          for (const strategy of goal.strategies) {
            if (strategy.measures.length > 0) {
              strategy.measures = [];
              changed = true;
            }
          }
          // 4. GoalKpiLink 欄位升級：{ strategyId, measureId, kpiId } → { activityId, kpiId }
          for (const gk of goal.goalKpis ?? []) {
            const updatedLinks = gk.linkedKpis.map(
              (link: Record<string, unknown>) => {
                if ("measureId" in link && !("activityId" in link)) {
                  changed = true;
                  return {
                    activityId: link.measureId as string,
                    kpiId: link.kpiId as string,
                  };
                }
                return link;
              },
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (gk as any).linkedKpis = updatedLinks;
          }
        }
      }
    }
  }
  return changed;
}

/**
 * activity-first 遷移：將每個 Strategy.measures[] 中的活動提升為
 * Department.activities[] 的一等公民，並在活動上附加 ogsmLink 定位資訊。
 *
 * 遷移規則：
 * 1. 遇到 ID 已存在於 dept.activities 的活動 → 跳過（冪等）
 * 2. Strategy.measures[] 保留不動（舊 UI 仍可讀）
 * 3. 每筆 DeptActivity 帶有 ogsmLink 指回來源 Strategy
 * 4. excludeFromOgsm 預設 false（預設全部計入 OGSM）
 * 5. owners / notes 從 Strategy 複製給每個活動
 * 6. actionPlans 按 item.linkedMeasureId 分配：
 *    每個 plan group 只保留屬於該活動的 items；
 *    若 item 無 linkedMeasureId 則分配給同 strategy 所有活動
 */
export function migrateToActivityFirst(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    if (!dept.activities) {
      dept.activities = [];
      changed = true;
    }
    const existingIds = new Set(dept.activities.map((a) => a.id));

    for (const period of dept.periods) {
      for (const goal of period.ogsm.goals) {
        for (const strategy of goal.strategies) {
          // Collect measure ids in this strategy for fallback (no-link items)
          const stratMeasureIds = new Set(strategy.measures.map((m) => m.id));

          for (const measure of strategy.measures) {
            if (existingIds.has(measure.id)) continue;

            // Distribute actionPlans: keep items that link to this measure,
            // or items with no linkedMeasureId (they belong to the whole strategy)
            const activityPlans: ActionPlan[] = strategy.actionPlans
              .map((plan) => {
                const relevantItems = plan.items.filter((item) =>
                  !item.linkedMeasureId ||
                  !stratMeasureIds.has(item.linkedMeasureId)
                    ? !item.linkedMeasureId // no link → include for all
                    : item.linkedMeasureId === measure.id,
                );
                return relevantItems.length > 0
                  ? { ...plan, items: relevantItems }
                  : null;
              })
              .filter((p): p is ActionPlan => p !== null);

            const activity: DeptActivity = {
              ...measure,
              dashboardLinks: [
                {
                  id: genId("dlink"),
                  type: "ogsm",
                  periodId: period.id,
                  goalId: goal.id,
                  strategyId: strategy.id,
                  exclude: false,
                },
              ],
              owners:
                strategy.owners.length > 0 ? [...strategy.owners] : undefined,
              notes: strategy.notes || undefined,
              planItems:
                activityPlans.length > 0
                  ? activityPlans.flatMap((ap) =>
                      ap.items.map((item) => ({
                        ...item,
                        quarter: ap.quarter,
                      })),
                    )
                  : undefined,
            };
            dept.activities.push(activity);
            existingIds.add(measure.id);
            changed = true;
          }
        }
      }
    }
  }
  return changed;
}

/**
 * FrameworksV1 遷移：將 dept.activities 中尚未設定 frameworks 的活動
 * 補設為 ["ogsm"]（歷史資料皆為 OGSM 相關活動）。
 */
export function migrateFrameworksV1(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    for (const activity of dept.activities ?? []) {
      if (!activity.frameworks || activity.frameworks.length === 0) {
        activity.frameworks = ["ogsm"];
        changed = true;
      }
    }
  }
  return changed;
}

function periodSortValue(year: number, halfYear: "H1" | "H2"): number {
  return year * 10 + (halfYear === "H1" ? 1 : 2);
}

/**
 * TimelineV1：
 * 1) 對 OGSM dashboardLinks 依 periodId+goalId+strategyId 去重
 * 2) 補齊 lifecycleStartPeriodId（取最早歸屬期別）
 * 3) 若有 OGSM 歸屬則自動補齊 frameworks 包含 ogsm
 */
export function migrateTimelineV1(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    const periodById = new Map(dept.periods.map((p) => [p.id, p]));
    for (const activity of dept.activities ?? []) {
      const links = activity.dashboardLinks ?? [];
      if (links.length > 0) {
        const nextLinks: typeof links = [];
        const seen = new Set<string>();
        for (const link of links) {
          if (link.type !== "ogsm") {
            nextLinks.push(link.id ? link : { ...link, id: genId("dlink") });
            continue;
          }
          const key = `${link.periodId ?? ""}|${link.goalId ?? ""}|${link.strategyId ?? ""}`;
          if (seen.has(key)) {
            changed = true;
            continue;
          }
          seen.add(key);
          nextLinks.push(link.id ? link : { ...link, id: genId("dlink") });
          if (!link.id) changed = true;
        }
        if (nextLinks.length !== links.length) changed = true;
        activity.dashboardLinks = nextLinks.length > 0 ? nextLinks : undefined;
      }

      const ogsmLinks = (activity.dashboardLinks ?? []).filter(
        (l) => l.type === "ogsm" && !!l.periodId,
      );
      if (ogsmLinks.length > 0) {
        if (!(activity.frameworks ?? []).includes("ogsm")) {
          activity.frameworks = [...(activity.frameworks ?? []), "ogsm"];
          changed = true;
        }
        const sorted = [...ogsmLinks]
          .map((l) => ({ link: l, period: periodById.get(l.periodId ?? "") }))
          .filter((x) => !!x.period)
          .sort(
            (a, b) =>
              periodSortValue(a.period!.year, a.period!.halfYear) -
              periodSortValue(b.period!.year, b.period!.halfYear),
          );
        const earliestPeriodId = sorted[0]?.link.periodId;
        if (
          earliestPeriodId &&
          activity.lifecycleStartPeriodId !== earliestPeriodId
        ) {
          activity.lifecycleStartPeriodId = earliestPeriodId;
          changed = true;
        }
      }
    }
  }
  return changed;
}

function activityLinkKey(link: {
  activityId: string;
  type: string;
  periodId?: string;
  goalId?: string;
  strategyId?: string;
  exclude?: boolean;
}): string {
  return [
    link.activityId,
    link.type,
    link.periodId ?? "",
    link.goalId ?? "",
    link.strategyId ?? "",
    link.exclude ? "1" : "0",
  ].join("|");
}

function sortById<T extends { id: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * RelationalV1：
 * - 建立並維護 departments[].activityLinks（關聯表）
 * - 與既有 activities[].dashboardLinks 雙向同步（相容期）
 */
export function syncRelationalLinksV1(ws: WorkspaceData): boolean {
  let changed = false;

  for (const dept of ws.departments) {
    const activities = dept.activities ?? [];
    const activityIds = new Set(activities.map((a) => a.id));
    const merged = new Map<string, ActivityDashboardLink>();

    // Seed from existing relation table (drop broken foreign keys)
    for (const rel of dept.activityLinks ?? []) {
      if (!activityIds.has(rel.activityId)) {
        changed = true;
        continue;
      }
      const normalized: ActivityDashboardLink = {
        ...rel,
        id: rel.id || genId("dlink"),
      };
      const key = activityLinkKey(normalized);
      if (!merged.has(key)) merged.set(key, normalized);
      else changed = true;
    }

    // Merge links from activity records into relation table
    for (const activity of activities) {
      for (const link of activity.dashboardLinks ?? []) {
        const normalized: ActivityDashboardLink = {
          ...link,
          id: link.id || genId("dlink"),
          activityId: activity.id,
        };
        const key = activityLinkKey(normalized);
        if (!merged.has(key)) {
          merged.set(key, normalized);
          changed = true;
        }
      }
    }

    const mergedLinks = sortById(Array.from(merged.values()));
    const prevLinks = sortById([...(dept.activityLinks ?? [])]);
    if (JSON.stringify(prevLinks) !== JSON.stringify(mergedLinks)) {
      dept.activityLinks = mergedLinks.length > 0 ? mergedLinks : undefined;
      changed = true;
    }

    // Hydrate compatibility field: activity.dashboardLinks from relation table
    for (const activity of activities) {
      const relForActivity = mergedLinks
        .filter((l) => l.activityId === activity.id)
        .map(({ activityId: _activityId, ...link }): DashboardLink => link);
      const nextDashboardLinks =
        relForActivity.length > 0 ? sortById(relForActivity) : undefined;
      const prevDashboardLinks = activity.dashboardLinks
        ? sortById(activity.dashboardLinks)
        : undefined;
      if (
        JSON.stringify(prevDashboardLinks ?? []) !==
        JSON.stringify(nextDashboardLinks ?? [])
      ) {
        activity.dashboardLinks = nextDashboardLinks;
        changed = true;
      }
    }
  }

  return changed;
}

export function normalizeWorkspaceData(ws: WorkspaceData): boolean {
  let changed = false;
  // One-time heavy migrations — gated by _migratedPhase2 so they run only once
  if (!ws._migratedPhase2) {
    if (migrateSyncDuplicates(ws)) changed = true;
    if (migratePlanItemDateFields(ws)) changed = true;
    for (const dept of ws.departments) {
      for (const period of dept.periods) {
        for (const goal of period.ogsm.goals) {
          for (const strategy of goal.strategies) {
            if (migrateMeasureDateRangeFromPlanItems(strategy)) changed = true;
          }
        }
      }
    }
    if (migrateActionPlansFromQText(ws)) changed = true;
    ws._migratedPhase2 = true;
    changed = true;
  }
  if (!ws._migratedPhase3) {
    if (migrateOwnerToOwners(ws)) changed = true;
    ws._migratedPhase3 = true;
    changed = true;
  }
  if (!ws._migratedActivityFirst) {
    if (migrateToActivityFirst(ws)) changed = true;
    ws._migratedActivityFirst = true;
    changed = true;
  }
  if (!ws._migratedV3) {
    if (migrateToV3(ws)) changed = true;
    ws._migratedV3 = true;
    changed = true;
  }
  if (!ws._migratedFrameworksV1) {
    if (migrateFrameworksV1(ws)) changed = true;
    ws._migratedFrameworksV1 = true;
    changed = true;
  }
  if (!ws._migratedTimelineV1) {
    if (migrateTimelineV1(ws)) changed = true;
    ws._migratedTimelineV1 = true;
    changed = true;
  }
  if (!ws._migratedRelationalV1) {
    ws._migratedRelationalV1 = true;
    changed = true;
  }
  if (syncRelationalLinksV1(ws)) changed = true;
  // Always-run invariant: ensure owners is always an array regardless of migration state.
  // Guards against externally-modified or imported files where owners may be missing.
  for (const dept of ws.departments) {
    for (const period of dept.periods) {
      for (const goal of period.ogsm.goals) {
        for (const strategy of goal.strategies) {
          if (!Array.isArray(strategy.owners)) {
            strategy.owners = [];
            changed = true;
          }
        }
      }
    }
  }
  return changed;
}

/**
 * 對單一 Strategy 物件執行所有遷移與不變量修正。
 * 供 normalizeOGSMData（匯入單一檔案）與 normalizeWorkspaceData（完整工作區）共用，
 * 避免邏輯重複。
 */
export function normalizeOneStrategy(strategy: Strategy): boolean {
  let changed = false;
  // Plan item date field migration
  for (const ap of strategy.actionPlans) {
    for (const item of ap.items) {
      const raw = item as unknown as Record<string, unknown>;
      const hasLegacy =
        "date" in raw ||
        "startDate" in raw ||
        "endDate" in raw ||
        "plannedStartDate" in raw ||
        "actualStartDate" in raw;
      if (hasLegacy) {
        if (!item.plannedEndDate) {
          item.plannedEndDate =
            toIsoDateLoose(
              (raw.endDate as string | undefined) ??
                (raw.plannedEndDate as string | undefined) ??
                (raw.startDate as string | undefined) ??
                (raw.date as string | undefined),
            ) ?? undefined;
        }
        delete raw.date;
        delete raw.startDate;
        delete raw.endDate;
        delete raw.plannedStartDate;
        delete raw.actualStartDate;
        changed = true;
      }
    }
  }
  // Measure date range derivation from plan items
  if (migrateMeasureDateRangeFromPlanItems(strategy)) changed = true;
  // owner (legacy scalar) → owners (array)
  if ((!strategy.owners || strategy.owners.length === 0) && strategy.owner) {
    strategy.owners = [strategy.owner];
    changed = true;
  }
  if (strategy.owner !== undefined) {
    (strategy as { owner?: string | undefined }).owner = undefined;
    changed = true;
  }
  // Always ensure owners is an array (guards against externally-modified files)
  if (!Array.isArray(strategy.owners)) {
    strategy.owners = [];
    changed = true;
  }
  return changed;
}

function normalizeOGSMData(ogsm: OGSMData): boolean {
  let changed = false;
  for (const goal of ogsm.goals) {
    for (const strategy of goal.strategies) {
      if (normalizeOneStrategy(strategy)) changed = true;
    }
  }
  return changed;
}

export function loadLegacyData(): OGSMData | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const ogsm: OGSMData = JSON.parse(raw);
    normalizeOGSMData(ogsm);
    validateOrWarn(OGSMDataSchema, ogsm, "loadLegacyData");
    return ogsm;
  } catch {
    return null;
  }
}

export function wrapOGSMInWorkspace(
  ogsm: OGSMData,
  deptName = "部門一",
): WorkspaceData {
  const halfYear: "H1" | "H2" = ogsm.period.includes("H2") ? "H2" : "H1";
  const yearMatch = ogsm.period.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
  const period: PeriodData = {
    id: genId("period"),
    halfYear,
    year,
    ogsm: { ...ogsm, period: `${year} ${halfYear}` },
  };
  const dept: Department = {
    id: genId("dept"),
    name: deptName,
    periods: [period],
  };
  return { departments: [dept], version: 1 };
}

export function exportWorkspaceJSON(ws: WorkspaceData): void {
  const toExport: WorkspaceData = JSON.parse(JSON.stringify(ws));
  normalizeWorkspaceData(toExport);
  const blob = new Blob([JSON.stringify(toExport, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ogsm_workspace_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 解析並驗證 JSON 字串，回傳合法的 WorkspaceData 或 OGSMData。
 * 解析/驗證失敗時拋出 Error（含詳細訊息）。
 * 此函式為純函式，可直接在單元測試中呼叫。
 */
export function parseAndValidateJSON(text: string): OGSMData | WorkspaceData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON file");
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { departments?: unknown[] }).departments)
  ) {
    normalizeWorkspaceData(parsed as WorkspaceData);
    const r = WorkspaceDataSchema.safeParse(parsed);
    if (!r.success) {
      throw new Error(`工作區格式不符：${r.error.message}`);
    }
    return r.data;
  }
  if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { goals?: unknown[] }).goals)
  ) {
    normalizeOGSMData(parsed as OGSMData);
    const r = OGSMDataSchema.safeParse(parsed);
    if (!r.success) {
      throw new Error(`OGSM 資料格式不符：${r.error.message}`);
    }
    return r.data;
  }
  throw new Error("不支援的 JSON 格式：請選擇 OGSM 或工作區檔案");
}

export function importJSON(file: File): Promise<OGSMData | WorkspaceData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (result == null) {
          reject(new Error("Failed to read file"));
          return;
        }
        resolve(parseAndValidateJSON(result as string));
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Invalid JSON file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (result == null) {
        reject(new Error("Failed to read file"));
        return;
      }
      resolve(result as string);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file, "utf-8");
  });
}
