import { afterEach, describe, test, expect } from "vitest";
import {
  makeBackupTimestamp,
  makeWorkspaceBackupFileName,
  makeDeptBackupFileName,
  isFileSystemAccessSupported,
  scanForConflictCopies,
} from "./fileSync";

const originalWindow = (globalThis as { window?: unknown }).window;

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window;
    return;
  }
  (globalThis as { window?: unknown }).window = originalWindow;
});

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

// ─── isFileSystemAccessSupported ─────────────────────────────────────────────

describe("isFileSystemAccessSupported", () => {
  test("window 不存在或沒有 showDirectoryPicker 時回傳 false", () => {
    delete (globalThis as { window?: unknown }).window;
    expect(isFileSystemAccessSupported()).toBe(false);

    (globalThis as { window?: unknown }).window = {};
    expect(isFileSystemAccessSupported()).toBe(false);
  });

  test("window 存在且包含 showDirectoryPicker 時回傳 true", () => {
    (globalThis as { window?: unknown }).window = {
      showDirectoryPicker: () => Promise.resolve(null),
    };
    expect(isFileSystemAccessSupported()).toBe(true);
  });
});

// ─── scanForConflictCopies ────────────────────────────────────────────────────

/**
 * Build a minimal mock FileSystemDirectoryHandle whose entries() async
 * iterator yields the supplied map of { name → kind }.
 */
function makeMockDirHandle(
  entries: Array<{ name: string; kind: "file" | "directory" }>,
): FileSystemDirectoryHandle {
  return {
    entries: async function* () {
      for (const e of entries) {
        yield [
          e.name,
          { kind: e.kind } as FileSystemFileHandle | FileSystemDirectoryHandle,
        ] as [string, FileSystemFileHandle | FileSystemDirectoryHandle];
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe("scanForConflictCopies", () => {
  test("目錄為空 → 回傳空陣列", async () => {
    const dir = makeMockDirHandle([]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(0);
  });

  test("只有原始檔案本身 → 不算副本", async () => {
    const dir = makeMockDirHandle([{ name: "data.json", kind: "file" }]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(0);
  });

  test("OneDrive 衝突副本格式（data - PC名稱.json）→ 偵測到", async () => {
    const dir = makeMockDirHandle([
      { name: "data.json", kind: "file" },
      { name: "data - DESKTOP-ABC123.json", kind: "file" },
    ]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("data - DESKTOP-ABC123.json");
  });

  test("多個衝突副本 → 全部回傳", async () => {
    const dir = makeMockDirHandle([
      { name: "data.json", kind: "file" },
      { name: "data - PC1.json", kind: "file" },
      { name: "data - PC2 (John).json", kind: "file" },
    ]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toContain("data - PC1.json");
    expect(result.map((r) => r.name)).toContain("data - PC2 (John).json");
  });

  test("副目錄（kind=directory）→ 忽略", async () => {
    const dir = makeMockDirHandle([
      { name: "data.json", kind: "file" },
      { name: "data - subdir", kind: "directory" },
    ]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(0);
  });

  test("非 .json 副檔名 → 忽略", async () => {
    const dir = makeMockDirHandle([
      { name: "data.json", kind: "file" },
      { name: "data - PC1.txt", kind: "file" },
      { name: "data - PC1.bak", kind: "file" },
    ]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(0);
  });

  test("不符合前綴格式的其他 json 檔 → 忽略", async () => {
    const dir = makeMockDirHandle([
      { name: "data.json", kind: "file" },
      { name: "backup.json", kind: "file" },
      { name: "data_backup.json", kind: "file" },
    ]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(0);
  });

  test("大小寫不影響副檔名偵測（DATA - PC1.JSON）", async () => {
    const dir = makeMockDirHandle([
      { name: "data.json", kind: "file" },
      { name: "data - PC1.JSON", kind: "file" },
    ]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("data - PC1.JSON");
  });
});
