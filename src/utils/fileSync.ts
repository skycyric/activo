/**
 * File System Access API + IndexedDB persistence
 * Multi-file mode: lets the user pick a root folder once; the handle is stored
 * in IndexedDB so re-permission (not re-pick) is all that's needed later.
 * Works with OneDrive / SharePoint sync folder for multi-user sharing.
 */

const DB_NAME = "ogsm_filesync";
const STORE_NAME = "handles";
export const BACKUP_FOLDER_NAME = "備份";
export const BACKUP_KEEP_LATEST = 30;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function sanitizeFileNamePart(input: string): string {
  const stripped = input
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .split("")
    .map((ch) => (ch.charCodeAt(0) < 32 ? "" : ch))
    .join("");

  return stripped
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function makeBackupTimestamp(date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const mi = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}${mi}${ss}`;
}

export function makeWorkspaceBackupFileName(
  stamp: string,
  version: number,
): string {
  return `workspace_${stamp}_v${version}.json`;
}

export function makeDeptBackupFileName(
  deptFolderName: string,
  stamp: string,
  version: number,
): string {
  const safe = sanitizeFileNamePart(deptFolderName) || "dept";
  return `dept_${safe}_${stamp}_v${version}.json`;
}

// ── IndexedDB helpers ──────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Returns true when the browser supports File System Access API. */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/** Read the full text content of the file. */
export async function readDataFile(
  handle: FileSystemFileHandle,
): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

/**
 * Return only the lastModified timestamp (ms) without reading the full content.
 * Cheap enough to call in a polling interval.
 */
export async function readDataFileMeta(
  handle: FileSystemFileHandle,
): Promise<number> {
  const file = await handle.getFile();
  return file.lastModified;
}

/** Overwrite the file with new content. */
export async function writeDataFile(
  handle: FileSystemFileHandle,
  content: string,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function ensureBackupDir(
  rootHandle: FileSystemDirectoryHandle,
): Promise<FileSystemDirectoryHandle> {
  return rootHandle.getDirectoryHandle(BACKUP_FOLDER_NAME, { create: true });
}

export async function writeJsonFileInDir(
  dirHandle: FileSystemDirectoryHandle,
  fileName: string,
  content: string,
): Promise<void> {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function pruneJsonBackupsByPrefix(
  dirHandle: FileSystemDirectoryHandle,
  fileNamePrefix: string,
  keepLatest = BACKUP_KEEP_LATEST,
): Promise<number> {
  if (keepLatest < 0) return 0;
  const matched: { name: string; lastModified: number }[] = [];
  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind !== "file") continue;
    if (!name.toLowerCase().endsWith(".json")) continue;
    if (!name.startsWith(fileNamePrefix)) continue;
    try {
      const file = await (entry as FileSystemFileHandle).getFile();
      matched.push({ name, lastModified: file.lastModified });
    } catch {
      // best-effort
    }
  }
  if (matched.length <= keepLatest) return 0;
  matched.sort((a, b) => b.lastModified - a.lastModified);
  const toRemove = matched.slice(keepLatest);
  for (const item of toRemove) {
    try {
      await dirHandle.removeEntry(item.name);
    } catch {
      // best-effort
    }
  }
  return toRemove.length;
}

// ── Directory handle (for conflict-copy scanning) ─────────────────────────

const DIR_HANDLE_KEY = "dataDir";

async function saveDirectoryHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, DIR_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(DIR_HANDLE_KEY);
    req.onsuccess = () =>
      resolve((req.result as FileSystemDirectoryHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Show a directory picker so the user can choose the OneDrive folder
 * that contains the data file.  Saves the handle to IndexedDB.
 */
export async function pickDataFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await showDirectoryPicker({ mode: "readwrite" });
    await saveDirectoryHandle(handle as FileSystemDirectoryHandle);
    return handle as FileSystemDirectoryHandle;
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") return null;
    throw e;
  }
}

/**
 * Returns the saved directory handle if permission is still granted, else null.
 * Safe to call on page load without a user gesture.
 */
export async function peekDataFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await loadDirectoryHandle();
    if (!handle) return null;
    const state = await handle.queryPermission({ mode: "readwrite" });
    return state === "granted" ? handle : null;
  } catch {
    return null;
  }
}

/** Remove the persisted directory handle from IndexedDB. */
export async function clearDataFolder(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(DIR_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort
  }
}

/**
 * Scan a directory for OneDrive conflict copies of a given file.
 *
 * OneDrive renames conflict copies as:
 *   "{originalBase} - {MachineOrUser info}.json"
 *
 * We detect any .json file in the same folder whose name starts with
 * "{originalBase} - " (and is not the original file itself).
 */
export async function scanForConflictCopies(
  dirHandle: FileSystemDirectoryHandle,
  originalFileName: string,
): Promise<{ handle: FileSystemFileHandle; name: string }[]> {
  const results: { handle: FileSystemFileHandle; name: string }[] = [];
  const base = originalFileName.replace(/\.json$/i, "");
  const conflictPrefix = `${base} - `;

  for await (const [name, entry] of dirHandle.entries()) {
    if (entry.kind !== "file") continue;
    if (!name.toLowerCase().endsWith(".json")) continue;
    if (name === originalFileName) continue;
    if (name.startsWith(conflictPrefix)) {
      results.push({
        handle: entry as FileSystemFileHandle,
        name,
      });
    }
  }
  return results;
}

// ── Multi-dept file mode ──────────────────────────────────────────────────

const ROOT_HANDLE_KEY = "rootDir2";

async function saveRootHandleInternal(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, ROOT_HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadRootHandleInternal(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(ROOT_HANDLE_KEY);
    req.onsuccess = () =>
      resolve((req.result as FileSystemDirectoryHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/** Persist the root directory handle to IndexedDB. */
export async function saveRootHandle(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  return saveRootHandleInternal(handle);
}

/**
 * Load the root handle on page load (no user gesture).
 * Returns the handle if read permission is already granted, else null.
 */
export async function loadRootHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await loadRootHandleInternal();
    if (!handle) return null;
    // Check at least read permission
    const state = await handle.queryPermission({ mode: "read" });
    return state === "granted" ? handle : null;
  } catch {
    return null;
  }
}

/** Remove the root handle from IndexedDB. */
export async function clearRootHandle(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(ROOT_HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort
  }
}

/**
 * Show a directory picker for the root OGSM folder.
 * Requests readwrite so the app can later request readwrite per subfolder.
 * Saves handle to IndexedDB and returns it; returns null on cancel.
 */
export async function pickRootFolder(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const handle = await showDirectoryPicker({ mode: "readwrite" });
    await saveRootHandleInternal(handle as FileSystemDirectoryHandle);
    return handle as FileSystemDirectoryHandle;
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") return null;
    throw e;
  }
}

/**
 * Scan direct sub-folders of rootHandle for a single .json file each.
 * Skips sub-folders that have no .json (e.g. the app's own html folder).
 * Returns entries sorted by sub-folder name.
 */
export async function scanDeptJsons(
  rootHandle: FileSystemDirectoryHandle,
): Promise<
  {
    subfolderName: string;
    handle: FileSystemFileHandle;
    subDirHandle: FileSystemDirectoryHandle;
  }[]
> {
  const results: {
    subfolderName: string;
    handle: FileSystemFileHandle;
    subDirHandle: FileSystemDirectoryHandle;
  }[] = [];

  for await (const [subName, subEntry] of rootHandle.entries()) {
    if (subEntry.kind !== "directory") continue;
    if (subName === BACKUP_FOLDER_NAME) continue;
    const subDir = subEntry as FileSystemDirectoryHandle;
    let preferredJson: FileSystemFileHandle | null = null;
    let fallbackJson: FileSystemFileHandle | null = null;
    for await (const [fileName, fileEntry] of subDir.entries()) {
      if (fileEntry.kind !== "file") continue;
      if (!fileName.toLowerCase().endsWith(".json")) continue;
      if (fileName.toLowerCase() === "data.json") {
        preferredJson = fileEntry as FileSystemFileHandle;
        break;
      }
      fallbackJson ??= fileEntry as FileSystemFileHandle;
    }
    const selectedJson = preferredJson ?? fallbackJson;
    if (selectedJson) {
      results.push({
        subfolderName: subName,
        handle: selectedJson,
        subDirHandle: subDir,
      });
    }
  }

  results.sort((a, b) => a.subfolderName.localeCompare(b.subfolderName));
  return results;
}

/**
 * Probe whether a FileSystemFileHandle is writable without actually writing.
 * Attempts createWritable(); if it throws (NotAllowedError / SecurityError) → read-only.
 */
export async function probeWritable(
  handle: FileSystemFileHandle,
): Promise<boolean> {
  try {
    const writable = await handle.createWritable();
    await writable.abort();
    return true;
  } catch {
    return false;
  }
}

// ── Advisory Lock File ────────────────────────────────────────────────────
//
// Prevents concurrent writes that cause OneDrive to generate conflict copies
// (e.g. "data - DESKTOP-ABC.json").  All cooperating clients must use
// acquireLock / releaseLock around every write to data.json.
//
// Limitation: the lock file itself travels through OneDrive, so there is a
// small propagation window (~sync latency) where two clients could both see
// "no lock" simultaneously.  We mitigate this with a write-then-verify step:
// after writing our lock we wait briefly and re-read to confirm ownership.
// This is a best-effort advisory mechanism, not a hard OS mutex.

export const LOCK_FILE_NAME = "data.lock";
/** How long (ms) a lock is considered fresh.  Stale locks are auto-broken. */
export const LOCK_TTL_MS = 60_000;
/** Delay (ms) after writing our lock before re-reading to verify ownership. */
const LOCK_VERIFY_DELAY_MS = 800;

export interface LockFileContent {
  /** Opaque ID identifying this browser session (not the user). */
  writerId: string;
  /** ISO timestamp when the lock was created. */
  at: string;
  /**
   * Monotonic counter (Date.now()) used to distinguish two clients that happen
   * to write their lock file within the same millisecond.
   */
  nonce: number;
}

/** Return a stable writer ID for this browser session (sessionStorage). */
let _writerId: string | null = null;
export function getWriterId(): string {
  if (_writerId) return _writerId;
  const stored = sessionStorage.getItem("ogsm_writer_id");
  if (stored) {
    _writerId = stored;
    return _writerId;
  }
  const id = crypto.randomUUID();
  sessionStorage.setItem("ogsm_writer_id", id);
  _writerId = id;
  return _writerId;
}

/** Read an existing lock file; returns null if absent or unreadable. */
export async function readLockFile(
  subDirHandle: FileSystemDirectoryHandle,
  lockFileName = LOCK_FILE_NAME,
): Promise<LockFileContent | null> {
  try {
    const fh = await subDirHandle.getFileHandle(lockFileName, {
      create: false,
    });
    const file = await fh.getFile();
    const text = await file.text();
    return JSON.parse(text) as LockFileContent;
  } catch {
    return null;
  }
}

/** Write (overwrite) the lock file. */
async function writeLockFile(
  subDirHandle: FileSystemDirectoryHandle,
  content: LockFileContent,
  lockFileName = LOCK_FILE_NAME,
): Promise<void> {
  const fh = await subDirHandle.getFileHandle(lockFileName, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(content));
  await writable.close();
}

/** Delete the lock file (best-effort; does not throw). */
export async function releaseLock(
  subDirHandle: FileSystemDirectoryHandle,
  lockFileName = LOCK_FILE_NAME,
): Promise<void> {
  try {
    await subDirHandle.removeEntry(lockFileName);
  } catch {
    // best-effort
  }
}

/** True when the lock is older than LOCK_TTL_MS (treat as abandoned). */
export function isLockStale(
  lock: LockFileContent,
  ttlMs = LOCK_TTL_MS,
): boolean {
  return Date.now() - new Date(lock.at).getTime() > ttlMs;
}

export type AcquireLockResult =
  | { ok: true; lock: LockFileContent }
  | {
      ok: false;
      reason: "locked-by-other" | "verify-failed" | "error";
      existingLock?: LockFileContent;
    };

/**
 * Try to acquire the advisory lock for a department subfolder.
 *
 * Steps:
 * 1. Read existing lock → bail if fresh and owned by someone else.
 * 2. Write our lock.
 * 3. Wait LOCK_VERIFY_DELAY_MS for OneDrive to potentially propagate a
 *    concurrent lock from another client.
 * 4. Re-read → if the nonce changed, another client raced us; back off.
 *
 * Caller MUST call releaseLock() after the write is complete (success or fail).
 */
export async function acquireLock(
  subDirHandle: FileSystemDirectoryHandle,
  lockFileName = LOCK_FILE_NAME,
): Promise<AcquireLockResult> {
  try {
    // 1. Check for existing lock
    const existing = await readLockFile(subDirHandle, lockFileName);
    if (
      existing &&
      !isLockStale(existing) &&
      existing.writerId !== getWriterId()
    ) {
      return { ok: false, reason: "locked-by-other", existingLock: existing };
    }

    // 2. Write our lock
    const myLock: LockFileContent = {
      writerId: getWriterId(),
      at: new Date().toISOString(),
      nonce: Date.now(),
    };
    await writeLockFile(subDirHandle, myLock, lockFileName);

    // 3. Wait briefly so OneDrive can surface a concurrent lock
    await new Promise<void>((resolve) =>
      setTimeout(resolve, LOCK_VERIFY_DELAY_MS),
    );

    // 4. Re-read to verify ownership
    const current = await readLockFile(subDirHandle, lockFileName);
    if (
      !current ||
      current.nonce !== myLock.nonce ||
      current.writerId !== myLock.writerId
    ) {
      // Another client overwrote our lock — back off
      return {
        ok: false,
        reason: "verify-failed",
        existingLock: current ?? undefined,
      };
    }

    return { ok: true, lock: myLock };
  } catch (e) {
    console.error("[acquireLock] error", e);
    return { ok: false, reason: "error" };
  }
}
