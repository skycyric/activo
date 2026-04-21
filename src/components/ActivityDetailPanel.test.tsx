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

function renderPanel() {
  const onClose = vi.fn();
  render(
    <ActivityDetailPanel
      activity={ACTIVITY}
      deptId="dept-1"
      workspace={WORKSPACE}
      warnDaysBefore={7}
      onUpdate={() => {}}
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
});
