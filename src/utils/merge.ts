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
  DeptActivity,
  FreeNode,
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

/**
 * ConflictResolutions key 格式：
 *   - `"${entityId}"` → 整個實體層級覆蓋（legacy / 快捷全選）
 *   - `"${entityId}.${field}"` → 欄位層級覆蓋（細粒度決策）
 * 欄位層級 key 優先；fallback 實體層級 key；再 fallback LWW。
 */
export type ConflictResolutions = Record<string, "local" | "remote">;

/**
 * 查詢欄位層級解析結果。
 * 優先序：field-level key (`entityId.field`) > entity-level key (`entityId`) > null（由呼叫方決定 fallback）
 */
export function resolveField(
  resolutions: ConflictResolutions | undefined,
  entityId: string,
  field: string,
): "local" | "remote" | null {
  if (!resolutions) return null;
  const fieldKey = `${entityId}.${field}`;
  if (resolutions[fieldKey] !== undefined) return resolutions[fieldKey];
  const entityKey = entityId;
  if (resolutions[entityKey] !== undefined) return resolutions[entityKey];
  return null;
}

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
    if (lv === rv) continue;
    // Tombstone: 一方刻意清空、另一方有値 → 衝突
    if (isEmpty(ls[f]) && wasClearedBy(ls, f) && !isEmpty(rs[f])) {
      diffs.push({
        field: f,
        label,
        localVal: "(已清空)",
        remoteVal: fmt(rs[f]),
      });
      continue;
    }
    if (isEmpty(rs[f]) && wasClearedBy(rs, f) && !isEmpty(ls[f])) {
      diffs.push({
        field: f,
        label,
        localVal: fmt(ls[f]),
        remoteVal: "(已清空)",
      });
      continue;
    }
    // Regular: 雙方都有値且不同
    if (!isEmpty(ls[f]) && !isEmpty(rs[f])) {
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
  if (JSON.stringify(lOwners) !== JSON.stringify(rOwners)) {
    if (isEmpty(lOwners) && wasClearedBy(ls, "owners") && !isEmpty(rOwners)) {
      diffs.push({
        field: "owners",
        label: "負責人",
        localVal: "(已清空)",
        remoteVal: fmt(rOwners, "owners"),
      });
    } else if (
      isEmpty(rOwners) &&
      wasClearedBy(rs, "owners") &&
      !isEmpty(lOwners)
    ) {
      diffs.push({
        field: "owners",
        label: "負責人",
        localVal: fmt(lOwners, "owners"),
        remoteVal: "(已清空)",
      });
    } else if (!isEmpty(lOwners) && !isEmpty(rOwners)) {
      diffs.push({
        field: "owners",
        label: "負責人",
        localVal: fmt(lOwners, "owners"),
        remoteVal: fmt(rOwners, "owners"),
      });
    }
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
  // actionPlans：雙方都有資料且不同 → 列入衝突（筆數/結構差異提示）
  const lAP = ls.actionPlans ?? [];
  const rAP = rs.actionPlans ?? [];
  if (JSON.stringify(lAP) !== JSON.stringify(rAP)) {
    if (isEmpty(lAP) && wasClearedBy(ls, "actionPlans") && !isEmpty(rAP)) {
      diffs.push({
        field: "actionPlans",
        label: "季度計畫",
        localVal: "(已清空)",
        remoteVal: fmt(rAP, "actionPlans"),
      });
    } else if (
      isEmpty(rAP) &&
      wasClearedBy(rs, "actionPlans") &&
      !isEmpty(lAP)
    ) {
      diffs.push({
        field: "actionPlans",
        label: "季度計畫",
        localVal: fmt(lAP, "actionPlans"),
        remoteVal: "(已清空)",
      });
    } else if (!isEmpty(lAP) && !isEmpty(rAP)) {
      diffs.push({
        field: "actionPlans",
        label: "季度計畫",
        localVal: fmt(lAP, "actionPlans"),
        remoteVal: fmt(rAP, "actionPlans"),
      });
    }
  }
  // 注意：measures 不在此處做衝突偵測，
  // mergeMeasures 會以 Measure id + updatedAt 進行細粒度合併，不需要人工介入。
  return diffs;
}

function goalDiffs(lg: Goal, rg: Goal): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  // title
  if (lg.title !== rg.title) {
    if (isEmpty(lg.title) && wasClearedBy(lg, "title") && !isEmpty(rg.title)) {
      diffs.push({
        field: "title",
        label: "目標名稱",
        localVal: "(已清空)",
        remoteVal: fmt(rg.title),
      });
    } else if (
      isEmpty(rg.title) &&
      wasClearedBy(rg, "title") &&
      !isEmpty(lg.title)
    ) {
      diffs.push({
        field: "title",
        label: "目標名稱",
        localVal: fmt(lg.title),
        remoteVal: "(已清空)",
      });
    } else if (!isEmpty(lg.title) && !isEmpty(rg.title)) {
      diffs.push({
        field: "title",
        label: "目標名稱",
        localVal: fmt(lg.title),
        remoteVal: fmt(rg.title),
      });
    }
  }
  // fullText
  if ((lg.fullText ?? "") !== (rg.fullText ?? "")) {
    if (
      isEmpty(lg.fullText) &&
      wasClearedBy(lg, "fullText") &&
      !isEmpty(rg.fullText)
    ) {
      diffs.push({
        field: "fullText",
        label: "目標說明",
        localVal: "(已清空)",
        remoteVal: fmt(rg.fullText),
      });
    } else if (
      isEmpty(rg.fullText) &&
      wasClearedBy(rg, "fullText") &&
      !isEmpty(lg.fullText)
    ) {
      diffs.push({
        field: "fullText",
        label: "目標說明",
        localVal: fmt(lg.fullText),
        remoteVal: "(已清空)",
      });
    } else if (!isEmpty(lg.fullText) && !isEmpty(rg.fullText)) {
      diffs.push({
        field: "fullText",
        label: "目標說明",
        localVal: fmt(lg.fullText),
        remoteVal: fmt(rg.fullText),
      });
    }
  }
  // goalKpis
  const lgKpis = lg.goalKpis ?? [];
  const rgKpis = rg.goalKpis ?? [];
  if (JSON.stringify(lgKpis) !== JSON.stringify(rgKpis)) {
    if (isEmpty(lgKpis) && wasClearedBy(lg, "goalKpis") && !isEmpty(rgKpis)) {
      diffs.push({
        field: "goalKpis",
        label: "KPI 設計",
        localVal: "(已清空)",
        remoteVal: `${rgKpis.length} 層 KPI`,
      });
    } else if (
      isEmpty(rgKpis) &&
      wasClearedBy(rg, "goalKpis") &&
      !isEmpty(lgKpis)
    ) {
      diffs.push({
        field: "goalKpis",
        label: "KPI 設計",
        localVal: `${lgKpis.length} 層 KPI`,
        remoteVal: "(已清空)",
      });
    } else if (!isEmpty(lgKpis) && !isEmpty(rgKpis)) {
      diffs.push({
        field: "goalKpis",
        label: "KPI 設計",
        localVal: `${lgKpis.length} 層 KPI`,
        remoteVal: `${rgKpis.length} 層 KPI`,
      });
    }
  }
  return diffs;
}

function teamDiffs(lt: Team, rt: Team): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  // name
  if (lt.name !== rt.name) {
    if (isEmpty(lt.name) && wasClearedBy(lt, "name") && !isEmpty(rt.name)) {
      diffs.push({
        field: "name",
        label: "團隊名稱",
        localVal: "(已清空)",
        remoteVal: fmt(rt.name),
      });
    } else if (
      isEmpty(rt.name) &&
      wasClearedBy(rt, "name") &&
      !isEmpty(lt.name)
    ) {
      diffs.push({
        field: "name",
        label: "團隊名稱",
        localVal: fmt(lt.name),
        remoteVal: "(已清空)",
      });
    } else if (!isEmpty(lt.name) && !isEmpty(rt.name)) {
      diffs.push({
        field: "name",
        label: "團隊名稱",
        localVal: fmt(lt.name),
        remoteVal: fmt(rt.name),
      });
    }
  }
  // members
  const lMembers = lt.members ?? [];
  const rMembers = rt.members ?? [];
  if (JSON.stringify(lMembers) !== JSON.stringify(rMembers)) {
    if (
      isEmpty(lMembers) &&
      wasClearedBy(lt, "members") &&
      !isEmpty(rMembers)
    ) {
      diffs.push({
        field: "members",
        label: "成員",
        localVal: "(已清空)",
        remoteVal: fmt(rMembers, "members"),
      });
    } else if (
      isEmpty(rMembers) &&
      wasClearedBy(rt, "members") &&
      !isEmpty(lMembers)
    ) {
      diffs.push({
        field: "members",
        label: "成員",
        localVal: fmt(lMembers, "members"),
        remoteVal: "(已清空)",
      });
    } else if (!isEmpty(lMembers) && !isEmpty(rMembers)) {
      diffs.push({
        field: "members",
        label: "成員",
        localVal: fmt(lMembers, "members"),
        remoteVal: fmt(rMembers, "members"),
      });
    }
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
          // goalDiffs 已包含 title / fullText / goalKpis（含 tombstone 判斷）
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
 * Tombstone helper: 檢查實體是否刻意清空了某個欄位。
 * 如果是，空値就是「有意義的清空」而非「未填寫」。
 */
function wasClearedBy(
  entity: { clearedFields?: string[] },
  field: string,
): boolean {
  return entity.clearedFields?.includes(field) ?? false;
}

/**
 * Tombstone 追蹤：比對前後實體，自動維護 clearedFields 陣列。
 * - 前後有値 → 無値：將 field 加入 clearedFields
 * - 前後均有値 / 無値 → 有値：從 clearedFields 移除
 * - 前後均無値：不修改（從未填寫，不計入 tombstone）
 */
export function trackClearedFields<T extends { clearedFields?: string[] }>(
  prev: T,
  next: T,
  fields: (keyof T & string)[],
): T {
  const cleared = new Set(next.clearedFields ?? []);
  for (const field of fields) {
    const prevEmpty = isEmpty(prev[field as keyof T]);
    const nextEmpty = isEmpty(next[field as keyof T]);
    if (!prevEmpty && nextEmpty) {
      cleared.add(field); // 使用者刻意清空
    } else if (!nextEmpty) {
      cleared.delete(field); // 使用者填入了值，不再視為刻意清空
    }
  }
  return {
    ...next,
    clearedFields: cleared.size > 0 ? Array.from(cleared) : undefined,
  };
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
  entityId?: string,
  resolutions?: ConflictResolutions,
): { merged: Strategy; changed: boolean } {
  const winner = newerOf(ls, rs);
  const merged: Strategy = { ...ls };
  let changed = false;

  // helper: 查欄位解析，fallback LWW
  function pick<T>(field: string, localVal: T, remoteVal: T): T {
    if (entityId) {
      const r = resolveField(resolutions, entityId, field);
      if (r === "local") return localVal;
      if (r === "remote") return remoteVal;
    }
    // LWW fallback
    return winner === rs ? remoteVal : localVal;
  }

  // title
  if ((ls.title ?? "") !== (rs.title ?? "")) {
    if (isEmpty(ls.title) && !isEmpty(rs.title)) {
      if (wasClearedBy(ls, "title")) {
        merged.title = pick("title", ls.title, rs.title);
        if (merged.title !== ls.title) changed = true;
      } else {
        merged.title = rs.title;
        changed = true;
      }
    } else if (!isEmpty(ls.title) && isEmpty(rs.title)) {
      if (wasClearedBy(rs, "title")) {
        const picked = pick("title", ls.title, rs.title);
        if (picked !== ls.title) {
          merged.title = picked;
          changed = true;
        }
      }
    } else if (!isEmpty(ls.title) && !isEmpty(rs.title)) {
      merged.title = pick("title", ls.title, rs.title);
      if (merged.title !== ls.title) changed = true;
    }
  }

  // notes
  if ((ls.notes ?? "") !== (rs.notes ?? "")) {
    if (isEmpty(ls.notes) && !isEmpty(rs.notes)) {
      if (wasClearedBy(ls, "notes")) {
        merged.notes = pick("notes", ls.notes, rs.notes);
        if (merged.notes !== ls.notes) changed = true;
      } else {
        merged.notes = rs.notes;
        changed = true;
      }
    } else if (!isEmpty(ls.notes) && isEmpty(rs.notes)) {
      if (wasClearedBy(rs, "notes")) {
        merged.notes = pick("notes", ls.notes, rs.notes);
        if (merged.notes !== ls.notes) changed = true;
      }
    } else if (!isEmpty(ls.notes) && !isEmpty(rs.notes)) {
      merged.notes = pick("notes", ls.notes, rs.notes);
      if (merged.notes !== ls.notes) changed = true;
    }
  }

  // owners
  const lOwners = ls.owners ?? [];
  const rOwners = rs.owners ?? [];
  if (JSON.stringify(lOwners) !== JSON.stringify(rOwners)) {
    if (isEmpty(lOwners) && !isEmpty(rOwners)) {
      if (wasClearedBy(ls, "owners")) {
        merged.owners = pick("owners", lOwners, rOwners);
        if (merged.owners !== lOwners) changed = true;
      } else {
        merged.owners = rOwners;
        changed = true;
      }
    } else if (!isEmpty(lOwners) && isEmpty(rOwners)) {
      if (wasClearedBy(rs, "owners")) {
        merged.owners = pick("owners", lOwners, rOwners);
        if (merged.owners !== lOwners) changed = true;
      }
    } else if (!isEmpty(lOwners) && !isEmpty(rOwners)) {
      merged.owners = pick("owners", lOwners, rOwners);
      if (merged.owners !== lOwners) changed = true;
    }
  }

  // manualRate
  if (ls.manualRate !== rs.manualRate) {
    if (isEmpty(ls.manualRate) && !isEmpty(rs.manualRate)) {
      merged.manualRate = rs.manualRate;
      changed = true;
    } else if (!isEmpty(ls.manualRate) && !isEmpty(rs.manualRate)) {
      merged.manualRate = pick("manualRate", ls.manualRate, rs.manualRate);
      if (merged.manualRate !== ls.manualRate) changed = true;
    }
  }

  // actionPlans
  const lAP = ls.actionPlans ?? [];
  const rAP = rs.actionPlans ?? [];
  if (JSON.stringify(lAP) !== JSON.stringify(rAP)) {
    if (isEmpty(lAP) && !isEmpty(rAP)) {
      if (wasClearedBy(ls, "actionPlans")) {
        merged.actionPlans = pick("actionPlans", lAP, rAP);
        if (merged.actionPlans !== lAP) changed = true;
      } else {
        merged.actionPlans = rAP;
        changed = true;
      }
    } else if (!isEmpty(lAP) && isEmpty(rAP)) {
      if (wasClearedBy(rs, "actionPlans")) {
        merged.actionPlans = pick("actionPlans", lAP, rAP);
        if (merged.actionPlans !== lAP) changed = true;
      }
    } else if (!isEmpty(lAP) && !isEmpty(rAP)) {
      merged.actionPlans = pick("actionPlans", lAP, rAP);
      if (merged.actionPlans !== lAP) changed = true;
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
  entityId?: string,
  resolutions?: ConflictResolutions,
): { merged: Goal; changed: boolean } {
  const winner = newerOf(lg, rg);
  const merged: Goal = { ...lg };
  let changed = false;

  function pick<T>(field: string, localVal: T, remoteVal: T): T {
    if (entityId) {
      const r = resolveField(resolutions, entityId, field);
      if (r === "local") return localVal;
      if (r === "remote") return remoteVal;
    }
    return winner === rg ? remoteVal : localVal;
  }

  if ((lg.title ?? "") !== (rg.title ?? "")) {
    if (isEmpty(lg.title) && !isEmpty(rg.title)) {
      if (wasClearedBy(lg, "title")) {
        merged.title = pick("title", lg.title, rg.title);
        if (merged.title !== lg.title) changed = true;
      } else {
        merged.title = rg.title;
        changed = true;
      }
    } else if (!isEmpty(lg.title) && isEmpty(rg.title)) {
      if (wasClearedBy(rg, "title")) {
        merged.title = pick("title", lg.title, rg.title);
        if (merged.title !== lg.title) changed = true;
      }
    } else if (!isEmpty(lg.title) && !isEmpty(rg.title)) {
      merged.title = pick("title", lg.title, rg.title);
      if (merged.title !== lg.title) changed = true;
    }
  }

  if ((lg.fullText ?? "") !== (rg.fullText ?? "")) {
    if (isEmpty(lg.fullText) && !isEmpty(rg.fullText)) {
      if (wasClearedBy(lg, "fullText")) {
        merged.fullText = pick("fullText", lg.fullText, rg.fullText);
        if (merged.fullText !== lg.fullText) changed = true;
      } else {
        merged.fullText = rg.fullText;
        changed = true;
      }
    } else if (!isEmpty(lg.fullText) && isEmpty(rg.fullText)) {
      if (wasClearedBy(rg, "fullText")) {
        merged.fullText = pick("fullText", lg.fullText, rg.fullText);
        if (merged.fullText !== lg.fullText) changed = true;
      }
    } else if (!isEmpty(lg.fullText) && !isEmpty(rg.fullText)) {
      merged.fullText = pick("fullText", lg.fullText, rg.fullText);
      if (merged.fullText !== lg.fullText) changed = true;
    }
  }

  if (rg.updatedAt && (!lg.updatedAt || rg.updatedAt > lg.updatedAt)) {
    merged.updatedAt = rg.updatedAt;
  }

  // goalKpis
  const lgKpis = lg.goalKpis ?? [];
  const rgKpis = rg.goalKpis ?? [];
  if (JSON.stringify(lgKpis) !== JSON.stringify(rgKpis)) {
    if (isEmpty(lgKpis) && !isEmpty(rgKpis)) {
      if (wasClearedBy(lg, "goalKpis")) {
        merged.goalKpis = pick("goalKpis", lgKpis, rgKpis);
        if (merged.goalKpis !== lgKpis) changed = true;
      } else {
        merged.goalKpis = rgKpis;
        changed = true;
      }
    } else if (!isEmpty(lgKpis) && isEmpty(rgKpis)) {
      if (wasClearedBy(rg, "goalKpis")) {
        merged.goalKpis = pick("goalKpis", lgKpis, rgKpis);
        if (merged.goalKpis !== lgKpis) changed = true;
      }
    } else if (!isEmpty(lgKpis) && !isEmpty(rgKpis)) {
      merged.goalKpis = pick("goalKpis", lgKpis, rgKpis);
      if (merged.goalKpis !== lgKpis) changed = true;
    }
  }

  return { merged, changed };
}

/** Team 欄位級別合併，同 fieldMergeStrategy 邏輯。 */
function fieldMergeTeam(
  lt: Team,
  rt: Team,
  entityId?: string,
  resolutions?: ConflictResolutions,
): { merged: Team; changed: boolean } {
  const winner = newerOf(lt, rt);
  const merged: Team = { ...lt };
  let changed = false;

  function pick<T>(field: string, localVal: T, remoteVal: T): T {
    if (entityId) {
      const r = resolveField(resolutions, entityId, field);
      if (r === "local") return localVal;
      if (r === "remote") return remoteVal;
    }
    return winner === rt ? remoteVal : localVal;
  }

  if ((lt.name ?? "") !== (rt.name ?? "")) {
    if (isEmpty(lt.name) && !isEmpty(rt.name)) {
      if (wasClearedBy(lt, "name")) {
        merged.name = pick("name", lt.name, rt.name);
        if (merged.name !== lt.name) changed = true;
      } else {
        merged.name = rt.name;
        changed = true;
      }
    } else if (!isEmpty(lt.name) && isEmpty(rt.name)) {
      if (wasClearedBy(rt, "name")) {
        merged.name = pick("name", lt.name, rt.name);
        if (merged.name !== lt.name) changed = true;
      }
    } else if (!isEmpty(lt.name) && !isEmpty(rt.name)) {
      merged.name = pick("name", lt.name, rt.name);
      if (merged.name !== lt.name) changed = true;
    }
  }

  const lMembers = lt.members ?? [];
  const rMembers = rt.members ?? [];
  if (JSON.stringify(lMembers) !== JSON.stringify(rMembers)) {
    if (isEmpty(lMembers) && !isEmpty(rMembers)) {
      if (wasClearedBy(lt, "members")) {
        merged.members = pick("members", lMembers, rMembers);
        if (merged.members !== lMembers) changed = true;
      } else {
        merged.members = rMembers;
        changed = true;
      }
    } else if (!isEmpty(lMembers) && isEmpty(rMembers)) {
      if (wasClearedBy(rt, "members")) {
        merged.members = pick("members", lMembers, rMembers);
        if (merged.members !== lMembers) changed = true;
      }
    } else if (!isEmpty(lMembers) && !isEmpty(rMembers)) {
      merged.members = pick("members", lMembers, rMembers);
      if (merged.members !== lMembers) changed = true;
    }
  }

  if (rt.updatedAt && (!lt.updatedAt || rt.updatedAt > lt.updatedAt)) {
    merged.updatedAt = rt.updatedAt;
  }

  return { merged, changed };
}

// DeptActivity 層級合併：逐筆 by id + newerOf updatedAt（同 Measure 邏輯）
function mergeDeptActivities(
  local: DeptActivity[],
  remote: DeptActivity[],
  deleted: Set<string>,
): { activities: DeptActivity[]; count: number } {
  const safeLocal = local ?? [];
  const filtered = safeLocal.filter((a) => !deleted.has(a.id));
  const map = new Map<string, DeptActivity>(filtered.map((a) => [a.id, a]));
  let count = safeLocal.length - filtered.length;

  for (const ra of remote ?? []) {
    if (deleted.has(ra.id)) {
      if (map.delete(ra.id)) count++;
      continue;
    }
    const la = map.get(ra.id);
    if (!la) {
      map.set(ra.id, ra);
      count++;
    } else {
      const winner = newerOf(la, ra);
      if (winner !== la) {
        map.set(ra.id, winner);
        count++;
      }
    }
  }

  return { activities: Array.from(map.values()), count };
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
        const fm = fieldMergeStrategy(ls, rs, rs.id, resolutions);
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
        const fm = fieldMergeGoal(lg, rg, rg.id, resolutions);
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
        const fm = fieldMergeTeam(lt, rt, rt.id, resolutions);
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
      // freeNodes: union by id，同 id 遠端版優先（FreeNode 無 updatedAt）
      const lfn = lp.ogsm.freeNodes ?? [];
      const rfn = rp.ogsm.freeNodes ?? [];
      const fnMap = new Map<string, FreeNode>(lfn.map((n) => [n.id, n]));
      let fnCount = 0;
      for (const rn of rfn) {
        if (!fnMap.has(rn.id)) {
          fnMap.set(rn.id, rn);
          fnCount++;
        } else if (JSON.stringify(fnMap.get(rn.id)) !== JSON.stringify(rn)) {
          fnMap.set(rn.id, rn);
          fnCount++;
        }
      }
      const mergedFreeNodes = Array.from(fnMap.values());
      const totalCount = gc + fnCount;
      if (totalCount > 0) {
        map.set(rp.id, {
          ...lp,
          ogsm: { ...lp.ogsm, goals, freeNodes: mergedFreeNodes },
        });
        count += totalCount;
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
      const { activities: mergedActivities, count: ac } = mergeDeptActivities(
        ld.activities ?? [],
        rd.activities ?? [],
        deleted,
      );
      const totalCount = pc + ac;
      if (totalCount > 0) {
        map.set(rd.id, { ...ld, periods, activities: mergedActivities });
        count += totalCount;
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
