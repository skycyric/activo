/**
 * App-level route utilities (pure functions, no React dependency).
 *
 * Extracted so they can be unit-tested without rendering the full App component.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type AppRouteView =
  | "home"
  | "activity"
  | "ogsm"
  | "settings"
  | "tags"
  | "kpi";

export type ActivityPageView =
  | "table"
  | "kanban"
  | "gantt"
  | "cards"
  | "calendar"
  | "graph";

export type ActivityGanttSubView = "activity" | "plan";

export interface ActivityRouteHint {
  activityPageView?: ActivityPageView;
  activityGanttSubView?: ActivityGanttSubView;
}

export interface AppRouteState {
  __appRoute: true;
  view: AppRouteView;
  activityPageView: ActivityPageView;
  activityGanttSubView: ActivityGanttSubView;
  activeDeptId: string;
  activePeriodId: string;
  selectedGoalId: string | null;
  selectedStrategyId: string | null;
  kpiDesignerGoalId: string | null;
  pendingActivityDetailId: string | null;
  expandedDetailActivityId: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_VIEWS: AppRouteView[] = [
  "home",
  "activity",
  "ogsm",
  "settings",
  "tags",
  "kpi",
];

const VALID_ACTIVITY_PAGE_VIEWS: ActivityPageView[] = [
  "table",
  "kanban",
  "gantt",
  "cards",
  "calendar",
  "graph", // NOTE: must stay in sync with ActivityPageView type above
];

const VALID_GANTT_SUB_VIEWS: ActivityGanttSubView[] = ["activity", "plan"];

function isValidView(v: string): v is AppRouteView {
  return (VALID_VIEWS as string[]).includes(v);
}

function isValidActivityPageView(v: string): v is ActivityPageView {
  return (VALID_ACTIVITY_PAGE_VIEWS as string[]).includes(v);
}

function isValidGanttSubView(v: string): v is ActivityGanttSubView {
  return (VALID_GANTT_SUB_VIEWS as string[]).includes(v);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildRouteHash(route: AppRouteState): string {
  const params = new URLSearchParams();
  if (route.activeDeptId) params.set("d", route.activeDeptId);
  if (route.activePeriodId) params.set("p", route.activePeriodId);
  params.set("av", route.activityPageView);
  params.set("ag", route.activityGanttSubView);
  if (route.selectedGoalId) params.set("g", route.selectedGoalId);
  if (route.selectedStrategyId) params.set("s", route.selectedStrategyId);
  if (route.kpiDesignerGoalId) params.set("kg", route.kpiDesignerGoalId);
  if (route.view === "activity" && route.pendingActivityDetailId)
    params.set("a", route.pendingActivityDetailId);
  if (route.expandedDetailActivityId)
    params.set("x", route.expandedDetailActivityId);

  const query = params.toString();
  return query ? `#app/${route.view}?${query}` : `#app/${route.view}`;
}

export function parseRouteHash(hash: string): Partial<AppRouteState> | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const normalizedRaw = raw.startsWith("/") ? raw.slice(1) : raw;

  // New readable format: #app/<view>?d=...&p=...&g=...&s=...&kg=...&a=...&x=...
  if (normalizedRaw.startsWith("app/")) {
    const [pathPart, queryPart] = normalizedRaw.split("?");
    const viewPart = pathPart.split("/")[1] ?? "";
    const view: AppRouteView = isValidView(viewPart) ? viewPart : "home";

    const params = new URLSearchParams(queryPart ?? "");
    const avParam = params.get("av");
    const agParam = params.get("ag");

    const parsedActivityPageView: ActivityPageView | undefined =
      avParam && isValidActivityPageView(avParam) ? avParam : undefined;
    const parsedActivityGanttSubView: ActivityGanttSubView | undefined =
      agParam && isValidGanttSubView(agParam) ? agParam : undefined;

    const route: Partial<AppRouteState> = {
      __appRoute: true,
      view,
      activeDeptId: params.get("d") ?? "",
      activePeriodId: params.get("p") ?? "",
      selectedGoalId: params.get("g"),
      selectedStrategyId: params.get("s"),
      kpiDesignerGoalId: params.get("kg"),
      pendingActivityDetailId: params.get("a"),
      expandedDetailActivityId: params.get("x"),
    };
    if (parsedActivityPageView) {
      route.activityPageView = parsedActivityPageView;
    }
    if (parsedActivityGanttSubView) {
      route.activityGanttSubView = parsedActivityGanttSubView;
    }
    return route;
  }

  // Legacy format backward compatibility: #app=1&view=...
  const params = new URLSearchParams(raw);
  if (params.get("app") !== "1") return null;

  const viewParam = params.get("view");
  const view: AppRouteView =
    viewParam && isValidView(viewParam) ? viewParam : "home";

  return {
    __appRoute: true,
    view,
    activeDeptId: params.get("dept") ?? "",
    activePeriodId: params.get("period") ?? "",
    selectedGoalId: params.get("goal"),
    selectedStrategyId: params.get("strategy"),
    kpiDesignerGoalId: params.get("kpiGoal"),
    pendingActivityDetailId: params.get("activity"),
    expandedDetailActivityId: null,
  };
}

export function normalizeAppRouteState(
  route: Partial<AppRouteState>,
  base: AppRouteState,
): AppRouteState {
  const merged = {
    ...base,
    ...route,
    __appRoute: true as const,
  };

  // Validate activityPageView — must include ALL valid views (including "graph")
  const activityPageView: ActivityPageView = isValidActivityPageView(
    merged.activityPageView,
  )
    ? merged.activityPageView
    : base.activityPageView;

  const activityGanttSubView: ActivityGanttSubView = isValidGanttSubView(
    merged.activityGanttSubView,
  )
    ? merged.activityGanttSubView
    : base.activityGanttSubView;

  return {
    ...merged,
    activityPageView,
    activityGanttSubView,
  };
}

export function buildNavigationKey(route: AppRouteState): string {
  // Keep browser back aligned with page-level navigation only.
  // Do not include OGSM internal selection state (goal/strategy/detail panel).
  return JSON.stringify({
    view: route.view,
    activityPageView: route.activityPageView,
    activityGanttSubView: route.activityGanttSubView,
    activeDeptId: route.activeDeptId,
    activePeriodId: route.activePeriodId,
  });
}
