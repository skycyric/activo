import { describe, test, expect } from "vitest";
import {
  makeBackupTimestamp,
  makeWorkspaceBackupFileName,
  makeDeptBackupFileName,
} from "./fileSync";

// ─── makeBackupTimestamp ──────────────────────────────────────────────────────

describe("makeBackupTimestamp", () => {
  test("輸出格式為 YYYY-MM-DD_HHmmss", () => {
    const date = new Date(2026, 3, 20, 9, 5, 3); // 2026-04-20 09:05:03
    const stamp = makeBackupTimestamp(date);
    expect(stamp).toBe("2026-04-20_090503");
  });

  test("月份、日、時、分、秒 < 10 時補零", () => {
    const date = new Date(2026, 0, 1, 1, 2, 3); // 2026-01-01 01:02:03
    const stamp = makeBackupTimestamp(date);
    expect(stamp).toBe("2026-01-01_010203");
  });
});

// ─── makeWorkspaceBackupFileName ─────────────────────────────────────────────

describe("makeWorkspaceBackupFileName", () => {
  test("輸出格式為 workspace_{stamp}_v{version}.json", () => {
    const name = makeWorkspaceBackupFileName("2026-04-20_090503", 42);
    expect(name).toBe("workspace_2026-04-20_090503_v42.json");
  });
});

// ─── makeDeptBackupFileName ───────────────────────────────────────────────────

describe("makeDeptBackupFileName", () => {
  test("正常部門名稱 → dept_{name}_{stamp}_v{version}.json", () => {
    const name = makeDeptBackupFileName("商務發展部", "2026-04-20_090503", 3);
    expect(name).toBe("dept_商務發展部_2026-04-20_090503_v3.json");
  });

  test("含特殊字元（/ : * ? 等）→ 替換成 _", () => {
    const name = makeDeptBackupFileName("部門A/B:C*D", "2026-01-01_000000", 1);
    // sanitizeFileNamePart replaces these chars, then collapses consecutive _
    expect(name).not.toMatch(/[/:*?"<>|]/);
    expect(name.startsWith("dept_")).toBe(true);
  });

  test("超長名稱（> 80 字元）→ safe part 截斷至 80 字元以內", () => {
    const longName = "A".repeat(100);
    const name = makeDeptBackupFileName(longName, "2026-01-01_000000", 1);
    // extract safe part: between "dept_" and "_{stamp}"
    const safe = name
      .replace(/^dept_/, "")
      .replace(/_2026-01-01_000000_v1\.json$/, "");
    expect(safe.length).toBeLessThanOrEqual(80);
  });
});
