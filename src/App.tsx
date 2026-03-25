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
import { exportWorkspaceXlsx } from "./utils/exportXlsx";
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
    },
    [pushHistory],
  );

  const handleUpdateTeams = useCallback(
    (nextTeams: Team[]) => {
      updateWorkspace({ ...workspace, teams: nextTeams });
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
      if (filterOwner !== "all" && !s.owner.includes(filterOwner)) return false;
      return true;
    });
  }, [selectedGoal, filterOwner]);

  const handleUpdateStrategy = useCallback(
    (updated: Strategy) => {
      updateData({
        ...data,
        goals: data.goals.map((g) =>
          g.id !== selectedGoalId
            ? g
            : {
                ...g,
                strategies: g.strategies.map((s) =>
                  s.id === updated.id ? updated : s,
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
      updateData(next);
      if (selectedStrategyId === strategyId) setSelectedStrategyId(null);
    },
    [data, selectedGoalId, selectedStrategyId, updateData],
  );

  const handleAddGoal = useCallback(() => {
    const g: Goal = {
      id: genId("goal"),
      label: `G${data.goals.length + 1}`,
      title: "\u65b0\u76ee\u6a19",
      fullText: "\u9ede\u64ca\u53f3\u5074\u7de8\u8f2f\u76ee\u6a19\u63cf\u8ff0",
      strategies: [],
      completionRate: 0,
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
        goals: data.goals.map((g) => (g.id === updated.id ? updated : g)),
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
      const next = {
        ...data,
        goals: data.goals.filter((g) => g.id !== goalId),
      };
      updateData(next);
      if (selectedGoalId === goalId) {
        setSelectedGoalId(next.goals[0]?.id ?? null);
        setSelectedStrategyId(null);
      }
    },
    [data, selectedGoalId, updateData],
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
        <div className="header-actions">
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
