import { useState } from "react";
import type { ConflictEntry, ConflictResolutions } from "../utils/merge";
import { Tooltip } from "./ui/tooltip";

interface Props {
  conflicts: ConflictEntry[];
  resolutions: ConflictResolutions;
  /** field 為 "*" 時代表整張卡片全選（快捷按鈕觸發） */
  onChange: (
    entityId: string,
    field: string,
    choice: "local" | "remote",
  ) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  goal: "目標",
  strategy: "策略",
  team: "團隊",
  activity: "活動",
};

function formatTs(iso?: string): string {
  if (!iso) return "未知時間";
  const d = new Date(iso);
  return d.toLocaleString("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ClearedBadge() {
  return <span className="conflict-val-cleared">已清空</span>;
}

interface ComplexArrayCellProps {
  items: unknown[];
  field: string;
  summary: string;
}

function ComplexArrayCell({ items, field, summary }: ComplexArrayCellProps) {
  const [expanded, setExpanded] = useState(false);
  const previewCount = 3;
  const displayItems = expanded ? items : items.slice(0, previewCount);

  const renderItem = (item: unknown, index: number) => {
    if (field === "kpis" || field === "goalKpis") {
      const kpi = item as Record<string, unknown>;
      const name = String(kpi.name ?? kpi.label ?? "KPI");
      const target = kpi.target !== undefined ? `目標: ${kpi.target}` : "";
      const actual = kpi.actual !== undefined ? `實際: ${kpi.actual}` : "";
      const meta = [target, actual].filter(Boolean).join(" / ");
      return (
        <li key={index}>
          <strong>{name}</strong>
          {meta && <span className="conflict-val-muted"> ({meta})</span>}
        </li>
      );
    }

    if (field === "planItems") {
      const planItem = item as Record<string, unknown>;
      const description = String(planItem.description ?? planItem.text ?? "");
      const quarter = planItem.quarter ? String(planItem.quarter) : "";
      const done = Boolean(planItem.completed ?? planItem.done);
      return (
        <li key={index} className={done ? "conflict-val-done-item" : ""}>
          {quarter && (
            <span className="conflict-val-quarter-tag">{quarter}</span>
          )}
          {description}
          {done && <span className="conflict-val-done-mark"> ✓</span>}
        </li>
      );
    }

    if (field === "actionPlans") {
      const actionPlan = item as Record<string, unknown>;
      const quarter = actionPlan.quarter ? String(actionPlan.quarter) : "";
      const title = String(actionPlan.title ?? "");
      const subItems = Array.isArray(actionPlan.items)
        ? actionPlan.items.length
        : 0;
      return (
        <li key={index}>
          {quarter && (
            <span className="conflict-val-quarter-tag">{quarter}</span>
          )}
          {title}
          {subItems > 0 && (
            <span className="conflict-val-muted"> ({subItems} 項)</span>
          )}
        </li>
      );
    }

    if (field === "members") {
      const member = item as Record<string, unknown>;
      return <li key={index}>{String(member.name ?? member.id ?? "")}</li>;
    }

    if (field === "assistUnits") {
      const unit = item as Record<string, unknown>;
      const typeLabel =
        unit.type === "dept"
          ? "部門"
          : unit.type === "team"
            ? "小組"
            : String(unit.type ?? "");
      return (
        <li key={index}>
          {String(unit.name ?? "")}
          {typeLabel && (
            <span className="conflict-val-muted"> ({typeLabel})</span>
          )}
        </li>
      );
    }

    return <li key={index}>{JSON.stringify(item)}</li>;
  };

  if (items.length === 0) {
    return <span className="conflict-val-empty">(空)</span>;
  }

  return (
    <div className="conflict-val-complex">
      <span className="conflict-val-count">{summary}</span>
      <div className="conflict-val-detail">
        <ul className="conflict-val-list">{displayItems.map(renderItem)}</ul>
        {items.length > previewCount && (
          <button
            className="conflict-val-expand-btn"
            onClick={() => setExpanded(!expanded)}
            type="button"
          >
            {expanded ? "▲ 收起" : `▼ 還有 ${items.length - previewCount} 項`}
          </button>
        )}
      </div>
    </div>
  );
}

interface RichValueCellProps {
  val: string;
  rawVal: unknown;
  field: string;
}

function RichValueCell({ val, rawVal, field }: RichValueCellProps) {
  const [expanded, setExpanded] = useState(false);

  if (rawVal === null) {
    return <ClearedBadge />;
  }

  if (rawVal === undefined) {
    if (!val) return <span className="conflict-val-empty">(空)</span>;
    return <span className="conflict-val-plain">{val}</span>;
  }

  if (
    Array.isArray(rawVal) &&
    rawVal.every((item) => typeof item === "string")
  ) {
    if (rawVal.length === 0) {
      return <span className="conflict-val-empty">(空)</span>;
    }
    return (
      <div className="conflict-val-pills">
        {(rawVal as string[]).map((item, index) => (
          <span key={index} className="conflict-val-pill">
            {item}
          </span>
        ))}
      </div>
    );
  }

  if (Array.isArray(rawVal)) {
    return <ComplexArrayCell items={rawVal} field={field} summary={val} />;
  }

  if (typeof rawVal === "string" && rawVal.length > 100) {
    return (
      <div className="conflict-val-longtext">
        <span
          className={`conflict-val-longtext-body${expanded ? " conflict-val-longtext-expanded" : ""}`}
        >
          {rawVal}
        </span>
        <button
          className="conflict-val-expand-btn"
          onClick={() => setExpanded(!expanded)}
          type="button"
        >
          {expanded ? "▲ 收起" : "▼ 展開全文"}
        </button>
      </div>
    );
  }

  if (!val) {
    return <span className="conflict-val-empty">(空)</span>;
  }

  return <span className="conflict-val-plain">{val}</span>;
}

export default function ConflictModal({
  conflicts,
  resolutions,
  onChange,
  onConfirm,
  onCancel,
}: Props) {
  const totalFields = conflicts.reduce((sum, conflict) => {
    return sum + conflict.fieldDiffs.length;
  }, 0);

  const resolvedFields = conflicts.reduce((sum, conflict) => {
    return (
      sum +
      conflict.fieldDiffs.filter((diff) => {
        const fieldKey = `${conflict.id}.${diff.field}`;
        const entityKey = conflict.id;
        return (
          resolutions[fieldKey] !== undefined ||
          resolutions[entityKey] !== undefined
        );
      }).length
    );
  }, 0);

  const allResolved = resolvedFields === totalFields;

  return (
    <div className="conflict-overlay">
      <div className="conflict-modal">
        <div className="conflict-header">
          <span>🔀 發現 {conflicts.length} 項衝突</span>
          <Tooltip content="取消存檔">
            <button
              className="conflict-close"
              onClick={onCancel}
              title="取消存檔"
              type="button"
            >
              ×
            </button>
          </Tooltip>
        </div>

        <p className="conflict-desc">
          儲存時，以下項目在你編輯期間已被其他人修改。請為每個欄位選擇要保留的版本，再確認存檔。
        </p>

        <div className="conflict-list">
          {conflicts.map((conflict) => {
            const cardResolved = conflict.fieldDiffs.every((diff) => {
              const fieldKey = `${conflict.id}.${diff.field}`;
              return (
                resolutions[fieldKey] !== undefined ||
                resolutions[conflict.id] !== undefined
              );
            });

            return (
              <div
                key={conflict.id}
                className={`conflict-card${cardResolved ? " conflict-card-resolved" : ""}`}
              >
                <div className="conflict-card-title">
                  <span
                    className={`conflict-type-badge conflict-type-${conflict.entityType}`}
                  >
                    {ENTITY_TYPE_LABEL[conflict.entityType]}
                  </span>
                  <span className="conflict-entity-name">
                    {conflict.entityLabel}
                  </span>
                  {cardResolved && (
                    <span className="conflict-choice-tag">✓ 已決策</span>
                  )}
                </div>

                <div className="conflict-timestamps">
                  <span>你的編輯：{formatTs(conflict.localUpdatedAt)}</span>
                  <span className="conflict-ts-vs">vs</span>
                  <span>對方編輯：{formatTs(conflict.remoteUpdatedAt)}</span>
                </div>

                <div className="conflict-table-wrap">
                  <table className="conflict-table">
                    <thead>
                      <tr>
                        <th className="col-field">欄位</th>
                        <th className="col-val">你的版本</th>
                        <th className="col-val">對方版本</th>
                        <th className="col-choice-header">選擇</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conflict.fieldDiffs.map((diff) => {
                        const fieldKey = `${conflict.id}.${diff.field}`;
                        const chosen: "local" | "remote" | undefined =
                          resolutions[fieldKey] ?? resolutions[conflict.id];

                        return (
                          <tr
                            key={diff.field}
                            className={chosen ? `field-row-${chosen}` : ""}
                          >
                            <td className="col-field-label">{diff.label}</td>
                            <td
                              className={`col-val-cell${chosen === "local" ? " val-winner" : ""}`}
                            >
                              <RichValueCell
                                val={diff.localVal}
                                rawVal={diff.rawLocalVal}
                                field={diff.field}
                              />
                            </td>
                            <td
                              className={`col-val-cell${chosen === "remote" ? " val-winner" : ""}`}
                            >
                              <RichValueCell
                                val={diff.remoteVal}
                                rawVal={diff.rawRemoteVal}
                                field={diff.field}
                              />
                            </td>
                            <td className="col-choice-cell">
                              <button
                                className={`col-choice-btn${chosen === "local" ? " col-choice-btn-chosen" : ""}`}
                                onClick={() =>
                                  onChange(conflict.id, diff.field, "local")
                                }
                                title="保留你的版本"
                                type="button"
                              >
                                {chosen === "local" ? "✓ 你的" : "你的"}
                              </button>
                              <button
                                className={`col-choice-btn col-choice-btn-remote${chosen === "remote" ? " col-choice-btn-chosen" : ""}`}
                                onClick={() =>
                                  onChange(conflict.id, diff.field, "remote")
                                }
                                title="使用對方版本"
                                type="button"
                              >
                                {chosen === "remote" ? "✓ 對方" : "對方"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="conflict-choice-row">
                  <span className="conflict-shortcut-label">快捷：</span>
                  <button
                    className="conflict-btn conflict-btn-sm"
                    onClick={() => onChange(conflict.id, "*", "local")}
                    type="button"
                  >
                    全選你的版本
                  </button>
                  <button
                    className="conflict-btn conflict-btn-sm"
                    onClick={() => onChange(conflict.id, "*", "remote")}
                    type="button"
                  >
                    全選對方版本
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="conflict-footer">
          <span className="conflict-progress">
            已決策 {resolvedFields} / {totalFields} 個欄位
          </span>
          <div className="conflict-footer-btns">
            <button className="btn-secondary" onClick={onCancel} type="button">
              取消存檔
            </button>
            <button
              className="btn-primary"
              onClick={onConfirm}
              disabled={!allResolved}
              title={!allResolved ? "請先為所有衝突欄位選擇版本" : undefined}
              type="button"
            >
              確認存檔
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
