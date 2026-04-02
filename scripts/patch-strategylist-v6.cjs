// patch-strategylist-v6.cjs
// Fix all remaining unterminated string literals in StrategyList.tsx
const fs = require("fs");
const filePath = "src/components/StrategyList.tsx";
let content = fs.readFileSync(filePath, "utf8");
const hasCRLF = content.includes("\r\n");
content = content.split("\r\n").join("\n");
const lines = content.split("\n");
let changed = 0;

function fixLine(lineNo, oldContent, newContent, desc) {
  const idx = lineNo - 1;
  if (lines[idx] === oldContent) {
    lines[idx] = newContent;
    console.log("Fixed line " + lineNo + ": " + desc);
    changed++;
    return true;
  }
  console.warn("MISMATCH line " + lineNo + ": " + desc);
  console.warn("  expected: " + JSON.stringify(oldContent.slice(0, 90)));
  console.warn("  got:      " + JSON.stringify(lines[idx].slice(0, 90)));
  return false;
}

// Fix 1: Line 807 – unterminated placeholder in KPI search input
fixLine(
  807,
  '              placeholder="\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f KPI \x3f\x3f\x3f\x3f\x3f',
  '              placeholder="搜尋 KPI 或度量指標"',
  "KPI search input placeholder",
);

// Fix 2: Line 867 – unterminated fallback string in measure raw text display
fixLine(
  867,
  '                      {m.rawText.substring(0, 20) || "\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f}',
  '                      {m.rawText.substring(0, 20) || ""}',
  "measure rawText fallback string",
);

// Fix 3: Line 874 – unterminated separator string
fixLine(
  874,
  '                      {" / \x3f\x3f}',
  '                      {" / "}',
  "actual/target separator string",
);

// Fix 4: Line 907 – ternary with absorbed colon (same pattern as line 589)
// Current: {showActivityBreakdown === gk.id ? "?? : "--"}
// Fixed:   {showActivityBreakdown === gk.id ? "▲" : "▶"}
fixLine(
  907,
  '                  {showActivityBreakdown === gk.id ? "\x3f\x3f : "--"} \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f                  {activities.filter((a) => a.met).length} \x3f\x3f/{" "}',
  '                  {showActivityBreakdown === gk.id ? "▲" : "▶"} 達標{" "}',
  "activity breakdown toggle button label (line 907)",
);

// Fix 5: Line 1130 – unterminated string in link-picker empty state (progress type)
fixLine(
  1130,
  '                    ? "\x3f\x3f\x3f\x3f\x3f\x3f KPI\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f \x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f',
  '                    ? "找不到符合的進度型 KPI 度量指標"',
  "link-picker empty state (progress type)",
);

// Fix 6: Line 1139 – unterminated placeholder in KPI target input (second form)
fixLine(
  1139,
  '                    placeholder="\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f',
  '                    placeholder="目標值"',
  "KPI target input placeholder (second form)",
);

// Fix 7: Line 1149 – unterminated placeholder in KPI unit input (second form)
fixLine(
  1149,
  '                    placeholder="\x3f\x3f\x3f\x3f\x3f',
  '                    placeholder="單位"',
  "KPI unit input placeholder (second form)",
);

content = hasCRLF ? lines.join("\r\n") : lines.join("\n");
fs.writeFileSync(filePath, content, "utf8");
console.log("Done. " + changed + "/7 fixes applied.");
