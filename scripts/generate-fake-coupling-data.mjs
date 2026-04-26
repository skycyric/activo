import { promises as fs } from "node:fs";
import path from "node:path";

const DEFAULT_INPUT_ROOT = path.resolve("test");
const DEFAULT_OUTPUT_PATH = path.resolve("test", "fake", "coupling-domain-fake.json");

function parseArgs(argv) {
  const args = {
    inputRoot: DEFAULT_INPUT_ROOT,
    output: DEFAULT_OUTPUT_PATH,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input-root" && argv[i + 1]) {
      args.inputRoot = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === "--output" && argv[i + 1]) {
      args.output = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
  }

  return args;
}

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seeded01(seed, salt = "") {
  const h = hashString(`${seed}:${salt}`);
  return (h % 10000) / 10000;
}

function toDate(isoDate) {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  return Number.isNaN(d.valueOf()) ? null : d;
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function nextWeek(d) {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + 7);
  return next;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeWeeks(startDate, endDate, maxWeeks = 16) {
  if (!startDate || !endDate || endDate < startDate) {
    return [];
  }

  const weeks = [];
  let cursor = new Date(startDate);

  while (cursor <= endDate && weeks.length < maxWeeks) {
    weeks.push(toISODate(cursor));
    cursor = nextWeek(cursor);
  }

  if (weeks.length === 0) {
    weeks.push(toISODate(startDate));
  }

  return weeks;
}

function pickCategory(seed) {
  const categories = ["media", "event", "crm", "ops", "merch"]; 
  return categories[Math.floor(seeded01(seed, "category") * categories.length)];
}

function makeBudgetSeries(activity, weeks) {
  const seed = activity.globalId;
  const magnitude = 150_000 + Math.floor(seeded01(seed, "budget:base") * 1_200_000);
  const shape = seeded01(seed, "budget:shape");

  let raw = weeks.map((_, idx) => {
    const n = weeks.length <= 1 ? 1 : idx / (weeks.length - 1);
    const frontHeavy = 1.35 - 0.7 * n;
    const backHeavy = 0.65 + 0.7 * n;
    const flat = 1.0;
    const pulse = 1 + 0.15 * Math.sin((idx + 1) * 1.7 + seeded01(seed, "phase") * Math.PI);

    const profile =
      shape < 0.34 ? frontHeavy : shape < 0.68 ? flat : backHeavy;
    return Math.max(0.12, profile * pulse);
  });

  const sumRaw = raw.reduce((acc, v) => acc + v, 0);
  raw = raw.map((v) => (v / (sumRaw || 1)) * magnitude);

  const categoryA = pickCategory(`${seed}:A`);
  const categoryB = pickCategory(`${seed}:B`);
  const categoryC = pickCategory(`${seed}:C`);

  const categoryWeights = {
    [categoryA]: 0.5,
    [categoryB]: 0.3,
    [categoryC]: 0.2,
  };

  const weeklyBudget = weeks.map((week, idx) => ({
    week,
    amount: Math.round(raw[idx]),
  }));

  const totalBudget = weeklyBudget.reduce((acc, x) => acc + x.amount, 0);

  const categoryAmounts = Object.entries(categoryWeights).map(([budgetCategory, ratio]) => ({
    budgetCategory,
    amount: Math.round(totalBudget * ratio),
  }));

  return {
    totalBudget,
    weeklyBudget,
    budgetCategoryAmounts: categoryAmounts,
  };
}

function makeOutcomeSeries(activity, weeks) {
  const seed = activity.globalId;
  const baseConv = 0.02 + seeded01(seed, "outcome:baseConv") * 0.14;
  const baseRevenue = 300_000 + seeded01(seed, "outcome:baseRevenue") * 2_700_000;

  const weeklyOutcome = weeks.map((week, idx) => {
    const swing = 1 + 0.12 * Math.sin((idx + 1) * 1.2 + seeded01(seed, "outcome:phase") * Math.PI);
    const trend = 0.92 + (idx / Math.max(1, weeks.length - 1)) * 0.18;
    const conv = clamp(baseConv * swing * trend, 0.005, 0.6);
    const revenue = Math.round(baseRevenue * swing * trend);

    return {
      week,
      conversionRate: Number(conv.toFixed(4)),
      revenue,
    };
  });

  return weeklyOutcome;
}

function makeCouponArtifacts(activities) {
  const coupons = [];
  const activityCoupons = [];
  const couponUsageWeekly = [];
  const confoundPairs = [];

  const sharedPool = [
    {
      couponId: "CPN-SHARED-001",
      mechanism: "threshold_discount",
      threshold: 1000,
      discountRule: "minus_100",
    },
    {
      couponId: "CPN-SHARED-002",
      mechanism: "bundle_bonus",
      threshold: 2000,
      discountRule: "gift_point_200",
    },
  ];

  for (const item of sharedPool) {
    coupons.push({
      couponId: item.couponId,
      coupon_scope: "shared",
      boundActivityIds: [],
      issuedAt: "2026-03-01",
      mechanism: item.mechanism,
      threshold: item.threshold,
      discountRule: item.discountRule,
    });
  }

  for (let idx = 0; idx < activities.length; idx += 1) {
    const act = activities[idx];
    const seed = act.globalId;

    const exclusiveCouponId = `CPN-EX-${act.activityId.slice(-4)}-${idx + 1}`;
    const hasExclusive = seeded01(seed, "coupon:exclusive") > 0.12;
    const needsNoCouponSignal = seeded01(seed, "coupon:noDirect") < 0.1;

    const linkedCouponIds = [];

    if (hasExclusive && !needsNoCouponSignal) {
      coupons.push({
        couponId: exclusiveCouponId,
        coupon_scope: "activity-exclusive",
        boundActivityIds: [act.activityId],
        issuedAt: act.startDate || "2026-03-01",
        mechanism: seeded01(seed, "coupon:mech") < 0.5 ? "threshold_discount" : "percent_off",
        threshold: seeded01(seed, "coupon:th") < 0.5 ? 1000 : 2000,
        discountRule: seeded01(seed, "coupon:rule") < 0.5 ? "minus_100" : "off_95",
      });
      linkedCouponIds.push(exclusiveCouponId);
    }

    if (seeded01(seed, "coupon:shared-use") > 0.65) {
      linkedCouponIds.push(sharedPool[idx % sharedPool.length].couponId);
    }

    if (seeded01(seed, "coupon:cross") > 0.86 && activities.length > 1) {
      const pair = activities[(idx + 1) % activities.length];
      const crossId = `CPN-X-${act.activityId.slice(-3)}-${pair.activityId.slice(-3)}`;
      coupons.push({
        couponId: crossId,
        coupon_scope: "cross-activity",
        boundActivityIds: [act.activityId, pair.activityId],
        issuedAt: act.startDate || "2026-03-10",
        mechanism: "cross_bundle",
        threshold: 1500,
        discountRule: "buyA_getB_coupon",
      });
      linkedCouponIds.push(crossId);
    }

    const weeklyRate = act.weeks.map((week, wIdx) => {
      const base = 0.03 + seeded01(seed, "coupon:base") * 0.22;
      const swing = 1 + 0.2 * Math.sin((wIdx + 1) * 1.5 + seeded01(seed, "coupon:phase") * Math.PI);
      const value = clamp(base * swing, 0.001, 0.8);
      return { week, redemptionRate: Number(value.toFixed(4)) };
    });

    activityCoupons.push({
      globalId: act.globalId,
      activityId: act.activityId,
      directCouponIds: linkedCouponIds.filter((id) => id.startsWith("CPN-EX-")),
      observedCouponIds: linkedCouponIds,
      couponFlags: [
        ...(needsNoCouponSignal ? ["no_coupon_signal"] : []),
      ],
      weeklyRedemptionRate: weeklyRate,
    });

    if (idx > 0 && seeded01(seed, "coupon:confound") > 0.78) {
      const prev = activities[idx - 1];
      confoundPairs.push({
        pair: [prev.globalId, act.globalId],
        reason: "overlapping_window_same_audience",
        flag: "potential_confound",
      });
    }

    for (const cp of linkedCouponIds) {
      if (!couponUsageWeekly.some((x) => x.couponId === cp)) {
        couponUsageWeekly.push({
          couponId: cp,
          weeklyRedemptionRate: weeklyRate,
        });
      }
    }
  }

  // 回填 shared 券綁定活動
  for (const c of coupons) {
    if (c.coupon_scope !== "shared") continue;
    c.boundActivityIds = activityCoupons
      .filter((row) => row.observedCouponIds.includes(c.couponId))
      .map((row) => row.activityId);
  }

  return { coupons, activityCoupons, couponUsageWeekly, confoundPairs };
}

function normalizeActivities(inputJson) {
  const departments = Array.isArray(inputJson?.departments) ? inputJson.departments : [];
  const rows = [];

  for (const dept of departments) {
    const deptId = dept?.id ?? "UNKNOWN_DEPT";
    const deptName = dept?.name ?? deptId;
    const activities = Array.isArray(dept?.activities) ? dept.activities : [];

    for (const act of activities) {
      const activityId = act?.id;
      if (!activityId) continue;

      const start = toDate(act?.startDate ?? null);
      const end = toDate(act?.endDate ?? null);
      const fallbackStart = start ?? new Date("2026-03-01T00:00:00.000Z");
      const fallbackEnd = end ?? new Date("2026-06-30T00:00:00.000Z");
      const weeks = makeWeeks(fallbackStart, fallbackEnd, 18);

      rows.push({
        deptId,
        deptName,
        activityId,
        globalId: `${deptId}:${activityId}`,
        rawText: act?.rawText ?? "",
        status: act?.status ?? "not-started",
        startDate: toISODate(fallbackStart),
        endDate: toISODate(fallbackEnd),
        tags: Array.isArray(act?.tags) ? act.tags : [],
        weeks,
      });
    }
  }

  return rows;
}

async function collectSourceFiles(inputRoot) {
  const entries = await fs.readdir(inputRoot, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "備份") continue;

    const candidate = path.join(inputRoot, entry.name, "data.json");
    try {
      await fs.access(candidate);
      files.push(candidate);
    } catch {
      // ignore missing data.json
    }
  }

  return files;
}

async function main() {
  const { inputRoot, output } = parseArgs(process.argv);
  const sourceFiles = await collectSourceFiles(inputRoot);

  if (sourceFiles.length === 0) {
    throw new Error(`No data.json found under ${inputRoot}`);
  }

  const allActivities = [];

  for (const filePath of sourceFiles) {
    const raw = await fs.readFile(filePath, "utf8");
    const json = JSON.parse(raw);
    allActivities.push(...normalizeActivities(json));
  }

  const budgets = [];
  const outcomes = [];

  for (const activity of allActivities) {
    const budgetSignal = makeBudgetSeries(activity, activity.weeks);
    const outcomeSignal = makeOutcomeSeries(activity, activity.weeks);

    budgets.push({
      globalId: activity.globalId,
      activityId: activity.activityId,
      deptId: activity.deptId,
      ...budgetSignal,
    });

    outcomes.push({
      globalId: activity.globalId,
      activityId: activity.activityId,
      deptId: activity.deptId,
      weeklyOutcome: outcomeSignal,
    });
  }

  const couponBundle = makeCouponArtifacts(allActivities);

  const payload = {
    schemaVersion: "fake-coupling-domain-v1",
    generatedAt: new Date().toISOString(),
    source: {
      inputRoot,
      sourceFiles,
      activityCount: allActivities.length,
    },
    activities: allActivities.map((x) => ({
      globalId: x.globalId,
      deptId: x.deptId,
      deptName: x.deptName,
      activityId: x.activityId,
      rawText: x.rawText,
      status: x.status,
      startDate: x.startDate,
      endDate: x.endDate,
      tags: x.tags,
    })),
    couponDomain: couponBundle,
    budgetDomain: {
      semantics: "rhythm-sync-v1-with-resource-competition-ready-fields",
      rows: budgets,
    },
    outcomeDomain: {
      rows: outcomes,
    },
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`[fake-coupling-data] wrote ${output}`);
  console.log(`[fake-coupling-data] activities=${allActivities.length}`);
  console.log(`[fake-coupling-data] coupons=${payload.couponDomain.coupons.length}`);
  console.log(`[fake-coupling-data] budgetRows=${payload.budgetDomain.rows.length}`);
  console.log(`[fake-coupling-data] outcomeRows=${payload.outcomeDomain.rows.length}`);
}

main().catch((error) => {
  console.error("[fake-coupling-data] failed:", error?.message || error);
  process.exitCode = 1;
});
