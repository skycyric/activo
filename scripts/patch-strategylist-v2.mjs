/**
 * Comprehensive patch for src/components/StrategyList.tsx
 * 1. Fix pre-existing encoding corruptions (broken JSX, unterminated strings)
 * 2. Add import for computeGoalKpiResult
 * 3. Replace ~255-line inline computeGoalKpi with 1-line wrapper
 */
import { readFileSync, writeFileSync } from "fs";

const filePath = "src/components/StrategyList.tsx";

// Read original (restored from git HEAD via Node binary pipe)
let content = readFileSync(filePath, "utf8");
const hasCRLF = content.includes("\r\n");

// Normalize to LF for processing
content = content.replace(/\r\n/g, "\n");

const originalLength = content.split("\n").length;
let changed = 0;

function replace(oldStr, newStr, desc) {
  const idx = content.indexOf(oldStr);
  if (idx === -1) {
    console.warn(
      `✗ Not found: ${desc} (old: ${JSON.stringify(oldStr.slice(0, 60))})`,
    );
    return;
  }
  content = content.replace(oldStr, newStr);
  console.log(`✓ Fixed: ${desc}`);
  changed++;
}

// ─────────────────────────────────────────────────────────────────────────
// A. Fix broken closing tags (missing `<` before `/tag>`)
//    Pattern: a run of `?` immediately before `/span>`, `/h2>`, `/option>`, `/p>`
// ─────────────────────────────────────────────────────────────────────────

const brokenTagRe = /(\?+)(\/(?:span|h2|option|p)>)/g;
const brokenMatches = [...content.matchAll(brokenTagRe)];
if (brokenMatches.length > 0) {
  content = content.replace(brokenTagRe, "$1<$2");
  console.log(
    `✓ Fixed ${brokenMatches.length} broken closing tags (inserted missing '<')`,
  );
  changed++;
} else {
  console.warn("✗ No broken closing tags found");
}

// ─────────────────────────────────────────────────────────────────────────
// B. Line 552 – unterminated string in deleteKpi
//    const label = ... ?? "?????;
// ─────────────────────────────────────────────────────────────────────────
replace(
  `    const label = goalKpis.find((gk) => gk.id === id)?.label ?? "?????;`,
  `    const label = goalKpis.find((gk) => gk.id === id)?.label ?? "未知 KPI";`,
  "Line 552: unterminated string in deleteKpi",
);

// ─────────────────────────────────────────────────────────────────────────
// C. Line 553 – corrupt template literal in confirm dialog
//    if (!window.confirm(`????????G ????????{label}?????)) return;
// ─────────────────────────────────────────────────────────────────────────
replace(
  "    if (!window.confirm(`\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3fG \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f{label}\x3f\x3f\x3f\x3f\x3f)) return;",
  "    if (!window.confirm(`確定要刪除 KPI「${label}」？`)) return;",
  "Line 553: corrupt template literal in confirm",
);

// ─────────────────────────────────────────────────────────────────────────
// D. Lines 793/802 – corrupted label spans (???)
//    <span className="g-kpi-val-label">???</span> appears twice:
//    first instance is "actual" label, second is "target" label
// ─────────────────────────────────────────────────────────────────────────
const valLabelCorrupt = `<span className="g-kpi-val-label">???</span>`;
const firstIdx = content.indexOf(valLabelCorrupt);
if (firstIdx === -1) {
  console.warn("✗ Not found: g-kpi-val-label actual");
} else {
  const secondIdx = content.indexOf(valLabelCorrupt, firstIdx + 1);
  if (secondIdx === -1) {
    console.warn("✗ Not found: g-kpi-val-label target (second occurrence)");
  } else {
    // Replace first occurrence (actual label)
    content =
      content.slice(0, firstIdx) +
      `<span className="g-kpi-val-label">實際</span>` +
      content.slice(firstIdx + valLabelCorrupt.length);
    // Find second occurrence again after first replacement (offsets changed)
    const newSecondIdx = content.indexOf(valLabelCorrupt);
    content =
      content.slice(0, newSecondIdx) +
      `<span className="g-kpi-val-label">目標</span>` +
      content.slice(newSecondIdx + valLabelCorrupt.length);
    console.log("✓ Fixed: Lines 793/802 – g-kpi-val-label actual/target");
    changed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// E. Lines 794/803 – unterminated string in actual/target null fallback
//    : "??}  (appears twice, same content)
// ─────────────────────────────────────────────────────────────────────────
// These appear as content of ternary: actual !== null ? ... : "??}
// The "??} closes the JSX expression, the string is missing its closing "
// Replace both occurrences
let countE = 0;
while (content.includes(`: "\x3f\x3f}`)) {
  content = content.replace(`: "\x3f\x3f}`, `: "--"}`);
  countE++;
  if (countE > 10) break; // safety
}
if (countE > 0) {
  console.log(
    `✓ Fixed ${countE} occurrences of unterminated \"??} fallback strings`,
  );
  changed++;
}

// ─────────────────────────────────────────────────────────────────────────
// F. Line 799 – missing `{` before metCount
//    ??metCount}/{totalCount}??  inside a <span>
// ─────────────────────────────────────────────────────────────────────────
replace(
  "\x3f\x3fmetCount}/{totalCount}\x3f\x3f",
  "{metCount}/{totalCount}",
  "Line 799: missing { before metCount",
);

// ─────────────────────────────────────────────────────────────────────────
// G. Lines 1172/1199 – unterminated string in measureRawText fallback
//    (a.measureRawText || "????????).substring(  appears twice
// ─────────────────────────────────────────────────────────────────────────
let countG = 0;
while (
  content.includes(
    `(a.measureRawText || "\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f).substring(`,
  )
) {
  content = content.replace(
    `(a.measureRawText || "\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f).substring(`,
    `(a.measureRawText || "").substring(`,
  );
  countG++;
  if (countG > 5) break;
}
if (countG > 0) {
  console.log(
    `✓ Fixed ${countG} occurrences of unterminated measureRawText fallback strings`,
  );
  changed++;
}

// ─────────────────────────────────────────────────────────────────────────
// H. Lines 1179/1206 – missing `{` before a.chosenSrcLabel}
//    ????a.chosenSrcLabel}??  inside a span badge (appears twice)
// ─────────────────────────────────────────────────────────────────────────
let countH = 0;
while (content.includes("\x3f\x3f\x3f\x3fa.chosenSrcLabel}\x3f\x3f")) {
  content = content.replace(
    "\x3f\x3f\x3f\x3fa.chosenSrcLabel}\x3f\x3f",
    "{a.chosenSrcLabel}",
  );
  countH++;
  if (countH > 5) break;
}
if (countH > 0) {
  console.log(`✓ Fixed ${countH} occurrences of ????a.chosenSrcLabel}??`);
  changed++;
}

// ─────────────────────────────────────────────────────────────────────────
// I. Lines 1184/1211 – unterminated string in displayRate null fallback
//    : "??}  (this is a different context than E – inside activity rate ternary)
// ─────────────────────────────────────────────────────────────────────────
// Already handled by fix E above (same pattern)

// ─────────────────────────────────────────────────────────────────────────
// J. Lines 1186/1213 – unterminated string in chosenTarget
//    {a.chosenTarget ?? "??}%  appears twice
// ─────────────────────────────────────────────────────────────────────────
let countJ = 0;
while (content.includes(`{a.chosenTarget ?? "\x3f\x3f}%`)) {
  content = content.replace(
    `{a.chosenTarget ?? "\x3f\x3f}%`,
    `{a.chosenTarget !== null ? a.chosenTarget : "--"}%`,
  );
  countJ++;
  if (countJ > 5) break;
}
if (countJ > 0) {
  console.log(
    `✓ Fixed ${countJ} occurrences of unterminated chosenTarget fallback`,
  );
  changed++;
}

// ─────────────────────────────────────────────────────────────────────────
// K. Line 1294 – broken span title (missing < was already fixed by step A)
//    Content fix: ?? ??????????</span> → 活動達標率</span>
// ─────────────────────────────────────────────────────────────────────────
replace(
  `<span className="g-pct-panel-title">\x3f\x3f \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f</span>`,
  `<span className="g-pct-panel-title">活動達標率</span>`,
  "Line 1294: g-pct-panel-title content",
);

// ─────────────────────────────────────────────────────────────────────────
// L. Lines 728/1427 – option "value" content fix (after < was re-inserted)
// ─────────────────────────────────────────────────────────────────────────
let countL = 0;
while (
  content.includes(`<option value="value">\x3f\x3f\x3f\x3f\x3f</option>`)
) {
  content = content.replace(
    `<option value="value">\x3f\x3f\x3f\x3f\x3f</option>`,
    `<option value="value">數值</option>`,
  );
  countL++;
  if (countL > 5) break;
}
if (countL > 0) {
  console.log(
    `✓ Fixed ${countL} occurrences of <option value="value"> content`,
  );
  changed++;
}

// ─────────────────────────────────────────────────────────────────────────
// M. Lines 729/1428 – option "progress" content fix
// ─────────────────────────────────────────────────────────────────────────
let countM = 0;
while (
  content.includes(
    `<option value="progress">\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f</option>`,
  )
) {
  content = content.replace(
    `<option value="progress">\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f</option>`,
    `<option value="progress">進度</option>`,
  );
  countM++;
  if (countM > 5) break;
}
if (countM > 0) {
  console.log(
    `✓ Fixed ${countM} occurrences of <option value="progress"> content`,
  );
  changed++;
}

// ─────────────────────────────────────────────────────────────────────────
// N. Lines 1170/1197 – activity icon spans (met=✅, unmet=❌)
//    After fix A: <span className="g-kpi-activity-icon">??</span>
//    Both occurrences - first is "met", second is "unmet"
// ─────────────────────────────────────────────────────────────────────────
const actIconCorrupt = `<span className="g-kpi-activity-icon">\x3f\x3f</span>`;
const firstIconIdx = content.indexOf(actIconCorrupt);
if (firstIconIdx === -1) {
  console.warn("✗ Not found: g-kpi-activity-icon met span");
} else {
  const secondIconIdx = content.indexOf(actIconCorrupt, firstIconIdx + 1);
  if (secondIconIdx === -1) {
    console.warn(
      "✗ Not found: g-kpi-activity-icon unmet span (second occurrence)",
    );
  } else {
    content =
      content.slice(0, firstIconIdx) +
      `<span className="g-kpi-activity-icon">✅</span>` +
      content.slice(firstIconIdx + actIconCorrupt.length);
    const newSecondIconIdx = content.indexOf(actIconCorrupt);
    content =
      content.slice(0, newSecondIconIdx) +
      `<span className="g-kpi-activity-icon">❌</span>` +
      content.slice(newSecondIconIdx + actIconCorrupt.length);
    console.log("✓ Fixed: Lines 1170/1197 – activity icon spans (✅/❌)");
    changed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// O. Line 191 – broken h2 in empty state
//    <h2>????????????G??</h2>  (after fix A re-inserted <)
// ─────────────────────────────────────────────────────────────────────────
// The raw content after fix A: ????????????G??</h2>
replace(
  `<h2>\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3fG\x3f\x3f</h2>`,
  `<h2>目前沒有任何策略</h2>`,
  "Line 191: empty state h2 content",
);

// ─────────────────────────────────────────────────────────────────────────
// P. Line 1527 – broken p in empty state (strategies.length === 0)
//    <p>?????????????????????????????</p>  (after fix A re-inserted <)
// ─────────────────────────────────────────────────────────────────────────
replace(
  `<p>\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f</p>`,
  `<p>目前此目標下沒有任何策略，請點擊「新增策略」按鈕開始。</p>`,
  "Line 1527: empty strategies state message",
);

// ─────────────────────────────────────────────────────────────────────────
// Q. Add import for computeGoalKpiResult (after last existing import)
// ─────────────────────────────────────────────────────────────────────────
const importTarget = `import { countStrategyWarnings } from "../utils/planWarnings";`;
replace(
  importTarget,
  `import { countStrategyWarnings } from "../utils/planWarnings";\nimport { computeGoalKpiResult } from "../utils/goalKpi";`,
  "Add import computeGoalKpiResult",
);

// ─────────────────────────────────────────────────────────────────────────
// R. Replace computeGoalKpi function body (lines 205–459) with 1-line wrapper
// ─────────────────────────────────────────────────────────────────────────
const fnStart = `  const computeGoalKpi = (gk: GoalKPI) => {\n    const gkType = gk.type ?? "value";`;
const fnStartIdx = content.indexOf(fnStart);
if (fnStartIdx === -1) {
  console.warn("✗ Not found: computeGoalKpi function start");
} else {
  // Find the closing `  };` of this function
  let depth = 0;
  let pos = fnStartIdx;
  let fnEndIdx = -1;
  for (; pos < content.length; pos++) {
    if (content[pos] === "{") depth++;
    else if (content[pos] === "}") {
      depth--;
      if (depth === 0) {
        // Include the trailing \n after `  };`
        fnEndIdx = pos + 1;
        if (content[fnEndIdx] === "\n") fnEndIdx++;
        break;
      }
    }
  }
  if (fnEndIdx === -1) {
    console.warn("✗ Could not find end of computeGoalKpi function");
  } else {
    const oldFn = content.slice(fnStartIdx, fnEndIdx);
    const newFn = `  // computeGoalKpi 已抽取至 utils/goalKpi.ts（computeGoalKpiResult）\n  const computeGoalKpi = (gk: GoalKPI) => computeGoalKpiResult(gk, goal!);\n`;
    content = content.slice(0, fnStartIdx) + newFn + content.slice(fnEndIdx);
    const removed = oldFn.split("\n").length - newFn.split("\n").length;
    console.log(`✓ Replaced computeGoalKpi (~${removed} lines removed)`);
    changed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Restore CRLF if original had it
// ─────────────────────────────────────────────────────────────────────────
if (hasCRLF) {
  content = content.replace(/\n/g, "\r\n");
}

writeFileSync(filePath, content, "utf8");
const newLength = content.replace(/\r\n/g, "\n").split("\n").length;
console.log(
  `\nDone. Lines: ${originalLength} → ${newLength} (${originalLength - newLength} removed), ${changed} fixes applied.`,
);
