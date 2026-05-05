import type { OGSMData, Goal, Strategy, Measure, KPI } from "../schemas/ogsm";
import {
  generateUniqueBizKey,
  generateUniqueGoalBizKey,
  generateUniqueStrategyBizKey,
} from "./bizKey";

let _genIdCounter = 0;

export function genId(prefix = "id"): string {
  const ts = Date.now().toString(36);
  const seq = (_genIdCounter++ & 0xffff).toString(36).padStart(3, "0");
  const rnd = (() => {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      crypto.getRandomValues(buf);
      return buf[0].toString(16).padStart(8, "0");
    }
    // Node fallback（測試環境）
    return Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");
  })();
  return `${prefix}_${ts}_${seq}_${rnd}`;
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

function extractKPIs(text: string): KPI[] {
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

export function avgRate(rates: number[]): number {
  const valid = rates.filter((r) => r >= 0);
  if (!valid.length) return 0;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function toDeptCode(name: string | undefined): string {
  const base = (name ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (base || "DEPT").slice(0, 12);
}

function parseGoalOrder(label: string | undefined, fallback: number): number {
  const matched = (label ?? "").match(/^G(\d+)/i);
  const parsed = matched ? Number.parseInt(matched[1], 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ─── Main OGSM Parser ─────────────────────────────────────────────────────

export function parseOGSM(csvText: string): OGSMData {
  const rows = parseCSVRaw(csvText);
  const orgO = rows[0]?.[1] || "";
  const deptO = rows[1]?.[1] || "";
  const now = new Date();
  const half: "H1" | "H2" = now.getMonth() >= 6 ? "H2" : "H1";
  const year = now.getFullYear();
  const deptCode = toDeptCode(deptO);

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
    const goalOrder = parseGoalOrder(currentGoal.label, goals.length);
    const strategyOrder = currentGoal.strategies.length + 1;
    const measure: Measure = {
      id: genId("msr"),
      bizKey: generateUniqueBizKey({
        input: {
          entityType: "activity",
          year,
          halfYear: half,
          deptCode,
          goalOrder,
          strategyOrder,
          activityOrder: 1,
        },
        existingKeys: [],
      }),
      rawText: cText,
      kpis,
    };
    const strategy: Strategy = {
      id: genId("str"),
      bizKey: generateUniqueStrategyBizKey({
        year,
        halfYear: half,
        deptCode,
        goalOrder,
        strategyOrder,
        strategies: currentGoal.strategies,
      }),
      title: bText.split("\n")[0].trim().substring(0, 60),
      rawText: bText,
      measures: [measure],
      q1Text: dText,
      q2Text: eText,
      actionPlans: [], // Legacy: no longer populated from CSV
      owners: fText ? [fText] : [],
      notes: gText,
      completionRate: rate,
      manualRate: null,
    };
    ref.currentStrategy = strategy;
    currentGoal.strategies.push(strategy);
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
        bizKey: generateUniqueGoalBizKey({
          year,
          halfYear: half,
          deptCode,
          goalOrder: goals.length + 1,
          goals,
        }),
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
      const goalOrder = currentGoal
        ? parseGoalOrder(currentGoal.label, goals.length)
        : goals.length;
      const strategyOrder = currentGoal
        ? currentGoal.strategies.findIndex(
            (s) => s.id === ref.currentStrategy?.id,
          ) + 1
        : 1;
      ref.currentStrategy.measures.push({
        id: genId("msr"),
        bizKey: generateUniqueBizKey({
          input: {
            entityType: "activity",
            year,
            halfYear: half,
            deptCode,
            goalOrder,
            strategyOrder: strategyOrder > 0 ? strategyOrder : 1,
            activityOrder: ref.currentStrategy.measures.length + 1,
          },
          existingKeys: ref.currentStrategy.measures.map((m) => m.bizKey),
        }),
        rawText: cT,
        kpis,
      });
      // Legacy: actionPlans no longer populated from CSV imports
      if (fT) {
        ref.currentStrategy.owners = [
          fT,
          ...ref.currentStrategy.owners.filter((o) => o !== fT),
        ];
      }
      if (gT) ref.currentStrategy.notes += "\n" + gT;
    }
  }

  // Roll up completion rates
  for (const goal of goals) {
    for (const strategy of goal.strategies) {
      const allKpis = strategy.measures.flatMap((m) => m.kpis);
      const rates = allKpis.map((k) => k.achievementRate ?? 0);
      strategy.completionRate = strategy.manualRate ?? avgRate(rates);
    }
    goal.completionRate = avgRate(goal.strategies.map((s) => s.completionRate));
  }

  const overallRate = avgRate(goals.map((g) => g.completionRate));

  return {
    objectives: { orgO, deptO },
    goals,
    period: `${now.getFullYear()} ${half}`,
    importedAt: now.toISOString(),
    overallRate,
  };
}
