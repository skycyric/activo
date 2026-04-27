/**
 * @vitest-environment jsdom
 */
import { useEffect } from "react";
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TOUR_STEPS } from "../data/tourSteps";
import { TourProvider, useTour, type TourPage } from "./TourContext";

function TourHarness({ onNavigate }: { onNavigate: (page: TourPage) => void }) {
  const {
    isActive,
    currentStep,
    totalSteps,
    step,
    startPageTour,
    nextStep,
    prevStep,
    endTour,
    registerNavigate,
  } = useTour();

  useEffect(() => {
    registerNavigate(onNavigate);
  }, [onNavigate, registerNavigate]);

  return (
    <div>
      <button onClick={() => startPageTour("home")}>start-home</button>
      <button onClick={() => startPageTour("activity")}>start-activity</button>
      <button onClick={() => startPageTour("ogsm")}>start-ogsm</button>
      <button onClick={() => startPageTour("kpi")}>start-kpi</button>
      <button onClick={() => startPageTour("settings")}>start-settings</button>
      <button onClick={() => startPageTour("tags")}>start-tags</button>
      <button onClick={nextStep}>next</button>
      <button onClick={prevStep}>prev</button>
      <button onClick={endTour}>end</button>
      <div data-testid="tour-active">{String(isActive)}</div>
      <div data-testid="tour-step-id">{step?.id ?? ""}</div>
      <div data-testid="tour-step-page">{step?.page ?? ""}</div>
      <div data-testid="tour-step-index">{String(currentStep)}</div>
      <div data-testid="tour-total-steps">{String(totalSteps)}</div>
    </div>
  );
}

function renderHarness(onNavigate: (page: TourPage) => void) {
  return render(
    <TourProvider steps={TOUR_STEPS}>
      <TourHarness onNavigate={onNavigate} />
    </TourProvider>,
  );
}

async function collectPageTourStepIds(page: TourPage) {
  const user = userEvent.setup();
  const onNavigate = vi.fn<(page: TourPage) => void>();
  renderHarness(onNavigate);

  await user.click(screen.getByRole("button", { name: `start-${page}` }));

  const ids = [screen.getByTestId("tour-step-id").textContent ?? ""];
  const totalSteps = Number(screen.getByTestId("tour-total-steps").textContent);

  for (let index = 1; index < totalSteps; index += 1) {
    await user.click(screen.getByRole("button", { name: "next" }));
    ids.push(screen.getByTestId("tour-step-id").textContent ?? "");
  }

  return { ids, totalSteps, onNavigate, user };
}

describe("TourProvider page tours", () => {
  test.each<{
    page: TourPage;
    expectedIds: string[];
  }>([
    {
      page: "home",
      expectedIds: [
        "welcome",
        "dept-select",
        "link-folder",
        "sync-mechanism",
        "save-dirty",
        "save-all-dirty",
        "backup-btn",
        "restore-btn",
      ],
    },
    {
      page: "activity",
      expectedIds: [
        "activity-intro",
        "activity-count-badge",
        "activity-filter",
        "activity-add-btn",
        "activity-add-modal",
        "activity-add-ogsm-link",
        "activity-card-detail",
        "activity-detail-tabs",
        "activity-detail-basic",
        "activity-detail-kpi",
        "activity-detail-plans",
        "activity-detail-notes",
        "activity-kanban-intro",
        "activity-gantt-intro",
        "activity-gantt-subtabs",
        "activity-cards-intro",
        "activity-calendar-intro",
        "activity-graph-tab",
        "activity-graph-canvas",
        "activity-graph-legend",
        "activity-graph-weak-toggle",
      ],
    },
    {
      page: "ogsm",
      expectedIds: [
        "ogsm-intro",
        "ogsm-sidebar",
        "ogsm-goal-header",
        "ogsm-kpi-scorecard",
        "ogsm-strategy-list",
        "ogsm-strategy-rows",
        "ogsm-strategy-detail",
        "ogsm-linked-activity-dashboard",
      ],
    },
    {
      page: "kpi",
      expectedIds: [
        "kpi-intro",
        "kpi-module-select",
        "kpi-left-panel",
        "kpi-node-manager",
        "kpi-goalkpi-tree",
        "kpi-view-mode",
        "kpi-canvas",
        "kpi-save-changes",
        "kpi-node-config-panel",
      ],
    },
    {
      page: "settings",
      expectedIds: [
        "settings-intro",
        "settings-tabs",
        "settings-team-list",
        "settings-team-actions",
        "settings-resource-section",
      ],
    },
    {
      page: "tags",
      expectedIds: [
        "tags-intro",
        "tags-main-section",
        "tags-add-row",
        "tags-list",
        "tags-row-actions",
        "tags-weight-setting",
        "tags-delete-dialog",
        "tags-delete-mode",
        "tags-save-actions",
      ],
    },
  ])(
    "$page page tour should follow the defined step order",
    async ({ page, expectedIds }) => {
      const { ids, totalSteps, onNavigate } =
        await collectPageTourStepIds(page);

      expect(ids).toEqual(expectedIds);
      expect(totalSteps).toBe(expectedIds.length);
      expect(onNavigate).toHaveBeenCalledTimes(expectedIds.length);
      expect(
        onNavigate.mock.calls.every(([calledPage]) => calledPage === page),
      ).toBe(true);
    },
  );

  test("prev should move back within the active page tour and end should clear the current step", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn<(page: TourPage) => void>();
    renderHarness(onNavigate);

    await user.click(screen.getByRole("button", { name: "start-activity" }));
    await user.click(screen.getByRole("button", { name: "next" }));
    await user.click(screen.getByRole("button", { name: "next" }));

    expect(screen.getByTestId("tour-step-id")).toHaveTextContent(
      "activity-filter",
    );
    expect(screen.getByTestId("tour-step-index")).toHaveTextContent("2");

    await user.click(screen.getByRole("button", { name: "prev" }));

    expect(screen.getByTestId("tour-step-id")).toHaveTextContent(
      "activity-count-badge",
    );
    expect(screen.getByTestId("tour-step-index")).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: "end" }));

    expect(screen.getByTestId("tour-active")).toHaveTextContent("false");
    expect(screen.getByTestId("tour-step-id")).toHaveTextContent("");
  });
});
