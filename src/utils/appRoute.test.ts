import { describe, expect, test } from "vitest";
import {
  buildRouteHash,
  buildNavigationKey,
  normalizeAppRouteState,
  parseRouteHash,
  type AppRouteState,
  type ActivityPageView,
} from "./appRoute";

// ── Fixture ──────────────────────────────────────────────────────────────────

const BASE: AppRouteState = {
  __appRoute: true,
  view: "home",
  activityPageView: "table",
  activityGanttSubView: "activity",
  activeDeptId: "dept-1",
  activePeriodId: "p-1",
  selectedGoalId: null,
  selectedStrategyId: null,
  kpiDesignerGoalId: null,
  pendingActivityDetailId: null,
  expandedDetailActivityId: null,
};

// ── parseRouteHash ────────────────────────────────────────────────────────────

describe("parseRouteHash", () => {
  test("returns null for empty hash", () => {
    expect(parseRouteHash("")).toBeNull();
  });

  test("returns null for unrecognised format", () => {
    expect(parseRouteHash("#foo=bar")).toBeNull();
  });

  test("parses new-format hash with view", () => {
    const result = parseRouteHash("#app/ogsm");
    expect(result?.view).toBe("ogsm");
  });

  test("parses all query params", () => {
    const result = parseRouteHash(
      "#app/activity?d=dept-1&p=p-1&g=g-1&s=s-1&a=act-1&x=act-2&av=kanban&ag=plan",
    );
    expect(result?.view).toBe("activity");
    expect(result?.activeDeptId).toBe("dept-1");
    expect(result?.activePeriodId).toBe("p-1");
    expect(result?.selectedGoalId).toBe("g-1");
    expect(result?.selectedStrategyId).toBe("s-1");
    expect(result?.pendingActivityDetailId).toBe("act-1");
    expect(result?.expandedDetailActivityId).toBe("act-2");
    expect(result?.activityPageView).toBe("kanban");
    expect(result?.activityGanttSubView).toBe("plan");
  });

  test("parses av=graph correctly", () => {
    const result = parseRouteHash("#app/activity?av=graph");
    expect(result?.activityPageView).toBe("graph");
  });

  test("unknown view falls back to 'home'", () => {
    const result = parseRouteHash("#app/unknown_view");
    expect(result?.view).toBe("home");
  });

  test("unknown av is omitted (not set to undefined key)", () => {
    const result = parseRouteHash("#app/activity?av=invalid");
    expect(result?.activityPageView).toBeUndefined();
  });

  test("parses legacy hash format", () => {
    const result = parseRouteHash("#app=1&view=ogsm&dept=d1&period=p1");
    expect(result?.view).toBe("ogsm");
    expect(result?.activeDeptId).toBe("d1");
    expect(result?.activePeriodId).toBe("p1");
  });

  test("leading slash is stripped", () => {
    const result = parseRouteHash("#/app/activity");
    expect(result?.view).toBe("activity");
  });
});

// ── normalizeAppRouteState ────────────────────────────────────────────────────

describe("normalizeAppRouteState", () => {
  const allActivityPageViews: ActivityPageView[] = [
    "table",
    "kanban",
    "gantt",
    "cards",
    "calendar",
    "graph",
  ];

  test.each(allActivityPageViews)(
    'preserves valid activityPageView "%s"',
    (view) => {
      const result = normalizeAppRouteState({ activityPageView: view }, BASE);
      expect(result.activityPageView).toBe(view);
    },
  );

  test('falls back to base activityPageView for invalid value "invalid"', () => {
    const result = normalizeAppRouteState(
      { activityPageView: "invalid" as ActivityPageView },
      BASE,
    );
    expect(result.activityPageView).toBe(BASE.activityPageView);
  });

  test('"graph" view is preserved (regression: was silently dropped)', () => {
    // This is the bug fixed: normalizeAppRouteState previously did not include
    // "graph" in its allowlist, causing av=graph to be silently reset to the
    // base activityPageView.
    const result = normalizeAppRouteState({ activityPageView: "graph" }, BASE);
    expect(result.activityPageView).toBe("graph");
  });

  test("merges view from partial route", () => {
    const result = normalizeAppRouteState({ view: "activity" }, BASE);
    expect(result.view).toBe("activity");
  });

  test("preserves base fields not present in partial route", () => {
    const result = normalizeAppRouteState({ view: "ogsm" }, BASE);
    expect(result.activeDeptId).toBe(BASE.activeDeptId);
    expect(result.activePeriodId).toBe(BASE.activePeriodId);
  });

  test("preserves valid gantt sub-view 'plan'", () => {
    const result = normalizeAppRouteState(
      { activityGanttSubView: "plan" },
      BASE,
    );
    expect(result.activityGanttSubView).toBe("plan");
  });

  test("falls back to base gantt sub-view for invalid value", () => {
    const result = normalizeAppRouteState(
      { activityGanttSubView: "invalid" as "activity" | "plan" },
      BASE,
    );
    expect(result.activityGanttSubView).toBe(BASE.activityGanttSubView);
  });
});

// ── buildRouteHash ────────────────────────────────────────────────────────────

describe("buildRouteHash", () => {
  test("builds minimal hash with no optional params", () => {
    const hash = buildRouteHash(BASE);
    expect(hash).toContain("#app/home");
    expect(hash).toContain("av=table");
    expect(hash).toContain("ag=activity");
  });

  test("includes optional params when set", () => {
    const route: AppRouteState = {
      ...BASE,
      view: "activity",
      activeDeptId: "dept-x",
      activePeriodId: "p-x",
      selectedGoalId: "g-1",
      selectedStrategyId: "s-1",
      pendingActivityDetailId: "act-1",
    };
    const hash = buildRouteHash(route);
    expect(hash).toContain("d=dept-x");
    expect(hash).toContain("p=p-x");
    expect(hash).toContain("g=g-1");
    expect(hash).toContain("s=s-1");
    expect(hash).toContain("a=act-1");
  });

  test("does not include 'a' param when view is not 'activity'", () => {
    const route: AppRouteState = {
      ...BASE,
      view: "ogsm",
      pendingActivityDetailId: "act-1",
    };
    const hash = buildRouteHash(route);
    expect(hash).not.toContain("a=");
  });

  test("round-trips through parseRouteHash (graph view)", () => {
    const route: AppRouteState = {
      ...BASE,
      view: "activity",
      activityPageView: "graph",
    };
    const hash = buildRouteHash(route);
    const parsed = parseRouteHash(hash);
    expect(parsed?.activityPageView).toBe("graph");
  });
});

// ── buildNavigationKey ────────────────────────────────────────────────────────

describe("buildNavigationKey", () => {
  test("includes view, activityPageView, ganttSubView, dept, period", () => {
    const key = buildNavigationKey(BASE);
    const parsed = JSON.parse(key);
    expect(parsed.view).toBe("home");
    expect(parsed.activityPageView).toBe("table");
    expect(parsed.activityGanttSubView).toBe("activity");
    expect(parsed.activeDeptId).toBe("dept-1");
    expect(parsed.activePeriodId).toBe("p-1");
  });

  test("does not include selection state (goal/strategy)", () => {
    const key = buildNavigationKey({
      ...BASE,
      selectedGoalId: "g-1",
      selectedStrategyId: "s-1",
    });
    const parsed = JSON.parse(key);
    expect(parsed.selectedGoalId).toBeUndefined();
    expect(parsed.selectedStrategyId).toBeUndefined();
  });

  test("same nav key for different selection states", () => {
    const key1 = buildNavigationKey({ ...BASE, selectedGoalId: "g-1" });
    const key2 = buildNavigationKey({ ...BASE, selectedGoalId: "g-2" });
    expect(key1).toBe(key2);
  });

  test("different nav key when view changes", () => {
    const key1 = buildNavigationKey({ ...BASE, view: "home" });
    const key2 = buildNavigationKey({ ...BASE, view: "activity" });
    expect(key1).not.toBe(key2);
  });
});
