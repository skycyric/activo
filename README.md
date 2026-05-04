# Activo

**企業級部門目標管理工具** — 整合 OGSM 儀表板（Objectives → Goals → Strategies → Measures）與活動追蹤系統，協助團隊對齊策略與執行，實現數據驅動的跨部門協作。

> 🚀 **無伺服器部署**：單一 `index.html` 檔案（含所有 JS/CSS），可直接上傳 SharePoint / OneDrive；完整離線支援。

---

## 🎯 核心功能

| 功能模組        | 描述                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| **活動總覽**    | 跨部門活動追蹤與可視化 — 表格、看板、甘特圖、卡片、月曆、關聯圖；支援多期間篩選  |
| **OGSM 儀表板** | 目標→策略→行動計畫→KPI 層級檢視；實時計算達成率、進度指標、風險預警              |
| **目標編輯器**  | GoalKPI 可視化 Flow 設計器 — 支援 M 層 KPI 串接、G→G 加權聚合                    |
| **部門設定**    | 成員、期間（年份/上下半年/季度）、成本中心管理                                   |
| **標籤治理**    | 活動標籤建立與維護                                                               |
| **實時同步**    | LocalStorage + OneDrive/SharePoint（File System Access API）；自動衝突檢測與解決 |

---

## 🏗️ 技術架構

### 技術棧

- **React 19** + **TypeScript 5.9** + **Vite 8**
- **Zod 4** — 執行時期 schema 驗證，型別由 `z.infer` 推導（DRY 單一資料來源）
- **vite-plugin-singlefile** — build 產出為單一 `dist/index.html`（含所有 JS/CSS）
- **Vitest 4** — 單元測試框架

### 核心創新

1. **BizKey 系統** — 全局實體唯一標識符
   - 格式：`2026-H1-SALES-G02-S01-M03-K02`
   - 支援衝突檢測與無縫遷移

2. **Activity-First 架構**
   - `dept.activities[]` 為唯一資料來源（後端代理）
   - OGSM 儀表板純檢視層，活動優先讀取、OGSM fallback

3. **多層 KPI 計算引擎**
   - 4 種公式類型：`direct_rate`、`growth`、`target_pct`、`completion`
   - KPI 基底引用（固定值 or 同活動內 KPI 參考）
   - GoalKPI 聚合（M 層 + G 層）支援加權計算

4. **資料遷移合約**
   - Flagged migrations：一次性遷移（帶版本、描述、sunset 標記）
   - Always-run normalizers：每次載入執行不變量修復
   - Deprecated 分層：parse-only / compat-write 禁止

5. **衝突檢測與合併**
   - Last-Write-Wins (LWW) 策略
   - 自動探測遠端變更前的版本對比
   - 模態框人工解決複雜衝突

---

## 📊 數據模型

```text
Workspace (工作區)
  └── Department (部門)
       ├── PeriodData[] (期間資料)
       │   └── Goal (目標)
       │        └── Strategy (策略)
       │             └── Measure (行動計畫)
       │                  └── KPI[] (M 層 KPI)
       │        └── GoalKPI[] (G 層聚合)
       │
       └── DeptActivity[] (活動 — 唯一資料源)
            ├── KPI[] (與 M 層 KPI 同步)
            ├── DashboardLink[] (OGSM 關聯)
            └── ActionPlan.items[] (計畫項目)
```

## 🚀 快速開始

### 環境要求

- Node.js 18+
- npm 9+

### 開發指令

```bash
npm install        # 安裝相依套件
npm run dev        # 啟動開發伺服器 (http://localhost:5173)
npm run build      # TypeScript 型別檢查 + Vite 打包 → dist/index.html
npm test           # 執行 Vitest 單元測試（監視模式）
npm run ci:check   # CI/CD Gate：eslint + vitest + build
```

### 部署

1. 執行 `npm run build` 產生 `dist/index.html`
2. 上傳單一 HTML 檔案至：
   - SharePoint document library
   - OneDrive 根目錄
   - 任何靜態檔案託管服務（GitHub Pages、Vercel 等）

無需後端伺服器，完整離線支援。

---

## 📁 專案結構

```text
src/
├── schemas/ogsm.ts              # Zod schema（單一 source of truth）
│
├── utils/
│   ├── storage.ts               # localStorage 讀寫 + 遷移執行
│   ├── merge.ts                 # LWW 合併 + 衝突偵測
│   ├── bizKey.ts                # BizKey 生成/驗證
│   ├── kpiCalc.ts               # KPI 達成率計算引擎
│   ├── goalKpi.ts               # GoalKPI 聚合邏輯
│   ├── activityCompat.ts        # Activity-First 相容層
│   ├── csvParser.ts             # CSV → OGSMData 轉換
│   ├── fileSync.ts              # File System Access API 整合
│   └── *.test.ts                # 單元測試
│
├── components/
│   ├── App.tsx                  # 主程式入口
│   ├── HomePage.tsx             # 模組導航首頁
│   ├── OverviewPage.tsx         # 活動總覽 (6 種視圖)
│   ├── DetailPanel.tsx          # 活動編輯面板
│   ├── StrategyList.tsx         # OGSM 儀表板檢視
│   ├── KpiDesigner.tsx          # 目標編輯器 (Flow 設計)
│   ├── DeptSettingsPage.tsx     # 部門設定
│   ├── TagManagementPage.tsx    # 標籤治理
│   ├── ConflictModal.tsx        # 衝突解決對話框
│   ├── ActivityDetailPanel.tsx  # 活動詳細檢視
│   │
│   ├── activity/                # 活動相關子組件
│   │   ├── ActivityBoard.tsx    # 看板視圖
│   │   ├── ActivityGantt.tsx    # 甘特圖視圖
│   │   ├── ActivityCalendar.tsx # 月曆視圖
│   │   └── ActivityTimeline.tsx # 關聯圖視圖
│   │
│   └── ui/                      # UI 元件庫（按鈕、輸入框、模態框等）
│
├── contexts/
│   └── TourContext.tsx          # 應用引導系統 (Tour)
│
└── types/
    └── tour.ts                  # Tour 相關類型定義
```

---

## 🔄 主要使用流程

```text
1. 首頁 (HomePage)
   ├─ 活動總覽 → 建立/編輯活動 + KPI 追蹤
   ├─ OGSM 儀表板 → 檢視目標進度、達成率、行動計畫
   ├─ 目標編輯器 → 設計 GoalKPI Flow（M→G 聚合）
   ├─ 部門設定 → 配置期間、成員、成本中心
   └─ 標籤管理 → 維護活動標籤分類

2. 實時同步
   └─ LocalStorage 自動保存
      └─ 衝突檢測 (LWW + 遠端版本對比)
         └─ 衝突解決模態框 (可選手動調整)
            └─ OneDrive/SharePoint 同步 (File System API)
```

---

## 🛠️ 核心業務模組

| 模組                | 用途         | 核心邏輯                                         |
| ------------------- | ------------ | ------------------------------------------------ |
| `bizKey.ts`         | 全局實體標識 | 生成/驗證 BizKey；支援衝突檢測                   |
| `storage.ts`        | 資料持久化   | localStorage 讀寫、遷移執行、deprecated 欄位清理 |
| `merge.ts`          | 資料同步     | LWW 合併、衝突偵測、已清除欄位追蹤               |
| `kpiCalc.ts`        | KPI 計算     | 公式評估 + 基底解析（4 種計算類型）              |
| `goalKpi.ts`        | 層級聚合     | M→G KPI 串接 + 加權計算                          |
| `activityCompat.ts` | 讀寫策略     | Activity-First 優先、OGSM fallback               |
| `fileSync.ts`       | 外部同步     | File System Access API（OneDrive/SharePoint）    |
| `csvParser.ts`      | 資料匯入     | CSV → OGSMData 轉換                              |

---

## 💾 資料儲存與同步

### 儲存層級

| 層級       | 位置                                 | 用途                                                      |
| ---------- | ------------------------------------ | --------------------------------------------------------- |
| **Tier 1** | `localStorage` (`ogsm_workspace_v1`) | 主工作區資料（同步源）                                    |
| **Tier 2** | `IndexedDB`                          | File System Access API handle（用於 OneDrive/SharePoint） |
| **Tier 3** | OneDrive / SharePoint                | 雲端備份 + 跨裝置同步                                     |

### 遷移與相容性

#### 遷移執行合約（Phase 3b）

Workspace 正規化採用**資料驅動合約**：

- **`WORKSPACE_FLAGGED_MIGRATIONS`** — 一次性遷移（帶版本 flag、描述、sunset 標記）
- **`WORKSPACE_ALWAYS_RUN_NORMALIZERS`** — 每次載入都執行的不變量修復

完整清單見 [src/utils/storage.ts](src/utils/storage.ts)。

#### Deprecated 欄位政策（Phase 3c）

避免 sunset 邊界不清，分為兩層：

| 層級                  | 行為                                                    | 適用場景   |
| --------------------- | ------------------------------------------------------- | ---------- |
| **parse-only**        | 允許讀取舊資料，不作為新寫入來源                        | 漸進式淘汰 |
| **compat-write 禁止** | 允許解析舊檔，但 canonical writer/normalizer 會主動剔除 | 完全移除   |

政策常數定義在 [src/schemas/ogsm.ts](src/schemas/ogsm.ts)；實際剔除邏輯在 [src/utils/storage.ts](src/utils/storage.ts)。

---

## 🧪 測試與品質保證

### 測試覆蓋

- **Vitest 4** — 單元測試框架
- **測試文件** — 每個核心業務模組配對 `.test.ts`
- **測試範圍** — BizKey、KPI 計算、資料遷移、衝突檢測、CSV 匯入等

### 執行測試

```bash
npm test                    # 監視模式
npm test -- --run           # 單次執行
npm test -- --coverage      # 覆蓋率報告
```

### CI/CD 驗證

```bash
npm run ci:check            # 完整驗證鏈：eslint + vitest + build
```

---

## 🔍 偵錯與開發

### LocalStorage 檢查

在瀏覽器開發者工具中：

```javascript
// 查看當前工作區資料
JSON.stringify(JSON.parse(localStorage.getItem("ogsm_workspace_v1")), null, 2);

// 匯出至檔案
download(localStorage.getItem("ogsm_workspace_v1"), "workspace.json");
```

### 衝突檢測

自動檢測遠端變更時機點：

1. 載入工作區時對比 `lastModified`
2. 若偵測到遠端更新，觸發衝突檢測邏輯
3. 比對 `firstMeta` 和 `secondMeta` + 客戶端 `lastModified`
4. 不一致時彈出 ConflictModal

**關鍵提醒**：永不依賴單一 `meta` 探測，必須與客戶端版本對比。

### Build 狀態

- ✅ 已移除 Vite deprecated 警告：`inlineDynamicImports option is deprecated`
- ✅ 現行設定改用 `codeSplitting: false`（見 [vite.config.ts](vite.config.ts)）
- ℹ️ 保留 Rolldown plugin timing 的效能提示（非錯誤）

---

## 📦 依賴清單

### 核心

- `react@19` / `react-dom@19` — UI 框架
- `typescript@5.9` — 型別系統
- `zod@4` — 執行時期 schema 驗證

### 構建與開發

- `vite@8` — 開發伺服器 + 打包工具
- `vite-plugin-singlefile@0.13.0` — 單一 HTML 檔案輸出
- `vitest@4` — 測試框架
- `@vitest/ui` — 測試 UI 儀表板

### UI 與工具

- `react-flow-renderer@11` — KPI Flow 設計器
- `react-big-calendar@1.8` — 月曆視圖
- `recharts@2.10` — 圖表庫
- `xlsx@0.18` — Excel 匯入/匯出
- `papaparse@5.4` — CSV 解析

查看完整版本，見 [package.json](package.json)。

---

## 🎁 主要特色總結

✅ **無伺服器**：單一 HTML，無需後端  
✅ **離線優先**：完整功能離線可用，連接時自動同步  
✅ **企業級**：BizKey、多層 KPI、衝突檢測、遷移管理  
✅ **多視圖**：表格、看板、甘特、卡片、月曆、關聯圖  
✅ **可視化設計**：GoalKPI Flow 編輯器  
✅ **完整測試**：Vitest 單元測試 + CI/CD 驗證  
✅ **易於部署**：SharePoint / OneDrive / GitHub Pages 任選

---

## 📞 聯絡與貢獻

- 發現問題？提交 Issue
- 有改善建議？歡迎 Pull Request
- 需要支援？查看 [PLAN.md](PLAN.md) 或 [docs/](docs/) 目錄

---

**Last Updated**: 2026-05-04 | **License**: Proprietary
