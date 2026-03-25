import ExcelJS from "exceljs";
import type { WorkspaceData, Strategy } from "../types/ogsm";

function sActionProgress(s: Strategy): number {
  const items = s.actionPlans.flatMap((ap) => ap.items);
  if (items.length === 0) return 0;
  return Math.round(
    (items.filter((i) => i.completed).length / items.length) * 100,
  );
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.height = 20;
  row.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A5F" },
    };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: false,
    };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF5B8CE8" } },
    };
  });
}

export async function exportWorkspaceXlsx(
  workspace: WorkspaceData,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "OGSM Power Tool";
  wb.created = new Date();

  // ─── Sheet 1: OGSM 總覽 ───────────────────────────────────────────────
  const sh1 = wb.addWorksheet("OGSM總覽");
  sh1.columns = [
    { header: "部門", key: "dept", width: 14 },
    { header: "期間", key: "period", width: 10 },
    { header: "層級", key: "level", width: 6 },
    { header: "代碼", key: "code", width: 8 },
    { header: "說明", key: "title", width: 55 },
    { header: "負責人", key: "owner", width: 14 },
    { header: "進度%", key: "progress", width: 9 },
  ];
  styleHeaderRow(sh1.getRow(1));
  sh1.views = [{ state: "frozen", ySplit: 1 }];

  for (const dept of workspace.departments) {
    for (const pd of dept.periods) {
      const ogsm = pd.ogsm;
      const periodStr = ogsm.period;

      // O row
      sh1.addRow({
        dept: dept.name,
        period: periodStr,
        level: "O",
        code: "O",
        title: ogsm.objectives.deptO,
        owner: "",
        progress: "",
      });
      const oRow = sh1.lastRow!;
      oRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1E293B" },
        };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      });

      for (const goal of ogsm.goals) {
        const gProg =
          goal.strategies.length > 0
            ? Math.round(
                goal.strategies.reduce(
                  (sum, s) => sum + sActionProgress(s),
                  0,
                ) / goal.strategies.length,
              )
            : 0;

        sh1.addRow({
          dept: dept.name,
          period: periodStr,
          level: "G",
          code: goal.label,
          title: goal.title,
          owner: "",
          progress: gProg,
        });
        const gRow = sh1.lastRow!;
        gRow.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFDBEAFE" },
          };
          cell.font = { bold: true };
        });

        for (let si = 0; si < goal.strategies.length; si++) {
          const s = goal.strategies[si];
          const prog = sActionProgress(s);

          sh1.addRow({
            dept: dept.name,
            period: periodStr,
            level: "S",
            code: `S${si + 1}`,
            title: s.title,
            owner: s.owner,
            progress: prog,
          });
          const sRow = sh1.lastRow!;
          sRow.eachCell((cell) => {
            cell.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF0F9FF" },
            };
          });

          for (let mi = 0; mi < s.measures.length; mi++) {
            const m = s.measures[mi];
            sh1.addRow({
              dept: dept.name,
              period: periodStr,
              level: "M",
              code: `M${mi + 1}`,
              title: m.rawText,
              owner: m.owner ?? "",
              progress: "",
            });
          }
        }
      }
    }
  }

  // ─── Sheet 2: KPI 明細 ────────────────────────────────────────────────
  const sh2 = wb.addWorksheet("KPI明細");
  sh2.columns = [
    { header: "部門", key: "dept", width: 14 },
    { header: "期間", key: "period", width: 10 },
    { header: "G", key: "goal", width: 8 },
    { header: "S", key: "strategy", width: 8 },
    { header: "M 活動", key: "measure", width: 32 },
    { header: "KPI 名稱", key: "label", width: 25 },
    { header: "目標", key: "target", width: 10 },
    { header: "實際值", key: "actual", width: 10 },
    { header: "達成率%", key: "rate", width: 10 },
    { header: "單位", key: "unit", width: 8 },
  ];
  styleHeaderRow(sh2.getRow(1));
  sh2.views = [{ state: "frozen", ySplit: 1 }];

  for (const dept of workspace.departments) {
    for (const pd of dept.periods) {
      for (const goal of pd.ogsm.goals) {
        for (let si = 0; si < goal.strategies.length; si++) {
          const s = goal.strategies[si];
          for (const m of s.measures) {
            for (const k of m.kpis) {
              const hasActual = k.actual !== null;
              const row = sh2.addRow({
                dept: dept.name,
                period: pd.ogsm.period,
                goal: goal.label,
                strategy: `S${si + 1}`,
                measure: m.rawText,
                label: k.label,
                target: k.target ?? "",
                actual: k.actual ?? "",
                rate:
                  hasActual && k.achievementRate !== null
                    ? Math.round(k.achievementRate)
                    : "",
                unit: k.unit,
              });
              if (hasActual && k.achievementRate !== null) {
                const r = k.achievementRate;
                const argb =
                  r >= 100
                    ? "FF059669"
                    : r >= 70
                      ? "FF6366F1"
                      : r >= 40
                        ? "FFF59E0B"
                        : "FFEF4444";
                row.getCell("rate").font = { bold: true, color: { argb } };
              }
            }
          }
        }
      }
    }
  }

  // ─── Sheet 3: 行動計畫 ───────────────────────────────────────────────
  const sh3 = wb.addWorksheet("行動計畫");
  sh3.columns = [
    { header: "部門", key: "dept", width: 14 },
    { header: "期間", key: "period", width: 10 },
    { header: "G", key: "goal", width: 8 },
    { header: "S", key: "strategy", width: 8 },
    { header: "計畫名稱", key: "plan", width: 20 },
    { header: "Q", key: "quarter", width: 6 },
    { header: "項目說明", key: "desc", width: 40 },
    { header: "開始日期", key: "start", width: 12 },
    { header: "結束日期", key: "end", width: 12 },
    { header: "負責人", key: "owner", width: 12 },
    { header: "完成", key: "done", width: 6 },
  ];
  styleHeaderRow(sh3.getRow(1));
  sh3.views = [{ state: "frozen", ySplit: 1 }];

  for (const dept of workspace.departments) {
    for (const pd of dept.periods) {
      for (const goal of pd.ogsm.goals) {
        for (let si = 0; si < goal.strategies.length; si++) {
          const s = goal.strategies[si];
          for (const ap of s.actionPlans) {
            for (const item of ap.items) {
              const row = sh3.addRow({
                dept: dept.name,
                period: pd.ogsm.period,
                goal: goal.label,
                strategy: `S${si + 1}`,
                plan: ap.title || ap.quarter,
                quarter: ap.quarter,
                desc: item.description,
                start: item.startDate ?? item.date ?? "",
                end: item.endDate ?? "",
                owner: item.owner ?? "",
                done: item.completed ? "✓" : "",
              });
              if (item.completed) {
                row.getCell("done").font = {
                  bold: true,
                  color: { argb: "FF059669" },
                };
              }
            }
          }
        }
      }
    }
  }

  // Trigger download in browser
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `OGSM_報告_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
