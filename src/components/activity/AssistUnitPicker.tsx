import { useState } from "react";
import type { WorkspaceData, AssistUnit } from "../../schemas/ogsm";

interface Props {
  workspace: WorkspaceData;
  value: AssistUnit[];
  onChange: (units: AssistUnit[]) => void;
  /** Extra CSS class applied to each <select> */
  selectClassName?: string;
}

export default function AssistUnitPicker({
  workspace,
  value,
  onChange,
  selectClassName,
}: Props) {
  const [selectedDeptId, setSelectedDeptId] = useState("");

  const departments = workspace.departments;
  const allTeams = workspace.teams ?? [];

  // Teams in selected dept (or unassigned/legacy teams) that have not already been picked
  const teamsInDept = allTeams.filter(
    (t) =>
      (t.deptId === selectedDeptId || (!t.deptId && !!selectedDeptId)) &&
      !value.some((u) => u.id === t.id),
  );

  const handleTeamSelect = (teamId: string) => {
    if (!teamId) return;
    const team = allTeams.find((t) => t.id === teamId);
    if (!team) return;
    onChange([...value, { type: "team", id: team.id, name: team.name }]);
    // Keep dept selected so user can add more teams from same dept
  };

  const selectCls = `owner-picker-select${selectClassName ? " " + selectClassName : ""}`;

  return (
    <div className="aup-cascading">
      {/* Chips row */}
      {value.length > 0 && (
        <div className="aup-chips-row">
          {value.map((u) => (
            <span key={u.id} className={`aup-chip aup-chip-${u.type}`}>
              <span className="aup-chip-label">{u.name}</span>
              <button
                type="button"
                className="aup-chip-remove"
                onClick={() => onChange(value.filter((x) => x.id !== u.id))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Step 1: select department */}
      <select
        className={selectCls}
        value={selectedDeptId}
        onChange={(e) => setSelectedDeptId(e.target.value)}
      >
        <option value="">— 選擇部門 —</option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>

      {/* Step 2: select team (only shown when dept is selected) */}
      {selectedDeptId && (
        <select
          className={selectCls}
          value=""
          onChange={(e) => handleTeamSelect(e.target.value)}
        >
          <option value="">— 選擇協助團隊 —</option>
          {teamsInDept.length === 0 ? (
            <option disabled value="">
              （此部門無可選團隊）
            </option>
          ) : (
            teamsInDept.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))
          )}
        </select>
      )}
    </div>
  );
}
