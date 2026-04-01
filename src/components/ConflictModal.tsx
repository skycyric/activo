import type { ConflictEntry, ConflictResolutions } from "../utils/merge";

interface Props {
  conflicts: ConflictEntry[];
  resolutions: ConflictResolutions;
  onChange: (id: string, choice: "local" | "remote") => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const ENTITY_TYPE_LABEL: Record<string, string> = {
  goal: "目標",
  strategy: "策略",
  team: "團隊",
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
  const resolvedCount = Object.keys(resolutions).length;
  const allResolved = resolvedCount === conflicts.length;

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
          儲存時，以下項目在你編輯期間已被其他人修改。請逐項選擇要保留的版本，再確認存檔。
        </p>

        {/* Conflict cards */}
        <div className="conflict-list">
          {conflicts.map((c) => {
            const choice = resolutions[c.id];
            return (
              <div
                key={c.id}
                className={`conflict-card${choice ? " conflict-card-resolved" : ""}`}
              >
                {/* Card title row */}
                <div className="conflict-card-title">
                  <span
                    className={`conflict-type-badge conflict-type-${c.entityType}`}
                  >
                    {ENTITY_TYPE_LABEL[c.entityType]}
                  </span>
                  <span className="conflict-entity-name">{c.entityLabel}</span>
                  {choice && (
                    <span className="conflict-choice-tag">
                      {choice === "local" ? "✓ 保留你的版本" : "✓ 使用對方版本"}
                    </span>
                  )}
                </div>

                {/* Timestamps */}
                <div className="conflict-timestamps">
                  <span>你的編輯：{formatTs(c.localUpdatedAt)}</span>
                  <span className="conflict-ts-vs">vs</span>
                  <span>對方編輯：{formatTs(c.remoteUpdatedAt)}</span>
                </div>

                {/* Field diff table */}
                <div className="conflict-table-wrap">
                  <table className="conflict-table">
                    <thead>
                      <tr>
                        <th className="col-field">欄位</th>
                        <th
                          className={`col-val${choice === "local" ? " col-winner" : ""}`}
                        >
                          你的版本
                        </th>
                        <th
                          className={`col-val${choice === "remote" ? " col-winner" : ""}`}
                        >
                          對方版本
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.fieldDiffs.map((d) => (
                        <tr key={d.field}>
                          <td className="col-field-label">{d.label}</td>
                          <td
                            className={`col-val-cell${choice === "local" ? " val-winner" : ""}`}
                          >
                            {d.localVal}
                          </td>
                          <td
                            className={`col-val-cell${choice === "remote" ? " val-winner" : ""}`}
                          >
                            {d.remoteVal}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Choice buttons */}
                <div className="conflict-choice-row">
                  <button
                    className={`conflict-btn${choice === "local" ? " conflict-btn-chosen" : ""}`}
                    onClick={() => onChange(c.id, "local")}
                  >
                    {choice === "local" ? "✓ " : ""}保留你的版本
                  </button>
                  <button
                    className={`conflict-btn${choice === "remote" ? " conflict-btn-chosen" : ""}`}
                    onClick={() => onChange(c.id, "remote")}
                  >
                    {choice === "remote" ? "✓ " : ""}使用對方版本
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="conflict-footer">
          <span className="conflict-progress">
            已選擇 {resolvedCount} / {conflicts.length}
          </span>
          <div className="conflict-footer-btns">
            <button className="btn-secondary" onClick={onCancel}>
              取消存檔
            </button>
            <button
              className="btn-primary"
              onClick={onConfirm}
              disabled={!allResolved}
              title={!allResolved ? "請先為所有衝突選擇版本" : undefined}
            >
              確認存檔
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
