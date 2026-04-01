import { test, expect, type Page } from "@playwright/test";

// ─── 輔助工具 ─────────────────────────────────────────────────────────────────

/** 點選 Sidebar 第一個目標；確保能點到有策略的目標 */
async function clickFirstGoal(page: Page) {
  const goalBtn = page.locator(".sidebar-goal-btn").first();
  await goalBtn.waitFor({ state: "visible", timeout: 10_000 });
  await goalBtn.click();
}

/** 點選第一個策略列 */
async function clickFirstStrategy(page: Page) {
  const stratRow = page.locator(".strategy-row").first();
  await stratRow.waitFor({ state: "visible", timeout: 10_000 });
  await stratRow.click();
}

// ─── 1. 頁面載入 ──────────────────────────────────────────────────────────────

test.describe("頁面載入", () => {
  test("document title 包含 ogsm", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/ogsm/i);
  });

  test("Sidebar 出現在畫面上", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar")).toBeVisible({ timeout: 10_000 });
  });

  test("OverviewPage 預設為顯示狀態（沒有 goal 被選取）", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".overview-page")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Sidebar 有目標清單", async ({ page }) => {
    await page.goto("/");
    // 預設載入 CSV → 有數個目標
    await expect(page.locator(".sidebar-goal-btn").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ─── 2. 目標選擇流程 ───────────────────────────────────────────────────────────

test.describe("目標選擇", () => {
  test("點選目標後 OverviewPage 消失、StrategyList 出現", async ({ page }) => {
    await page.goto("/");
    await clickFirstGoal(page);
    await expect(page.locator(".overview-page")).not.toBeVisible();
    await expect(
      page.locator(".strategy-list, .strategy-list-empty"),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("點選目標後 Sidebar 該目標按鈕有 active 樣式", async ({ page }) => {
    await page.goto("/");
    const goalBtn = page.locator(".sidebar-goal-btn").first();
    await goalBtn.waitFor({ state: "visible", timeout: 10_000 });
    await goalBtn.click();
    await expect(goalBtn).toHaveClass(/active/);
  });

  test("點選 O 按鈕（總覽）後回到 OverviewPage", async ({ page }) => {
    await page.goto("/");
    await clickFirstGoal(page);
    // 找 O 按鈕並點選
    await page.locator(".sidebar-o-btn").click();
    await expect(page.locator(".overview-page")).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ─── 3. 策略選擇與 DetailPanel ────────────────────────────────────────────────

test.describe("策略選擇", () => {
  test("點選策略後 DetailPanel 開啟", async ({ page }) => {
    await page.goto("/");
    await clickFirstGoal(page);
    await clickFirstStrategy(page);
    await expect(page.locator(".detail-panel")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("DetailPanel 顯示策略標題", async ({ page }) => {
    await page.goto("/");
    await clickFirstGoal(page);
    // 取得第一策略名稱
    const titleEl = page.locator(".strategy-row-title").first();
    await titleEl.waitFor({ state: "visible", timeout: 10_000 });
    const stratTitle = await titleEl.innerText();
    await clickFirstStrategy(page);
    const panel = page.locator(".detail-panel");
    await expect(panel).toBeVisible({ timeout: 10_000 });
    // Panel header 應包含策略標題中的部分文字（取前 20 字）
    const trimmed = stratTitle.trim().slice(0, 20);
    if (trimmed.length > 0) {
      await expect(panel).toContainText(trimmed, { timeout: 5_000 });
    }
  });

  test("DetailPanel 可關閉", async ({ page }) => {
    await page.goto("/");
    await clickFirstGoal(page);
    await clickFirstStrategy(page);
    await expect(page.locator(".detail-panel")).toBeVisible({
      timeout: 10_000,
    });
    await page.locator(".detail-close").click();
    await expect(page.locator(".detail-panel")).not.toBeVisible();
  });
});

// ─── 4. 新增目標（G） ──────────────────────────────────────────────────────────

test.describe("新增目標", () => {
  test("點選「＋ 新增目標（G）」按鈕後 Sidebar 目標數增加", async ({
    page,
  }) => {
    await page.goto("/");
    const beforeCount = await page.locator(".sidebar-goal-btn").count();
    await page.locator(".ov-add-goal").click();
    await expect(page.locator(".sidebar-goal-btn")).toHaveCount(
      beforeCount + 1,
      { timeout: 5_000 },
    );
  });

  test("新增目標後自動跳至新目標（StrategyList 顯示）", async ({ page }) => {
    await page.goto("/");
    await page.locator(".ov-add-goal").click();
    await expect(
      page.locator(".strategy-list, .strategy-list-empty"),
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ─── 5. 新增策略（S） ──────────────────────────────────────────────────────────

test.describe("新增策略", () => {
  test("點選「＋ 新增策略（S）」後策略列數增加", async ({ page }) => {
    await page.goto("/");
    await clickFirstGoal(page);
    const beforeCount = await page.locator(".strategy-row").count();
    await page.locator(".sl-add-strategy").click();
    await expect(page.locator(".strategy-row")).toHaveCount(beforeCount + 1, {
      timeout: 5_000,
    });
  });
});

// ─── 6. localStorage 持久化 ───────────────────────────────────────────────────

test.describe("localStorage 持久化", () => {
  test("新增目標後 reload 資料保留", async ({ page }) => {
    await page.goto("/");
    // 先取得新增前的目標數
    const beforeCount = await page.locator(".sidebar-goal-btn").count();
    await page.locator(".ov-add-goal").click();
    await expect(page.locator(".sidebar-goal-btn")).toHaveCount(
      beforeCount + 1,
      { timeout: 5_000 },
    );
    // Reload
    await page.reload();
    await expect(page.locator(".sidebar-goal-btn")).toHaveCount(
      beforeCount + 1,
      { timeout: 10_000 },
    );
  });
});

// ─── 7. ConflictModal backdrop 迴歸測試（M-5）────────────────────────────────

test.describe("ConflictModal backdrop M-5 迴歸", () => {
  test("ConflictModal 出現前不存在 conflict-backdrop", async ({ page }) => {
    await page.goto("/");
    // 正常狀態下不應有 backdrop
    const backdrop = page.locator(".conflict-backdrop");
    await expect(backdrop).toHaveCount(0);
  });
});

// ─── 8. DeptSettings 開合 ────────────────────────────────────────────────────

test.describe("DeptSettings 開合", () => {
  test("部門設定頁預設不顯示", async ({ page }) => {
    await page.goto("/");
    await expect(
      page.locator(".dept-settings-page, .dept-settings-overlay"),
    ).toHaveCount(0);
  });
});
