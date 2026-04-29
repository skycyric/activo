/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivityDetailPanel from "./ActivityDetailPanel";
import type { DeptActivity, WorkspaceData } from "../schemas/ogsm";

const WORKSPACE: WorkspaceData = {
  departments: [
    {
      id: "dept-1",
      name: "商務發展部",
      periods: [
        {
          id: "p1",
          year: 2026,
          halfYear: "H1",
          ogsm: {
            objectives: { orgO: "", deptO: "" },
            goals: [],
            period: "2026 H1",
            importedAt: "",
            overallRate: 0,
          },
        },
      ],
      activities: [],
    },
  ],
  version: 1,
};

const ACTIVITY: DeptActivity = {
  id: "act-1",
  rawText: "測試活動",
  kpis: [],
  status: "not-started",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
};

function renderPanel(options?: {
  activity?: DeptActivity;
  forcedTab?: "basic" | "kpi" | "plans" | "notes";
  workspace?: WorkspaceData;
  onUpdate?: (deptId: string, activity: DeptActivity) => void;
}) {
  const onClose = vi.fn();
  render(
    <ActivityDetailPanel
      activity={options?.activity ?? ACTIVITY}
      deptId="dept-1"
      workspace={options?.workspace ?? WORKSPACE}
      warnDaysBefore={7}
      forcedTab={options?.forcedTab}
      onUpdate={options?.onUpdate ?? (() => {})}
      onDelete={() => {}}
      onClose={onClose}
    />,
  );
  return { onClose };
}

describe("ActivityDetailPanel close guard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  test("clean draft: close does not ask confirmation", async () => {
    const { onClose } = renderPanel();
    const confirmSpy = vi.spyOn(window, "confirm");

    await userEvent.click(screen.getByTitle("關閉"));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("dirty draft: cancel on confirmation should keep panel open", async () => {
    const { onClose } = renderPanel();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    await userEvent.type(screen.getByPlaceholderText("活動名稱…"), "x");
    await userEvent.click(screen.getByTitle("關閉"));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("dirty draft: confirm close should close panel", async () => {
    const { onClose } = renderPanel();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    await userEvent.type(screen.getByPlaceholderText("活動名稱…"), "x");
    await userEvent.click(screen.getByTitle("關閉"));

    expect(confirmSpy).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("kpi header main button should open KPI config modal", async () => {
    renderPanel({
      forcedTab: "kpi",
      activity: {
        ...ACTIVITY,
        kpis: [
          {
            id: "kpi-1",
            label: "營收達成",
            formulaType: "target_pct",
            target: null,
            targetRate: 85,
            actual: 70,
            unit: "%",
            achievementRate: 82.35,
            baseline: { type: "fixed", value: 100 },
          },
        ],
      },
    });

    await userEvent.click(screen.getByTitle("編輯 KPI 設定：營收達成"));

    expect(screen.getByText(/KPI 設定/)).toBeInTheDocument();
    expect(screen.getByText("目標百分比（%）")).toBeInTheDocument();
  });

  test("kpi config modal should sync direct_rate target value from panel", async () => {
    const user = userEvent.setup();

    renderPanel({
      forcedTab: "kpi",
      activity: {
        ...ACTIVITY,
        kpis: [
          {
            id: "kpi-1",
            label: "營收達成",
            formulaType: "direct_rate",
            target: 120,
            actual: 70,
            unit: "%",
            achievementRate: 58.3,
          },
        ],
      },
    });

    await user.click(screen.getByTitle("編輯 KPI 設定：營收達成"));

    expect(screen.getByText(/KPI 設定/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("目標值，例：100")).toHaveValue(120);
  });

  test("kpi target should sync live between panel and config modal", async () => {
    const user = userEvent.setup();

    renderPanel({
      forcedTab: "kpi",
      activity: {
        ...ACTIVITY,
        kpis: [
          {
            id: "kpi-1",
            label: "營收達成",
            formulaType: "direct_rate",
            target: 120,
            actual: 70,
            unit: "%",
            achievementRate: 58.3,
          },
        ],
      },
    });

    await user.click(screen.getByTitle("編輯 KPI 設定：營收達成"));

    const panelTargetInput = screen.getByPlaceholderText("目標值");
    const modalTargetInput = screen.getByPlaceholderText("目標值，例：100");

    await user.clear(panelTargetInput);
    await user.type(panelTargetInput, "150");
    expect(modalTargetInput).toHaveValue(150);

    await user.clear(modalTargetInput);
    await user.type(modalTargetInput, "180");
    expect(panelTargetInput).toHaveValue(180);
  });

  test("kpi config cancel should discard live draft changes", async () => {
    const user = userEvent.setup();

    renderPanel({
      forcedTab: "kpi",
      activity: {
        ...ACTIVITY,
        kpis: [
          {
            id: "kpi-1",
            label: "營收達成",
            formulaType: "direct_rate",
            target: 120,
            actual: 70,
            unit: "%",
            achievementRate: 58.3,
          },
        ],
      },
    });

    await user.click(screen.getByTitle("編輯 KPI 設定：營收達成"));
    await user.clear(screen.getByPlaceholderText("目標值，例：100"));
    await user.type(screen.getByPlaceholderText("目標值，例：100"), "180");

    expect(screen.getByPlaceholderText("目標值")).toHaveValue(180);

    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByText(/KPI 設定/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("目標值")).toHaveValue(120);
  });

  test("kpi last updated date should be user editable inline", async () => {
    const user = userEvent.setup();

    renderPanel({
      forcedTab: "kpi",
      activity: {
        ...ACTIVITY,
        kpis: [
          {
            id: "kpi-1",
            label: "營收達成",
            formulaType: "direct_rate",
            target: 100,
            actual: 80,
            unit: "%",
            achievementRate: 80,
          },
        ],
      },
    });

    expect(screen.getByText("最後更新日期")).toBeInTheDocument();
    expect(screen.getByLabelText("最後更新日期")).toHaveValue("");

    await user.type(screen.getByLabelText("最後更新日期"), "2026-04-28");

    expect(screen.getByDisplayValue("2026-04-28")).toBeInTheDocument();
  });

  test("add KPI can apply template and should clear actual, achievement and confirmation data", async () => {
    const user = userEvent.setup();
    const workspace: WorkspaceData = {
      ...WORKSPACE,
      departments: [
        {
          ...WORKSPACE.departments[0],
          activities: [
            {
              id: "source-act-1",
              rawText: "既有活動",
              status: "in-progress",
              startDate: "2026-01-01",
              endDate: "2026-03-31",
              kpis: [
                {
                  id: "source-kpi-1",
                  label: "營收模板",
                  target: 120,
                  actual: 88,
                  unit: "%",
                  formulaType: "direct_rate",
                  achievementRate: 73.3,
                  confirmedAt: "2026-04-01T00:00:00.000Z",
                },
              ],
            },
          ],
        },
      ],
    };

    renderPanel({ forcedTab: "kpi", workspace });

    await user.click(screen.getByRole("button", { name: "＋ 新增 KPI" }));
    await user.click(screen.getByRole("button", { name: /營收模板/ }));

    expect(screen.getByTitle("編輯 KPI 設定：營收模板")).toBeInTheDocument();
    expect(screen.getByDisplayValue("120")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("88")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});

describe("ActivityDetailPanel forcedTab", () => {
  test("renders on the specified tab when forcedTab is set initially", () => {
    renderPanel({ forcedTab: "plans" });
    // The "plans" tab button should have the active class
    const tabBtn = screen.getByRole("button", { name: /計畫/i });
    expect(tabBtn).toHaveClass("adp-tab-active");
  });

  test("switches tab when forcedTab prop changes", () => {
    const { rerender } = render(
      <ActivityDetailPanel
        activity={ACTIVITY}
        deptId="dept-1"
        workspace={WORKSPACE}
        warnDaysBefore={7}
        forcedTab="basic"
        onUpdate={() => {}}
        onDelete={() => {}}
        onClose={() => {}}
      />,
    );

    // Initially on "basic" tab
    expect(screen.getByRole("button", { name: /基本/i })).toHaveClass(
      "adp-tab-active",
    );

    // Rerender with forcedTab="plans"
    rerender(
      <ActivityDetailPanel
        activity={ACTIVITY}
        deptId="dept-1"
        workspace={WORKSPACE}
        warnDaysBefore={7}
        forcedTab="plans"
        onUpdate={() => {}}
        onDelete={() => {}}
        onClose={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: /計畫/i })).toHaveClass(
      "adp-tab-active",
    );
  });

  test("cross-quarter tracking should mirror completed item into actual quarter as read-only", async () => {
    const user = userEvent.setup();

    renderPanel({
      forcedTab: "plans",
      activity: {
        ...ACTIVITY,
        planItems: [
          {
            id: "plan-1",
            description: "跨季項目",
            quarter: "Q1",
            completed: true,
            plannedEndDate: "2026-03-20",
            actualEndDate: "2026-05-02",
            dependsOnIds: [],
            linkedMeasureId: null,
          },
        ],
      },
    });

    expect(screen.queryByText("跨季完成（唯讀）")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "跨季追蹤" }));

    expect(screen.getByText("跨季完成（唯讀）")).toBeInTheDocument();
    expect(screen.getByText("來自 Q1")).toBeInTheDocument();
    expect(screen.getByDisplayValue("跨季項目")).toBeInTheDocument();
    expect(screen.getByText("跨季項目")).toBeInTheDocument();
  });

  test("add plan item can apply template and should clear completion state and actual end date", async () => {
    const user = userEvent.setup();
    const workspace: WorkspaceData = {
      ...WORKSPACE,
      departments: [
        {
          ...WORKSPACE.departments[0],
          activities: [
            {
              id: "source-act-2",
              rawText: "季度來源活動",
              status: "in-progress",
              startDate: "2026-01-01",
              endDate: "2026-03-31",
              planItems: [
                {
                  id: "source-plan-1",
                  description: "季度模板",
                  quarter: "Q1",
                  completed: true,
                  plannedEndDate: "2026-03-10",
                  actualEndDate: "2026-03-20",
                  dependsOnIds: ["dep-1"],
                  linkedMeasureId: "measure-1",
                },
              ],
              kpis: [],
            },
          ],
        },
      ],
    };

    renderPanel({ forcedTab: "plans", workspace });

    await user.click(screen.getAllByRole("button", { name: "＋ 新增項目" })[0]);
    await user.click(screen.getByRole("button", { name: /季度模板/ }));

    expect(screen.getByDisplayValue("季度模板")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-03-10")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("2026-03-20")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  test("planned end date outside quarter should show warning and block save", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    renderPanel({
      forcedTab: "plans",
      onUpdate,
      activity: {
        ...ACTIVITY,
        planItems: [
          {
            id: "plan-1",
            description: "季度錯誤項目",
            quarter: "Q1",
            completed: false,
            plannedEndDate: "2026-04-10",
            actualEndDate: undefined,
            dependsOnIds: [],
            linkedMeasureId: null,
          },
        ],
      },
    });

    expect(screen.getByText("❗ 預計完成日不在 Q1")).toBeInTheDocument();

    await user.type(screen.getByDisplayValue("季度錯誤項目"), "x");

    await user.click(screen.getByRole("button", { name: "儲存" }));

    expect(alertSpy).toHaveBeenCalledOnce();
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /計畫/i })).toHaveClass(
      "adp-tab-active",
    );
  });
});
