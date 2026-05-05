import { afterEach, beforeEach, describe, test, expect, vi } from "vitest";
import {
  makeBackupTimestamp,
  makeWorkspaceBackupFileName,
  makeDeptBackupFileName,
  isFileSystemAccessSupported,
  scanForConflictCopies,
  isLockStale,
  readLockFile,
  releaseLock,
  acquireLock,
  LOCK_FILE_NAME,
  LOCK_TTL_MS,
  type LockFileContent,
} from "./fileSync";

// ── sessionStorage stub（Node 環境沒有 sessionStorage）──────────────────────
{
  const _store = new Map<string, string>();
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => _store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        _store.set(k, v);
      },
      removeItem: (k: string) => {
        _store.delete(k);
      },
      clear: () => {
        _store.clear();
      },
    },
  });
}

// ── Mock Dir Handle builder ───────────────────────────────────────────────────
/**
 * In-memory FileSystemDirectoryHandle.
 * Supports getFileHandle (read + write) and removeEntry.
 * The `store` Map is shared so tests can inspect / mutate it externally.
 */
function makeMockDirHandle(
  store: Map<string, string>,
): FileSystemDirectoryHandle {
  return {
    async getFileHandle(name: string, options?: { create?: boolean }) {
      const exists = store.has(name);
      if (!exists && !options?.create) {
        throw new DOMException("File not found", "NotFoundError");
      }
      return {
        async getFile() {
          const content = store.get(name) ?? "";
          return {
            async text() {
              return content;
            },
          } as unknown as File;
        },
        async createWritable() {
          let buf = "";
          return {
            async write(data: string) {
              buf = data;
            },
            async close() {
              store.set(name, buf);
            },
            async abort() {},
          };
        },
      } as unknown as FileSystemFileHandle;
    },
    async removeEntry(name: string) {
      store.delete(name);
    },
  } as unknown as FileSystemDirectoryHandle;
}

const OTHER_WRITER = "00000000-0000-0000-0000-000000000001";

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
 * Used by scanForConflictCopies tests.
 */
function makeScanMockDirHandle(
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
    const dir = makeScanMockDirHandle([]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(0);
  });

  test("只有原始檔案本身 → 不算副本", async () => {
    const dir = makeScanMockDirHandle([{ name: "data.json", kind: "file" }]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(0);
  });

  test("OneDrive 衝突副本格式（data - PC名稱.json）→ 偵測到", async () => {
    const dir = makeScanMockDirHandle([
      { name: "data.json", kind: "file" },
      { name: "data - DESKTOP-ABC123.json", kind: "file" },
    ]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("data - DESKTOP-ABC123.json");
  });

  test("多個衝突副本 → 全部回傳", async () => {
    const dir = makeScanMockDirHandle([
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
    const dir = makeScanMockDirHandle([
      { name: "data.json", kind: "file" },
      { name: "data - subdir", kind: "directory" },
    ]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(0);
  });

  test("非 .json 副檔名 → 忽略", async () => {
    const dir = makeScanMockDirHandle([
      { name: "data.json", kind: "file" },
      { name: "data - PC1.txt", kind: "file" },
      { name: "data - PC1.bak", kind: "file" },
    ]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(0);
  });

  test("不符合前綴格式的其他 json 檔 → 忽略", async () => {
    const dir = makeScanMockDirHandle([
      { name: "data.json", kind: "file" },
      { name: "backup.json", kind: "file" },
      { name: "data_backup.json", kind: "file" },
    ]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(0);
  });

  test("大小寫不影響副檔名偵測（DATA - PC1.JSON）", async () => {
    const dir = makeScanMockDirHandle([
      { name: "data.json", kind: "file" },
      { name: "data - PC1.JSON", kind: "file" },
    ]);
    const result = await scanForConflictCopies(dir, "data.json");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("data - PC1.JSON");
  });
});

// ─── isLockStale ──────────────────────────────────────────────────────────────

describe("isLockStale", () => {
  function makeLock(msBefore: number): LockFileContent {
    return {
      writerId: "some-writer",
      at: new Date(Date.now() - msBefore).toISOString(),
      nonce: 1,
    };
  }

  test("剛建立的 lock → 未過期", () => {
    expect(isLockStale(makeLock(1_000))).toBe(false);
  });

  test("剛好達到 TTL 邊界 → 過期", () => {
    expect(isLockStale(makeLock(LOCK_TTL_MS + 1))).toBe(true);
  });

  test("自訂 ttlMs", () => {
    expect(isLockStale(makeLock(5_000), 10_000)).toBe(false);
    expect(isLockStale(makeLock(15_000), 10_000)).toBe(true);
  });
});

// ─── readLockFile ─────────────────────────────────────────────────────────────

describe("readLockFile", () => {
  test("lock 檔不存在 → 回傳 null", async () => {
    const store = new Map<string, string>();
    const dir = makeMockDirHandle(store);
    expect(await readLockFile(dir)).toBeNull();
  });

  test("lock 檔存在且格式正確 → 回傳解析後物件", async () => {
    const lock: LockFileContent = {
      writerId: "w1",
      at: "2026-05-05T10:00:00.000Z",
      nonce: 123,
    };
    const store = new Map([[LOCK_FILE_NAME, JSON.stringify(lock)]]);
    const dir = makeMockDirHandle(store);
    const result = await readLockFile(dir);
    expect(result).toEqual(lock);
  });

  test("lock 檔內容為無效 JSON → 回傳 null", async () => {
    const store = new Map([[LOCK_FILE_NAME, "NOT_JSON{{{"]]);
    const dir = makeMockDirHandle(store);
    expect(await readLockFile(dir)).toBeNull();
  });

  test("自訂 lockFileName 參數", async () => {
    const lock: LockFileContent = {
      writerId: "w1",
      at: "2026-05-05T00:00:00Z",
      nonce: 1,
    };
    const store = new Map([["custom.lock", JSON.stringify(lock)]]);
    const dir = makeMockDirHandle(store);
    expect(await readLockFile(dir, "custom.lock")).toEqual(lock);
    expect(await readLockFile(dir, LOCK_FILE_NAME)).toBeNull();
  });
});

// ─── releaseLock ──────────────────────────────────────────────────────────────

describe("releaseLock", () => {
  test("lock 存在 → 刪除後不再存在", async () => {
    const store = new Map([[LOCK_FILE_NAME, "{}"]]);
    const dir = makeMockDirHandle(store);
    await releaseLock(dir);
    expect(store.has(LOCK_FILE_NAME)).toBe(false);
  });

  test("lock 不存在 → 不拋出例外", async () => {
    const store = new Map<string, string>();
    const dir = makeMockDirHandle(store);
    await expect(releaseLock(dir)).resolves.toBeUndefined();
  });
});

// ─── acquireLock ──────────────────────────────────────────────────────────────

describe("acquireLock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("無現有 lock → 成功取得，lock 檔被寫入", async () => {
    const store = new Map<string, string>();
    const dir = makeMockDirHandle(store);

    const promise = acquireLock(dir);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    expect(store.has(LOCK_FILE_NAME)).toBe(true);
    const written = JSON.parse(store.get(LOCK_FILE_NAME)!) as LockFileContent;
    expect(written.writerId).toBeTruthy();
    expect(typeof written.nonce).toBe("number");
  });

  test("其他人持有新鮮 lock → locked-by-other，不覆寫", async () => {
    const otherLock: LockFileContent = {
      writerId: OTHER_WRITER,
      at: new Date(Date.now() - 1_000).toISOString(),
      nonce: 42,
    };
    const store = new Map([[LOCK_FILE_NAME, JSON.stringify(otherLock)]]);
    const dir = makeMockDirHandle(store);

    const promise = acquireLock(dir);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("locked-by-other");
      expect(result.existingLock?.writerId).toBe(OTHER_WRITER);
    }
    // 原本的 lock 內容應未被覆寫
    expect(JSON.parse(store.get(LOCK_FILE_NAME)!).nonce).toBe(42);
  });

  test("持有過期 lock 的他人 → 自動奪取，成功取得", async () => {
    const staleLock: LockFileContent = {
      writerId: OTHER_WRITER,
      at: new Date(Date.now() - LOCK_TTL_MS - 5_000).toISOString(),
      nonce: 99,
    };
    const store = new Map([[LOCK_FILE_NAME, JSON.stringify(staleLock)]]);
    const dir = makeMockDirHandle(store);

    const promise = acquireLock(dir);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(true);
    const written = JSON.parse(store.get(LOCK_FILE_NAME)!) as LockFileContent;
    expect(written.writerId).not.toBe(OTHER_WRITER);
  });

  test("同一 writer 重入（自己持有的 lock）→ 成功取得", async () => {
    // 先取得一次，讓 writerId 被初始化並寫入 store
    const store = new Map<string, string>();
    const dir = makeMockDirHandle(store);
    const firstPromise = acquireLock(dir);
    await vi.runAllTimersAsync();
    const first = await firstPromise;
    expect(first.ok).toBe(true);

    // 不 release，直接再 acquire 一次（同一 session）
    const secondPromise = acquireLock(dir);
    await vi.runAllTimersAsync();
    const second = await secondPromise;
    expect(second.ok).toBe(true);
  });

  test("競態：verify 階段 lock 被他人覆寫 → verify-failed", async () => {
    const store = new Map<string, string>();
    const dir = makeMockDirHandle(store);

    // 啟動 acquireLock（writeLockFile 完成後會進入 setTimeout 等待）
    const promise = acquireLock(dir);

    // 排空 microtask queue，直到 writeLockFile 把 lock 寫進 store
    // （比固定次數 Promise.resolve() 更健壯）
    for (let i = 0; i < 50; i++) {
      await Promise.resolve();
      if (store.has(LOCK_FILE_NAME)) break;
    }
    expect(store.has(LOCK_FILE_NAME)).toBe(true); // 前置確認

    // 模擬他人在 verify delay 期間覆寫 lock
    const racerLock: LockFileContent = {
      writerId: OTHER_WRITER,
      at: new Date().toISOString(),
      nonce: 777_777,
    };
    store.set(LOCK_FILE_NAME, JSON.stringify(racerLock));

    // 推進計時器，觸發 verify 讀取
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("verify-failed");
    }
  });

  test("releaseLock 後，其他人可取得 lock", async () => {
    const store = new Map<string, string>();
    const dir = makeMockDirHandle(store);

    const p1 = acquireLock(dir);
    await vi.runAllTimersAsync();
    const r1 = await p1;
    expect(r1.ok).toBe(true);

    await releaseLock(dir);
    expect(store.has(LOCK_FILE_NAME)).toBe(false);

    // 模擬新 session（其他 writer）
    const otherStore = new Map<string, string>();
    const otherDir = makeMockDirHandle(otherStore);
    const p2 = acquireLock(otherDir);
    await vi.runAllTimersAsync();
    const r2 = await p2;
    expect(r2.ok).toBe(true);
  });
});
