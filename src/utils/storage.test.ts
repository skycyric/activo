import { describe, test, expect, beforeEach } from "vitest";
import { saveWorkspace, loadWorkspace, migrateOwnerToOwners } from "./storage";
import type { WorkspaceData, Strategy, Goal } from "../schemas/ogsm";

// ─── 測試資料工廠 ──────────────────────────────────────────────────────────────

function makeStrategy(overrides: Partial<Strategy> = {}): Strategy {
  return {
    id: "s1",
    title: "策略A",
    rawText: "",
    measures: [],
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

function makeWorkspace(overrides: Partial<WorkspaceData> = {}): WorkspaceData {
  return {
    version: 1,
    _migratedPhase2: true,
    _migratedPhase3: true,
    departments: [
      {
        id: "dept1",
        name: "部門A",
        periods: [
          {
            id: "p1",
            halfYear: "H1",
            year: 2026,
            ogsm: {
              objectives: { orgO: "", deptO: "" },
              goals: [],
              period: "2026 H1",
              importedAt: "2026-01-01T00:00:00.000Z",
              overallRate: 0,
            },
          },
        ],
      },
    ],
    teams: [],
    ...overrides,
  };
}

// ─── localStorage mock ────────────────────────────────────────────────────────

// Vitest runs in Node; provide a minimal localStorage shim
const store: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => {
    store[k] = v;
  },
  removeItem: (k: string) => {
    delete store[k];
  },
  clear: () => {
    Object.keys(store).forEach((k) => delete store[k]);
  },
  get length() {
    return Object.keys(store).length;
  },
  key: (i: number) => Object.keys(store)[i] ?? null,
} as Storage;

beforeEach(() => {
  localStorage.clear();
});

// ─── saveWorkspace / loadWorkspace ───────────────────────────────────────────

describe("saveWorkspace + loadWorkspace", () => {
  test("可以儲存並讀回相同的工作區", () => {
    const ws = makeWorkspace();
    saveWorkspace(ws);
    const loaded = loadWorkspace();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.departments[0].id).toBe("dept1");
  });

  test("localStorage 為空時 loadWorkspace 回傳 null", () => {
    expect(loadWorkspace()).toBeNull();
  });

  test("儲存後的工作區在讀取時 owners 一定是陣列（invariant 守衛）", () => {
    const ws = makeWorkspace({
      departments: [
        {
          id: "dept1",
          name: "部門A",
          periods: [
            {
              id: "p1",
              halfYear: "H1",
              year: 2026,
              ogsm: {
                objectives: { orgO: "", deptO: "" },
                goals: [makeGoal([makeStrategy({ owners: [] })])],
                period: "2026 H1",
                importedAt: "2026-01-01T00:00:00.000Z",
                overallRate: 0,
              },
            },
          ],
        },
      ],
    });
    saveWorkspace(ws);
    const loaded = loadWorkspace();
    const strat = loaded!.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(Array.isArray(strat.owners)).toBe(true);
  });

  test("儲存帶有 strategy 的工作區，標題可以正確讀回", () => {
    const ws = makeWorkspace({
      departments: [
        {
          id: "dept1",
          name: "部門A",
          periods: [
            {
              id: "p1",
              halfYear: "H1",
              year: 2026,
              ogsm: {
                objectives: { orgO: "公司方向", deptO: "部門目標" },
                goals: [makeGoal([makeStrategy({ title: "關鍵策略" })])],
                period: "2026 H1",
                importedAt: "2026-01-01T00:00:00.000Z",
                overallRate: 0,
              },
            },
          ],
        },
      ],
    });
    saveWorkspace(ws);
    const loaded = loadWorkspace();
    const strat = loaded!.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(strat.title).toBe("關鍵策略");
  });

  test("loadWorkspace 在 localStorage 存有損壞 JSON 時回傳 null", () => {
    localStorage.setItem("ogsm_workspace_v1", "{{invalid json}}");
    expect(loadWorkspace()).toBeNull();
  });

  test("saveWorkspace 執行時不拋出例外", () => {
    const ws = makeWorkspace();
    expect(() => saveWorkspace(ws)).not.toThrow();
  });
});

// ─── migrateOwnerToOwners ─────────────────────────────────────────────────────

describe("migrateOwnerToOwners", () => {
  test("owner 欄位遷移到 owners 陣列", () => {
    const ws = makeWorkspace({
      departments: [
        {
          id: "dept1",
          name: "部門A",
          periods: [
            {
              id: "p1",
              halfYear: "H1",
              year: 2026,
              ogsm: {
                objectives: { orgO: "", deptO: "" },
                goals: [
                  makeGoal([makeStrategy({ owner: "Alice", owners: [] })]),
                ],
                period: "2026 H1",
                importedAt: "2026-01-01T00:00:00.000Z",
                overallRate: 0,
              },
            },
          ],
        },
      ],
    });
    const changed = migrateOwnerToOwners(ws);
    const strat = ws.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(changed).toBe(true);
    expect(strat.owners).toContain("Alice");
    expect(strat.owner).toBeUndefined();
  });

  test("已有 owners 且無 owner 時回傳 false（不重複遷移）", () => {
    const ws = makeWorkspace({
      departments: [
        {
          id: "dept1",
          name: "部門A",
          periods: [
            {
              id: "p1",
              halfYear: "H1",
              year: 2026,
              ogsm: {
                objectives: { orgO: "", deptO: "" },
                goals: [makeGoal([makeStrategy({ owners: ["Bob"] })])],
                period: "2026 H1",
                importedAt: "2026-01-01T00:00:00.000Z",
                overallRate: 0,
              },
            },
          ],
        },
      ],
    });
    const changed = migrateOwnerToOwners(ws);
    expect(changed).toBe(false);
  });

  test("無任何策略時回傳 false", () => {
    const ws = makeWorkspace();
    const changed = migrateOwnerToOwners(ws);
    expect(changed).toBe(false);
  });
});

// ─── normalizeWorkspaceData（透過 loadWorkspace 驗證）────────────────────────

describe("normalizeWorkspaceData（透過存取 cycle）", () => {
  test("未設 _migratedPhase3 時 owner→owners 會在 load 時自動遷移", () => {
    // 直接放舊格式進 localStorage（不經過 saveWorkspace）
    const rawWs = makeWorkspace({
      _migratedPhase2: true,
      _migratedPhase3: false, // 故意未設
      departments: [
        {
          id: "dept1",
          name: "部門A",
          periods: [
            {
              id: "p1",
              halfYear: "H1",
              year: 2026,
              ogsm: {
                objectives: { orgO: "", deptO: "" },
                goals: [
                  makeGoal([makeStrategy({ owner: "Clara", owners: [] })]),
                ],
                period: "2026 H1",
                importedAt: "2026-01-01T00:00:00.000Z",
                overallRate: 0,
              },
            },
          ],
        },
      ],
    });
    localStorage.setItem("ogsm_workspace_v1", JSON.stringify(rawWs));
    const loaded = loadWorkspace();
    const strat = loaded!.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(strat.owners).toContain("Clara");
    expect(loaded!._migratedPhase3).toBe(true);
  });

  test("strategies.owners 若缺失（undefined）load 後會補為空陣列", () => {
    const rawWs = makeWorkspace({
      _migratedPhase2: true,
      _migratedPhase3: true,
      departments: [
        {
          id: "dept1",
          name: "部門A",
          periods: [
            {
              id: "p1",
              halfYear: "H1",
              year: 2026,
              ogsm: {
                objectives: { orgO: "", deptO: "" },
                goals: [
                  makeGoal([
                    {
                      ...makeStrategy(),
                      owners: undefined as unknown as string[],
                    },
                  ]),
                ],
                period: "2026 H1",
                importedAt: "2026-01-01T00:00:00.000Z",
                overallRate: 0,
              },
            },
          ],
        },
      ],
    });
    localStorage.setItem("ogsm_workspace_v1", JSON.stringify(rawWs));
    const loaded = loadWorkspace();
    const strat = loaded!.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(Array.isArray(strat.owners)).toBe(true);
  });
});
