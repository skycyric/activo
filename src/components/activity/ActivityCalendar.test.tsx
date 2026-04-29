/**
 * @vitest-environment jsdom
 */
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivityCalendar from "./ActivityCalendar";
import type { ActivityWithContext } from "../ActivityPage";

function makeActivity(
  overrides: Partial<ActivityWithContext> = {},
): ActivityWithContext {
  return {
    id: "act-1",
    rawText: "測試活動",
    kpis: [],
    status: "in-progress",
    deptId: "dept-1",
    deptName: "商務發展部",
    periodId: "",
    periodLabel: "",
    goalId: "",
    goalTitle: "",
    strategyId: "",
    strategyTitle: "",
    isReadOnly: false,
    planItems: [],
    ...overrides,
  };
}

describe("ActivityCalendar showInCalendar 過濾", () => {
  test("無任何 showInCalendar 項目時顯示引導提示", () => {
    const act = makeActivity({
      planItems: [
        {
          id: "p1",
          description: "任務A",
          plannedEndDate: "2026-04-15",
          actualEndDate: undefined,
          completed: false,
          showInCalendar: false, // 未勾選
        },
      ],
    });

    render(<ActivityCalendar activities={[act]} onJumpToActivity={() => {}} />);

    expect(screen.getByText(/尚無項目/)).toBeInTheDocument();
  });

  test("showInCalendar=true 且有日期的項目應出現在月格中", () => {
    // 固定到 2026-04 月份（測試環境日期為 2026-04-29）
    const act = makeActivity({
      planItems: [
        {
          id: "p1",
          description: "應顯示的計畫",
          plannedEndDate: "2026-04-20",
          eventStartDate: "2026-04-20",
          eventEndDate: "2026-04-20",
          actualEndDate: undefined,
          completed: false,
          showInCalendar: true,
        },
      ],
    });

    render(<ActivityCalendar activities={[act]} onJumpToActivity={() => {}} />);

    // 本月有 1 個日程
    expect(screen.getByText(/本月 1 個日程/)).toBeInTheDocument();
    // 活動名稱出現在月格
    expect(screen.getByText("測試活動")).toBeInTheDocument();
  });

  test("showInCalendar=true 但無 eventStartDate 的項目不應顯示", () => {
    const act = makeActivity({
      planItems: [
        {
          id: "p1",
          description: "沒有日期的計畫",
          plannedEndDate: undefined,
          eventStartDate: undefined,
          actualEndDate: undefined,
          completed: false,
          showInCalendar: true, // 勾了但無執行日期（防呆應從 UI 阻止，但渲染端也需安全）
        },
      ],
    });

    render(<ActivityCalendar activities={[act]} onJumpToActivity={() => {}} />);

    expect(screen.getByText(/尚無項目/)).toBeInTheDocument();
    expect(screen.queryByText("沒有日期的計畫")).not.toBeInTheDocument();
  });

  test("點擊月格中的計畫項目應呼叫 onJumpToActivity", async () => {
    const onJumpToActivity = vi.fn();
    const act = makeActivity({
      planItems: [
        {
          id: "p1",
          description: "可點擊計畫",
          plannedEndDate: "2026-04-20",
          eventStartDate: "2026-04-20",
          eventEndDate: "2026-04-20",
          actualEndDate: undefined,
          completed: false,
          showInCalendar: true,
        },
      ],
    });

    render(
      <ActivityCalendar
        activities={[act]}
        onJumpToActivity={onJumpToActivity}
      />,
    );

    await userEvent.click(screen.getByText("測試活動"));
    expect(onJumpToActivity).toHaveBeenCalledWith("dept-1", "act-1");
  });

  test("上個月的項目不計入本月計數，但切換後應出現", async () => {
    const act = makeActivity({
      planItems: [
        {
          id: "p1",
          description: "三月計畫",
          plannedEndDate: "2026-03-15",
          eventStartDate: "2026-03-15",
          eventEndDate: "2026-03-15",
          actualEndDate: undefined,
          completed: false,
          showInCalendar: true,
        },
      ],
    });

    render(<ActivityCalendar activities={[act]} onJumpToActivity={() => {}} />);

    // 當前月（2026-04）應顯示無項目
    expect(screen.getByText("本月無日程")).toBeInTheDocument();

    // 切換到上個月
    await userEvent.click(screen.getByRole("button", { name: "◀" }));

    // 2026-03 應出現計畫
    expect(screen.getByText(/本月 1 個日程/)).toBeInTheDocument();
    expect(screen.getByText("測試活動")).toBeInTheDocument();
  });

  test("showActivityInCalendar=true 且有活動起訖日時應顯示活動期間", () => {
    const act = makeActivity({
      startDate: "2026-04-10",
      endDate: "2026-04-12",
      showActivityInCalendar: true,
    });

    render(<ActivityCalendar activities={[act]} onJumpToActivity={() => {}} />);

    expect(screen.getByText(/本月 3 個日程/)).toBeInTheDocument();
    expect(screen.getAllByText("測試活動").length).toBeGreaterThanOrEqual(1);
  });
});
