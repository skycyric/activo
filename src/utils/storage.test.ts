import { describe, test, expect, beforeEach, vi } from "vitest";
import {
  saveWorkspace,
  loadWorkspace,
  loadLegacyData,
  migrateOwnerToOwners,
  migrateToActivityFirst,
  migrateToV3,
  migrateFrameworksV1,
  migrateTimelineV1,
  validateOrWarn,
  syncRelationalLinksV1,
  parseAndValidateJSON,
  normalizeOneStrategy,
  wrapOGSMInWorkspace,
} from "./storage";
import type {
  WorkspaceData,
  Strategy,
  Goal,
  Measure,
  DeptActivity,
  ActivityDashboardLink,
  OGSMData,
} from "../schemas/ogsm";

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

  test("_migratedV3=true 時仍會修復 goalKpis.linkedKpis 的 activityId 壞值", () => {
    const rawWs = makeWorkspace({
      _migratedPhase2: true,
      _migratedPhase3: true,
      _migratedActivityFirst: true,
      _migratedV3: true,
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
                  makeGoal([makeStrategy({ owners: [] })], {
                    goalKpis: [
                      {
                        id: "gk1",
                        label: "測試 GK",
                        unit: "%",
                        target: 100,
                        aggregation: "AVERAGE",
                        goalKpiType: "direct",
                        linkedKpis: [
                          { measureId: "act-1", kpiId: "k1" },
                          {
                            activityId: 123,
                            measureId: "act-2",
                            kpiId: "k2",
                          },
                          { activityId: "", kpiId: "k3" },
                          { activityId: "act-4", kpiId: null },
                        ],
                      } as unknown as import("../schemas/ogsm").GoalKPI,
                    ],
                  }),
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
    const links =
      loaded!.departments[0].periods[0].ogsm.goals[0].goalKpis?.[0]
        .linkedKpis ?? [];

    expect(links).toEqual([
      { activityId: "act-1", kpiId: "k1" },
      { activityId: "act-2", kpiId: "k2" },
    ]);
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

  test("OGSM 的 goalKpis.linkedKpis 壞 activityId 會在 parse 時自動修復", () => {
    const badOgsm = JSON.stringify({
      objectives: { orgO: "公司", deptO: "部門" },
      goals: [
        makeGoal([makeStrategy()], {
          goalKpis: [
            {
              id: "gk1",
              label: "GK",
              unit: "%",
              target: 100,
              aggregation: "AVERAGE",
              goalKpiType: "direct",
              linkedKpis: [
                { measureId: "act-9", kpiId: "k9" },
                { activityId: 999, measureId: "act-8", kpiId: "k8" },
                { activityId: null, kpiId: "k7" },
              ],
            },
          ] as unknown as import("../schemas/ogsm").GoalKPI[],
        }),
      ],
      period: "2026 H1",
      importedAt: "2026-01-01T00:00:00.000Z",
      overallRate: 0,
    });

    const result = parseAndValidateJSON(
      badOgsm,
    ) as import("../schemas/ogsm").OGSMData;
    const links = result.goals[0].goalKpis?.[0].linkedKpis ?? [];

    expect(links).toEqual([
      { activityId: "act-9", kpiId: "k9" },
      { activityId: "act-8", kpiId: "k8" },
    ]);
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
    const link = activities[0].dashboardLinks?.[0];
    expect(link?.type).toBe("ogsm");
    expect(link?.periodId).toBe("period1");
    expect(link?.goalId).toBe("g1");
    expect(link?.strategyId).toBe("strat1");
    expect(link?.exclude).toBe(false);
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

    // 活動A 只拿到 plan1 的 item1（planItems 是平坦化結構）
    expect(a1.planItems).toHaveLength(1);
    expect(a1.planItems![0].id).toBe("item1");
    expect(a1.planItems![0].quarter).toBe("Q1");

    // 活動B 只拿到 plan2 的 item2
    expect(a2.planItems).toHaveLength(1);
    expect(a2.planItems![0].id).toBe("item2");
    expect(a2.planItems![0].quarter).toBe("Q1");
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

    // 活動A：拿到共用 item + 自己的 item（planItems 平坦化）
    expect(a1.planItems).toHaveLength(2);

    // 活動B：只拿到共用 item（沒有自己的 linked item）
    expect(a2.planItems).toHaveLength(1);
    expect(a2.planItems![0].id).toBe("item_no_link");
  });
});

// ─── normalizeOneStrategy ─────────────────────────────────────────────────────

describe("normalizeOneStrategy", () => {
  function makeRawStrategy(overrides: Partial<Strategy> = {}): Strategy {
    return {
      id: "s1",
      title: "S1",
      rawText: "",
      measures: [],
      actionPlans: [],
      owners: [],
      notes: "",
      completionRate: 0,
      manualRate: null,
      ...overrides,
    };
  }

  test("owners 缺失（undefined）→ 補為空陣列", () => {
    const s = makeRawStrategy({ owners: undefined as unknown as string[] });
    normalizeOneStrategy(s);
    expect(Array.isArray(s.owners)).toBe(true);
    expect(s.owners).toHaveLength(0);
  });

  test("actionPlans 缺失（undefined）→ 補為空陣列", () => {
    const s = makeRawStrategy({
      actionPlans: undefined as unknown as Strategy["actionPlans"],
    });
    normalizeOneStrategy(s);
    expect(Array.isArray(s.actionPlans)).toBe(true);
  });

  test("legacyDate 欄位遷移：endDate → plannedEndDate", () => {
    const s = makeRawStrategy({
      actionPlans: [
        {
          id: "ap1",
          quarter: "Q1",
          title: "",
          items: [
            {
              id: "item1",
              description: "任務",
              completed: false,
              endDate: "2026-03-31",
            } as unknown as import("../schemas/ogsm").PlanItem,
          ],
        },
      ],
    });
    normalizeOneStrategy(s);
    const item = s.actionPlans[0].items[0];
    expect(item.plannedEndDate).toBe("2026-03-31");
    expect(
      (item as unknown as Record<string, unknown>).endDate,
    ).toBeUndefined();
  });
});

// ─── wrapOGSMInWorkspace ──────────────────────────────────────────────────────

describe("wrapOGSMInWorkspace", () => {
  function makeOgsm(period = "2026 H1"): OGSMData {
    return {
      objectives: { orgO: "公司目標", deptO: "部門目標" },
      goals: [],
      period,
      importedAt: "2026-01-01T00:00:00.000Z",
      overallRate: 0,
    };
  }

  test("傳入 OGSMData → 輸出 WorkspaceData，departments 長度為 1", () => {
    const ws = wrapOGSMInWorkspace(makeOgsm());
    expect(ws.departments).toHaveLength(1);
    expect(ws.version).toBe(1);
  });

  test("deptName 參數正確設定部門名稱", () => {
    const ws = wrapOGSMInWorkspace(makeOgsm(), "商務發展部");
    expect(ws.departments[0].name).toBe("商務發展部");
  });

  test("H1 period → halfYear=H1", () => {
    const ws = wrapOGSMInWorkspace(makeOgsm("2026 H1"));
    expect(ws.departments[0].periods[0].halfYear).toBe("H1");
    expect(ws.departments[0].periods[0].year).toBe(2026);
  });

  test("H2 period → halfYear=H2", () => {
    const ws = wrapOGSMInWorkspace(makeOgsm("2026 H2"));
    expect(ws.departments[0].periods[0].halfYear).toBe("H2");
  });

  test("包裝後 ogsm 目標資料完整保留", () => {
    const ogsm = makeOgsm();
    ogsm.objectives.orgO = "測試公司目標";
    const ws = wrapOGSMInWorkspace(ogsm);
    expect(ws.departments[0].periods[0].ogsm.objectives.orgO).toBe(
      "測試公司目標",
    );
  });
});

// ─── 遷移測試用輔助工廠 ──────────────────────────────────────────────────────

function makeDeptActivity(overrides: Partial<DeptActivity> = {}): DeptActivity {
  return {
    id: "act1",
    rawText: "活動A",
    kpis: [],
    status: "not-started",
    ...overrides,
  };
}

function makeV3Workspace(
  activities: DeptActivity[],
  goals: Goal[] = [],
): WorkspaceData {
  return {
    version: 1,
    _migratedPhase2: true,
    _migratedPhase3: true,
    departments: [
      {
        id: "dept1",
        name: "部門A",
        activities,
        periods: [
          {
            id: "p1",
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

// ─── migrateToV3 ──────────────────────────────────────────────────────────────

describe("migrateToV3", () => {
  test("ogsmLink → dashboardLinks 轉換，並清除 ogsmLink / excludeFromOgsm", () => {
    const act = makeDeptActivity({
      id: "a1",
      ogsmLink: {
        periodId: "p1",
        goalId: "g1",
        strategyId: "s1",
      } as unknown as DeptActivity["ogsmLink"],
      excludeFromOgsm: false,
    });
    const ws = makeV3Workspace([act]);
    const changed = migrateToV3(ws);
    const result = ws.departments[0].activities![0];
    expect(changed).toBe(true);
    expect(result.dashboardLinks).toHaveLength(1);
    expect(result.dashboardLinks![0].type).toBe("ogsm");
    expect(result.dashboardLinks![0].periodId).toBe("p1");
    expect(result.dashboardLinks![0].exclude).toBe(false);
    expect(result.ogsmLink).toBeUndefined();
    expect(result.excludeFromOgsm).toBeUndefined();
  });

  test("actionPlans → planItems 平坦化，並清除 actionPlans", () => {
    const act = makeDeptActivity({
      id: "a2",
      actionPlans: [
        {
          id: "ap1",
          quarter: "Q1",
          title: "",
          items: [{ id: "item1", description: "任務1", completed: false }],
        },
      ] as DeptActivity["actionPlans"],
    });
    const ws = makeV3Workspace([act]);
    const changed = migrateToV3(ws);
    const result = ws.departments[0].activities![0];
    expect(changed).toBe(true);
    expect(result.planItems).toHaveLength(1);
    expect(result.planItems![0].quarter).toBe("Q1");
    expect(result.actionPlans).toBeUndefined();
  });

  test("dept.activities 非空時，strategy.measures 被清空", () => {
    const strategy = makeStrategy({
      id: "s1",
      measures: [makeMeasure({ id: "msr1" })],
    });
    const goal = makeGoal([strategy]);
    const ws = makeV3Workspace([makeDeptActivity()], [goal]);
    const changed = migrateToV3(ws);
    expect(changed).toBe(true);
    expect(
      ws.departments[0].periods[0].ogsm.goals[0].strategies[0].measures,
    ).toHaveLength(0);
  });

  test("linkedKpis: 只有 measureId → 升遷為 activityId", () => {
    const goal = makeGoal([], {
      goalKpis: [
        {
          id: "gk1",
          title: "KPI",
          label: "",
          unit: "",
          target: null,
          aggregation: "SUM",
          goalKpiType: "direct",
          linkedKpis: [
            {
              measureId: "msr1",
              kpiId: "kpi1",
            } as unknown as import("../schemas/ogsm").GoalKpiLink,
          ],
        } as import("../schemas/ogsm").GoalKPI,
      ],
    });
    const ws = makeV3Workspace([makeDeptActivity()], [goal]);
    const changed = migrateToV3(ws);
    expect(changed).toBe(true);
    const link =
      ws.departments[0].periods[0].ogsm.goals[0].goalKpis![0].linkedKpis[0];
    expect((link as Record<string, unknown>).activityId).toBe("msr1");
    expect((link as Record<string, unknown>).measureId).toBeUndefined();
  });

  test("冪等：ogsmLink 已清、dashboardLinks 已有值 → changed=false", () => {
    const act = makeDeptActivity({
      id: "a3",
      dashboardLinks: [
        {
          id: "dl1",
          type: "ogsm",
          periodId: "p1",
          goalId: "g1",
          strategyId: "s1",
          exclude: false,
        },
      ],
    });
    const ws = makeV3Workspace([act]);
    const changed = migrateToV3(ws);
    expect(changed).toBe(false);
  });
});

// ─── migrateFrameworksV1 ─────────────────────────────────────────────────────

describe("migrateFrameworksV1", () => {
  test("frameworks=[] → 設為 ['ogsm']，changed=true", () => {
    const ws = makeV3Workspace([makeDeptActivity({ frameworks: [] })]);
    const changed = migrateFrameworksV1(ws);
    expect(changed).toBe(true);
    expect(ws.departments[0].activities![0].frameworks).toEqual(["ogsm"]);
  });

  test("frameworks=undefined → 設為 ['ogsm']，changed=true", () => {
    const ws = makeV3Workspace([makeDeptActivity({ frameworks: undefined })]);
    const changed = migrateFrameworksV1(ws);
    expect(changed).toBe(true);
    expect(ws.departments[0].activities![0].frameworks).toEqual(["ogsm"]);
  });

  test("frameworks=['custom'] → 不覆蓋，changed=false", () => {
    const ws = makeV3Workspace([makeDeptActivity({ frameworks: ["custom"] })]);
    const changed = migrateFrameworksV1(ws);
    expect(changed).toBe(false);
    expect(ws.departments[0].activities![0].frameworks).toEqual(["custom"]);
  });
});

// ─── migrateTimelineV1 ───────────────────────────────────────────────────────

describe("migrateTimelineV1", () => {
  test("重複 ogsm link（同 periodId|goalId|strategyId）→ 保留第一個，changed=true", () => {
    const dupLink = {
      id: "dl1",
      type: "ogsm" as const,
      periodId: "p1",
      goalId: "g1",
      strategyId: "s1",
      exclude: false,
    };
    const act = makeDeptActivity({
      dashboardLinks: [dupLink, { ...dupLink, id: "dl2" }],
    });
    const ws = makeV3Workspace([act]);
    const changed = migrateTimelineV1(ws);
    expect(changed).toBe(true);
    expect(ws.departments[0].activities![0].dashboardLinks).toHaveLength(1);
  });

  test("非 ogsm type link → pass-through，不被去重", () => {
    const act = makeDeptActivity({
      dashboardLinks: [
        {
          id: "dl1",
          type: "custom" as unknown as "ogsm",
          periodId: "p1",
          goalId: "g1",
          strategyId: "s1",
          exclude: false,
        },
        {
          id: "dl2",
          type: "custom" as unknown as "ogsm",
          periodId: "p1",
          goalId: "g1",
          strategyId: "s1",
          exclude: false,
        },
      ],
    });
    const ws = makeV3Workspace([act]);
    migrateTimelineV1(ws);
    expect(ws.departments[0].activities![0].dashboardLinks).toHaveLength(2);
  });

  test("ogsm link 缺 id → 補上 id", () => {
    const act = makeDeptActivity({
      dashboardLinks: [
        {
          id: "",
          type: "ogsm",
          periodId: "p1",
          goalId: "g1",
          strategyId: "s1",
          exclude: false,
        } as unknown as import("../schemas/ogsm").DashboardLink,
      ],
    });
    const ws = makeV3Workspace([act]);
    const changed = migrateTimelineV1(ws);
    expect(changed).toBe(true);
    expect(ws.departments[0].activities![0].dashboardLinks![0].id).toBeTruthy();
  });

  test("ogsm link 存在 → frameworks 自動加入 'ogsm'", () => {
    const act = makeDeptActivity({
      frameworks: [],
      dashboardLinks: [
        {
          id: "dl1",
          type: "ogsm",
          periodId: "p1",
          goalId: "g1",
          strategyId: "s1",
          exclude: false,
        },
      ],
    });
    const ws = makeV3Workspace([act]);
    migrateTimelineV1(ws);
    expect(ws.departments[0].activities![0].frameworks).toContain("ogsm");
  });

  test("多個 period 的 ogsm links → lifecycleStartPeriodId 設為最早期別", () => {
    const act = makeDeptActivity({
      dashboardLinks: [
        {
          id: "dl1",
          type: "ogsm",
          periodId: "p2",
          goalId: "g1",
          strategyId: "s1",
          exclude: false,
        },
        {
          id: "dl2",
          type: "ogsm",
          periodId: "p1",
          goalId: "g1",
          strategyId: "s2",
          exclude: false,
        },
      ],
    });
    const ws: WorkspaceData = {
      ...makeV3Workspace([act]),
      departments: [
        {
          id: "dept1",
          name: "部門A",
          activities: [act],
          periods: [
            {
              id: "p1",
              halfYear: "H1",
              year: 2026,
              ogsm: {
                objectives: { orgO: "", deptO: "" },
                goals: [],
                period: "2026 H1",
                importedAt: "",
                overallRate: 0,
              },
            },
            {
              id: "p2",
              halfYear: "H2",
              year: 2026,
              ogsm: {
                objectives: { orgO: "", deptO: "" },
                goals: [],
                period: "2026 H2",
                importedAt: "",
                overallRate: 0,
              },
            },
          ],
        },
      ],
    };
    migrateTimelineV1(ws);
    expect(ws.departments[0].activities![0].lifecycleStartPeriodId).toBe("p1");
  });
});

// ─── validateOrWarn ──────────────────────────────────────────────────────────

describe("validateOrWarn", () => {
  test("合法資料 → console.warn 不被呼叫", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateOrWarn(
      { safeParse: () => ({ success: true }) },
      {},
      "test-context",
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test("非法資料 → console.warn 被呼叫，且訊息含 context 字串", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateOrWarn(
      {
        safeParse: () => ({
          success: false,
          error: { message: "field missing" },
        }),
      },
      {},
      "my-context",
    );
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("my-context");
    spy.mockRestore();
  });

  test("非法資料 → 不拋出例外，函式正常 return", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() =>
      validateOrWarn(
        { safeParse: () => ({ success: false, error: { message: "err" } }) },
        {},
        "ctx",
      ),
    ).not.toThrow();
    vi.restoreAllMocks();
  });
});

// ─── syncRelationalLinksV1 ────────────────────────────────────────────────────

function makeRelWorkspace(
  activities: DeptActivity[],
  activityLinks: ActivityDashboardLink[] = [],
): WorkspaceData {
  return {
    version: 1,
    _migratedPhase2: true,
    _migratedPhase3: true,
    departments: [
      {
        id: "dept1",
        name: "部門A",
        activities,
        activityLinks: activityLinks.length > 0 ? activityLinks : undefined,
        periods: [],
      },
    ],
    teams: [],
  };
}

function makeRelActivity(
  id: string,
  dashboardLinks: DeptActivity["dashboardLinks"] = [],
): DeptActivity {
  return {
    id,
    rawText: `活動${id}`,
    kpis: [],
    status: "not-started",
    dashboardLinks: dashboardLinks.length > 0 ? dashboardLinks : undefined,
  };
}

describe("syncRelationalLinksV1", () => {
  test("activity.dashboardLinks → 同步新增至 dept.activityLinks", () => {
    const act = makeRelActivity("a1", [
      {
        id: "dl1",
        type: "ogsm",
        periodId: "p1",
        goalId: "g1",
        strategyId: "s1",
        exclude: false,
      },
    ]);
    const ws = makeRelWorkspace([act]);
    const changed = syncRelationalLinksV1(ws);
    expect(changed).toBe(true);
    const links = ws.departments[0].activityLinks!;
    expect(links).toHaveLength(1);
    expect(links[0].activityId).toBe("a1");
    expect(links[0].strategyId).toBe("s1");
  });

  test("activityLinks 中孤立外鍵（activityId 不存在）→ 刪除，changed=true", () => {
    const orphanLink: ActivityDashboardLink = {
      id: "dl_orphan",
      type: "ogsm",
      activityId: "non-existent",
      exclude: false,
    };
    const ws = makeRelWorkspace([], [orphanLink]);
    const changed = syncRelationalLinksV1(ws);
    expect(changed).toBe(true);
    expect(ws.departments[0].activityLinks ?? []).toHaveLength(0);
  });

  test("重複 link（相同 key）→ 去重，保留一個", () => {
    const link = {
      id: "dl1",
      type: "ogsm",
      periodId: "p1",
      goalId: "g1",
      strategyId: "s1",
      exclude: false,
    };
    const act = makeRelActivity("a1", [link, { ...link, id: "dl2" }]);
    const ws = makeRelWorkspace([act]);
    syncRelationalLinksV1(ws);
    const links = ws.departments[0].activityLinks!;
    // 相同 key 只保留一筆
    expect(links).toHaveLength(1);
  });

  test("activityLinks 已與 dashboardLinks 完全同步 → changed=false", () => {
    const link: ActivityDashboardLink = {
      id: "dl1",
      type: "ogsm",
      periodId: "p1",
      goalId: "g1",
      strategyId: "s1",
      exclude: false,
      activityId: "a1",
    };
    const act = makeRelActivity("a1", [
      {
        id: "dl1",
        type: "ogsm",
        periodId: "p1",
        goalId: "g1",
        strategyId: "s1",
        exclude: false,
      },
    ]);
    const ws = makeRelWorkspace([act], [link]);
    const changed = syncRelationalLinksV1(ws);
    expect(changed).toBe(false);
  });

  test("hydration：activity.dashboardLinks 與 activityLinks 不一致 → 用 activityLinks 覆蓋", () => {
    // activityLinks 有資料、activity.dashboardLinks 為空
    const relLink: ActivityDashboardLink = {
      id: "dl1",
      type: "ogsm",
      periodId: "p1",
      goalId: "g1",
      strategyId: "s1",
      exclude: false,
      activityId: "a1",
    };
    const act = makeRelActivity("a1"); // dashboardLinks = undefined
    const ws = makeRelWorkspace([act], [relLink]);
    syncRelationalLinksV1(ws);
    const hydrated = ws.departments[0].activities![0].dashboardLinks;
    expect(hydrated).toHaveLength(1);
    expect(hydrated![0].strategyId).toBe("s1");
  });
});

// ─── loadLegacyData ───────────────────────────────────────────────────────────

describe("loadLegacyData", () => {
  test("key 不存在 → 回傳 null", () => {
    // localStorage already cleared in beforeEach
    expect(loadLegacyData()).toBeNull();
  });

  test("有合法 OGSMData → 正常讀回並 normalize", () => {
    const legacy = {
      objectives: { orgO: "組織目標", deptO: "部門目標" },
      goals: [],
      period: "2026 H1",
      importedAt: "2026-01-01T00:00:00.000Z",
      overallRate: 0,
    };
    localStorage.setItem("ogsm_power_tool_data", JSON.stringify(legacy));
    const result = loadLegacyData();
    expect(result).not.toBeNull();
    expect(result!.objectives.orgO).toBe("組織目標");
    expect(Array.isArray(result!.goals)).toBe(true);
  });

  test("JSON 損毀 → 吞例外，回傳 null", () => {
    localStorage.setItem("ogsm_power_tool_data", "{not-valid-json");
    expect(loadLegacyData()).toBeNull();
  });
});
