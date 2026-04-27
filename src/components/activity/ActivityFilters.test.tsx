/**
 * @vitest-environment jsdom
 */
import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivityFilters from "./ActivityFilters";
import { EMPTY_ACTIVITY_FILTERS } from "./activityFilterState";
import type { WorkspaceData } from "../../schemas/ogsm";

const WORKSPACE_WITH_NO_TEAMS: WorkspaceData = {
  departments: [
    {
      id: "dept-design",
      name: "設計企畫部",
      periods: [
        {
          id: "period-1",
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
  teams: [],
  version: 1,
};

const WORKSPACE_WITH_TEAMS: WorkspaceData = {
  departments: [
    {
      id: "dept-biz",
      name: "商務發展部",
      periods: [
        {
          id: "period-1",
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
  teams: [
    { id: "team-a", name: "Alpha Team", deptId: "dept-biz", members: [] },
    { id: "team-b", name: "Beta Team", deptId: "dept-biz", members: [] },
  ],
  version: 1,
};

describe("ActivityFilters", () => {
  test("renders team filter even when team options are empty", async () => {
    const user = userEvent.setup();

    render(
      <ActivityFilters
        workspace={WORKSPACE_WITH_NO_TEAMS}
        filters={EMPTY_ACTIVITY_FILTERS}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("團隊")).toBeInTheDocument();

    const teamTitle = screen.getByText("團隊");
    await user.click(teamTitle);
    const teamDropdown = teamTitle.closest("details");

    expect(teamDropdown).not.toBeNull();

    expect(
      within(teamDropdown as HTMLElement).getByText("沒有可選項目"),
    ).toBeInTheDocument();
  });

  test("team dropdown puts selected options at top", async () => {
    const user = userEvent.setup();

    render(
      <ActivityFilters
        workspace={WORKSPACE_WITH_TEAMS}
        filters={{ ...EMPTY_ACTIVITY_FILTERS, teamIds: ["team-b"] }}
        onChange={vi.fn()}
      />,
    );

    const teamTitle = screen.getByText("團隊");
    await user.click(teamTitle);
    const teamDropdown = teamTitle.closest("details") as HTMLElement;
    const options = within(teamDropdown).getAllByRole("checkbox");

    expect(options[0]).toBeChecked();
    expect(
      within(options[0].closest("label") as HTMLElement).getByText("Beta Team"),
    ).toBeInTheDocument();
  });

  test("team dropdown supports text search", async () => {
    const user = userEvent.setup();

    render(
      <ActivityFilters
        workspace={WORKSPACE_WITH_TEAMS}
        filters={EMPTY_ACTIVITY_FILTERS}
        onChange={vi.fn()}
      />,
    );

    const teamTitle = screen.getByText("團隊");
    await user.click(teamTitle);
    const teamDropdown = teamTitle.closest("details") as HTMLElement;
    const searchInput =
      within(teamDropdown).getByPlaceholderText("搜尋團隊...");

    await user.type(searchInput, "beta");

    expect(within(teamDropdown).getByText("Beta Team")).toBeInTheDocument();
    expect(within(teamDropdown).queryByText("Alpha Team")).toBeNull();
  });
});
