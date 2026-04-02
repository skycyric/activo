/**
 * Second patch for remaining corruptions in src/components/StrategyList.tsx
 * Fixes unterminated string literals not caught by first patch
 */
import { readFileSync, writeFileSync } from "fs";

const filePath = "src/components/StrategyList.tsx";
let content = readFileSync(filePath, "utf8");
const hasCRLF = content.includes("\r\n");
content = content.replace(/\r\n/g, "\n");
const lines = content.split("\n");

let changed = 0;

function fixLineByNo(lineNo, oldContent, newContent, desc) {
  const idx = lineNo - 1;
  if (lines[idx] !== oldContent) {
    // try without trailing \r
    const trimmed = lines[idx].replace(/\r$/, "");
    if (trimmed !== oldContent.replace(/\r$/, "")) {
      console.warn(`✗ Line ${lineNo} mismatch for: ${desc}`);
      console.warn(`  Expected: ${JSON.stringify(oldContent.slice(0, 80))}`);
      console.warn(`  Got:      ${JSON.stringify(lines[idx].slice(0, 80))}`);
      return false;
    }
  }
  lines[idx] = newContent;
  console.log(`✓ Fixed line ${lineNo}: ${desc}`);
  changed++;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// Fix 1: Line 413 – unterminated placeholder for activity name input
// (no closing " because the string was unterminated in the original file)
// ─────────────────────────────────────────────────────────────────────────
fixLineByNo(
  413,
  `              placeholder="\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f`,
  `              placeholder="請輸入活動名稱"`,
  "placeholder for pct_activity name input",
);

// ─────────────────────────────────────────────────────────────────────────
// Fix 2: Line 455 – unterminated placeholder for KPI target input
// ─────────────────────────────────────────────────────────────────────────
fixLineByNo(
  455,
  `              placeholder="\x3f\x3f\x3f\x3f\x3f`,
  `              placeholder="目標值"`,
  "placeholder for KPI target input",
);

// ─────────────────────────────────────────────────────────────────────────
// Fix 3: Lines 529/531/533 – unterminated ternary branch strings (type labels)
// ─────────────────────────────────────────────────────────────────────────
fixLineByNo(
  529,
  `                  ? "\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f`,
  `                  ? "活動達標率"`,
  "pct_activity type label",
);
fixLineByNo(
  531,
  `                    ? "\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f`,
  `                    ? "進度"`,
  "progress type label",
);
fixLineByNo(
  533,
  `                      ? "\x3f\x3f\x3f\x3f\x3f\x3f\x3f`,
  `                      ? "加總"`,
  "SUM aggregation label",
);

// ─────────────────────────────────────────────────────────────────────────
// Fix 4: Line 534 – corrupted else branch + closing expression
// Current: : "????????}{"  "}  (note: single space in {" "})
// Should be: : "平均"}{" "}
// ─────────────────────────────────────────────────────────────────────────
fixLineByNo(
  534,
  `                      : "\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f}{" "}`,
  `                      : "平均"}{" "}`,
  "AVERAGE aggregation label + JSX expression close",
);

// ─────────────────────────────────────────────────────────────────────────
// Fix 5: Line 537 – template literal missing closing backtick
// Current: : `? ${gk.linkedKpis.length} ?????}
// Should be: : `🔗 ${gk.linkedKpis.length} 個連結`}
// ─────────────────────────────────────────────────────────────────────────
fixLineByNo(
  537,
  "                  : `\x3f ${gk.linkedKpis.length} \x3f\x3f\x3f\x3f\x3f}",
  "                  : `🔗 ${gk.linkedKpis.length} 個連結`}",
  "linkedKpis count template literal (restore closing backtick)",
);

// ─────────────────────────────────────────────────────────────────────────
// Fix 6: Line 589 – ternary with absorbed closing quote
// Current: {gk.isHeadline ? "?? : "--"}
// Should be: {gk.isHeadline ? "⭐" : "--"}
// ─────────────────────────────────────────────────────────────────────────
fixLineByNo(
  589,
  `                  {gk.isHeadline ? "\x3f\x3f : "--"}`,
  `                  {gk.isHeadline ? "⭐" : "--"}`,
  "isHeadline ternary display",
);

// ─────────────────────────────────────────────────────────────────────────
// Done
// ─────────────────────────────────────────────────────────────────────────
if (hasCRLF) {
  content = lines.join("\r\n");
} else {
  content = lines.join("\n");
}

writeFileSync(filePath, content, "utf8");
console.log(`\nDone. ${changed} fixes applied.`);
