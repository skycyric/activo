import { readFileSync } from "fs";
const s = readFileSync("src/components/StrategyList.tsx", "utf8").replace(
  /\r\n/g,
  "\n",
);
const lines = s.split("\n");
const bad = [];
for (let i = 540; i < 790; i++) {
  const l = lines[i];
  const q = l.split('"').length - 1;
  if (q % 2 !== 0) bad.push(`${i + 1}: ${l.slice(0, 100)}`);
}
if (bad.length) {
  console.log("Lines with odd double-quote count:");
  bad.forEach((b) => console.log(b));
} else {
  console.log("No lines with odd double-quote count found");
}
