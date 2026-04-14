"use strict";
const fs = require("fs");
let lines = fs
  .readFileSync("src/components/KpiDesigner.tsx", "utf8")
  .split("\n");

// Verify line 334 is blank and line 335 starts orphaned GoalKpiConfigPanel body
console.log("Line 334:", JSON.stringify(lines[333]));
console.log("Line 335:", JSON.stringify(lines[334]));

// The missing declaration to insert at position 334 (0-indexed), after the blank line
const insertion = `
interface GoalKpiConfigPanelProps {
  gk: GoalKPI;
  draftGoal: Goal;
  allGoals: Goal[];
  deptActivities: DeptActivity[];
  onUpdate: (updated: GoalKPI) => void;
  onClose: () => void;
}

function GoalKpiConfigPanel({
  gk,
  draftGoal,
  allGoals,
  deptActivities,
  onUpdate,
  onClose,
}: GoalKpiConfigPanelProps) {
  const isAgg = gk.goalKpiType === "aggregate";
  return (
    <div className="kpid-node-config">
      {/* Header */}
      <div className="kpid-config-header">
        <span className="kpid-config-title">GK｜{gk.label}</span>
        <button className="kpid-config-close" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Label */}
      <div className="kpid-config-section">
        <div className="kpid-config-label">KPI 標籤</div>
        <input
          className="kpid-config-input"
          value={gk.label}
          onChange={(e) => onUpdate({ ...gk, label: e.target.value })}
        />
      </div>

      {/* Target & Unit */}
      <div className="kpid-config-section">
        <div className="kpid-config-label">目標值 / 單位</div>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="kpid-config-input"
            style={{ width: 80 }}
            type="number"
            value={gk.target ?? ""}
            onChange={(e) =>
              onUpdate({
                ...gk,
                target: e.target.value
                  ? parseFloat(e.target.value)
                  : undefined,
              })
            }
          />
          <input
            className="kpid-config-input"
            style={{ width: 60 }}
            placeholder="單位"
            value={gk.unit ?? ""}
            onChange={(e) => onUpdate({ ...gk, unit: e.target.value })}
          />
        </div>
      </div>

      {/* KPI Type */}
      <div className="kpid-config-section">
        <div className="kpid-config-label">KPI 類型</div>
        <select
          className="kpid-add-select"
          value={gk.goalKpiType ?? "direct"}
          onChange={(e) =>
            onUpdate({
              ...gk,
              goalKpiType: e.target.value as GoalKPI["goalKpiType"],
            })
          }
        >
          <option value="direct">直接連結活動 KPI</option>
          <option value="aggregate">聚合多個 GoalKPI</option>
        </select>
      </div>

      {/* Links */}
      {isAgg ? (
        <div className="kpid-config-section">
          <div className="kpid-config-label">聚合來源 GoalKPI</div>
          {(gk.linkedGoalKpis ?? []).map((link, idx) => {
            const srcGoal = allGoals.find((g) => g.id === link.goalId);
            const srcGk = srcGoal?.goalKpis?.find(
              (g) => g.id === link.goalKpiId,
            );
            return (
              <div key={link.goalKpiId} className="kpid-linked-row">
                <span
                  className="kpid-linked-name"
                  title={\`\${srcGoal?.label} / \${srcGk?.label}\`}
                >
                  {srcGoal?.label}&nbsp;/&nbsp;
                  {srcGk?.label ?? link.goalKpiId}
                </span>
                <input
                  type="number"
                  className="kpid-weight-input"
                  step={0.05}
                  min={0}
                  max={1}
                  value={link.weight}
                  onChange={(e) => {
                    const w = parseFloat(e.target.value);
                    onUpdate({
                      ...gk,
                      linkedGoalKpis: (gk.linkedGoalKpis ?? []).map((l, i) =>
                        i === idx ? { ...l, weight: isNaN(w) ? 0 : w } : l,
                      ),
                    });
                  }}
                />
                <button
                  className="kpid-remove-btn"
                  onClick={() =>
                    onUpdate({
                      ...gk,
                      linkedGoalKpis: (gk.linkedGoalKpis ?? []).filter(
                        (_, i) => i !== idx,
                      ),
                    })
                  }
                >
                  ✕
                </button>
              </div>
            );
          })}
          <select
            className="kpid-add-select"
            value=""
            onChange={(e) => {
              const [goalId, goalKpiId] = e.target.value.split("::");
              if (!goalId) return;
              if (gk.linkedGoalKpis?.some((l) => l.goalKpiId === goalKpiId))
                return;
              onUpdate({
                ...gk,
                goalKpiType: "aggregate",
                linkedGoalKpis: [
                  ...(gk.linkedGoalKpis ?? []),`
  .split("\n")
  .map((l) => l + "\r");

// Insert at position 334 (0-indexed), REPLACING the blank line at 333 with blank + insertion
lines = [...lines.slice(0, 334), ...insertion, ...lines.slice(334)];

console.log("Lines after insertion:", lines.length);
fs.writeFileSync("src/components/KpiDesigner.tsx", lines.join("\n"), "utf8");
console.log("Done");
