import fs from "node:fs";
import path from "node:path";

const dataPath = path.resolve(process.cwd(), "ogsm_data.json");
if (!fs.existsSync(dataPath)) {
  console.error(
    `Error: ogsm_data.json not found at ${dataPath}\nRun this script from the project root directory.`,
  );
  process.exit(1);
}
const raw = fs.readFileSync(dataPath, "utf8");
const data = JSON.parse(raw);

// Measure -> accepted ActionPlan aliases for domain naming differences.
const MEASURE_PLAN_ALIASES = new Map([
  [
    "主題線上互動活動-會員互動活動-暑期互動-小學課本的逆襲-心理測驗",
    ["暑期活動心理測驗-小學生", "暑期活動心理測驗"],
  ],
]);

const normalize = (s) => (s || "").replace(/\s+/g, "").toLowerCase();

function isSemanticallyMatched(measureTitle, linkedPlanTitle) {
  const m = normalize(measureTitle);
  const p = normalize(linkedPlanTitle);

  if (!m || !p) return false;
  if (m === p) return true;
  if (m.includes(p) || p.includes(m)) return true;

  const aliases = MEASURE_PLAN_ALIASES.get(measureTitle.trim()) || [];
  return aliases.some((alias) => {
    const a = normalize(alias);
    return a === p || a.includes(p) || p.includes(a);
  });
}

const goals = data?.departments?.[0]?.periods?.[0]?.ogsm?.goals || [];
const stateRows = [];
const semanticMismatches = [];

for (const goal of goals) {
  for (const strategy of goal.strategies || []) {
    const plans = strategy.actionPlans || [];
    const measures = strategy.measures || [];

    for (const measure of measures) {
      const measureTitle = (measure.rawText || "").trim();
      const linkedPlanTitles = [];
      let linkedItemCount = 0;

      for (const ap of plans) {
        const hitCount = (ap.items || []).filter(
          (it) => it.linkedMeasureId === measure.id,
        ).length;
        if (hitCount > 0) {
          linkedPlanTitles.push(ap.title || "");
          linkedItemCount += hitCount;
        }
      }

      const sameTitlePlans = plans.filter(
        (ap) => (ap.title || "").trim() === measureTitle,
      );

      let state = "待建立";
      if (linkedItemCount > 0) state = "已關聯";
      else if (sameTitlePlans.length > 0) state = "空殼已建";

      stateRows.push({
        goal: goal.label,
        strategyId: strategy.id,
        measureId: measure.id,
        measure: measureTitle,
        state,
        sameTitlePlanCount: sameTitlePlans.length,
        linkedItemCount,
      });

      if (linkedPlanTitles.length > 0) {
        const ok = linkedPlanTitles.some((title) =>
          isSemanticallyMatched(measureTitle, title),
        );
        if (!ok) {
          semanticMismatches.push({
            goal: goal.label,
            strategyId: strategy.id,
            measure: measureTitle,
            linkedPlanTitles,
          });
        }
      }
    }
  }
}

const summary = {
  totalMeasures: stateRows.length,
  linked: stateRows.filter((r) => r.state === "已關聯").length,
  shell: stateRows.filter((r) => r.state === "空殼已建").length,
  todo: stateRows.filter((r) => r.state === "待建立").length,
  semanticMismatchCount: semanticMismatches.length,
};

const output = {
  summary,
  semanticMismatches,
  notReadyRows: stateRows.filter((r) => r.state !== "已關聯"),
};

console.log(JSON.stringify(output, null, 2));

if (summary.todo > 0 || summary.semanticMismatchCount > 0) {
  process.exitCode = 1;
}
