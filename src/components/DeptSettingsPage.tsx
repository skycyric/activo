import { useState } from "react";
import type { OGSMData, Team, TeamMember } from "../types/ogsm";
import { genId } from "../utils/csvParser";

interface Props {
  data: OGSMData;
  teams: Team[];
  onUpdateTeams: (teams: Team[]) => void;
  onUpdateData: (data: OGSMData) => void;
}

export default function DeptSettingsPage({
  data,
  teams,
  onUpdateTeams,
  onUpdateData,
}: Props) {
  // ─── Teams section ─────────────────────────────────────────────────────
  const [teamDraft, setTeamDraft] = useState<Team[]>(() =>
    JSON.parse(JSON.stringify(teams)),
  );

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
        name: t.name.trim(),
        members: t.members.filter((m) => m.name.trim()),
      }))
      .filter((t) => t.name);
    onUpdateTeams(cleaned);
  };

  // ─── Resource section ──────────────────────────────────────────────────
  const updateMeasureResource = (
    goalId: string,
    strategyId: string,
    measureId: string,
    field: "budget" | "personDays",
    value: string,
  ) => {
    const num = value === "" ? undefined : Number(value);
    onUpdateData({
      ...data,
      goals: data.goals.map((g) =>
        g.id !== goalId
          ? g
          : {
              ...g,
              strategies: g.strategies.map((s) =>
                s.id !== strategyId
                  ? s
                  : {
                      ...s,
                      measures: s.measures.map((m) =>
                        m.id !== measureId ? m : { ...m, [field]: num },
                      ),
                    },
              ),
            },
      ),
    });
  };

  const allMeasures = data.goals
    .flatMap((g) => g.strategies)
    .flatMap((s) => s.measures);
  const grandBudget = allMeasures.reduce((sum, m) => sum + (m.budget ?? 0), 0);
  const grandDays = allMeasures.reduce(
    (sum, m) => sum + (m.personDays ?? 0),
    0,
  );
  const hasAnyBudget = allMeasures.some((m) => m.budget != null);
  const hasAnyDays = allMeasures.some((m) => m.personDays != null);

  const [activeTab, setActiveTab] = useState<"team" | "resource">("team");
  const [collapsedGoals, setCollapsedGoals] = useState<Set<string>>(
    () => new Set(data.goals.map((g) => g.id)),
  );
  const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(
    () => new Set(teams.map((t) => t.id)),
  );

  const toggleGoal = (goalId: string) =>
    setCollapsedGoals((prev) => {
      const next = new Set(prev);
      if (next.has(goalId)) next.delete(goalId);
      else next.add(goalId);
      return next;
    });

  const toggleTeam = (teamId: string) =>
    setCollapsedTeams((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });

  const [collapsedStrategies, setCollapsedStrategies] = useState<Set<string>>(
    () => new Set(data.goals.flatMap((g) => g.strategies.map((s) => s.id))),
  );
  const toggleStrategy = (strategyId: string) =>
    setCollapsedStrategies((prev) => {
      const next = new Set(prev);
      if (next.has(strategyId)) next.delete(strategyId);
      else next.add(strategyId);
      return next;
    });

  return (
    <div className="dept-settings-page">
      <div className="dept-settings-inner">
        {/* ── Tab bar ── */}
        <div className="dsettings-tabs">
          <button
            className={`dsettings-tab${activeTab === "team" ? " active" : ""}`}
            onClick={() => setActiveTab("team")}
          >
            &#128101; 團隊設定
          </button>
          <button
            className={`dsettings-tab${activeTab === "resource" ? " active" : ""}`}
            onClick={() => setActiveTab("resource")}
          >
            &#128202; 資源規劃
          </button>
        </div>
        {/* ── 團隊設定 ── */}
        {activeTab === "team" && (
          <section className="dsec">
            <div className="dsec-header">
              <h2 className="dsec-title">👥 團隊設定</h2>
              <p className="dsec-desc">
                設定團隊與成員，用於策略負責單位與行動計畫主責者的選單。
              </p>
            </div>
            <div className="team-list">
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
                        onChange={(e) =>
                          updateTeamName(team.id, e.target.value)
                        }
                        onClick={(e) => e.stopPropagation()}
                        placeholder="團隊名稱（如：George team）"
                      />
                      <span className="team-member-count">
                        {team.members.length} 人
                      </span>
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
                    </div>
                    {!isTeamCollapsed && (
                      <div className="team-members">
                        {team.members.map((m) => (
                          <div key={m.id} className="team-member-row">
                            <span
                              style={{ fontSize: 13, color: "var(--text3)" }}
                            >
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
                            <button
                              className="plan-item-del"
                              onClick={() => deleteMember(team.id, m.id)}
                              style={{ color: "var(--text3)" }}
                            >
                              ✕
                            </button>
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
            <div className="dsec-footer">
              <button className="detail-add-btn" onClick={addTeam}>
                + 新增團隊
              </button>
              <button className="btn-add" onClick={saveTeams}>
                儲存團隊設定
              </button>
            </div>
          </section>
        )}

        {/* ── 資源規劃 ── */}
        {activeTab === "resource" && (
          <section className="dsec">
            <div className="dsec-header">
              <h2 className="dsec-title">📊 資源規劃</h2>
              <p className="dsec-desc">
                為各行動計畫登記預算與人天投入，用於評估策略有效性。
              </p>
            </div>

            {data.goals.length === 0 && (
              <p style={{ color: "var(--text3)", fontSize: 13 }}>
                尚未設定任何目標。
              </p>
            )}

            {data.goals.map((g) => {
              const isCollapsed = collapsedGoals.has(g.id);
              const gBudget = g.strategies
                .flatMap((s) => s.measures)
                .reduce((sum, m) => sum + (m.budget ?? 0), 0);
              const gDays = g.strategies
                .flatMap((s) => s.measures)
                .reduce((sum, m) => sum + (m.personDays ?? 0), 0);
              const gHasBudget = g.strategies
                .flatMap((s) => s.measures)
                .some((m) => m.budget != null);
              const gHasDays = g.strategies
                .flatMap((s) => s.measures)
                .some((m) => m.personDays != null);
              return (
                <div key={g.id} className="res-goal-group">
                  <button
                    className="res-goal-header"
                    onClick={() => toggleGoal(g.id)}
                  >
                    <span className="res-chevron">
                      {isCollapsed ? "▶" : "▼"}
                    </span>
                    <span className="goal-badge">{g.label}</span>
                    <span className="res-goal-title">{g.title}</span>
                    <span className="res-goal-summary">
                      {gHasBudget && <span>預算：{gBudget}</span>}
                      {gHasDays && <span>人天：{gDays}</span>}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="res-goal-body">
                      {g.strategies.map((s, si) => {
                        const isSCollapsed = collapsedStrategies.has(s.id);
                        const sBudget = s.measures.reduce(
                          (sum, m) => sum + (m.budget ?? 0),
                          0,
                        );
                        const sDays = s.measures.reduce(
                          (sum, m) => sum + (m.personDays ?? 0),
                          0,
                        );
                        const sHasBudget = s.measures.some(
                          (m) => m.budget != null,
                        );
                        const sHasDays = s.measures.some(
                          (m) => m.personDays != null,
                        );
                        const isEmpty = s.measures.length === 0;
                        return (
                          <div
                            key={s.id}
                            className={`res-strategy-block${isEmpty ? " res-strategy-block--empty" : ""}`}
                          >
                            <button
                              className="res-strategy-header"
                              onClick={() => toggleStrategy(s.id)}
                            >
                              <span className="res-chevron">
                                {isSCollapsed ? "▶" : "▼"}
                              </span>
                              <span className="res-s-index">S{si + 1}</span>
                              <span className="res-s-title">
                                {s.title || "(無標題策略)"}
                              </span>
                              {isEmpty ? (
                                <span className="res-s-empty-badge">
                                  尚無行動計畫
                                </span>
                              ) : (
                                <span className="res-s-summary">
                                  {sHasBudget && <span>預算：{sBudget}</span>}
                                  {sHasDays && <span>人天：{sDays}</span>}
                                </span>
                              )}
                            </button>
                            {!isSCollapsed && !isEmpty && (
                              <table className="res-table">
                                <thead>
                                  <tr>
                                    <th className="res-th res-th-name">
                                      行動計畫
                                    </th>
                                    <th className="res-th res-th-num">預算</th>
                                    <th className="res-th res-th-num">人天</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {s.measures.map((m) => (
                                    <tr key={m.id} className="res-row">
                                      <td className="res-td res-td-name">
                                        {m.rawText || "(未命名)"}
                                      </td>
                                      <td className="res-td res-td-num">
                                        <input
                                          type="number"
                                          className="res-input"
                                          value={m.budget ?? ""}
                                          min={0}
                                          placeholder="—"
                                          onChange={(e) =>
                                            updateMeasureResource(
                                              g.id,
                                              s.id,
                                              m.id,
                                              "budget",
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </td>
                                      <td className="res-td res-td-num">
                                        <input
                                          type="number"
                                          className="res-input"
                                          value={m.personDays ?? ""}
                                          min={0}
                                          placeholder="—"
                                          onChange={(e) =>
                                            updateMeasureResource(
                                              g.id,
                                              s.id,
                                              m.id,
                                              "personDays",
                                              e.target.value,
                                            )
                                          }
                                        />
                                      </td>
                                    </tr>
                                  ))}
                                  <tr className="res-subtotal">
                                    <td className="res-td res-td-name">小計</td>
                                    <td className="res-td res-td-num">
                                      {sHasBudget ? sBudget : "—"}
                                    </td>
                                    <td className="res-td res-td-num">
                                      {sHasDays ? sDays : "—"}
                                    </td>
                                  </tr>
                                </tbody>
                              </table>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {allMeasures.length > 0 && (
              <div className="res-grand-total">
                <span className="res-grand-label">部門合計</span>
                <span className="res-grand-val">
                  預算：{hasAnyBudget ? grandBudget : "—"}
                </span>
                <span className="res-grand-val">
                  人天：{hasAnyDays ? grandDays : "—"}
                </span>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
