import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type {
  OGSMData,
  Strategy,
  Goal,
  WorkspaceData,
  Department,
  PeriodData,
  Team,
} from "./types/ogsm";
import { parseOGSM, avgRate, genId, computeStatus } from "./utils/csvParser";
import {
  saveWorkspace,
  loadWorkspace,
  loadLegacyData,
  wrapOGSMInWorkspace,
  exportWorkspaceJSON,
  importJSON,
  readFileAsText,
} from "./utils/storage";
import {
  isFileSystemAccessSupported,
  pickDataFile,
  peekDataFile,
  hasSavedHandle,
  authorizeDataFile,
  readDataFile,
  writeDataFile,
  clearDataFile,
} from "./utils/fileSync";
import { exportWorkspaceXlsx } from "./utils/exportXlsx";
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
import csvRaw from "../\u71df\u4f01\u672c\u90e8OGSM - \u90e8\u9580\u770b\u677f\u8868\u683c.xlsx - 2026\u5546\u767c H1.csv?raw";

function recompute(data: OGSMData): OGSMData {
  const goals = data.goals.map((g) => {
    const strategies = g.strategies.map((s) => {
      const rate =
        s.manualRate ??
        avgRate(
          s.measures.flatMap((m) => m.kpis).map((k) => k.achievementRate ?? 0),
        );
      return { ...s, completionRate: rate, status: computeStatus(rate) };
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

function getInitialWorkspace(): WorkspaceData {
  const ws = loadWorkspace();
  if (ws) return ws;
  const legacy = loadLegacyData();
  if (legacy) return wrapOGSMInWorkspace(legacy, "\u71df\u4f01\u672c\u90e8");
  try {
    return wrapOGSMInWorkspace(parseOGSM(csvRaw), "\u71df\u4f01\u672c\u90e8");
  } catch {
    return wrapOGSMInWorkspace(
      {
        objectives: { orgO: "", deptO: "" },
        goals: [],
        period: "2026 H1",
        importedAt: new Date().toISOString(),
        overallRate: 0,
      },
      "\u90e8\u9580\u4e00",
    );
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
  const [filterOwner, setFilterOwner] = useState("all");
  const [importing, setImporting] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [showDeptSettings, setShowDeptSettings] = useState(false);

  // ─── File sync (File System Access API + OneDrive 資料夾) ─────────────
  const fsSupported = isFileSystemAccessSupported();
  type SyncStatus = "unlinked" | "pending" | "saving" | "saved" | "error";
  const fileHandleRef = useRef<FileSystemFileHandle | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("unlinked");
  const [syncError, setSyncError] = useState("");
  const authInProgressRef = useRef(false);
  const pendingClickHandlerRef = useRef<EventListener | null>(null);
  const loadedFileVersionRef = useRef<number | null>(null);
  const [mergeToast, setMergeToast] = useState("");
  // Manual save / dirty tracking
  const [isDirty, setIsDirty] = useState(false);
  // Conflict resolution state
  const [conflictEntries, setConflictEntries] = useState<ConflictEntry[]>([]);
  const [conflictResolutions, setConflictResolutions] =
    useState<ConflictResolutions>({});
  const conflictDiskWsRef = useRef<WorkspaceData | null>(null);

  // Shared: attach handle + read file into workspace
  const applyHandle = useCallback(async (handle: FileSystemFileHandle) => {
    fileHandleRef.current = handle;
    try {
      const text = await readDataFile(handle);
      const remote: WorkspaceData = JSON.parse(text);
      loadedFileVersionRef.current = remote.version ?? null;
      setWorkspace(remote);
      saveWorkspace(remote);
      setIsDirty(false);
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
        return;
      }
      const savedExists = await hasSavedHandle();
      if (!savedExists) return;
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
    })();
    return () => {
      if (pendingClickHandlerRef.current) {
        document.removeEventListener("click", pendingClickHandlerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fileSaveNow = useCallback(async (ws: WorkspaceData) => {
    const handle = fileHandleRef.current;
    if (!handle) return;
    setSyncStatus("saving");
    try {
      // Read current file to detect concurrent writes
      const diskText = await readDataFile(handle);
      const onDisk: WorkspaceData = JSON.parse(diskText);
      let toWrite = ws;

      if (
        loadedFileVersionRef.current !== null &&
        onDisk.version !== undefined &&
        onDisk.version !== loadedFileVersionRef.current
      ) {
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
        version: (toWrite.version ?? 1) + 1,
        savedAt: new Date().toISOString(),
      };
      loadedFileVersionRef.current = payload.version;
      await writeDataFile(handle, JSON.stringify(payload, null, 2));
      setSyncStatus("saved");
      setSyncError("");
      setIsDirty(false);
    } catch (e) {
      setSyncStatus("error");
      setSyncError("檔案寫入失敗：" + String(e));
    }
  }, []);

  const handleLinkFile = useCallback(async () => {
    const handle = await pickDataFile();
    if (!handle) return;
    fileHandleRef.current = handle;
    try {
      const text = await readDataFile(handle);
      const content = text.trim();
      if (content && content !== "{}") {
        const remote: WorkspaceData = JSON.parse(content);
        setWorkspace(remote);
        saveWorkspace(remote);
      } else {
        await writeDataFile(handle, JSON.stringify(workspace, null, 2));
      }
    } catch {
      // File is empty or unreadable — initialise with current workspace
      await writeDataFile(handle, JSON.stringify(workspace, null, 2));
    }
    setSyncStatus("saved");
    setSyncError("");
    setIsDirty(false);
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
      setWorkspace(merged);
      saveWorkspace(merged);
      setSyncStatus("saved");
      setSyncError("");
      setIsDirty(false);
    } catch (e) {
      setSyncStatus("error");
      setSyncError("檔案寫入失敗：" + String(e));
    } finally {
      setConflictEntries([]);
      conflictDiskWsRef.current = null;
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
    period: "2026 H1",
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
    const emptyOgsm: OGSMData = {
      objectives: { orgO: "", deptO: "" },
      goals: [],
      period: `${year} H1`,
      importedAt: new Date().toISOString(),
      overallRate: 0,
    };
    const period: PeriodData = {
      id: genId("period"),
      halfYear: "H1",
      year,
      ogsm: emptyOgsm,
    };
    const dept: Department = {
      id: genId("dept"),
      name: "\u65b0\u90e8\u9580",
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
        alert("\u81f3\u5c11\u9700\u8981\u4fdd\u7559\u4e00\u500b\u90e8\u9580");
        return;
      }
      if (
        !confirm(
          "\u78ba\u5b9a\u8981\u522a\u9664\u6b64\u90e8\u9580\u53ca\u6240\u6709\u8cc7\u6599\u55ce\uff1f\u6b64\u64cd\u4f5c\u7121\u6cd5\u5fa9\u539f\u3002",
        )
      )
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
        alert(`${year} ${halfYear} \u5df2\u5b58\u5728`);
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
        alert("\u81f3\u5c11\u9700\u8981\u4fdd\u7559\u4e00\u500b\u671f\u9593");
        return;
      }
      if (
        !confirm(
          "\u78ba\u5b9a\u8981\u522a\u9664\u6b64\u671f\u9593\u7684\u6240\u6709 OGSM \u8cc7\u6599\u55ce\uff1f",
        )
      )
        return;
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
      const remaining = next.departments.find((d) => d.id === deptId)!
        .periods[0];
      setActivePeriodId(remaining.id);
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
        const ownerList = s.owners ?? (s.owner ? [s.owner] : []);
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
      title:
        "\u65b0\u7b56\u7565\uff08\u9ede\u64ca\u7de8\u8f2f\u540d\u7a31\uff09",
      rawText: "",
      measures: [{ id: genId("msr"), rawText: "", kpis: [] }],
      q1Text: "",
      q2Text: "",
      actionPlans: [],
      owner: "",
      notes: "",
      completionRate: 0,
      manualRate: null,
      status: "not-started",
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
      if (
        !confirm(
          "\u78ba\u5b9a\u8981\u522a\u9664\u9019\u500b\u7b56\u7565\u55ce\uff1f",
        )
      )
        return;
      const next = {
        ...data,
        goals: data.goals.map((g) =>
          g.id !== selectedGoalId
            ? g
            : {
                ...g,
                strategies: g.strategies.filter((s) => s.id !== strategyId),
              },
        ),
      };
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
      title: "\u65b0\u76ee\u6a19",
      fullText: "\u9ede\u64ca\u53f3\u5074\u7de8\u8f2f\u76ee\u6a19\u63cf\u8ff0",
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
      if (
        !confirm(
          "\u78ba\u5b9a\u8981\u522a\u9664\u9019\u500b\u76ee\u6a19\uff08G\uff09\u53ca\u5176\u6240\u6709\u7b56\u7565\u55ce\uff1f",
        )
      )
        return;
      const goal = data.goals.find((g) => g.id === goalId);
      const strategyIds = goal?.strategies.map((s) => s.id) ?? [];
      const next = {
        ...data,
        goals: data.goals.filter((g) => g.id !== goalId),
      };
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

  const handleExportXlsx = async () => {
    setExportingXlsx(true);
    try {
      await exportWorkspaceXlsx(workspace);
    } catch (err) {
      alert("匯出失敗：" + String(err));
    } finally {
      setExportingXlsx(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      if (file.name.endsWith(".json")) {
        const parsed = await importJSON(file);
        if ("departments" in parsed) {
          if (
            !confirm(
              "\u6b64 JSON \u5305\u542b\u5b8c\u6574\u5de5\u4f5c\u5340\u8cc7\u6599\uff0c\u78ba\u5b9a\u8981\u53d6\u4ee3\u76ee\u524d\u7684\u6240\u6709\u90e8\u9580\u8cc7\u6599\u55ce\uff1f",
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
      alert("\u532f\u5165\u5931\u6557\uff1a" + String(err));
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-brand">
          <span className="header-logo">&#9675;</span>
          <span className="header-title">OGSM Power Tool</span>
          <span className="header-period">
            {activeDept?.name ?? ""} &middot; {data.period}
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
              </>
            ) : (
              <button className="btn-secondary" onClick={handleLinkFile}>
                📁 連結資料檔案
              </button>
            ))}
          <button
            className="btn-secondary"
            onClick={handleExportXlsx}
            disabled={exportingXlsx}
            style={{ cursor: exportingXlsx ? "wait" : "pointer" }}
          >
            {exportingXlsx ? "匯出中…" : "📊 匯出報告"}
          </button>
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
      {mergeToast && <div className="merge-toast">🔀 {mergeToast}</div>}

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
          onAddGoal={handleAddGoal}
          onDeleteGoal={handleDeleteGoal}
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
            onSelectGoal={(id) => {
              setSelectedGoalId(id);
              setSelectedStrategyId(null);
            }}
            onSelectStrategy={(goalId, strategyId) => {
              setSelectedGoalId(goalId);
              setSelectedStrategyId(strategyId);
            }}
            onEditObjective={handleEditObjective}
          />
        ) : (
          <>
            <StrategyList
              goal={selectedGoal}
              strategies={filteredStrategies}
              selectedStrategyId={selectedStrategyId}
              onSelectStrategy={setSelectedStrategyId}
              onAddStrategy={handleAddStrategy}
              onUpdateGoal={handleUpdateGoal}
              onDeleteStrategy={handleDeleteStrategy}
              filterOwner={filterOwner}
              onFilterOwner={setFilterOwner}
              teams={teams}
            />
            {selectedStrategy && (
              <DetailPanel
                key={selectedStrategy.id}
                strategy={selectedStrategy}
                period={data.period}
                onClose={() => setSelectedStrategyId(null)}
                onUpdate={handleUpdateStrategy}
                onDelete={() => handleDeleteStrategy(selectedStrategy.id)}
                teams={teams}
                allMembers={allMembers}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
