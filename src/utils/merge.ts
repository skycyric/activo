/**
 * Conflict-free merge for WorkspaceData.
 *
 * Strategy: Entity-level Last-Write-Wins using updatedAt timestamps.
 * - Goals and Strategies are merged by id; the side with the newer updatedAt wins.
 * - A Strategy is the finest merge unit: its entire object is kept atomically.
 * - For Goals: metadata (title, fullText) follows updatedAt, but strategies
 *   within the goal are always merged from both sides independently.
 * - deletedIds act as tombstones: an id listed there is removed even if the
 *   other side still has it (delete wins over concurrent edit).
 * - Teams are merged the same way as Strategies.
 * - Departments and Periods have no updatedAt; both sides' entries are unioned
 *   (people rarely add/delete departments concurrently).
 *
 * For user-facing conflict resolution, call detectConflicts() first to obtain
 * ConflictEntry items, let the user resolve each via ConflictModal, then pass
 * the resulting ConflictResolutions to mergeWorkspaces().
 */

import type {
  WorkspaceData,
  Goal,
  Strategy,
  Team,
  Department,
  PeriodData,
} from "../schemas/ogsm";

// public types

export interface MergeResult {
  workspace: WorkspaceData;
  autoMerged: number;
}

export interface FieldDiff {
  field: string;
  label: string;
  localVal: string;
  remoteVal: string;
}

export interface ConflictEntry {
  id: string;
  entityType: "goal" | "strategy" | "team";
  entityLabel: string;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  fieldDiffs: FieldDiff[];
  localEntity: Goal | Strategy | Team;
  remoteEntity: Goal | Strategy | Team;
}

export type ConflictResolutions = Record<string, "local" | "remote">;

// display helpers

function fmt(val: unknown, field?: string): string {
  if (val === null || val === undefined || val === "") return "(空白)";
  if (typeof val === "number") return String(val);
  if (typeof val === "string") {
    return val.length > 80 ? val.slice(0, 80) + "..." : val;
  }
  if (Array.isArray(val)) {
    if (field === "measures") return `${val.length} 項衡量指標`;
    if (field === "actionPlans") {
      const total = (val as Array<{ items: unknown[] }>).reduce(
        (a, p) => a + (p.items?.length ?? 0),
        0,
      );
      return `${val.length} 個季度計畫 / ${total} 筆項目`;
    }
    if (field === "members") {
      return (
        (val as Array<{ name: string }>).map((m) => m.name).join("、") ||
        "(無成員)"
      );
    }
    if (field === "owners") {
      return (val as string[]).join("、") || "(無負責人)";
    }
    return `${val.length} 項`;
  }
  const s = JSON.stringify(val);
  return s.length > 80 ? s.slice(0, 80) + "..." : s;
}

function strategyDiffs(ls: Strategy, rs: Strategy): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const fields: Array<[keyof Strategy, string]> = [
    ["title", "策略名稱"],
    ["notes", "備註"],
  ];
  for (const [f, label] of fields) {
    if (String(ls[f] ?? "") !== String(rs[f] ?? "")) {
      diffs.push({
        field: f,
        label,
        localVal: fmt(ls[f]),
        remoteVal: fmt(rs[f]),
      });
    }
  }
  if (JSON.stringify(ls.owners ?? []) !== JSON.stringify(rs.owners ?? [])) {
    diffs.push({
      field: "owners",
      label: "負責人",
      localVal: fmt(ls.owners ?? [], "owners"),
      remoteVal: fmt(rs.owners ?? [], "owners"),
    });
  }
  if (ls.manualRate !== rs.manualRate) {
    diffs.push({
      field: "manualRate",
      label: "完成率",
      localVal:
        ls.manualRate !== null && ls.manualRate !== undefined
          ? `${ls.manualRate}%`
          : "(自動計算)",
      remoteVal:
        rs.manualRate !== null && rs.manualRate !== undefined
          ? `${rs.manualRate}%`
          : "(自動計算)",
    });
  }
  if (JSON.stringify(ls.measures) !== JSON.stringify(rs.measures)) {
    diffs.push({
      field: "measures",
      label: "衡量指標",
      localVal: fmt(ls.measures, "measures"),
      remoteVal: fmt(rs.measures, "measures"),
    });
  }
  if (JSON.stringify(ls.actionPlans) !== JSON.stringify(rs.actionPlans)) {
    diffs.push({
      field: "actionPlans",
      label: "行動計畫",
      localVal: fmt(ls.actionPlans, "actionPlans"),
      remoteVal: fmt(rs.actionPlans, "actionPlans"),
    });
  }
  return diffs;
}

function goalDiffs(lg: Goal, rg: Goal): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  if (lg.title !== rg.title) {
    diffs.push({
      field: "title",
      label: "目標名稱",
      localVal: fmt(lg.title),
      remoteVal: fmt(rg.title),
    });
  }
  if (lg.fullText !== rg.fullText) {
    diffs.push({
      field: "fullText",
      label: "目標說明",
      localVal: fmt(lg.fullText),
      remoteVal: fmt(rg.fullText),
    });
  }
  return diffs;
}

function teamDiffs(lt: Team, rt: Team): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  if (lt.name !== rt.name) {
    diffs.push({
      field: "name",
      label: "團隊名稱",
      localVal: fmt(lt.name),
      remoteVal: fmt(rt.name),
    });
  }
  if (JSON.stringify(lt.members) !== JSON.stringify(rt.members)) {
    diffs.push({
      field: "members",
      label: "成員",
      localVal: fmt(lt.members, "members"),
      remoteVal: fmt(rt.members, "members"),
    });
  }
  return diffs;
}

// conflict detection

export function detectConflicts(
  local: WorkspaceData,
  remote: WorkspaceData,
): ConflictEntry[] {
  const entries: ConflictEntry[] = [];
  const deleted = new Set<string>([
    ...(local.deletedIds ?? []),
    ...(remote.deletedIds ?? []),
  ]);

  for (const ld of local.departments) {
    const rd = remote.departments.find((d) => d.id === ld.id);
    if (!rd) continue;
    for (const lp of ld.periods) {
      const rp = rd.periods.find((p) => p.id === lp.id);
      if (!rp) continue;
      const remoteGoalMap = new Map(rp.ogsm.goals.map((g) => [g.id, g]));
      for (const lg of lp.ogsm.goals) {
        if (deleted.has(lg.id)) continue;
        const rg = remoteGoalMap.get(lg.id);
        if (!rg || deleted.has(rg.id)) continue;

        if (lg.updatedAt && rg.updatedAt && lg.updatedAt !== rg.updatedAt) {
          const diffs = goalDiffs(lg, rg);
          if (diffs.length > 0) {
            entries.push({
              id: lg.id,
              entityType: "goal",
              entityLabel: `${lg.label}：${lg.title}`,
              localUpdatedAt: lg.updatedAt,
              remoteUpdatedAt: rg.updatedAt,
              fieldDiffs: diffs,
              localEntity: lg,
              remoteEntity: rg,
            });
          }
        }

        const remoteStratMap = new Map(rg.strategies.map((s) => [s.id, s]));
        for (const ls of lg.strategies) {
          if (deleted.has(ls.id)) continue;
          const rs = remoteStratMap.get(ls.id);
          if (!rs || deleted.has(rs.id)) continue;
          if (ls.updatedAt && rs.updatedAt && ls.updatedAt !== rs.updatedAt) {
            const diffs = strategyDiffs(ls, rs);
            if (diffs.length > 0) {
              entries.push({
                id: ls.id,
                entityType: "strategy",
                entityLabel: `${lg.label} > ${ls.title}`,
                localUpdatedAt: ls.updatedAt,
                remoteUpdatedAt: rs.updatedAt,
                fieldDiffs: diffs,
                localEntity: ls,
                remoteEntity: rs,
              });
            }
          }
        }
      }
    }
  }

  const remoteTeamMap = new Map((remote.teams ?? []).map((t) => [t.id, t]));
  for (const lt of local.teams ?? []) {
    if (deleted.has(lt.id)) continue;
    const rt = remoteTeamMap.get(lt.id);
    if (!rt || deleted.has(rt.id)) continue;
    if (lt.updatedAt && rt.updatedAt && lt.updatedAt !== rt.updatedAt) {
      const diffs = teamDiffs(lt, rt);
      if (diffs.length > 0) {
        entries.push({
          id: lt.id,
          entityType: "team",
          entityLabel: `團隊：${lt.name}`,
          localUpdatedAt: lt.updatedAt,
          remoteUpdatedAt: rt.updatedAt,
          fieldDiffs: diffs,
          localEntity: lt,
          remoteEntity: rt,
        });
      }
    }
  }

  return entries;
}

// helpers

function newerOf<T extends { updatedAt?: string }>(a: T, b: T): T {
  if (!a.updatedAt) return b;
  if (!b.updatedAt) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}

// array merges

function mergeStrategies(
  local: Strategy[],
  remote: Strategy[],
  deleted: Set<string>,
  resolutions?: ConflictResolutions,
): { strategies: Strategy[]; count: number } {
  const filtered = local.filter((s) => !deleted.has(s.id));
  const map = new Map<string, Strategy>(filtered.map((s) => [s.id, s]));
  let count = local.length - filtered.length; // 計入本地端因 tombstone 被刪除的項目

  for (const rs of remote) {
    if (deleted.has(rs.id)) {
      if (map.delete(rs.id)) count++;
      continue;
    }
    const ls = map.get(rs.id);
    if (!ls) {
      map.set(rs.id, rs);
      count++;
    } else {
      const res = resolutions?.[rs.id];
      if (res === "local") {
        // keep ls
      } else if (res === "remote") {
        map.set(rs.id, rs);
        count++;
      } else {
        const winner = newerOf(ls, rs);
        if (winner !== ls) {
          map.set(rs.id, winner);
          count++;
        }
      }
    }
  }

  return { strategies: Array.from(map.values()), count };
}

function mergeGoals(
  local: Goal[],
  remote: Goal[],
  deleted: Set<string>,
  resolutions?: ConflictResolutions,
): { goals: Goal[]; count: number } {
  const filtered = local.filter((g) => !deleted.has(g.id));
  const map = new Map<string, Goal>(filtered.map((g) => [g.id, g]));
  let count = local.length - filtered.length; // 計入本地端因 tombstone 被刪除的項目

  for (const rg of remote) {
    if (deleted.has(rg.id)) {
      if (map.delete(rg.id)) count++;
      continue;
    }
    const lg = map.get(rg.id);
    if (!lg) {
      map.set(rg.id, rg);
      count++;
    } else {
      const { strategies, count: sc } = mergeStrategies(
        lg.strategies,
        rg.strategies,
        deleted,
        resolutions,
      );
      const res = resolutions?.[rg.id];
      let metaWinner: Goal;
      if (res === "local") {
        metaWinner = lg;
      } else if (res === "remote") {
        metaWinner = rg;
        count++;
      } else {
        metaWinner = newerOf(lg, rg);
        if (metaWinner !== lg) count++;
      }
      const changed = sc > 0 || metaWinner !== lg;
      if (changed) {
        map.set(rg.id, { ...metaWinner, strategies });
        count += sc;
      }
    }
  }

  return { goals: Array.from(map.values()), count };
}

function mergeTeams(
  local: Team[],
  remote: Team[],
  deleted: Set<string>,
  resolutions?: ConflictResolutions,
): { teams: Team[]; count: number } {
  const filtered = local.filter((t) => !deleted.has(t.id));
  const map = new Map<string, Team>(filtered.map((t) => [t.id, t]));
  let count = local.length - filtered.length; // 計入本地端因 tombstone 被刪除的項目

  for (const rt of remote) {
    if (deleted.has(rt.id)) {
      if (map.delete(rt.id)) count++;
      continue;
    }
    const lt = map.get(rt.id);
    if (!lt) {
      map.set(rt.id, rt);
      count++;
    } else {
      const res = resolutions?.[rt.id];
      if (res === "local") {
        // keep lt
      } else if (res === "remote") {
        map.set(rt.id, rt);
        count++;
      } else {
        const winner = newerOf(lt, rt);
        if (winner !== lt) {
          map.set(rt.id, winner);
          count++;
        }
      }
    }
  }

  return { teams: Array.from(map.values()), count };
}

function mergePeriods(
  local: PeriodData[],
  remote: PeriodData[],
  deleted: Set<string>,
  resolutions?: ConflictResolutions,
): { periods: PeriodData[]; count: number } {
  const map = new Map<string, PeriodData>(local.map((p) => [p.id, p]));
  let count = 0;

  for (const rp of remote) {
    const lp = map.get(rp.id);
    if (!lp) {
      map.set(rp.id, rp);
      count++;
    } else {
      const { goals, count: gc } = mergeGoals(
        lp.ogsm.goals,
        rp.ogsm.goals,
        deleted,
        resolutions,
      );
      if (gc > 0) {
        map.set(rp.id, { ...lp, ogsm: { ...lp.ogsm, goals } });
        count += gc;
      }
    }
  }

  return { periods: Array.from(map.values()), count };
}

function mergeDepts(
  local: Department[],
  remote: Department[],
  deleted: Set<string>,
  resolutions?: ConflictResolutions,
): { departments: Department[]; count: number } {
  const map = new Map<string, Department>(local.map((d) => [d.id, d]));
  let count = 0;

  for (const rd of remote) {
    const ld = map.get(rd.id);
    if (!ld) {
      map.set(rd.id, rd);
      count++;
    } else {
      const { periods, count: pc } = mergePeriods(
        ld.periods,
        rd.periods,
        deleted,
        resolutions,
      );
      if (pc > 0) {
        map.set(rd.id, { ...ld, periods });
        count += pc;
      }
    }
  }

  return { departments: Array.from(map.values()), count };
}

// public

export function mergeWorkspaces(
  local: WorkspaceData,
  remote: WorkspaceData,
  resolutions?: ConflictResolutions,
): MergeResult {
  const deleted = new Set<string>([
    ...(local.deletedIds ?? []),
    ...(remote.deletedIds ?? []),
  ]);

  const { departments, count: dc } = mergeDepts(
    local.departments,
    remote.departments,
    deleted,
    resolutions,
  );

  const { teams, count: tc } = mergeTeams(
    local.teams ?? [],
    remote.teams ?? [],
    deleted,
    resolutions,
  );

  const workspace: WorkspaceData = {
    ...local,
    departments,
    teams,
    version: Math.max(local.version ?? 1, remote.version ?? 1),
    deletedIds: Array.from(deleted),
    _migratedPhase2:
      local._migratedPhase2 === true && remote._migratedPhase2 === true,
    _migratedPhase3:
      local._migratedPhase3 === true && remote._migratedPhase3 === true,
  };

  return { workspace, autoMerged: dc + tc };
}
