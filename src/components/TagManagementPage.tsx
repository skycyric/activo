import { useEffect, useState } from "react";
import type { TagDictionaryItem } from "../schemas/ogsm";
import { genId } from "../utils/csvParser";
import { useTour } from "../contexts/TourContext";

export interface TagRename {
  from: string;
  to: string;
}

export interface TagDeleteOp {
  tag: string;
  mode: "remove" | "merge";
  to?: string;
}

interface Props {
  tagDictionary: TagDictionaryItem[];
  isReadOnly?: boolean;
  onUpdateTagDictionary: (
    items: TagDictionaryItem[],
    renames: TagRename[],
    deletes: TagDeleteOp[],
  ) => void;
}

export default function TagManagementPage({
  tagDictionary,
  isReadOnly = false,
  onUpdateTagDictionary,
}: Props) {
  const { startPageTour } = useTour();
  const [tagDraft, setTagDraft] = useState<TagDictionaryItem[]>(() =>
    JSON.parse(JSON.stringify(tagDictionary)),
  );
  const [newTagName, setNewTagName] = useState("");
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  // renames accumulated in this editing session: original name -> new name
  const [renames, setRenames] = useState<TagRename[]>([]);
  const [deletes, setDeletes] = useState<TagDeleteOp[]>([]);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<"remove" | "merge">("merge");
  const [deleteMergeTarget, setDeleteMergeTarget] = useState("");

  useEffect(() => {
    setTagDraft(JSON.parse(JSON.stringify(tagDictionary)));
    setRenames([]);
    setDeletes([]);
    setEditingTagId(null);
    setRenameError(null);
    setDeletingTagId(null);
    setDeleteMode("merge");
    setDeleteMergeTarget("");
  }, [tagDictionary]);

  const cancelEditTag = () => {
    setEditingTagId(null);
    setRenameError(null);
  };

  const startEditTag = (tag: TagDictionaryItem) => {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
    setRenameError(null);
  };

  const commitEditTag = (tagId: string) => {
    const newName = editingTagName.trim().replace(/\s+/g, " ");
    if (!newName) {
      cancelEditTag();
      return;
    }
    const nameExists = tagDraft.some(
      (item) =>
        item.id !== tagId &&
        item.name.toLocaleLowerCase("zh-TW") ===
          newName.toLocaleLowerCase("zh-TW"),
    );
    if (nameExists) {
      setRenameError("標籤名稱已存在，請改用其他名稱。");
      return;
    }
    setTagDraft((prev) =>
      prev.map((item) => {
        if (item.id !== tagId) return item;
        const oldName = item.name;
        if (oldName !== newName) {
          setRenames((r) => {
            // merge: if there was already a rename from->oldName, update its "to"
            const idx = r.findIndex((x) => x.to === oldName);
            if (idx >= 0) {
              const updated = [...r];
              updated[idx] = { ...updated[idx], to: newName };
              return updated;
            }
            return [...r, { from: oldName, to: newName }];
          });
        }
        return { ...item, name: newName };
      }),
    );
    cancelEditTag();
  };

  const addTag = () => {
    const name = newTagName.trim().replace(/\s+/g, " ");
    if (!name) return;
    const exists = tagDraft.some(
      (item) =>
        item.name.toLocaleLowerCase("zh-TW") ===
        name.toLocaleLowerCase("zh-TW"),
    );
    if (exists) return;
    setTagDraft([
      ...tagDraft,
      {
        id: genId("tag"),
        name,
        status: "active",
      },
    ]);
    setNewTagName("");
  };

  const toggleTagStatus = (tagId: string) => {
    setTagDraft((prev) =>
      prev.map((item) =>
        item.id !== tagId
          ? item
          : {
              ...item,
              status: item.status === "active" ? "disabled" : "active",
            },
      ),
    );
  };

  const startDeleteTag = (tag: TagDictionaryItem) => {
    const candidates = tagDraft
      .map((x) => x.name)
      .filter((name) => name !== tag.name)
      .sort((a, b) => a.localeCompare(b, "zh-TW"));
    setDeletingTagId(tag.id);
    if (candidates.length > 0) {
      setDeleteMode("merge");
      setDeleteMergeTarget(candidates[0]);
    } else {
      setDeleteMode("remove");
      setDeleteMergeTarget("");
    }
  };

  const cancelDeleteTag = () => {
    setDeletingTagId(null);
    setDeleteMode("merge");
    setDeleteMergeTarget("");
  };

  const confirmDeleteTag = () => {
    const tag = tagDraft.find((x) => x.id === deletingTagId);
    if (!tag) return;
    const candidates = tagDraft
      .map((x) => x.name)
      .filter((name) => name !== tag.name)
      .sort((a, b) => a.localeCompare(b, "zh-TW"));

    if (deleteMode === "merge") {
      const target = candidates.find((x) => x === deleteMergeTarget);
      if (!target) return;
      setDeletes((prev) => [
        ...prev.filter((x) => x.tag !== tag.name),
        { tag: tag.name, mode: "merge", to: target },
      ]);
    } else {
      setDeletes((prev) => [
        ...prev.filter((x) => x.tag !== tag.name),
        { tag: tag.name, mode: "remove" },
      ]);
    }

    setTagDraft((prev) => prev.filter((item) => item.id !== tag.id));
    cancelDeleteTag();
  };

  const saveTags = () => {
    const cleaned = Array.from(
      new Map(
        tagDraft
          .map((item) => ({
            ...item,
            name: item.name.trim().replace(/\s+/g, " "),
          }))
          .filter((item) => item.name)
          .map((item) => [item.name.toLocaleLowerCase("zh-TW"), item]),
      ).values(),
    ).sort((a, b) => a.name.localeCompare(b.name, "zh-TW"));
    onUpdateTagDictionary(cleaned, renames, deletes);
    setRenames([]);
    setDeletes([]);
  };

  const deletingTag = tagDraft.find((x) => x.id === deletingTagId) ?? null;
  const deleteCandidates = deletingTag
    ? tagDraft
        .map((x) => x.name)
        .filter((name) => name !== deletingTag.name)
        .sort((a, b) => a.localeCompare(b, "zh-TW"))
    : [];
  const canConfirmDelete =
    !!deletingTag &&
    (deleteMode === "remove" ||
      deleteCandidates.some((x) => x === deleteMergeTarget));

  return (
    <div className="dept-settings-page">
      <div className="dept-settings-inner">
        <div className="dsettings-tabs" data-tour="settings-tabs">
          <button className="dsettings-tab active">🏷️ 標籤管理</button>
          <button
            className="page-tour-btn"
            onClick={() => startPageTour("settings")}
          >
            🔎 本頁導覽
          </button>
        </div>

        <section className="dsec" data-tour="settings-team-section">
          <div className="dsec-header">
            <h2 className="dsec-title">🏷️ 活動標籤管理</h2>
            <p className="dsec-desc">
              維護活動可用的標籤字典。活動面板只能選這裡已建立且啟用中的標籤。
            </p>
          </div>
          <div className="team-list">
            <div className="team-card">
              <div className="team-members">
                <div className="team-member-row">
                  <input
                    className="team-member-input"
                    value={newTagName}
                    disabled={isReadOnly}
                    onChange={(e) => setNewTagName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    placeholder={isReadOnly ? "目前為唯讀" : "輸入新標籤名稱"}
                  />
                  <button
                    className="plan-add-item"
                    disabled={isReadOnly || !newTagName.trim()}
                    onClick={addTag}
                  >
                    + 新增標籤
                  </button>
                </div>
              </div>
            </div>

            {tagDraft.length === 0 ? (
              <p style={{ color: "var(--text3)", fontSize: 13 }}>
                尚未建立任何活動標籤。
              </p>
            ) : (
              tagDraft
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name, "zh-TW"))
                .map((tag) => {
                  return (
                    <div key={tag.id} className="team-card">
                      <div className="team-card-header">
                        <div
                          className="sidebar-goal-left"
                          style={{ flex: 1, minWidth: 0 }}
                        >
                          {editingTagId === tag.id ? (
                            <div
                              style={{
                                display: "grid",
                                gap: 4,
                                maxWidth: 260,
                              }}
                            >
                              <input
                                className="team-member-input"
                                style={{ maxWidth: 200 }}
                                autoFocus
                                value={editingTagName}
                                onChange={(e) => {
                                  setEditingTagName(e.target.value);
                                  if (renameError) setRenameError(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    commitEditTag(tag.id);
                                  }
                                  if (e.key === "Escape") cancelEditTag();
                                }}
                                onBlur={() => commitEditTag(tag.id)}
                              />
                              {renameError && (
                                <span
                                  className="team-member-count"
                                  style={{ color: "#dc2626" }}
                                >
                                  {renameError}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="adp-tag">{tag.name}</span>
                          )}
                          <span className="team-member-count">
                            {tag.status === "active" ? "啟用中" : "已停用"}
                          </span>
                          <span
                            className="team-member-count"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <span
                              title="偶合演算法的標籤基礎權重（0.1 ~ 5.0，預設 1.0）"
                              style={{ whiteSpace: "nowrap" }}
                            >
                              ⚖️ 偶合權重
                            </span>
                            <input
                              type="number"
                              min={0.1}
                              max={5}
                              step={0.05}
                              disabled={isReadOnly}
                              value={tag.weight ?? 1}
                              style={{ width: 56, textAlign: "right" }}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (isNaN(v)) return;
                                setTagDraft((prev) =>
                                  prev.map((item) =>
                                    item.id !== tag.id
                                      ? item
                                      : {
                                          ...item,
                                          weight:
                                            Math.round(
                                              Math.max(0.1, Math.min(5, v)) *
                                                100,
                                            ) / 100,
                                        },
                                  ),
                                );
                              }}
                            />
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          {!isReadOnly && editingTagId !== tag.id && (
                            <button
                              className="btn-secondary"
                              title="重新命名標籤"
                              onClick={() => startEditTag(tag)}
                            >
                              ✏️ 改名
                            </button>
                          )}
                          <button
                            className="btn-secondary"
                            disabled={isReadOnly}
                            onClick={() => toggleTagStatus(tag.id)}
                          >
                            {tag.status === "active" ? "停用" : "重新啟用"}
                          </button>
                          <button
                            className="btn-secondary"
                            disabled={isReadOnly}
                            onClick={() => startDeleteTag(tag)}
                            title="刪除標籤（可選合併或移除活動標籤）"
                          >
                            🗑️ 刪除
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
          <div className="dsec-footer">
            <button
              className="btn-add"
              disabled={isReadOnly}
              onClick={saveTags}
            >
              儲存標籤字典
            </button>
          </div>

          {deletingTag && !isReadOnly && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(2,6,23,0.45)",
                display: "grid",
                placeItems: "center",
                zIndex: 60,
                padding: 16,
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label="刪除標籤設定"
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  width: "min(560px, 100%)",
                  background: "var(--surface, #fff)",
                  border: "1px solid rgba(100,116,139,0.55)",
                  borderRadius: 12,
                  boxShadow: "0 16px 40px rgba(15,23,42,0.28)",
                  padding: 16,
                  display: "grid",
                  gap: 12,
                }}
              >
                <div style={{ fontWeight: 700 }}>
                  刪除標籤：{deletingTag.name}
                </div>
                <div style={{ fontSize: 13, color: "var(--text2)" }}>
                  請選擇刪除後的處理方式。點擊背景不會關閉此對話框。
                </div>
                <label
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <input
                    type="radio"
                    name="delete-mode-dialog"
                    value="merge"
                    checked={deleteMode === "merge"}
                    onChange={() => setDeleteMode("merge")}
                    disabled={deleteCandidates.length === 0}
                  />
                  <span>合併到其他標籤</span>
                  <select
                    value={deleteMergeTarget}
                    onChange={(e) => setDeleteMergeTarget(e.target.value)}
                    disabled={
                      deleteMode !== "merge" || deleteCandidates.length === 0
                    }
                    style={{
                      minWidth: 220,
                      padding: "6px 10px",
                      border: "2px solid rgba(71,85,105,0.85)",
                      borderRadius: 8,
                      background: "#fff",
                      color: "#0f172a",
                      boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.25)",
                    }}
                  >
                    {deleteCandidates.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label
                  style={{ display: "flex", alignItems: "center", gap: 8 }}
                >
                  <input
                    type="radio"
                    name="delete-mode-dialog"
                    value="remove"
                    checked={deleteMode === "remove"}
                    onChange={() => setDeleteMode("remove")}
                  />
                  <span>從所有活動移除此標籤</span>
                </label>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                  }}
                >
                  <button className="btn-secondary" onClick={cancelDeleteTag}>
                    取消
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={!canConfirmDelete}
                    onClick={confirmDeleteTag}
                    style={{
                      color: "#dc2626",
                      borderColor: "rgba(220,38,38,0.45)",
                    }}
                  >
                    確認刪除
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
