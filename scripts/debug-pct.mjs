import fs from "fs";
const data = JSON.parse(fs.readFileSync("ogsm_data.json", "utf8"));
const dept = data.departments[0];
const period = dept.periods[0];
const goals = period.ogsm.goals;

for (const goal of goals) {
  const pctKpis = (goal.goalKpis || []).filter(
    (gk) => gk.type === "pct_activity",
  );
  if (!pctKpis.length) continue;
  console.log("\n=== Goal:", goal.label, goal.title?.substring(0, 40));
  for (const pct of pctKpis) {
    console.log(
      " pct GoalKPI:",
      pct.label,
      "| pct.target:",
      pct.target,
      "| threshIds:",
      pct.thresholdGoalKpiIds,
    );
    for (const tid of pct.thresholdGoalKpiIds || []) {
      const threshGk = (goal.goalKpis || []).find((g) => g.id === tid);
      if (!threshGk) {
        console.log("  !!! thresh NOT FOUND:", tid);
        continue;
      }
      console.log(
        " thresh GoalKPI:",
        threshGk.label,
        "| thresh.target:",
        threshGk.target,
        "| unit:",
        threshGk.unit,
        "| linkedKpis#:",
        threshGk.linkedKpis?.length,
      );
      for (const link of threshGk.linkedKpis || []) {
        const s = goal.strategies.find((s) => s.id === link.strategyId);
        const m = s?.measures.find((m) => m.id === link.measureId);
        const k = m?.kpis.find((k) => k.id === link.kpiId);
        const met = k ? (k.actual ?? 0) >= threshGk.target : "???";
        console.log(
          `   link kpiId:${link.kpiId} | s?${!!s} m?${!!m} k?${!!k} | ${k ? k.label + " actual=" + k.actual + " met=" + met : "NOT RESOLVED"}`,
        );
      }
    }
  }
}
