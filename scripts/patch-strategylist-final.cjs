// patch-strategylist-final.cjs
// Restore all remaining ?? UI text in StrategyList.tsx
const fs = require("fs");
const filePath = "src/components/StrategyList.tsx";
let content = fs.readFileSync(filePath, "utf8");
const hasCRLF = content.includes("\r\n");
content = content.split("\r\n").join("\n");
let changed = 0;

function rep(old, neu, desc) {
  if (!content.includes(old)) {
    console.warn("NOT FOUND: " + desc);
    return;
  }
  content = content.replace(old, neu);
  console.log("✓ " + desc);
  changed++;
}

function repAll(old, neu, desc) {
  if (!content.includes(old)) {
    console.warn("NOT FOUND: " + desc);
    return;
  }
  let count = 0;
  while (content.includes(old)) {
    content = content.replace(old, neu);
    count++;
  }
  console.log("✓ " + desc + " (" + count + "x)");
  changed++;
}

// ── StrategyRow meta-tag badges ─────────────────────────────────────────────
rep(
  '<span className="meta-tag">\x3f\x3f {kpiCount} KPI</span>',
  '<span className="meta-tag">🎯 {kpiCount} KPI</span>',
  "meta-tag: KPI count",
);
rep(
  "                \x3f\x3f{measuresAchieved}/{measuresTotal} M",
  "                ✅ {measuresAchieved}/{measuresTotal} M",
  "meta-tag: measures achieved",
);
rep(
  '<span className="meta-tag">\x3f\x3f {sBudget.toLocaleString()}</span>',
  '<span className="meta-tag">💰 {sBudget.toLocaleString()}</span>',
  "meta-tag: budget",
);
rep(
  '{hasDays && <span className="meta-tag">\x3f\x3f {sDays} \x3f\x3f\x3f\x3f</span>}',
  '{hasDays && <span className="meta-tag">⏱ {sDays} 人天</span>}',
  "meta-tag: person-days",
);
rep(
  "                \x3f\x3f {warnCounts.overdue}",
  "                🔴 {warnCounts.overdue}",
  "meta-tag: overdue count",
);
rep(
  "                \x3f\x3f\x3f {warnCounts.warning}",
  "                ⚠️ {warnCounts.warning}",
  "meta-tag: warning count",
);

// ── Empty state (no goal selected) ──────────────────────────────────────────
rep(
  '<div className="empty-icon">\x3f\x3f</div>',
  '<div className="empty-icon">📋</div>',
  "empty-icon emoji",
);
rep(
  "<p>\x3f\x3f\x3f G1\x3f\x3f2 \x3f\x3fG3 \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f</p>",
  "<p>請在左側選擇一個目標（如 G1、G2、G3）以查看策略</p>",
  "empty-state: no goal description",
);

// ── pct_activity editing form (inline on existing card) ──────────────────────
rep(
  'placeholder="\x3f\x3f\x3f\x3f\x3f\x3f\x3f%"',
  'placeholder="目標達成率 %"',
  "pct form target placeholder",
);
rep(
  '<button className="g-kpi-btn-save" onClick={savePct}>\n              \x3f\x3f\x3f\n            </button>',
  '<button className="g-kpi-btn-save" onClick={savePct}>\n              儲存\n            </button>',
  "savePct button (inline form)",
);
rep(
  '              className="g-kpi-btn-cancel"\n              onClick={() => setEditingPctId(null)}\n            >\n              \x3f\x3f\x3f\n            </button>',
  '              className="g-kpi-btn-cancel"\n              onClick={() => setEditingPctId(null)}\n            >\n              取消\n            </button>',
  "cancelPct button (inline form)",
);

// ── KPI editing form (inline on existing card) ──────────────────────────────
rep(
  'placeholder="\x3f\x3f\x3f\x3f\x3f\x3f"',
  'placeholder="KPI 名稱"',
  "kpiForm.label placeholder",
);
rep(
  // unit input – inline form (line ~461)
  '              className="g-kpi-input g-kpi-unit"\n              placeholder="\x3f\x3f\x3f"',
  '              className="g-kpi-input g-kpi-unit"\n              placeholder="單位"',
  "kpiForm.unit placeholder (inline form)",
);
repAll(
  '<option value="SUM">\x3f\x3f\x3f</option>',
  '<option value="SUM">加總</option>',
  '<option value="SUM"> content',
);
repAll(
  '<option value="AVERAGE">\x3f\x3f\x3f</option>',
  '<option value="AVERAGE">平均</option>',
  '<option value="AVERAGE"> content',
);
// isHeadline checkbox label (inline form)
rep(
  "setKpiForm({ ...kpiForm, isHeadline: e.target.checked })\n                }\n              />\n              \x3f\x3f\x3f\n            </label>",
  "setKpiForm({ ...kpiForm, isHeadline: e.target.checked })\n                }\n              />\n              主要 KPI\n            </label>",
  "isHeadline checkbox label (inline form)",
);
rep(
  '<button className="g-kpi-btn-save" onClick={saveKpi}>\n              \x3f\x3f\x3f\n            </button>',
  '<button className="g-kpi-btn-save" onClick={saveKpi}>\n              儲存\n            </button>',
  "saveKpi button (inline form)",
);
rep(
  "              onClick={() => setEditingKpiId(null)}\n            >\n              \x3f\x3f\x3f\n            </button>",
  "              onClick={() => setEditingKpiId(null)}\n            >\n              取消\n            </button>",
  "cancelKpi button (inline form)",
);

// ── KPI card display area ────────────────────────────────────────────────────
rep(
  "`\x3f ${(gk.thresholdGoalKpiIds ?? []).length} \x3f\x3f\x3f\x3f\x3fGoalKPI`",
  "`🔗 ${(gk.thresholdGoalKpiIds ?? []).length} 個門檻 GoalKPI`",
  "g-kpi-meta: pct_activity threshold count",
);

// Action buttons: btn-link for pct_activity (threshold picker)
rep(
  '>\n                  \x3f\x3f \x3f\x3f\x3f\x3f\x3f\x3f\n                </button>\n              ) : (\n                <button\n                  className="g-kpi-btn-link"',
  '>\n                  🔗 設定門檻\n                </button>\n              ) : (\n                <button\n                  className="g-kpi-btn-link"',
  "g-kpi-btn-link: pct_activity (設定門檻)",
);
// Action buttons: btn-link for value/progress (link picker)
rep(
  ">\n                  \x3f\x3f \x3f\x3f\x3f\n                </button>",
  ">\n                  🔗 連結\n                </button>",
  "g-kpi-btn-link: value/progress (連結)",
);
// btn-headline tooltip
rep(
  'title={gk.isHeadline ? "\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f" : "\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f"}',
  'title={gk.isHeadline ? "取消設為主要 KPI" : "設為主要 KPI"}',
  "btn-headline tooltip",
);
// btn-edit content
rep(
  '>\n                \x3f\x3f{" "}\n              </button>\n              <button\n                className="g-kpi-btn-del"',
  '>\n                編輯{" "}\n              </button>\n              <button\n                className="g-kpi-btn-del"',
  "btn-edit content",
);
// btn-del content
rep(
  "onClick={() => deleteKpi(gk.id)}\n              >\n                \x3f\x3f\n              </button>",
  "onClick={() => deleteKpi(gk.id)}\n              >\n                刪除\n              </button>",
  "btn-del content",
);

// ── measureRawText fallback ──────────────────────────────────────────────────
rep(
  'm?.rawText ?? "\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f"',
  'm?.rawText ?? "未知度量指標"',
  "measureRawText fallback",
);

// ── Threshold picker (pct_activity) ─────────────────────────────────────────
rep(
  '                  \x3f\x3f\x3f\x3f\x3f\x3f GoalKPI\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f{" "}',
  '                  選取門檻 GoalKPI{" "}',
  "threshold picker title",
);
rep(
  '                  \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f GoalKPI \x3f\x3f\x3f\x3f\x3f\x3f\x3f{" "}',
  '                  勾選哪些 GoalKPI 作為活動達標率的門檻來源{" "}',
  "threshold picker hint",
);
rep(
  '                    \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3fGoalKPI\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3fKPI \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f M\n                    KPI\x3f\x3f{" "}',
  '                    目前沒有可選的 GoalKPI，請先建立已連結 M KPI 的 GoalKPI{" "}',
  "threshold picker empty state",
);
// Threshold picker item: 目標 value unit / 個已連結
rep(
  '                          \x3f\x3f\x3f{" "}',
  '                          目標{" "}',
  "threshold picker item: 目標 label",
);
rep(
  '                          {" \x3f "}',
  '                          {" / "}',
  "threshold picker item: separator",
);
rep(
  '                          {g.linkedKpis.length} \x3f\x3f\x3f\x3f\x3f{" "}',
  '                          {g.linkedKpis.length} 個已連結{" "}',
  "threshold picker item: linked count",
);

// ── Conflict section ─────────────────────────────────────────────────────────
rep(
  '                      \x3f\x3f\x3f \x3f\x3f\x3f {conflictedMeasures.length}{" "}',
  '                      ⚠️ 衝突 {conflictedMeasures.length}{" "}',
  "conflict section title: count",
);
rep(
  '                      \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f{" "}',
  '                      個度量指標同時被多個 GoalKPI 引用，請選擇要使用的來源{" "}',
  "conflict section: description",
);
rep(
  "                            \x3f\x3f {srcs[0].measureRawText}",
  "                            度量：{srcs[0].measureRawText}",
  "conflict measure name prefix",
);
rep(
  '                            \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f{" "}',
  '                            被多個來源引用：{" "}',
  "conflict reason text",
);
rep(
  ".map((s) => `\x3f\x3f${s.threshGkLabel}\x3f\x3f`)",
  ".map((s) => `「${s.threshGkLabel}」`)",
  "conflict source label template",
);
rep('.join(" \x3f\x3f")}', '.join("、")}', "conflict source join separator");

// ── Link picker (value/progress M KPI) ───────────────────────────────────────
rep(
  '<div className="g-kpi-link-picker-title">\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f M KPI</div>',
  '<div className="g-kpi-link-picker-title">選擇連結的 M KPI</div>',
  "link picker title",
);
// Link picker empty state: when q has results (search no results)
rep(
  '? "\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f"\n                      : gkType === "progress"',
  '? "找不到符合的結果"\n                      : gkType === "progress"',
  "link picker empty: no search results",
);
// Link picker empty state: progress type
rep(
  '? "\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3fKPI \x3f\x3f\x3f\x3f\x3f"',
  '? "沒有可連結的進度型 KPI 度量指標"',
  "link picker empty: progress type",
);
// Link picker empty state: value type
rep(
  ': "\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f M \x3f\x3fKPI \x3f\x3f\x3f\x3f\x3f"}',
  ': "沒有可連結的數值型 M KPI 度量指標"}',
  "link picker empty: value type",
);
// Link picker item: actual value label
rep(
  '                    \x3f\x3f{" "}\n                      {k.actual',
  '                    實際{" "}\n                      {k.actual',
  "link picker item: 實際 label",
);

// ── Activity breakdown ────────────────────────────────────────────────────────
rep(
  "{activities.filter((a) => !a.met).length} \x3f\x3f\x3f",
  "{activities.filter((a) => !a.met).length} 未達標",
  "activity toggle: unmet count label",
);
repAll(
  '{" / \x3f\x3f\x3f "}',
  '{" / 目標 "}',
  "activity detail: 目標 separator",
);
// Activity empty: no threshold set
rep(
  "                \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f \x3f\x3f \x3f\x3f\x3f\x3f\x3f\x3f \x3f\x3f\x3f GoalKPI \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f",
  "                尚未設定任何門檻 GoalKPI，請點擊上方「🔗 設定門檻」按鈕",
  "activity empty: no threshold",
);
// Activity empty: no linked M KPI
rep(
  '                \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3fGoalKPI \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f M KPI\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f GoalKPI \x3f\x3f\x3f \x3f\x3f\n                \x3f\x3f\x3f\x3f\x3f{" "}',
  '                所選的 GoalKPI 尚未連結任何 M KPI，請先為 GoalKPI 新增連結{" "}',
  "activity empty: no linked M KPI",
);

// ── Goal header ───────────────────────────────────────────────────────────────
rep(
  'title="\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f"',
  'title="雙擊可編輯目標標題"',
  "goal title: double-click hint",
);
rep(
  '                  \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f{" "}',
  '                  （尚未輸入標題）{" "}',
  "goal title: empty placeholder",
);
rep(
  '            title="\x3f\x3f\x3f\x3f\x3f\x3f"',
  '            title="刪除此目標"',
  "delete goal button tooltip",
);
rep(
  "            >\n            \x3f\x3f \x3f\x3f\x3f\n          </button>",
  "            >\n            🗑 刪除\n          </button>",
  "delete goal button text",
);

// ── g-pct-panel (活動達標率) ───────────────────────────────────────────────────
rep(
  '              <div className="g-kpi-empty">\n                \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f{" "}\n              </div>',
  '              <div className="g-kpi-empty">\n                尚未建立活動達標率 KPI，點擊下方按鈕新增{" "}\n              </div>',
  "g-pct-panel: empty state",
);
// pct add button
rep(
  '                \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f{" "}',
  '                ＋ 新增活動達標率 KPI{" "}',
  "g-pct-add-btn text",
);
// g-pct-new-form input placeholder
rep(
  '                    placeholder="\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f"',
  '                    placeholder="請輸入活動達標率 KPI 名稱"',
  "g-pct-new-form: name placeholder",
);
rep(
  '                      placeholder="\x3f\x3f\x3f %"',
  '                      placeholder="目標 %"',
  "g-pct-new-form: target placeholder",
);
rep(
  '                  <button className="g-kpi-btn-save" onClick={savePct}>\n                    \x3f\x3f\x3f\n                  </button>',
  '                  <button className="g-kpi-btn-save" onClick={savePct}>\n                    儲存\n                  </button>',
  "g-pct-new-form: save button",
);
rep(
  "                  onClick={() => setEditingPctId(null)}\n                >\n                  \x3f\x3f\x3f\n                </button>",
  "                  onClick={() => setEditingPctId(null)}\n                >\n                  取消\n                </button>",
  "g-pct-new-form: cancel button",
);
rep(
  '                  \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f GoalKPI\n                  \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3fM KPI\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\n                  \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f{" "}',
  '                  此區塊顯示連結了 GoalKPI\n                  門檻的活動達標率 KPI，M KPI 達成率\n                  需達到設定的目標 %，KPI 才算達標{" "}',
  "g-pct-new-form: hint text",
);

// ── g-kpi-panel (目標 KPI) ────────────────────────────────────────────────────
rep(
  '<span className="g-kpi-panel-title">\x3f\x3f \x3f\x3f\x3f KPI \x3f\x3f\x3f</span>',
  '<span className="g-kpi-panel-title">目標 KPI 清單</span>',
  "g-kpi-panel title",
);
rep(
  '<span className="g-kpi-headline-label">\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f</span>',
  '<span className="g-kpi-headline-label">主要指標</span>',
  "g-kpi-headline-label",
);
rep(
  ': "\x3f\x3f\x3f\x3fKPI \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f"}',
  ': "尚未設定 KPI，點擊「＋新增 KPI」按鈕新增"}',
  "g-kpi-panel: empty state message",
);
// new KPI form unit placeholder (second form in editingKpiId === "new")
rep(
  '                    className="g-kpi-input g-kpi-unit"\n                    placeholder="\x3f\x3f\x3f"',
  '                    className="g-kpi-input g-kpi-unit"\n                    placeholder="單位"',
  "kpiForm.unit placeholder (new form)",
);
// new KPI form: isHeadline checkbox
rep(
  "                      setKpiForm({ ...kpiForm, isHeadline: e.target.checked })\n                    }\n                  />\n                  \x3f\x3f\x3f\n                </label>",
  "                      setKpiForm({ ...kpiForm, isHeadline: e.target.checked })\n                    }\n                  />\n                  主要 KPI\n                </label>",
  "isHeadline checkbox label (new form)",
);
// new KPI form: save button
rep(
  '<button className="g-kpi-btn-save" onClick={saveKpi}>\n                  \x3f\x3f\x3f\n                </button>',
  '<button className="g-kpi-btn-save" onClick={saveKpi}>\n                  儲存\n                </button>',
  "saveKpi button (new form)",
);
// new KPI form: cancel button
rep(
  "                  onClick={() => setEditingKpiId(null)}\n                >\n                  \x3f\x3f\x3f\n                </button>",
  "                  onClick={() => setEditingKpiId(null)}\n                >\n                  取消\n                </button>",
  "cancelKpi button (new form)",
);
// g-kpi-btn-add (add first KPI button)
rep(
  "                  >\n                  \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\n                </button>",
  "                  >\n                  ＋ 新增 KPI\n                </button>",
  "g-kpi-btn-add text",
);

// ── Toolbar ───────────────────────────────────────────────────────────────────
rep(
  '<option value="all">\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f</option>',
  '<option value="all">全部負責人</option>',
  "filter-select: all owners",
);
rep(
  '          className="sl-add-strategy" onClick={onAddStrategy}>\n            \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f{" "}',
  '          className="sl-add-strategy" onClick={onAddStrategy}>\n            ＋ 新增策略{" "}',
  "sl-add-strategy button text",
);

// ── Finish ────────────────────────────────────────────────────────────────────
if (hasCRLF) content = content.split("\n").join("\r\n");
fs.writeFileSync(filePath, content, "utf8");
console.log("\nDone. " + changed + " replacements applied.");
