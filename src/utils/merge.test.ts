import { describe, test, expect } from "vitest";
import { detectConflicts, mergeWorkspaces } from "./merge";
import { migrateOwnerToOwners } from "./storage";
import type {
  WorkspaceData,
  Strategy,
  Goal,
  DeptActivity,
  Team,
} from "../schemas/ogsm";

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
    owners: [],
    notes: "",
    completionRate: 0,
    manualRate: null,
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

function makeActivity(overrides: Partial<DeptActivity> = {}): DeptActivity {
  return {
    id: "act1",
    rawText: "活動A",
    status: "in-progress",
    owners: [],
    kpis: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: "t1",
    name: "前端小組",
    members: [],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeWorkspace(
  goals: Goal[],
  activities: DeptActivity[] = [],
): WorkspaceData {
  return {
    version: 1,
    departments: [
      {
        id: "dept1",
        name: "部門A",
        activities,
        periods: [
          {
            id: "period1",
            halfYear: "H1",
            year: 2026,
            ogsm: {
              objectives: { orgO: "", deptO: "" },
              goals,
              period: `${new Date().getFullYear()} H1`,
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

// ─── migrateOwnerToOwners ────────────────────────────────────────────────────

describe("migrateOwnerToOwners", () => {
  test("owner 有值且 owners 為空 → 複製到 owners 並清除 owner", () => {
    const ws = makeWorkspace([
      makeGoal([makeStrategy({ owner: "王大明", owners: [] })]),
    ]);
    const changed = migrateOwnerToOwners(ws);
    const s = ws.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(changed).toBe(true);
    expect(s.owners).toEqual(["王大明"]);
    expect(s.owner).toBeUndefined();
  });

  test("owners 已有值 → 保留 owners，仍清除 owner", () => {
    const ws = makeWorkspace([
      makeGoal([makeStrategy({ owner: "王大明", owners: ["李小華"] })]),
    ]);
    migrateOwnerToOwners(ws);
    const s = ws.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(s.owners).toEqual(["李小華"]);
    expect(s.owner).toBeUndefined();
  });

  test("owner 和 owners 皆空 → owners 維持 []，不觸發 changed", () => {
    const ws = makeWorkspace([
      makeGoal([makeStrategy({ owner: undefined, owners: [] })]),
    ]);
    const changed = migrateOwnerToOwners(ws);
    const s = ws.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(changed).toBe(false);
    expect(s.owners).toEqual([]);
  });
});

// ─── owners 衝突偵測 ─────────────────────────────────────────────────────────

describe("detectConflicts — owners 欄位", () => {
  test("owners 陣列不同 → fieldDiff 包含 owners", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          owners: ["王大明"],
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          owners: ["李小華"],
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    const ownersDiff = result[0].fieldDiffs.find((d) => d.field === "owners");
    expect(ownersDiff).toBeDefined();
    expect(ownersDiff?.localVal).toBe("王大明");
    expect(ownersDiff?.remoteVal).toBe("李小華");
  });
});

// ─── 欄位級別合併（Field-Level Merge）────────────────────────────────────────

describe("欄位級別合併 — detectConflicts 不通報空值差異", () => {
  test("一方 title 為空 → 不通報衝突（可自動合併）", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({ title: "", updatedAt: "2026-01-01T00:00:00.000Z" }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "遠端填寫的策略名稱",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });

  test("一方 notes 為空 → 不通報衝突", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          notes: "本地備註",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({ notes: "", updatedAt: "2026-01-01T00:00:00.000Z" }),
      ]),
    ]);
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });

  test("一方 owners 為空陣列 → 不通報衝突", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({ owners: [], updatedAt: "2026-01-01T00:00:00.000Z" }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          owners: ["王大明"],
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });

  test("一方 manualRate 為 null → 不通報衝突", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          manualRate: null,
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({ manualRate: 80, updatedAt: "2026-01-02T00:00:00.000Z" }),
      ]),
    ]);
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });

  test("雙方 title 皆非空且不同 → 仍通報衝突", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "本地版本",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "遠端版本",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    expect(detectConflicts(local, remote)).toHaveLength(1);
  });
});

describe("欄位級別合併 — mergeWorkspaces 自動填補空欄位", () => {
  test("本地 title 為空 → 自動採用遠端 title", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({ title: "", updatedAt: "2026-01-01T00:00:00.000Z" }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "遠端填寫的策略名稱",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    const { workspace } = mergeWorkspaces(local, remote);
    const s = workspace.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(s.title).toBe("遠端填寫的策略名稱");
  });

  test("遠端 notes 為空 → 保留本地 notes", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          notes: "本地備註",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({ notes: "", updatedAt: "2026-01-02T00:00:00.000Z" }),
      ]),
    ]);
    const { workspace } = mergeWorkspaces(local, remote);
    const s = workspace.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(s.notes).toBe("本地備註");
  });

  test("本地 owners 為空陣列 → 自動採用遠端 owners", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({ owners: [], updatedAt: "2026-01-01T00:00:00.000Z" }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          owners: ["王大明", "李小華"],
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    const { workspace } = mergeWorkspaces(local, remote);
    const s = workspace.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(s.owners).toEqual(["王大明", "李小華"]);
  });

  test("本地 manualRate 為 null → 自動採用遠端設定的完成率", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          manualRate: null,
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({ manualRate: 75, updatedAt: "2026-01-02T00:00:00.000Z" }),
      ]),
    ]);
    const { workspace } = mergeWorkspaces(local, remote);
    const s = workspace.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(s.manualRate).toBe(75);
  });

  test("本地有值、遠端空值 → 保留本地值（不被空值覆蓋）", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "本地策略名稱",
          notes: "本地備註",
          owners: ["王大明"],
          manualRate: 60,
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "",
          notes: "",
          owners: [],
          manualRate: null,
          updatedAt: "2026-01-03T00:00:00.000Z", // 遠端較新，但欄位皆為空
        }),
      ]),
    ]);
    const { workspace } = mergeWorkspaces(local, remote);
    const s = workspace.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(s.title).toBe("本地策略名稱");
    expect(s.notes).toBe("本地備註");
    expect(s.owners).toEqual(["王大明"]);
    expect(s.manualRate).toBe(60);
  });

  test("雙方皆有不同值 → LWW 決定（遠端較新則採遠端）", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "本地版本",
          owners: ["王大明"],
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "遠端版本",
          owners: ["李小華"],
          updatedAt: "2026-01-03T00:00:00.000Z",
        }),
      ]),
    ]);
    const { workspace } = mergeWorkspaces(local, remote);
    const s = workspace.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(s.title).toBe("遠端版本");
    expect(s.owners).toEqual(["李小華"]);
  });
});

// ─── 新增：manualRate null↔value 衝突偵測 ────────────────────────────────────

describe("detectConflicts — manualRate null↔value", () => {
  test("local=value, remote=null（對方清除覆蓋） → 應偵測衝突", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          manualRate: 80,
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          manualRate: null,
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    const diff = result[0].fieldDiffs.find((d) => d.field === "manualRate");
    expect(diff).toBeDefined();
    expect(diff?.localVal).toBe("80%");
    expect(diff?.remoteVal).toBe("(自動計算)");
  });

  test("local=null, remote=value（對方新增覆蓋） → 自動填補，不算衝突", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          manualRate: null,
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          manualRate: 80,
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    // null → value 是自動填補，不應進入衝突 modal
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });

  test("local=80, remote=90（雙方皆有值但不同） → 偵測衝突", () => {
    const local = makeWorkspace([
      makeGoal([
        makeStrategy({
          manualRate: 80,
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          manualRate: 90,
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    const diff = result[0].fieldDiffs.find((d) => d.field === "manualRate");
    expect(diff?.localVal).toBe("80%");
    expect(diff?.remoteVal).toBe("90%");
  });
});

// ─── 新增：無 updatedAt 的衝突偵測（M1）─────────────────────────────────────

describe("detectConflicts — 無 updatedAt 時仍偵測內容差異", () => {
  test("strategy 雙方皆無 updatedAt，title 不同 → 應偵測衝突", () => {
    const local = makeWorkspace([
      makeGoal([makeStrategy({ title: "本地版本", updatedAt: undefined })]),
    ]);
    const remote = makeWorkspace([
      makeGoal([makeStrategy({ title: "遠端版本", updatedAt: undefined })]),
    ]);
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].fieldDiffs[0].field).toBe("title");
  });

  test("strategy 本地無 updatedAt、遠端有，title 不同 → 應偵測衝突", () => {
    const local = makeWorkspace([
      makeGoal([makeStrategy({ title: "本地版本", updatedAt: undefined })]),
    ]);
    const remote = makeWorkspace([
      makeGoal([
        makeStrategy({
          title: "遠端版本",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ]),
    ]);
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
  });

  test("strategy 雙方 updatedAt 相同且內容也相同 → 無衝突", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    const ws = makeWorkspace([makeGoal([makeStrategy({ updatedAt: ts })])]);
    // 完全相同的兩份
    expect(detectConflicts(ws, structuredClone(ws))).toHaveLength(0);
  });

  test("strategy 雙方 updatedAt 相同但 title 不同 → 視為同步衝突，不通報（無法確定誰對）", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    const local = makeWorkspace([
      makeGoal([makeStrategy({ title: "本地版本", updatedAt: ts })]),
    ]);
    const remote = makeWorkspace([
      makeGoal([makeStrategy({ title: "遠端版本", updatedAt: ts })]),
    ]);
    // 同 timestamp 表示資料版本一致，差異可能是 migration 造成的，跳過
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });
});

// ─── Team 衝突偵測 ─────────────────────────────────────────────────────────────

describe("detectConflicts — Teams", () => {
  test("team name 不同 → 通報衝突，entityType=team", () => {
    const local = makeWorkspace([]);
    local.teams = [
      makeTeam({ name: "本地小組", updatedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const remote = makeWorkspace([]);
    remote.teams = [
      makeTeam({ name: "遠端小組", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ];
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].entityType).toBe("team");
    const diff = result[0].fieldDiffs.find((d) => d.field === "name");
    expect(diff).toBeDefined();
    expect(diff?.localVal).toBe("本地小組");
    expect(diff?.remoteVal).toBe("遠端小組");
  });

  test("team members 不同（雙方皆有成員） → 通報衝突", () => {
    const local = makeWorkspace([]);
    local.teams = [
      makeTeam({
        members: [{ id: "m1", name: "王大明" }],
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ];
    const remote = makeWorkspace([]);
    remote.teams = [
      makeTeam({
        members: [{ id: "m2", name: "李小華" }],
        updatedAt: "2026-01-02T00:00:00.000Z",
      }),
    ];
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    const diff = result[0].fieldDiffs.find((d) => d.field === "members");
    expect(diff).toBeDefined();
  });

  test("一方 name 為空 → 不通報衝突（填補行為）", () => {
    const local = makeWorkspace([]);
    local.teams = [
      makeTeam({ name: "", updatedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const remote = makeWorkspace([]);
    remote.teams = [
      makeTeam({ name: "遠端小組", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ];
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });

  test("team 相同 updatedAt → sameTs guard，不通報", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    const local = makeWorkspace([]);
    local.teams = [makeTeam({ name: "小組A", updatedAt: ts })];
    const remote = makeWorkspace([]);
    remote.teams = [makeTeam({ name: "小組B", updatedAt: ts })];
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });

  test("team 被 deletedIds tombstone → 不通報", () => {
    const local = makeWorkspace([]);
    local.teams = [
      makeTeam({ name: "本地小組", updatedAt: "2026-01-01T00:00:00.000Z" }),
    ];
    local.deletedIds = ["t1"];
    const remote = makeWorkspace([]);
    remote.teams = [
      makeTeam({ name: "遠端小組", updatedAt: "2026-01-02T00:00:00.000Z" }),
    ];
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });
});

// ─── Activity 衝突偵測 ────────────────────────────────────────────────────────

describe("detectConflicts — Activity 衝突", () => {
  test("rawText 不同 → 通報衝突，entityType=activity", () => {
    const local = makeWorkspace(
      [],
      [
        makeActivity({
          rawText: "本地活動",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    );
    const remote = makeWorkspace(
      [],
      [
        makeActivity({
          rawText: "遠端活動",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ],
    );
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    expect(result[0].entityType).toBe("activity");
    const diff = result[0].fieldDiffs.find((d) => d.field === "rawText");
    expect(diff?.localVal).toBe("本地活動");
    expect(diff?.remoteVal).toBe("遠端活動");
  });

  test("status 不同（雙方皆有值） → 通報衝突", () => {
    const local = makeWorkspace(
      [],
      [
        makeActivity({
          status: "in-progress",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    );
    const remote = makeWorkspace(
      [],
      [makeActivity({ status: "done", updatedAt: "2026-01-02T00:00:00.000Z" })],
    );
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    const diff = result[0].fieldDiffs.find((d) => d.field === "status");
    expect(diff).toBeDefined();
  });

  test("owners 不同（雙方皆有值） → 通報衝突", () => {
    const local = makeWorkspace(
      [],
      [
        makeActivity({
          owners: ["王大明"],
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    );
    const remote = makeWorkspace(
      [],
      [
        makeActivity({
          owners: ["李小華"],
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ],
    );
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    const diff = result[0].fieldDiffs.find((d) => d.field === "owners");
    expect(diff).toBeDefined();
    expect(diff?.localVal).toBe("王大明");
    expect(diff?.remoteVal).toBe("李小華");
  });

  test("startDate / endDate 不同 → 通報衝突", () => {
    const local = makeWorkspace(
      [],
      [
        makeActivity({
          startDate: "2026-01-01",
          endDate: "2026-03-31",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    );
    const remote = makeWorkspace(
      [],
      [
        makeActivity({
          startDate: "2026-02-01",
          endDate: "2026-06-30",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ],
    );
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    const fields = result[0].fieldDiffs.map((d) => d.field);
    expect(fields).toContain("startDate");
    expect(fields).toContain("endDate");
  });

  test("budget 不同 → 通報衝突", () => {
    const local = makeWorkspace(
      [],
      [makeActivity({ budget: 100000, updatedAt: "2026-01-01T00:00:00.000Z" })],
    );
    const remote = makeWorkspace(
      [],
      [makeActivity({ budget: 200000, updatedAt: "2026-01-02T00:00:00.000Z" })],
    );
    const result = detectConflicts(local, remote);
    expect(result).toHaveLength(1);
    const diff = result[0].fieldDiffs.find((d) => d.field === "budget");
    expect(diff?.localVal).toBe("100000");
    expect(diff?.remoteVal).toBe("200000");
  });

  test("一方 rawText 為空 → 不通報（填補行為）", () => {
    const local = makeWorkspace(
      [],
      [makeActivity({ rawText: "", updatedAt: "2026-01-01T00:00:00.000Z" })],
    );
    const remote = makeWorkspace(
      [],
      [
        makeActivity({
          rawText: "遠端活動",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ],
    );
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });

  test("兩邊 updatedAt 相同 → sameTs guard，跳過", () => {
    const ts = "2026-01-02T00:00:00.000Z";
    const local = makeWorkspace(
      [],
      [makeActivity({ rawText: "本地活動", updatedAt: ts })],
    );
    const remote = makeWorkspace(
      [],
      [makeActivity({ rawText: "遠端活動", updatedAt: ts })],
    );
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });

  test("活動被 deletedIds tombstone → 不通報", () => {
    const local = makeWorkspace(
      [],
      [
        makeActivity({
          rawText: "本地活動",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    );
    local.deletedIds = ["act1"];
    const remote = makeWorkspace(
      [],
      [
        makeActivity({
          rawText: "遠端活動",
          updatedAt: "2026-01-02T00:00:00.000Z",
        }),
      ],
    );
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });

  test("活動只在本地存在（遠端無此 id） → 不通報", () => {
    const local = makeWorkspace(
      [],
      [makeActivity({ id: "act_local_only", rawText: "僅本地活動" })],
    );
    const remote = makeWorkspace([], []);
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });

  test("兩端完全相同的活動 → 無衝突", () => {
    const act = makeActivity({ rawText: "共同活動" });
    const local = makeWorkspace([], [act]);
    const remote = makeWorkspace([], [structuredClone(act)]);
    expect(detectConflicts(local, remote)).toHaveLength(0);
  });
});

// ─── mergeWorkspaces — Activities ────────────────────────────────────────────

describe("mergeWorkspaces — Activities", () => {
  test("遠端有本地沒有的新活動 → merge 後包含", () => {
    const local = makeWorkspace([], []);
    const newAct = makeActivity({
      id: "act_new",
      rawText: "遠端新活動",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    const remote = makeWorkspace([], [newAct]);
    const { workspace, autoMerged } = mergeWorkspaces(local, remote);
    expect(workspace.departments[0].activities).toHaveLength(1);
    expect(workspace.departments[0].activities![0].id).toBe("act_new");
    expect(autoMerged).toBeGreaterThan(0);
  });

  test("活動被 deletedIds tombstone → merge 後消失", () => {
    const local = makeWorkspace([], [makeActivity()]);
    const remote = makeWorkspace([], [makeActivity()]);
    remote.deletedIds = ["act1"];
    const { workspace } = mergeWorkspaces(local, remote);
    expect(
      workspace.departments[0].activities?.find((a) => a.id === "act1"),
    ).toBeUndefined();
  });

  test("LWW：本地 updatedAt 較新 → 保留本地", () => {
    const local = makeWorkspace(
      [],
      [
        makeActivity({
          rawText: "本地新版",
          updatedAt: "2026-01-03T00:00:00.000Z",
        }),
      ],
    );
    const remote = makeWorkspace(
      [],
      [
        makeActivity({
          rawText: "遠端舊版",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    );
    const { workspace } = mergeWorkspaces(local, remote);
    expect(workspace.departments[0].activities![0].rawText).toBe("本地新版");
  });

  test("LWW：遠端 updatedAt 較新 → 採用遠端", () => {
    const local = makeWorkspace(
      [],
      [
        makeActivity({
          rawText: "本地舊版",
          updatedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
    );
    const remote = makeWorkspace(
      [],
      [
        makeActivity({
          rawText: "遠端新版",
          updatedAt: "2026-01-03T00:00:00.000Z",
        }),
      ],
    );
    const { workspace } = mergeWorkspaces(local, remote);
    expect(workspace.departments[0].activities![0].rawText).toBe("遠端新版");
  });

  test("雙方各有不同 id 的活動 → 合併後都保留", () => {
    const local = makeWorkspace(
      [],
      [makeActivity({ id: "act_L", rawText: "本地活動" })],
    );
    const remote = makeWorkspace(
      [],
      [makeActivity({ id: "act_R", rawText: "遠端活動" })],
    );
    const { workspace } = mergeWorkspaces(local, remote);
    const ids = workspace.departments[0].activities!.map((a) => a.id);
    expect(ids).toContain("act_L");
    expect(ids).toContain("act_R");
  });
});
