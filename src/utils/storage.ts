import {
  type OGSMData,
  type WorkspaceData,
  type Department,
  type PeriodData,
  type Strategy,
  WorkspaceDataSchema,
  OGSMDataSchema,
} from "../schemas/ogsm";

const WORKSPACE_KEY = "ogsm_workspace_v1";
const LEGACY_KEY = "ogsm_power_tool_data";

/**
 * 在開發期間驗證資料是否符合 schema，不符合時印出 console.warn。
 * 不阻斷執行，避免破壞已有存檔資料。
 */
function validateOrWarn<T>(
  schema: {
    safeParse: (v: unknown) => {
      success: boolean;
      error?: { message: string };
    };
  },
  data: T,
  context: string,
): void {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(
      `[schema] ${context} — 資料不符合 schema:`,
      result.error?.message,
    );
  }
}

function genId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function saveWorkspace(ws: WorkspaceData): void {
  try {
    normalizeWorkspaceData(ws);
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
    if (normalizeWorkspaceData(ws)) {
      saveWorkspace(ws);
    }
    validateOrWarn(WorkspaceDataSchema, ws, "loadWorkspace");
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

function toIsoDateLoose(v: unknown): string | undefined {
  if (typeof v !== "string" || !v.trim()) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return undefined;
  const nowYear = new Date().getFullYear();
  return `${nowYear}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

function migrateMeasureDateRangeFromPlanItems(strategy: Strategy): boolean {
  let changed = false;
  for (const measure of strategy.measures) {
    const linked = strategy.actionPlans
      .flatMap((ap) => ap.items)
      .filter((it) => it.linkedMeasureId === measure.id);
    if (linked.length === 0) continue;

    const ends = linked
      .map((it) => toIsoDateLoose(it.plannedEndDate))
      .filter((d): d is string => !!d)
      .sort();

    if (!measure.endDate && ends.length > 0) {
      measure.endDate = ends[ends.length - 1];
      changed = true;
    }
  }
  return changed;
}

/**
 * Legacy migration only: dedupe old ActionPlan items left by the historic
 * cross-quarter sync mechanism. This keeps backward compatibility for older
 * saved JSON, but ActionPlan items are no longer the primary UI data source.
 */
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

/**
 * Migrate old PlanItem date fields to the current plannedEndDate / actualEndDate fields.
 * Also cleans up legacy plannedStartDate / actualStartDate if still present.
 */
function migratePlanItemDateFields(ws: WorkspaceData): boolean {
  let changed = false;
  for (const dept of ws.departments) {
    for (const period of dept.periods) {
      for (const goal of period.ogsm.goals) {
        for (const strategy of goal.strategies) {
          for (const ap of strategy.actionPlans) {
            for (const item of ap.items) {
              const raw = item as unknown as Record<string, unknown>;
              const hasLegacy =
                "date" in raw ||
                "startDate" in raw ||
                "endDate" in raw ||
                "plannedStartDate" in raw ||
                "actualStartDate" in raw;
              if (hasLegacy) {
                if (!item.plannedEndDate) {
                  item.plannedEndDate =
                    toIsoDateLoose(
                      (raw.endDate as string | undefined) ??
                        (raw.plannedEndDate as string | undefined) ??
                        (raw.startDate as string | undefined) ??
                        (raw.date as string | undefined),
                    ) ?? undefined;
                }
                delete raw.date;
                delete raw.startDate;
                delete raw.endDate;
                delete raw.plannedStartDate;
                delete raw.actualStartDate;
                changed = true;
              }
            }
          }
        }
      }
    }
  }
  return changed;
}

function normalizeWorkspaceData(ws: WorkspaceData): boolean {
  let changed = false;
  if (migrateSyncDuplicates(ws)) changed = true;
  if (migratePlanItemDateFields(ws)) changed = true;
  for (const dept of ws.departments) {
    for (const period of dept.periods) {
      for (const goal of period.ogsm.goals) {
        for (const strategy of goal.strategies) {
          if (migrateMeasureDateRangeFromPlanItems(strategy)) changed = true;
        }
      }
    }
  }
  return changed;
}

function normalizeOGSMData(ogsm: OGSMData): boolean {
  let changed = false;
  for (const goal of ogsm.goals) {
    for (const strategy of goal.strategies) {
      for (const ap of strategy.actionPlans) {
        for (const item of ap.items) {
          const raw = item as unknown as Record<string, unknown>;
          const hasLegacy =
            "date" in raw ||
            "startDate" in raw ||
            "endDate" in raw ||
            "plannedStartDate" in raw ||
            "actualStartDate" in raw;
          if (hasLegacy) {
            if (!item.plannedEndDate) {
              item.plannedEndDate =
                toIsoDateLoose(
                  (raw.endDate as string | undefined) ??
                    (raw.plannedEndDate as string | undefined) ??
                    (raw.startDate as string | undefined) ??
                    (raw.date as string | undefined),
                ) ?? undefined;
            }
            delete raw.date;
            delete raw.startDate;
            delete raw.endDate;
            delete raw.plannedStartDate;
            delete raw.actualStartDate;
            changed = true;
          }
        }
      }
      if (migrateMeasureDateRangeFromPlanItems(strategy)) changed = true;
    }
  }
  return changed;
}

export function loadLegacyData(): OGSMData | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const ogsm: OGSMData = JSON.parse(raw);
    normalizeOGSMData(ogsm);
    return ogsm;
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
  const toExport: OGSMData = JSON.parse(JSON.stringify(ogsm));
  normalizeOGSMData(toExport);
  const blob = new Blob([JSON.stringify(toExport, null, 2)], {
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
  const toExport: WorkspaceData = JSON.parse(JSON.stringify(ws));
  normalizeWorkspaceData(toExport);
  const blob = new Blob([JSON.stringify(toExport, null, 2)], {
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
        const parsed = JSON.parse(result as string);
        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { departments?: unknown[] }).departments)
        ) {
          normalizeWorkspaceData(parsed as WorkspaceData);
          validateOrWarn(WorkspaceDataSchema, parsed, "importJSON:workspace");
          resolve(parsed as WorkspaceData);
          return;
        }
        if (
          parsed &&
          typeof parsed === "object" &&
          Array.isArray((parsed as { goals?: unknown[] }).goals)
        ) {
          normalizeOGSMData(parsed as OGSMData);
          validateOrWarn(OGSMDataSchema, parsed, "importJSON:ogsm");
          resolve(parsed as OGSMData);
          return;
        }
        resolve(parsed as OGSMData | WorkspaceData);
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
