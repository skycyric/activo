import { describe, expect, test } from "vitest";
import { DepartmentSchema, WorkspaceDataSchema } from "./ogsm";

const fixtureModules = import.meta.glob("/test/**/*.json", {
  eager: true,
  import: "default",
}) as Record<string, unknown>;

describe("test fixtures schema compliance", () => {
  test("all JSON files in test/ should match workspace or department schema", () => {
    const files = Object.entries(fixtureModules);
    expect(files.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const [filePath, data] of files) {

      const ws = WorkspaceDataSchema.safeParse(data);
      if (ws.success) continue;

      const dept = DepartmentSchema.safeParse(data);
      if (dept.success) continue;

      failures.push(
        `${filePath}\n- WorkspaceDataSchema: ${ws.error.issues[0]?.message ?? "unknown"}\n- DepartmentSchema: ${dept.error.issues[0]?.message ?? "unknown"}`,
      );
    }

    expect(failures, failures.join("\n\n")).toEqual([]);
  });
});
