const fs = require("fs");
const path = require("path");

function activityLinkKey(link) {
  return [
    link.activityId || "",
    link.type || "",
    link.periodId || "",
    link.goalId || "",
    link.strategyId || "",
    link.exclude ? "1" : "0",
  ].join("|");
}

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function migrateWorkspaceRelationalV1(ws) {
  if (!ws || !Array.isArray(ws.departments)) {
    return { changed: false, reason: "not-workspace" };
  }

  let changed = false;
  for (const dept of ws.departments) {
    const activities = Array.isArray(dept.activities) ? dept.activities : [];
    const activityIdSet = new Set(activities.map((a) => a.id));
    const merged = new Map();

    // Seed from existing relation table
    for (const rel of Array.isArray(dept.activityLinks)
      ? dept.activityLinks
      : []) {
      if (!activityIdSet.has(rel.activityId)) {
        changed = true;
        continue;
      }
      const normalized = {
        id:
          rel.id ||
          `dlink_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        activityId: rel.activityId,
        type: rel.type || "ogsm",
        periodId: rel.periodId,
        goalId: rel.goalId,
        strategyId: rel.strategyId,
        exclude: !!rel.exclude,
      };
      const k = activityLinkKey(normalized);
      if (!merged.has(k)) merged.set(k, normalized);
      else changed = true;
    }

    // Merge from activities[].dashboardLinks
    for (const activity of activities) {
      for (const link of Array.isArray(activity.dashboardLinks)
        ? activity.dashboardLinks
        : []) {
        const normalized = {
          id:
            link.id ||
            `dlink_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          activityId: activity.id,
          type: link.type || "ogsm",
          periodId: link.periodId,
          goalId: link.goalId,
          strategyId: link.strategyId,
          exclude: !!link.exclude,
        };
        const k = activityLinkKey(normalized);
        if (!merged.has(k)) {
          merged.set(k, normalized);
          changed = true;
        }
      }
    }

    const nextActivityLinks = Array.from(merged.values()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );

    const prev = deepClone(
      Array.isArray(dept.activityLinks) ? dept.activityLinks : [],
    );
    if (JSON.stringify(prev) !== JSON.stringify(nextActivityLinks)) {
      dept.activityLinks =
        nextActivityLinks.length > 0 ? nextActivityLinks : undefined;
      changed = true;
    }

    // Compatibility hydration: activity.dashboardLinks <- relation table
    for (const activity of activities) {
      const links = nextActivityLinks
        .filter((l) => l.activityId === activity.id)
        .map(({ activityId, ...rest }) => rest)
        .sort((a, b) => a.id.localeCompare(b.id));
      const prevLinks = deepClone(
        Array.isArray(activity.dashboardLinks) ? activity.dashboardLinks : [],
      );
      if (JSON.stringify(prevLinks) !== JSON.stringify(links)) {
        activity.dashboardLinks = links.length > 0 ? links : undefined;
        changed = true;
      }
    }
  }

  if (ws._migratedRelationalV1 !== true) {
    ws._migratedRelationalV1 = true;
    changed = true;
  }

  return { changed };
}

function migrateFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);
  const res = migrateWorkspaceRelationalV1(data);

  if (res.changed) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    console.log(`[updated] ${filePath}`);
  } else {
    console.log(`[skip] ${filePath}`);
  }
}

function collectTargetFiles(rootDir) {
  const result = [];

  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        walk(p);
        continue;
      }
      if (name === "data.json" || name === "ogsm_data.json") {
        result.push(p);
      }
    }
  }

  walk(rootDir);
  return result;
}

function main() {
  const root = process.argv[2] || path.join(process.cwd(), "test");
  if (!fs.existsSync(root)) {
    console.error(`[error] root not found: ${root}`);
    process.exit(1);
  }

  const files = collectTargetFiles(root);
  if (files.length === 0) {
    console.log("[done] no target json files found");
    return;
  }

  console.log(`[start] relational-v1 migration, root=${root}`);
  for (const f of files) migrateFile(f);
  console.log(`[done] processed ${files.length} file(s)`);
}

main();
