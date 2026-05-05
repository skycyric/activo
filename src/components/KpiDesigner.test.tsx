/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import KpiDesigner from "./KpiDesigner";
import type { OGSMData, Goal, GoalKPI } from "../schemas/ogsm";

const tourState: {
  isActive: boolean;
  step: { id: string; page?: string } | null;
} = {
  isActive: false,
  step: null,
};

vi.mock("../contexts/TourContext", () => ({
  useTour: () => ({
    startPageTour: vi.fn(),
    isActive: tourState.isActive,
    step: tourState.step,
  }),
}));

const GOAL: Goal = {
  id: "goal-1",
  label: "G1",
  title: "提升營收",
  fullText: "G1 提升營收",
  strategies: [],
  completionRate: 0,
};

const BASE_DATA: OGSMData = {
  objectives: { orgO: "", deptO: "" },
  goals: [GOAL],
  period: "2026 H1",
  importedAt: "",
  overallRate: 0,
};

const GOAL_KPI: GoalKPI = {
  id: "gk-1",
  label: "營收達成率",
  unit: "%",
  target: 100,
  aggregation: "SUM",
  type: "value",
  isHeadline: false,
  thresholdGoalKpiIds: [],
  linkedKpis: [],
  goalKpiType: "direct",
};

const DATA_WITH_GOAL_KPI: OGSMData = {
  ...BASE_DATA,
  goals: [
    {
      ...GOAL,
      goalKpis: [GOAL_KPI],
    },
  ],
};

function Harness() {
  const [data, setData] = useState<OGSMData>(BASE_DATA);

  return (
    <KpiDesigner
      data={data}
      deptActivities={[]}
      initialGoalId="goal-1"
      onUpdateData={setData}
      onAddGoal={() => {}}
      onDeleteGoal={(id) => {
        setData((prev) => ({
          ...prev,
          goals: prev.goals.filter((g) => g.id !== id),
        }));
      }}
      onAddStrategyToGoal={() => {}}
      onDeleteStrategy={() => {}}
    />
  );
}

describe("KpiDesigner regression", () => {
  beforeEach(() => {
    tourState.isActive = false;
    tourState.step = null;
  });

  test("deleting selected goal should not crash when detail panel still points to old goal id", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByTitle("刪除目標"));

    expect(screen.getByText("尚無目標，按 ＋ 新增")).toBeInTheDocument();
  });

  test("tour kpi-node-config-panel step should switch to kpi mode and show config panel", () => {
    tourState.isActive = true;
    tourState.step = { id: "kpi-node-config-panel", page: "kpi" };

    const { container } = render(
      <KpiDesigner
        data={DATA_WITH_GOAL_KPI}
        deptActivities={[]}
        initialGoalId="goal-1"
        onUpdateData={() => {}}
        onAddGoal={() => {}}
        onDeleteGoal={() => {}}
        onAddStrategyToGoal={() => {}}
        onDeleteStrategy={() => {}}
      />,
    );

    expect(screen.getByText("KPI 模式 — 目標 GoalKPI")).toBeInTheDocument();
    expect(
      container.querySelector('[data-tour="kpi-node-config-panel"]'),
    ).toBeInTheDocument();
  });
});
