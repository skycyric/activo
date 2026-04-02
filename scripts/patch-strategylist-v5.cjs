// patch-strategylist-v5.cjs
// Fix line 837: unterminated string in link-picker empty state ternary
const fs = require("fs");
const filePath = "src/components/StrategyList.tsx";
let content = fs.readFileSync(filePath, "utf8");
const hasCRLF = content.includes("\r\n");
content = content.split("\r\n").join("\n");
const lines = content.split("\n");

const lineNo = 837;
const expected = '                      ? "\x3f\x3f\x3f\x3f\x3f\x3f\x3f\x3f';
const replacement = '                      ? "????????"';

if (lines[lineNo - 1] !== expected) {
  console.warn("MISMATCH:");
  console.warn("  expected: " + JSON.stringify(expected));
  console.warn("  got:      " + JSON.stringify(lines[lineNo - 1]));
} else {
  lines[lineNo - 1] = replacement;
  console.log(
    "Fixed line " + lineNo + ": unterminated string in link-picker empty state",
  );
}

content = hasCRLF ? lines.join("\r\n") : lines.join("\n");
fs.writeFileSync(filePath, content, "utf8");
