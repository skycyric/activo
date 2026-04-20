# OGSM Power Tool

部門 OGSM 看板管理工具，用於追蹤目標（Objectives）、目標分解（Goals）、策略（Strategies）與衡量指標（Measures）。

## 技術棧

- **React 19** + **TypeScript 5.9** + **Vite 8**
- **Zod 4** — 執行時期 schema 驗證，型別由 `z.infer` 推導
- **vite-plugin-singlefile** — build 產出為單一 `dist/index.html`（含所有 JS/CSS）
- **Vitest 4** — 單元測試

## 開發指令

```bash
npm install        # 安裝相依套件
npm run dev        # 啟動開發伺服器 (http://localhost:5173)
npm run build      # TypeScript 型別檢查 + Vite 打包 → dist/index.html
npm test           # 執行單元測試
npm run ci:check   # Release gate：lint + test + build
```

## 資料儲存

- **localStorage** (`ogsm_workspace_v1`) — 主要工作區資料
- **IndexedDB** — File System Access API handle（用於與 OneDrive / SharePoint 同步）
- **遷移機制** — 載入時自動執行，採「flagged migrations + always-run normalizers」雙層合約

## 相容性政策（Phase 3c）

deprecated 欄位已分為兩層，避免 sunset 邊界不清：

- **parse-only**：允許讀取舊資料，不做新寫入來源
- **compat-write 禁止**：允許解析舊檔，但 canonical writer/normalizer 會主動剔除

政策常數定義在 [src/schemas/ogsm.ts](src/schemas/ogsm.ts)，
實際剔除邏輯在 [src/utils/storage.ts](src/utils/storage.ts) 的 workspace normalizer。

## 遷移執行合約（Phase 3b）

workspace 正規化已改為資料驅動合約：

- `WORKSPACE_FLAGGED_MIGRATIONS`：一次性遷移（有 flag、描述、sunset 註記）
- `WORKSPACE_ALWAYS_RUN_NORMALIZERS`：每次載入都執行的不變量修復

可在 [src/utils/storage.ts](src/utils/storage.ts) 查看完整清單與 sunset 註記。

## Build 警告狀態

- 已移除 Vite deprecated 警告：`inlineDynamicImports option is deprecated`
- 現行設定改用 `codeSplitting: false`（見 [vite.config.ts](vite.config.ts)）
- 目前僅保留 Rolldown plugin timing 的效能提示（非錯誤）

## 專案結構

```
src/
├── schemas/ogsm.ts          # Zod schema（單一 source of truth）
├── utils/
│   ├── storage.ts           # localStorage 讀寫 + 資料遷移
│   ├── merge.ts             # LWW 合併 + 衝突偵測
│   ├── merge.test.ts        # Vitest 單元測試
│   ├── csvParser.ts         # CSV → OGSMData 轉換
│   ├── exportXlsx.ts        # 匯出 Excel
│   └── fileSync.ts          # File System Access API
└── components/
    ├── OverviewPage.tsx      # 總覽頁
    ├── DetailPanel.tsx       # 策略詳細編輯面板
    ├── StrategyList.tsx      # 策略清單
    ├── Sidebar.tsx           # 側邊欄
    ├── DeptSettingsPage.tsx  # 部門設定
    └── ConflictModal.tsx     # 合併衝突解決對話框
```
