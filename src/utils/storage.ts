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
  type TagDictionaryItem,
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

export type SaveWorkspaceResult =
  | { ok: true }
  | { ok: false; error: "quota_exceeded" | "unknown" };

export function saveWorkspace(ws: WorkspaceData): SaveWorkspaceResult {
  try {
    const copy = structuredClone(ws);
    normalizeWorkspaceData(copy);
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(copy));
    return { ok: true };
  } catch (e) {
    console.error("Failed to save workspace", e);
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      return { ok: false, error: "quota_exceeded" };
    }
    return { ok: false, error: "unknown" };
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

function inferActivityPeriodId(
  activity: DeptActivity,
  periodById: Map<string, PeriodData>,
): string | undefined {
  if (
    activity.lifecycleStartPeriodId &&
    periodById.has(activity.lifecycleStartPeriodId)
  ) {
    return activity.lifecycleStartPeriodId;
  }

  const ogsmPeriodIds = Array.from(
    new Set(
      (activity.dashboardLinks ?? [])
        .filter((link) => link.type === "ogsm" && !!link.periodId)
        .map((link) => link.periodId as string)
        .filter((periodId) => periodById.has(periodId)),
    ),
  );
  if (ogsmPeriodIds.length === 1) {
    return ogsmPeriodIds[0];
  }

  return periodById.keys().next().value;
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

/**
 * TimelineV2：
 * 1) 對舊 planItems 補齊 periodId
 * 2) 優先使用 activity lifecycle，否則回退到可推導的 OGSM / 部門第一個 period
 */
export function migrateTimelineV2(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    const periodById = new Map(dept.periods.map((p) => [p.id, p]));
    const firstPeriodId = dept.periods[0]?.id;
    for (const activity of dept.activities ?? []) {
      const fallbackPeriodId =
        inferActivityPeriodId(activity, periodById) ?? firstPeriodId;
      if (!fallbackPeriodId || !activity.planItems?.length) continue;
      activity.planItems = activity.planItems.map((item) => {
        if (item.periodId) return item;
        changed = true;
        return { ...item, periodId: fallbackPeriodId };
      });
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
 * C1: 屬性順序固定的序列化，避免 JSON.stringify 因物件 spread 順序不同
 * 而在每次 load 都觸發無謂的 dirty → save，進而干擾 OneDrive conflict copy 偵測。
 */
function stableStringifyLinks(links: ActivityDashboardLink[]): string {
  return links
    .map((l) =>
      JSON.stringify({
        id: l.id,
        activityId: l.activityId,
        type: l.type,
        periodId: l.periodId ?? null,
        goalId: l.goalId ?? null,
        strategyId: l.strategyId ?? null,
        exclude: l.exclude ?? false,
      }),
    )
    .join(",");
}

function stableStringifyDashboardLinks(links: DashboardLink[]): string {
  return links
    .map((l) =>
      JSON.stringify({
        id: l.id,
        type: l.type,
        periodId: l.periodId ?? null,
        goalId: l.goalId ?? null,
        strategyId: l.strategyId ?? null,
        exclude: l.exclude ?? false,
      }),
    )
    .join(",");
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
    if (stableStringifyLinks(prevLinks) !== stableStringifyLinks(mergedLinks)) {
      dept.activityLinks = mergedLinks.length > 0 ? mergedLinks : undefined;
      changed = true;
    }

    // Hydrate compatibility field: activity.dashboardLinks from relation table
    for (const activity of activities) {
      const relForActivity = mergedLinks
        .filter((l) => l.activityId === activity.id)
        .map(
          (link): DashboardLink => ({
            id: link.id,
            type: link.type,
            periodId: link.periodId,
            goalId: link.goalId,
            strategyId: link.strategyId,
            exclude: link.exclude,
          }),
        );
      const nextDashboardLinks =
        relForActivity.length > 0 ? sortById(relForActivity) : undefined;
      const prevDashboardLinks = activity.dashboardLinks
        ? sortById(activity.dashboardLinks)
        : undefined;
      if (
        stableStringifyDashboardLinks(prevDashboardLinks ?? []) !==
        stableStringifyDashboardLinks(nextDashboardLinks ?? [])
      ) {
        activity.dashboardLinks = nextDashboardLinks;
        changed = true;
      }
    }
  }

  return changed;
}

type WorkspaceMigrationFlag =
  | "_migratedPhase2"
  | "_migratedPhase3"
  | "_migratedActivityFirst"
  | "_migratedV3"
  | "_migratedFrameworksV1"
  | "_migratedTimelineV1"
  | "_migratedTimelineV2"
  | "_migratedRelationalV1";

type WorkspaceFlaggedMigration = {
  flag: WorkspaceMigrationFlag;
  description: string;
  sunset: string;
  run: (ws: WorkspaceData) => boolean;
};

type WorkspaceAlwaysRunNormalizer = {
  description: string;
  run: (ws: WorkspaceData) => boolean;
};

function runPhase2Migrations(ws: WorkspaceData): boolean {
  let changed = false;
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
  return changed;
}

function normalizeWorkspaceOwnerArraysInvariant(ws: WorkspaceData): boolean {
  let changed = false;
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

function normalizeWorkspaceGoalKpiLinksInvariant(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    for (const period of dept.periods) {
      for (const goal of period.ogsm.goals) {
        if (
          normalizeGoalKpiLinks(goal as unknown as { goalKpis?: unknown[] })
        ) {
          changed = true;
        }
      }
    }
  }
  return changed;
}

/**
 * A2: 清除 KPI.achievementRate 計算快照，避免持久化過期值。
 * achievementRate 應在執行期由 computeKpiAchievement() 重新計算，不應存磁碟。
 */
function stripAchievementRates(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    for (const activity of dept.activities ?? []) {
      for (const kpi of activity.kpis ?? []) {
        if (kpi.achievementRate !== null) {
          kpi.achievementRate = null;
          changed = true;
        }
      }
    }
  }
  return changed;
}

function stripCompatWriteForbiddenDeprecatedFields(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    for (const activity of dept.activities ?? []) {
      if (activity.ogsmLink !== undefined) {
        activity.ogsmLink = undefined;
        changed = true;
      }
      if (activity.excludeFromOgsm !== undefined) {
        activity.excludeFromOgsm = undefined;
        changed = true;
      }
      if (activity.actionPlans !== undefined) {
        activity.actionPlans = undefined;
        changed = true;
      }
    }
    // A3: 若 dept.activities 已有資料，strategy.measures[] 是殭屍欄位，應清空
    // 避免 migrateToActivityFirst 在下次 load 時重複觸發產生重複活動
    if ((dept.activities?.length ?? 0) > 0) {
      for (const period of dept.periods) {
        for (const goal of period.ogsm.goals) {
          for (const strategy of goal.strategies) {
            if (strategy.measures.length > 0) {
              strategy.measures = [];
              changed = true;
            }
          }
        }
      }
    }
  }

  return changed;
}

function applyWorkspaceFlaggedMigration(
  ws: WorkspaceData,
  migration: WorkspaceFlaggedMigration,
): boolean {
  if (ws[migration.flag]) return false;

  migration.run(ws);
  ws[migration.flag] = true;
  return true;
}

function normalizeTagLabel(label: string | undefined): string {
  return (label ?? "").trim().replace(/\s+/g, " ");
}

function normalizeWorkspaceTagDictionary(ws: WorkspaceData): boolean {
  const byName = new Map<string, TagDictionaryItem>();
  let changed = false;

  for (const rawItem of ws.tagDictionary ?? []) {
    const name = normalizeTagLabel(rawItem.name);
    if (!name) {
      changed = true;
      continue;
    }

    const aliases = Array.from(
      new Set(
        (rawItem.aliases ?? [])
          .map((alias) => normalizeTagLabel(alias))
          .filter(Boolean),
      ),
    );
    const normalized: TagDictionaryItem = {
      ...rawItem,
      name,
      aliases: aliases.length > 0 ? aliases : undefined,
      status: rawItem.status === "disabled" ? "disabled" : "active",
    };
    const key = name.toLocaleLowerCase("zh-TW");
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, normalized);
      if (
        normalized.name !== rawItem.name ||
        JSON.stringify(normalized.aliases ?? []) !==
          JSON.stringify(rawItem.aliases ?? []) ||
        normalized.status !== rawItem.status
      ) {
        changed = true;
      }
      continue;
    }

    const mergedAliases = Array.from(
      new Set([...(existing.aliases ?? []), ...(normalized.aliases ?? [])]),
    );
    byName.set(key, {
      ...existing,
      aliases: mergedAliases.length > 0 ? mergedAliases : undefined,
      status:
        existing.status === "active" || normalized.status === "active"
          ? "active"
          : "disabled",
      updatedAt: normalized.updatedAt ?? existing.updatedAt,
    });
    changed = true;
  }

  for (const dept of ws.departments) {
    for (const activity of dept.activities ?? []) {
      const normalizedTags = Array.from(
        new Set(
          (activity.tags ?? [])
            .map((tag) => normalizeTagLabel(tag))
            .filter(Boolean),
        ),
      );
      if (
        JSON.stringify(normalizedTags) !== JSON.stringify(activity.tags ?? [])
      ) {
        activity.tags = normalizedTags.length > 0 ? normalizedTags : undefined;
        changed = true;
      }

      for (const tag of normalizedTags) {
        const key = tag.toLocaleLowerCase("zh-TW");
        if (!byName.has(key)) {
          byName.set(key, {
            id: genId("tag"),
            name: tag,
            status: "active",
            updatedAt: new Date().toISOString(),
          });
          changed = true;
        }
      }
    }
  }

  const nextDictionary = Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "zh-TW"),
  );

  if (nextDictionary.length === 0) {
    if (ws.tagDictionary !== undefined) {
      ws.tagDictionary = undefined;
      changed = true;
    }
    return changed;
  }

  if (
    JSON.stringify(ws.tagDictionary ?? []) !== JSON.stringify(nextDictionary)
  ) {
    ws.tagDictionary = nextDictionary;
    changed = true;
  }

  return changed;
}

export const WORKSPACE_FLAGGED_MIGRATIONS: readonly WorkspaceFlaggedMigration[] =
  [
    {
      flag: "_migratedPhase2",
      description:
        "Legacy plan-item/date/action-plan cleanup before modern models.",
      sunset:
        "Remove after all persisted workspaces are guaranteed to be post-Phase2.",
      run: runPhase2Migrations,
    },
    {
      flag: "_migratedPhase3",
      description:
        "Owner field migration from deprecated owner to canonical owners[]",
      sunset:
        "Remove after deprecated strategy.owner is no longer load-compatible.",
      run: migrateOwnerToOwners,
    },
    {
      flag: "_migratedActivityFirst",
      description:
        "Promote strategy.measures into canonical dept.activities records.",
      sunset:
        "Remove after activity-first is the only supported persisted activity shape.",
      run: migrateToActivityFirst,
    },
    {
      flag: "_migratedV3",
      description:
        "Upgrade OGSM links and plan structures to dashboardLinks + planItems.",
      sunset:
        "Remove after legacy ogsmLink/excludeFromOgsm/actionPlans are unsupported.",
      run: migrateToV3,
    },
    {
      flag: "_migratedFrameworksV1",
      description: "Backfill frameworks for activity-first records.",
      sunset:
        "Remove after frameworks are always materialized by writers/importers.",
      run: migrateFrameworksV1,
    },
    {
      flag: "_migratedTimelineV1",
      description: "Backfill timeline and OGSM link ordering metadata.",
      sunset:
        "Remove after timeline defaults are guaranteed in all persisted workspaces.",
      run: migrateTimelineV1,
    },
    {
      flag: "_migratedTimelineV2",
      description:
        "Backfill periodId onto flat plan items for cross-year timeline validation.",
      sunset: "Remove after all persisted planItems always include periodId.",
      run: migrateTimelineV2,
    },
    {
      flag: "_migratedRelationalV1",
      description:
        "Record that relational activityLinks compatibility has been initialized.",
      sunset:
        "Remove only after activityLinks becomes canonical and dashboardLinks compatibility is retired.",
      run: () => false,
    },
  ] as const;

const WORKSPACE_ALWAYS_RUN_NORMALIZERS: readonly WorkspaceAlwaysRunNormalizer[] =
  [
    {
      description:
        "Strip computed achievementRate snapshots before persisting (stale values must be recomputed at runtime).",
      run: stripAchievementRates,
    },
    {
      description:
        "Enforce compat-write forbidden policy for deprecated legacy fields.",
      run: stripCompatWriteForbiddenDeprecatedFields,
    },
    {
      description:
        "RelationalV1 compatibility sync between dept.activityLinks and activity.dashboardLinks.",
      run: syncRelationalLinksV1,
    },
    {
      description:
        "GoalKPI link invariant repair for imported or externally edited files.",
      run: normalizeWorkspaceGoalKpiLinksInvariant,
    },
    {
      description:
        "owners[] invariant repair for imported or externally edited files.",
      run: normalizeWorkspaceOwnerArraysInvariant,
    },
    {
      description:
        "Tag dictionary invariant repair for controlled activity tags.",
      run: normalizeWorkspaceTagDictionary,
    },
  ] as const;

export function normalizeWorkspaceData(ws: WorkspaceData): boolean {
  let changed = false;

  for (const migration of WORKSPACE_FLAGGED_MIGRATIONS) {
    if (applyWorkspaceFlaggedMigration(ws, migration)) {
      changed = true;
    }
  }

  for (const normalizer of WORKSPACE_ALWAYS_RUN_NORMALIZERS) {
    if (normalizer.run(ws)) {
      changed = true;
    }
  }

  return changed;
}

function normalizeGoalKpiLinks(
  goalLike: { goalKpis?: unknown[] } | null | undefined,
): boolean {
  if (!goalLike || !Array.isArray(goalLike.goalKpis)) return false;
  let goalChanged = false;
  for (const gk of goalLike.goalKpis) {
    const gkRaw = gk as Record<string, unknown>;
    if (!Array.isArray(gkRaw.linkedKpis)) {
      gkRaw.linkedKpis = [];
      goalChanged = true;
      continue;
    }

    const repairedLinks: Array<{ activityId: string; kpiId: string }> = [];
    for (const link of gkRaw.linkedKpis as unknown[]) {
      const raw = link as Record<string, unknown>;
      const activityIdRaw = raw.activityId;
      const legacyMeasureIdRaw = raw.measureId;
      const kpiIdRaw = raw.kpiId;

      const activityId =
        typeof activityIdRaw === "string" && activityIdRaw.trim()
          ? activityIdRaw
          : typeof legacyMeasureIdRaw === "string" && legacyMeasureIdRaw.trim()
            ? legacyMeasureIdRaw
            : "";
      const kpiId =
        typeof kpiIdRaw === "string" && kpiIdRaw.trim() ? kpiIdRaw : "";

      if (!activityId || !kpiId) {
        goalChanged = true;
        continue;
      }
      repairedLinks.push({ activityId, kpiId });
    }

    if (
      repairedLinks.length !== (gkRaw.linkedKpis as unknown[]).length ||
      repairedLinks.some((l, i) => {
        const prev = (gkRaw.linkedKpis as unknown[])[i] as Record<
          string,
          unknown
        >;
        return prev.activityId !== l.activityId || prev.kpiId !== l.kpiId;
      })
    ) {
      gkRaw.linkedKpis = repairedLinks;
      goalChanged = true;
    }
  }
  return goalChanged;
}

/**
 * 對單一 Strategy 物件執行所有遷移與不變量修正。
 * 供 normalizeOGSMData（匯入單一檔案）與 normalizeWorkspaceData（完整工作區）共用，
 * 避免邏輯重複。
 */
export function normalizeOneStrategy(strategy: Strategy): boolean {
  let changed = false;
  // Guard against malformed data where actionPlans may be undefined
  if (!Array.isArray(strategy.actionPlans)) {
    strategy.actionPlans = [];
    changed = true;
  }
  if (!Array.isArray(strategy.owners)) {
    strategy.owners = [];
    changed = true;
  }
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
    const goalRaw = goal as unknown as Record<string, unknown>;
    if (!Array.isArray(goalRaw.goalKpis)) {
      goalRaw.goalKpis = [];
      changed = true;
    }
    if (normalizeGoalKpiLinks(goalRaw as { goalKpis?: unknown[] })) {
      changed = true;
    }
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
