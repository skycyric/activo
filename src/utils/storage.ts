import type {
  OGSMData,
  WorkspaceData,
  Department,
  PeriodData,
} from "../types/ogsm";

const WORKSPACE_KEY = "ogsm_workspace_v1";
const LEGACY_KEY = "ogsm_power_tool_data";

function genId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function saveWorkspace(ws: WorkspaceData): void {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(ws));
  } catch (e) {
    console.error("Failed to save workspace", e);
  }
}

export function loadWorkspace(): WorkspaceData | null {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return null;
    const ws: WorkspaceData = JSON.parse(raw);
    if (migrateSyncDuplicates(ws)) {
      saveWorkspace(ws);
    }
    // One-time: clear strategy owners when no teams configured
    if (!ws._migratedClearOwners) {
      if (!ws.teams || ws.teams.length === 0) {
        for (const dept of ws.departments) {
          for (const period of dept.periods) {
            for (const goal of period.ogsm.goals) {
              for (const strategy of goal.strategies) {
                strategy.owner = "";
              }
            }
          }
        }
      }
      ws._migratedClearOwners = true;
      saveWorkspace(ws);
    }
    return ws;
  } catch {
    return null;
  }
}

/** Remove duplicate PlanItems left by old cross-quarter sync mechanism. */
function migrateSyncDuplicates(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    for (const period of dept.periods) {
      for (const goal of period.ogsm.goals) {
        for (const strategy of goal.strategies) {
          const seen = new Set<string>();
          for (const ap of strategy.actionPlans) {
            const before = ap.items.length;
            ap.items = ap.items.filter((item) => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            });
            // Strip legacy sourceQuarter field
            for (const item of ap.items) {
              if ("sourceQuarter" in item) {
                delete (item as Record<string, unknown>).sourceQuarter;
                changed = true;
              }
            }
            if (ap.items.length !== before) changed = true;
          }
        }
      }
    }
  }
  return changed;
}

export function loadLegacyData(): OGSMData | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function wrapOGSMInWorkspace(
  ogsm: OGSMData,
  deptName = "部門一",
): WorkspaceData {
  const halfYear: "H1" | "H2" = ogsm.period.includes("H2") ? "H2" : "H1";
  const yearMatch = ogsm.period.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
  const period: PeriodData = {
    id: genId("period"),
    halfYear,
    year,
    ogsm: { ...ogsm, period: `${year} ${halfYear}` },
  };
  const dept: Department = {
    id: genId("dept"),
    name: deptName,
    periods: [period],
  };
  return { departments: [dept], version: 1 };
}

export function exportJSON(ogsm: OGSMData): void {
  const blob = new Blob([JSON.stringify(ogsm, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ogsm_${ogsm.period.replace(/\s/g, "_")}_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportWorkspaceJSON(ws: WorkspaceData): void {
  const blob = new Blob([JSON.stringify(ws, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ogsm_workspace_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importJSON(file: File): Promise<OGSMData | WorkspaceData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (result == null) {
          reject(new Error("Failed to read file"));
          return;
        }
        resolve(JSON.parse(result as string));
      } catch {
        reject(new Error("Invalid JSON file"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (result == null) {
        reject(new Error("Failed to read file"));
        return;
      }
      resolve(result as string);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file, "utf-8");
  });
}
