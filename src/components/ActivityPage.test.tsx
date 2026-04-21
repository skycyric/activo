/**
 * @vitest-environment jsdom
 */
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivityPage from "./ActivityPage";
import type { WorkspaceData, DeptActivity } from "../schemas/ogsm";

vi.mock("./activity/ActivityFilters", () => ({
  default: () => <div data-testid="activity-filters" />,
}));
vi.mock("./activity/ActivityTable", () => ({
  default: () => <div data-testid="activity-table" />,
}));
vi.mock("./activity/ActivityKanban", () => ({
  default: () => <div data-testid="activity-kanban" />,
}));
vi.mock("./activity/ActivityCardGrid", () => ({
  default: () => <div data-testid="activity-card-grid" />,
}));
vi.mock("./activity/ActivityGantt", () => ({
  default: () => <div data-testid="activity-gantt" />,
}));
vi.mock("./activity/ActivityPlanGantt", () => ({
  default: () => <div data-testid="activity-plan-gantt" />,
}));
vi.mock("./activity/ActivityCalendar", () => ({
  default: () => <div data-testid="activity-calendar" />,
}));
vi.mock("./activity/ActivityAddModal", () => ({
  default: () => <div data-testid="activity-add-modal" />,
}));
vi.mock("./ActivityDetailPanel", () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="activity-detail-panel">
      <button onClick={onClose}>關閉右側面板</button>
    </div>
  ),
}));

const ACTIVITY: DeptActivity = {
  id: "act-1",
  rawText: "A1",
  kpis: [],
  status: "not-started",
  startDate: "2026-01-01",
  endDate: "2026-01-31",
};

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
      activities: [ACTIVITY],
    },
  ],
  version: 1,
};

describe("ActivityPage detail panel close", () => {
  test("controlled mode: clicking close should emit null via onSelectedActivityIdChange", async () => {
    const onSelectedActivityIdChange = vi.fn();

    render(
      <ActivityPage
        workspace={WORKSPACE}
        activeDeptId="dept-1"
        onUpdateActivity={() => {}}
        onDeleteActivity={() => {}}
        onAddActivity={() => {}}
        onJumpToActivity={() => {}}
        initialSelectedActivityId="act-1"
        onSelectedActivityIdChange={onSelectedActivityIdChange}
      />,
    );

    expect(screen.getByTestId("activity-detail-panel")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "關閉右側面板" }));

    expect(onSelectedActivityIdChange).toHaveBeenCalledWith(null);
  });
});
