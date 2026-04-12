# OGSM Power Tool — Activity-First 重構計劃

## 目標

將活動（Activity）從「OGSM 樹的葉節點（`strategy.measures[]`）」升級為「部門層的一等公民（`dept.activities[]`）」，稱為 **Activity-First 架構（V3）**。

核心目標：

- 活動可以獨立存在，不一定需掛在 OGSM 策略下
- 活動透過 `dashboardLinks` 連結到一個或多個 OGSM 策略，支援日後擴展（OKR、Roadmap…）
- 行動計畫從巢狀 `ActionPlan > PlanItem` 平坦化為 `planItems[]`（每個 item 直接帶 `quarter`）
- Goal KPI 從策略指標池聚合，長期目標是讓 GoalKPI 也能連結 Activity-layer 的 KPI

---

## 各 Phase 進度

### ✅ Phase 0 — Schema 升級（V3 資料結構）

**檔案**：`src/schemas/ogsm.ts`、`src/utils/storage.ts`

- `DashboardLinkSchema`：連結到儀表板的通用結構 `{ id, type, periodId?, goalId?, strategyId?, exclude }`
- `ActivityPlanItemSchema`：`PlanItemSchema.extend({ quarter? })` 平坦行動項目
- `DeptActivitySchema` 新增 `dashboardLinks?`、`tags?`、`planItems?`；標記 `ogsmLink`/`excludeFromOgsm`/`actionPlans` 為 deprecated
- `WorkspaceDataSchema` 加 `_migratedV3: boolean?` 旗標
- `migrateToV3()`：`ogsmLink → dashboardLinks`、`actionPlans → planItems`、清空 `strategy.measures[]`
- `normalizeWorkspaceData()`：進入點自動觸發 `migrateToActivityFirst()` 再 `migrateToV3()`

---

### ✅ Phase 1 — 消費端改讀 V3 欄位

**檔案**：`src/components/ActivityPage.tsx`、`src/App.tsx`、`src/components/DetailPanel.tsx`

- `ActivityPage`：`activity.ogsmLink` → `activity.dashboardLinks?.find(l => l.type === "ogsm")`
- `App.tsx`：`linkedDeptActivities` useMemo 改用 `dashboardLinks?.some(l => l.type === "ogsm" && l.strategyId === ...)`
- `DetailPanel.tsx`：`isExcluded` 改讀 `dashboardLinks[].exclude`；`onToggleExcludeFromOgsm` 新增第三個參數 `strategyId`

---

### ✅ Phase 2 — 統一 CRUD 介面（Activity-First Handler）

**檔案**：`src/App.tsx`、`src/components/ActivityPage.tsx`、所有 `activity/` 子元件、`src/components/activity/ActivityAddModal.tsx`

- 舊的 5 參數 handler（`handleUpdateMeasureDirect(deptId, periodId, goalId, stratId, measure)`）全部移除
- 新增 4 個扁平 handler：
  - `handleUpdateDeptActivity(deptId, activity)` — 直接 patch `dept.activities[]`
  - `handleDeleteDeptActivity(deptId, activityId)` — 刪除 + tombstone
  - `handleAddDeptActivity(deptId, activity)` — 推入 `dept.activities[]`
  - `handleJumpToActivity(deptId, activityId)` — 從 `dashboardLinks` 查出 OGSM 位置後導覽
- 所有子元件 Props 更新為新簽名
- `ActivityAddModal` 改為單一表單（部門、名稱、說明、主責、協助單位、日期），附可展開的 OGSM 連結選擇區

---

### ✅ Phase 3 — DetailPanel M Tab → 唯讀活動清單

**檔案**：`src/components/DetailPanel.tsx`、`src/App.tsx`

**舊行為**：M tab 是完整的 `strategy.measures[]` 編輯器，含

- 季度頁籤（Q1–Q4）、拖曳排序
- KPI 新增/編輯/刪除（`KpiCard` 內嵌元件）
- 活動 InlineEdit、主責者選擇、日期、狀態、複製、新增活動按鈕（共 ~880 行）

**新行為**：M tab 改為「連結活動」唯讀清單：

- 顯示 `linkedDeptActivities`（`dashboardLinks.strategyId === strategy.id` 的活動）
- 每列顯示：狀態徽章、名稱、主責者、日期範圍、計入OGSM toggle、KPI 數量
- 頂部 + 每列底部有「前往活動頁面 →」按鈕（`onNavigateToActivityPage` prop）
- 空狀態提示：「尚無連結活動，請至活動頁面新增…」
- `goal.strategies[].measures[]` 刪除工作移除後，KpiCard、所有 Measure 編輯 helper 函式一律清除

**App.tsx**：傳入 `onNavigateToActivityPage={() => setShowActivityPage(true)}`；移除 `allMembers` 宣告與傳遞。

---

### 🔲 Phase 4 — GoalKPI 計算連結 Activity-layer KPI

**狀態**：待計劃確認

#### 問題描述

目前 `computeGoalKpiResult(gk, goal)` 透過以下路徑（V2 架構）找 KPI 值：

```
goal.strategies[] → strategy.measures[] → measure.kpis[]
```

`GoalKpiLink` schema 為：

```ts
{
  (strategyId, measureId, kpiId);
}
```

在 V3 架構執行 `migrateToV3()` 後，`strategy.measures[]` 被清空，已有的 `linkedKpis` 全部找不到對應資料，GoalKPI 計算結果將一律為 `null`。

#### 影響範圍

| 元件/檔案                         | 影響                                                        |
| --------------------------------- | ----------------------------------------------------------- |
| `src/utils/goalKpi.ts`            | 核心計算函式直接讀 `strategy.measures[]`，全路徑失效        |
| `src/components/StrategyList.tsx` | 呼叫 `computeGoalKpiResult`，Goal KPI 看板顯示歸零          |
| `src/components/OverviewPage.tsx` | `goalKpiRate()` 呼叫 `computeGoalKpiResult`，概覽達成率歸零 |
| `src/utils/goalKpi.test.ts`       | 測試用例全部依賴 `strategy.measures[]` 路徑，遷移後需重寫   |
| `src/components/StrategyList.tsx` | GoalKPI 連結建立 UI（`linkedKpis` 的新增/移除），需改介面   |

#### 三個選項

**Option A — 最小改動（推薦短期）**：`computeGoalKpiResult` 改接收 `activities: DeptActivity[]` 第三參數，優先從 `dept.activities[]` 查 KPI，`strategy.measures[]` 作為 fallback。`GoalKpiLink` schema 不動，`strategyId` + `measureId` 的 `measureId` 在 V3 後對應 `activity.id`（同一 ID）。

```
GoalKpiLink.measureId === activity.id（V3 後 measure 已遷移，ID 不變）
→ 先查 dept.activities.find(a => a.id === link.measureId)
→ 再查 a.kpis.find(k => k.id === link.kpiId)
```

優點：`GoalKpiLink` schema 不需改動、StrategyList 建立連結 UI 改動極小  
缺點：`strategyId` 欄位在 V3 架構下語意模糊（仍保留但只是用來過濾）

**Option B — 精確重構（長期）**：`GoalKpiLink` 改為 `{ activityId, kpiId }`（去掉 `strategyId`/`measureId`），計算函式改為直接查 `dept.activities[]`，所有建立/顯示 linkedKpis 的 UI 都需同步更新，測試也需重寫。

**Option C — 延遲實作（暫時跳過）**：`strategy.measures[]` 在遷移後清空，但在「GoalKPI 連結建立功能」中改為讓使用者連結 `dept.activities[].kpis[]`，這樣新建立的連結可正常運作；舊的 `linkedKpis` 設 `[]` 保留 UI 空白。

#### 評估建議

- **現有資料**：所有已存活動遷移後，活動 ID（`measureId`）在 `dept.activities[]` 中完整保留，KPI ID 也對應保留，因此 **Option A 可以零資料遷移成本讓 GoalKPI 恢復運作**。
- **Option A 實作成本**：`computeGoalKpiResult` 簽名改為 `(gk, goal, deptActivities?)`，查找邏輯從 `goal.strategies` fallback 改為優先 `deptActivities`，測試調整即可。
- **建議先做 Option A**，記錄 `strategyId` 未來廢棄計劃，等資料確實全面遷移後再做 Option B。

---

## 資料流圖（V3 架構）

```
WorkspaceData
  └── departments[]
        ├── activities[]          ← 一等公民活動（新）
        │     ├── id              ← 與舊 measure.id 相同（migration 保留）
        │     ├── dashboardLinks  ← [{ type:"ogsm", strategyId, ... }]
        │     ├── kpis[]          ← KPI 由此直接讀取
        │     └── planItems[]     ← 平坦行動計畫（Q1/Q2...）
        └── periods[]
              └── ogsm
                    └── goals[]
                          ├── goalKpis[]     ← Goal KPI（聚合）
                          │     └── linkedKpis[{ strategyId, measureId, kpiId }]
                          │           └── measureId ≡ activity.id（Phase 4 後對應）
                          └── strategies[]
                                └── measures[]  ← V3 遷移後清空（[]）
```

---

## 下一步

1. 確認 Phase 4 採用 Option A / B / C
2. 若採 Option A：更新 `computeGoalKpiResult` + `goalKpi.test.ts` + StrategyList 建立連結 UI 的查找路徑
