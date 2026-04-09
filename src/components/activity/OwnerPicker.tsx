import { useState, useEffect } from "react";
import type { WorkspaceData } from "../../schemas/ogsm";

interface Props {
  workspace: WorkspaceData;
  /** 目前選定的主責名稱（空字串 = 未選） */
  value: string;
  onChange: (name: string) => void;
  /** 套用在每個 <select> 上的額外 CSS class */
  selectClassName?: string;
}

export default function OwnerPicker({
  workspace,
  value,
  onChange,
  selectClassName,
}: Props) {
  const departments = workspace.departments;
  const teams = workspace.teams ?? [];

  // 反查：由 owner name 找所屬 team，再找 deptId
  const findTeamId = (name: string) =>
    teams.find((t) => t.members.some((m) => m.name === name))?.id ?? "";
  const findDeptId = (name: string) => {
    const teamId = findTeamId(name);
    return teams.find((t) => t.id === teamId)?.deptId ?? "";
  };

  const [selDeptId, setSelDeptId] = useState(() => findDeptId(value));
  const [selTeamId, setSelTeamId] = useState(() => findTeamId(value));

  // 當外部 value 改變時（openEdit 帶入舊值）重新反查
  // value="" 表示使用者正在中途選取（由我們自己的 onChange("") 觸發），不重置本地狀態
  useEffect(() => {
    if (!value) return;
    setSelDeptId(findDeptId(value));
    setSelTeamId(findTeamId(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Teams that belong to this dept, OR have no dept assigned (legacy / unassigned)
  const deptTeams = teams.filter(
    (t) => t.deptId === selDeptId || (!t.deptId && !!selDeptId),
  );
  const selTeam = teams.find((t) => t.id === selTeamId);

  const selectCls = `owner-picker-select${selectClassName ? " " + selectClassName : ""}`;

  return (
    <div className="owner-picker">
      {/* 第一層：選部門 */}
      <select
        className={selectCls}
        value={selDeptId}
        onChange={(e) => {
          setSelDeptId(e.target.value);
          setSelTeamId("");
          onChange("");
        }}
      >
        <option value=""> 選擇部門 </option>
        {departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>

      {/* 第二層：選團隊（選好部門才出現） */}
      {selDeptId && (
        <select
          className={selectCls}
          value={selTeamId}
          onChange={(e) => {
            setSelTeamId(e.target.value);
            onChange("");
          }}
        >
          <option value=""> 選擇團隊 </option>
          {deptTeams.length === 0 ? (
            <option disabled value="">
              （此部門尚無團隊）
            </option>
          ) : (
            deptTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))
          )}
        </select>
      )}

      {/* 第三層：選人員（選好團隊才出現，或已有反查到 teamId 但 dept 未設定時也顯示） */}
      {selTeamId && (
        <select
          className={selectCls}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value=""> 選擇主責 </option>
          {selTeam?.members.map((m) => (
            <option key={m.id} value={m.name}>
              {m.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
