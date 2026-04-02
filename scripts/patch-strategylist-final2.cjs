// patch-strategylist-final2.cjs  – fix remaining ?? items
const fs = require("fs");
const path = "src/components/StrategyList.tsx";
let c = fs.readFileSync(path, "utf8");
const hasCRLF = c.includes("\r\n");
c = c.split("\r\n").join("\n");
let n = 0;

function rep(old, neu, tag) {
  if (!c.includes(old)) {
    console.warn("NOT FOUND: " + tag);
    return;
  }
  c = c.replace(old, neu);
  console.log("✓ " + tag);
  n++;
}

// threshold picker hint (line ~713)
rep(
  c.match(/(\s+)\?\?+\s+GoalKPI\s+\?+\{" "\}/)?.[0] ? "" : null,
  null,
  "_skip_regex_test",
);
// Use regex replace for hint line
c = c.replace(
  /( {18})\?{18,}\s+GoalKPI\s+\?{5,}\{" "\}/,
  '$1勾選哪些 GoalKPI 作為活動達標率的門檻來源{" "}',
);
if (c.includes("勾選哪些")) {
  console.log("✓ threshold picker hint (regex)");
  n++;
} else console.warn("NOT FIXED: threshold picker hint");

// threshold picker empty state (lines ~717-718, spans two lines)
c = c.replace(
  /( {20})\?{10,}GoalKPI\?{5,}KPI [^\n]+\n\s+KPI\?+\{" "\}/,
  '$1目前沒有可選的 GoalKPI，請先建立已連結 M KPI 的 GoalKPI{" "}',
);
if (c.includes("目前沒有可選")) {
  console.log("✓ threshold picker empty (regex)");
  n++;
} else console.warn("NOT FIXED: threshold picker empty");

// conflict description (line ~751)
c = c.replace(
  /( {22})\?{40,}\{" "\}/,
  '$1個度量指標同時被多個 GoalKPI 引用，請選擇要使用的來源{" "}',
);
if (c.includes("個度量指標同時")) {
  console.log("✓ conflict description (regex)");
  n++;
} else console.warn("NOT FIXED: conflict description");

// activity empty: no threshold (line ~897)
rep(
  "                \u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f \u003f\u003f \u003f\u003f\u003f\u003f\u003f\u003f \u003f\u003f\u003f GoalKPI \u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f",
  "                尚未設定任何門檻 GoalKPI，請點擊上方「🔗 設定門檻」按鈕",
  "activity empty: no threshold (exact)",
);
// fallback regex
if (!c.includes("尚未設定任何門檻")) {
  c = c.replace(
    /( {16})\?{16,} \?{2} \?{6} \?{3} GoalKPI \?{12}/,
    "$1尚未設定任何門檻 GoalKPI，請點擊上方「🔗 設定門檻」按鈕",
  );
  if (c.includes("尚未設定任何門檻")) {
    console.log("✓ activity empty: no threshold (regex)");
    n++;
  } else console.warn("NOT FIXED: activity empty no threshold");
}

// delete goal button (lines ~1038-1040)
rep(
  "          >\n            \u003f\u003f \u003f\u003f\u003f\n          </button>",
  "          >\n            🗑 刪除\n          </button>",
  "delete goal button (10-space >)",
);

// g-pct-panel empty state (line ~1051)
c = c.replace(
  /( {16})\?{20,} \?{8,}\{" "\}/,
  '$1尚未建立活動達標率 KPI，點擊下方按鈕新增{" "}',
);
if (c.includes("尚未建立活動達標率")) {
  console.log("✓ g-pct-panel empty state (regex)");
  n++;
} else console.warn("NOT FIXED: g-pct-panel empty state");

// cancel in g-pct-new-form (line ~1097, 20-space indent)
rep(
  '                    className="g-kpi-btn-cancel"\n                    onClick={() => setEditingPctId(null)}\n                  >\n                    \u003f\u003f\u003f\n                  </button>',
  '                    className="g-kpi-btn-cancel"\n                    onClick={() => setEditingPctId(null)}\n                  >\n                    取消\n                  </button>',
  "cancel button g-pct-new-form",
);

// hint text in g-pct-new-form (lines ~1101-1103)
c = c.replace(
  /( {18})\?{30,} GoalKPI\n\s+\?{25,}M KPI\?+\n\s+\?{15,} %\?+ % \?+\{" "\}/,
  '$1此 KPI 根據設定的 GoalKPI\n                  門檻來計算活動達標率，M KPI 度量指標\n                  需達到目標 %，活動 % 才算達標{" "}',
);
if (c.includes("此 KPI 根據設定")) {
  console.log("✓ g-pct-form hint (regex)");
  n++;
} else console.warn("NOT FIXED: g-pct-form hint");

// new KPI form: isHeadline checkbox label (line ~1216, 20-space indent)
rep(
  "                    />\n                    \u003f\u003f\u003f\n                  </label>",
  "                    />\n                    主要 KPI\n                  </label>",
  "isHeadline label (new form)",
);

// new KPI form: saveKpi button (line ~1219, 20-space indent)
rep(
  '                  <button className="g-kpi-btn-save" onClick={saveKpi}>\n                    \u003f\u003f\u003f\n                  </button>',
  '                  <button className="g-kpi-btn-save" onClick={saveKpi}>\n                    儲存\n                  </button>',
  "saveKpi button (new form)",
);

// new KPI form: cancelKpi button (line ~1225, 20-space indent)
rep(
  "                    onClick={() => setEditingKpiId(null)}\n                  >\n                    \u003f\u003f\u003f\n                  </button>",
  "                    onClick={() => setEditingKpiId(null)}\n                  >\n                    取消\n                  </button>",
  "cancelKpi button (new form)",
);

// g-kpi-btn-add (add KPI button, line ~1244, 18-space indent)
rep(
  "                >\n                  \u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\n                </button>",
  "                >\n                  ＋ 新增 KPI\n                </button>",
  "g-kpi-btn-add text",
);

// sl-add-strategy button (line ~1267)
rep(
  '          <button className="sl-add-strategy" onClick={onAddStrategy}>\n            \u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f{" "}',
  '          <button className="sl-add-strategy" onClick={onAddStrategy}>\n            ＋ 新增策略{" "}',
  "sl-add-strategy button text",
);

if (hasCRLF) c = c.split("\n").join("\r\n");
fs.writeFileSync(path, c, "utf8");
console.log("\nDone – " + n + " fixes applied.");
