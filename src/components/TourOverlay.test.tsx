/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { TourStep } from "../types/tour";
import { TourOverlay } from "./TourOverlay";

const endTour = vi.fn();

const step: TourStep = {
  id: "welcome",
  title: "歡迎使用",
  content: "這是導覽測試。",
};

vi.mock("../contexts/TourContext", () => ({
  useTour: () => ({
    isActive: true,
    step,
    currentStep: 0,
    totalSteps: 3,
    nextStep: vi.fn(),
    prevStep: vi.fn(),
    endTour,
  }),
}));

describe("TourOverlay", () => {
  beforeEach(() => {
    endTour.mockClear();
  });

  test("clicking overlay should not end tour, but Escape should", async () => {
    const user = userEvent.setup();
    const { container } = render(<TourOverlay />);

    expect(
      screen.getByText("按 Esc 可中止導覽並離開目前流程。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "關閉導覽" }),
    ).not.toBeInTheDocument();

    const overlay = container.querySelector(".tour-overlay");
    expect(overlay).not.toBeNull();

    if (!overlay) {
      throw new Error("tour overlay should exist");
    }

    await user.click(overlay);
    expect(endTour).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(endTour).toHaveBeenCalledTimes(1);
  });
});
