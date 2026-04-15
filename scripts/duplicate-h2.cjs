const fs = require("fs");
const path = require("path");

// 生成唯一 ID（追加上下文 + 後綴 "_h2"）
function cloneWithNewIds(obj, idSuffix = "_h2") {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => cloneWithNewIds(item, idSuffix));
  }

  const cloned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === "id" && typeof value === "string") {
      // 替換 ID 後綴
      cloned[key] = value.replace(/_[a-z0-9]+$/, (m) => m + idSuffix);
    } else if (typeof value === "object") {
      cloned[key] = cloneWithNewIds(value, idSuffix);
    } else {
      cloned[key] = value;
    }
  }
  return cloned;
}

async function duplicateH2() {
  const dataPath = path.join(__dirname, "../test/商務發展部/ogsm_data.json");
  const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

  const dept = data.departments[0];
  const h1Period = dept.periods[0];

  console.log("📋 複製 H1 期間到 H2...");
  console.log(`  原始 H1: ID=${h1Period.id}, 年份=${h1Period.year}`);

  // 深度複製並生成新 ID
  const h2Period = cloneWithNewIds(h1Period, "_h2");
  h2Period.halfYear = "H2";
  h2Period.year = 2026;

  console.log(`  新增 H2: ID=${h2Period.id}, 年份=${h2Period.year}`);

  // 驗證結構完整性
  console.log(`  ✓ 目標數: ${h2Period.ogsm.goals.length}`);
  console.log(
    `  ✓ 第一個策略的措施數: ${h2Period.ogsm.goals[0].strategies[0].measures.length}`,
  );

  // 添加到 periods 陣列
  if (!dept.periods.some((p) => p.halfYear === "H2")) {
    dept.periods.push(h2Period);
    console.log("  ✓ H2 期間已添加到 periods 陣列");
  } else {
    console.log("  ⚠ H2 期間已存在，跳過");
  }

  // 保存回檔案
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), "utf8");
  console.log(`\n✅ 檔案已更新: ${dataPath}`);

  // 同時更新另一個部門的測試資料（如果存在）
  const dept2Path = path.join(__dirname, "../test/設計企畫部/data.json");
  if (fs.existsSync(dept2Path)) {
    const data2 = JSON.parse(fs.readFileSync(dept2Path, "utf8"));
    const dept2 = data2.departments?.[0];

    if (
      dept2 &&
      dept2.periods &&
      !dept2.periods.some((p) => p.halfYear === "H2")
    ) {
      const h1Period2 = dept2.periods[0];
      const h2Period2 = cloneWithNewIds(h1Period2, "_h2");
      h2Period2.halfYear = "H2";
      h2Period2.year = 2026;
      dept2.periods.push(h2Period2);

      fs.writeFileSync(dept2Path, JSON.stringify(data2, null, 2), "utf8");
      console.log(`✅ 檔案已更新: ${dept2Path}`);
    }
  }

  console.log("\n🎉 完成！現在有 H1 和 H2 兩個期間可用於測試多期間篩選功能");
}

duplicateH2().catch(console.error);
