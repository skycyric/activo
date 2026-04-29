import { describe, expect, test } from "vitest";

const testSources = import.meta.glob(
  ["/src/**/*.test.ts", "/src/**/*.test.tsx"],
  {
    eager: true,
    query: "?raw",
    import: "default",
  },
) as Record<string, string>;

const ALLOWLIST = new Set(["src/utils/storage.test.ts"]);

describe("test mock data schema guard", () => {
  test("schema model mocks should not use unknown-cast outside allowlist", () => {
    const violations: string[] = [];
    const castPattern =
      /as\s+unknown\s+as\s+(DeptActivity|WorkspaceData|ActivityPlanItem|KPI|PlanItem|DashboardLink|GoalKpiLink|Strategy|GoalKPI)/g;

    for (const [path, text] of Object.entries(testSources)) {
      const rel = path.replace(/^\//, "");

      if (ALLOWLIST.has(rel)) continue;

      let match: RegExpExecArray | null;
      while ((match = castPattern.exec(text)) !== null) {
        violations.push(`${rel}: ${match[0]}`);
      }
    }

    expect(violations, violations.join("\n")).toEqual([]);
  });
});
