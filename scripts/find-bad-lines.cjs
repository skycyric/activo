// find-bad-lines-cjs.js
const fs = require("fs");
const s = fs
  .readFileSync("src/components/StrategyList.tsx", "utf8")
  .split("\r\n")
  .join("\n");
const lines = s.split("\n");
const bad = [];
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  if (!l) continue;
  const c = l.split('"').length - 1;
  if (c % 2 !== 0) bad.push(i + 1 + ": " + l.substring(0, 100));
}
if (bad.length === 0) {
  console.log("No lines with odd double-quote count found.");
} else {
  bad.forEach((b) => console.log(b));
}
