# OGSM Power Tool — Activity-First V3+ 完整計劃

## 目標

以 `dept.activities[]` 為唯一資料來源（「活動總覽」即後端，`data.json` 即資料庫）：

- **所有活動編輯**集中在活動總覽，OGSM 儀表板退化為純檢視
- **KPI** 重新設計為活動的結構化欄位集，含公式類型與基底引用
- **GoalKPI** 透過可視化 Flow 設計器串接 M 層 KPI，並支援 G→G 加權聚合
- **ActivityDetailPanel** 取代 ActivityTable inline edit，提供完整活動編輯 UX

---

## 已完成（Phases 0–4）

- ✅ Phase 0：Schema 升級（DashboardLink、ActivityPlanItem、DeptActivity、\_migratedV3）
- ✅ Phase 1：消費端改讀 V3 欄位（ActivityPage、App.tsx、DetailPanel）
- ✅ Phase 2：統一 CRUD handler（handleUpdateDeptActivity 等4個）
- ✅ Phase 3：DetailPanel M tab → 唯讀連結活動清單
- ✅ Phase 4（Option B）：GoalKPI 計算改從 dept.activities[] 讀取；GoalKpiLink = { activityId, kpiId }

---

## Phase 5 — ActivityDetailPanel（日常填值 UI）✅ 已完成

### 5A：KPI Schema 升級 ✅

**檔案**：`src/schemas/ogsm.ts`、`src/utils/kpiCalc.ts`

KPISchema 新增欄位：

- `name: z.string().optional()` — 使用者自訂 KPI 名稱
- `formulaType: z.enum(["direct_rate", "growth"]).optional()` — 計算公式類型
- `baseline: KpiBaselineSchema.nullable().optional()` — 成長型基底（固定值 or 同活動 KPI 引用）

新增 `src/utils/kpiCalc.ts`：`computeKpiAchievement`、`resolveBaseline`、`recomputeActivityKpis`、`getKpiDisplayName`

### 5B：ActivityDetailPanel 元件 ✅

**新檔案**：`src/components/ActivityDetailPanel.tsx`

4 個 Tab：

1. **基本資料**：名稱、說明、主責（OwnerPicker）、協助單位（AssistUnitPicker）、日期範圍、狀態、tags
2. **KPI 指標**：每個 KPI 顯示 actual 輸入 + achievementRate 自動計算；「⚙ 設定」→ KpiConfigModal；＋ 新增 KPI
3. **行動計畫**：planItems[] checklist，依 quarter 分組，支援新增/刪除/完成/日期
4. **備註**：notes 文字編輯

面板寬度可拖曳，寬度存 localStorage `activo_activity_panel_width`。

### 5C：KPI 設定 Modal（Layer 2）✅

**新檔案**：`src/components/activity/KpiConfigModal.tsx`

Fields：KPI 名稱、單位、公式類型（radio）、目標值/目標成長率、基底來源（僅 growth 型）

### 5D：ActivityPage 整合（右側面板佈局）✅

**修改**：`src/components/ActivityPage.tsx`

- `selectedActivityId` state
- 兩欄佈局：`.activity-main-row` flex row，view area + detail panel
- `initialSelectedActivityId` prop（供 DetailPanel 「編輯→」跳入時預設開啟活動）
- `pendingActivityDetailId` state in App.tsx

### 5E：OGSM DetailPanel M tab 調整 ✅

**修改**：`src/components/DetailPanel.tsx`

- 新增 `onOpenActivityDetail?: (activityId: string) => void` prop
- 「編輯 →」按鈕優先呼叫 `onOpenActivityDetail`，fallback `onNavigateToActivityPage`
- App.tsx 傳入：開啟 ActivityPage 並設定 `pendingActivityDetailId`

### 5F：KPI 達成率計算整合至 GoalKPI ✅

**修改**：`src/utils/goalKpi.ts`

已整合 `computeKpiAchievement`，取代舊內聯計算。

---

## Phase 6 — KPI Designer（React Flow 視覺化設計器）

### 6A：安裝與 bundle 評估

```
npm install @xyflow/react
```

預期 bundle 增加 ~300KB（gzip 約 +65KB），專案確認可接受。

### 6B：Schema 升級（GoalKPI 兩種類型明確化）

**修改**：`src/schemas/ogsm.ts`

GoalKPI 新增欄位，強制互斥：

```typescript
GoalKPISchema.extend({
  goalKpiType: z.enum(["direct", "aggregate"]).default("direct"),
  linkedGoalKpis: z
    .array(
      z.object({
        goalId: z.string(),
        goalKpiId: z.string(),
        weight: z.number().min(0).max(1),
      }),
    )
    .optional(),
});
```

遷移：所有現有 GoalKPI 自動設 `goalKpiType: "direct"`。

### 6C：GoalKPI 計算更新

**修改**：`src/utils/goalKpi.ts`

- `goalKpiType === "aggregate"` 時：對 `linkedGoalKpis` 遞迴計算各子 GoalKPI 的 rate，再加權平均
- 防循環引用檢查（visited set）

### 6D：KPI Designer UI

**新檔案**：`src/components/KpiDesigner.tsx`

**Step 1**：工作範圍選擇器（Goal 選擇 + 活動篩選勾選）

**Step 2**：Flow 畫布

- GoalKPI 節點（blue=direct / purple=aggregate）
- Activity 群組節點（可折疊，KPI 列有 handle）
- G→M 邊（實線藍）、G→G 邊（虛線紫，weight 標籤）

**Step 3**：Node Config Panel（選中節點後右側滑入）

**入口**：活動總覽 header「📐 KPI 設計」按鈕 + OverviewPage GoalKPI「⚙ 設計」

---

## 資料流圖（V3+ 架構）

```
WorkspaceData
  └── departments[]
        ├── activities[]                ← 唯一資料來源（活動總覽管理）
        │     ├── id
        │     ├── dashboardLinks[]      ← OGSM 串接（唯讀展示）
        │     ├── kpis[]               ← M 層 KPI（ActivityDetailPanel 填值）
        │     │     ├── name           ← Phase 5A 新增
        │     │     ├── formulaType    ← Phase 5A 新增
        │     │     ├── baseline       ← Phase 5A 新增
        │     │     ├── target / actual
        │     │     └── achievementRate← 計算值
        │     ├── planItems[]          ← 行動計畫
        │     └── notes
        └── periods[]
              └── ogsm
                    └── goals[]
                          ├── goalKpis[]
                          │     ├── goalKpiType      ← Phase 6B 新增
                          │     ├── linkedKpis[]     ← G→M
                          │     └── linkedGoalKpis[] ← G→G（Phase 6B 新增）
                          └── strategies[]
                                └── measures[]       ← V3 後清空
```

---

## 開發順序

```
Phase 5A（KPI Schema）✅
  → 5B（ActivityDetailPanel）✅ + 5C（KpiConfigModal）✅
      → 5D（ActivityPage 整合）✅
          → 5E（DetailPanel M tab 調整）✅
              → 5F（goalKpi.ts 整合）✅

Phase 6A（安裝 @xyflow/react）
  → 6B（GoalKPI Schema）
      → 6C（計算更新）+ 6D（KPI Designer UI）（平行）
```

---

## 明確排除範圍

- OGSM 儀表板編輯功能（Phase 5 後全面唯讀）
- 跨活動 KPI 基底引用（kpiRef 限同一活動內）
- KPI Designer 中新增 KPI（只能在 ActivityDetailPanel 新增）
- GoalKPI `type: pct_activity` 在 aggregate 型的行為（暫不支援）
