import type { Team } from "../schemas/ogsm";

export interface DeptTeamsEntry {
  workspace: {
    departments: Array<{ id: string }>;
    teams?: Team[];
  };
}

export type TrackTeamClearedFields = (
  prev: Team,
  next: Team,
  fields: (keyof Team & string)[],
) => Team;

interface GetDeptScopedTeamsArgs {
  isMultiFileMode: boolean;
  activeDeptId: string;
  deptEntries: DeptTeamsEntry[];
  workspaceTeams?: Team[];
}

export function getDeptScopedTeams({
  isMultiFileMode,
  activeDeptId,
  deptEntries,
  workspaceTeams,
}: GetDeptScopedTeamsArgs): Team[] {
  if (isMultiFileMode) {
    const activeEntry =
      deptEntries.find(
        (f) => f.workspace.departments[0]?.id === activeDeptId,
      ) ?? deptEntries[0];
    const scopedDeptId =
      activeEntry?.workspace.departments[0]?.id ?? activeDeptId;
    const sourceTeams = activeEntry?.workspace.teams ?? [];
    return sourceTeams.filter((t) => !t.deptId || t.deptId === scopedDeptId);
  }

  return (workspaceTeams ?? []).filter(
    (t) => !t.deptId || t.deptId === activeDeptId,
  );
}

interface NormalizeTeamsForDeptArgs {
  inputTeams: Team[];
  deptId: string;
  prevTeams: Team[];
  nowIso: string;
  trackClearedFields: TrackTeamClearedFields;
}

export function normalizeTeamsForDept({
  inputTeams,
  deptId,
  prevTeams,
  nowIso,
  trackClearedFields,
}: NormalizeTeamsForDeptArgs): Team[] {
  const prevById = new Map(prevTeams.map((t) => [t.id, t]));

  return inputTeams.map((team) => {
    const normalized: Team = { ...team, deptId };
    const prevTeam = prevById.get(team.id);

    if (!prevTeam || JSON.stringify(prevTeam) !== JSON.stringify(normalized)) {
      const tracked = prevTeam
        ? trackClearedFields(prevTeam, normalized, ["name", "members"])
        : normalized;
      return { ...tracked, updatedAt: nowIso };
    }

    return normalized;
  });
}

interface MergeTeamsForDeptInSingleWorkspaceArgs {
  existingTeams: Team[];
  deptId: string;
  nextTeams: Team[];
  nowIso: string;
  trackClearedFields: TrackTeamClearedFields;
}

export function mergeTeamsForDeptInSingleWorkspace({
  existingTeams,
  deptId,
  nextTeams,
  nowIso,
  trackClearedFields,
}: MergeTeamsForDeptInSingleWorkspaceArgs): Team[] {
  const otherDeptTeams = existingTeams.filter(
    (t) => t.deptId && t.deptId !== deptId,
  );
  const prevDeptTeams = existingTeams.filter(
    (t) => !t.deptId || t.deptId === deptId,
  );
  const stamped = normalizeTeamsForDept({
    inputTeams: nextTeams,
    deptId,
    prevTeams: prevDeptTeams,
    nowIso,
    trackClearedFields,
  });
  return [...otherDeptTeams, ...stamped];
}
