import { useState, useEffect } from "react";
import type { OGSMData, Team, TeamMember } from "../schemas/ogsm";
import { genId } from "../utils/csvParser";
import { useTour } from "../contexts/TourContext";
import { Tooltip } from "./ui/tooltip";

interface Props {
  data: OGSMData;
  teams: Team[];
  deptId: string;
  onUpdateTeams: (teams: Team[]) => void;
  onUpdateData: (data: OGSMData) => void;
}

export default function DeptSettingsPage({
  data: _data,
  teams,
  deptId,
  onUpdateTeams,
  onUpdateData: _onUpdateData,
}: Props) {
  const { startPageTour } = useTour();
  // ─── Teams section ─────────────────────────────────────────────────────
  const [teamDraft, setTeamDraft] = useState<Team[]>(() =>
    JSON.parse(JSON.stringify(teams)),
  );

  // Re-sync draft when parent teams prop changes (e.g. after file reload / undo)
  useEffect(() => {
    setTeamDraft(JSON.parse(JSON.stringify(teams)));
  }, [teams]);

  const addTeam = () =>
    setTeamDraft([...teamDraft, { id: genId("team"), name: "", members: [] }]);

  const updateTeamName = (teamId: string, name: string) =>
    setTeamDraft(teamDraft.map((t) => (t.id === teamId ? { ...t, name } : t)));

  const deleteTeam = (teamId: string) =>
    setTeamDraft(teamDraft.filter((t) => t.id !== teamId));

  const addMember = (teamId: string) =>
    setTeamDraft(
      teamDraft.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              members: [
                ...t.members,
                { id: genId("mbr"), name: "" } as TeamMember,
              ],
            },
      ),
    );

  const updateMemberName = (teamId: string, memberId: string, name: string) =>
    setTeamDraft(
      teamDraft.map((t) =>
        t.id !== teamId
          ? t
          : {
              ...t,
              members: t.members.map((m) =>
                m.id === memberId ? { ...m, name } : m,
              ),
            },
      ),
    );

  const deleteMember = (teamId: string, memberId: string) =>
    setTeamDraft(
      teamDraft.map((t) =>
        t.id !== teamId
          ? t
          : { ...t, members: t.members.filter((m) => m.id !== memberId) },
      ),
    );

  const saveTeams = () => {
    const cleaned = teamDraft
      .map((t) => ({
        ...t,
        deptId,
        name: t.name.trim(),
        members: t.members.filter((m) => m.name.trim()),
      }))
      .filter((t) => t.name);
    onUpdateTeams(cleaned);
  };

  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(
    () => new Set(teams.map((t) => t.id)),
  );

  const toggleTeam = (teamId: string) =>
    setCollapsedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });

  return (
    <div className="dept-settings-page">
      <div className="dept-settings-inner">
        {/* ── Tab bar ── */}
        <div className="dsettings-tabs" data-tour="settings-tabs">
          <button className="dsettings-tab active">👥 團隊設定</button>
          <button
            className="page-tour-btn"
            onClick={() => startPageTour("settings")}
          >
            🔎 本頁導覽
          </button>
        </div>
        {/* ── 團隊設定 ── */}
        <section className="dsec" data-tour="settings-team-section">
          <div className="dsec-header">
            <h2 className="dsec-title">👥 團隊設定</h2>
            <p className="dsec-desc">
              設定團隊與成員，用於策略負責單位與行動計畫主責者的選單。
            </p>
          </div>
          <div className="team-list" data-tour="settings-team-list">
            {teamDraft.length === 0 && (
              <p style={{ color: "var(--text3)", fontSize: 13 }}>
                尚未設定任何團隊。
              </p>
            )}
            {teamDraft.map((team) => {
              const isTeamCollapsed = collapsedTeams.has(team.id);
              return (
                <div key={team.id} className="team-card">
                  <div
                    className="team-card-header team-card-header--toggle"
                    onClick={() => toggleTeam(team.id)}
                  >
                    <span className="res-chevron">
                      {isTeamCollapsed ? "▶" : "▼"}
                    </span>
                    <input
                      className="team-name-input"
                      value={team.name}
                      onChange={(e) => updateTeamName(team.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="團隊名稱（如：George team）"
                    />

                    <span className="team-member-count">
                      {team.members.length} 人
                    </span>
                    <Tooltip content="刪除團隊">
                      <button
                        className="plan-del-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTeam(team.id);
                        }}
                        title="刪除團隊"
                        style={{ color: "var(--text3)" }}
                      >
                        ✕
                      </button>
                    </Tooltip>
                  </div>
                  {!isTeamCollapsed && (
                    <div className="team-members">
                      {team.members.map((m) => (
                        <div key={m.id} className="team-member-row">
                          <span style={{ fontSize: 13, color: "var(--text3)" }}>
                            👤
                          </span>
                          <input
                            className="team-member-input"
                            value={m.name}
                            onChange={(e) =>
                              updateMemberName(team.id, m.id, e.target.value)
                            }
                            placeholder="成員名稱"
                          />
                          <Tooltip content="刪除成員">
                            <button
                              className="plan-item-del"
                              onClick={() => deleteMember(team.id, m.id)}
                              style={{ color: "var(--text3)" }}
                            >
                              ✕
                            </button>
                          </Tooltip>
                        </div>
                      ))}
                      <button
                        className="plan-add-item"
                        onClick={() => addMember(team.id)}
                      >
                        + 新增成員
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="dsec-footer" data-tour="settings-team-actions">
            <button className="detail-add-btn" onClick={addTeam}>
              + 新增團隊
            </button>
            <button className="btn-add" onClick={saveTeams}>
              儲存團隊設定
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
