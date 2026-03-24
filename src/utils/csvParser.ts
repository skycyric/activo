import type {
  OGSMData,
  Goal,
  Strategy,
  Measure,
  ActionPlan,
  PlanItem,
  KPI,
  Status,
} from "../types/ogsm";

export function genId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─── CSV Parser ────────────────────────────────────────────────────────────

export function parseCSVRaw(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const row: string[] = [];

    while (
      i < len &&
      text[i] !== "\n" &&
      !(text[i] === "\r" && text[i + 1] === "\n")
    ) {
      if (text[i] === '"') {
        let field = "";
        i++; // skip opening "
        while (i < len) {
          if (text[i] === '"') {
            if (i + 1 < len && text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            field += text[i++];
          }
        }
        row.push(field);
      } else {
        let field = "";
        while (
          i < len &&
          text[i] !== "," &&
          text[i] !== "\r" &&
          text[i] !== "\n"
        ) {
          field += text[i++];
        }
        row.push(field.trim());
      }
      if (i < len && text[i] === ",") i++;
      else break;
    }
    if (i < len && text[i] === "\r") i++;
    if (i < len && text[i] === "\n") i++;
    if (row.some((c) => c.trim() !== "")) rows.push(row);
  }
  return rows;
}

// ─── KPI Extractor ────────────────────────────────────────────────────────

export function extractKPIs(text: string): KPI[] {
  const kpis: KPI[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    const rateMatch = line.match(/達成率[：:=＝]?\s*(\d+(?:\.\d+)?)%/);
    if (!rateMatch) continue;

    const rate = parseFloat(rateMatch[1]);
    const targetMatch = line.match(
      /目標[：:]?\s*(?:觸及\s*)?(\d+(?:[,，]\d+)?)\s*(人|名|筆|組|次)?/,
    );
    const actualMatch = line.match(
      /(?:實際|已)[^，,。\n]{0,10}?(\d+(?:[,，]\d+)?)\s*(人|名|筆|組)/,
    );

    kpis.push({
      id: genId("kpi"),
      label: line.trim().substring(0, 40).replace(/\s+/g, " "),
      target: targetMatch
        ? parseFloat(targetMatch[1].replace(/[,，]/g, ""))
        : null,
      actual: actualMatch
        ? parseFloat(actualMatch[1].replace(/[,，]/g, ""))
        : null,
      unit: targetMatch?.[2] || actualMatch?.[2] || "%",
      achievementRate: rate,
    });
  }

  return kpis;
}

// ─── Status from rate ─────────────────────────────────────────────────────

export function computeStatus(rate: number): Status {
  if (rate <= 0) return "not-started";
  if (rate >= 100) return "completed";
  if (rate >= 70) return "on-track";
  if (rate >= 40) return "at-risk";
  return "behind";
}

export function avgRate(rates: number[]): number {
  const valid = rates.filter((r) => r >= 0);
  if (!valid.length) return 0;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

// ─── Action Plans ─────────────────────────────────────────────────────────

function parseActionPlans(q1Text: string, q2Text: string): ActionPlan[] {
  const plans: ActionPlan[] = [];

  function parseQ(text: string, quarter: "Q1" | "Q2") {
    if (!text.trim()) return;
    const sectionRe = /【([^】]+)】/g;
    const sections: Array<{ title: string; start: number }> = [];
    let m;
    while ((m = sectionRe.exec(text)) !== null) {
      sections.push({ title: m[1], start: m.index + m[0].length });
    }

    if (sections.length === 0) {
      plans.push({
        id: genId("plan"),
        quarter,
        title: `${quarter} 行動計畫`,
        items: parseItems(text),
      });
      return;
    }

    for (let i = 0; i < sections.length; i++) {
      const content = text.substring(
        sections[i].start,
        i + 1 < sections.length
          ? sections[i + 1].start - sections[i + 1].title.length - 2
          : text.length,
      );
      plans.push({
        id: genId("plan"),
        quarter,
        title: sections[i].title,
        items: parseItems(content),
      });
    }
  }

  function parseItems(text: string): PlanItem[] {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        // Try date range first: M/D-M/D or M/D~M/D
        const rangeMatch = line.match(
          /^(\d{1,2}\/\d{1,2})\s*[-~]\s*(\d{1,2}\/\d{1,2})/,
        );
        if (rangeMatch) {
          const description = line.substring(rangeMatch[0].length).trim();
          const completed = /完成|結案|啟動/.test(description);
          return {
            id: genId("item"),
            startDate: rangeMatch[1],
            endDate: rangeMatch[2],
            description,
            completed,
          };
        }
        const dateMatch = line.match(/^(\d+\/\d+(?:\/\d+)?)/);
        const date = dateMatch ? dateMatch[1] : "";
        const description = dateMatch
          ? line.substring(dateMatch[0].length).trim()
          : line;
        const completed =
          /完成|結案|啟動/.test(description) && /^\d+\/\d+/.test(line);
        return { id: genId("item"), date, description, completed };
      });
  }

  parseQ(q1Text, "Q1");
  parseQ(q2Text, "Q2");
  return plans;
}

// ─── Main OGSM Parser ─────────────────────────────────────────────────────

export function parseOGSM(csvText: string): OGSMData {
  const rows = parseCSVRaw(csvText);
  const orgO = rows[0]?.[1] || "";
  const deptO = rows[1]?.[1] || "";

  const dataRows = rows.slice(4);
  const goals: Goal[] = [];
  let currentGoal: Goal | null = null;
  const ref = { currentStrategy: null as Strategy | null };

  const addStrategy = (
    bText: string,
    cText: string,
    dText: string,
    eText: string,
    fText: string,
    gText: string,
  ) => {
    if (!currentGoal) return;
    const kpis = extractKPIs(cText);
    const rate = avgRate(kpis.map((k) => k.achievementRate ?? 0));
    const measure: Measure = { id: genId("msr"), rawText: cText, kpis };
    ref.currentStrategy = {
      id: genId("str"),
      title: bText.split("\n")[0].trim().substring(0, 60),
      rawText: bText,
      measures: [measure],
      q1Text: dText,
      q2Text: eText,
      actionPlans: parseActionPlans(dText, eText),
      owner: fText,
      notes: gText,
      completionRate: rate,
      manualRate: null,
      status: computeStatus(rate),
    };
    currentGoal.strategies.push(ref.currentStrategy);
  };

  for (const row of dataRows) {
    const [a = "", b = "", c = "", d = "", e = "", f = "", g = ""] = row;
    const aT = a.trim(),
      bT = b.trim(),
      cT = c.trim(),
      dT = d.trim(),
      eT = e.trim(),
      fT = f.trim(),
      gT = g.trim();

    if (aT && /^G\d/.test(aT)) {
      const label = aT.match(/^(G\d+)/)?.[1] ?? "G?";
      const title =
        aT.match(/^G\d+[：:]\s*([^\n]+)/)?.[1]?.trim() ?? aT.substring(0, 50);
      currentGoal = {
        id: genId("goal"),
        label,
        title,
        fullText: aT,
        strategies: [],
        completionRate: 0,
      };
      goals.push(currentGoal);
      if (bT) addStrategy(bT, cT, dT, eT, fT, gT);
    } else if (!aT && bT && currentGoal) {
      addStrategy(bT, cT, dT, eT, fT, gT);
    } else if (!aT && !bT && cT && ref.currentStrategy) {
      const kpis = extractKPIs(cT);
      ref.currentStrategy.measures.push({
        id: genId("msr"),
        rawText: cT,
        kpis,
      });
      ref.currentStrategy.actionPlans.push(...parseActionPlans(dT, eT));
      if (fT) ref.currentStrategy.owner = fT;
      if (gT) ref.currentStrategy.notes += "\n" + gT;
    }
  }

  // Roll up completion rates
  for (const goal of goals) {
    for (const strategy of goal.strategies) {
      const allKpis = strategy.measures.flatMap((m) => m.kpis);
      const rates = allKpis.map((k) => k.achievementRate ?? 0);
      strategy.completionRate = strategy.manualRate ?? avgRate(rates);
      strategy.status = computeStatus(strategy.completionRate);
    }
    goal.completionRate = avgRate(goal.strategies.map((s) => s.completionRate));
  }

  const overallRate = avgRate(goals.map((g) => g.completionRate));

  return {
    objectives: { orgO, deptO },
    goals,
    period: "2026 H1",
    importedAt: new Date().toISOString(),
    overallRate,
  };
}
