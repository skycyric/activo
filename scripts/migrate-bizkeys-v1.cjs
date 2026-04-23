const fs = require("fs");
const path = require("path");

function token(value, maxLen = 24) {
  if (value === undefined || value === null) return "";
  const normalized = String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized.slice(0, maxLen);
}

function order(prefix, value, width = 2) {
  if (!value || value <= 0) return "";
  return `${prefix}${String(value).padStart(width, "0")}`;
}

function join(parts) {
  return parts.filter(Boolean).join("-");
}

function generateBizKey(input) {
  const yyyy = input.year ? String(input.year) : "";
  const hh = input.halfYear;
  const dep = token(input.deptCode, 12) || "DEPT";
  const gno = order("G", input.goalOrder, 1);
  const sno = order("S", input.strategyOrder, 2);
  const ano = order("A", input.activityOrder, 3);
  const kno = order("K", input.kpiOrder, 2);
  const gkno = order("K", input.goalKpiOrder, 2);
  const pno = order("P", input.planOrder, 2);
  const ino = order("I", input.itemOrder, 2);
  const lno = order("L", input.linkOrder, 2);
  const tno = order("T", input.teamOrder, 2);
  const mno = order("M", input.memberOrder, 2);
  const fno = order("F", input.freeNodeOrder, 2);
  const qx = token(input.quarter, 2);
  const target = token(input.targetCode, 16) || "TARGET";

  const base = (() => {
    switch (input.entityType) {
      case "department":
        return join(["DEP", yyyy, dep]);
      case "period":
        return join(["PER", yyyy, hh, dep]);
      case "goal":
        return join(["GOAL", yyyy, hh, dep, gno]);
      case "strategy":
        return join(["STR", yyyy, hh, dep, gno, sno]);
      case "activity":
        return join(["ACT", yyyy, hh, dep, gno, sno, ano]);
      case "kpi":
        return join(["KPI", yyyy, hh, dep, gno, sno, ano, kno]);
      case "actionPlan":
        return join(["PLN", yyyy, hh, dep, gno, sno, qx, pno]);
      case "planItem":
        return join(["PIT", yyyy, hh, dep, gno, sno, ano, qx, ino]);
      case "goalKpi":
        return join(["GKPI", yyyy, hh, dep, gno, gkno]);
      case "dashboardLink":
        return join(["DLK", yyyy, hh, dep, ano, lno]);
      case "team":
        return join(["TEAM", dep, tno]);
      case "teamMember":
        return join(["MBR", dep, tno, mno]);
      case "freeNode":
        return join(["FREE", yyyy, hh, dep, fno]);
      case "activityLink":
        return join(["ALK", yyyy, hh, dep, ano, target]);
      default:
        return "";
    }
  })();

  const v = input.version && input.version > 1 ? `V${input.version}` : "";
  return token(join([base, v]), 64);
}

function withIncrementedOrder(input, step) {
  const next = { ...input };
  switch (input.entityType) {
    case "goal":
      next.goalOrder = (input.goalOrder || 0) + step;
      return next;
    case "strategy":
      next.strategyOrder = (input.strategyOrder || 0) + step;
      return next;
    case "activity":
      next.activityOrder = (input.activityOrder || 0) + step;
      return next;
    case "kpi":
      next.kpiOrder = (input.kpiOrder || 0) + step;
      return next;
    case "actionPlan":
      next.planOrder = (input.planOrder || 0) + step;
      return next;
    case "planItem":
      next.itemOrder = (input.itemOrder || 0) + step;
      return next;
    case "goalKpi":
      next.goalKpiOrder = (input.goalKpiOrder || 0) + step;
      return next;
    case "dashboardLink":
      next.linkOrder = (input.linkOrder || 0) + step;
      return next;
    case "team":
      next.teamOrder = (input.teamOrder || 0) + step;
      return next;
    case "teamMember":
      next.memberOrder = (input.memberOrder || 0) + step;
      return next;
    case "freeNode":
      next.freeNodeOrder = (input.freeNodeOrder || 0) + step;
      return next;
    default:
      return next;
  }
}

function supportsOrderedIncrement(entityType) {
  return (
    entityType !== "department" &&
    entityType !== "period" &&
    entityType !== "activityLink"
  );
}

function generateUniqueBizKey({ input, existingKeys, maxAttempts = 999 }) {
  const existing = new Set(
    Array.from(existingKeys || [])
      .filter((k) => typeof k === "string" && k.length > 0)
      .map((k) => k.toUpperCase()),
  );

  const base = generateBizKey(input);
  if (!existing.has(base.toUpperCase())) return base;

  if (supportsOrderedIncrement(input.entityType)) {
    for (let i = 1; i <= maxAttempts; i += 1) {
      const next = generateBizKey(withIncrementedOrder(input, i));
      if (!existing.has(next.toUpperCase())) return next;
    }
  }

  for (let i = 1; i <= maxAttempts; i += 1) {
    const normalized = token(`${base}-${String(i).padStart(2, "0")}`, 64);
    if (!existing.has(normalized.toUpperCase())) return normalized;
  }

  return token(`${base}-${Date.now().toString(36).toUpperCase()}`, 64);
}

function toDeptCode(name) {
  const base = String(name || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return (base || "DEPT").slice(0, 12);
}

function parseGoalOrder(label, fallback) {
  const m = String(label || "").match(/^G(\d+)/i);
  const n = m ? Number.parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function resolveActivityScope(links) {
  const link = (links || []).find(
    (l) => l && l.type === "ogsm" && l.periodId && l.goalId && l.strategyId,
  );
  if (!link) return undefined;
  return {
    periodId: link.periodId,
    goalId: link.goalId,
    strategyId: link.strategyId,
  };
}

function getActivityScopeExistingKeys(activities, scope) {
  if (!scope) return (activities || []).map((a) => a.bizKey || "");
  return (activities || [])
    .filter((a) =>
      (a.dashboardLinks || []).some(
        (l) =>
          l.type === "ogsm" &&
          l.periodId === scope.periodId &&
          l.goalId === scope.goalId &&
          l.strategyId === scope.strategyId,
      ),
    )
    .map((a) => a.bizKey || "");
}

function backfillWorkspace(workspace) {
  if (!workspace || !Array.isArray(workspace.departments)) return workspace;

  for (const dept of workspace.departments) {
    const deptCode = toDeptCode(dept.name);
    const firstYear =
      Array.isArray(dept.periods) && dept.periods.length > 0
        ? dept.periods[0].year
        : undefined;
    dept.bizKey = generateUniqueBizKey({
      input: {
        entityType: "department",
        year: firstYear,
        deptCode,
      },
      existingKeys: workspace.departments
        .filter((d) => d !== dept)
        .map((d) => d.bizKey),
    });

    for (const period of dept.periods || []) {
      period.bizKey = generateUniqueBizKey({
        input: {
          entityType: "period",
          year: period.year,
          halfYear: period.halfYear,
          deptCode,
        },
        existingKeys: (dept.periods || [])
          .filter((p) => p !== period)
          .map((p) => p.bizKey),
      });

      const goals =
        period.ogsm && Array.isArray(period.ogsm.goals)
          ? period.ogsm.goals
          : [];
      for (let gIdx = 0; gIdx < goals.length; gIdx += 1) {
        const goal = goals[gIdx];
        const goalOrder = parseGoalOrder(goal.label, gIdx + 1);
        goal.bizKey = generateUniqueBizKey({
          input: {
            entityType: "goal",
            year: period.year,
            halfYear: period.halfYear,
            deptCode,
            goalOrder,
          },
          existingKeys: goals.filter((x) => x !== goal).map((x) => x.bizKey),
        });

        const strategies = Array.isArray(goal.strategies)
          ? goal.strategies
          : [];
        for (let sIdx = 0; sIdx < strategies.length; sIdx += 1) {
          const strategy = strategies[sIdx];
          const strategyOrder = sIdx + 1;
          strategy.bizKey = generateUniqueBizKey({
            input: {
              entityType: "strategy",
              year: period.year,
              halfYear: period.halfYear,
              deptCode,
              goalOrder,
              strategyOrder,
            },
            existingKeys: strategies
              .filter((x) => x !== strategy)
              .map((x) => x.bizKey),
          });

          const measures = Array.isArray(strategy.measures)
            ? strategy.measures
            : [];
          for (let mIdx = 0; mIdx < measures.length; mIdx += 1) {
            const measure = measures[mIdx];
            const activityOrder = mIdx + 1;
            measure.bizKey = generateUniqueBizKey({
              input: {
                entityType: "activity",
                year: period.year,
                halfYear: period.halfYear,
                deptCode,
                goalOrder,
                strategyOrder,
                activityOrder,
              },
              existingKeys: measures
                .filter((x) => x !== measure)
                .map((x) => x.bizKey),
            });

            const kpis = Array.isArray(measure.kpis) ? measure.kpis : [];
            for (let kIdx = 0; kIdx < kpis.length; kIdx += 1) {
              const kpi = kpis[kIdx];
              kpi.bizKey = generateUniqueBizKey({
                input: {
                  entityType: "kpi",
                  year: period.year,
                  halfYear: period.halfYear,
                  deptCode,
                  goalOrder,
                  strategyOrder,
                  activityOrder,
                  kpiOrder: kIdx + 1,
                },
                existingKeys: kpis
                  .filter((x) => x !== kpi)
                  .map((x) => x.bizKey),
              });
            }
          }

          const plans = Array.isArray(strategy.actionPlans)
            ? strategy.actionPlans
            : [];
          for (let pIdx = 0; pIdx < plans.length; pIdx += 1) {
            const plan = plans[pIdx];
            plan.bizKey = generateUniqueBizKey({
              input: {
                entityType: "actionPlan",
                year: period.year,
                halfYear: period.halfYear,
                deptCode,
                goalOrder,
                strategyOrder,
                quarter: plan.quarter,
                planOrder: pIdx + 1,
              },
              existingKeys: plans
                .filter((x) => x !== plan)
                .map((x) => x.bizKey),
            });

            const items = Array.isArray(plan.items) ? plan.items : [];
            for (let iIdx = 0; iIdx < items.length; iIdx += 1) {
              const item = items[iIdx];
              const linkedMeasureIdx = measures.findIndex(
                (m) => m.id === item.linkedMeasureId,
              );
              const deptActivities = Array.isArray(dept.activities)
                ? dept.activities
                : [];
              const linkedDeptActivityIdx = deptActivities.findIndex(
                (a) => a.id === item.linkedMeasureId,
              );
              const activityOrder =
                linkedMeasureIdx >= 0
                  ? linkedMeasureIdx + 1
                  : linkedDeptActivityIdx >= 0
                    ? linkedDeptActivityIdx + 1
                    : 1;
              item.bizKey = generateUniqueBizKey({
                input: {
                  entityType: "planItem",
                  year: period.year,
                  halfYear: period.halfYear,
                  deptCode,
                  goalOrder,
                  strategyOrder,
                  activityOrder,
                  quarter: plan.quarter,
                  itemOrder: iIdx + 1,
                },
                existingKeys: items
                  .filter((x) => x !== item)
                  .map((x) => x.bizKey),
              });
            }
          }
        }

        const goalKpis = Array.isArray(goal.goalKpis) ? goal.goalKpis : [];
        for (let gkIdx = 0; gkIdx < goalKpis.length; gkIdx += 1) {
          const goalKpi = goalKpis[gkIdx];
          goalKpi.bizKey = generateUniqueBizKey({
            input: {
              entityType: "goalKpi",
              year: period.year,
              halfYear: period.halfYear,
              deptCode,
              goalOrder,
              goalKpiOrder: gkIdx + 1,
            },
            existingKeys: goalKpis
              .filter((x) => x !== goalKpi)
              .map((x) => x.bizKey),
          });
        }
      }

      const freeNodes = Array.isArray(period.ogsm?.freeNodes)
        ? period.ogsm.freeNodes
        : [];
      for (let fIdx = 0; fIdx < freeNodes.length; fIdx += 1) {
        const freeNode = freeNodes[fIdx];
        freeNode.bizKey = generateUniqueBizKey({
          input: {
            entityType: "freeNode",
            year: period.year,
            halfYear: period.halfYear,
            deptCode,
            freeNodeOrder: fIdx + 1,
          },
          existingKeys: freeNodes
            .filter((x) => x !== freeNode)
            .map((x) => x.bizKey),
        });
      }
    }

    const activities = Array.isArray(dept.activities) ? dept.activities : [];
    for (let aIdx = 0; aIdx < activities.length; aIdx += 1) {
      const activity = activities[aIdx];
      const scope = resolveActivityScope(activity.dashboardLinks);
      const scopeKeys = getActivityScopeExistingKeys(activities, scope).filter(
        (key) => key !== activity.bizKey,
      );
      const period = scope
        ? (dept.periods || []).find((p) => p.id === scope.periodId)
        : (dept.periods || [])[0];
      const year =
        period && typeof period.year === "number" ? period.year : undefined;
      const halfYear =
        period && (period.halfYear === "H1" || period.halfYear === "H2")
          ? period.halfYear
          : undefined;
      let goalOrder;
      let strategyOrder;
      if (scope && period && period.ogsm && Array.isArray(period.ogsm.goals)) {
        const gIdx = period.ogsm.goals.findIndex((g) => g.id === scope.goalId);
        if (gIdx >= 0) {
          goalOrder = parseGoalOrder(period.ogsm.goals[gIdx].label, gIdx + 1);
          const strategies = period.ogsm.goals[gIdx].strategies || [];
          const sIdx = strategies.findIndex((s) => s.id === scope.strategyId);
          if (sIdx >= 0) strategyOrder = sIdx + 1;
        }
      }
      activity.bizKey = generateUniqueBizKey({
        input: {
          entityType: "activity",
          year,
          halfYear,
          deptCode,
          goalOrder,
          strategyOrder,
          activityOrder: aIdx + 1,
        },
        existingKeys: scopeKeys,
      });

      const links = Array.isArray(activity.dashboardLinks)
        ? activity.dashboardLinks
        : [];
      for (let lIdx = 0; lIdx < links.length; lIdx += 1) {
        const link = links[lIdx];
        const linkPeriod = (dept.periods || []).find(
          (p) => p.id === link.periodId,
        );
        link.bizKey = generateUniqueBizKey({
          input: {
            entityType: "dashboardLink",
            year: linkPeriod ? linkPeriod.year : year,
            halfYear: linkPeriod ? linkPeriod.halfYear : halfYear,
            deptCode,
            activityOrder: aIdx + 1,
            linkOrder: lIdx + 1,
          },
          existingKeys: links.filter((x) => x !== link).map((x) => x.bizKey),
        });
      }

      const planItems = Array.isArray(activity.planItems)
        ? activity.planItems
        : [];
      for (let iIdx = 0; iIdx < planItems.length; iIdx += 1) {
        const item = planItems[iIdx];
        item.bizKey = generateUniqueBizKey({
          input: {
            entityType: "planItem",
            year,
            halfYear,
            deptCode,
            activityOrder: aIdx + 1,
            quarter: item.quarter,
            itemOrder: iIdx + 1,
          },
          existingKeys: planItems
            .filter((x) => x !== item)
            .map((x) => x.bizKey),
        });
      }
    }

    const activityLinks = Array.isArray(dept.activityLinks)
      ? dept.activityLinks
      : [];
    for (let lIdx = 0; lIdx < activityLinks.length; lIdx += 1) {
      const link = activityLinks[lIdx];
      const period = (dept.periods || []).find((p) => p.id === link.periodId);
      link.bizKey = generateUniqueBizKey({
        input: {
          entityType: "dashboardLink",
          year: period ? period.year : undefined,
          halfYear: period ? period.halfYear : undefined,
          deptCode,
          activityOrder: lIdx + 1,
          linkOrder: lIdx + 1,
        },
        existingKeys: activityLinks
          .filter((x) => x !== link)
          .map((x) => x.bizKey),
      });
    }
  }

  const teams = Array.isArray(workspace.teams) ? workspace.teams : [];
  for (let tIdx = 0; tIdx < teams.length; tIdx += 1) {
    const team = teams[tIdx];
    const dept = (workspace.departments || []).find(
      (d) => d.id === team.deptId,
    );
    const deptCode = toDeptCode(dept ? dept.name : "DEPT");
    team.bizKey = generateUniqueBizKey({
      input: {
        entityType: "team",
        deptCode,
        teamOrder: tIdx + 1,
      },
      existingKeys: teams.filter((x) => x !== team).map((x) => x.bizKey),
    });

    const members = Array.isArray(team.members) ? team.members : [];
    for (let mIdx = 0; mIdx < members.length; mIdx += 1) {
      const member = members[mIdx];
      member.bizKey = generateUniqueBizKey({
        input: {
          entityType: "teamMember",
          deptCode,
          teamOrder: tIdx + 1,
          memberOrder: mIdx + 1,
        },
        existingKeys: members.filter((x) => x !== member).map((x) => x.bizKey),
      });
    }
  }

  return workspace;
}

function processFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);
  const next = backfillWorkspace(json);
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "Usage: node scripts/migrate-bizkeys-v1.cjs <file1.json> <file2.json> ...",
  );
  process.exit(1);
}

for (const arg of args) {
  const abs = path.resolve(arg);
  processFile(abs);
  console.log(`updated ${abs}`);
}
