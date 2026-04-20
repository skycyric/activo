import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type {
  OGSMData,
  Strategy,
  Goal,
  WorkspaceData,
  Department,
  PeriodData,
  Team,
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
  normalizeWorkspaceData,
  validateOrWarn,
} from "./utils/storage";
import { WorkspaceDataSchema } from "./schemas/ogsm";
import {
  isFileSystemAccessSupported,
  BACKUP_KEEP_LATEST,
  readDataFile,
  readDataFileMeta,
  writeDataFile,
  ensureBackupDir,
  makeBackupTimestamp,
  makeDeptBackupFileName,
  makeWorkspaceBackupFileName,
  pruneJsonBackupsByPrefix,
  scanForConflictCopies,
  pickRootFolder,
  loadRootHandle,
  clearRootHandle,
  saveRootHandle,
  scanDeptJsons,
  probeWritable,
  writeJsonFileInDir,
} from "./utils/fileSync";
import {
  mergeWorkspaces,
  detectConflicts,
  trackClearedFields,
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
import HomePage from "./components/HomePage";
import KpiDesigner from "./components/KpiDesigner";
import csvRaw from "../營企本部OGSM - 部門看板表格.xlsx - 2026商發 H1.csv?raw";

type SyncStatus = "unlinked" | "pending" | "saving" | "saved" | "error";
type SaveDeptResult = "saved" | "skipped" | "conflict" | "error";
type InlineToastTone = "success" | "warning" | "error";
type AppRouteView = "home" | "activity" | "ogsm" | "settings" | "kpi";
type ActivityPageView = "table" | "kanban" | "gantt" | "cards" | "calendar";
type ActivityGanttSubView = "activity" | "plan";

interface ActivityRouteHint {
  activityPageView?: ActivityPageView;
  activityGanttSubView?: ActivityGanttSubView;
}

interface AppRouteState {
  __appRoute: true;
  view: AppRouteView;
  activityPageView: ActivityPageView;
  activityGanttSubView: ActivityGanttSubView;
  activeDeptId: string;
  activePeriodId: string;
  selectedGoalId: string | null;
  selectedStrategyId: string | null;
  kpiDesignerGoalId: string | null;
  pendingActivityDetailId: string | null;
  expandedDetailActivityId: string | null;
}

function buildRouteHash(route: AppRouteState): string {
  const params = new URLSearchParams();
  if (route.activeDeptId) params.set("d", route.activeDeptId);
  if (route.activePeriodId) params.set("p", route.activePeriodId);
  params.set("av", route.activityPageView);
  params.set("ag", route.activityGanttSubView);
  if (route.selectedGoalId) params.set("g", route.selectedGoalId);
  if (route.selectedStrategyId) params.set("s", route.selectedStrategyId);
  if (route.kpiDesignerGoalId) params.set("kg", route.kpiDesignerGoalId);
  if (route.view === "activity" && route.pendingActivityDetailId)
    params.set("a", route.pendingActivityDetailId);
  if (route.expandedDetailActivityId)
    params.set("x", route.expandedDetailActivityId);

  const query = params.toString();
  return query ? `#app/${route.view}?${query}` : `#app/${route.view}`;
}

function parseRouteHash(hash: string): Partial<AppRouteState> | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const normalizedRaw = raw.startsWith("/") ? raw.slice(1) : raw;

  // New readable format: #app/<view>?d=...&p=...&g=...&s=...&kg=...&a=...&x=...
  if (normalizedRaw.startsWith("app/")) {
    const [pathPart, queryPart] = normalizedRaw.split("?");
    const viewPart = pathPart.split("/")[1] ?? "";
    const view: AppRouteView =
      viewPart === "home" ||
      viewPart === "activity" ||
      viewPart === "ogsm" ||
      viewPart === "settings" ||
      viewPart === "kpi"
        ? viewPart
        : "home";
    const params = new URLSearchParams(queryPart ?? "");
    const avParam = params.get("av");
    const agParam = params.get("ag");
    const parsedActivityPageView: ActivityPageView | undefined =
      avParam === "table" ||
      avParam === "kanban" ||
      avParam === "gantt" ||
      avParam === "cards" ||
      avParam === "calendar"
        ? avParam
        : undefined;
    const parsedActivityGanttSubView: ActivityGanttSubView | undefined =
      agParam === "activity" || agParam === "plan" ? agParam : undefined;
    const route: Partial<AppRouteState> = {
      __appRoute: true,
      view,
      activeDeptId: params.get("d") ?? "",
      activePeriodId: params.get("p") ?? "",
      selectedGoalId: params.get("g"),
      selectedStrategyId: params.get("s"),
      kpiDesignerGoalId: params.get("kg"),
      pendingActivityDetailId: params.get("a"),
      expandedDetailActivityId: params.get("x"),
    };
    if (parsedActivityPageView) {
      route.activityPageView = parsedActivityPageView;
    }
    if (parsedActivityGanttSubView) {
      route.activityGanttSubView = parsedActivityGanttSubView;
    }
    return route;
  }

  // Legacy format backward compatibility: #app=1&view=...
  const params = new URLSearchParams(raw);
  if (params.get("app") !== "1") return null;

  const viewParam = params.get("view");
  const view: AppRouteView =
    viewParam === "home" ||
    viewParam === "activity" ||
    viewParam === "ogsm" ||
    viewParam === "settings" ||
    viewParam === "kpi"
      ? viewParam
      : "home";

  return {
    __appRoute: true,
    view,
    activeDeptId: params.get("dept") ?? "",
    activePeriodId: params.get("period") ?? "",
    selectedGoalId: params.get("goal"),
    selectedStrategyId: params.get("strategy"),
    kpiDesignerGoalId: params.get("kpiGoal"),
    pendingActivityDetailId: params.get("activity"),
    expandedDetailActivityId: null,
  };
}

function normalizeAppRouteState(
  route: Partial<AppRouteState>,
  base: AppRouteState,
): AppRouteState {
  const merged = {
    ...base,
    ...route,
    __appRoute: true as const,
  };
  const activityPageView: ActivityPageView =
    merged.activityPageView === "table" ||
    merged.activityPageView === "kanban" ||
    merged.activityPageView === "gantt" ||
    merged.activityPageView === "cards" ||
    merged.activityPageView === "calendar"
      ? merged.activityPageView
      : base.activityPageView;
  const activityGanttSubView: ActivityGanttSubView =
    merged.activityGanttSubView === "activity" ||
    merged.activityGanttSubView === "plan"
      ? merged.activityGanttSubView
      : base.activityGanttSubView;

  return {
    ...merged,
    activityPageView,
    activityGanttSubView,
  };
}

function buildNavigationKey(route: AppRouteState): string {
  // Keep browser back aligned with page-level navigation only.
  // Do not include OGSM internal selection state (goal/strategy/detail panel).
  return JSON.stringify({
    view: route.view,
    activityPageView: route.activityPageView,
    activityGanttSubView: route.activityGanttSubView,
    activeDeptId: route.activeDeptId,
    activePeriodId: route.activePeriodId,
  });
}

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

function getDeptSyncBadge(entry: DeptFileState | null): {
  label: string;
  className: string;
} {
  if (!entry) {
    return { label: "未連結", className: "sp-sync-unlinked" };
  }
  if (entry.syncStatus === "saving") {
    return { label: "儲存中", className: "sp-sync-saving" };
  }
  if (entry.syncStatus === "error") {
    return { label: "儲存失敗", className: "sp-sync-error" };
  }
  if (entry.isDirty || entry.syncStatus === "pending") {
    return { label: "未儲存", className: "sp-sync-pending" };
  }
  return { label: "已儲存", className: "sp-sync-saved" };
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
  const [showHomePage, setShowHomePage] = useState(true);
  /** 從 DetailPanel 「編輯 →」跳入 ActivityPage 時要自動開啟的活動 ID */
  const [pendingActivityDetailId, setPendingActivityDetailId] = useState<
    string | null
  >(null);
  /** OGSM 右 panel 目前展開中的活動 ID（同步到 URL） */
  const [expandedDetailActivityId, setExpandedDetailActivityId] = useState<
    string | null
  >(null);
  const [showKpiDesigner, setShowKpiDesigner] = useState(false);
  const [activityPageView, setActivityPageView] =
    useState<ActivityPageView>("table");
  const [activityGanttSubView, setActivityGanttSubView] =
    useState<ActivityGanttSubView>("activity");
  const [kpiDesignerGoalId, setKpiDesignerGoalId] = useState<string | null>(
    null,
  );
  /** Tracks whether KpiDesigner has unsaved GoalKPI draft changes */
  const kpiDesignerHasDraft = useRef(false);
  /** Call this instead of setShowKpiDesigner(false) to respect unsaved KPI drafts */
  const tryCloseKpiDesigner = useCallback((thenFn?: () => void) => {
    if (
      kpiDesignerHasDraft.current &&
      !window.confirm("KPI 有未儲存的變更，確認離開將會遺失。確定離開？")
    ) {
      return;
    }
    setShowKpiDesigner(false);
    setKpiDesignerGoalId(null);
    thenFn?.();
  }, []);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isApplyingBrowserRouteRef = useRef(false);
  const lastBrowserRouteKeyRef = useRef("");
  const lastNavigationKeyRef = useRef("");

  // ─── Multi-file sync (File System Access API + OneDrive 資料夾) ───────
  const fsSupported = isFileSystemAccessSupported();

  // ─── Multi-file mode state ────────────────────────────────────────────
  const [deptFiles, setDeptFiles] = useState<DeptFileState[]>([]);
  const rootDirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  /** True when the app is in multi-file (per-dept) mode */
  const isMultiFileMode = deptFiles.length > 0;
  /** True when the user has write permission on the root folder (admin). */
  const [isAdmin, setIsAdmin] = useState(false);

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
  const [deptSaveToast, setDeptSaveToast] = useState<{
    message: string;
    tone: InlineToastTone;
  } | null>(null);
  const conflictDeptSourceCopyRef = useRef<{
    handle: FileSystemFileHandle;
    name: string;
  } | null>(null);
  /** Stable ref kept in sync with deptFiles — used by polling interval to avoid stale closure */
  const deptFilesRef = useRef<DeptFileState[]>([]);
  const deptSaveToastTimerRef = useRef<number | null>(null);

  const showDeptSaveToast = useCallback(
    (message: string, tone: InlineToastTone = "success") => {
      setDeptSaveToast({ message, tone });
      if (deptSaveToastTimerRef.current !== null) {
        window.clearTimeout(deptSaveToastTimerRef.current);
      }
      deptSaveToastTimerRef.current = window.setTimeout(() => {
        setDeptSaveToast(null);
        deptSaveToastTimerRef.current = null;
      }, 4000);
    },
    [],
  );

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
          normalizeWorkspaceData(ws);
          validateOrWarn(WorkspaceDataSchema, ws, "loadRoot");
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

  // On mount: restore multi-file root handle if permission is already granted
  useEffect(() => {
    if (!fsSupported) return;
    (async () => {
      const rootHandle = await loadRootHandle();
      if (rootHandle) {
        await loadRootFolderIntoState(rootHandle);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── 點擊外部關閉主選單 ────────────────────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const applyBrowserRoute = useCallback((route: AppRouteState) => {
    setActivityPageView(route.activityPageView);
    setActivityGanttSubView(route.activityGanttSubView);
    setActiveDeptId(route.activeDeptId);
    setActivePeriodId(route.activePeriodId);
    setSelectedGoalId(route.selectedGoalId);
    setSelectedStrategyId(route.selectedStrategyId);
    setPendingActivityDetailId(
      route.view === "activity" ? route.pendingActivityDetailId : null,
    );
    setExpandedDetailActivityId(route.expandedDetailActivityId);
    setKpiDesignerGoalId(route.kpiDesignerGoalId);
    setShowHomePage(route.view === "home");
    setShowActivityPage(route.view === "activity");
    setShowDeptSettings(route.view === "settings");
    setShowKpiDesigner(route.view === "kpi");
  }, []);

  useEffect(() => {
    if (selectedStrategyId) return;
    setExpandedDetailActivityId(null);
  }, [selectedStrategyId]);

  const currentRouteState = useMemo<AppRouteState>(() => {
    // Keep this priority aligned with the render branches below.
    const view: AppRouteView = showKpiDesigner
      ? "kpi"
      : showHomePage
        ? "home"
        : showDeptSettings
          ? "settings"
          : showActivityPage
            ? "activity"
            : "ogsm";
    return {
      __appRoute: true,
      view,
      activityPageView,
      activityGanttSubView,
      activeDeptId,
      activePeriodId,
      selectedGoalId,
      selectedStrategyId,
      kpiDesignerGoalId,
      pendingActivityDetailId: showActivityPage
        ? pendingActivityDetailId
        : null,
      expandedDetailActivityId,
    };
  }, [
    activityPageView,
    activityGanttSubView,
    activeDeptId,
    activePeriodId,
    kpiDesignerGoalId,
    pendingActivityDetailId,
    expandedDetailActivityId,
    selectedGoalId,
    selectedStrategyId,
    showActivityPage,
    showDeptSettings,
    showHomePage,
    showKpiDesigner,
  ]);

  useEffect(() => {
    const routeKey = JSON.stringify(currentRouteState);
    const navigationKey = buildNavigationKey(currentRouteState);
    if (!lastBrowserRouteKeyRef.current) {
      const parsedHashRoute = parseRouteHash(window.location.hash);
      if (parsedHashRoute) {
        const mergedRoute = normalizeAppRouteState(
          parsedHashRoute,
          currentRouteState,
        );
        isApplyingBrowserRouteRef.current = true;
        applyBrowserRoute(mergedRoute);
        lastBrowserRouteKeyRef.current = JSON.stringify(mergedRoute);
        lastNavigationKeyRef.current = buildNavigationKey(mergedRoute);
        window.history.replaceState(
          mergedRoute,
          "",
          `${window.location.pathname}${window.location.search}${buildRouteHash(mergedRoute)}`,
        );
        return;
      }
      window.history.replaceState(
        currentRouteState,
        "",
        `${window.location.pathname}${window.location.search}${buildRouteHash(currentRouteState)}`,
      );
      lastBrowserRouteKeyRef.current = routeKey;
      lastNavigationKeyRef.current = navigationKey;
      return;
    }
    if (isApplyingBrowserRouteRef.current) {
      window.history.replaceState(
        currentRouteState,
        "",
        `${window.location.pathname}${window.location.search}${buildRouteHash(currentRouteState)}`,
      );
      lastBrowserRouteKeyRef.current = routeKey;
      lastNavigationKeyRef.current = navigationKey;
      isApplyingBrowserRouteRef.current = false;
      return;
    }
    if (routeKey === lastBrowserRouteKeyRef.current) return;

    if (navigationKey === lastNavigationKeyRef.current) {
      // In-page details changed (e.g., selection/expanded panel): don't pollute history stack.
      window.history.replaceState(
        currentRouteState,
        "",
        `${window.location.pathname}${window.location.search}${buildRouteHash(currentRouteState)}`,
      );
    } else {
      window.history.pushState(
        currentRouteState,
        "",
        `${window.location.pathname}${window.location.search}${buildRouteHash(currentRouteState)}`,
      );
      lastNavigationKeyRef.current = navigationKey;
    }
    lastBrowserRouteKeyRef.current = routeKey;
  }, [applyBrowserRoute, currentRouteState]);

  useEffect(() => {
    const applyRouteFromHash = () => {
      const parsedHashRoute = parseRouteHash(window.location.hash);
      if (!parsedHashRoute) return false;
      const fallbackRoute = normalizeAppRouteState(
        parsedHashRoute,
        currentRouteState,
      );
      isApplyingBrowserRouteRef.current = true;
      applyBrowserRoute(fallbackRoute);
      return true;
    };

    const onPopState = (event: PopStateEvent) => {
      const state = event.state as Partial<AppRouteState> | null;
      if (state && state.__appRoute === true) {
        const parsedHashRoute = parseRouteHash(window.location.hash);
        const normalizedState = normalizeAppRouteState(
          {
            ...(parsedHashRoute ?? {}),
            ...state,
          },
          currentRouteState,
        );
        isApplyingBrowserRouteRef.current = true;
        applyBrowserRoute(normalizedState);
        return;
      }
      applyRouteFromHash();
    };

    const onHashChange = () => {
      // Hash might be changed by manual edit or external in-app link navigation.
      applyRouteFromHash();
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [applyBrowserRoute, currentRouteState]);

  // ─── 同步 refs 供 polling interval 讀取（避免 stale closure）────────
  useEffect(() => {
    deptFilesRef.current = deptFiles;
  }, [deptFiles]);

  const POLL_INTERVAL_MS = 30_000;

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

  // ─── Multi-file mode handlers ─────────────────────────────────────────
  const handleLinkRootFolder = useCallback(async () => {
    const rootHandle = await pickRootFolder();
    if (!rootHandle) return;
    await saveRootHandle(rootHandle);
    await loadRootFolderIntoState(rootHandle);
  }, [loadRootFolderIntoState]);

  const handleUnlinkRootFolder = useCallback(async () => {
    const dirtyCount = deptFilesRef.current.filter((f) => f.isDirty).length;
    if (
      dirtyCount > 0 &&
      !window.confirm(
        `目前有 ${dirtyCount} 個部門尚未儲存，中斷連結後這些記憶體內變更將無法再寫回共享資料夾。確定要中斷嗎？`,
      )
    ) {
      return;
    }
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
          return {
            ...f,
            workspace: next,
            isDirty: true,
            syncStatus: "pending",
          };
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
      if (!entry || entry.isReadOnly || !entry.isDirty) {
        return "skipped" as SaveDeptResult;
      }

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
        normalizeWorkspaceData(onDisk);
        validateOrWarn(WorkspaceDataSchema, onDisk, "saveDept-disk1");

        // ── 等待 3 秒讓 OneDrive 同步（二次確認窗口）─────────────────
        await new Promise<void>((resolve) => setTimeout(resolve, 3000));

        // ── 重新取最新本地狀態（避免等待期間的編輯遺失）──────────────
        const freshEntry = deptFilesRef.current.find(
          (f) => f.workspace.departments[0]?.id === deptId,
        );
        if (!freshEntry) return;

        // ── 第二次讀 meta：若期間有人更新，重新讀磁碟 ─────────────────
        const secondMeta = await readDataFileMeta(freshEntry.handle);
        const diskWasModified = secondMeta !== firstMeta;
        if (diskWasModified) {
          const freshText = await readDataFile(freshEntry.handle);
          onDisk = JSON.parse(freshText);
          normalizeWorkspaceData(onDisk);
          validateOrWarn(WorkspaceDataSchema, onDisk, "saveDept-disk2");
        }

        // ── 版本比較 + 衝突偵測 ──────────────────────────────────────
        // diskWasModified 涵蓋版號相同但磁碟已被動過的情況（兩人同時存檔導致
        // 版號相同但內容不同），兩個條件任一成立都進行衝突偵測。
        const loadedVer = freshEntry.version ?? -1;
        let toWrite = freshEntry.workspace;
        const versionDiffers =
          onDisk.version !== undefined && onDisk.version !== loadedVer;

        if (versionDiffers || diskWasModified) {
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
                  ? { ...f, syncStatus: "pending" as SyncStatus }
                  : f,
              ),
            );
            return "conflict" as SaveDeptResult;
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
        return "saved" as SaveDeptResult;
      } catch {
        setDeptFiles((prev) =>
          prev.map((f) =>
            f.workspace.departments[0]?.id === deptId
              ? { ...f, syncStatus: "error" as SyncStatus }
              : f,
          ),
        );
        return "error" as SaveDeptResult;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // ─── Multi-file conflict resolution handlers ──────────────────────────

  const handleDeptConflictChange = useCallback(
    (entityId: string, field: string, choice: "local" | "remote") => {
      if (field === "*") {
        // 快捷全選：呼叫方展開所有 fieldDiff 欄位
        // 這裡直接寫 entity-level key，merge 函數會正確 fallback
        setConflictDeptResolutions((prev) => ({ ...prev, [entityId]: choice }));
      } else {
        const key = `${entityId}.${field}`;
        setConflictDeptResolutions((prev) => ({ ...prev, [key]: choice }));
      }
    },
    [],
  );

  const handleDeptConflictCancel = useCallback(() => {
    if (conflictDeptId) {
      setDeptFiles((prev) =>
        prev.map((f) =>
          f.workspace.departments[0]?.id === conflictDeptId
            ? { ...f, syncStatus: f.isDirty ? "pending" : "saved" }
            : f,
        ),
      );
    }
    setConflictDeptEntries([]);
    setConflictDeptResolutions({});
    setConflictDeptId(null);
    conflictDeptDiskWsRef.current = null;
    conflictDeptSourceCopyRef.current = null;
  }, [conflictDeptId]);

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
      // 解衝突後重讀：使用者解決衝突期間磁碟可能已再次被他人更新
      let freshDisk = onDisk;
      try {
        const freshText = await readDataFile(entry.handle);
        freshDisk = JSON.parse(freshText);
        normalizeWorkspaceData(freshDisk);
        validateOrWarn(WorkspaceDataSchema, freshDisk, "conflictCopy-disk");
      } catch {
        // best-effort：讀不到就沿用原衝突快照
      }
      const { workspace: merged } = mergeWorkspaces(
        entry.workspace,
        freshDisk,
        conflictDeptResolutions,
      );
      const payload: WorkspaceData = {
        ...merged,
        version: Math.max(entry.version ?? 1, freshDisk.version ?? 1) + 1,
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
        normalizeWorkspaceData(remote);
        validateOrWarn(WorkspaceDataSchema, remote, "refreshDept-disk");
        setDeptFiles((prev) =>
          prev.map((f) =>
            f.workspace.departments[0]?.id === deptId
              ? {
                  ...f,
                  workspace: remote,
                  isDirty: false,
                  syncStatus: "saved",
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
      if (
        entry.isDirty &&
        !window.confirm(
          `「${entry.subfolderName}」目前有未儲存變更，現在合併副本可能覆蓋或重組本機內容。建議先儲存；仍要繼續合併嗎？`,
        )
      ) {
        return;
      }
      try {
        const text = await readDataFile(copy.handle);
        const remote: WorkspaceData = JSON.parse(text);
        normalizeWorkspaceData(remote);
        validateOrWarn(WorkspaceDataSchema, remote, "mergeCopy-disk");
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

  const handleSaveCurrentDept = useCallback(async () => {
    if (!activeDeptId) return;
    const entry = deptFilesRef.current.find(
      (f) => f.workspace.departments[0]?.id === activeDeptId,
    );
    const result = await saveDeptFile(activeDeptId);
    if (!entry) return;
    if (result === "saved") {
      showDeptSaveToast(`「${entry.subfolderName}」已儲存。`, "success");
    } else if (result === "conflict") {
      showDeptSaveToast(
        `「${entry.subfolderName}」發生衝突，請先完成衝突處理。`,
        "warning",
      );
    } else if (result === "error") {
      showDeptSaveToast(`「${entry.subfolderName}」儲存失敗。`, "error");
    }
  }, [activeDeptId, saveDeptFile, showDeptSaveToast]);

  const handleSaveAllDirty = useCallback(async () => {
    const dirtyEntries = deptFilesRef.current.filter(
      (f) => f.isDirty && !f.isReadOnly,
    );
    if (dirtyEntries.length === 0) return;

    const savedNames: string[] = [];
    const errorNames: string[] = [];

    for (const entry of dirtyEntries) {
      const deptId = entry.workspace.departments[0]?.id;
      if (!deptId) continue;
      const result = await saveDeptFile(deptId);
      if (result === "saved") {
        savedNames.push(entry.subfolderName);
      } else if (result === "error") {
        errorNames.push(entry.subfolderName);
      }
      if (result === "conflict") {
        showDeptSaveToast(
          `已儲存 ${savedNames.length} 個部門；「${entry.subfolderName}」發生衝突，批次儲存已暫停。`,
          "warning",
        );
        return;
      }
    }

    if (errorNames.length > 0) {
      showDeptSaveToast(
        `已儲存 ${savedNames.length} 個部門；失敗：${errorNames.join("、")}`,
        "error",
      );
      return;
    }

    showDeptSaveToast(
      `已完成批次儲存，共 ${savedNames.length} 個部門。`,
      "success",
    );
  }, [saveDeptFile, showDeptSaveToast]);

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
  }, []);

  // Keyboard shortcut: Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const isTypingTarget =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === "s" &&
        isMultiFileMode
      ) {
        e.preventDefault();
        void handleSaveCurrentDept();
        return;
      }
      if (isTypingTarget) return;
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
  }, [handleSaveCurrentDept, isMultiFileMode, undo, redo]);
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

  const handleBackup = useCallback(async () => {
    // Fallback: no multi-file root linked -> keep existing download behavior.
    if (!isMultiFileMode || !rootDirHandleRef.current) {
      exportWorkspaceJSON(effectiveWorkspace);
      return;
    }

    try {
      const backupDir = await ensureBackupDir(rootDirHandleRef.current);
      const stamp = makeBackupTimestamp();

      const wsPayload: WorkspaceData = JSON.parse(
        JSON.stringify(effectiveWorkspace),
      );
      normalizeWorkspaceData(wsPayload);
      const wsVersion = wsPayload.version ?? 1;
      const wsFileName = makeWorkspaceBackupFileName(stamp, wsVersion);

      await writeJsonFileInDir(
        backupDir,
        wsFileName,
        JSON.stringify(wsPayload, null, 2),
      );
      await pruneJsonBackupsByPrefix(
        backupDir,
        "workspace_",
        BACKUP_KEEP_LATEST,
      );

      const failedDepts: string[] = [];
      let deptSaved = 0;

      for (const entry of deptFilesRef.current) {
        try {
          const deptPayload: WorkspaceData = JSON.parse(
            JSON.stringify(entry.workspace),
          );
          normalizeWorkspaceData(deptPayload);
          const deptVersion = entry.version ?? deptPayload.version ?? 1;
          const deptFileName = makeDeptBackupFileName(
            entry.subfolderName,
            stamp,
            deptVersion,
          );
          await writeJsonFileInDir(
            backupDir,
            deptFileName,
            JSON.stringify(deptPayload, null, 2),
          );
          deptSaved += 1;
        } catch {
          failedDepts.push(entry.subfolderName);
        }
      }

      await pruneJsonBackupsByPrefix(backupDir, "dept_", BACKUP_KEEP_LATEST);

      if (failedDepts.length > 0) {
        showDeptSaveToast(
          `備份完成：workspace 1 份、部門 ${deptSaved} 份；失敗：${failedDepts.join("、")}`,
          "warning",
        );
        return;
      }

      showDeptSaveToast(
        `備份完成：workspace 1 份、部門 ${deptSaved} 份（根目錄/備份）`,
        "success",
      );
    } catch {
      // Permission or FS failure fallback to browser download.
      exportWorkspaceJSON(effectiveWorkspace);
      showDeptSaveToast("無法寫入根目錄/備份，已改用下載備份檔。", "warning");
    }
  }, [effectiveWorkspace, isMultiFileMode, showDeptSaveToast]);

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

  // V3 活動清單：優先使用 dept.activities；若尚未遷移則從 strategy.measures 取得 fallback
  const effectiveDeptActivities = useMemo((): DeptActivity[] => {
    const deptActs = activeDept?.activities ?? [];
    if (deptActs.length > 0) return deptActs;
    // Migration fallback: use measures from strategies as DeptActivity
    return data.goals.flatMap((g) =>
      g.strategies.flatMap((s) => s.measures as unknown as DeptActivity[]),
    );
  }, [activeDept, data.goals]);

  const updateWorkspace = useCallback(
    (next: WorkspaceData) => {
      if (isUndoRedoRef.current) {
        isUndoRedoRef.current = false;
      } else {
        pushHistory(next);
      }
      setWorkspace(next);
      saveWorkspace(next);
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
          const tracked = prev
            ? trackClearedFields(prev, t, ["name", "members"])
            : t;
          return { ...tracked, updatedAt: now };
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
  const activeDeptFile = isMultiFileMode
    ? (deptFiles.find((f) => f.workspace.departments[0]?.id === activeDeptId) ??
      null)
    : null;
  const activeDeptSyncBadge = getDeptSyncBadge(activeDeptFile);
  const dirtyDeptCount = deptFiles.filter(
    (f) => f.isDirty && !f.isReadOnly,
  ).length;
  const canSaveCurrentDept =
    !!activeDeptFile &&
    !activeDeptFile.isReadOnly &&
    activeDeptFile.isDirty &&
    activeDeptFile.syncStatus !== "saving";
  const canSaveAnyDept = dirtyDeptCount > 0 && !conflictDeptId;

  useEffect(() => {
    if (!isMultiFileMode) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!deptFilesRef.current.some((f) => f.isDirty)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isMultiFileMode]);

  useEffect(() => {
    return () => {
      if (deptSaveToastTimerRef.current !== null) {
        window.clearTimeout(deptSaveToastTimerRef.current);
      }
    };
  }, []);

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
      if (
        showKpiDesigner &&
        kpiDesignerHasDraft.current &&
        !window.confirm("KPI 有未儲存的變更，切換部門將會遺失。確定切換？")
      ) {
        return;
      }
      const dept = effectiveWorkspace.departments.find((d) => d.id === deptId);
      if (!dept) return;
      setActiveDeptId(deptId);
      setActivePeriodId(dept.periods[0]?.id ?? "");
      setSelectedGoalId(null);
      setSelectedStrategyId(null);
      setFilterOwner("all");
      if (showKpiDesigner) {
        // 切部門後回到目標編輯器的目標樹起點
        setKpiDesignerGoalId(null);
      }
    },
    [effectiveWorkspace, showKpiDesigner],
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
    [
      workspace,
      updateWorkspace,
      isMultiFileMode,
      deptFiles,
      updateDeptWorkspace,
    ],
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

  // Sidebar is now navigation-only; keep these handlers available for future admin entry points.
  void handleAddDept;
  void handleRenameDept;
  void handleDeleteDept;

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
    return effectiveDeptActivities.filter(
      (a) =>
        a.dashboardLinks?.some(
          (l) => l.type === "ogsm" && l.strategyId === selectedStrategyId,
        ) ?? false,
    );
  }, [effectiveDeptActivities, selectedStrategyId]);

  const handleUpdateStrategy = useCallback(
    (updated: Strategy) => {
      const prevGoal = data.goals.find((g) => g.id === selectedGoalId);
      const prev = prevGoal?.strategies.find((s) => s.id === updated.id);
      const tracked = prev
        ? trackClearedFields(prev, updated, [
            "title",
            "notes",
            "owners",
            "actionPlans",
          ])
        : updated;
      const stamped: Strategy = {
        ...tracked,
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

  /** V3 flat handler：直接 patch dept.activities[]，無需 periodId/goalId/stratId */
  const handleUpdateDeptActivity = useCallback(
    (deptId: string, activity: DeptActivity) => {
      const stamped: DeptActivity = {
        ...activity,
        updatedAt: new Date().toISOString(),
      };
      const patchDepts = (deps: typeof workspace.departments) =>
        deps.map((d) =>
          d.id !== deptId
            ? d
            : {
                ...d,
                activities: (d.activities ?? []).map((a) =>
                  a.id !== stamped.id ? a : stamped,
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

  /** V3 flat handler：從 dept.activities[] 刪除並 tombstone */
  const handleDeleteDeptActivity = useCallback(
    (deptId: string, activityId: string) => {
      if (!window.confirm("確定要刪除這個活動嗎？")) return;
      const patchDepts = (deps: typeof workspace.departments) =>
        deps.map((d) =>
          d.id !== deptId
            ? d
            : {
                ...d,
                activities: (d.activities ?? []).filter(
                  (a) => a.id !== activityId,
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
          deletedIds: [...(entry.workspace.deletedIds ?? []), activityId],
          departments: patchDepts(entry.workspace.departments),
        });
      } else {
        updateWorkspace({
          ...workspace,
          deletedIds: [...(workspace.deletedIds ?? []), activityId],
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

  /** V3 flat handler：push 新活動到 dept.activities[] */
  const handleAddDeptActivity = useCallback(
    (deptId: string, activity: DeptActivity) => {
      const patchDepts = (deps: typeof workspace.departments) =>
        deps.map((d) =>
          d.id !== deptId
            ? d
            : { ...d, activities: [...(d.activities ?? []), activity] },
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

  /** 活動入口統一：在活動總覽開啟右側 ActivityDetailPanel，不跳 OGSM */
  const handleJumpToActivity = useCallback(
    (deptId: string, activityId: string, routeHint?: ActivityRouteHint) => {
      // Keep route anchors of source view (kanban/gantt/cards/calendar),
      // then open the activity detail panel inside Activity page.
      setActivityPageView(
        routeHint?.activityPageView ?? currentRouteState.activityPageView,
      );
      setActivityGanttSubView(
        routeHint?.activityGanttSubView ??
          currentRouteState.activityGanttSubView,
      );
      setShowActivityPage(true);
      setShowDeptSettings(false);
      setShowHomePage(false);
      setShowKpiDesigner(false);
      setActiveDeptId(deptId);
      setPendingActivityDetailId(activityId);
      setPendingDetailNav(null);
    },
    [currentRouteState],
  );

  const handleToggleExcludeFromOgsm = useCallback(
    (
      deptId: string,
      activityId: string,
      exclude: boolean,
      strategyId: string,
    ) => {
      const patchDepts = (deps: typeof workspace.departments) =>
        deps.map((d) =>
          d.id !== deptId
            ? d
            : {
                ...d,
                activities: (d.activities ?? []).map((a) =>
                  a.id !== activityId
                    ? a
                    : {
                        ...a,
                        dashboardLinks: (a.dashboardLinks ?? []).map((l) =>
                          l.type === "ogsm" && l.strategyId === strategyId
                            ? { ...l, exclude }
                            : l,
                        ),
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
      isMultiFileMode,
      deptFiles,
      workspace,
      updateWorkspace,
      updateDeptWorkspace,
    ],
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
      const prev = data.goals.find((g) => g.id === updated.id);
      const tracked = prev
        ? trackClearedFields(prev, updated, ["title", "fullText", "goalKpis"])
        : updated;
      updateData({
        ...data,
        goals: data.goals.map((g) =>
          g.id === updated.id
            ? { ...tracked, updatedAt: new Date().toISOString() }
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

  /** 目標編輯器用：直接以 goalId 新增策略（不依賴 selectedGoalId state） */
  const handleAddStrategyToGoal = useCallback(
    (goalId: string) => {
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
      updateData({
        ...data,
        goals: data.goals.map((g) =>
          g.id !== goalId ? g : { ...g, strategies: [...g.strategies, s] },
        ),
      });
    },
    [data, updateData],
  );

  /** 目標編輯器用：以 stratId 掃描所有目標刪除（不依賴 selectedGoalId state） */
  const handleDeleteStrategyById = useCallback(
    (stratId: string) => {
      if (!window.confirm("確定要刪除這個策略嗎？")) return;
      const goalId = data.goals.find((g) =>
        g.strategies.some((s) => s.id === stratId),
      )?.id;
      if (!goalId) return;
      const next = recompute({
        ...data,
        goals: data.goals.map((g) => ({
          ...g,
          strategies: g.strategies.filter((s) => s.id !== stratId),
        })),
      });
      const tombstones = [stratId];
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
        updateWorkspace({
          ...workspace,
          deletedIds: [...(workspace.deletedIds ?? []), ...tombstones],
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
      if (selectedStrategyId === stratId) setSelectedStrategyId(null);
    },
    [
      data,
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

  // ─── 目標編輯器「目標設定」模式的內容（供 KpiDesigner settingContent 和一般 OGSM 路由共用）───
  const ogsmSettingContent =
    selectedGoalId === null ? (
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
          setPendingDetailNav(warnFilter ? { tab: "plans", warnFilter } : null);
        }}
        onSelectMeasure={(goalId, stratId, measureId) => {
          setSelectedGoalId(goalId);
          setSelectedStrategyId(stratId);
          setPendingDetailNav({ tab: "plans", measureId });
        }}
        onNavigateToActivity={(actId) => {
          setPendingActivityDetailId(actId);
          setShowActivityPage(true);
          setShowHomePage(false);
        }}
        onEditObjective={handleEditObjective}
        onAddGoal={handleAddGoal}
        isReadOnly={true}
        deptActivities={effectiveDeptActivities}
      />
    ) : (
      <>
        <StrategyList
          goal={selectedGoal}
          allGoals={data.goals}
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
          isReadOnly={true}
          deptActivities={effectiveDeptActivities}
        />
        {selectedStrategy && (
          <DetailPanel
            key={
              selectedStrategy.id +
              (pendingDetailNav?.warnFilter ?? "") +
              (pendingDetailNav?.measureId ?? "")
            }
            strategy={selectedStrategy}
            onClose={() => {
              setSelectedStrategyId(null);
              setExpandedDetailActivityId(null);
            }}
            onUpdate={handleUpdateStrategy}
            onDelete={() => handleDeleteStrategy(selectedStrategy.id)}
            teams={teams}
            warnDaysBefore={workspace.warnDaysBefore ?? 7}
            onUpdateWarnDaysBefore={handleUpdateWarnDaysBefore}
            initialTab={pendingDetailNav?.tab}
            initialWarnFilter={pendingDetailNav?.warnFilter}
            initialMeasureId={pendingDetailNav?.measureId}
            isReadOnly={true}
            linkedDeptActivities={linkedDeptActivities}
            onToggleExcludeFromOgsm={(actId, exc, stratId) =>
              handleToggleExcludeFromOgsm(activeDeptId, actId, exc, stratId)
            }
            onNavigateToActivityPage={() => {
              setShowActivityPage(true);
              setShowDeptSettings(false);
              setShowHomePage(false);
            }}
            expandedActivityId={expandedDetailActivityId}
            onExpandedActivityChange={setExpandedDetailActivityId}
            onOpenActivityDetail={(actId) => {
              setPendingActivityDetailId(actId);
              setShowActivityPage(true);
              setShowDeptSettings(false);
              setShowHomePage(false);
            }}
          />
        )}
      </>
    );

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <div className="header-menu-wrap" ref={menuRef}>
            <button
              className="header-menu-btn"
              title="主選單"
              onClick={() => setMenuOpen((v) => !v)}
            >
              ☰
            </button>
            {menuOpen && (
              <div className="header-menu-dropdown">
                <button
                  className="header-menu-item"
                  onClick={() => {
                    tryCloseKpiDesigner(() => {
                      setShowHomePage(true);
                      setShowActivityPage(false);
                      setShowDeptSettings(false);
                    });
                    setMenuOpen(false);
                  }}
                >
                  🏠 首頁
                </button>
                <button
                  className="header-menu-item"
                  onClick={() => {
                    tryCloseKpiDesigner(() => {
                      setShowActivityPage(true);
                      setShowHomePage(false);
                      setShowDeptSettings(false);
                    });
                    setMenuOpen(false);
                  }}
                >
                  📋 活動總覽
                </button>
                <button
                  className="header-menu-item"
                  onClick={() => {
                    tryCloseKpiDesigner(() => {
                      setShowHomePage(false);
                      setShowActivityPage(false);
                      setShowDeptSettings(false);
                    });
                    setMenuOpen(false);
                  }}
                >
                  📊 OGSM 儀表板
                </button>
                <button
                  className="header-menu-item"
                  onClick={() => {
                    tryCloseKpiDesigner(() => {
                      setShowDeptSettings(true);
                      setShowHomePage(false);
                      setShowActivityPage(false);
                      setSelectedGoalId(null);
                      setSelectedStrategyId(null);
                    });
                    setMenuOpen(false);
                  }}
                >
                  ⚙️ 部門設定
                </button>
                <button
                  className="header-menu-item"
                  onClick={() => {
                    setShowKpiDesigner(true);
                    setKpiDesignerGoalId(null);
                    setShowHomePage(false);
                    setShowActivityPage(false);
                    setShowDeptSettings(false);
                    setMenuOpen(false);
                  }}
                >
                  🎯 目標編輯器
                </button>
              </div>
            )}
          </div>
          <span className="header-logo">A</span>
          <span className="header-title">Activo</span>
          <nav className="header-nav-tabs">
            <button
              className={`header-nav-tab${showHomePage ? " active" : ""}`}
              onClick={() =>
                tryCloseKpiDesigner(() => {
                  setShowHomePage(true);
                  setShowActivityPage(false);
                  setShowDeptSettings(false);
                })
              }
            >
              首頁
            </button>
            <button
              className={`header-nav-tab${showActivityPage ? " active" : ""}`}
              onClick={() =>
                tryCloseKpiDesigner(() => {
                  setShowActivityPage(true);
                  setShowHomePage(false);
                  setShowDeptSettings(false);
                })
              }
            >
              活動總覽
            </button>
            <button
              className={`header-nav-tab${showKpiDesigner ? " active" : ""}`}
              onClick={() => {
                setShowKpiDesigner(true);
                setKpiDesignerGoalId(null);
                setShowHomePage(false);
                setShowActivityPage(false);
                setShowDeptSettings(false);
              }}
            >
              目標編輯器
            </button>
            <button
              className={`header-nav-tab${
                !showHomePage &&
                !showActivityPage &&
                !showDeptSettings &&
                !showKpiDesigner
                  ? " active"
                  : ""
              }`}
              onClick={() =>
                tryCloseKpiDesigner(() => {
                  setShowHomePage(false);
                  setShowActivityPage(false);
                  setShowDeptSettings(false);
                })
              }
            >
              OGSM
            </button>
            <button
              className={`header-nav-tab${showDeptSettings ? " active" : ""}`}
              onClick={() =>
                tryCloseKpiDesigner(() => {
                  setShowDeptSettings(true);
                  setShowHomePage(false);
                  setShowActivityPage(false);
                  setSelectedGoalId(null);
                  setSelectedStrategyId(null);
                })
              }
            >
              部門設定
            </button>
          </nav>
        </div>

        <div className="header-toolbar">
          <select
            className="header-dept-select"
            value={activeDeptId}
            onChange={(e) => handleSwitchDept(e.target.value)}
          >
            {effectiveWorkspace.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <div className="header-section-sep" />

          {isMultiFileMode && (
            <div className="header-sync-group">
              <span
                className={`sp-sync-badge ${activeDeptSyncBadge.className}`}
              >
                {activeDeptSyncBadge.label}
              </span>
              <button
                className={
                  canSaveCurrentDept
                    ? "btn-save-dirty"
                    : "btn-secondary btn-disabled"
                }
                onClick={handleSaveCurrentDept}
                disabled={!canSaveCurrentDept}
                title={
                  isActiveDeptReadOnly
                    ? "目前部門為唯讀，無法存檔"
                    : canSaveCurrentDept
                      ? "儲存目前部門"
                      : "目前部門沒有待儲存變更"
                }
              >
                儲存目前部門
              </button>
              <button
                className="btn-secondary"
                onClick={handleSaveAllDirty}
                disabled={!canSaveAnyDept}
                title={
                  canSaveAnyDept
                    ? `依序儲存 ${dirtyDeptCount} 個尚未儲存的部門`
                    : "目前沒有可儲存的部門"
                }
              >
                儲存全部髒部門{dirtyDeptCount > 0 ? ` (${dirtyDeptCount})` : ""}
              </button>
            </div>
          )}

          {fsSupported &&
            (isMultiFileMode ? (
              <button
                className="btn-secondary"
                onClick={handleUnlinkRootFolder}
                title="中斷根資料夾連結"
              >
                🗂 {deptFiles.length} 個部門
              </button>
            ) : (
              <button
                className="btn-secondary"
                onClick={handleLinkRootFolder}
                title="選擇 OGSM 根資料夾，自動載入每個子資料夾的部門 JSON"
              >
                🗂 連結根目錄
              </button>
            ))}

          <button className="btn-secondary" onClick={() => void handleBackup()}>
            💾 備份
          </button>

          <label
            className="btn-secondary"
            style={{ cursor: importing ? "wait" : "pointer" }}
          >
            {importing ? "匯入中…" : "📂 還原"}
            <input
              type="file"
              accept=".csv,.json"
              style={{ display: "none" }}
              onChange={handleImport}
            />
          </label>
        </div>
      </header>

      {/* Multi-file mode: dept merge toast */}
      {isMultiFileMode && deptMergeToast && (
        <div className="merge-toast">🔀 {deptMergeToast}</div>
      )}

      {isMultiFileMode && deptSaveToast && (
        <div className={`inline-toast inline-toast-${deptSaveToast.tone}`}>
          {deptSaveToast.message}
        </div>
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
                  <button
                    className="btn-secondary remote-update-btn"
                    onClick={() => deptId && handleDeptRemoteRefresh(deptId)}
                  >
                    {f.isDirty ? "捨棄變更並重新整理" : "重新整理"}
                  </button>
                  {f.isDirty && (
                    <span className="remote-update-hint">
                      先用上方存檔按鈕寫回，再決定是否重新整理。
                    </span>
                  )}
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
        {!showHomePage &&
          !showActivityPage &&
          !showDeptSettings &&
          !showKpiDesigner && (
            <Sidebar
              workspace={effectiveWorkspace}
              activeDeptId={activeDept?.id ?? ""}
              activePeriodId={activePeriod?.id ?? ""}
              data={data}
              selectedGoalId={selectedGoalId}
              selectedStrategyId={selectedStrategyId}
              onSwitchPeriod={handleSwitchPeriod}
              onSelectGoal={(id) => {
                setSelectedGoalId(id);
                setSelectedStrategyId(null);
                setShowDeptSettings(false);
                setShowActivityPage(false);
                setShowHomePage(false);
              }}
              onSelectStrategy={setSelectedStrategyId}
              onSelectOverview={() => {
                setSelectedGoalId(null);
                setSelectedStrategyId(null);
                setShowDeptSettings(false);
                setShowActivityPage(false);
                setShowHomePage(false);
              }}
            />
          )}
        {showKpiDesigner ? (
          <KpiDesigner
            data={data}
            deptActivities={effectiveDeptActivities}
            availablePeriods={activeDept?.periods ?? []}
            initialGoalId={kpiDesignerGoalId ?? undefined}
            isReadOnly={isActiveDeptReadOnly}
            periodId={activePeriodId}
            onSwitchPeriod={handleSwitchPeriod}
            onUpdateData={updateData}
            onDraftStateChange={(hasDraft) => {
              kpiDesignerHasDraft.current = hasDraft;
            }}
            onUpdateActivity={(act) =>
              handleUpdateDeptActivity(activeDeptId, act)
            }
            onAddGoal={handleAddGoal}
            onDeleteGoal={handleDeleteGoal}
            onAddStrategyToGoal={handleAddStrategyToGoal}
            onDeleteStrategy={handleDeleteStrategyById}
            onAddPeriod={(halfYear, year) =>
              handleAddPeriod(activeDeptId, halfYear, year)
            }
            onCopyPeriod={(srcId, halfYear, year) =>
              handleCopyPeriod(activeDeptId, srcId, halfYear, year)
            }
            onDeletePeriod={(pid) => handleDeletePeriod(activeDeptId, pid)}
          />
        ) : showHomePage ? (
          <HomePage
            onSwitchToActivities={() => {
              setShowActivityPage(true);
              setShowHomePage(false);
              setShowDeptSettings(false);
              setSelectedGoalId(null);
              setSelectedStrategyId(null);
            }}
            onSwitchToOgsm={() => {
              setShowHomePage(false);
              setShowActivityPage(false);
              setShowDeptSettings(false);
              setSelectedGoalId(null);
              setSelectedStrategyId(null);
            }}
            onSwitchToKpiDesigner={() => {
              setShowKpiDesigner(true);
              setKpiDesignerGoalId(null);
              setShowHomePage(false);
              setShowActivityPage(false);
              setShowDeptSettings(false);
            }}
            onSwitchToDeptSettings={() => {
              setShowDeptSettings(true);
              setShowHomePage(false);
              setShowActivityPage(false);
              setSelectedGoalId(null);
              setSelectedStrategyId(null);
            }}
          />
        ) : showDeptSettings ? (
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
            activeDeptId={activeDeptId}
            view={activityPageView}
            ganttSubView={activityGanttSubView}
            onViewChange={setActivityPageView}
            onGanttSubViewChange={setActivityGanttSubView}
            readOnlyDeptIds={
              isMultiFileMode
                ? (deptFiles
                    .filter((f) => f.isReadOnly)
                    .map((f) => f.workspace.departments[0]?.id)
                    .filter(Boolean) as string[])
                : undefined
            }
            onUpdateActivity={handleUpdateDeptActivity}
            onDeleteActivity={handleDeleteDeptActivity}
            onAddActivity={handleAddDeptActivity}
            onJumpToActivity={handleJumpToActivity}
            initialSelectedActivityId={pendingActivityDetailId}
          />
        ) : (
          ogsmSettingContent
        )}
      </div>
    </div>
  );
}
