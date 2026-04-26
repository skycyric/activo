import { useEffect, useState } from "react";
import type { TagDictionaryItem } from "../schemas/ogsm";
import { genId } from "../utils/csvParser";
import { useTour } from "../contexts/TourContext";

export interface TagRename {
  from: string;
  to: string;
}

interface Props {
  tagDictionary: TagDictionaryItem[];
  isReadOnly?: boolean;
  onUpdateTagDictionary: (
    items: TagDictionaryItem[],
    renames: TagRename[],
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
  // renames accumulated in this editing session: original name -> new name
  const [renames, setRenames] = useState<TagRename[]>([]);

  useEffect(() => {
    setTagDraft(JSON.parse(JSON.stringify(tagDictionary)));
    setRenames([]);
    setEditingTagId(null);
  }, [tagDictionary]);

  const startEditTag = (tag: TagDictionaryItem) => {
    setEditingTagId(tag.id);
    setEditingTagName(tag.name);
  };

  const commitEditTag = (tagId: string) => {
    const newName = editingTagName.trim().replace(/\s+/g, " ");
    if (!newName) {
      setEditingTagId(null);
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
    setEditingTagId(null);
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
    onUpdateTagDictionary(cleaned, renames);
    setRenames([]);
  };

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
                .map((tag) => (
                  <div key={tag.id} className="team-card">
                    <div className="team-card-header">
                      <div
                        className="sidebar-goal-left"
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        {editingTagId === tag.id ? (
                          <input
                            className="team-member-input"
                            style={{ maxWidth: 200 }}
                            autoFocus
                            value={editingTagName}
                            onChange={(e) => setEditingTagName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitEditTag(tag.id);
                              }
                              if (e.key === "Escape") setEditingTagId(null);
                            }}
                            onBlur={() => commitEditTag(tag.id)}
                          />
                        ) : (
                          <span className="adp-tag">{tag.name}</span>
                        )}
                        <span className="team-member-count">
                          {tag.status === "active" ? "啟用中" : "已停用"}
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
                      </div>
                    </div>
                  </div>
                ))
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
        </section>
      </div>
    </div>
  );
}
