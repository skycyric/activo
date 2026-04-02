/**
 * File System Access API + IndexedDB persistence
 * Lets the user pick a JSON data file once; the handle is stored in IndexedDB
 * so re-permission (not re-pick) is all that's needed on subsequent app opens.
 * Works with OneDrive / SharePoint sync folder for multi-user sharing.
 */

const DB_NAME = "ogsm_filesync";
const STORE_NAME = "handles";
const HANDLE_KEY = "dataFile";

// ── IndexedDB helpers ──────────────────────────────────────────────────────

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle(): Promise<FileSystemFileHandle | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    req.onsuccess = () => resolve((req.result as FileSystemFileHandle) ?? null);
    req.onerror = () => reject(req.error);
  });
}

// ── Permission helpers ────────────────────────────────────────────────────

/** Query current permission without prompting (safe on page load, no user gesture needed). */
async function queryPermission(
  handle: FileSystemFileHandle,
): Promise<PermissionState> {
  return handle.queryPermission({ mode: "readwrite" });
}

/** Request permission — MUST be called from a user-gesture handler (button click). */
async function requestPermission(
  handle: FileSystemFileHandle,
): Promise<boolean> {
  return (
    ((await handle.requestPermission({ mode: "readwrite" })) as string) ===
    "granted"
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

/** Returns true when the browser supports File System Access API. */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showOpenFilePicker" in window;
}

/**
 * Show a file picker for a JSON file.
 * Saves the handle to IndexedDB on success; returns null if the user cancels.
 */
export async function pickDataFile(): Promise<FileSystemFileHandle | null> {
  try {
    const [handle] = await showOpenFilePicker({
      types: [
        {
          description: "JSON 資料檔",
          accept: { "application/json": [".json"] },
        },
      ],
      multiple: false,
    });
    await saveHandle(handle as FileSystemFileHandle);
    return handle as FileSystemFileHandle;
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") return null; // user cancelled
    throw e;
  }
}

/**
 * Called on page load (no user gesture).
 * Returns the handle if permission is already granted, or null.
 * If a handle exists but needs re-authorization, use `hasSavedHandle()` + `authorizeDataFile()`.
 */
export async function peekDataFile(): Promise<FileSystemFileHandle | null> {
  try {
    const handle = await loadHandle();
    if (!handle) return null;
    const state = await queryPermission(handle);
    return state === "granted" ? handle : null;
  } catch {
    return null;
  }
}

/**
 * Returns true when IndexedDB contains a saved handle (regardless of permission state).
 * Use this to decide whether to show a "重新授權" button.
 */
export async function hasSavedHandle(): Promise<boolean> {
  try {
    return (await loadHandle()) !== null;
  } catch {
    return false;
  }
}

/**
 * Re-authorize a saved handle — MUST be called from a user-gesture handler (button click).
 * Returns the handle on success, or null if the user denies / no handle saved.
 */
export async function authorizeDataFile(): Promise<FileSystemFileHandle | null> {
  try {
    const handle = await loadHandle();
    if (!handle) return null;
    const ok = await requestPermission(handle);
    return ok ? handle : null;
  } catch {
    return null;
  }
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

/** Remove the persisted handle from IndexedDB. */
export async function clearDataFile(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // best-effort
  }
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
