# bizKey 命名規範（V1）

## 1. 目的

- 提供具業務語意的識別碼（bizKey）供 UI 顯示、搜尋、匯出使用。
- 與技術主鍵 `id` 分離：`id` 仍是 merge、關聯、tombstone 的不可變鍵。

## 2. 基本原則

- `id`：不可變技術主鍵，不承載業務語意。
- `bizKey`：可讀、可搜尋、可檢核的業務識別碼。
- 建立時由前端欄位生成；建立後原則上不直接改寫。
- 若核心語意變更（例如部門代碼、跨期複製），採版本化（`-V2`、`-V3`）。

## 3. 正規化規則

- 一律大寫。
- 允許字元：`A-Z`、`0-9`、`-`。
- 非法字元一律轉為 `-`。
- 連續 `-` 壓縮成單一 `-`。
- 去除首尾 `-`。
- 建議總長度 <= 64。

## 4. 命名模板與唯一性作用域

| 實體          | 模板                                 | 前端必要欄位                                                                                          | 唯一性作用域                | 衝突解法              |
| ------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------- | --------------------- |
| Department    | `DEP-yyyy-dep`                       | `year`, `deptCode`                                                                                    | 全 Workspace 唯一           | 同碼時補 `-01`, `-02` |
| Period        | `PER-yyyy-hh-dep`                    | `year`, `halfYear`, `deptCode`                                                                        | 同 Department 唯一          | 同期存在則拒絕建立    |
| Goal          | `GOAL-yyyy-hh-dep-gno`               | `year`, `halfYear`, `deptCode`, `goalOrder`                                                           | 同 Department + Period 唯一 | `gno` 遞增            |
| Strategy      | `STR-yyyy-hh-dep-gno-sno`            | `year`, `halfYear`, `deptCode`, `goalOrder`, `strategyOrder`                                          | 同 Goal 唯一                | `sno` 遞增            |
| Activity      | `ACT-yyyy-hh-dep-gno-sno-ano`        | `year`, `halfYear`, `deptCode`, `goalOrder`, `strategyOrder`, `activityOrder`                         | 同 Strategy 唯一            | `ano` 遞增            |
| KPI           | `KPI-yyyy-hh-dep-gno-sno-ano-kno`    | 上述 + `kpiOrder`                                                                                     | 同 Activity 唯一            | `kno` 遞增            |
| ActionPlan    | `PLN-yyyy-hh-dep-gno-sno-qx-pno`     | `year`, `halfYear`, `deptCode`, `goalOrder`, `strategyOrder`, `quarter`, `planOrder`                  | 同 Strategy + Quarter 唯一  | `pno` 遞增            |
| PlanItem      | `PIT-yyyy-hh-dep-gno-sno-ano-qx-ino` | `year`, `halfYear`, `deptCode`, `goalOrder`, `strategyOrder`, `activityOrder`, `quarter`, `itemOrder` | 同 Activity + Quarter 唯一  | `ino` 遞增            |
| GoalKPI       | `GKPI-yyyy-hh-dep-gno-kno`           | `year`, `halfYear`, `deptCode`, `goalOrder`, `goalKpiOrder`                                           | 同 Goal 唯一                | `kno` 遞增            |
| DashboardLink | `DLK-yyyy-hh-dep-ano-lno`            | `year`, `halfYear`, `deptCode`, `activityOrder`, `linkOrder`                                          | 同 Activity 唯一            | `lno` 遞增            |
| Team          | `TEAM-dep-tno`                       | `deptCode`, `teamOrder`                                                                               | 同 Department 唯一          | `tno` 遞增            |
| TeamMember    | `MBR-dep-tno-mno`                    | `deptCode`, `teamOrder`, `memberOrder`                                                                | 同 Team 唯一                | `mno` 遞增            |
| FreeNode      | `FREE-yyyy-hh-dep-fno`               | `year`, `halfYear`, `deptCode`, `freeNodeOrder`                                                       | 同 Department + Period 唯一 | `fno` 遞增            |
| ActivityLink  | `ALK-yyyy-hh-dep-ano-target`         | `year`, `halfYear`, `deptCode`, `activityOrder`, `targetCode`                                         | 同 Activity + target 唯一   | 視為同一關聯，不重建  |

## 5. 衝突解法優先序

1. 先檢查作用域唯一性。
2. 衝突時優先遞增序號段（`Gx/Sx/Ax/...`）。
3. 若無序號段可遞增，補尾碼 `-01`, `-02`。
4. 若使用者手動輸入且衝突，回傳建議可用值。

## 6. 匯入與遷移策略

- 保留既有 `id` 不變。
- 若舊資料缺少 `bizKey`，依模板補齊。
- 若舊 `bizKey` 不符合規範：
  - 產生新 `bizKey`
  - 可選保留 `originalBizKey`
  - 記錄映射表 `old -> new`

## 7. 更新與版本策略

- 一般欄位更新不改 `bizKey`。
- 核心語意變更才升版：例如部門代碼調整、跨期複製。
- 升版格式：原 key 尾段追加 `-V2`、`-V3`。

## 8. 驗收標準

- 新建資料 100% 產生符合模板的 `bizKey`。
- 作用域內唯一。
- 匯入舊檔可正規化並可追蹤映射。
- merge 仍以 `id` 為主鍵，不改用 `bizKey`。
