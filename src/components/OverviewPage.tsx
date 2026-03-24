import { useState } from "react";
import type { OGSMData, Goal, Strategy, Status } from "../types/ogsm";

interface Props {
  data: OGSMData;
  onSelectGoal: (id: string) => void;
  onEditObjective: (text: string) => void;
}

const STATUS_COLOR: Record<Status, string> = {
  completed: "#10b981",
  "on-track": "#6366f1",
  "at-risk": "#f59e0b",
  behind: "#ef4444",
  "not-started": "#4b5563",
};
const STATUS_LABEL: Record<Status, string> = {
  completed: "已完成",
  "on-track": "進行中",
  "at-risk": "需注意",
  behind: "落後",
  "not-started": "未開始",
};

function BigRing({ rate, size = 120 }: { rate: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(rate, 100) / 100) * circ;
  const color =
    rate >= 100
      ? "#10b981"
      : rate >= 70
        ? "#6366f1"
        : rate >= 40
          ? "#f59e0b"
          : rate > 0
            ? "#ef4444"
            : "#e5e7eb";
  return (
    <svg width={size} height={size}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="#f3f4f6"
        strokeWidth={9}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={9}
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.8s ease" }}
      />
      <text
        x={size / 2}
        y={size / 2 - 4}
        textAnchor="middle"
        fill={color}
        fontSize={size === 120 ? 22 : 16}
        fontWeight="800"
      >
        {rate > 0 ? `${rate}%` : "—"}
      </text>
      <text
        x={size / 2}
        y={size / 2 + 14}
        textAnchor="middle"
        fill="#6b7280"
        fontSize={10}
      >
        完成率
      </text>
    </svg>
  );
}

function GoalCard({ goal, onSelect }: { goal: Goal; onSelect: () => void }) {
  const rate = goal.completionRate;
  const color =
    rate >= 100
      ? "#10b981"
      : rate >= 70
        ? "#6366f1"
        : rate >= 40
          ? "#f59e0b"
          : rate > 0
            ? "#ef4444"
            : "#4b5563";
  const totalS = goal.strategies.length || 1;

  return (
    <div
      className="ov-goal-card"
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    >
      <div className="ov-goal-card-header">
        <div className="ov-goal-card-left">
          <span className="goal-label-badge">{goal.label}</span>
          <div>
            <div className="ov-goal-card-title">{goal.title}</div>
            <div className="ov-goal-card-sub">
              {goal.strategies.length} 個策略
            </div>
          </div>
        </div>
        <BigRing rate={rate} size={80} />
      </div>

      {/* S影響堆疊 */}
      <div className="ov-stack-label">
        <span>策略影響堆疊</span>
        <span style={{ color, fontWeight: 700 }}>
          {rate > 0 ? `${rate}%` : "尚未設定"}
        </span>
      </div>
      <div className="ov-stack-bar">
        {goal.strategies.map((s: Strategy, i: number) => {
          const w = (1 / totalS) * 100;
          const fill = Math.min(s.completionRate, 100);
          const c =
            s.completionRate >= 100
              ? "#10b981"
              : s.completionRate >= 70
                ? "#6366f1"
                : s.completionRate >= 40
                  ? "#f59e0b"
                  : s.completionRate > 0
                    ? "#ef4444"
                    : "#e5e7eb";
          return (
            <div
              key={s.id}
              style={{
                width: `${w}%`,
                background: "#f3f4f6",
                overflow: "hidden",
                borderRadius:
                  i === 0
                    ? "6px 0 0 6px"
                    : i === goal.strategies.length - 1
                      ? "0 6px 6px 0"
                      : 0,
              }}
              title={`${s.title}: ${s.completionRate}%`}
            >
              <div
                style={{
                  height: "100%",
                  width: `${fill}%`,
                  background: c,
                  transition: "width 0.8s ease",
                }}
              />
            </div>
          );
        })}
      </div>

      {/* S list */}
      <div className="ov-strategies">
        {goal.strategies.map((s: Strategy) => {
          const sc = s.completionRate;
          const bc =
            sc >= 100
              ? "#10b981"
              : sc >= 70
                ? "#6366f1"
                : sc >= 40
                  ? "#f59e0b"
                  : sc > 0
                    ? "#ef4444"
                    : "#e5e7eb";
          return (
            <div key={s.id} className="ov-strategy-item">
              <span
                className="ov-s-dot"
                style={{ background: STATUS_COLOR[s.status] }}
              />
              <span className="ov-s-title">{s.title.substring(0, 28)}</span>
              <div className="ov-s-bar-wrap">
                <div className="ov-s-bar">
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(sc, 100)}%`,
                      background: bc,
                      borderRadius: 3,
                      transition: "width 0.8s ease",
                    }}
                  />
                </div>
                <span className="ov-s-rate" style={{ color: bc }}>
                  {sc > 0 ? `${sc}%` : "—"}
                </span>
              </div>
              <span
                className="ov-s-badge"
                style={{
                  background: STATUS_COLOR[s.status] + "22",
                  color: STATUS_COLOR[s.status],
                }}
              >
                {STATUS_LABEL[s.status]}
              </span>
              {s.owner && (
                <span className="ov-s-owner">
                  {s.owner.split(/[/,，]/)[0].trim()}
                </span>
              )}
            </div>
          );
        })}
        {goal.strategies.length === 0 && (
          <p className="ov-no-strategy">尚未新增策略，點擊進入目標頁面新增</p>
        )}
      </div>

      <div className="ov-goal-card-footer">
        <span>查看詳細策略 →</span>
      </div>
    </div>
  );
}

export default function OverviewPage({
  data,
  onSelectGoal,
  onEditObjective,
}: Props) {
  const [editingO, setEditingO] = useState(false);
  const [oText, setOText] = useState("");
  const overall = data.overallRate;
  const overallColor =
    overall >= 100
      ? "#10b981"
      : overall >= 70
        ? "#6366f1"
        : overall >= 40
          ? "#f59e0b"
          : overall > 0
            ? "#ef4444"
            : "#4b5563";

  const kpisDone = data.goals
    .flatMap((g) =>
      g.strategies.flatMap((s) => s.measures.flatMap((m) => m.kpis)),
    )
    .filter((k) => (k.achievementRate ?? 0) >= 100).length;
  const kpisTotal = data.goals
    .flatMap((g) =>
      g.strategies.flatMap((s) => s.measures.flatMap((m) => m.kpis)),
    )
    .filter((k) => k.achievementRate !== null).length;
  const plansDone = data.goals
    .flatMap((g) =>
      g.strategies.flatMap((s) => s.actionPlans.flatMap((p) => p.items)),
    )
    .filter((i) => i.completed).length;
  const plansTotal = data.goals.flatMap((g) =>
    g.strategies.flatMap((s) => s.actionPlans.flatMap((p) => p.items)),
  ).length;

  return (
    <div className="overview-page">
      {/* O Header */}
      <div className="ov-header">
        <div className="ov-header-left">
          <div className="ov-header-badge">O</div>
          <div style={{ flex: 1 }}>
            <div className="ov-header-label">部門目標 · {data.period}</div>
            {editingO ? (
              <textarea
                className="ov-objective-text"
                style={{
                  width: "100%",
                  resize: "vertical",
                  minHeight: 60,
                  background: "rgba(99,102,241,.08)",
                }}
                autoFocus
                value={oText}
                onChange={(e) => setOText(e.target.value)}
                onBlur={() => {
                  if (oText.trim() !== data.objectives.deptO)
                    onEditObjective(oText.trim());
                  setEditingO(false);
                }}
              />
            ) : (
              <div
                className="ov-objective-text"
                onDoubleClick={() => {
                  setOText(data.objectives.deptO);
                  setEditingO(true);
                }}
                title="雙擊編輯"
              >
                {data.objectives.deptO || (
                  <span style={{ color: "#6b7280", fontStyle: "italic" }}>
                    雙擊輸入部門目標…
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Stats row */}
        <div className="ov-stats">
          <div className="ov-stat-card">
            <BigRing rate={overall} size={120} />
            <div className="ov-stat-label" style={{ color: overallColor }}>
              整體完成率
            </div>
          </div>
          <div className="ov-stat-items">
            <div className="ov-stat-item">
              <span className="ov-stat-num">{data.goals.length}</span>
              <span className="ov-stat-desc">目標（G）</span>
            </div>
            <div className="ov-stat-item">
              <span className="ov-stat-num">
                {data.goals.flatMap((g) => g.strategies).length}
              </span>
              <span className="ov-stat-desc">策略（S）</span>
            </div>
            <div className="ov-stat-item">
              <span className="ov-stat-num" style={{ color: "#10b981" }}>
                {kpisDone}
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  /{kpisTotal}
                </span>
              </span>
              <span className="ov-stat-desc">KPI 達成</span>
            </div>
            <div className="ov-stat-item">
              <span className="ov-stat-num" style={{ color: "#6366f1" }}>
                {plansDone}
                <span style={{ fontSize: 12, color: "#6b7280" }}>
                  /{plansTotal}
                </span>
              </span>
              <span className="ov-stat-desc">計畫完成</span>
            </div>
          </div>
        </div>
      </div>

      {/* O→G 瀑布圖 */}
      <div className="ov-cascade-section">
        <div className="ov-section-title">O → G 完成率影響堆疊</div>
        <div className="ov-cascade-bar-wrap">
          <div className="ov-cascade-o-label" style={{ color: overallColor }}>
            整體 {overall > 0 ? `${overall}%` : "—"}
          </div>
          <div className="ov-cascade-bar">
            {data.goals.map((g: Goal, i: number) => {
              const w = (1 / (data.goals.length || 1)) * 100;
              const fill = Math.min(g.completionRate, 100);
              const c =
                g.completionRate >= 100
                  ? "#10b981"
                  : g.completionRate >= 70
                    ? "#6366f1"
                    : g.completionRate >= 40
                      ? "#f59e0b"
                      : g.completionRate > 0
                        ? "#ef4444"
                        : "#e5e7eb";
              return (
                <div
                  key={g.id}
                  style={{
                    width: `${w}%`,
                    background: "#f3f4f6",
                    overflow: "hidden",
                    cursor: "pointer",
                    borderRadius:
                      i === 0
                        ? "8px 0 0 8px"
                        : i === data.goals.length - 1
                          ? "0 8px 8px 0"
                          : 0,
                  }}
                  onClick={() => onSelectGoal(g.id)}
                  title={`${g.label}: ${g.completionRate}%`}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${fill}%`,
                      background: c,
                      transition: "width 0.8s ease",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex" }}>
            {data.goals.map((g: Goal) => (
              <div
                key={g.id}
                style={{
                  width: `${(1 / (data.goals.length || 1)) * 100}%`,
                  textAlign: "center",
                }}
              >
                <span
                  style={{ fontSize: 10, color: "#4b5563", fontWeight: 600 }}
                >
                  {g.label}{" "}
                  {g.completionRate > 0 ? `${g.completionRate}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* G Cards */}
      <div className="ov-section-title">目標（G）詳細狀況</div>
      <div className="ov-goal-cards">
        {data.goals.map((g: Goal) => (
          <GoalCard key={g.id} goal={g} onSelect={() => onSelectGoal(g.id)} />
        ))}
        {data.goals.length === 0 && (
          <div className="empty-state" style={{ padding: 60 }}>
            <div className="empty-icon">🎯</div>
            <h2>尚未建立任何目標</h2>
            <p>點選左側「+ 新增目標（G）」開始建立 OGSM</p>
          </div>
        )}
      </div>
    </div>
  );
}
