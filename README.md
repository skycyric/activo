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
```

## 資料儲存

- **localStorage** (`ogsm_workspace_v1`) — 主要工作區資料
- **IndexedDB** — File System Access API handle（用於與 OneDrive / SharePoint 同步）
- **遷移機制** — 載入時自動執行，以 `_migratedPhase2`/`_migratedPhase3` flag 確保只執行一次

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

```js
export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```
