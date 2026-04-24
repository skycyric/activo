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
}) {
  const onClose = vi.fn();
  render(
    <ActivityDetailPanel
      activity={options?.activity ?? ACTIVITY}
      deptId="dept-1"
      workspace={WORKSPACE}
      warnDaysBefore={7}
      forcedTab={options?.forcedTab}
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
});
