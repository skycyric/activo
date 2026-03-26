import { describe, test, expect } from "vitest";
import { detectConflicts, mergeWorkspaces } from "./merge";
import type { WorkspaceData, Strategy, Goal } from "../types/ogsm";

// ─── 測試資料工廠 ──────────────────────────────────────────────────────────────

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: "s1",
    title: "策略A",
    rawText: "",
    measures: [],
    q1Text: "",
    q2Text: "",
    actionPlans: [],
    owner: "",
    notes: "",
    completionRate: 0,
    manualRate: null,
    status: "not-started",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeGoal(strategies: Strategy[], overrides: Partial<Goal> = {}): Goal {
  return {
    id: "g1",
    label: "G1",
    title: "目標A",
    fullText: "",
    strategies,
    completionRate: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeWorkspace(goals: Goal[]): WorkspaceData {
  return {
    version: 1,
    departments: [
      {
        id: "dept1",
        name: "部門A",
        periods: [
          {
            id: "period1",
            halfYear: "H1",
            year: 2026,
            ogsm: {
              objectives: { orgO: "", deptO: "" },
              goals,
              period: "2026 H1",
              importedAt: "2026-01-01T00:00:00.000Z",
              overallRate: 0,
            },
          },
        ],
      },
    ],
    teams: [],
  };
}

// ─── detectConflicts ───────────────────────────────────────────────────────────

describe("detectConflicts", () => {
  test("兩側完全相同 → 無衝突", () => {
    const ws = makeWorkspace([makeGoal([makeStrategy()])]);
    const result = detectConflicts(ws, structuredClone(ws));
    expect(result).toHaveLength(0);
  });

  test("策略 title 不同且 updatedAt 不同 → 有衝突", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "本地版本",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "遠端版本",
          updatedAt: "2026-01-03T00:00:00.000Z",
        }),
      ]),
    ]);
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].entityType).toBe("strategy");
    expect(result[0].fieldDiffs[0].field).toBe("title");
    expect(result[0].fieldDiffs[0].localVal).toBe("本地版本");
    expect(result[0].fieldDiffs[0].remoteVal).toBe("遠端版本");
  });

  test("策略 updatedAt 相同 → 不算衝突（相同版本）", () => {
    const sameTime = "2026-01-02T00:00:00.000Z";
    const local = makeWorkspace([
      makeGoal([makeStrategy({ title: "本地版本", updatedAt: sameTime })]),
    ]);
    const remote = makeWorkspace([
      makeGoal([makeStrategy({ title: "遠端版本", updatedAt: sameTime })]),
    ]);
    // 相同 updatedAt → detectConflicts 不認為是衝突
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(0);
  });

  test("策略 notes 不同 → fieldDiff 包含 notes", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          notes: "舊備註",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          notes: "新備註",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    const notesDiff = result[0].fieldDiffs.find((d) => d.field === "notes");
    expect(notesDiff).toBeDefined();
  });

  test("目標 title 不同 → goal 衝突", () => {
    const local = makeWorkspace([
      makeGoal([], {
        title: "本地目標",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);
    const remote = makeWorkspace([
      makeGoal([], {
        title: "遠端目標",
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
    ]);
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].entityType).toBe("goal");
  });

  test("被刪除的策略不算衝突", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({ title: "舊版", updatedAt: "2026-01-01T00:00:00.000Z" }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({ title: "新版", updatedAt: "2026-01-02T00:00:00.000Z" }),
      ]),
    ]);
    // 在 local 的 deletedIds 標記 s1 被刪除
    local.deletedIds = ["s1"];
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(0);
  });

  test("多個策略各有衝突 → 全部回報", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          id: "s1",
          title: "S1-本地",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
        makeStrategy({
          id: "s2",
          title: "S2-本地",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          id: "s1",
          title: "S1-遠端",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
        makeStrategy({
          id: "s2",
          title: "S2-遠端",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(2);
  });
});

// ─── mergeWorkspaces — 無衝突情境 ─────────────────────────────────────────────

describe("mergeWorkspaces — 自動合併", () => {
  test("兩側無差異 → autoMerged = 0", () => {
    const ws = makeWorkspace([makeGoal([makeStrategy()])]);
    const { autoMerged } = mergeWorkspaces(ws, structuredClone(ws));
    expect(autoMerged).toBe(0);
  });

  test("遠端有新策略 → 合併後包含新策略", () => {
    const newS = makeStrategy({
      id: "s2",
      title: "新策略",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    const local = makeWorkspace([makeGoal([makeStrategy()])]);
    const remote = makeWorkspace([makeGoal([makeStrategy(), newS])]);
    const { workspace } = mergeWorkspaces(local, remote);
    const strategies =
      workspace.departments[0].periods[0].ogsm.goals[0].strategies;
    expect(strategies.map((s) => s.id)).toContain("s2");
  });

  test("本地較新 → LWW 選本地", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "本地新版",
          updatedAt: "2026-01-03T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "遠端舊版",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const { workspace } = mergeWorkspaces(local, remote);
    const s = workspace.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(s.title).toBe("本地新版");
  });

  test("遠端較新 → LWW 選遠端", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "本地舊版",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "遠端新版",
          updatedAt: "2026-01-03T00:00:00.000Z",
        }),
      ]),
    ]);
    const { workspace } = mergeWorkspaces(local, remote);
    const s = workspace.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(s.title).toBe("遠端新版");
  });

  test("遠端刪除的 id → 合併後消失（tombstone）", () => {
    const local = makeWorkspace([makeGoal([makeStrategy()])]);
    const remote = makeWorkspace([makeGoal([makeStrategy()])]);
    remote.deletedIds = ["s1"];
    const { workspace } = mergeWorkspaces(local, remote);
    const strategies =
      workspace.departments[0].periods[0].ogsm.goals[0].strategies;
    expect(strategies.find((s) => s.id === "s1")).toBeUndefined();
  });

  test("version 取兩側最大值", () => {
    const local = makeWorkspace([makeGoal([])]);
    local.version = 5;
    const remote = makeWorkspace([makeGoal([])]);
    remote.version = 8;
    const { workspace } = mergeWorkspaces(local, remote);
    expect(workspace.version).toBe(8);
  });
});

// ─── mergeWorkspaces — 手動解決衝突 ──────────────────────────────────────────

describe("mergeWorkspaces — 衝突解決", () => {
  test("resolution=local → 保留本地版本", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "本地版",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "遠端版",
          updatedAt: "2026-01-03T00:00:00.000Z",
        }),
      ]),
    ]);
    const { workspace } = mergeWorkspaces(local, remote, { s1: "local" });
    const s = workspace.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(s.title).toBe("本地版");
  });

  test("resolution=remote → 採用遠端版本", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "本地版",
          updatedAt: "2026-01-03T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "遠端版",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const { workspace } = mergeWorkspaces(local, remote, { s1: "remote" });
    const s = workspace.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(s.title).toBe("遠端版");
  });
});

// ─── Teams 合併 ───────────────────────────────────────────────────────────────

describe("mergeWorkspaces — Teams", () => {
  test("遠端有新 team → 合併後包含", () => {
    const local = makeWorkspace([]);
    const remote = makeWorkspace([]);
    remote.teams = [
      {
        id: "t1",
        name: "前端小組",
        members: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const { workspace } = mergeWorkspaces(local, remote);
    expect(workspace.teams?.find((t) => t.id === "t1")).toBeDefined();
  });

  test("team 被 tombstone → 合併後消失", () => {
    const local = makeWorkspace([]);
    local.teams = [
      {
        id: "t1",
        name: "前端小組",
        members: [],
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const remote = makeWorkspace([]);
    remote.deletedIds = ["t1"];
    const { workspace } = mergeWorkspaces(local, remote);
    expect(workspace.teams?.find((t) => t.id === "t1")).toBeUndefined();
  });
});
