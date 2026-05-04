import type { TourStep } from "../types/tour";

/**
 * 使用導覽步驟定義。
 * - `page`：切換到哪個頁面（home / activity / ogsm / kpi / settings / tags）
 * - `target`：對應畫面上的 data-tour 屬性，例如 "[data-tour='nav-tabs']"
 * - `placement`：泡泡彈出方向
 *
 * 新增步驟時，在此陣列插入一筆即可；同時在對應元素加上 data-tour 屬性。
 */
export const TOUR_STEPS: TourStep[] = [
  // ── 首頁 ──────────────────────────────────────────────────────────────────
  {
    id: "welcome",
    page: "home",
    title: "歡迎使用 Activo 👋",
    content:
      "Activo 是一個整合 OGSM 目標管理與活動追蹤的工具，協助團隊對齊策略、掌握進度。讓我帶你快速認識各項功能！",
    placement: "bottom",
  },
  {
    id: "dept-select",
    page: "home",
    target: "[data-tour='dept-select']",
    title: "右上角：部門切換器",
    content:
      "這裡切換目前正在操作的部門。不同部門各自有自己的 OGSM、活動、KPI 與同步狀態，切換後整個工作內容會跟著切換。",
    placement: "bottom",
  },
  {
    id: "link-folder",
    page: "home",
    target: "[data-tour='link-folder']",
    title: "右上角：連結根目錄",
    content:
      "這是多檔案協作模式的入口。連結根目錄後，系統會掃描各部門 JSON，讓每個部門資料獨立存放，適合多人協作與版本管理。",
    placement: "bottom",
  },
  {
    id: "sync-mechanism",
    page: "home",
    target: "[data-tour='sync-mechanism'], [data-tour='link-folder']",
    title: "右上角：同步狀態",
    content:
      "連結資料夾後，這裡會顯示目前部門的同步狀態，例如已儲存、待儲存、唯讀或錯誤。若尚未連結資料夾，會先看到連結根目錄按鈕。",
    placement: "bottom",
  },
  {
    id: "save-dirty",
    page: "home",
    target:
      "[data-tour='save-dirty'], [data-tour='save-all-dirty'], [data-tour='link-folder']",
    title: "右上角：存檔機制",
    content:
      "連結資料夾後，這裡會出現存檔按鈕。可以只存目前部門，也可以一次存所有髒部門。這是避免多人協作時資料遺失的核心機制。",
    placement: "bottom",
  },
  {
    id: "save-all-dirty",
    page: "home",
    target:
      "[data-tour='save-all-dirty'], [data-tour='save-dirty'], [data-tour='link-folder']",
    title: "右上角：全部存檔",
    content:
      "當多個部門都有未儲存變更時，用這個按鈕可以依序把全部髒部門寫回磁碟。括號中的數字就是尚未儲存的部門數量。",
    placement: "bottom",
  },
  {
    id: "backup-btn",
    page: "home",
    target: "[data-tour='backup-btn']",
    title: "右上角：備份",
    content:
      "備份會匯出整個工作區資料，適合做手動快照。重大調整前先備份，可以在資料異常時快速回復。",
    placement: "bottom",
  },
  {
    id: "restore-btn",
    page: "home",
    target: "[data-tour='restore-btn']",
    title: "右上角：還原",
    content:
      "還原可重新匯入先前備份的 JSON 或來源資料。這是從外部檔案恢復工作區的入口。",
    placement: "bottom",
  },

  // ── 活動總覽 ──────────────────────────────────────────────────────────────
  {
    id: "activity-intro",
    page: "activity",
    title: "活動總覽",
    content:
      "這裡集中管理所有跨部門活動（Measures）。每個活動都代表一個具體的執行項目，對應到 OGSM 的策略層。按下一步查看活動統計。",
    placement: "bottom",
  },
  {
    id: "activity-count-badge",
    page: "activity",
    target: "[data-tour='activity-count-badge']",
    title: "活動數量統計",
    content:
      "這裡會顯示目前活動總數；若已套用篩選，則會顯示篩選後數量 / 總數，幫你立即判斷目前看到的是哪一批活動。",
    placement: "bottom",
  },
  {
    id: "activity-filter",
    page: "activity",
    target: "[data-tour='activity-filter']",
    title: "篩選列",
    content:
      "可依部門、負責人、狀態與日期範圍篩選活動，快速找到特定活動。篩選條件在切換檢視模式時會保留。",
    placement: "bottom",
  },
  {
    id: "activity-add-btn",
    page: "activity",
    target: "[data-tour='activity-add-btn']",
    title: "新增活動",
    content:
      "點擊此按鈕可新增一個活動。新增後可以設定活動名稱、日期、負責人、狀態與相關 KPI。",
    placement: "bottom",
  },
  {
    id: "activity-add-modal",
    page: "activity",
    target: "[data-tour='activity-add-modal']",
    title: "新增活動視窗",
    content:
      "按下新增活動後會開啟此視窗。你可以一次填寫活動名稱、主責、日期與協作單位，完成後建立新活動。",
    placement: "left",
  },
  {
    id: "activity-add-ogsm-link",
    page: "activity",
    target: "[data-tour='activity-add-ogsm-link']",
    title: "新增活動：OGSM 連結",
    content:
      "展開這裡可把活動綁定到特定期別／目標／策略。連結後，活動 KPI 會回寫到 OGSM 成效計算。",
    placement: "left",
  },
  {
    id: "activity-card-detail",
    page: "activity",
    target: "[data-tour='activity-card-detail']",
    title: "活動卡片",
    content:
      "點擊任一活動卡片可在右側面板查看與編輯詳細資訊，包括活動的 KPI 目標、執行計畫與備註。",
    placement: "left",
  },
  {
    id: "activity-detail-tabs",
    page: "activity",
    target: "[data-tour='activity-detail-tabs']",
    title: "活動詳情：分頁導覽",
    content:
      "展開活動後，右側面板可切換四個分頁：基本資料、KPI 指標、行動計畫、備註。",
    placement: "left",
  },
  {
    id: "activity-detail-basic",
    page: "activity",
    target:
      "[data-tour='activity-detail-tab-basic'], [data-tour='activity-detail-basic']",
    title: "活動詳情：基本資料",
    content:
      "維護活動名稱、主責、日期、狀態與 OGSM 關聯。這是活動主檔欄位的核心編輯區。",
    placement: "left",
  },
  {
    id: "activity-detail-kpi",
    page: "activity",
    target:
      "[data-tour='activity-detail-tab-kpi'], [data-tour='activity-detail-kpi']",
    title: "活動詳情：KPI 指標",
    content:
      "在這裡新增或調整活動 KPI，設定目標值與實際值，系統會計算達成率供 OGSM 與儀表板使用。",
    placement: "left",
  },
  {
    id: "activity-detail-plans",
    page: "activity",
    target:
      "[data-tour='activity-detail-tab-plans'], [data-tour='activity-detail-plans']",
    title: "活動詳情：行動計畫",
    content: "把活動拆解為季度行動項目，追蹤完成進度、預警與逾期狀態。",
    placement: "left",
  },
  {
    id: "activity-detail-notes",
    page: "activity",
    target:
      "[data-tour='activity-detail-tab-notes'], [data-tour='activity-detail-notes']",
    title: "活動詳情：備註",
    content: "記錄補充說明、會議結論或後續追蹤事項，保留活動脈絡。",
    placement: "left",
  },
  {
    id: "activity-kanban-intro",
    page: "activity",
    target: "[data-tour='activity-view-switcher']",
    title: "看板檢視",
    content:
      "切換到看板（Kanban）檢視，可用卡片牆方式組織活動，按狀態（如：待辦、進行中、完成）分欄管理。",
    placement: "bottom",
  },
  {
    id: "activity-gantt-intro",
    page: "activity",
    target: "[data-tour='activity-view-switcher']",
    title: "甘特圖檢視",
    content:
      "切換到甘特圖（Gantt）檢視，以時間軸方式呈現活動進度、依賴關係與里程碑。按下一步了解甘特圖的子模式。",
    placement: "bottom",
  },
  {
    id: "activity-gantt-subtabs",
    page: "activity",
    target: "[data-tour='activity-gantt-subtabs']",
    title: "甘特圖子模式",
    content:
      "切到甘特圖後，這裡還能再切換『活動甘特』與『計畫甘特』。前者看活動時間軸，後者看活動下的計畫項目與依賴關係。",
    placement: "bottom",
  },
  {
    id: "activity-cards-intro",
    page: "activity",
    target: "[data-tour='activity-view-switcher']",
    title: "卡片牆檢視",
    content:
      "切換到卡片牆檢視，大尺寸卡片呈現活動重點資訊，便於一次掃過多個活動的狀態與 KPI。",
    placement: "bottom",
  },
  {
    id: "activity-calendar-intro",
    page: "activity",
    target: "[data-tour='activity-view-switcher']",
    title: "月曆檢視",
    content:
      "切換到月曆檢視，以日期為主軸查看活動分佈，快速識別時間軸上的重要活動與截止日期。",
    placement: "bottom",
  },
  {
    id: "activity-graph-tab",
    page: "activity",
    target: "[data-tour='activity-graph-tab']",
    title: "關聯圖檢視",
    content:
      "切換到關聯圖後，可以看到活動之間由共同標籤形成的關聯強度，適合用來找出高關聯活動群。",
    placement: "bottom",
  },
  {
    id: "activity-graph-canvas",
    page: "activity",
    target: "[data-tour='activity-graph-canvas']",
    title: "關聯圖畫布",
    content:
      "節點代表活動、線代表標籤關聯。你可以拖曳節點重排、拖曳背景平移、滾輪縮放，快速檢視整體關聯結構。",
    placement: "left",
  },
  {
    id: "activity-graph-legend",
    page: "activity",
    target: "[data-tour='activity-graph-legend']",
    title: "關聯圖說明卡",
    content:
      "右下角說明卡可對照節點狀態顏色與關聯強度分級，幫助你快速解讀這張關聯圖。",
    placement: "left",
  },
  {
    id: "activity-graph-weak-toggle",
    page: "activity",
    target: "[data-tour='activity-graph-weak-toggle']",
    title: "弱關聯線顯示",
    content:
      "可用這個勾選框切換是否顯示弱關聯線。關閉後畫面會更聚焦在中高關聯，便於會議討論。",
    placement: "left",
  },

  // ── 目標編輯器 ────────────────────────────────────────────────────────────
  {
    id: "kpi-intro",
    page: "kpi",
    title: "目標編輯器（KPI Designer）",
    content:
      "這裡用視覺化方式編排目標、節點與 KPI 關係。適合做結構設計、對齊 KPI 定義，以及檢查指標如何連到策略與活動。",
    placement: "bottom",
  },
  {
    id: "kpi-module-select",
    page: "kpi",
    target: "[data-tour='kpi-module-select']",
    title: "模組切換",
    content:
      "先在左上選擇要編輯的模組。OGSM 目標體系會啟用完整 KPI 設計功能；其他模組則可維護自由節點。",
    placement: "right",
  },
  {
    id: "kpi-left-panel",
    page: "kpi",
    target: "[data-tour='kpi-left-panel']",
    title: "左側結構面板",
    content:
      "左側是節點與目標結構入口。你可以在這裡管理 O/G/S 或自由節點，並快速切換要編輯的節點。",
    placement: "right",
  },
  {
    id: "kpi-node-manager",
    page: "kpi",
    target: "[data-tour='kpi-node-manager']",
    title: "項目模式：節點管理",
    content:
      "在項目模式下，可新增、複製、刪除目標與策略（或自由節點），用來調整整體目標樹結構。",
    placement: "right",
  },
  {
    id: "kpi-goalkpi-tree",
    page: "kpi",
    target: "[data-tour='kpi-goalkpi-tree']",
    title: "KPI 模式：GoalKPI 樹",
    content:
      "切到 KPI 模式後，左側會改成 GoalKPI 樹，可管理 G-KPI 與 G-sub-KPI 的層次與項目。",
    placement: "right",
  },
  {
    id: "kpi-view-mode",
    page: "kpi",
    target: "[data-tour='kpi-view-mode']",
    title: "畫布模式切換",
    content:
      "這裡可切換『項目模式』與『KPI 模式』。項目模式偏向節點結構編排；KPI 模式則專注在 KPI 的聚合、連結與計算。",
    placement: "bottom",
  },
  {
    id: "kpi-canvas",
    page: "kpi",
    target: "[data-tour='kpi-canvas']",
    title: "設計畫布",
    content:
      "中央畫布顯示節點關係。點選節點後，可在旁邊編輯細節；拖曳與切換模式時，這裡會即時反映整個目標結構。",
    placement: "bottom",
  },
  {
    id: "kpi-save-changes",
    page: "kpi",
    target: "[data-tour='kpi-save-changes'], [data-tour='kpi-view-mode']",
    title: "KPI 變更存檔",
    content:
      "當你修改 Goal KPI 設定後，這裡會出現『儲存 KPI 變更』。請在離開前先存檔，避免草稿遺失。",
    placement: "bottom",
  },
  {
    id: "kpi-node-config-panel",
    page: "kpi",
    target: "[data-tour='kpi-node-config-panel'], [data-tour='kpi-types']",
    title: "右側設定面板",
    content:
      "選到節點後，右側會出現對應設定，例如目標值、聚合來源、活動 KPI 連結與計算規則。",
    placement: "left",
  },

  // ── OGSM ──────────────────────────────────────────────────────────────────
  {
    id: "ogsm-intro",
    page: "ogsm",
    title: "OGSM 儀表板",
    content:
      "OGSM = Objective（目標）、Goal（指標）、Strategy（策略）、Measure（活動）。這個頁面是整個管理架構的核心。",
    placement: "bottom",
  },
  {
    id: "ogsm-sidebar",
    page: "ogsm",
    target: "[data-tour='ogsm-sidebar']",
    title: "左側導覽欄",
    content:
      "列出所有目標（Goal）與其下的策略（Strategy）。點擊目標可展開查看策略清單，點擊策略進入詳細編輯。",
    placement: "right",
  },
  {
    id: "ogsm-goal-header",
    page: "ogsm",
    target: "[data-tour='ogsm-goal-header']",
    title: "OGSM：目標主區塊",
    content: "這裡顯示目前選定 Goal 的標題與摘要，是查看該目標整體成效的入口。",
    placement: "top",
  },
  {
    id: "ogsm-kpi-scorecard",
    page: "ogsm",
    target:
      "[data-tour='ogsm-kpi-scorecard'], [data-tour='ogsm-subkpi-scorecard']",
    title: "OGSM：KPI 成效卡",
    content:
      "這裡把 G-KPI 與 G-sub-KPI 拆開顯示，快速看目標成效與活動執行指標的達標狀況。",
    placement: "top",
  },
  {
    id: "ogsm-strategy-list",
    page: "ogsm",
    target: "[data-tour='ogsm-strategy-list']",
    title: "策略清單",
    content:
      "顯示目前選定目標的所有策略，包含 KPI 達成率、活動數量與負責人摘要。",
    placement: "top",
  },
  {
    id: "ogsm-strategy-rows",
    page: "ogsm",
    target: "[data-tour='ogsm-strategy-rows']",
    title: "OGSM：策略列",
    content:
      "點選策略列可進入右側策略活動儀表板，查看該策略底下活動、KPI 與行動計畫的細節。",
    placement: "top",
  },
  {
    id: "ogsm-strategy-detail",
    page: "ogsm",
    target: "[data-tour='ogsm-strategy-detail']",
    title: "OGSM：策略活動儀表板",
    content:
      "右側儀表板整合策略相關活動的摘要、警示、KPI 與計畫進度，適合做策略層的例行追蹤。",
    placement: "left",
  },
  {
    id: "ogsm-linked-activity-dashboard",
    page: "ogsm",
    target: "[data-tour='ogsm-linked-activity-dashboard']",
    title: "OGSM：活動明細區",
    content:
      "可切換逾期／預警篩選並展開單一活動，看到 KPI 明細與行動計畫警示，必要時可一鍵前往活動總覽編輯。",
    placement: "left",
  },

  // ── 部門設定 ──────────────────────────────────────────────────────────
  {
    id: "settings-intro",
    page: "settings",
    title: "部門設定",
    content:
      "在此管理部門成員名單、設定執行期間（H1 / H2 / 全年），以及進行資料的匯入 / 匯出。",
    placement: "bottom",
  },
  {
    id: "settings-tabs",
    page: "settings",
    target: "[data-tour='settings-tabs']",
    title: "設定分頁",
    content: "部門設定提供團隊設定功能，可管理人員與團隊。",
    placement: "bottom",
  },
  {
    id: "settings-team-list",
    page: "settings",
    target:
      "[data-tour='settings-team-section'], [data-tour='settings-team-list']",
    title: "團隊設定明細",
    content:
      "在團隊設定頁可維護團隊與成員。這些資料會回流到活動主責、策略負責人與協作單位選單。",
    placement: "top",
  },
  {
    id: "settings-team-actions",
    page: "settings",
    target: "[data-tour='settings-team-actions']",
    title: "團隊操作按鈕",
    content:
      "這裡可以新增團隊並儲存團隊設定。新增後的團隊與成員，會出現在策略負責單位與計畫主責者等選單裡。",
    placement: "top",
  },
  // ── 標籤管理 ──────────────────────────────────────────────────────────
  {
    id: "tags-intro",
    page: "tags",
    title: "標籤管理",
    content:
      "這裡是活動標籤的字典管理中心。建立並維護好標籤，可提升關聯圖品質與跨部門檢索效率。",
    placement: "bottom",
  },
  {
    id: "tags-main-section",
    page: "tags",
    target: "[data-tour='tags-main-section']",
    title: "標籤管理主區",
    content:
      "主區會列出目前所有標籤與狀態。停用標籤仍保留歷史資料，但不會再出現在新增/編輯活動的可選清單。",
    placement: "top",
  },
  {
    id: "tags-add-row",
    page: "tags",
    target: "[data-tour='tags-add-row']",
    title: "新增標籤",
    content:
      "在這裡輸入新標籤名稱並新增。建議使用簡短一致的命名，避免同義詞造成分類分散。",
    placement: "top",
  },
  {
    id: "tags-list",
    page: "tags",
    target: "[data-tour='tags-list']",
    title: "標籤清單",
    content:
      "這裡會列出目前全部標籤。建議定期檢查重複或過時標籤，保持整體分類乾淨一致。",
    placement: "top",
  },
  {
    id: "tags-row-actions",
    page: "tags",
    target: "[data-tour='tags-row-actions']",
    title: "標籤列操作",
    content:
      "每個標籤都能改名、停用或刪除。建議先停用再觀察一段時間，確認沒有影響後再刪除。",
    placement: "top",
  },
  {
    id: "tags-weight-setting",
    page: "tags",
    target: "[data-tour='tags-weight-setting']",
    title: "關聯權重",
    content:
      "每個標籤可設定關聯權重（0.1 ~ 5.0）。權重越高，該標籤在關聯圖中的影響力越大。",
    placement: "top",
  },
  {
    id: "tags-delete-dialog",
    page: "tags",
    target: "[data-tour='tags-delete-dialog']",
    title: "刪除標籤對話框",
    content:
      "刪除前會跳出確認視窗，避免誤操作。導覽會自動示範打開這個視窗，方便你看完整流程。",
    placement: "top",
  },
  {
    id: "tags-delete-mode",
    page: "tags",
    target: "[data-tour='tags-delete-mode']",
    title: "刪除後處理模式",
    content:
      "你可以選擇把舊標籤合併到其他標籤，或從所有活動直接移除。合併通常較能保留歷史脈絡。",
    placement: "top",
  },
  {
    id: "tags-save-actions",
    page: "tags",
    target: "[data-tour='tags-save-actions']",
    title: "儲存標籤字典",
    content: "調整完成後請按儲存，變更才會正式套用到活動頁與關聯圖分析。",
    placement: "top",
  },
];
