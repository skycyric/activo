/**
 * @vitest-environment jsdom
 */
import { describe, test, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import KpiDesigner from "./KpiDesigner";
import type { OGSMData, Goal } from "../schemas/ogsm";

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
  test("deleting selected goal should not crash when detail panel still points to old goal id", async () => {
    render(<Harness />);

    await userEvent.click(screen.getByTitle("刪除目標"));

    expect(screen.getByText("尚無目標，按 ＋ 新增")).toBeInTheDocument();
  });
});
