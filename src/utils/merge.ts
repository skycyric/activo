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
  Measure,
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
    const lv = String(ls[f] ?? "");
    const rv = String(rs[f] ?? "");
    // 只有雙方都有值且不同，才視為真實衝突；一方為空代表「未填寫」，由合併函數自動選非空方
    if (lv !== rv && !isEmpty(ls[f]) && !isEmpty(rs[f])) {
      diffs.push({
        field: f,
        label,
        localVal: fmt(ls[f]),
        remoteVal: fmt(rs[f]),
      });
    }
  }
  const lOwners = ls.owners ?? [];
  const rOwners = rs.owners ?? [];
  if (
    JSON.stringify(lOwners) !== JSON.stringify(rOwners) &&
    !isEmpty(lOwners) &&
    !isEmpty(rOwners)
  ) {
    diffs.push({
      field: "owners",
      label: "負責人",
      localVal: fmt(lOwners, "owners"),
      remoteVal: fmt(rOwners, "owners"),
    });
  }
  if (
    ls.manualRate !== rs.manualRate &&
    !isEmpty(ls.manualRate) &&
    !isEmpty(rs.manualRate)
  ) {
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
  // 注意：measures 和 actionPlans 不在此處做衝突偵測，
  // mergeMeasures 會以 Measure id + updatedAt 進行細粒度合併，不需要人工介入。
  return diffs;
}

function goalDiffs(lg: Goal, rg: Goal): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  if (lg.title !== rg.title && !isEmpty(lg.title) && !isEmpty(rg.title)) {
    diffs.push({
      field: "title",
      label: "目標名稱",
      localVal: fmt(lg.title),
      remoteVal: fmt(rg.title),
    });
  }
  if (
    (lg.fullText ?? "") !== (rg.fullText ?? "") &&
    !isEmpty(lg.fullText) &&
    !isEmpty(rg.fullText)
  ) {
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
  if (lt.name !== rt.name && !isEmpty(lt.name) && !isEmpty(rt.name)) {
    diffs.push({
      field: "name",
      label: "團隊名稱",
      localVal: fmt(lt.name),
      remoteVal: fmt(rt.name),
    });
  }
  const lMembers = lt.members ?? [];
  const rMembers = rt.members ?? [];
  if (
    JSON.stringify(lMembers) !== JSON.stringify(rMembers) &&
    !isEmpty(lMembers) &&
    !isEmpty(rMembers)
  ) {
    diffs.push({
      field: "members",
      label: "成員",
      localVal: fmt(lMembers, "members"),
      remoteVal: fmt(rMembers, "members"),
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

/**
 * 空值判斷：null / undefined / "" / 空白字串 / 空陣列 → 視為「未填寫」。
 * 0 與 false 不視為空值（是使用者明確設定的值）。
 */
function isEmpty(val: unknown): boolean {
  if (val === null || val === undefined) return true;
  if (typeof val === "string") return val.trim() === "";
  if (Array.isArray(val)) return val.length === 0;
  return false;
}

/**
 * Strategy 欄位級別合併（Field-Level Merge）。
 * 規則：
 *   - 一方空值、另一方有值  → 自動採非空方（不計入衝突）
 *   - 雙方皆有值且不同       → Last-Write-Wins（updatedAt 較新者優先）
 *   - 雙方值相同             → 無變化
 * updatedAt 取兩者最大值，確保合併結果代表最新已知狀態。
 */
function fieldMergeStrategy(
  ls: Strategy,
  rs: Strategy,
): { merged: Strategy; changed: boolean } {
  const winner = newerOf(ls, rs);
  const merged: Strategy = { ...ls };
  let changed = false;

  // title
  if ((ls.title ?? "") !== (rs.title ?? "")) {
    if (isEmpty(ls.title) && !isEmpty(rs.title)) {
      merged.title = rs.title;
      changed = true;
    } else if (!isEmpty(ls.title) && !isEmpty(rs.title) && winner === rs) {
      merged.title = rs.title;
      changed = true;
    }
  }

  // notes
  if ((ls.notes ?? "") !== (rs.notes ?? "")) {
    if (isEmpty(ls.notes) && !isEmpty(rs.notes)) {
      merged.notes = rs.notes;
      changed = true;
    } else if (!isEmpty(ls.notes) && !isEmpty(rs.notes) && winner === rs) {
      merged.notes = rs.notes;
      changed = true;
    }
  }

  // owners：空陣列視為「未指定」
  const lOwners = ls.owners ?? [];
  const rOwners = rs.owners ?? [];
  if (JSON.stringify(lOwners) !== JSON.stringify(rOwners)) {
    if (isEmpty(lOwners) && !isEmpty(rOwners)) {
      merged.owners = rOwners;
      changed = true;
    } else if (!isEmpty(lOwners) && !isEmpty(rOwners) && winner === rs) {
      merged.owners = rOwners;
      changed = true;
    }
  }

  // manualRate：null 視為「使用自動計算」
  if (ls.manualRate !== rs.manualRate) {
    if (isEmpty(ls.manualRate) && !isEmpty(rs.manualRate)) {
      merged.manualRate = rs.manualRate;
      changed = true;
    } else if (
      !isEmpty(ls.manualRate) &&
      !isEmpty(rs.manualRate) &&
      winner === rs
    ) {
      merged.manualRate = rs.manualRate;
      changed = true;
    }
  }

  // actionPlans：空陣列視為「尚未建立」，有資料則以 LWW 決定
  const lAP = ls.actionPlans ?? [];
  const rAP = rs.actionPlans ?? [];
  if (JSON.stringify(lAP) !== JSON.stringify(rAP)) {
    if (isEmpty(lAP) && !isEmpty(rAP)) {
      merged.actionPlans = rAP;
      changed = true;
    } else if (!isEmpty(lAP) && !isEmpty(rAP) && winner === rs) {
      merged.actionPlans = rAP;
      changed = true;
    }
  }

  // updatedAt：取兩者最大值
  if (rs.updatedAt && (!ls.updatedAt || rs.updatedAt > ls.updatedAt)) {
    merged.updatedAt = rs.updatedAt;
  }

  return { merged, changed };
}

/** Goal 欄位級別合併，同 fieldMergeStrategy 邏輯。 */
function fieldMergeGoal(
  lg: Goal,
  rg: Goal,
): { merged: Goal; changed: boolean } {
  const winner = newerOf(lg, rg);
  const merged: Goal = { ...lg };
  let changed = false;

  if ((lg.title ?? "") !== (rg.title ?? "")) {
    if (isEmpty(lg.title) && !isEmpty(rg.title)) {
      merged.title = rg.title;
      changed = true;
    } else if (!isEmpty(lg.title) && !isEmpty(rg.title) && winner === rg) {
      merged.title = rg.title;
      changed = true;
    }
  }

  if ((lg.fullText ?? "") !== (rg.fullText ?? "")) {
    if (isEmpty(lg.fullText) && !isEmpty(rg.fullText)) {
      merged.fullText = rg.fullText;
      changed = true;
    } else if (!isEmpty(lg.fullText) && !isEmpty(rg.fullText) && winner === rg) {
      merged.fullText = rg.fullText;
      changed = true;
    }
  }

  if (rg.updatedAt && (!lg.updatedAt || rg.updatedAt > lg.updatedAt)) {
    merged.updatedAt = rg.updatedAt;
  }

  return { merged, changed };
}

/** Team 欄位級別合併，同 fieldMergeStrategy 邏輯。 */
function fieldMergeTeam(
  lt: Team,
  rt: Team,
): { merged: Team; changed: boolean } {
  const winner = newerOf(lt, rt);
  const merged: Team = { ...lt };
  let changed = false;

  if ((lt.name ?? "") !== (rt.name ?? "")) {
    if (isEmpty(lt.name) && !isEmpty(rt.name)) {
      merged.name = rt.name;
      changed = true;
    } else if (!isEmpty(lt.name) && !isEmpty(rt.name) && winner === rt) {
      merged.name = rt.name;
      changed = true;
    }
  }

  const lMembers = lt.members ?? [];
  const rMembers = rt.members ?? [];
  if (JSON.stringify(lMembers) !== JSON.stringify(rMembers)) {
    if (isEmpty(lMembers) && !isEmpty(rMembers)) {
      merged.members = rMembers;
      changed = true;
    } else if (!isEmpty(lMembers) && !isEmpty(rMembers) && winner === rt) {
      merged.members = rMembers;
      changed = true;
    }
  }

  if (rt.updatedAt && (!lt.updatedAt || rt.updatedAt > lt.updatedAt)) {
    merged.updatedAt = rt.updatedAt;
  }

  return { merged, changed };
}

// Measure 層級合併：逐筆 by id，newerOf per measure
// 無論哪一方的 Strategy metadata 取勝，雙方各自修改的 Measure 都會被保留
function mergeMeasures(
  local: Measure[],
  remote: Measure[],
  deleted: Set<string>,
): { measures: Measure[]; count: number } {
  const filtered = local.filter((m) => !deleted.has(m.id));
  const map = new Map<string, Measure>(filtered.map((m) => [m.id, m]));
  let count = local.length - filtered.length;

  for (const rm of remote) {
    if (deleted.has(rm.id)) {
      if (map.delete(rm.id)) count++;
      continue;
    }
    const lm = map.get(rm.id);
    if (!lm) {
      map.set(rm.id, rm);
      count++;
    } else {
      const winner = newerOf(lm, rm);
      if (winner !== lm) {
        map.set(rm.id, winner);
        count++;
      }
    }
  }

  return { measures: Array.from(map.values()), count };
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
      // 先進行 Measure 層級合併（細粒度 by id + updatedAt）
      // 不管 Strategy metadata 哪方勝出，雙方各自修改的 Measure 都會完整保留
      const { measures: mergedMeasures, count: mc } = mergeMeasures(
        ls.measures,
        rs.measures,
        deleted,
      );

      // Strategy metadata（title / notes / owners / manualRate / actionPlans）
      // 欄位級別合併：空値自動採非空方，雙方皆有値則 LWW；使用者手動解決時採整體覆蓋
      const res = resolutions?.[rs.id];
      let mergedStratMeta: Strategy;
      let metaChanged = false;
      if (res === "local") {
        mergedStratMeta = ls;
      } else if (res === "remote") {
        mergedStratMeta = rs;
        metaChanged = true;
      } else {
        const fm = fieldMergeStrategy(ls, rs);
        mergedStratMeta = fm.merged;
        metaChanged = fm.changed;
      }

      if (metaChanged || mc > 0) {
        map.set(rs.id, { ...mergedStratMeta, measures: mergedMeasures });
        if (metaChanged) count++;
        count += mc;
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
      let mergedGoalMeta: Goal;
      let metaIsChanged = false;
      if (res === "local") {
        mergedGoalMeta = lg;
      } else if (res === "remote") {
        mergedGoalMeta = rg;
        metaIsChanged = true;
        count++;
      } else {
        const fm = fieldMergeGoal(lg, rg);
        mergedGoalMeta = fm.merged;
        metaIsChanged = fm.changed;
        if (metaIsChanged) count++;
      }
      const changed = sc > 0 || metaIsChanged;
      if (changed) {
        map.set(rg.id, { ...mergedGoalMeta, strategies });
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
        const fm = fieldMergeTeam(lt, rt);
        if (fm.changed) {
          map.set(rt.id, fm.merged);
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
