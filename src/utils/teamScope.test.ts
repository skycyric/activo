import { describe, expect, test } from "vitest";
import type { Team } from "../schemas/ogsm";
import { trackClearedFields } from "./merge";
import {
  getDeptScopedTeams,
  mergeTeamsForDeptInSingleWorkspace,
  normalizeTeamsForDept,
} from "./teamScope";

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "team-1",
    name: "A Team",
    members: [],
    ...overrides,
  };
}

describe("teamScope", () => {
  test("getDeptScopedTeams: multi-file reads active dept entry only", () => {
    const teams = getDeptScopedTeams({
      isMultiFileMode: true,
      activeDeptId: "dept-b",
      deptEntries: [
        {
          workspace: {
            departments: [{ id: "dept-a" }],
            teams: [makeTeam({ id: "a1", deptId: "dept-a" })],
          },
        },
        {
          workspace: {
            departments: [{ id: "dept-b" }],
            teams: [
              makeTeam({ id: "b1", deptId: "dept-b" }),
              makeTeam({ id: "legacy", deptId: undefined }),
              makeTeam({ id: "foreign", deptId: "dept-a" }),
            ],
          },
        },
      ],
      workspaceTeams: [],
    });

    expect(teams.map((t) => t.id)).toEqual(["b1", "legacy"]);
  });

  test("getDeptScopedTeams: falls back to first entry when active dept not found", () => {
    const teams = getDeptScopedTeams({
      isMultiFileMode: true,
      activeDeptId: "dept-x",
      deptEntries: [
        {
          workspace: {
            departments: [{ id: "dept-a" }],
            teams: [makeTeam({ id: "a1", deptId: "dept-a" })],
          },
        },
      ],
      workspaceTeams: [],
    });

    expect(teams.map((t) => t.id)).toEqual(["a1"]);
  });

  test("normalizeTeamsForDept: stamps deptId and updatedAt for changed teams", () => {
    const prevTeams = [
      makeTeam({
        id: "t1",
        name: "old",
        deptId: "dept-a",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ];

    const result = normalizeTeamsForDept({
      inputTeams: [makeTeam({ id: "t1", name: "new" })],
      deptId: "dept-a",
      prevTeams,
      nowIso: "2026-04-28T00:00:00.000Z",
      trackClearedFields,
    });

    expect(result).toHaveLength(1);
    expect(result[0].deptId).toBe("dept-a");
    expect(result[0].updatedAt).toBe("2026-04-28T00:00:00.000Z");
    expect(result[0].name).toBe("new");
  });

  test("mergeTeamsForDeptInSingleWorkspace: keeps other dept teams untouched", () => {
    const existingTeams = [
      makeTeam({ id: "a1", deptId: "dept-a", name: "A team" }),
      makeTeam({ id: "b1", deptId: "dept-b", name: "B team" }),
    ];

    const merged = mergeTeamsForDeptInSingleWorkspace({
      existingTeams,
      deptId: "dept-a",
      nextTeams: [makeTeam({ id: "a2", name: "A new" })],
      nowIso: "2026-04-28T00:00:00.000Z",
      trackClearedFields,
    });

    expect(merged.find((t) => t.id === "b1")?.deptId).toBe("dept-b");
    expect(merged.find((t) => t.id === "a2")?.deptId).toBe("dept-a");
    expect(merged.some((t) => t.id === "a1")).toBe(false);
  });
});
