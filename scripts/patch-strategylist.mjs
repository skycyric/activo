/**
 * One-shot patch for StrategyList.tsx:
 * 1. Add import for computeGoalKpiResult from utils/goalKpi
 * 2. Replace the inline computeGoalKpi function body with a one-liner wrapper
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = join(__dirname, "../src/components/StrategyList.tsx");

let src = readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n"); // normalize CRLF → LF
const orig = src;

// ── Step 1: add import ────────────────────────────────────────────────────────
const importAnchor = `import { countStrategyWarnings } from "../utils/planWarnings";`;
if (!src.includes('from "../utils/goalKpi"')) {
  src = src.replace(
    importAnchor,
    `${importAnchor}\nimport { computeGoalKpiResult } from "../utils/goalKpi";`,
  );
  console.log("✓ Added import");
} else {
  console.log("• import already present");
}

// ── Step 2: replace computeGoalKpi body ──────────────────────────────────────
// Marker: the function opens with exactly this line
const funcOpen =
  "  const computeGoalKpi = (gk: GoalKPI) => {\n" +
  '    const gkType = gk.type ?? "value";';

// The function closes before "  const saveKpi = () => {"
// We identify the close by finding the function body end.
// Since the body is complex we use a regex to match between the two anchors.
// Use simpler anchors that don't contain Chinese text
const startMarker =
  "  const computeGoalKpi = (gk: GoalKPI) => {\n" +
  '    const gkType = gk.type ?? "value";';

// Find the LAST occurrence of "  };\n\n  const saveKpi" which closes the function
const endMarker = "  };\n\n  const saveKpi = () => {";

const startIdx = src.indexOf(startMarker);
const endIdx = src.indexOf(endMarker);

if (startIdx === -1) {
  console.error("✗ Could not find computeGoalKpi start marker");
  process.exit(1);
}
if (endIdx === -1) {
  console.error("✗ Could not find computeGoalKpi end marker");
  process.exit(1);
}

const endOfBodyIdx = endIdx + endMarker.length; // points past the "};\n\n  const saveKpi = () => {"

const replacement =
  "  // computeGoalKpi 已抽取至 utils/goalKpi.ts（computeGoalKpiResult）\n" +
  "  const computeGoalKpi = (gk: GoalKPI) => computeGoalKpiResult(gk, goal);\n" +
  "\n" +
  "  const saveKpi = () => {";

src = src.slice(0, startIdx) + replacement + src.slice(endOfBodyIdx);

console.log(`✓ Replaced computeGoalKpi body`);
console.log(`  Original length: ${orig.length}, New length: ${src.length}`);

// ── Write ─────────────────────────────────────────────────────────────────────
writeFileSync(filePath, src, "utf-8");
console.log("✓ Written to", filePath);

// ── Quick sanity check ────────────────────────────────────────────────────────
const lines = src.split("\n");
console.log(`  Total lines: ${lines.length}`);
const importLine = lines.findIndex((l) =>
  l.includes('from "../utils/goalKpi"'),
);
const wrapperLine = lines.findIndex((l) =>
  l.includes("computeGoalKpiResult(gk, goal)"),
);
const saveKpiLine = lines.findIndex((l) =>
  l.trim().startsWith("const saveKpi"),
);
console.log(`  import at line: ${importLine + 1}`);
console.log(`  wrapper at line: ${wrapperLine + 1}`);
console.log(`  saveKpi at line: ${saveKpiLine + 1}`);
