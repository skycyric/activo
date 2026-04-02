// patch-strategylist-v7.cjs – Final fix: line 1112 ternary with absorbed colon
const fs = require("fs");
const filePath = "src/components/StrategyList.tsx";
let content = fs.readFileSync(filePath, "utf8");
const hasCRLF = content.includes("\r\n");
content = content.split("\r\n").join("\n");
const lines = content.split("\n");

const lineNo = 1112;
// Current: {showKpiPanel ? "??? ?? : "??? ??}  (absorbed ternary colon)
const old =
  '              {showKpiPanel ? "\x3f\x3f\x3f \x3f\x3f : "\x3f\x3f\x3f \x3f\x3f}';
const fix = '              {showKpiPanel ? "▲ 收起" : "▽ 展開"}';

if (lines[lineNo - 1] === old) {
  lines[lineNo - 1] = fix;
  console.log("Fixed line " + lineNo + ": showKpiPanel ternary label");
} else {
  console.warn("MISMATCH:");
  console.warn("  expected: " + JSON.stringify(old));
  console.warn("  got:      " + JSON.stringify(lines[lineNo - 1]));
}

content = hasCRLF ? lines.join("\r\n") : lines.join("\n");
fs.writeFileSync(filePath, content, "utf8");
