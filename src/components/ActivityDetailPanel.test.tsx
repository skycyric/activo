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
  initialPeriodId?: string;
  initialGoalId?: string;
  initialStrategyId?: string;
}) {
  const onClose = vi.fn();
  render(
    <ActivityDetailPanel
      activity={options?.activity ?? ACTIVITY}
      deptId="dept-1"
      workspace={options?.workspace ?? WORKSPACE}
      warnDaysBefore={7}
      forcedTab={options?.forcedTab}
      initialPeriodId={options?.initialPeriodId}
      initialGoalId={options?.initialGoalId}
      initialStrategyId={options?.initialStrategyId}
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

  test("template KPI with fixed baseline should remain editable from panel target input", async () => {
    const user = userEvent.setup();
    const workspace: WorkspaceData = {
      ...WORKSPACE,
      departments: [
        {
          ...WORKSPACE.departments[0],
          activities: [
            {
              id: "source-act-2",
              rawText: "既有活動(含固定基底)",
              status: "in-progress",
              startDate: "2026-01-01",
              endDate: "2026-03-31",
              kpis: [
                {
                  id: "source-kpi-2",
                  label: "固定目標模板",
                  target: 120,
                  actual: 88,
                  unit: "%",
                  formulaType: "direct_rate",
                  baseline: { type: "fixed", value: 120 },
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
    await user.click(screen.getByRole("button", { name: /固定目標模板/ }));

    const panelTargetInput = screen.getByPlaceholderText("目標值");
    expect(panelTargetInput).toHaveValue(120);

    await user.clear(panelTargetInput);
    await user.type(panelTargetInput, "150");
    expect(panelTargetInput).toHaveValue(150);

    await user.click(screen.getByTitle("編輯 KPI 設定：固定目標模板"));
    expect(screen.getByPlaceholderText("目標值，例：100")).toHaveValue(150);
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

  test("unchecking completed should keep actual end date", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();

    renderPanel({
      forcedTab: "plans",
      onUpdate,
      activity: {
        ...ACTIVITY,
        planItems: [
          {
            id: "plan-keep-date",
            description: "保留日期測試",
            quarter: "Q1",
            completed: true,
            plannedEndDate: "2026-03-20",
            actualEndDate: "2026-03-25",
            dependsOnIds: [],
            linkedMeasureId: null,
          },
        ],
      },
    });

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeChecked();
    expect(screen.getByDisplayValue("2026-03-25")).toBeInTheDocument();

    await user.click(checkbox);
    await user.click(screen.getByRole("button", { name: "儲存" }));

    expect(onUpdate).toHaveBeenCalledOnce();
    const savedActivity = onUpdate.mock.calls[0][1] as DeptActivity;
    expect(savedActivity.planItems?.[0]?.completed).toBe(false);
    expect(savedActivity.planItems?.[0]?.actualEndDate).toBe("2026-03-25");
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

  test("legacy OGSM attribution selection should become savable", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const workspace: WorkspaceData = {
      ...WORKSPACE,
      departments: [
        {
          ...WORKSPACE.departments[0],
          periods: [
            {
              id: "p1",
              year: 2026,
              halfYear: "H1",
              ogsm: {
                ...WORKSPACE.departments[0].periods[0].ogsm,
                goals: [
                  {
                    id: "g1",
                    label: "G1",
                    title: "既有目標",
                    fullText: "既有目標",
                    completionRate: 0,
                    strategies: [
                      {
                        id: "s1",
                        title: "既有策略",
                        owner: "",
                        rawText: "",
                        measures: [],
                        actionPlans: [],
                        owners: [],
                        notes: "",
                        completionRate: 0,
                        manualRate: null,
                      },
                    ],
                  },
                ],
              },
            },
            {
              id: "p2",
              year: 2026,
              halfYear: "H2",
              ogsm: {
                ...WORKSPACE.departments[0].periods[0].ogsm,
                goals: [
                  {
                    id: "g2",
                    label: "G2",
                    title: "新目標",
                    fullText: "新目標",
                    completionRate: 0,
                    strategies: [
                      {
                        id: "s2",
                        title: "新策略",
                        owner: "",
                        rawText: "",
                        measures: [],
                        actionPlans: [],
                        owners: [],
                        notes: "",
                        completionRate: 0,
                        manualRate: null,
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    renderPanel({
      forcedTab: "basic",
      workspace,
      onUpdate,
      initialPeriodId: "p1",
      initialGoalId: "g1",
      initialStrategyId: "s1",
      activity: {
        ...ACTIVITY,
        frameworks: ["ogsm"],
        dashboardLinks: undefined,
      },
    });

    await user.selectOptions(screen.getByLabelText("OGSM 期別"), "p2");
    await user.selectOptions(screen.getByLabelText("OGSM 目標"), "g2");
    await user.selectOptions(screen.getByLabelText("OGSM 策略"), "s2");

    const saveButton = screen.getByRole("button", { name: "儲存" });
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);
    expect(onUpdate).toHaveBeenCalledOnce();

    const saved = onUpdate.mock.calls[0][1] as DeptActivity;
    const ogsmLinks = (saved.dashboardLinks ?? []).filter(
      (link) => link.type === "ogsm",
    );
    expect(ogsmLinks).toHaveLength(1);
    expect(ogsmLinks[0]?.periodId).toBe("p2");
    expect(ogsmLinks[0]?.goalId).toBe("g2");
    expect(ogsmLinks[0]?.strategyId).toBe("s2");
  });

  test("switching single existing OGSM attribution should trigger save", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const workspace: WorkspaceData = {
      ...WORKSPACE,
      departments: [
        {
          ...WORKSPACE.departments[0],
          periods: [
            {
              id: "p1",
              year: 2026,
              halfYear: "H1",
              ogsm: {
                ...WORKSPACE.departments[0].periods[0].ogsm,
                goals: [
                  {
                    id: "g1",
                    label: "G1",
                    title: "既有目標",
                    fullText: "既有目標",
                    completionRate: 0,
                    strategies: [
                      {
                        id: "s1",
                        title: "既有策略",
                        rawText: "",
                        measures: [],
                        actionPlans: [],
                        owners: [],
                        notes: "",
                        completionRate: 0,
                        manualRate: null,
                      },
                    ],
                  },
                ],
              },
            },
            {
              id: "p2",
              year: 2026,
              halfYear: "H2",
              ogsm: {
                ...WORKSPACE.departments[0].periods[0].ogsm,
                goals: [
                  {
                    id: "g2",
                    label: "G2",
                    title: "新目標",
                    fullText: "新目標",
                    completionRate: 0,
                    strategies: [
                      {
                        id: "s2",
                        title: "新策略",
                        rawText: "",
                        measures: [],
                        actionPlans: [],
                        owners: [],
                        notes: "",
                        completionRate: 0,
                        manualRate: null,
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    renderPanel({
      forcedTab: "basic",
      workspace,
      onUpdate,
      activity: {
        ...ACTIVITY,
        frameworks: ["ogsm"],
        dashboardLinks: [
          {
            id: "dlink-1",
            type: "ogsm",
            periodId: "p1",
            goalId: "g1",
            strategyId: "s1",
            exclude: false,
          },
        ],
      },
    });

    await user.selectOptions(screen.getByLabelText("OGSM 期別"), "p2");
    await user.selectOptions(screen.getByLabelText("OGSM 目標"), "g2");
    await user.selectOptions(screen.getByLabelText("OGSM 策略"), "s2");

    const saveButton = screen.getByRole("button", { name: "儲存" });
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);
    expect(onUpdate).toHaveBeenCalledOnce();

    const saved = onUpdate.mock.calls[0][1] as DeptActivity;
    const ogsmLinks = (saved.dashboardLinks ?? []).filter(
      (link) => link.type === "ogsm",
    );
    expect(ogsmLinks).toHaveLength(1);
    expect(ogsmLinks[0]?.periodId).toBe("p2");
    expect(ogsmLinks[0]?.goalId).toBe("g2");
    expect(ogsmLinks[0]?.strategyId).toBe("s2");
  });

  test("switching selector with multiple OGSM links should NOT auto-mutate links", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const workspace: WorkspaceData = {
      ...WORKSPACE,
      departments: [
        {
          ...WORKSPACE.departments[0],
          periods: [
            {
              id: "p1",
              year: 2026,
              halfYear: "H1",
              ogsm: {
                ...WORKSPACE.departments[0].periods[0].ogsm,
                goals: [
                  {
                    id: "g1",
                    label: "G1",
                    title: "目標一",
                    fullText: "目標一",
                    completionRate: 0,
                    strategies: [
                      {
                        id: "s1",
                        title: "策略一",
                        rawText: "",
                        measures: [],
                        actionPlans: [],
                        owners: [],
                        notes: "",
                        completionRate: 0,
                        manualRate: null,
                      },
                    ],
                  },
                ],
              },
            },
            {
              id: "p2",
              year: 2026,
              halfYear: "H2",
              ogsm: {
                ...WORKSPACE.departments[0].periods[0].ogsm,
                goals: [
                  {
                    id: "g2",
                    label: "G2",
                    title: "目標二",
                    fullText: "目標二",
                    completionRate: 0,
                    strategies: [
                      {
                        id: "s2",
                        title: "策略二",
                        rawText: "",
                        measures: [],
                        actionPlans: [],
                        owners: [],
                        notes: "",
                        completionRate: 0,
                        manualRate: null,
                      },
                    ],
                  },
                ],
              },
            },
            {
              id: "p3",
              year: 2027,
              halfYear: "H1",
              ogsm: {
                ...WORKSPACE.departments[0].periods[0].ogsm,
                goals: [
                  {
                    id: "g3",
                    label: "G3",
                    title: "目標三",
                    fullText: "目標三",
                    completionRate: 0,
                    strategies: [
                      {
                        id: "s3",
                        title: "策略三",
                        rawText: "",
                        measures: [],
                        actionPlans: [],
                        owners: [],
                        notes: "",
                        completionRate: 0,
                        manualRate: null,
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    renderPanel({
      forcedTab: "basic",
      workspace,
      onUpdate,
      activity: {
        ...ACTIVITY,
        frameworks: ["ogsm"],
        dashboardLinks: [
          {
            id: "dlink-1",
            type: "ogsm",
            periodId: "p1",
            goalId: "g1",
            strategyId: "s1",
            exclude: false,
          },
          {
            id: "dlink-2",
            type: "ogsm",
            periodId: "p2",
            goalId: "g2",
            strategyId: "s2",
            exclude: false,
          },
        ],
      },
    });

    await user.selectOptions(screen.getByLabelText("OGSM 期別"), "p3");
    await user.selectOptions(screen.getByLabelText("OGSM 目標"), "g3");
    await user.selectOptions(screen.getByLabelText("OGSM 策略"), "s3");

    const saveButton = screen.getByRole("button", { name: "儲存" });
    expect(saveButton).toBeDisabled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test("overdue plan item should NOT auto-switch status to attention", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();

    renderPanel({
      forcedTab: "plans",
      onUpdate,
      activity: {
        ...ACTIVITY,
        status: "not-started",
        planItems: [
          {
            id: "plan-overdue",
            description: "逾期項目",
            quarter: "Q1",
            completed: false,
            plannedEndDate: "2026-01-01", // 遠早於今日，確保逾期
            actualEndDate: undefined,
            dependsOnIds: [],
            linkedMeasureId: null,
          },
        ],
      },
    });

    // 修改說明以觸發 patch，確保 applyAutoAttention 不再被呼叫
    await user.type(screen.getByDisplayValue("逾期項目"), "x");
    await user.click(screen.getByRole("button", { name: "儲存" }));

    expect(onUpdate).toHaveBeenCalledOnce();
    const saved = onUpdate.mock.calls[0][1] as DeptActivity;
    expect(saved.status).toBe("not-started");
  });
});
