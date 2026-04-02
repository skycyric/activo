import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type {
  OGSMData,
  Strategy,
  Goal,
  WorkspaceData,
  Department,
  PeriodData,
  Team,
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
  pickDataFile,
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
import csvRaw from "../營企本部OGSM - 部門看板表格.xlsx - 2026商發 H1.csv?raw";

type SyncStatus = "unlinked" | "pending" | "saving" | "saved" | "error";

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

  // ─── File sync (File System Access API + OneDrive 資料夾) ─────────────
  const fsSupported = isFileSystemAccessSupported();
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("unlinked");
  const [syncError, setSyncError] = useState("");
  const authInProgressRef = useRef(false);
  const pendingClickHandlerRef = useRef<EventListener | null>(null);
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

  const handleLinkFile = useCallback(async () => {
    const handle = await pickDataFile();
    if (!handle) return;
    fileHandleRef.current = handle;
    try {
      const text = await readDataFile(handle);
      const content = text.trim();
      if (content && content !== "{}") {
        // 明確捕捉 JSON parse 錯誤，避免壞格式被靜默覆寫
        let remote: WorkspaceData;
        try {
          remote = JSON.parse(content);
        } catch {
          throw new Error("檔案內容不是有效的 JSON，請確認後再試");
        }
        if (
          !remote ||
          typeof remote !== "object" ||
          !Array.isArray((remote as { departments?: unknown }).departments)
        ) {
          throw new Error("檔案格式不符：不是有效的工作區格式");
        }
        validateOrWarn(WorkspaceDataSchema, remote, "handleLinkFile");
        loadedFileVersionRef.current = remote.version ?? null;
        setWorkspace(remote);
        saveWorkspace(remote);
      } else {
        // 空檔案：以當前 workspace 初始化，並寫入版本號 1
        const initVer = 1;
        loadedFileVersionRef.current = initVer;
        await writeDataFile(
          handle,
          JSON.stringify({ ...workspace, version: initVer }, null, 2),
        );
      }
      setSyncStatus("saved");
      setSyncError("");
      setIsDirty(false);
    } catch (e) {
      // 連結失敗（格式錯誤 / 無法寫入）：顯示錯誤，不將 handle 視為有效
      fileHandleRef.current = null;
      setSyncStatus("error");
      setSyncError("連結檔案失敗：" + String(e));
    }
  }, [workspace]);

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
  // ─────────────────────────────────────────────────────────────────────

  const teams: Team[] = workspace.teams ?? [];
  const allMembers = teams.flatMap((t) => t.members);

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
  const activeDept =
    workspace.departments.find((d) => d.id === activeDeptId) ??
    workspace.departments[0];
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

  const handleUpdateWarnDaysBefore = useCallback(
    (n: number) => {
      updateWorkspace({ ...workspace, warnDaysBefore: n });
    },
    [workspace, updateWorkspace],
  );

  const updateData = useCallback(
    (nextData: OGSMData) => {
      const computed = recompute(nextData);
      const deptId = activeDept?.id;
      const periodId = activePeriod?.id;
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
    },
    [workspace, activeDept, activePeriod, updateWorkspace],
  );

  // --- Department handlers ---

  const handleAddDept = useCallback(() => {
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
  }, [workspace, updateWorkspace]);

  const handleRenameDept = useCallback(
    (deptId: string, name: string) => {
      if (!name.trim()) return;
      const next = {
        ...workspace,
        departments: workspace.departments.map((d) =>
          d.id === deptId ? { ...d, name: name.trim() } : d,
        ),
      };
      updateWorkspace(next);
    },
    [workspace, updateWorkspace],
  );

  const handleDeleteDept = useCallback(
    (deptId: string) => {
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
    [workspace, updateWorkspace],
  );

  const handleSwitchDept = useCallback(
    (deptId: string) => {
      const dept = workspace.departments.find((d) => d.id === deptId);
      if (!dept) return;
      setActiveDeptId(deptId);
      setActivePeriodId(dept.periods[0]?.id ?? "");
      setSelectedGoalId(null);
      setSelectedStrategyId(null);
      setFilterOwner("all");
    },
    [workspace],
  );

  // --- Period handlers ---

  const handleAddPeriod = useCallback(
    (deptId: string, halfYear: "H1" | "H2", year: number) => {
      const dept = workspace.departments.find((d) => d.id === deptId);
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
        ...workspace,
        departments: workspace.departments.map((d) =>
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
      updateWorkspace(next);
      setActivePeriodId(period.id);
      setSelectedGoalId(null);
      setSelectedStrategyId(null);
    },
    [workspace, updateWorkspace],
  );

  const handleDeletePeriod = useCallback(
    (deptId: string, periodId: string) => {
      const dept = workspace.departments.find((d) => d.id === deptId);
      if (!dept || dept.periods.length <= 1) {
        alert("至少需要保留一個期間");
        return;
      }
      if (!window.confirm("確定要刪除此期間的所有 OGSM 資料嗎？")) return;
      const next = {
        ...workspace,
        departments: workspace.departments.map((d) =>
          d.id !== deptId
            ? d
            : {
                ...d,
                periods: d.periods.filter((p) => p.id !== periodId),
              },
        ),
      };
      updateWorkspace(next);
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
      const dept = workspace.departments.find((d) => d.id === deptId);
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
        ...workspace,
        departments: workspace.departments.map((d) =>
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
      updateWorkspace(next);
      setActivePeriodId(period.id);
      setSelectedGoalId(null);
      setSelectedStrategyId(null);
    },
    [workspace, updateWorkspace],
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
    ],
  );

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
          <span className="header-logo">○</span>
          <span className="header-title">OGSM Power Tool</span>
          <span className="header-period">
            {activeDept?.name ?? ""} · {data.period}
          </span>
        </div>
        {fsSupported && (
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
          {fsSupported &&
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
              <button className="btn-secondary" onClick={handleLinkFile}>
                📁 連結資料檔案
              </button>
            ))}
          <button
            className="btn-secondary"
            onClick={() => exportWorkspaceJSON(workspace)}
          >
            💾 備份
          </button>
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

      <div className="app-body">
        <Sidebar
          workspace={workspace}
          activeDeptId={activeDept?.id ?? ""}
          activePeriodId={activePeriod?.id ?? ""}
          data={data}
          selectedGoalId={selectedGoalId}
          selectedStrategyId={selectedStrategyId}
          onSwitchDept={handleSwitchDept}
          onAddDept={handleAddDept}
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
          }}
          onSelectStrategy={setSelectedStrategyId}
          onSelectOverview={() => {
            setSelectedGoalId(null);
            setSelectedStrategyId(null);
            setShowDeptSettings(false);
          }}
        />
        {showDeptSettings ? (
          <DeptSettingsPage
            key={activePeriod?.id}
            data={data}
            teams={teams}
            onUpdateTeams={handleUpdateTeams}
            onUpdateData={updateData}
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
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
