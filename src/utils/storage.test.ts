import { describe, test, expect, beforeEach } from "vitest";
import {
  saveWorkspace,
  loadWorkspace,
  migrateOwnerToOwners,
  migrateToActivityFirst,
  parseAndValidateJSON,
  normalizeOneStrategy,
} from "./storage";
import type { WorkspaceData, Strategy, Goal, Measure } from "../schemas/ogsm";

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

// ─── parseAndValidateJSON ─────────────────────────────────────────────────────

describe("parseAndValidateJSON", () => {
  const validWorkspaceJSON = JSON.stringify(
    makeWorkspace({
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
                objectives: { orgO: "公司", deptO: "部門" },
                goals: [],
                period: "2026 H1",
                importedAt: "2026-01-01T00:00:00.000Z",
                overallRate: 0,
              },
            },
          ],
        },
      ],
    }),
  );

  const validOgsmJSON = JSON.stringify({
    objectives: { orgO: "公司", deptO: "部門" },
    goals: [],
    period: "2026 H1",
    importedAt: "2026-01-01T00:00:00.000Z",
    overallRate: 0,
  });

  test("合法的 WorkspaceData JSON 解析並回傳", () => {
    const result = parseAndValidateJSON(validWorkspaceJSON);
    expect(result).toHaveProperty("departments");
  });

  test("合法的 OGSMData JSON 解析並回傳", () => {
    const result = parseAndValidateJSON(validOgsmJSON);
    expect(result).toHaveProperty("goals");
    expect(result).toHaveProperty("objectives");
  });

  test("格式錯誤 JSON 語法（非合法 JSON）拋出 Error", () => {
    expect(() => parseAndValidateJSON("{invalid json}")).toThrow(
      "Invalid JSON file",
    );
  });

  test("不符合任何格式的 JSON 物件拋出 Error（不支援的格式）", () => {
    expect(() => parseAndValidateJSON('{"foo":"bar"}')).toThrow(
      "不支援的 JSON 格式",
    );
  });

  test("departments 欄位型別錯誤（非陣列）會拒絕並拋出 Error", () => {
    const bad = JSON.stringify({ departments: "not-an-array", version: 1 });
    // 'departments' 不是陣列 → 走到不支援格式分支 → 拋出
    expect(() => parseAndValidateJSON(bad)).toThrow("不支援的 JSON 格式");
  });

  test("WorkspaceData 缺少必要欄位（version 欄位錯誤型別）後 normalize 後仍失敗 → 拋出", () => {
    // departments 正確但 version 是字串（應為 number），Zod 應拒絕
    const bad = JSON.stringify({
      departments: [],
      version: "not-a-number",
      _migratedPhase2: true,
      _migratedPhase3: true,
    });
    expect(() => parseAndValidateJSON(bad)).toThrow("工作區格式不符");
  });
});

// ─── normalizeOneStrategy ─────────────────────────────────────────────────────

describe("normalizeOneStrategy", () => {
  test("無需遷移的策略回傳 false 且不改變資料", () => {
    const s = makeStrategy({ owners: ["Alice"], actionPlans: [] });
    const changed = normalizeOneStrategy(s);
    expect(changed).toBe(false);
    expect(s.owners).toEqual(["Alice"]);
  });

  test("owner (scalar) → owners (array) 並移除 owner 欄位", () => {
    const s = makeStrategy({ owner: "Bob", owners: [] } as unknown as Strategy);
    const changed = normalizeOneStrategy(s);
    expect(changed).toBe(true);
    expect(s.owners).toContain("Bob");
    expect((s as unknown as Record<string, unknown>).owner).toBeUndefined();
  });

  test("owners 為 undefined → 補為空陣列", () => {
    const s = makeStrategy({ owners: undefined as unknown as string[] });
    const changed = normalizeOneStrategy(s);
    expect(changed).toBe(true);
    expect(Array.isArray(s.owners)).toBe(true);
  });

  test("plan item 舊版 date 欄位遷移到 plannedEndDate", () => {
    const s = makeStrategy({
      actionPlans: [
        {
          id: "ap1",
          quarter: "Q1",
          title: "Q1 計畫",
          items: [
            {
              id: "item1",
              description: "任務A",
              completed: false,
              date: "2026-03-01",
            } as unknown as import("../schemas/ogsm").PlanItem,
          ],
        },
      ],
    });
    const changed = normalizeOneStrategy(s);
    expect(changed).toBe(true);
    const item = s.actionPlans[0].items[0];
    expect(item.plannedEndDate).toBe("2026-03-01");
    expect((item as unknown as Record<string, unknown>).date).toBeUndefined();
  });

  test("plan item 舊版 endDate 欄位遷移到 plannedEndDate", () => {
    const s = makeStrategy({
      actionPlans: [
        {
          id: "ap1",
          quarter: "Q1",
          title: "Q1",
          items: [
            {
              id: "item2",
              description: "任務B",
              completed: false,
              endDate: "2026-06-30",
            } as unknown as import("../schemas/ogsm").PlanItem,
          ],
        },
      ],
    });
    normalizeOneStrategy(s);
    const item = s.actionPlans[0].items[0];
    expect(item.plannedEndDate).toBe("2026-06-30");
    expect(
      (item as unknown as Record<string, unknown>).endDate,
    ).toBeUndefined();
  });

  test("plan item 若 plannedEndDate 已存在，不覆寫", () => {
    const s = makeStrategy({
      actionPlans: [
        {
          id: "ap1",
          quarter: "Q2",
          title: "Q2",
          items: [
            {
              id: "item3",
              description: "任務C",
              completed: false,
              plannedEndDate: "2026-05-01",
              endDate: "2026-09-01",
            } as unknown as import("../schemas/ogsm").PlanItem,
          ],
        },
      ],
    });
    normalizeOneStrategy(s);
    expect(s.actionPlans[0].items[0].plannedEndDate).toBe("2026-05-01");
  });
});

// ─── migrateToActivityFirst ───────────────────────────────────────────────────

function makeMeasure(overrides: Partial<Measure> = {}): Measure {
  return {
    id: "msr1",
    rawText: "活動A",
    kpis: [],
    status: "not-started",
    ...overrides,
  };
}

describe("migrateToActivityFirst", () => {
  test("measures 被提升到 dept.activities，並附加 ogsmLink", () => {
    const ws = makeWorkspace({
      _migratedActivityFirst: false,
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
                goals: [
                  makeGoal([
                    makeStrategy({
                      id: "strat1",
                      measures: [makeMeasure({ id: "msr1", rawText: "活動A" })],
                    }),
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

    const changed = migrateToActivityFirst(ws);
    const activities = ws.departments[0].activities!;

    expect(changed).toBe(true);
    expect(activities).toHaveLength(1);
    expect(activities[0].id).toBe("msr1");
    expect(activities[0].rawText).toBe("活動A");
    expect(activities[0].ogsmLink).toEqual({
      periodId: "period1",
      goalId: "g1",
      strategyId: "strat1",
    });
    expect(activities[0].excludeFromOgsm).toBe(false);
  });

  test("冪等性：同 ID 的活動不重複加入 dept.activities", () => {
    const existingActivity = {
      ...makeMeasure({ id: "msr1" }),
      ogsmLink: { periodId: "period1", goalId: "g1", strategyId: "strat1" },
      excludeFromOgsm: false as boolean,
    };
    const ws = makeWorkspace({
      departments: [
        {
          id: "dept1",
          name: "部門A",
          activities: [existingActivity],
          periods: [
            {
              id: "period1",
              halfYear: "H1",
              year: 2026,
              ogsm: {
                objectives: { orgO: "", deptO: "" },
                goals: [
                  makeGoal([
                    makeStrategy({
                      id: "strat1",
                      measures: [makeMeasure({ id: "msr1" })],
                    }),
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

    migrateToActivityFirst(ws);
    expect(ws.departments[0].activities!).toHaveLength(1);
  });

  test("多個 strategy 的 measures 都被提升", () => {
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
                  makeGoal([
                    makeStrategy({
                      id: "strat1",
                      measures: [makeMeasure({ id: "msr1" })],
                    }),
                    makeStrategy({
                      id: "strat2",
                      measures: [makeMeasure({ id: "msr2", rawText: "活動B" })],
                    }),
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

    migrateToActivityFirst(ws);
    const ids = ws.departments[0].activities!.map((a) => a.id);
    expect(ids).toContain("msr1");
    expect(ids).toContain("msr2");
  });

  test("strategy.measures[] 在遷移後保持不動（不被刪除）", () => {
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
                  makeGoal([
                    makeStrategy({
                      id: "strat1",
                      measures: [makeMeasure({ id: "msr1" })],
                    }),
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

    migrateToActivityFirst(ws);
    const strat = ws.departments[0].periods[0].ogsm.goals[0].strategies[0];
    expect(strat.measures).toHaveLength(1);
  });

  test("_migratedActivityFirst 旗標讓 loadWorkspace 自動執行遷移", () => {
    const rawWs = makeWorkspace({
      _migratedPhase2: true,
      _migratedPhase3: true,
      _migratedActivityFirst: false,
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
                    makeStrategy({
                      id: "strat1",
                      measures: [
                        makeMeasure({ id: "msr99", rawText: "自動遷移活動" }),
                      ],
                    }),
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
    const loaded = loadWorkspace()!;
    expect(loaded._migratedActivityFirst).toBe(true);
    const activities = loaded.departments[0].activities!;
    expect(activities.some((a) => a.id === "msr99")).toBe(true);
  });

  test("owners 與 notes 從 Strategy 複製到每個 DeptActivity", () => {
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
                  makeGoal([
                    makeStrategy({
                      id: "strat1",
                      owners: ["王大明", "李小華"],
                      notes: "策略備註",
                      measures: [
                        makeMeasure({ id: "msr1", rawText: "活動A" }),
                        makeMeasure({ id: "msr2", rawText: "活動B" }),
                      ],
                    }),
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

    migrateToActivityFirst(ws);
    const activities = ws.departments[0].activities!;
    expect(activities).toHaveLength(2);
    for (const a of activities) {
      expect(a.owners).toEqual(["王大明", "李小華"]);
      expect(a.notes).toBe("策略備註");
    }
  });

  test("actionPlans 按 linkedMeasureId 分配：1 對 1 完整搬移", () => {
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
                  makeGoal([
                    makeStrategy({
                      id: "strat1",
                      measures: [
                        makeMeasure({ id: "msr1", rawText: "活動A" }),
                        makeMeasure({ id: "msr2", rawText: "活動B" }),
                      ],
                      actionPlans: [
                        {
                          id: "plan1",
                          quarter: "Q1",
                          title: "活動A計畫",
                          items: [
                            {
                              id: "item1",
                              description: "準備素材",
                              completed: false,
                              linkedMeasureId: "msr1",
                            },
                          ],
                        },
                        {
                          id: "plan2",
                          quarter: "Q1",
                          title: "活動B計畫",
                          items: [
                            {
                              id: "item2",
                              description: "提案完成",
                              completed: false,
                              linkedMeasureId: "msr2",
                            },
                          ],
                        },
                      ],
                    }),
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

    migrateToActivityFirst(ws);
    const activities = ws.departments[0].activities!;
    const a1 = activities.find((a) => a.id === "msr1")!;
    const a2 = activities.find((a) => a.id === "msr2")!;

    // 活動A 只拿到 plan1 的 item1
    expect(a1.actionPlans).toHaveLength(1);
    expect(a1.actionPlans![0].id).toBe("plan1");
    expect(a1.actionPlans![0].items).toHaveLength(1);
    expect(a1.actionPlans![0].items[0].id).toBe("item1");

    // 活動B 只拿到 plan2 的 item2
    expect(a2.actionPlans).toHaveLength(1);
    expect(a2.actionPlans![0].id).toBe("plan2");
    expect(a2.actionPlans![0].items[0].id).toBe("item2");
  });

  test("actionPlans 無 linkedMeasureId 的 items 複製給 strategy 內所有活動", () => {
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
                  makeGoal([
                    makeStrategy({
                      id: "strat1",
                      measures: [
                        makeMeasure({ id: "msr1" }),
                        makeMeasure({ id: "msr2", rawText: "活動B" }),
                      ],
                      actionPlans: [
                        {
                          id: "plan1",
                          quarter: "Q1",
                          title: "共用計畫",
                          items: [
                            {
                              id: "item_no_link",
                              description: "全體共用步驟",
                              completed: false,
                              linkedMeasureId: null,
                            },
                            {
                              id: "item_msr1",
                              description: "僅活動A步驟",
                              completed: false,
                              linkedMeasureId: "msr1",
                            },
                          ],
                        },
                      ],
                    }),
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

    migrateToActivityFirst(ws);
    const activities = ws.departments[0].activities!;
    const a1 = activities.find((a) => a.id === "msr1")!;
    const a2 = activities.find((a) => a.id === "msr2")!;

    // 活動A：拿到共用 item + 自己的 item
    expect(a1.actionPlans![0].items).toHaveLength(2);

    // 活動B：只拿到共用 item（沒有自己的 linked item）
    expect(a2.actionPlans![0].items).toHaveLength(1);
    expect(a2.actionPlans![0].items[0].id).toBe("item_no_link");
  });
});
