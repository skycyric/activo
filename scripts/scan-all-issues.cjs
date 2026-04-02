// scan-all-issues.cjs
// Find ALL lines with unclosed string literals or template literals
const fs = require("fs");
const content = fs
  .readFileSync("src/components/StrategyList.tsx", "utf8")
  .split("\r\n")
  .join("\n");
const lines = content.split("\n");

// Pass 1: odd double-quote count (simple heuristic for unterminated strings)
console.log("=== Lines with odd double-quote count ===");
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const c = l.split('"').length - 1;
  if (c % 2 !== 0) console.log(`${i + 1}: ${l.substring(0, 120)}`);
}

// Pass 2: lines where pattern ?: "xxx or : "xxx ends the line without closing "
// (already captured above)

// Pass 3: template literal backtick counting (needs state)
console.log(
  "\n=== Potential unclosed template literals (single backtick lines not in string context) ===",
);
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  const c = l.split("`").length - 1;
  if (c % 2 !== 0)
    console.log(`${i + 1} (${c} backticks): ${l.substring(0, 120)}`);
}
