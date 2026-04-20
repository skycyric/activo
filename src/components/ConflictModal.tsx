import type { ConflictEntry, ConflictResolutions } from "../utils/merge";

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

export default function ConflictModal({
  conflicts,
  resolutions,
  onChange,
  onConfirm,
  onCancel,
}: Props) {
  // 計算總欄位數與已決策數（以 field-level key 計算）
  const totalFields = conflicts.reduce(
    (sum, c) => sum + c.fieldDiffs.length,
    0,
  );
  const resolvedFields = conflicts.reduce((sum, c) => {
    return (
      sum +
      c.fieldDiffs.filter((d) => {
        const fieldKey = `${c.id}.${d.field}`;
        const entityKey = c.id;
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
        {/* Header */}
        <div className="conflict-header">
          <span>🔀 發現 {conflicts.length} 項衝突</span>
          <button
            className="conflict-close"
            onClick={onCancel}
            title="取消存檔"
          >
            ×
          </button>
        </div>

        <p className="conflict-desc">
          儲存時，以下項目在你編輯期間已被其他人修改。請為每個欄位選擇要保留的版本，再確認存檔。
        </p>

        {/* Conflict cards */}
        <div className="conflict-list">
          {conflicts.map((c) => {
            // 判斷此卡片所有欄位是否全都已決策
            const cardResolved = c.fieldDiffs.every((d) => {
              const fieldKey = `${c.id}.${d.field}`;
              return (
                resolutions[fieldKey] !== undefined ||
                resolutions[c.id] !== undefined
              );
            });
            return (
              <div
                key={c.id}
                className={`conflict-card${cardResolved ? " conflict-card-resolved" : ""}`}
              >
                {/* Card title row */}
                <div className="conflict-card-title">
                  <span
                    className={`conflict-type-badge conflict-type-${c.entityType}`}
                  >
                    {ENTITY_TYPE_LABEL[c.entityType]}
                  </span>
                  <span className="conflict-entity-name">{c.entityLabel}</span>
                  {cardResolved && (
                    <span className="conflict-choice-tag">✓ 已決策</span>
                  )}
                </div>

                {/* Timestamps */}
                <div className="conflict-timestamps">
                  <span>你的編輯：{formatTs(c.localUpdatedAt)}</span>
                  <span className="conflict-ts-vs">vs</span>
                  <span>對方編輯：{formatTs(c.remoteUpdatedAt)}</span>
                </div>

                {/* Field diff table — each row has per-field choice buttons */}
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
                      {c.fieldDiffs.map((d) => {
                        const fieldKey = `${c.id}.${d.field}`;
                        // field-level 優先，fallback entity-level
                        const chosen: "local" | "remote" | undefined =
                          resolutions[fieldKey] ?? resolutions[c.id];
                        return (
                          <tr
                            key={d.field}
                            className={chosen ? `field-row-${chosen}` : ""}
                          >
                            <td className="col-field-label">{d.label}</td>
                            <td
                              className={`col-val-cell${chosen === "local" ? " val-winner" : ""}`}
                            >
                              {d.localVal}
                            </td>
                            <td
                              className={`col-val-cell${chosen === "remote" ? " val-winner" : ""}`}
                            >
                              {d.remoteVal}
                            </td>
                            <td className="col-choice-cell">
                              <button
                                className={`col-choice-btn${chosen === "local" ? " col-choice-btn-chosen" : ""}`}
                                onClick={() => onChange(c.id, d.field, "local")}
                                title="保留你的版本"
                              >
                                {chosen === "local" ? "✓ 你的" : "你的"}
                              </button>
                              <button
                                className={`col-choice-btn col-choice-btn-remote${chosen === "remote" ? " col-choice-btn-chosen" : ""}`}
                                onClick={() =>
                                  onChange(c.id, d.field, "remote")
                                }
                                title="使用對方版本"
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

                {/* Card-level shortcuts */}
                <div className="conflict-choice-row">
                  <span className="conflict-shortcut-label">快捷：</span>
                  <button
                    className="conflict-btn conflict-btn-sm"
                    onClick={() => onChange(c.id, "*", "local")}
                  >
                    全選你的版本
                  </button>
                  <button
                    className="conflict-btn conflict-btn-sm"
                    onClick={() => onChange(c.id, "*", "remote")}
                  >
                    全選對方版本
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="conflict-footer">
          <span className="conflict-progress">
            已決策 {resolvedFields} / {totalFields} 個欄位
          </span>
          <div className="conflict-footer-btns">
            <button className="btn-secondary" onClick={onCancel}>
              取消存檔
            </button>
            <button
              className="btn-primary"
              onClick={onConfirm}
              disabled={!allResolved}
              title={!allResolved ? "請先為所有衝突欄位選擇版本" : undefined}
            >
              確認存檔
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
