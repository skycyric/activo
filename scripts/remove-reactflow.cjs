"use strict";
const fs = require("fs");
let lines = fs
  .readFileSync("src/components/KpiDesigner.tsx", "utf8")
  .split("\n");
const orig = lines.length;

// Process from BOTTOM to TOP so earlier indices stay valid

// 1. Replace ReactFlow render block (lines 2261-2297, 0-indexed 2260-2296)
const rfNew = [
  '        {viewMode === "kpi" && moduleId === "ogsm" ? (',
  "          <KpiCanvas",
  "            draftGoals={draftGoals}",
  "            deptActivities={deptActivities}",
  "            selectedNodeId={selectedNodeId}",
  "            onSelectNode={setSelectedNodeId}",
  "          />",
  "        ) : (",
  "          <ItemCanvas",
  "            data={{ ...data, goals: draftGoals, freeNodes }}",
  "            deptActivities={deptActivities}",
  "            freeNodes={freeNodes}",
  "            selectedNodeId={selectedNodeId}",
  "            moduleId={moduleId}",
  "            onSelectNode={setSelectedNodeId}",
  "          />",
  "        )}",
].map((l) => l + "\r");
lines = [...lines.slice(0, 2260), ...rfNew, ...lines.slice(2297)];
console.log("After ReactFlow replace:", lines.length);

// 2. Remove onEdgesDelete (lines 2081-2124, 0-indexed 2080-2123)
lines = [...lines.slice(0, 2080), ...lines.slice(2124)];
console.log("After onEdgesDelete remove:", lines.length);

// 3. Remove onConnect (lines 2028-2080, 0-indexed 2027-2079) — blank line at 2080 now gone from step 2
lines = [...lines.slice(0, 2027), ...lines.slice(2080)];
console.log("After onConnect remove:", lines.length);

// 4. Remove setNodes block inside updateDraftGk (lines 1997-2023, 0-indexed 1996-2022)
lines = [...lines.slice(0, 1996), ...lines.slice(2023)];
console.log("After updateDraftGk setNodes remove:", lines.length);

// Also fix the dep array: find [deptActivities] after line 1990 and replace with []
for (let i = 1990; i < 2010; i++) {
  if (lines[i] && lines[i].includes("[deptActivities]")) {
    lines[i] = lines[i].replace("[deptActivities]", "[]");
    console.log("Fixed dep array at line:", i + 1);
    break;
  }
}

// 5. Remove 2nd useEffect (lines 1972-1981, 0-indexed 1971-1980)
lines = [...lines.slice(0, 1971), ...lines.slice(1981)];
console.log("After 2nd useEffect remove:", lines.length);

// 6. Remove 1st useEffect (lines 1928-1971, 0-indexed 1927-1970)
lines = [...lines.slice(0, 1927), ...lines.slice(1971)];
console.log("After 1st useEffect remove:", lines.length);

// 7. Remove nodes/edges useState + blank line (lines 1921-1927, 0-indexed 1920-1926)
lines = [...lines.slice(0, 1920), ...lines.slice(1927)];
console.log("After useState remove:", lines.length);

// 8. Remove prevViewModeRef (search near line 1916)
let prevIdx = -1;
for (let i = 1900; i < 1930; i++) {
  if (lines[i] && lines[i].includes("prevViewModeRef")) {
    prevIdx = i;
    break;
  }
}
if (prevIdx >= 0) {
  console.log("prevViewModeRef at 1-indexed:", prevIdx + 1, lines[prevIdx]);
  lines = [...lines.slice(0, prevIdx), ...lines.slice(prevIdx + 1)];
} else {
  console.log("prevViewModeRef not found in range");
}
console.log("After prevViewModeRef remove:", lines.length);

// 9. Remove buildKpiNodes (lines 335-461, 0-indexed 334-460)
lines = [...lines.slice(0, 334), ...lines.slice(461)];
console.log("After buildKpiNodes remove:", lines.length);

console.log("Lines:", orig, "->", lines.length);
fs.writeFileSync("src/components/KpiDesigner.tsx", lines.join("\n"), "utf8");
console.log("Done");
