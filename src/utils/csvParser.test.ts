import { describe, test, expect } from "vitest";
import { genId, parseCSVRaw, avgRate, parseOGSM } from "./csvParser";

// ─── genId ────────────────────────────────────────────────────────────────────

describe("genId", () => {
  test("預設前綴為 id", () => {
    const id = genId();
    expect(id.startsWith("id_")).toBe(true);
  });

  test("自訂前綴正確套用", () => {
    expect(genId("kpi").startsWith("kpi_")).toBe(true);
    expect(genId("goal").startsWith("goal_")).toBe(true);
    expect(genId("str").startsWith("str_")).toBe(true);
  });

  test("格式為 prefix_base36timestamp_4chars", () => {
    const id = genId("x");
    const parts = id.split("_");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("x");
    expect(parts[1].length).toBeGreaterThan(0); // base36 timestamp
    expect(parts[2]).toHaveLength(4);
  });

  test("連續呼叫產生唯一 id", () => {
    const ids = new Set(Array.from({ length: 50 }, () => genId("t")));
    expect(ids.size).toBe(50);
  });
});

// ─── parseCSVRaw ──────────────────────────────────────────────────────────────

describe("parseCSVRaw", () => {
  test("基本逗號分隔", () => {
    const rows = parseCSVRaw("a,b,c\n1,2,3");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["a", "b", "c"]);
    expect(rows[1]).toEqual(["1", "2", "3"]);
  });

  test("雙引號包圍欄位（含逗號）", () => {
    const rows = parseCSVRaw('"hello, world",foo');
    expect(rows[0]).toEqual(["hello, world", "foo"]);
  });

  test('雙引號逸脫（兩個 "" → 一個 "）', () => {
    const rows = parseCSVRaw('"say ""hi""",ok');
    expect(rows[0][0]).toBe('say "hi"');
  });

  test("CRLF 換行", () => {
    const rows = parseCSVRaw("a,b\r\nc,d");
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual(["c", "d"]);
  });

  test("略過純空白行", () => {
    const rows = parseCSVRaw("a,b\n\nc,d");
    expect(rows).toHaveLength(2);
  });

  test("空字串輸入回傳空陣列", () => {
    expect(parseCSVRaw("")).toEqual([]);
  });

  test("欄位尾端空白被去除", () => {
    const rows = parseCSVRaw("  foo  ,  bar  ");
    expect(rows[0]).toEqual(["foo", "bar"]);
  });

  test("多欄位含空欄（兩個逗號）", () => {
    const rows = parseCSVRaw("a,,c");
    expect(rows[0]).toHaveLength(3);
    expect(rows[0][1]).toBe("");
  });
});

// ─── avgRate ──────────────────────────────────────────────────────────────────

describe("avgRate", () => {
  test("空陣列回傳 0", () => {
    expect(avgRate([])).toBe(0);
  });

  test("全為 0 回傳 0", () => {
    expect(avgRate([0, 0, 0])).toBe(0);
  });

  test("負數被過濾（視為無效）", () => {
    // valid = [80, 60], avg = 70
    expect(avgRate([-1, 80, 60])).toBe(70);
  });

  test("全為負數回傳 0", () => {
    expect(avgRate([-10, -20])).toBe(0);
  });

  test("正確計算平均並四捨五入", () => {
    expect(avgRate([100, 100])).toBe(100);
    expect(avgRate([33, 34])).toBe(34); // 33.5 → 34
    expect(avgRate([10, 20, 30])).toBe(20);
  });
});

// ─── parseOGSM ────────────────────────────────────────────────────────────────

// parseOGSM 跳過前 4 rows（row 0-3 為 header），第 5 行起為資料。
// parseCSVRaw 會略過全空白行，所以 header 列必須有至少一個非空欄。
const MINIMAL_CSV = `組織名稱,測試公司
部門,商發部
策略(S),措施(M)
期間,2026 H1
G1：提升市佔率,增加線上曝光,達成率：80% 目標：1000人 實際已達成：800人,Q1,Q2,負責人A,備注
`;

const MULTI_STRATEGY_CSV = `組織名稱,Org
部門,Dept
策略(S),措施(M)
期間,2026 H1
G1：目標A,策略A1,,Q1,,負責人A,
,策略A2,,Q1,,負責人B,
G2：目標B,策略B1,,Q1,,
`;

describe("parseOGSM", () => {
  test("不應 throw", () => {
    expect(() => parseOGSM(MINIMAL_CSV)).not.toThrow();
    expect(() => parseOGSM("")).not.toThrow();
  });

  test("解析 objectives（組織/部門名稱）", () => {
    const result = parseOGSM(MINIMAL_CSV);
    expect(result.objectives.orgO).toBe("測試公司");
    expect(result.objectives.deptO).toBe("商發部");
  });

  test("目標數量正確", () => {
    const result = parseOGSM(MINIMAL_CSV);
    expect(result.goals).toHaveLength(1);
  });

  test("目標 label 與 title 正確解析", () => {
    const result = parseOGSM(MINIMAL_CSV);
    const g = result.goals[0];
    expect(g.label).toBe("G1");
    expect(g.title).toBe("提升市佔率");
  });

  test("策略數量正確", () => {
    const result = parseOGSM(MINIMAL_CSV);
    expect(result.goals[0].strategies).toHaveLength(1);
  });

  test("策略 owners 正確解析", () => {
    const result = parseOGSM(MINIMAL_CSV);
    expect(result.goals[0].strategies[0].owners).toContain("負責人A");
  });

  test("多 G 多 S 結構", () => {
    const result = parseOGSM(MULTI_STRATEGY_CSV);
    expect(result.goals).toHaveLength(2);
    expect(result.goals[0].strategies).toHaveLength(2);
    expect(result.goals[1].strategies).toHaveLength(1);
  });

  test("回傳含 period 與 importedAt 的完整 OGSMData", () => {
    const result = parseOGSM(MINIMAL_CSV);
    expect(result.period).toMatch(/^\d{4} H[12]$/);
    expect(result.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof result.overallRate).toBe("number");
  });

  test("空 CSV 仍回傳合法結構", () => {
    const result = parseOGSM("");
    expect(result.goals).toEqual([]);
    expect(result.overallRate).toBe(0);
  });
});
