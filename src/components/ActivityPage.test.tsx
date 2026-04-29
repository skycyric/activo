/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivityPage from "./ActivityPage";
import type { WorkspaceData, DeptActivity } from "../schemas/ogsm";

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

vi.mock("./activity/ActivityFilters", () => ({
  default: () => <div data-testid="activity-filters" />,
}));
vi.mock("./activity/ActivityTable", () => ({
  default: ({
    onJumpToActivity,
    activities,
  }: {
    onJumpToActivity: (deptId: string, activityId: string) => void;
    activities: Array<{ id: string; deptId: string }>;
  }) => (
    <div data-testid="activity-table">
      {activities.map((a) => (
        <button
          key={a.id}
          data-testid={`activity-row-${a.id}`}
          onClick={() => onJumpToActivity(a.deptId, a.id)}
        >
          開啟 {a.id}
        </button>
      ))}
    </div>
  ),
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
  default: ({
    onClose,
    forcedTab,
  }: {
    onClose: () => void;
    forcedTab?: string | null;
  }) => (
    <div data-testid="activity-detail-panel">
      <span data-testid="activity-detail-forced-tab">{forcedTab ?? ""}</span>
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
  beforeEach(() => {
    tourState.isActive = false;
    tourState.step = null;
  });

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

  test("tour activity-add-modal step should auto-open add modal", async () => {
    tourState.isActive = true;
    tourState.step = { id: "activity-add-modal", page: "activity" };

    render(
      <ActivityPage
        workspace={WORKSPACE}
        activeDeptId="dept-1"
        onUpdateActivity={() => {}}
        onDeleteActivity={() => {}}
        onAddActivity={() => {}}
        onJumpToActivity={() => {}}
      />,
    );

    expect(await screen.findByTestId("activity-add-modal")).toBeInTheDocument();
  });

  test("tour activity-detail-kpi step should auto-open first activity and force kpi tab", async () => {
    tourState.isActive = true;
    tourState.step = { id: "activity-detail-kpi", page: "activity" };

    render(
      <ActivityPage
        workspace={WORKSPACE}
        activeDeptId="dept-1"
        onUpdateActivity={() => {}}
        onDeleteActivity={() => {}}
        onAddActivity={() => {}}
        onJumpToActivity={() => {}}
      />,
    );

    expect(
      await screen.findByTestId("activity-detail-panel"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("activity-detail-forced-tab")).toHaveTextContent(
      "kpi",
    );
  });
});

describe("ActivityPage 選择活動不可觸發路由切換", () => {
  beforeEach(() => {
    tourState.isActive = false;
    tourState.step = null;
  });

  test("在 ActivityPage 內點擊活動行，不應呼叫外部路由 onJumpToActivity", async () => {
    // Regression: handleOpenActivityDetail 曾錯誤地呪叫 onJumpToActivity（跨頁路由 prop），
    // 導致 App 層的 setActiveDeptId 被觸發，強制切換 nav 部門。
    // 正確行為：內部直接管理 selectedActivityId，不出放外部路由。
    const onJumpToActivity = vi.fn();
    const onSelectedActivityIdChange = vi.fn();

    render(
      <ActivityPage
        workspace={WORKSPACE}
        activeDeptId="dept-1"
        onUpdateActivity={() => {}}
        onDeleteActivity={() => {}}
        onAddActivity={() => {}}
        onJumpToActivity={onJumpToActivity}
        initialSelectedActivityId={null}
        onSelectedActivityIdChange={onSelectedActivityIdChange}
      />,
    );

    // Simulate clicking an activity row in the table
    await userEvent.click(screen.getByTestId("activity-row-act-1"));

    // The cross-page routing prop must NOT be called
    expect(onJumpToActivity).not.toHaveBeenCalled();

    // The internal selection change IS propagated
    expect(onSelectedActivityIdChange).toHaveBeenCalledWith("act-1");
  });
});

describe("ActivityPage 切換視圖自動關閉 detail panel", () => {
  beforeEach(() => {
    tourState.isActive = false;
    tourState.step = null;
  });

  test("右側 panel 開啟時（受控），點擊看板 tab 應透過 callback 通知關閉", async () => {
    const onSelectedActivityIdChange = vi.fn();

    // Controlled mode: parent passes initialSelectedActivityId, visual state managed externally.
    // We can only assert the callback fires; panel visually stays until parent responds.
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

    await userEvent.click(screen.getByRole("button", { name: /看板/ }));

    // In controlled mode the panel stays visible (parent has not updated the prop),
    // but the close signal must be emitted.
    expect(onSelectedActivityIdChange).toHaveBeenCalledWith(null);
  });

  test("右側 panel 開啟時（非受控），點擊甘特 tab 應直接關閉 panel", async () => {
    // Uncontrolled mode: ActivityPage owns internal selectedActivityId.
    render(
      <ActivityPage
        workspace={WORKSPACE}
        activeDeptId="dept-1"
        onUpdateActivity={() => {}}
        onDeleteActivity={() => {}}
        onAddActivity={() => {}}
        onJumpToActivity={() => {}}
      />,
    );

    // Open panel by clicking an activity row in the table
    await userEvent.click(screen.getByTestId("activity-row-act-1"));
    expect(screen.getByTestId("activity-detail-panel")).toBeInTheDocument();

    // Switch to gantt — panel should close without confirmation (no dirty state)
    await userEvent.click(screen.getByRole("button", { name: /甘特/ }));

    expect(
      screen.queryByTestId("activity-detail-panel"),
    ).not.toBeInTheDocument();
  });

  test("右側 panel 未開啟時，切換視圖不應發出 onSelectedActivityIdChange", async () => {
    const onSelectedActivityIdChange = vi.fn();

    render(
      <ActivityPage
        workspace={WORKSPACE}
        activeDeptId="dept-1"
        onUpdateActivity={() => {}}
        onDeleteActivity={() => {}}
        onAddActivity={() => {}}
        onJumpToActivity={() => {}}
        initialSelectedActivityId={null}
        onSelectedActivityIdChange={onSelectedActivityIdChange}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /甘特/ }));

    // No panel was open, so should not emit null
    expect(onSelectedActivityIdChange).not.toHaveBeenCalled();
  });
});
