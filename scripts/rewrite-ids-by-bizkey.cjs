const fs = require("fs");
const path = require("path");

function normToken(v) {
  return String(v || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function makeIdFactory() {
  const used = new Set();
  return (base) => {
    const normalizedBase = normToken(base) || "ID";
    if (!used.has(normalizedBase)) {
      used.add(normalizedBase);
      return normalizedBase;
    }
    let i = 2;
    while (true) {
      const candidate = `${normalizedBase}-ID${String(i).padStart(2, "0")}`;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
      i += 1;
    }
  };
}

function remapRef(idMap, value) {
  if (!value || typeof value !== "string") return value;
  return idMap.get(value) || value;
}

function rewriteWorkspaceIds(workspace) {
  const idMap = new Map();
  const makeId = makeIdFactory();

  const register = (oldId, base) => {
    if (!oldId || typeof oldId !== "string") return;
    if (idMap.has(oldId)) return;
    idMap.set(oldId, makeId(base));
  };

  const depts = Array.isArray(workspace.departments)
    ? workspace.departments
    : [];
  for (let dIdx = 0; dIdx < depts.length; dIdx += 1) {
    const dept = depts[dIdx];
    register(dept.id, dept.bizKey || `DEP-${dIdx + 1}`);

    const periods = Array.isArray(dept.periods) ? dept.periods : [];
    for (let pIdx = 0; pIdx < periods.length; pIdx += 1) {
      const period = periods[pIdx];
      register(
        period.id,
        period.bizKey ||
          `PER-${period.year || "YYYY"}-${period.halfYear || "H?"}-${dIdx + 1}-${pIdx + 1}`,
      );

      const goals = Array.isArray(period.ogsm?.goals) ? period.ogsm.goals : [];
      for (let gIdx = 0; gIdx < goals.length; gIdx += 1) {
        const goal = goals[gIdx];
        register(
          goal.id,
          goal.bizKey || `GOAL-${dIdx + 1}-${pIdx + 1}-${gIdx + 1}`,
        );

        const strategies = Array.isArray(goal.strategies)
          ? goal.strategies
          : [];
        for (let sIdx = 0; sIdx < strategies.length; sIdx += 1) {
          const strategy = strategies[sIdx];
          register(
            strategy.id,
            strategy.bizKey ||
              `STR-${dIdx + 1}-${pIdx + 1}-${gIdx + 1}-${sIdx + 1}`,
          );

          const measures = Array.isArray(strategy.measures)
            ? strategy.measures
            : [];
          for (let mIdx = 0; mIdx < measures.length; mIdx += 1) {
            const measure = measures[mIdx];
            register(
              measure.id,
              measure.bizKey ||
                `ACT-${dIdx + 1}-${pIdx + 1}-${gIdx + 1}-${sIdx + 1}-${mIdx + 1}`,
            );

            const kpis = Array.isArray(measure.kpis) ? measure.kpis : [];
            for (let kIdx = 0; kIdx < kpis.length; kIdx += 1) {
              const kpi = kpis[kIdx];
              register(
                kpi.id,
                kpi.bizKey ||
                  `KPI-${dIdx + 1}-${pIdx + 1}-${gIdx + 1}-${sIdx + 1}-${mIdx + 1}-${kIdx + 1}`,
              );
            }
          }

          const actionPlans = Array.isArray(strategy.actionPlans)
            ? strategy.actionPlans
            : [];
          for (let apIdx = 0; apIdx < actionPlans.length; apIdx += 1) {
            const plan = actionPlans[apIdx];
            register(
              plan.id,
              plan.bizKey ||
                `PLN-${dIdx + 1}-${pIdx + 1}-${gIdx + 1}-${sIdx + 1}-${apIdx + 1}`,
            );

            const items = Array.isArray(plan.items) ? plan.items : [];
            for (let iIdx = 0; iIdx < items.length; iIdx += 1) {
              const item = items[iIdx];
              register(
                item.id,
                item.bizKey ||
                  `PIT-${dIdx + 1}-${pIdx + 1}-${gIdx + 1}-${sIdx + 1}-${apIdx + 1}-${iIdx + 1}`,
              );
            }
          }
        }

        const goalKpis = Array.isArray(goal.goalKpis) ? goal.goalKpis : [];
        for (let gkIdx = 0; gkIdx < goalKpis.length; gkIdx += 1) {
          const goalKpi = goalKpis[gkIdx];
          register(
            goalKpi.id,
            goalKpi.bizKey ||
              `GKPI-${dIdx + 1}-${pIdx + 1}-${gIdx + 1}-${gkIdx + 1}`,
          );
        }
      }

      const freeNodes = Array.isArray(period.ogsm?.freeNodes)
        ? period.ogsm.freeNodes
        : [];
      for (let fIdx = 0; fIdx < freeNodes.length; fIdx += 1) {
        const freeNode = freeNodes[fIdx];
        register(
          freeNode.id,
          freeNode.bizKey || `FREE-${dIdx + 1}-${pIdx + 1}-${fIdx + 1}`,
        );
      }
    }

    const activities = Array.isArray(dept.activities) ? dept.activities : [];
    for (let aIdx = 0; aIdx < activities.length; aIdx += 1) {
      const activity = activities[aIdx];
      register(
        activity.id,
        activity.bizKey || `ACT-DEPT-${dIdx + 1}-${aIdx + 1}`,
      );

      const kpis = Array.isArray(activity.kpis) ? activity.kpis : [];
      for (let kIdx = 0; kIdx < kpis.length; kIdx += 1) {
        const kpi = kpis[kIdx];
        register(
          kpi.id,
          kpi.bizKey ||
            `${activity.bizKey || `ACT-DEPT-${dIdx + 1}-${aIdx + 1}`}-K${String(kIdx + 1).padStart(2, "0")}`,
        );
      }

      const links = Array.isArray(activity.dashboardLinks)
        ? activity.dashboardLinks
        : [];
      for (let lIdx = 0; lIdx < links.length; lIdx += 1) {
        const link = links[lIdx];
        register(
          link.id,
          link.bizKey || `DLK-${dIdx + 1}-${aIdx + 1}-${lIdx + 1}`,
        );
      }

      const planItems = Array.isArray(activity.planItems)
        ? activity.planItems
        : [];
      for (let iIdx = 0; iIdx < planItems.length; iIdx += 1) {
        const item = planItems[iIdx];
        register(
          item.id,
          item.bizKey || `PIT-DEPT-${dIdx + 1}-${aIdx + 1}-${iIdx + 1}`,
        );
      }
    }

    const activityLinks = Array.isArray(dept.activityLinks)
      ? dept.activityLinks
      : [];
    for (let lIdx = 0; lIdx < activityLinks.length; lIdx += 1) {
      const link = activityLinks[lIdx];
      register(link.id, link.bizKey || `DLK-REL-${dIdx + 1}-${lIdx + 1}`);
    }
  }

  const teams = Array.isArray(workspace.teams) ? workspace.teams : [];
  for (let tIdx = 0; tIdx < teams.length; tIdx += 1) {
    const team = teams[tIdx];
    register(team.id, team.bizKey || `TEAM-${tIdx + 1}`);

    const members = Array.isArray(team.members) ? team.members : [];
    for (let mIdx = 0; mIdx < members.length; mIdx += 1) {
      const member = members[mIdx];
      register(member.id, member.bizKey || `MBR-${tIdx + 1}-${mIdx + 1}`);
    }
  }

  // Rewrite object ids.
  for (const dept of depts) {
    dept.id = remapRef(idMap, dept.id);

    const periods = Array.isArray(dept.periods) ? dept.periods : [];
    for (const period of periods) {
      period.id = remapRef(idMap, period.id);

      const goals = Array.isArray(period.ogsm?.goals) ? period.ogsm.goals : [];
      for (const goal of goals) {
        goal.id = remapRef(idMap, goal.id);

        const strategies = Array.isArray(goal.strategies)
          ? goal.strategies
          : [];
        for (const strategy of strategies) {
          strategy.id = remapRef(idMap, strategy.id);

          const measures = Array.isArray(strategy.measures)
            ? strategy.measures
            : [];
          for (const measure of measures) {
            measure.id = remapRef(idMap, measure.id);

            const kpis = Array.isArray(measure.kpis) ? measure.kpis : [];
            for (const kpi of kpis) {
              kpi.id = remapRef(idMap, kpi.id);
            }

            if (Array.isArray(measure.prerequisites)) {
              measure.prerequisites = measure.prerequisites.map((x) =>
                remapRef(idMap, x),
              );
            }
            if (Array.isArray(measure.relatedActivities)) {
              measure.relatedActivities = measure.relatedActivities.map((x) =>
                remapRef(idMap, x),
              );
            }
          }

          const actionPlans = Array.isArray(strategy.actionPlans)
            ? strategy.actionPlans
            : [];
          for (const plan of actionPlans) {
            plan.id = remapRef(idMap, plan.id);
            const items = Array.isArray(plan.items) ? plan.items : [];
            for (const item of items) {
              item.id = remapRef(idMap, item.id);
              item.linkedMeasureId = remapRef(idMap, item.linkedMeasureId);
              if (Array.isArray(item.dependsOnIds)) {
                item.dependsOnIds = item.dependsOnIds.map((x) =>
                  remapRef(idMap, x),
                );
              }
            }
          }
        }

        const goalKpis = Array.isArray(goal.goalKpis) ? goal.goalKpis : [];
        for (const gk of goalKpis) {
          gk.id = remapRef(idMap, gk.id);
          if (Array.isArray(gk.linkedKpis)) {
            gk.linkedKpis = gk.linkedKpis.map((lk) => ({
              ...lk,
              activityId: remapRef(idMap, lk.activityId || lk.measureId),
              kpiId: remapRef(idMap, lk.kpiId),
            }));
          }
          if (Array.isArray(gk.linkedGoalKpis)) {
            gk.linkedGoalKpis = gk.linkedGoalKpis.map((x) => ({
              ...x,
              goalId: remapRef(idMap, x.goalId),
              goalKpiId: remapRef(idMap, x.goalKpiId),
            }));
          }
          if (Array.isArray(gk.thresholdGoalKpiIds)) {
            gk.thresholdGoalKpiIds = gk.thresholdGoalKpiIds.map((x) =>
              remapRef(idMap, x),
            );
          }
          if (
            gk.activitySourceOverrides &&
            typeof gk.activitySourceOverrides === "object"
          ) {
            const next = {};
            for (const [k, v] of Object.entries(gk.activitySourceOverrides)) {
              next[remapRef(idMap, k)] = remapRef(idMap, v);
            }
            gk.activitySourceOverrides = next;
          }
        }
      }

      const freeNodes = Array.isArray(period.ogsm?.freeNodes)
        ? period.ogsm.freeNodes
        : [];
      for (const freeNode of freeNodes) {
        freeNode.id = remapRef(idMap, freeNode.id);
        if (Array.isArray(freeNode.linkedActivityIds)) {
          freeNode.linkedActivityIds = freeNode.linkedActivityIds.map((x) =>
            remapRef(idMap, x),
          );
        }
      }
    }

    const activities = Array.isArray(dept.activities) ? dept.activities : [];
    for (const activity of activities) {
      activity.id = remapRef(idMap, activity.id);

      const kpis = Array.isArray(activity.kpis) ? activity.kpis : [];
      for (const kpi of kpis) {
        kpi.id = remapRef(idMap, kpi.id);
      }

      const links = Array.isArray(activity.dashboardLinks)
        ? activity.dashboardLinks
        : [];
      for (const link of links) {
        link.id = remapRef(idMap, link.id);
        link.periodId = remapRef(idMap, link.periodId);
        link.goalId = remapRef(idMap, link.goalId);
        link.strategyId = remapRef(idMap, link.strategyId);
      }

      const planItems = Array.isArray(activity.planItems)
        ? activity.planItems
        : [];
      for (const item of planItems) {
        item.id = remapRef(idMap, item.id);
        item.linkedMeasureId = remapRef(idMap, item.linkedMeasureId);
        if (Array.isArray(item.dependsOnIds)) {
          item.dependsOnIds = item.dependsOnIds.map((x) => remapRef(idMap, x));
        }
      }

      if (Array.isArray(activity.prerequisites)) {
        activity.prerequisites = activity.prerequisites.map((x) =>
          remapRef(idMap, x),
        );
      }
      if (Array.isArray(activity.relatedActivities)) {
        activity.relatedActivities = activity.relatedActivities.map((x) =>
          remapRef(idMap, x),
        );
      }
    }

    const activityLinks = Array.isArray(dept.activityLinks)
      ? dept.activityLinks
      : [];
    for (const link of activityLinks) {
      link.id = remapRef(idMap, link.id);
      link.activityId = remapRef(idMap, link.activityId);
      link.periodId = remapRef(idMap, link.periodId);
      link.goalId = remapRef(idMap, link.goalId);
      link.strategyId = remapRef(idMap, link.strategyId);
    }
  }

  for (const team of teams) {
    team.id = remapRef(idMap, team.id);
    team.deptId = remapRef(idMap, team.deptId);
    const members = Array.isArray(team.members) ? team.members : [];
    for (const member of members) {
      member.id = remapRef(idMap, member.id);
    }
  }

  if (Array.isArray(workspace.deletedIds)) {
    workspace.deletedIds = workspace.deletedIds.map((x) => remapRef(idMap, x));
  }

  return { workspace, idMap };
}

function checkWorkspaceIntegrity(workspace) {
  const allIds = new Set();
  const missing = [];

  function collect(value) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }
    if (typeof value.id === "string") allIds.add(value.id);
    for (const v of Object.values(value)) collect(v);
  }

  collect(workspace);

  const addMissing = (field, id, context) => {
    if (!id || typeof id !== "string") return;
    if (!allIds.has(id)) missing.push({ field, id, context });
  };

  const depts = Array.isArray(workspace.departments)
    ? workspace.departments
    : [];
  for (const dept of depts) {
    const periods = Array.isArray(dept.periods) ? dept.periods : [];
    for (const period of periods) {
      const goals = Array.isArray(period.ogsm?.goals) ? period.ogsm.goals : [];
      for (const goal of goals) {
        const strategies = Array.isArray(goal.strategies)
          ? goal.strategies
          : [];
        for (const strategy of strategies) {
          const actionPlans = Array.isArray(strategy.actionPlans)
            ? strategy.actionPlans
            : [];
          for (const plan of actionPlans) {
            const items = Array.isArray(plan.items) ? plan.items : [];
            for (const item of items) {
              addMissing("linkedMeasureId", item.linkedMeasureId, item.id);
              if (Array.isArray(item.dependsOnIds)) {
                for (const depId of item.dependsOnIds)
                  addMissing("dependsOnIds", depId, item.id);
              }
            }
          }

          const measures = Array.isArray(strategy.measures)
            ? strategy.measures
            : [];
          for (const measure of measures) {
            if (Array.isArray(measure.prerequisites)) {
              for (const x of measure.prerequisites)
                addMissing("prerequisites", x, measure.id);
            }
            if (Array.isArray(measure.relatedActivities)) {
              for (const x of measure.relatedActivities)
                addMissing("relatedActivities", x, measure.id);
            }
          }
        }

        const goalKpis = Array.isArray(goal.goalKpis) ? goal.goalKpis : [];
        for (const gk of goalKpis) {
          if (Array.isArray(gk.linkedKpis)) {
            for (const lk of gk.linkedKpis) {
              addMissing("linkedKpis.activityId", lk.activityId, gk.id);
              addMissing("linkedKpis.kpiId", lk.kpiId, gk.id);
            }
          }
          if (Array.isArray(gk.linkedGoalKpis)) {
            for (const x of gk.linkedGoalKpis) {
              addMissing("linkedGoalKpis.goalId", x.goalId, gk.id);
              addMissing("linkedGoalKpis.goalKpiId", x.goalKpiId, gk.id);
            }
          }
          if (Array.isArray(gk.thresholdGoalKpiIds)) {
            for (const x of gk.thresholdGoalKpiIds)
              addMissing("thresholdGoalKpiIds", x, gk.id);
          }
          if (
            gk.activitySourceOverrides &&
            typeof gk.activitySourceOverrides === "object"
          ) {
            for (const [k, v] of Object.entries(gk.activitySourceOverrides)) {
              addMissing("activitySourceOverrides.key", k, gk.id);
              addMissing("activitySourceOverrides.value", v, gk.id);
            }
          }
        }
      }

      const freeNodes = Array.isArray(period.ogsm?.freeNodes)
        ? period.ogsm.freeNodes
        : [];
      for (const fn of freeNodes) {
        if (Array.isArray(fn.linkedActivityIds)) {
          for (const x of fn.linkedActivityIds)
            addMissing("freeNode.linkedActivityIds", x, fn.id);
        }
      }
    }

    const activities = Array.isArray(dept.activities) ? dept.activities : [];
    for (const activity of activities) {
      const links = Array.isArray(activity.dashboardLinks)
        ? activity.dashboardLinks
        : [];
      for (const link of links) {
        addMissing("dashboardLinks.periodId", link.periodId, activity.id);
        addMissing("dashboardLinks.goalId", link.goalId, activity.id);
        addMissing("dashboardLinks.strategyId", link.strategyId, activity.id);
      }
      const planItems = Array.isArray(activity.planItems)
        ? activity.planItems
        : [];
      for (const item of planItems) {
        addMissing(
          "planItems.linkedMeasureId",
          item.linkedMeasureId,
          activity.id,
        );
        if (Array.isArray(item.dependsOnIds)) {
          for (const x of item.dependsOnIds)
            addMissing("planItems.dependsOnIds", x, item.id);
        }
      }
      if (Array.isArray(activity.prerequisites)) {
        for (const x of activity.prerequisites)
          addMissing("activity.prerequisites", x, activity.id);
      }
      if (Array.isArray(activity.relatedActivities)) {
        for (const x of activity.relatedActivities)
          addMissing("activity.relatedActivities", x, activity.id);
      }
    }

    const activityLinks = Array.isArray(dept.activityLinks)
      ? dept.activityLinks
      : [];
    for (const link of activityLinks) {
      addMissing("activityLinks.activityId", link.activityId, link.id);
      addMissing("activityLinks.periodId", link.periodId, link.id);
      addMissing("activityLinks.goalId", link.goalId, link.id);
      addMissing("activityLinks.strategyId", link.strategyId, link.id);
    }
  }

  const teams = Array.isArray(workspace.teams) ? workspace.teams : [];
  for (const team of teams) {
    addMissing("team.deptId", team.deptId, team.id);
  }

  return { totalIds: allIds.size, missing };
}

function processFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);
  const { workspace } = rewriteWorkspaceIds(json);
  const integrity = checkWorkspaceIntegrity(workspace);
  if (integrity.missing.length > 0) {
    const sample = integrity.missing.slice(0, 10);
    throw new Error(
      `Integrity check failed for ${filePath}. Missing refs: ${sample
        .map((x) => `${x.field}:${x.id} @${x.context}`)
        .join(", ")}`,
    );
  }
  fs.writeFileSync(filePath, `${JSON.stringify(workspace, null, 2)}\n`, "utf8");
  return integrity;
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "Usage: node scripts/rewrite-ids-by-bizkey.cjs <file1.json> <file2.json> ...",
  );
  process.exit(1);
}

for (const arg of args) {
  const abs = path.resolve(arg);
  const res = processFile(abs);
  console.log(`updated ${abs} (ids=${res.totalIds})`);
}
