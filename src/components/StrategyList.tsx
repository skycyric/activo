import { useState } from "react";
import type { Goal, Strategy, Status } from "../types/ogsm";

interface Props {
  goal: Goal | null;
  strategies: Strategy[];
  selectedStrategyId: string | null;
  onSelectStrategy: (id: string) => void;
  onAddStrategy: () => void;
  onUpdateGoal: (g: Goal) => void;
  onDeleteStrategy: (id: string) => void;
  filterOwner: string;
  filterStatus: string;
  onFilterOwner: (v: string) => void;
  onFilterStatus: (v: string) => void;
  owners: string[];
}

const STATUS_LABEL: Record<Status, string> = {
  completed: "已完成",
  "on-track": "進行中",
  "at-risk": "需注意",
  behind: "落後",
  "not-started": "未開始",
};
const STATUS_COLOR: Record<Status, string> = {
  completed: "#10b981",
  "on-track": "#6366f1",
  "at-risk": "#f59e0b",
  behind: "#ef4444",
  "not-started": "#6b7280",
};

function StrategyRow({
  s,
  index,
  selected,
  onClick,
  onDelete,
}: {
  s: Strategy;
  index: number;
  selected: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  // Measures-based stats: count measures and count measures considered as "達標"
  const measuresTotal = s.measures.length;
  const measuresAchieved = s.measures.filter((m) => {
    const vals = m.kpis.map((k) => k.achievementRate ?? 0);
    if (vals.length === 0) return false;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    return avg >= 100;
  }).length;
  const rateFromMeasures =
    measuresTotal > 0
      ? Math.round((measuresAchieved / measuresTotal) * 100)
      : s.completionRate;
  const effectiveRate = s.manualRate ?? rateFromMeasures;
  const barColor =
    effectiveRate >= 100
      ? "#10b981"
      : effectiveRate >= 70
        ? "#6366f1"
        : effectiveRate >= 40
          ? "#f59e0b"
          : effectiveRate > 0
            ? "#ef4444"
            : "#374151";
  const kpiCount = s.measures
    .flatMap((m) => m.kpis)
    .filter((k) => k.achievementRate !== null).length;
  const planCount = s.actionPlans.flatMap((p) => p.items).length;

  return (
    <div
      className={`strategy-row ${selected ? "selected" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
    >
      <div className="strategy-row-left">
        <span
          className="strategy-row-dot"
          style={{ background: STATUS_COLOR[s.status] }}
        />
        <div className="strategy-row-main">
          <span className="strategy-s-label">S{index + 1}</span>
          <span className="strategy-row-title">{s.title}</span>
          <div className="strategy-row-meta">
            {s.owner && <span className="owner-chip">{s.owner}</span>}
            {kpiCount > 0 && (
              <span className="meta-tag">📊 {kpiCount} KPI</span>
            )}
            {planCount > 0 && (
              <span className="meta-tag">📅 {planCount} 計畫</span>
            )}
            {/* Measures-based summary */}
            {measuresTotal > 0 && (
              <span className="meta-tag">
                ✅ {measuresAchieved}/{measuresTotal} M
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="strategy-row-right">
        <div className="progress-bar-wrap">
          <div className="progress-bar-bg">
            <div
              className="progress-bar-fill"
              style={{
                width: `${Math.min(effectiveRate, 100)}%`,
                background: barColor,
              }}
            />
          </div>
          <span className="progress-bar-label" style={{ color: barColor }}>
            {effectiveRate > 0 ? `${effectiveRate}%` : "—"}
          </span>
        </div>
        <span
          className="status-badge"
          style={{
            background: STATUS_COLOR[s.status] + "22",
            color: STATUS_COLOR[s.status],
          }}
        >
          {STATUS_LABEL[s.status]}
        </span>
        <button
          className="row-delete-btn"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="刪除策略"
        >
          🗑
        </button>
      </div>
    </div>
  );
}

export default function StrategyList({
  goal,
  strategies,
  selectedStrategyId,
  onSelectStrategy,
  onAddStrategy,
  onUpdateGoal,
  onDeleteStrategy,
  filterOwner,
  filterStatus,
  onFilterOwner,
  onFilterStatus,
  owners,
}: Props) {
  const [editingGoalTitle, setEditingGoalTitle] = useState(false);
  const [titleText, setTitleText] = useState("");

  if (!goal) {
    return (
      <div className="strategy-list strategy-list-empty">
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <h2>選擇左側的目標（G）</h2>
          <p>點選 G1、G2 或 G3 查看策略列表</p>
        </div>
      </div>
    );
  }

  const rate = goal.completionRate;
  const barColor =
    rate >= 100
      ? "#10b981"
      : rate >= 70
        ? "#6366f1"
        : rate >= 40
          ? "#f59e0b"
          : rate > 0
            ? "#ef4444"
            : "#6b7280";
  const totalWeight = strategies.length || 1;

  return (
    <div className="strategy-list">
      <div className="goal-header">
        <div className="goal-header-top">
          <span className="goal-label-badge">{goal.label}</span>
          {editingGoalTitle ? (
            <input
              className="goal-title-input"
              autoFocus
              value={titleText}
              style={{
                flex: 1,
                fontSize: 24,
                fontWeight: 800,
                padding: 4,
                background: "rgba(99,102,241,.1)",
                border: "none",
                borderRadius: 6,
                color: "var(--text)",
                outline: "none",
              }}
              onChange={(e) => setTitleText(e.target.value)}
              onBlur={() => {
                if (titleText.trim() !== goal.title)
                  onUpdateGoal({ ...goal, title: titleText.trim() });
                setEditingGoalTitle(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (titleText.trim() !== goal.title)
                    onUpdateGoal({ ...goal, title: titleText.trim() });
                  setEditingGoalTitle(false);
                }
                if (e.key === "Escape") setEditingGoalTitle(false);
              }}
            />
          ) : (
            <h1
              className="goal-header-title"
              onDoubleClick={() => {
                setTitleText(goal.title);
                setEditingGoalTitle(true);
              }}
              title="雙擊編輯目標說明"
            >
              {goal.title || (
                <span style={{ color: "#9ca3af", fontStyle: "italic" }}>
                  雙擊輸入目標說明…
                </span>
              )}
            </h1>
          )}
        </div>

        {/* Impact Stack */}
        <div className="impact-stack-wrap">
          <div className="impact-stack-label">
            <span>目標完成率（影響堆疊）</span>
            <span style={{ color: barColor, fontWeight: 700 }}>
              {rate > 0 ? `${rate}%` : "尚未設定"}
            </span>
          </div>
          <div className="impact-stack-bar">
            {strategies.map((s, i) => {
              const w = (1 / totalWeight) * 100;
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
                        : "#1f2937";
              return (
                <div
                  key={s.id}
                  className="impact-stack-segment"
                  style={{ width: `${w}%` }}
                  title={`${s.title}: ${s.completionRate}%`}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${fill}%`,
                      background: c,
                      transition: "width 0.6s ease",
                      borderRadius:
                        i === 0
                          ? "4px 0 0 4px"
                          : i === strategies.length - 1
                            ? "0 4px 4px 0"
                            : 0,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="impact-stack-labels">
            {strategies.map((s) => (
              <span
                key={s.id}
                className="impact-stack-slabel"
                style={{ width: `${(1 / totalWeight) * 100}%` }}
              >
                {s.title.substring(0, 8)}
              </span>
            ))}
          </div>
        </div>

        <div className="list-toolbar">
          <div className="list-filters">
            <select
              className="filter-select"
              value={filterOwner}
              onChange={(e) => onFilterOwner(e.target.value)}
            >
              <option value="all">全部負責人</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <select
              className="filter-select"
              value={filterStatus}
              onChange={(e) => onFilterStatus(e.target.value)}
            >
              <option value="all">全部狀態</option>
              {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-add" onClick={onAddStrategy}>
            + 新增策略（S）
          </button>
        </div>
      </div>

      <div className="strategy-rows">
        {strategies.length === 0 && (
          <div className="empty-state small">
            <p>沒有符合篩選條件的策略，或尚未新增策略</p>
          </div>
        )}
        {strategies.map((s, i) => (
          <StrategyRow
            key={s.id}
            s={s}
            index={i}
            selected={s.id === selectedStrategyId}
            onClick={() => onSelectStrategy(s.id)}
            onDelete={() => onDeleteStrategy(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
