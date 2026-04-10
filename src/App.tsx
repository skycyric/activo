import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type {
  OGSMData,
  Strategy,
  Goal,
  WorkspaceData,
  Department,
  PeriodData,
  Team,
  Measure,
  DeptActivity,
} from "./schemas/ogsm";
import { parseOGSM, avgRate, genId } from "./utils/csvParser";
import {
  saveWorkspace,
  loadWorkspace,
  loadLegacyData,
  wrapOGSMInWorkspace,
  exportWorkspaceJSON,
  importJSON,
  readFileAsText,
  validateOrWarn,
} from "./utils/storage";
import { WorkspaceDataSchema } from "./schemas/ogsm";
import {
  isFileSystemAccessSupported,
  peekDataFile,
  hasSavedHandle,
  authorizeDataFile,
  readDataFile,
  readDataFileMeta,
  writeDataFile,
  clearDataFile,
  pickDataFolder,
  peekDataFolder,
  clearDataFolder,
  scanForConflictCopies,
  pickRootFolder,
  loadRootHandle,
  clearRootHandle,
  saveRootHandle,
  scanDeptJsons,
  probeWritable,
} from "./utils/fileSync";
import {
  mergeWorkspaces,
  detectConflicts,
  type ConflictEntry,
  type ConflictResolutions,
} from "./utils/merge";
import ConflictModal from "./components/ConflictModal";
import Sidebar from "./components/Sidebar";
import StrategyList from "./components/StrategyList";
import DetailPanel from "./components/DetailPanel";
import OverviewPage from "./components/OverviewPage";
import DeptSettingsPage from "./components/DeptSettingsPage";
import ActivityPage from "./components/ActivityPage";
import csvRaw from "../營企本部OGSM - 部門看板表格.xlsx - 2026商發 H1.csv?raw";

type SyncStatus = "unlinked" | "pending" | "saving" | "saved" | "error";

/** Per-department file state for multi-file mode */
export interface DeptFileState {
  handle: FileSystemFileHandle;
  subDirHandle: FileSystemDirectoryHandle;
  subfolderName: string;
  workspace: WorkspaceData; // departments: [one dept]
  isReadOnly: boolean;
  isDirty: boolean;
  syncStatus: SyncStatus;
  version: number | null;
  lastModified: number | null;
  hasRemoteUpdate: boolean;
  conflictCopies: { handle: FileSystemFileHandle; name: string }[];
}

function recompute(data: OGSMData): OGSMData {
  const goals = data.goals.map((g) => {
    const strategies = g.strategies.map((s) => {
      const rate =
        s.manualRate ??
        avgRate(
          s.measures.flatMap((m) => m.kpis).map((k) => k.achievementRate ?? 0),
        );
      return { ...s, completionRate: rate };
    });
    return {
      ...g,
      strategies,
      completionRate: avgRate(strategies.map((s) => s.completionRate)),
    };
  });
  return {
    ...data,
    goals,
    overallRate: avgRate(goals.map((g) => g.completionRate)),
  };
}

// Module-level singleton: ensures all useState/useRef initializers read the
// exact same object, preventing ID or timestamp drift from multiple calls.
let _initialWorkspace: WorkspaceData | null = null;
function getInitialWorkspace(): WorkspaceData {
  if (_initialWorkspace) return _initialWorkspace;
  const ws = loadWorkspace();
  if (ws) return (_initialWorkspace = ws);
  const legacy = loadLegacyData();
  if (legacy)
    return (_initialWorkspace = wrapOGSMInWorkspace(legacy, "營企本部"));
  try {
    return (_initialWorkspace = wrapOGSMInWorkspace(
      parseOGSM(csvRaw),
      "營企本部",
    ));
  } catch {
    return (_initialWorkspace = wrapOGSMInWorkspace(
      {
        objectives: { orgO: "", deptO: "" },
        goals: [],
        period: `${new Date().getFullYear()} H1`,
        importedAt: new Date().toISOString(),
        overallRate: 0,
      },
      "部門一",
    ));
  }
}

export default function App() {
  const [workspace, setWorkspace] =
    useState<WorkspaceData>(getInitialWorkspace);
  const [activeDeptId, setActiveDeptId] = useState<string>(
    () => getInitialWorkspace().departments[0]?.id ?? "",
  );
  const [activePeriodId, setActivePeriodId] = useState<string>(
    () => getInitialWorkspace().departments[0]?.periods[0]?.id ?? "",
  );
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(
    null,
  );
  const [pendingDetailNav, setPendingDetailNav] = useState<{
    tab: "plans";
    warnFilter?: "overdue" | "warning";
    measureId?: string;
  } | null>(null);
  const [filterOwner, setFilterOwner] = useState("all");
  const [importing, setImporting] = useState(false);
  const [showDeptSettings, setShowDeptSettings] = useState(false);
  const [showActivityPage, setShowActivityPage] = useState(false);

  // ─── File sync (File System Access API + OneDrive 資料夾) ─────────────
  const fsSupported = isFileSystemAccessSupported();
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("unlinked");
  const [syncError, setSyncError] = useState("");
  const authInProgressRef = useRef(false);
  const pendingClickHandlerRef = useRef<EventListener | null>(null);

  // ─── Multi-file mode state ────────────────────────────────────────────
  const [deptFiles, setDeptFiles] = useState<DeptFileState[]>([]);
  const rootDirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  /** True when the app is in multi-file (per-dept) mode */
  const isMultiFileMode = deptFiles.length > 0;
  /** True when the user has write permission on the root folder (admin). */
  const [isAdmin, setIsAdmin] = useState(false);
  const loadedFileVersionRef = useRef<number | null>(null);
  const loadedFileLastModifiedRef = useRef<number | null>(null);
  const [mergeToast, setMergeToast] = useState("");
  // Remote-update banner (background polling)
  const [remoteUpdateBanner, setRemoteUpdateBanner] = useState(false);
  // Refs used inside polling interval (avoid stale closure)
  const syncStatusRef = useRef<SyncStatus>("unlinked");
  const conflictOpenRef = useRef(false);
  // Manual save / dirty tracking
  const [isDirty, setIsDirty] = useState(false);
  // Conflict resolution state
  const [conflictEntries, setConflictEntries] = useState<ConflictEntry[]>([]);
  const [conflictResolutions, setConflictResolutions] =
    useState<ConflictResolutions>({});
  const conflictDiskWsRef = useRef<WorkspaceData | null>(null);
  // Directory handle for conflict-copy scanning
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const [conflictCopies, setConflictCopies] = useState<
    { handle: FileSystemFileHandle; name: string }[]
  >([]);
  // Tracks which copy triggered the current ConflictModal (for post-merge delete)
  const conflictSourceCopyRef = useRef<{
    handle: FileSystemFileHandle;
    name: string;
  } | null>(null);

  // ─── Multi-file conflict / remote-update state ────────────────────────
  /** deptId of the dept whose save is paused waiting for conflict resolution */
  const [conflictDeptId, setConflictDeptId] = useState<string | null>(null);
  const [conflictDeptEntries, setConflictDeptEntries] = useState<
    ConflictEntry[]
  >([]);
  const [conflictDeptResolutions, setConflictDeptResolutions] =
    useState<ConflictResolutions>({});
  const conflictDeptDiskWsRef = useRef<WorkspaceData | null>(null);
  const [deptMergeToast, setDeptMergeToast] = useState("");
  const conflictDeptSourceCopyRef = useRef<{
    handle: FileSystemFileHandle;
    name: string;
  } | null>(null);
  /** Stable ref kept in sync with deptFiles — used by polling interval to avoid stale closure */
  const deptFilesRef = useRef<DeptFileState[]>([]);

  // ─── Multi-file mode: load root folder into deptFiles state ──────────
  const loadRootFolderIntoState = useCallback(
    async (rootHandle: FileSystemDirectoryHandle) => {
      rootDirHandleRef.current = rootHandle;
      const entries = await scanDeptJsons(rootHandle);
      if (entries.length === 0) {
        alert("根資料夾中沒有找到任何子資料夾/JSON 檔案。");
        return;
      }
      const newDeptFiles: DeptFileState[] = [];
      for (const { subfolderName, handle, subDirHandle } of entries) {
        let ws: WorkspaceData;
        let lastModified = 0;
        try {
          const [text, lm] = await Promise.all([
            readDataFile(handle),
            readDataFileMeta(handle),
          ]);
          ws = JSON.parse(text);
          lastModified = lm;
        } catch {
          // Skip files that can't be read
          continue;
        }
        if (
          !ws ||
          typeof ws !== "object" ||
          !Array.isArray((ws as { departments?: unknown }).departments)
        ) {
          continue;
        }
        const isReadOnly = !(await probeWritable(handle));
        newDeptFiles.push({
          handle,
          subDirHandle,
          subfolderName,
          workspace: ws,
          isReadOnly,
          isDirty: false,
          syncStatus: "saved",
          version: ws.version ?? null,
          lastModified,
          hasRemoteUpdate: false,
          conflictCopies: [],
        });
      }
      if (newDeptFiles.length === 0) {
        alert("根資料夾中沒有找到有效的部門 JSON 檔案。");
        return;
      }
      setDeptFiles(newDeptFiles);
      // Detect admin: root is writable if any dept file is writable
      const rootWritable = newDeptFiles.some((f) => !f.isReadOnly);
      setIsAdmin(rootWritable);
      // Set active dept to first writable dept, or first overall
      const firstWritable = newDeptFiles.find((f) => !f.isReadOnly);
      const firstDept = (firstWritable ?? newDeptFiles[0]).workspace
        .departments[0];
      if (firstDept) {
        setActiveDeptId(firstDept.id);
        setActivePeriodId(firstDept.periods[0]?.id ?? "");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Shared: attach handle + read file into workspace
  const applyHandle = useCallback(async (handle: FileSystemFileHandle) => {
    fileHandleRef.current = handle;
    try {
      const [text, lastModified] = await Promise.all([
        readDataFile(handle),
        readDataFileMeta(handle),
      ]);
      let remote: WorkspaceData;
      try {
        remote = JSON.parse(text);
      } catch {
        throw new Error("檔案不是有效的 JSON");
      }
      if (
        !remote ||
        typeof remote !== "object" ||
        !Array.isArray((remote as { departments?: unknown }).departments)
      ) {
        throw new Error("檔案格式不符：不是有效的工作區格式");
      }
      validateOrWarn(WorkspaceDataSchema, remote, "applyHandle");
      loadedFileVersionRef.current = remote.version ?? null;
      loadedFileLastModifiedRef.current = lastModified;
      setWorkspace(remote);
      saveWorkspace(remote);
      setIsDirty(false);
      setRemoteUpdateBanner(false);
      setSyncStatus("saved");
      setSyncError("");
    } catch (e) {
      setSyncStatus("error");
      setSyncError("讀取檔案失敗：" + String(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On mount: query-only check; if needs re-grant, listen for first user click
  useEffect(() => {
    if (!fsSupported) return;
    (async () => {
      const handle = await peekDataFile();
      if (handle) {
        await applyHandle(handle);
      } else {
        const savedExists = await hasSavedHandle();
        if (savedExists) {
          // Handle saved but needs user gesture to re-grant — auto-fire on first click
          setSyncStatus("pending");
          const handler: EventListener = () => {
            if (authInProgressRef.current) return;
            authInProgressRef.current = true;
            authorizeDataFile()
              .then(async (h) => {
                if (h) await applyHandle(h);
              })
              .finally(() => {
                authInProgressRef.current = false;
              });
          };
          pendingClickHandlerRef.current = handler;
          document.addEventListener("click", handler, { once: true });
        }
      }
      // Restore directory handle for conflict-copy scanning (permission may already be granted)
      const dirHandle = await peekDataFolder();
      if (dirHandle) dirHandleRef.current = dirHandle;

      // Multi-file mode: restore root handle if permission already granted
      const rootHandle = await loadRootHandle();
      if (rootHandle) {
        await loadRootFolderIntoState(rootHandle);
      }
    })();
    return () => {
      if (pendingClickHandlerRef.current) {
        document.removeEventListener("click", pendingClickHandlerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 同步 refs 供 polling interval 讀取（避免 stale closure）────────
  useEffect(() => {
    syncStatusRef.current = syncStatus;
  }, [syncStatus]);
  useEffect(() => {
    conflictOpenRef.current = conflictEntries.length > 0;
  }, [conflictEntries.length]);
  useEffect(() => {
    deptFilesRef.current = deptFiles;
  }, [deptFiles]);

  // ─── 背景輪詢：每 30 秒檢查檔案是否被他人更新 ─────────────────────
  const POLL_INTERVAL_MS = 30_000;
  useEffect(() => {
    if (!fsSupported) return;
    const poll = async () => {
      const handle = fileHandleRef.current;
      if (!handle) return;
      // 存檔中、待授權或衝突 modal 開著時跳過
      if (
        syncStatusRef.current === "saving" ||
        syncStatusRef.current === "pending" ||
        conflictOpenRef.current
      )
        return;
      if (loadedFileLastModifiedRef.current === null) return;
      try {
        const lastMod = await readDataFileMeta(handle);
        if (lastMod > loadedFileLastModifiedRef.current) {
          setRemoteUpdateBanner(true);
        }
      } catch {
        // best-effort：讀不到就靜默略過
      }
      // 順便扫描目錄中是否有 OneDrive 衝突副本
      const dir = dirHandleRef.current;
      if (dir) {
        try {
          const copies = await scanForConflictCopies(dir, handle.name);
          if (copies.length > 0) {
            setConflictCopies((prev) => {
              // 不重複已知的副本
              const prevNames = new Set(prev.map((c) => c.name));
              const newOnes = copies.filter((c) => !prevNames.has(c.name));
              return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
            });
          }
        } catch {
          // best-effort
        }
      }
    };
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fsSupported]);

  // ─── 多檔模式背景輪詢：每 30 秒偵測遠端更新與衝突副本 ──────────────
  useEffect(() => {
    if (!fsSupported || !isMultiFileMode) return;
    const poll = async () => {
      if (conflictDeptId) return; // 衝突 modal 開著時跳過
      for (const f of deptFilesRef.current) {
        if (f.isReadOnly || f.syncStatus === "saving") continue;
        const deptId = f.workspace.departments[0]?.id;
        if (!deptId) continue;
        // 偵測遠端更新
        try {
          const lm = await readDataFileMeta(f.handle);
          if (
            f.lastModified !== null &&
            lm > f.lastModified &&
            !f.hasRemoteUpdate
          ) {
            setDeptFiles((prev) =>
              prev.map((d) =>
                d.workspace.departments[0]?.id === deptId
                  ? { ...d, hasRemoteUpdate: true }
                  : d,
              ),
            );
          }
        } catch {
          // best-effort
        }
        // 偵測 OneDrive 衝突副本
        try {
          const copies = await scanForConflictCopies(
            f.subDirHandle,
            "data.json",
          );
          if (copies.length > 0) {
            setDeptFiles((prev) =>
              prev.map((d) => {
                if (d.workspace.departments[0]?.id !== deptId) return d;
                const prevNames = new Set(d.conflictCopies.map((c) => c.name));
                const newOnes = copies.filter((c) => !prevNames.has(c.name));
                return newOnes.length > 0
                  ? { ...d, conflictCopies: [...d.conflictCopies, ...newOnes] }
                  : d;
              }),
            );
          }
        } catch {
          // best-effort
        }
      }
    };
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fsSupported, isMultiFileMode, conflictDeptId]);

  const fileSaveNow = useCallback(async (ws: WorkspaceData) => {
    const handle = fileHandleRef.current;
    if (!handle) return;
    setSyncStatus("saving");
    try {
      // ── 第一次讀檔 ───────────────────────────────────────────────
      const firstMeta = await readDataFileMeta(handle);
      const diskText = await readDataFile(handle);
      const onDisk: WorkspaceData = JSON.parse(diskText);
      let toWrite = ws;

      // ── 等待 3 秒讓 OneDrive 同步（二次確認窗口）─────────────────
      // 給其他使用者也在存檔的情況留出同步時間，
      // 避免兩人幾乎同時按存檔卻互相看不到對方的寫入。
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // ── 第二次讀檔：確認 lastModified 是否在等待期間又變動 ────────
      const secondMeta = await readDataFileMeta(handle);
      if (secondMeta !== firstMeta) {
        // 等待期間檔案又被人更新，重新讀取最新內容再做衝突偵測
        const freshText = await readDataFile(handle);
        const freshDisk: WorkspaceData = JSON.parse(freshText);
        // 以最新的磁碟版本取代原本的 onDisk
        Object.assign(onDisk, freshDisk);
      }

      // 若 loadedFileVersionRef.current 為 null（舊格式無版本號），視為版本 -1，
      // 讓任何有版本的 onDisk 都能觸發衝突偵測（而非直接跳過）。
      const loadedVer = loadedFileVersionRef.current ?? -1;
      if (onDisk.version !== undefined && onDisk.version !== loadedVer) {
        // Version mismatch: check for user-visible conflicts first
        const conflicts = detectConflicts(ws, onDisk);
        if (conflicts.length > 0) {
          // Suspend the save and let user resolve conflicts
          conflictDiskWsRef.current = onDisk;
          setConflictEntries(conflicts);
          setConflictResolutions({});
          setSyncStatus("saved"); // reset badge while modal is open
          return;
        }
        // No conflicting edits: auto-merge additions/deletions silently
        const { workspace: merged, autoMerged } = mergeWorkspaces(ws, onDisk);
        toWrite = merged;
        setWorkspace(merged);
        saveWorkspace(merged);
        if (autoMerged > 0) {
          setMergeToast(`已自動合併 ${autoMerged} 項遠端新增/刪除`);
          setTimeout(() => setMergeToast(""), 4000);
        }
      }

      const payload: WorkspaceData = {
        ...toWrite,
        version: (loadedFileVersionRef.current ?? toWrite.version ?? 1) + 1,
        savedAt: new Date().toISOString(),
      };
      loadedFileVersionRef.current = payload.version;
      await writeDataFile(handle, JSON.stringify(payload, null, 2));
      // 更新 lastModified 基準，避免存檔後的輪詢誤報
      loadedFileLastModifiedRef.current = await readDataFileMeta(handle);
      setSyncStatus("saved");
      setSyncError("");
      setIsDirty(false);
      setRemoteUpdateBanner(false);
    } catch (e) {
      setSyncStatus("error");
      setSyncError("檔案寫入失敗：" + String(e));
    }
  }, []);

  // ─── Banner 處理函式 ──────────────────────────────────────────────
  const handleRemoteRefresh = useCallback(async () => {
    if (
      isDirty &&
      !window.confirm("你有未儲存的變更，重新整理後會遺失。確定嗎？")
    )
      return;
    const handle = fileHandleRef.current;
    if (handle) await applyHandle(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, applyHandle]);

  const handleRemoteSaveAndRefresh = useCallback(async () => {
    await fileSaveNow(workspace);
    // fileSaveNow 後直接重新讀檔，確保拿到最新合併結果
    const handle = fileHandleRef.current;
    if (handle) await applyHandle(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace, fileSaveNow, applyHandle]);

  const handleUnlinkFile = useCallback(async () => {
    fileHandleRef.current = null;
    await clearDataFile();
    setSyncStatus("unlinked");
    setSyncError("");
    if (pendingClickHandlerRef.current) {
      document.removeEventListener("click", pendingClickHandlerRef.current);
      pendingClickHandlerRef.current = null;
    }
  }, []);

  const handleLinkFolder = useCallback(async () => {
    const dir = await pickDataFolder();
    if (!dir) return;
    dirHandleRef.current = dir;
    // 立刻扫描一次
    const handle = fileHandleRef.current;
    if (handle) {
      try {
        const copies = await scanForConflictCopies(dir, handle.name);
        setConflictCopies(copies);
      } catch {
        // best-effort
      }
    }
  }, []);

  const handleUnlinkFolder = useCallback(async () => {
    dirHandleRef.current = null;
    setConflictCopies([]);
    await clearDataFolder();
  }, []);

  // ─── Multi-file mode handlers ─────────────────────────────────────────
  const handleLinkRootFolder = useCallback(async () => {
    const rootHandle = await pickRootFolder();
    if (!rootHandle) return;
    await saveRootHandle(rootHandle);
    await loadRootFolderIntoState(rootHandle);
  }, [loadRootFolderIntoState]);

  const handleUnlinkRootFolder = useCallback(async () => {
    setDeptFiles([]);
    setIsAdmin(false);
    rootDirHandleRef.current = null;
    await clearRootHandle();
  }, []);

  /**
   * Update a single dept's workspace in multi-file mode.
   * deptId is the id of department inside the dept's WorkspaceData.
   */
  const updateDeptWorkspace = useCallback(
    (deptId: string, next: WorkspaceData) => {
      setDeptFiles((prev) =>
        prev.map((f) => {
          const dept = f.workspace.departments[0];
          if (!dept || dept.id !== deptId) return f;
          return { ...f, workspace: next, isDirty: true, syncStatus: "saved" };
        }),
      );
    },
    [],
  );

  /** Save a single dept file in multi-file mode (with OneDrive-safe conflict detection). */
  const saveDeptFile = useCallback(
    async (deptId: string) => {
      const entry = deptFilesRef.current.find(
        (f) => f.workspace.departments[0]?.id === deptId,
      );
      if (!entry || entry.isReadOnly || !entry.isDirty) return;

      // Mark saving
      setDeptFiles((prev) =>
        prev.map((f) =>
          f.workspace.departments[0]?.id === deptId
            ? { ...f, syncStatus: "saving" as SyncStatus }
            : f,
        ),
      );

      try {
        // ── 第一次讀磁碟 ─────────────────────────────────────────────
        const firstMeta = await readDataFileMeta(entry.handle);
        const diskText = await readDataFile(entry.handle);
        let onDisk: WorkspaceData = JSON.parse(diskText);

        // ── 等待 3 秒讓 OneDrive 同步（二次確認窗口）─────────────────
        await new Promise<void>((resolve) => setTimeout(resolve, 3000));

        // ── 重新取最新本地狀態（避免等待期間的編輯遺失）──────────────
        const freshEntry = deptFilesRef.current.find(
          (f) => f.workspace.departments[0]?.id === deptId,
        );
        if (!freshEntry) return;

        // ── 第二次讀 meta：若期間有人更新，重新讀磁碟 ─────────────────
        const secondMeta = await readDataFileMeta(freshEntry.handle);
        if (secondMeta !== firstMeta) {
          const freshText = await readDataFile(freshEntry.handle);
          onDisk = JSON.parse(freshText);
        }

        // ── 版本比較 + 衝突偵測 ──────────────────────────────────────
        const loadedVer = freshEntry.version ?? -1;
        let toWrite = freshEntry.workspace;

        if (onDisk.version !== undefined && onDisk.version !== loadedVer) {
          const conflicts = detectConflicts(freshEntry.workspace, onDisk);
          if (conflicts.length > 0) {
            // 暫停存檔，開衝突 modal
            conflictDeptDiskWsRef.current = onDisk;
            setConflictDeptId(deptId);
            setConflictDeptEntries(conflicts);
            setConflictDeptResolutions({});
            setDeptFiles((prev) =>
              prev.map((f) =>
                f.workspace.departments[0]?.id === deptId
                  ? { ...f, syncStatus: "saved" as SyncStatus }
                  : f,
              ),
            );
            return;
          }
          // 無衝突：自動合併並繼續
          const { workspace: merged, autoMerged } = mergeWorkspaces(
            freshEntry.workspace,
            onDisk,
          );
          toWrite = merged;
          if (autoMerged > 0) {
            setDeptMergeToast(
              `[${freshEntry.subfolderName}] 已自動合併 ${autoMerged} 項遠端新增/刪除`,
            );
            setTimeout(() => setDeptMergeToast(""), 4000);
          }
        }

        // ── 寫入 ────────────────────────────────────────────────────
        const payload: WorkspaceData = {
          ...toWrite,
          version: (freshEntry.version ?? 1) + 1,
          savedAt: new Date().toISOString(),
        };
        await writeDataFile(
          freshEntry.handle,
          JSON.stringify(payload, null, 2),
        );
        const lm = await readDataFileMeta(freshEntry.handle);

        setDeptFiles((prev) =>
          prev.map((f) =>
            f.workspace.departments[0]?.id === deptId
              ? {
                  ...f,
                  workspace: payload,
                  isDirty: false,
                  syncStatus: "saved" as SyncStatus,
                  version: payload.version ?? null,
                  lastModified: lm,
                  hasRemoteUpdate: false,
                }
              : f,
          ),
        );
      } catch {
        setDeptFiles((prev) =>
          prev.map((f) =>
            f.workspace.departments[0]?.id === deptId
              ? { ...f, syncStatus: "error" as SyncStatus }
              : f,
          ),
        );
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleMergeCopy = useCallback(
    async (copy: { handle: FileSystemFileHandle; name: string }) => {
      try {
        const text = await readDataFile(copy.handle);
        const remote: WorkspaceData = JSON.parse(text);
        const conflicts = detectConflicts(workspace, remote);
        conflictDiskWsRef.current = remote;
        conflictSourceCopyRef.current = copy;
        if (conflicts.length > 0) {
          setConflictEntries(conflicts);
          setConflictResolutions({});
        } else {
          // 無衝突：直接自動合併
          const { workspace: merged, autoMerged } = mergeWorkspaces(
            workspace,
            remote,
          );
          const payload: WorkspaceData = {
            ...merged,
            version: (merged.version ?? 1) + 1,
            savedAt: new Date().toISOString(),
          };
          if (fileHandleRef.current) {
            await writeDataFile(
              fileHandleRef.current,
              JSON.stringify(payload, null, 2),
            );
            loadedFileVersionRef.current = payload.version;
            loadedFileLastModifiedRef.current = await readDataFileMeta(
              fileHandleRef.current,
            );
          }
          setWorkspace(payload);
          saveWorkspace(payload);
          setIsDirty(false);
          if (autoMerged > 0) {
            setMergeToast(`已從副本自動合併 ${autoMerged} 項變更`);
            setTimeout(() => setMergeToast(""), 4000);
          }
          // 詢問是否刪除副本
          if (
            dirHandleRef.current &&
            window.confirm(`已成功合併「${copy.name}」，是否刪除此副本檔案？`)
          ) {
            await dirHandleRef.current.removeEntry(copy.name);
          }
          setConflictCopies((prev) => prev.filter((c) => c.name !== copy.name));
          conflictSourceCopyRef.current = null;
        }
      } catch (e) {
        setSyncError("讀取副本失敗：" + String(e));
        setSyncStatus("error");
      }
    },
    [workspace],
  );

  const handleDismissCopy = useCallback((name: string) => {
    setConflictCopies((prev) => prev.filter((c) => c.name !== name));
  }, []);

  // Badge click when status is "pending": manual retry with user gesture
  const handleReauthorize = useCallback(async () => {
    if (authInProgressRef.current) return;
    authInProgressRef.current = true;
    // Remove the auto-listener to avoid double-firing
    if (pendingClickHandlerRef.current) {
      document.removeEventListener("click", pendingClickHandlerRef.current);
      pendingClickHandlerRef.current = null;
    }
    try {
      const handle = await authorizeDataFile();
      if (handle) await applyHandle(handle);
    } finally {
      authInProgressRef.current = false;
    }
  }, [applyHandle]);

  // Conflict resolution handlers
  const handleConflictChange = useCallback(
    (id: string, choice: "local" | "remote") => {
      setConflictResolutions((prev) => ({ ...prev, [id]: choice }));
    },
    [],
  );

  const handleConflictConfirm = useCallback(async () => {
    const onDisk = conflictDiskWsRef.current;
    if (!onDisk || !fileHandleRef.current) return;
    const { workspace: merged } = mergeWorkspaces(
      workspace,
      onDisk,
      conflictResolutions,
    );
    setSyncStatus("saving");
    try {
      const payload: WorkspaceData = {
        ...merged,
        version: (merged.version ?? 1) + 1,
        savedAt: new Date().toISOString(),
      };
      await writeDataFile(
        fileHandleRef.current,
        JSON.stringify(payload, null, 2),
      );
      loadedFileVersionRef.current = payload.version;
      loadedFileLastModifiedRef.current = await readDataFileMeta(
        fileHandleRef.current,
      );
      setWorkspace(payload);
      saveWorkspace(payload);
      setSyncStatus("saved");
      setSyncError("");
      setIsDirty(false);
      // 若此次衝突來自副本 merge，詢問是否刪除
      const src = conflictSourceCopyRef.current;
      if (src && dirHandleRef.current) {
        if (window.confirm(`衝突已解決，是否刪除副本檔案「${src.name}」？`)) {
          await dirHandleRef.current.removeEntry(src.name);
        }
        setConflictCopies((prev) => prev.filter((c) => c.name !== src.name));
      }
    } catch (e) {
      setSyncStatus("error");
      setSyncError("檔案寫入失敗：" + String(e));
    } finally {
      setConflictEntries([]);
      conflictDiskWsRef.current = null;
      conflictSourceCopyRef.current = null;
    }
  }, [workspace, conflictResolutions]);

  const handleConflictCancel = useCallback(() => {
    setConflictEntries([]);
    setConflictResolutions({});
    conflictDiskWsRef.current = null;
  }, []);

  // ─── Multi-file conflict resolution handlers ──────────────────────────

  const handleDeptConflictChange = useCallback(
    (id: string, choice: "local" | "remote") => {
      setConflictDeptResolutions((prev) => ({ ...prev, [id]: choice }));
    },
    [],
  );

  const handleDeptConflictCancel = useCallback(() => {
    setConflictDeptEntries([]);
    setConflictDeptResolutions({});
    setConflictDeptId(null);
    conflictDeptDiskWsRef.current = null;
    conflictDeptSourceCopyRef.current = null;
  }, []);

  const handleDeptConflictConfirm = useCallback(async () => {
    const deptId = conflictDeptId;
    const onDisk = conflictDeptDiskWsRef.current;
    if (!deptId || !onDisk) return;
    const entry = deptFilesRef.current.find(
      (f) => f.workspace.departments[0]?.id === deptId,
    );
    if (!entry) return;

    setDeptFiles((prev) =>
      prev.map((f) =>
        f.workspace.departments[0]?.id === deptId
          ? { ...f, syncStatus: "saving" as SyncStatus }
          : f,
      ),
    );
    try {
      const { workspace: merged } = mergeWorkspaces(
        entry.workspace,
        onDisk,
        conflictDeptResolutions,
      );
      const payload: WorkspaceData = {
        ...merged,
        version: (entry.version ?? 1) + 1,
        savedAt: new Date().toISOString(),
      };
      await writeDataFile(entry.handle, JSON.stringify(payload, null, 2));
      const lm = await readDataFileMeta(entry.handle);
      setDeptFiles((prev) =>
        prev.map((f) =>
          f.workspace.departments[0]?.id === deptId
            ? {
                ...f,
                workspace: payload,
                isDirty: false,
                syncStatus: "saved" as SyncStatus,
                version: payload.version ?? null,
                lastModified: lm,
                hasRemoteUpdate: false,
              }
            : f,
        ),
      );
      // 若衝突來自副本 merge，詢問是否刪除副本
      const src = conflictDeptSourceCopyRef.current;
      if (src) {
        if (window.confirm(`衝突已解決，是否刪除副本檔案「${src.name}」？`)) {
          await entry.subDirHandle.removeEntry(src.name);
        }
        setDeptFiles((prev) =>
          prev.map((f) =>
            f.workspace.departments[0]?.id === deptId
              ? {
                  ...f,
                  conflictCopies: f.conflictCopies.filter(
                    (c) => c.name !== src.name,
                  ),
                }
              : f,
          ),
        );
      }
    } catch (e) {
      setDeptFiles((prev) =>
        prev.map((f) =>
          f.workspace.departments[0]?.id === deptId
            ? { ...f, syncStatus: "error" as SyncStatus }
            : f,
        ),
      );
      alert("衝突解決後寫入失敗：" + String(e));
    } finally {
      setConflictDeptEntries([]);
      setConflictDeptResolutions({});
      setConflictDeptId(null);
      conflictDeptDiskWsRef.current = null;
      conflictDeptSourceCopyRef.current = null;
    }
  }, [conflictDeptId, conflictDeptResolutions]);

  /** Re-read dept file from disk, discarding any in-memory changes. */
  const handleDeptRemoteRefresh = useCallback(
    async (deptId: string, confirmIfDirty = true) => {
      const entry = deptFilesRef.current.find(
        (f) => f.workspace.departments[0]?.id === deptId,
      );
      if (!entry) return;
      if (
        confirmIfDirty &&
        entry.isDirty &&
        !window.confirm(
          `「${entry.subfolderName}」有未儲存的變更，重新整理後會遺失。確定嗎？`,
        )
      )
        return;
      try {
        const [text, lm] = await Promise.all([
          readDataFile(entry.handle),
          readDataFileMeta(entry.handle),
        ]);
        const remote: WorkspaceData = JSON.parse(text);
        setDeptFiles((prev) =>
          prev.map((f) =>
            f.workspace.departments[0]?.id === deptId
              ? {
                  ...f,
                  workspace: remote,
                  isDirty: false,
                  version: remote.version ?? null,
                  lastModified: lm,
                  hasRemoteUpdate: false,
                }
              : f,
          ),
        );
      } catch (e) {
        alert(`重新整理「${entry.subfolderName}」失敗：${e}`);
      }
    },
    [],
  );

  /** Merge an OneDrive conflict copy into a dept's workspace. */
  const handleDeptMergeCopy = useCallback(
    async (
      deptId: string,
      copy: { handle: FileSystemFileHandle; name: string },
    ) => {
      const entry = deptFilesRef.current.find(
        (f) => f.workspace.departments[0]?.id === deptId,
      );
      if (!entry) return;
      try {
        const text = await readDataFile(copy.handle);
        const remote: WorkspaceData = JSON.parse(text);
        const conflicts = detectConflicts(entry.workspace, remote);
        conflictDeptDiskWsRef.current = remote;
        conflictDeptSourceCopyRef.current = copy;
        if (conflicts.length > 0) {
          setConflictDeptId(deptId);
          setConflictDeptEntries(conflicts);
          setConflictDeptResolutions({});
        } else {
          const { workspace: merged, autoMerged } = mergeWorkspaces(
            entry.workspace,
            remote,
          );
          const payload: WorkspaceData = {
            ...merged,
            version: (entry.version ?? 1) + 1,
            savedAt: new Date().toISOString(),
          };
          await writeDataFile(entry.handle, JSON.stringify(payload, null, 2));
          const lm = await readDataFileMeta(entry.handle);
          setDeptFiles((prev) =>
            prev.map((f) =>
              f.workspace.departments[0]?.id === deptId
                ? {
                    ...f,
                    workspace: payload,
                    isDirty: false,
                    syncStatus: "saved" as SyncStatus,
                    version: payload.version ?? null,
                    lastModified: lm,
                    hasRemoteUpdate: false,
                    conflictCopies: f.conflictCopies.filter(
                      (c) => c.name !== copy.name,
                    ),
                  }
                : f,
            ),
          );
          if (autoMerged > 0) {
            setDeptMergeToast(
              `[${entry.subfolderName}] 已從副本自動合併 ${autoMerged} 項變更`,
            );
            setTimeout(() => setDeptMergeToast(""), 4000);
          }
          if (
            window.confirm(`已成功合併「${copy.name}」，是否刪除此副本檔案？`)
          ) {
            await entry.subDirHandle.removeEntry(copy.name);
          }
          conflictDeptDiskWsRef.current = null;
          conflictDeptSourceCopyRef.current = null;
        }
      } catch (e) {
        alert(`合併副本失敗：${e}`);
      }
    },
    [],
  );

  const handleDeptDismissCopy = useCallback(
    (deptId: string, copyName: string) => {
      setDeptFiles((prev) =>
        prev.map((f) =>
          f.workspace.departments[0]?.id === deptId
            ? {
                ...f,
                conflictCopies: f.conflictCopies.filter(
                  (c) => c.name !== copyName,
                ),
              }
            : f,
        ),
      );
    },
    [],
  );
  // ─────────────────────────────────────────────────────────────────────

  const teams: Team[] = isMultiFileMode
    ? deptFiles.flatMap((f) => f.workspace.teams ?? [])
    : (workspace.teams ?? []);
  const allMembers = teams.flatMap((t) => t.members);

  // Stable reference: only changes when workspace.teams or activeDeptId changes
  const deptScopedTeams = useMemo(
    () => teams.filter((t) => !t.deptId || t.deptId === activeDeptId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isMultiFileMode ? deptFiles : workspace.teams, activeDeptId],
  );

  // ─── Undo / Redo history ──────────────────────────────────────────────
  const MAX_HISTORY = 50;
  const historyRef = useRef<string[]>([JSON.stringify(getInitialWorkspace())]);
  const historyIndexRef = useRef(0);
  const isUndoRedoRef = useRef(false);

  const pushHistory = useCallback((ws: WorkspaceData) => {
    const json = JSON.stringify(ws);
    const idx = historyIndexRef.current;
    // truncate any redo states beyond current position
    const stack = historyRef.current.slice(0, idx + 1);
    stack.push(json);
    if (stack.length > MAX_HISTORY) stack.shift();
    historyRef.current = stack;
    historyIndexRef.current = stack.length - 1;
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    const ws: WorkspaceData = JSON.parse(
      historyRef.current[historyIndexRef.current],
    );
    isUndoRedoRef.current = true;
    setWorkspace(ws);
    saveWorkspace(ws);
    setIsDirty(true);
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    const ws: WorkspaceData = JSON.parse(
      historyRef.current[historyIndexRef.current],
    );
    isUndoRedoRef.current = true;
    setWorkspace(ws);
    saveWorkspace(ws);
    setIsDirty(true);
  }, []);

  // Keyboard shortcut: Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // skip when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === "y" ||
          (e.shiftKey && e.key.toLowerCase() === "z"))
      ) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);
  // ─────────────────────────────────────────────────────────────────────

  // Derive active dept/period with fallback
  // In multi-file mode, the effective workspace is the union of all dept workspaces.
  const effectiveWorkspace: WorkspaceData = isMultiFileMode
    ? {
        ...deptFiles[0]!.workspace,
        departments: deptFiles
          .map((f) => f.workspace.departments[0]!)
          .filter(Boolean),
        teams: deptFiles.flatMap((f) => f.workspace.teams ?? []),
      }
    : workspace;

  const activeDept =
    effectiveWorkspace.departments.find((d) => d.id === activeDeptId) ??
    effectiveWorkspace.departments[0];
  const activePeriod =
    activeDept?.periods.find((p) => p.id === activePeriodId) ??
    activeDept?.periods[0];
  const data: OGSMData = activePeriod?.ogsm ?? {
    objectives: { orgO: "", deptO: "" },
    goals: [],
    period: `${new Date().getFullYear()} H1`,
    importedAt: new Date().toISOString(),
    overallRate: 0,
  };

  const updateWorkspace = useCallback(
    (next: WorkspaceData) => {
      if (isUndoRedoRef.current) {
        isUndoRedoRef.current = false;
      } else {
        pushHistory(next);
      }
      setWorkspace(next);
      saveWorkspace(next);
      setIsDirty(true);
    },
    [pushHistory],
  );

  const handleUpdateTeams = useCallback(
    (nextTeams: Team[]) => {
      const now = new Date().toISOString();
      const prevById = new Map((workspace.teams ?? []).map((t) => [t.id, t]));
      const stamped = nextTeams.map((t) => {
        const prev = prevById.get(t.id);
        // Stamp updatedAt only if content actually changed
        if (!prev || JSON.stringify(prev) !== JSON.stringify(t)) {
          return { ...t, updatedAt: now };
        }
        return t;
      });
      updateWorkspace({ ...workspace, teams: stamped });
    },
    [workspace, updateWorkspace],
  );

  // Dept-scoped version: merges updated teams back with other-dept teams
  const handleUpdateTeamsForDept = useCallback(
    (nextTeams: Team[]) => {
      if (isMultiFileMode) {
        // In multi-file mode, update only the active dept's workspace teams
        const activeDeptFile = deptFiles.find(
          (f) => f.workspace.departments[0]?.id === activeDeptId,
        );
        if (!activeDeptFile || activeDeptFile.isReadOnly) return;
        updateDeptWorkspace(activeDeptId, {
          ...activeDeptFile.workspace,
          teams: nextTeams,
        });
      } else {
        const otherDeptTeams = (workspace.teams ?? []).filter(
          (t) => t.deptId && t.deptId !== activeDeptId,
        );
        handleUpdateTeams([...otherDeptTeams, ...nextTeams]);
      }
    },
    [
      isMultiFileMode,
      deptFiles,
      activeDeptId,
      workspace.teams,
      handleUpdateTeams,
      updateDeptWorkspace,
    ],
  );

  /** Whether the currently active department is read-only (multi-file mode only). */
  const isActiveDeptReadOnly = isMultiFileMode
    ? (deptFiles.find((f) => f.workspace.departments[0]?.id === activeDeptId)
        ?.isReadOnly ?? false)
    : false;

  const handleUpdateWarnDaysBefore = useCallback(
    (n: number) => {
      if (isMultiFileMode) {
        const activeDeptFile = deptFiles.find(
          (f) => f.workspace.departments[0]?.id === activeDeptId,
        );
        if (!activeDeptFile || activeDeptFile.isReadOnly) return;
        updateDeptWorkspace(activeDeptId, {
          ...activeDeptFile.workspace,
          warnDaysBefore: n,
        });
      } else {
        updateWorkspace({ ...workspace, warnDaysBefore: n });
      }
    },
    [
      isMultiFileMode,
      deptFiles,
      activeDeptId,
      workspace,
      updateWorkspace,
      updateDeptWorkspace,
    ],
  );

  const updateData = useCallback(
    (nextData: OGSMData) => {
      const computed = recompute(nextData);
      const deptId = activeDept?.id;
      const periodId = activePeriod?.id;
      if (isMultiFileMode && deptId) {
        const activeDeptFile = deptFiles.find(
          (f) => f.workspace.departments[0]?.id === deptId,
        );
        if (!activeDeptFile || activeDeptFile.isReadOnly) return;
        const next: WorkspaceData = {
          ...activeDeptFile.workspace,
          departments: activeDeptFile.workspace.departments.map((d) =>
            d.id !== deptId
              ? d
              : {
                  ...d,
                  periods: d.periods.map((p) =>
                    p.id !== periodId ? p : { ...p, ogsm: computed },
                  ),
                },
          ),
        };
        updateDeptWorkspace(deptId, next);
      } else {
        const next: WorkspaceData = {
          ...workspace,
          departments: workspace.departments.map((d) =>
            d.id !== deptId
              ? d
              : {
                  ...d,
                  periods: d.periods.map((p) =>
                    p.id !== periodId ? p : { ...p, ogsm: computed },
                  ),
                },
          ),
        };
        updateWorkspace(next);
      }
    },
    [
      workspace,
      activeDept,
      activePeriod,
      isMultiFileMode,
      deptFiles,
      updateWorkspace,
      updateDeptWorkspace,
    ],
  );

  // --- Department handlers ---

  const handleAddDept = useCallback(async () => {
    if (isMultiFileMode) {
      if (!isAdmin) {
        alert("您沒有管理員權限，無法新增部門。");
        return;
      }
      const deptName = prompt("請輸入新部門名稱")?.trim();
      if (!deptName) return;
      if (!rootDirHandleRef.current) return;
      try {
        const subDir = await rootDirHandleRef.current.getDirectoryHandle(
          deptName,
          { create: true },
        );
        const year = new Date().getFullYear();
        const halfYear: "H1" | "H2" = new Date().getMonth() >= 6 ? "H2" : "H1";
        const emptyOgsm: OGSMData = {
          objectives: { orgO: "", deptO: "" },
          goals: [],
          period: `${year} ${halfYear}`,
          importedAt: new Date().toISOString(),
          overallRate: 0,
        };
        const period: PeriodData = {
          id: genId("period"),
          halfYear,
          year,
          ogsm: emptyOgsm,
        };
        const dept: Department = {
          id: genId("dept"),
          name: deptName,
          periods: [period],
        };
        const emptyWs: WorkspaceData = {
          departments: [dept],
          teams: [],
          version: 1,
          savedAt: new Date().toISOString(),
        };
        const fileHandle = await subDir.getFileHandle("data.json", {
          create: true,
        });
        await writeDataFile(fileHandle, JSON.stringify(emptyWs, null, 2));
        await loadRootFolderIntoState(rootDirHandleRef.current);
      } catch (e) {
        alert(`新增部門失敗：${e}`);
      }
      return;
    }
    const year = new Date().getFullYear();
    const halfYear: "H1" | "H2" = new Date().getMonth() >= 6 ? "H2" : "H1";
    const emptyOgsm: OGSMData = {
      objectives: { orgO: "", deptO: "" },
      goals: [],
      period: `${year} ${halfYear}`,
      importedAt: new Date().toISOString(),
      overallRate: 0,
    };
    const period: PeriodData = {
      id: genId("period"),
      halfYear,
      year,
      ogsm: emptyOgsm,
    };
    const dept: Department = {
      id: genId("dept"),
      name: "新部門",
      periods: [period],
    };
    const next = {
      ...workspace,
      departments: [...workspace.departments, dept],
    };
    updateWorkspace(next);
    setActiveDeptId(dept.id);
    setActivePeriodId(period.id);
    setSelectedGoalId(null);
    setSelectedStrategyId(null);
  }, [
    workspace,
    updateWorkspace,
    isMultiFileMode,
    isAdmin,
    loadRootFolderIntoState,
  ]);

  const handleRenameDept = useCallback(
    (deptId: string, name: string) => {
      if (!name.trim()) return;
      if (isMultiFileMode) {
        const entry = deptFiles.find(
          (f) => f.workspace.departments[0]?.id === deptId,
        );
        if (!entry || entry.isReadOnly) return;
        updateDeptWorkspace(deptId, {
          ...entry.workspace,
          departments: entry.workspace.departments.map((d) =>
            d.id === deptId ? { ...d, name: name.trim() } : d,
          ),
        });
      } else {
        updateWorkspace({
          ...workspace,
          departments: workspace.departments.map((d) =>
            d.id === deptId ? { ...d, name: name.trim() } : d,
          ),
        });
      }
    },
    [
      isMultiFileMode,
      deptFiles,
      workspace,
      updateWorkspace,
      updateDeptWorkspace,
    ],
  );

  const handleDeleteDept = useCallback(
    (deptId: string) => {
      if (isMultiFileMode) {
        alert(
          "多部門分檔模式下，請直接刪除對應的 JSON 檔案，然後重新載入根資料夾。",
        );
        return;
      }
      if (workspace.departments.length <= 1) {
        alert("至少需要保留一個部門");
        return;
      }
      if (!window.confirm("確定要刪除此部門及所有資料嗎？此操作無法復原。"))
        return;
      const next = {
        ...workspace,
        departments: workspace.departments.filter((d) => d.id !== deptId),
      };
      updateWorkspace(next);
      const remaining = next.departments[0];
      setActiveDeptId(remaining.id);
      setActivePeriodId(remaining.periods[0]?.id ?? "");
      setSelectedGoalId(null);
      setSelectedStrategyId(null);
    },
    [isMultiFileMode, workspace, updateWorkspace],
  );

  const handleSwitchDept = useCallback(
    (deptId: string) => {
      const dept = effectiveWorkspace.departments.find((d) => d.id === deptId);
      if (!dept) return;
      setActiveDeptId(deptId);
      setActivePeriodId(dept.periods[0]?.id ?? "");
      setSelectedGoalId(null);
      setSelectedStrategyId(null);
      setFilterOwner("all");
    },
    [effectiveWorkspace],
  );

  // --- Period handlers ---

  const handleAddPeriod = useCallback(
    (deptId: string, halfYear: "H1" | "H2", year: number) => {
      const sourceWs = isMultiFileMode
        ? (deptFiles.find((f) => f.workspace.departments[0]?.id === deptId)
            ?.workspace ?? workspace)
        : workspace;
      const dept = sourceWs.departments.find((d) => d.id === deptId);
      if (!dept) return;
      if (
        dept.periods.some((p) => p.halfYear === halfYear && p.year === year)
      ) {
        alert(`${year} ${halfYear} 已存在`);
        return;
      }
      const baseOgsm = dept.periods[0]?.ogsm;
      const emptyOgsm: OGSMData = {
        objectives: baseOgsm
          ? { ...baseOgsm.objectives }
          : { orgO: "", deptO: "" },
        goals: [],
        period: `${year} ${halfYear}`,
        importedAt: new Date().toISOString(),
        overallRate: 0,
      };
      const period: PeriodData = {
        id: genId("period"),
        halfYear,
        year,
        ogsm: emptyOgsm,
      };
      const next = {
        ...sourceWs,
        departments: sourceWs.departments.map((d) =>
          d.id !== deptId
            ? d
            : {
                ...d,
                periods: [...d.periods, period].sort((a, b) =>
                  a.year !== b.year
                    ? a.year - b.year
                    : a.halfYear.localeCompare(b.halfYear),
                ),
              },
        ),
      };
      if (isMultiFileMode) {
        updateDeptWorkspace(deptId, next);
      } else {
        updateWorkspace(next);
      }
      setActivePeriodId(period.id);
      setSelectedGoalId(null);
      setSelectedStrategyId(null);
    },
    [
      isMultiFileMode,
      deptFiles,
      workspace,
      updateWorkspace,
      updateDeptWorkspace,
    ],
  );

  const handleDeletePeriod = useCallback(
    (deptId: string, periodId: string) => {
      const sourceWs = isMultiFileMode
        ? (deptFiles.find((f) => f.workspace.departments[0]?.id === deptId)
            ?.workspace ?? workspace)
        : workspace;
      const dept = sourceWs.departments.find((d) => d.id === deptId);
      if (!dept || dept.periods.length <= 1) {
        alert("至少需要保留一個期間");
        return;
      }
      if (!window.confirm("確定要刪除此期間的所有 OGSM 資料嗎？")) return;
      const next = {
        ...sourceWs,
        departments: sourceWs.departments.map((d) =>
          d.id !== deptId
            ? d
            : {
                ...d,
                periods: d.periods.filter((p) => p.id !== periodId),
              },
        ),
      };
      if (isMultiFileMode) {
        updateDeptWorkspace(deptId, next);
      } else {
        updateWorkspace(next);
      }
      const remaining = next.departments.find((d) => d.id === deptId)
        ?.periods[0];
      if (!remaining) return;
      setActivePeriodId(remaining.id);
      setSelectedGoalId(null);
      setSelectedStrategyId(null);
    },
    [workspace, updateWorkspace],
  );

  const handleCopyPeriod = useCallback(
    (
      deptId: string,
      sourcePeriodId: string,
      halfYear: "H1" | "H2",
      year: number,
    ) => {
      const sourceWs = isMultiFileMode
        ? (deptFiles.find((f) => f.workspace.departments[0]?.id === deptId)
            ?.workspace ?? workspace)
        : workspace;
      const dept = sourceWs.departments.find((d) => d.id === deptId);
      if (!dept) return;
      if (
        dept.periods.some((p) => p.halfYear === halfYear && p.year === year)
      ) {
        alert(`${year} ${halfYear} 已存在`);
        return;
      }
      const src = dept.periods.find((p) => p.id === sourcePeriodId);
      if (!src) return;

      // 深拷貝 OGSM，重發所有 ID（避免 merge 衝突），重設實際御完成狀態
      const now = new Date().toISOString();
      const copiedOgsm: OGSMData = {
        ...src.ogsm,
        period: `${year} ${halfYear}`,
        importedAt: now,
        overallRate: 0,
        goals: src.ogsm.goals.map((g) => ({
          ...g,
          id: genId("goal"),
          completionRate: 0,
          updatedAt: now,
          strategies: g.strategies.map((s) => ({
            ...s,
            id: genId("str"),
            completionRate: 0,
            manualRate: null,
            updatedAt: now,
            measures: s.measures.map((m) => ({
              ...m,
              id: genId("msr"),
              kpis: m.kpis.map((k) => ({
                ...k,
                id: genId("kpi"),
                actual: null,
                currentValue: null,
                achievementRate: null,
              })),
            })),
            actionPlans: s.actionPlans.map((ap) => ({
              ...ap,
              id: genId("ap"),
              items: ap.items.map((item) => ({
                ...item,
                id: genId("item"),
                completed: false,
                actualEndDate: undefined,
              })),
            })),
          })),
        })),
      };

      const period: PeriodData = {
        id: genId("period"),
        halfYear,
        year,
        ogsm: copiedOgsm,
      };
      const next = {
        ...sourceWs,
        departments: sourceWs.departments.map((d) =>
          d.id !== deptId
            ? d
            : {
                ...d,
                periods: [...d.periods, period].sort((a, b) =>
                  a.year !== b.year
                    ? a.year - b.year
                    : a.halfYear.localeCompare(b.halfYear),
                ),
              },
        ),
      };
      if (isMultiFileMode) {
        updateDeptWorkspace(deptId, next);
      } else {
        updateWorkspace(next);
      }
      setActivePeriodId(period.id);
      setSelectedGoalId(null);
      setSelectedStrategyId(null);
    },
    [
      isMultiFileMode,
      deptFiles,
      workspace,
      updateWorkspace,
      updateDeptWorkspace,
    ],
  );

  const handleSwitchPeriod = useCallback((periodId: string) => {
    setActivePeriodId(periodId);
    setSelectedGoalId(null);
    setSelectedStrategyId(null);
    setFilterOwner("all");
  }, []);

  // --- OGSM Data handlers ---

  const selectedGoal = data.goals.find((g) => g.id === selectedGoalId) ?? null;
  const selectedStrategy =
    selectedGoal?.strategies.find((s) => s.id === selectedStrategyId) ?? null;

  const filteredStrategies = useMemo(() => {
    if (!selectedGoal) return [];
    return selectedGoal.strategies.filter((s) => {
      if (filterOwner !== "all") {
        const ownerList = s.owners;
        if (!ownerList.includes(filterOwner)) return false;
      }
      return true;
    });
  }, [selectedGoal, filterOwner]);

  const linkedDeptActivities = useMemo((): DeptActivity[] => {
    if (!selectedStrategyId) return [];
    const dept = effectiveWorkspace.departments.find(
      (d) => d.id === activeDeptId,
    );
    return (dept?.activities ?? []).filter(
      (a) => a.ogsmLink?.strategyId === selectedStrategyId,
    );
  }, [effectiveWorkspace, activeDeptId, selectedStrategyId]);

  const handleUpdateStrategy = useCallback(
    (updated: Strategy) => {
      const stamped: Strategy = {
        ...updated,
        updatedAt: new Date().toISOString(),
      };
      updateData({
        ...data,
        goals: data.goals.map((g) =>
          g.id !== selectedGoalId
            ? g
            : {
                ...g,
                strategies: g.strategies.map((s) =>
                  s.id === stamped.id ? stamped : s,
                ),
              },
        ),
      });
    },
    [data, selectedGoalId, updateData],
  );

  // ── Activity CRUD（跨部門直接操作）────────────────────────────────────────

  const handleUpdateMeasureDirect = useCallback(
    (
      deptId: string,
      periodId: string,
      goalId: string,
      stratId: string,
      measure: Measure,
    ) => {
      const stamped: Measure = {
        ...measure,
        updatedAt: new Date().toISOString(),
      };
      const patchDepts = (deps: typeof workspace.departments) =>
        deps.map((d) =>
          d.id !== deptId
            ? d
            : {
                ...d,
                periods: d.periods.map((p) =>
                  p.id !== periodId
                    ? p
                    : {
                        ...p,
                        ogsm: recompute({
                          ...p.ogsm,
                          goals: p.ogsm.goals.map((g) =>
                            g.id !== goalId
                              ? g
                              : {
                                  ...g,
                                  strategies: g.strategies.map((s) =>
                                    s.id !== stratId
                                      ? s
                                      : {
                                          ...s,
                                          measures: s.measures.map((m) =>
                                            m.id !== stamped.id ? m : stamped,
                                          ),
                                          updatedAt: new Date().toISOString(),
                                        },
                                  ),
                                },
                          ),
                        }),
                      },
                ),
              },
        );
      if (isMultiFileMode) {
        const entry = deptFiles.find(
          (f) => f.workspace.departments[0]?.id === deptId,
        );
        if (!entry || entry.isReadOnly) return;
        updateDeptWorkspace(deptId, {
          ...entry.workspace,
          departments: patchDepts(entry.workspace.departments),
        });
      } else {
        updateWorkspace({
          ...workspace,
          departments: patchDepts(workspace.departments),
        });
      }
    },
    [
      workspace,
      updateWorkspace,
      isMultiFileMode,
      deptFiles,
      updateDeptWorkspace,
    ],
  );

  const handleDeleteMeasureDirect = useCallback(
    (
      deptId: string,
      periodId: string,
      goalId: string,
      stratId: string,
      measureId: string,
    ) => {
      if (!window.confirm("確定要刪除這個活動嗎？")) return;
      const patchDepts = (deps: typeof workspace.departments) =>
        deps.map((d) =>
          d.id !== deptId
            ? d
            : {
                ...d,
                periods: d.periods.map((p) =>
                  p.id !== periodId
                    ? p
                    : {
                        ...p,
                        ogsm: recompute({
                          ...p.ogsm,
                          goals: p.ogsm.goals.map((g) =>
                            g.id !== goalId
                              ? g
                              : {
                                  ...g,
                                  strategies: g.strategies.map((s) =>
                                    s.id !== stratId
                                      ? s
                                      : {
                                          ...s,
                                          measures: s.measures.filter(
                                            (m) => m.id !== measureId,
                                          ),
                                          actionPlans: s.actionPlans.map(
                                            (ap) => ({
                                              ...ap,
                                              items: ap.items.map((item) =>
                                                item.linkedMeasureId ===
                                                measureId
                                                  ? {
                                                      ...item,
                                                      linkedMeasureId: null,
                                                    }
                                                  : item,
                                              ),
                                            }),
                                          ),
                                          updatedAt: new Date().toISOString(),
                                        },
                                  ),
                                },
                          ),
                        }),
                      },
                ),
              },
        );
      if (isMultiFileMode) {
        const entry = deptFiles.find(
          (f) => f.workspace.departments[0]?.id === deptId,
        );
        if (!entry || entry.isReadOnly) return;
        const existingDeleted = entry.workspace.deletedIds ?? [];
        updateDeptWorkspace(deptId, {
          ...entry.workspace,
          deletedIds: [...existingDeleted, measureId],
          departments: patchDepts(entry.workspace.departments),
        });
      } else {
        updateWorkspace({
          ...workspace,
          deletedIds: [...(workspace.deletedIds ?? []), measureId],
          departments: patchDepts(workspace.departments),
        });
      }
    },
    [
      workspace,
      updateWorkspace,
      isMultiFileMode,
      deptFiles,
      updateDeptWorkspace,
    ],
  );

  const handleAddMeasureDirect = useCallback(
    (
      deptId: string,
      periodId: string,
      goalId: string,
      stratId: string,
      measure: Measure,
    ) => {
      const patchDepts = (deps: typeof workspace.departments) =>
        deps.map((d) =>
          d.id !== deptId
            ? d
            : {
                ...d,
                periods: d.periods.map((p) =>
                  p.id !== periodId
                    ? p
                    : {
                        ...p,
                        ogsm: recompute({
                          ...p.ogsm,
                          goals: p.ogsm.goals.map((g) =>
                            g.id !== goalId
                              ? g
                              : {
                                  ...g,
                                  strategies: g.strategies.map((s) =>
                                    s.id !== stratId
                                      ? s
                                      : {
                                          ...s,
                                          measures: [...s.measures, measure],
                                          updatedAt: new Date().toISOString(),
                                        },
                                  ),
                                },
                          ),
                        }),
                      },
                ),
              },
        );
      if (isMultiFileMode) {
        const entry = deptFiles.find(
          (f) => f.workspace.departments[0]?.id === deptId,
        );
        if (!entry || entry.isReadOnly) return;
        updateDeptWorkspace(deptId, {
          ...entry.workspace,
          departments: patchDepts(entry.workspace.departments),
        });
      } else {
        updateWorkspace({
          ...workspace,
          departments: patchDepts(workspace.departments),
        });
      }
    },
    [
      workspace,
      updateWorkspace,
      isMultiFileMode,
      deptFiles,
      updateDeptWorkspace,
    ],
  );

  const handleToggleExcludeFromOgsm = useCallback(
    (activityId: string, exclude: boolean) => {
      const patchDepts = (deps: typeof workspace.departments) =>
        deps.map((d) =>
          d.id !== activeDeptId
            ? d
            : {
                ...d,
                activities: (d.activities ?? []).map((a) =>
                  a.id !== activityId ? a : { ...a, excludeFromOgsm: exclude },
                ),
              },
        );
      if (isMultiFileMode) {
        const entry = deptFiles.find(
          (f) => f.workspace.departments[0]?.id === activeDeptId,
        );
        if (!entry || entry.isReadOnly) return;
        updateDeptWorkspace(activeDeptId, {
          ...entry.workspace,
          departments: patchDepts(entry.workspace.departments),
        });
      } else {
        updateWorkspace({
          ...workspace,
          departments: patchDepts(workspace.departments),
        });
      }
    },
    [
      activeDeptId,
      isMultiFileMode,
      deptFiles,
      workspace,
      updateWorkspace,
      updateDeptWorkspace,
    ],
  );

  const handleJumpToMeasure = useCallback(
    (
      deptId: string,
      periodId: string,
      goalId: string,
      stratId: string,
      measureId: string,
    ) => {
      setShowActivityPage(false);
      setShowDeptSettings(false);
      setActiveDeptId(deptId);
      setActivePeriodId(periodId);
      setSelectedGoalId(goalId);
      setSelectedStrategyId(stratId);
      setPendingDetailNav({ tab: "plans", measureId });
    },
    [],
  );

  const handleAddStrategy = useCallback(() => {
    if (!selectedGoalId) return;
    const s: Strategy = {
      id: genId("str"),
      title: "新策略（點擊編輯名稱）",
      rawText: "",
      measures: [{ id: genId("msr"), rawText: "", kpis: [] }],
      actionPlans: [],
      owners: [],
      notes: "",
      completionRate: 0,
      manualRate: null,
      updatedAt: new Date().toISOString(),
    };
    const next = {
      ...data,
      goals: data.goals.map((g) =>
        g.id !== selectedGoalId
          ? g
          : { ...g, strategies: [...g.strategies, s] },
      ),
    };
    updateData(next);
    setSelectedStrategyId(s.id);
  }, [data, selectedGoalId, updateData]);

  const handleDeleteStrategy = useCallback(
    (strategyId: string) => {
      if (!window.confirm("確定要刪除這個策略嗎？")) return;
      const next = recompute({
        ...data,
        goals: data.goals.map((g) =>
          g.id !== selectedGoalId
            ? g
            : {
                ...g,
                strategies: g.strategies.filter((s) => s.id !== strategyId),
              },
        ),
      });
      // Tombstone the deleted strategy so merge won't resurrect it
      if (isMultiFileMode && activeDept) {
        const entry = deptFiles.find(
          (f) => f.workspace.departments[0]?.id === activeDept.id,
        );
        if (!entry || entry.isReadOnly) return;
        updateDeptWorkspace(activeDept.id, {
          ...entry.workspace,
          deletedIds: [...(entry.workspace.deletedIds ?? []), strategyId],
          departments: entry.workspace.departments.map((d) =>
            d.id !== activeDept.id
              ? d
              : {
                  ...d,
                  periods: d.periods.map((p) =>
                    p.id !== activePeriod?.id ? p : { ...p, ogsm: next },
                  ),
                },
          ),
        });
      } else {
        const wsNext: WorkspaceData = {
          ...workspace,
          deletedIds: [...(workspace.deletedIds ?? []), strategyId],
        };
        updateWorkspace({
          ...wsNext,
          departments: workspace.departments.map((d) =>
            d.id !== activeDept?.id
              ? d
              : {
                  ...d,
                  periods: d.periods.map((p) =>
                    p.id !== activePeriod?.id ? p : { ...p, ogsm: next },
                  ),
                },
          ),
        });
      }
      if (selectedStrategyId === strategyId) setSelectedStrategyId(null);
    },
    [
      data,
      selectedGoalId,
      selectedStrategyId,
      workspace,
      activeDept,
      activePeriod,
      updateWorkspace,
      isMultiFileMode,
      deptFiles,
      updateDeptWorkspace,
    ],
  );

  const handleAddGoal = useCallback(() => {
    const g: Goal = {
      id: genId("goal"),
      label: `G${data.goals.length + 1}`,
      title: "新目標",
      fullText: "點擊右側編輯目標描述",
      strategies: [],
      completionRate: 0,
      updatedAt: new Date().toISOString(),
    };
    const next = { ...data, goals: [...data.goals, g] };
    updateData(next);
    setSelectedGoalId(g.id);
    setSelectedStrategyId(null);
  }, [data, updateData]);

  const handleUpdateGoal = useCallback(
    (updated: Goal) => {
      updateData({
        ...data,
        goals: data.goals.map((g) =>
          g.id === updated.id
            ? { ...updated, updatedAt: new Date().toISOString() }
            : g,
        ),
      });
    },
    [data, updateData],
  );

  const handleEditObjective = useCallback(
    (text: string) => {
      updateData({ ...data, objectives: { ...data.objectives, deptO: text } });
    },
    [data, updateData],
  );

  const handleDeleteGoal = useCallback(
    (goalId: string) => {
      if (!window.confirm("確定要刪除這個目標（G）及其所有策略嗎？")) return;
      const goal = data.goals.find((g) => g.id === goalId);
      const strategyIds = goal?.strategies.map((s) => s.id) ?? [];
      const next = recompute({
        ...data,
        goals: data.goals.filter((g) => g.id !== goalId),
      });
      // Tombstone the deleted goal and all its strategies
      const tombstones = [goalId, ...strategyIds];
      if (isMultiFileMode && activeDept) {
        const entry = deptFiles.find(
          (f) => f.workspace.departments[0]?.id === activeDept.id,
        );
        if (!entry || entry.isReadOnly) return;
        updateDeptWorkspace(activeDept.id, {
          ...entry.workspace,
          deletedIds: [...(entry.workspace.deletedIds ?? []), ...tombstones],
          departments: entry.workspace.departments.map((d) =>
            d.id !== activeDept.id
              ? d
              : {
                  ...d,
                  periods: d.periods.map((p) =>
                    p.id !== activePeriod?.id ? p : { ...p, ogsm: next },
                  ),
                },
          ),
        });
      } else {
        const wsNext: WorkspaceData = {
          ...workspace,
          deletedIds: [...(workspace.deletedIds ?? []), ...tombstones],
        };
        updateWorkspace({
          ...wsNext,
          departments: workspace.departments.map((d) =>
            d.id !== activeDept?.id
              ? d
              : {
                  ...d,
                  periods: d.periods.map((p) =>
                    p.id !== activePeriod?.id ? p : { ...p, ogsm: next },
                  ),
                },
          ),
        });
      }
      if (selectedGoalId === goalId) {
        setSelectedGoalId(next.goals[0]?.id ?? null);
        setSelectedStrategyId(null);
      }
    },
    [
      data,
      selectedGoalId,
      workspace,
      activeDept,
      activePeriod,
      updateWorkspace,
      isMultiFileMode,
      deptFiles,
      updateDeptWorkspace,
    ],
  );

  // ── Phase 0: Split current workspace into per-dept JSON downloads ────────
  const handleSplitDepts = useCallback(() => {
    if (workspace.departments.length < 2) {
      alert("目前只有一個部門，不需要拆分。");
      return;
    }
    if (
      !window.confirm(
        `確定要將 ${workspace.departments.length} 個部門拆分為獨立 JSON 並下載嗎？\n請將每個檔案放到對應的子資料夾（OGSM/[部門名稱]/）。`,
      )
    )
      return;
    const allTeams = workspace.teams ?? [];
    workspace.departments.forEach((dept) => {
      const deptTeams = allTeams.filter(
        (t) => !t.deptId || t.deptId === dept.id,
      );
      const deptWs: WorkspaceData = {
        departments: [dept],
        version: 1,
        savedAt: new Date().toISOString(),
        teams: deptTeams.length > 0 ? deptTeams : undefined,
        warnDaysBefore: workspace.warnDaysBefore,
      };
      const blob = new Blob([JSON.stringify(deptWs, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${dept.name}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }, [workspace]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      if (file.name.endsWith(".json")) {
        const parsed = await importJSON(file);
        if ("departments" in parsed) {
          if (
            !window.confirm(
              "此 JSON 包含完整工作區資料，確定要取代目前的所有部門資料嗎？",
            )
          )
            return;
          const ws = parsed as WorkspaceData;
          updateWorkspace(ws);
          setActiveDeptId(ws.departments[0]?.id ?? "");
          setActivePeriodId(ws.departments[0]?.periods[0]?.id ?? "");
        } else {
          const ogsm = parsed as OGSMData;
          const halfYear: "H1" | "H2" = ogsm.period.includes("H2")
            ? "H2"
            : "H1";
          const yearMatch = ogsm.period.match(/(\d{4})/);
          const year = yearMatch
            ? parseInt(yearMatch[1])
            : new Date().getFullYear();
          const period: PeriodData = {
            id: genId("period"),
            halfYear,
            year,
            ogsm,
          };
          const next = {
            ...workspace,
            departments: workspace.departments.map((d) =>
              d.id !== activeDept?.id
                ? d
                : {
                    ...d,
                    periods: [...d.periods, period],
                  },
            ),
          };
          updateWorkspace(next);
          setActivePeriodId(period.id);
        }
      } else {
        const text = await readFileAsText(file);
        const ogsm = parseOGSM(text);
        const halfYear: "H1" | "H2" = ogsm.period.includes("H2") ? "H2" : "H1";
        const yearMatch = ogsm.period.match(/(\d{4})/);
        const year = yearMatch
          ? parseInt(yearMatch[1])
          : new Date().getFullYear();
        const period: PeriodData = {
          id: genId("period"),
          halfYear,
          year,
          ogsm,
        };
        const next = {
          ...workspace,
          departments: workspace.departments.map((d) =>
            d.id !== activeDept?.id
              ? d
              : {
                  ...d,
                  periods: [...d.periods, period],
                },
          ),
        };
        updateWorkspace(next);
        setActivePeriodId(period.id);
      }
      setSelectedGoalId(null);
      setSelectedStrategyId(null);
    } catch (err) {
      alert("匯入失敗：" + String(err));
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <span className="header-logo">A</span>
          <span className="header-title">Activo</span>
          <span className="header-period">
            {activeDept?.name ?? ""} · {data.period}
          </span>
        </div>
        {fsSupported && !isMultiFileMode && (
          <div
            className={`sp-sync-badge sp-sync-${syncStatus}`}
            onClick={syncStatus === "pending" ? handleReauthorize : undefined}
            style={syncStatus === "pending" ? { cursor: "pointer" } : undefined}
            title={
              syncStatus === "pending" ? "點此授權讀取資料檔案" : undefined
            }
          >
            {syncStatus === "saving" && (
              <>
                <span className="sp-spin">⟳</span> 儲存中
              </>
            )}
            {syncStatus === "saved" && "✓ 已儲存"}
            {syncStatus === "unlinked" && "◌ 未連結"}
            {syncStatus === "pending" && "🔐 點任意處啟用同步"}
            {syncStatus === "error" && "✕ 寫入失敗"}
          </div>
        )}
        <div className="header-actions">
          {isActiveDeptReadOnly && (
            <span
              className="readonly-badge"
              title="此部門為唯讀（OneDrive 權限不足）"
            >
              👁 檢視模式
            </span>
          )}
          {isMultiFileMode ? (
            <>
              <button
                className={
                  deptFiles.some((f) => f.isDirty && !f.isReadOnly)
                    ? "btn-save-dirty"
                    : "btn-secondary"
                }
                onClick={() => saveDeptFile(activeDeptId)}
                disabled={
                  isActiveDeptReadOnly ||
                  !(
                    deptFiles.find(
                      (f) => f.workspace.departments[0]?.id === activeDeptId,
                    )?.isDirty ?? false
                  )
                }
                title={
                  isActiveDeptReadOnly ? "唯讀部門無法存檔" : "儲存目前部門"
                }
              >
                {isActiveDeptReadOnly
                  ? "👁 唯讀"
                  : deptFiles.find(
                        (f) => f.workspace.departments[0]?.id === activeDeptId,
                      )?.isDirty
                    ? "💾 存檔"
                    : "✓ 已儲存"}
              </button>
              <button
                className="btn-secondary"
                onClick={handleUnlinkRootFolder}
                title="中斷根資料夾連結"
              >
                🗂 {deptFiles.length} 個部門已連結
              </button>
              <button
                className="btn-secondary"
                onClick={() =>
                  rootDirHandleRef.current &&
                  loadRootFolderIntoState(rootDirHandleRef.current)
                }
                title="重新掃描根資料夾"
              >
                🔄 重新載入
              </button>
            </>
          ) : (
            fsSupported &&
            (fileHandleRef.current ? (
              <>
                <button
                  className={isDirty ? "btn-save-dirty" : "btn-secondary"}
                  onClick={() => fileSaveNow(workspace)}
                  disabled={syncStatus === "saving" || !isDirty}
                  title={
                    isDirty ? "有未儲存的變更，點擊儲檔" : "無變更需要儲存"
                  }
                >
                  {syncStatus === "saving"
                    ? "儲存中…"
                    : isDirty
                      ? "💾 存檔"
                      : "✓ 已儲存"}
                </button>
                <button className="btn-secondary" onClick={handleUnlinkFile}>
                  🔗 已連結檔案
                </button>
                {dirHandleRef.current ? (
                  <button
                    className="btn-secondary"
                    onClick={handleUnlinkFolder}
                    title="進行中：每 30 秒自動扫描 OneDrive 副本"
                  >
                    🔍 副本掃描中
                  </button>
                ) : (
                  <button
                    className="btn-secondary"
                    onClick={handleLinkFolder}
                    title="選擇資料檔剀在的資料夾，啟用 OneDrive 副本自動偵測"
                  >
                    🔍 啟用副本偵測
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  className="btn-secondary"
                  onClick={handleLinkRootFolder}
                  title="選擇 OGSM 根資料夾，自動載入每個子資料夾的部門 JSON"
                >
                  🗂 連結根資料夾
                </button>
              </>
            ))
          )}
          <button
            className="btn-secondary"
            onClick={() => exportWorkspaceJSON(effectiveWorkspace)}
          >
            💾 備份
          </button>
          {!isMultiFileMode && effectiveWorkspace.departments.length > 1 && (
            <button
              className="btn-secondary"
              onClick={handleSplitDepts}
              title="將每個部門拆分為獨立 JSON 檔案下載（多部門分檔模式前置作業）"
            >
              📤 拆分部門
            </button>
          )}
          <label
            className="btn-secondary"
            style={{ cursor: importing ? "wait" : "pointer" }}
          >
            {importing ? "匯入中…" : "📂 還原/匯入"}
            <input
              type="file"
              accept=".csv,.json"
              style={{ display: "none" }}
              onChange={handleImport}
            />
          </label>
          <button
            className={`btn-secondary${showDeptSettings ? " active" : ""}`}
            onClick={() => {
              setShowDeptSettings((v) => !v);
              setSelectedGoalId(null);
              setSelectedStrategyId(null);
            }}
          >
            ⚙️ 部門設定
          </button>
        </div>
      </header>

      {syncStatus === "error" && syncError && (
        <div className="sp-error-banner">⚠️ {syncError}</div>
      )}
      {remoteUpdateBanner && (
        <div className="remote-update-banner">
          <span>⚡ 偵測到共用檔案已被他人更新</span>
          <div className="remote-update-actions">
            {isDirty && (
              <button
                className="btn-secondary remote-update-btn"
                onClick={handleRemoteSaveAndRefresh}
              >
                先存檔再重新整理
              </button>
            )}
            <button
              className="btn-secondary remote-update-btn"
              onClick={handleRemoteRefresh}
            >
              {isDirty ? "捨棄變更並重新整理" : "重新整理"}
            </button>
            <button
              className="remote-update-dismiss"
              onClick={() => {
                // 將基準推進到現在，避免下次輪詢重複顯示同一個更新
                readDataFileMeta(fileHandleRef.current!).then((t) => {
                  loadedFileLastModifiedRef.current = t;
                });
                setRemoteUpdateBanner(false);
              }}
            >
              稍後處理
            </button>
          </div>
        </div>
      )}
      {mergeToast && <div className="merge-toast">🔀 {mergeToast}</div>}

      {conflictCopies.length > 0 && (
        <div className="copy-scan-banner">
          <span className="copy-scan-title">
            📂 偵測到 {conflictCopies.length} 個 OneDrive 衝突副本
          </span>
          <div className="copy-scan-list">
            {conflictCopies.map((copy) => (
              <div key={copy.name} className="copy-scan-item">
                <span className="copy-scan-name" title={copy.name}>
                  {copy.name}
                </span>
                <button
                  className="btn-secondary copy-scan-btn"
                  onClick={() => handleMergeCopy(copy)}
                >
                  合併此副本
                </button>
                <button
                  className="remote-update-dismiss"
                  onClick={() => handleDismissCopy(copy.name)}
                >
                  忽略
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {conflictEntries.length > 0 && (
        <ConflictModal
          conflicts={conflictEntries}
          resolutions={conflictResolutions}
          onChange={handleConflictChange}
          onConfirm={handleConflictConfirm}
          onCancel={handleConflictCancel}
        />
      )}

      {/* Multi-file mode: dept merge toast */}
      {isMultiFileMode && deptMergeToast && (
        <div className="merge-toast">🔀 {deptMergeToast}</div>
      )}

      {/* Multi-file mode: remote update banners */}
      {isMultiFileMode && deptFiles.some((f) => f.hasRemoteUpdate) && (
        <div className="remote-update-banner">
          {deptFiles
            .filter((f) => f.hasRemoteUpdate)
            .map((f) => {
              const deptId = f.workspace.departments[0]?.id;
              return (
                <div
                  key={f.subfolderName}
                  className="remote-update-actions"
                  style={{ marginBottom: 4 }}
                >
                  <span>⚡ 「{f.subfolderName}」有遠端更新</span>
                  {f.isDirty && (
                    <button
                      className="btn-secondary remote-update-btn"
                      onClick={() =>
                        deptId &&
                        saveDeptFile(deptId).then(() =>
                          handleDeptRemoteRefresh(deptId, false),
                        )
                      }
                    >
                      先存檔再重新整理
                    </button>
                  )}
                  <button
                    className="btn-secondary remote-update-btn"
                    onClick={() => deptId && handleDeptRemoteRefresh(deptId)}
                  >
                    {f.isDirty ? "捨棄變更並重新整理" : "重新整理"}
                  </button>
                  <button
                    className="remote-update-dismiss"
                    onClick={() =>
                      setDeptFiles((prev) =>
                        prev.map((d) =>
                          d.subfolderName === f.subfolderName
                            ? { ...d, hasRemoteUpdate: false }
                            : d,
                        ),
                      )
                    }
                  >
                    稍後處理
                  </button>
                </div>
              );
            })}
        </div>
      )}

      {/* Multi-file mode: conflict copies banners */}
      {isMultiFileMode &&
        deptFiles.some((f) => f.conflictCopies.length > 0) && (
          <div className="copy-scan-banner">
            <span className="copy-scan-title">📂 偵測到 OneDrive 衝突副本</span>
            <div className="copy-scan-list">
              {deptFiles
                .filter((f) => f.conflictCopies.length > 0)
                .flatMap((f) => {
                  const deptId = f.workspace.departments[0]?.id;
                  return f.conflictCopies.map((copy) => (
                    <div
                      key={`${f.subfolderName}/${copy.name}`}
                      className="copy-scan-item"
                    >
                      <span className="copy-scan-name" title={copy.name}>
                        [{f.subfolderName}] {copy.name}
                      </span>
                      <button
                        className="btn-secondary copy-scan-btn"
                        onClick={() =>
                          deptId && handleDeptMergeCopy(deptId, copy)
                        }
                      >
                        合併此副本
                      </button>
                      <button
                        className="remote-update-dismiss"
                        onClick={() =>
                          deptId && handleDeptDismissCopy(deptId, copy.name)
                        }
                      >
                        忽略
                      </button>
                    </div>
                  ));
                })}
            </div>
          </div>
        )}

      {/* Multi-file mode: conflict resolution modal */}
      {conflictDeptEntries.length > 0 && (
        <ConflictModal
          conflicts={conflictDeptEntries}
          resolutions={conflictDeptResolutions}
          onChange={handleDeptConflictChange}
          onConfirm={handleDeptConflictConfirm}
          onCancel={handleDeptConflictCancel}
        />
      )}

      <div className="app-body">
        <Sidebar
          workspace={effectiveWorkspace}
          activeDeptId={activeDept?.id ?? ""}
          activePeriodId={activePeriod?.id ?? ""}
          data={data}
          selectedGoalId={selectedGoalId}
          selectedStrategyId={selectedStrategyId}
          isActivityPage={showActivityPage}
          readOnlyDeptIds={
            isMultiFileMode
              ? (deptFiles
                  .filter((f) => f.isReadOnly)
                  .map((f) => f.workspace.departments[0]?.id)
                  .filter(Boolean) as string[])
              : undefined
          }
          onSwitchDept={handleSwitchDept}
          onAddDept={handleAddDept}
          showAddDeptButton={!isMultiFileMode || isAdmin}
          onRenameDept={handleRenameDept}
          onDeleteDept={handleDeleteDept}
          onSwitchPeriod={handleSwitchPeriod}
          onAddPeriod={handleAddPeriod}
          onCopyPeriod={handleCopyPeriod}
          onDeletePeriod={handleDeletePeriod}
          onSelectGoal={(id) => {
            setSelectedGoalId(id);
            setSelectedStrategyId(null);
            setShowDeptSettings(false);
            setShowActivityPage(false);
          }}
          onSelectStrategy={setSelectedStrategyId}
          onSelectOverview={() => {
            setSelectedGoalId(null);
            setSelectedStrategyId(null);
            setShowDeptSettings(false);
            setShowActivityPage(false);
          }}
          onSelectActivities={() => {
            setShowActivityPage(true);
            setShowDeptSettings(false);
            setSelectedGoalId(null);
            setSelectedStrategyId(null);
          }}
        />
        {showDeptSettings ? (
          <DeptSettingsPage
            key={activeDeptId}
            data={data}
            teams={deptScopedTeams}
            deptId={activeDeptId}
            onUpdateTeams={handleUpdateTeamsForDept}
            onUpdateData={updateData}
          />
        ) : showActivityPage ? (
          <ActivityPage
            workspace={effectiveWorkspace}
            readOnlyDeptIds={
              isMultiFileMode
                ? (deptFiles
                    .filter((f) => f.isReadOnly)
                    .map((f) => f.workspace.departments[0]?.id)
                    .filter(Boolean) as string[])
                : undefined
            }
            onUpdateMeasure={handleUpdateMeasureDirect}
            onDeleteMeasure={handleDeleteMeasureDirect}
            onAddMeasure={handleAddMeasureDirect}
            onJumpToMeasure={handleJumpToMeasure}
          />
        ) : selectedGoalId === null ? (
          <OverviewPage
            data={data}
            warnDaysBefore={workspace.warnDaysBefore ?? 7}
            onSelectGoal={(id) => {
              setSelectedGoalId(id);
              setSelectedStrategyId(null);
            }}
            onSelectStrategy={(goalId, strategyId, warnFilter) => {
              setSelectedGoalId(goalId);
              setSelectedStrategyId(strategyId);
              setPendingDetailNav(
                warnFilter ? { tab: "plans", warnFilter } : null,
              );
            }}
            onSelectMeasure={(goalId, stratId, measureId) => {
              setSelectedGoalId(goalId);
              setSelectedStrategyId(stratId);
              setPendingDetailNav({ tab: "plans", measureId });
            }}
            onEditObjective={handleEditObjective}
            onAddGoal={handleAddGoal}
            isReadOnly={isActiveDeptReadOnly}
          />
        ) : (
          <>
            <StrategyList
              goal={selectedGoal}
              strategies={filteredStrategies}
              selectedStrategyId={selectedStrategyId}
              onSelectStrategy={(id, warnFilter) => {
                setSelectedStrategyId(id);
                setPendingDetailNav(
                  warnFilter ? { tab: "plans", warnFilter } : null,
                );
              }}
              onAddStrategy={handleAddStrategy}
              onUpdateGoal={handleUpdateGoal}
              onDeleteGoal={handleDeleteGoal}
              filterOwner={filterOwner}
              onFilterOwner={setFilterOwner}
              teams={teams}
              warnDaysBefore={workspace.warnDaysBefore ?? 7}
              isReadOnly={isActiveDeptReadOnly}
            />
            {selectedStrategy && (
              <DetailPanel
                key={
                  selectedStrategy.id +
                  (pendingDetailNav?.warnFilter ?? "") +
                  (pendingDetailNav?.measureId ?? "")
                }
                strategy={selectedStrategy}
                onClose={() => setSelectedStrategyId(null)}
                onUpdate={handleUpdateStrategy}
                onDelete={() => handleDeleteStrategy(selectedStrategy.id)}
                teams={teams}
                allMembers={allMembers}
                warnDaysBefore={workspace.warnDaysBefore ?? 7}
                onUpdateWarnDaysBefore={handleUpdateWarnDaysBefore}
                initialTab={pendingDetailNav?.tab}
                initialWarnFilter={pendingDetailNav?.warnFilter}
                initialMeasureId={pendingDetailNav?.measureId}
                isReadOnly={isActiveDeptReadOnly}
                linkedDeptActivities={linkedDeptActivities}
                onToggleExcludeFromOgsm={handleToggleExcludeFromOgsm}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
