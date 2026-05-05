export interface ChangelogEntry {
  version: string; // e.g. "v1.0.0"
  date: string; // ISO date "YYYY-MM-DD"
  summary: string; // 首頁顯示的一行公告
  items?: string[]; // 選填：詳細更新項目
}

/**
 * 更新版本時，在陣列「最前面」插入新的一筆，首頁會自動顯示最新公告。
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.0.0",
    date: "2026-04-23",
    summary:
      "正式發佈！支援多部門 OGSM 管理、活動甘特圖、KPI 設計器與多檔案同步模式。",
    items: [
      "多部門 OGSM 儀表板",
      "活動甘特圖 & 看板",
      "KPI 視覺化設計器",
      "多檔案資料夾同步模式",
    ],
  },
];

/** 最新版本（陣列第一筆） */
export const LATEST_VERSION = CHANGELOG[0];
