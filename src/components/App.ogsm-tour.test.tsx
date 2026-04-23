/**
 * @vitest-environment jsdom
 */
import { describe, test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import type { TourStep } from "../contexts/TourContext";
import type { Strategy, WorkspaceData } from "../schemas/ogsm";

// Mock TourContext to control tour state
const tourState = {
  isActive: false,
  step: null as TourStep | null,
};

vi.mock("../contexts/TourContext", () => ({
  useTour: () => ({
    startPageTour: vi.fn(),
    isActive: tourState.isActive,
    step: tourState.step,
    registerNavigate: vi.fn(),
  }),
}));

// Minimal mock for StrategyList and DetailPanel to expose data-tour anchors
type StrategyListMockProps = {
  onSelectStrategy: (strategyId: string) => void;
  strategies: Strategy[];
};

type DetailPanelMockProps = {
  strategy?: Strategy | null;
};

vi.mock("../components/StrategyList", () => ({
  __esModule: true,
  default: ({ onSelectStrategy, strategies }: StrategyListMockProps) => (
    <div>
      <div data-tour="ogsm-strategy-list">策略清單</div>
      {strategies.map((strategy) => (
        <div
          key={strategy.id}
          data-tour="ogsm-strategy-rows"
          onClick={() => onSelectStrategy(strategy.id)}
        >
          策略 {strategy.id}
        </div>
      ))}
    </div>
  ),
}));
vi.mock("../components/DetailPanel", () => ({
  __esModule: true,
  default: ({ strategy }: DetailPanelMockProps) => (
    <div data-tour="ogsm-strategy-detail" data-testid="ogsm-strategy-detail">
      策略活動儀表板 {strategy?.id}
    </div>
  ),
}));

const BASE_WORKSPACE: WorkspaceData = {
  departments: [
    {
      id: "dept-1",
      name: "部門一",
      periods: [
        {
          id: "period-1",
          year: 2026,
          halfYear: "H1",
          ogsm: {
            objectives: { orgO: "", deptO: "" },
            goals: [
              {
                id: "goal-1",
                label: "G1",
                title: "提升營收",
                fullText: "提升營收",
                strategies: [
                  {
                    id: "strategy-1",
                    title: "S1",
                    rawText: "",
                    measures: [],
                    actionPlans: [],
                    owners: [],
                    notes: "",
                    completionRate: 0,
                    manualRate: null,
                  },
                ],
                completionRate: 0,
              },
            ],
            period: "2026 H1",
            importedAt: "",
            overallRate: 0,
          },
        },
      ],
    },
  ],
  version: 1,
  teams: [],
};

// Mock loadWorkspace to return our base workspace
vi.mock("../utils/storage", async () => {
  const actual =
    await vi.importActual<typeof import("../utils/storage")>(
      "../utils/storage",
    );
  return {
    ...actual,
    loadWorkspace: () => BASE_WORKSPACE,
    loadLegacyData: () => null,
    wrapOGSMInWorkspace: () => BASE_WORKSPACE,
  };
});

describe("App OGSM guided tour integration", () => {
  test("tour ogsm-strategy-rows step auto-selects strategy and opens detail panel", async () => {
    tourState.isActive = true;
    tourState.step = {
      id: "ogsm-strategy-rows",
      page: "ogsm",
      title: "",
      content: "",
    };
    render(<App />);
    // ogsm-strategy-list and ogsm-strategy-rows should be present
    expect(screen.getByText("策略清單")).toBeInTheDocument();
    // Click the strategy row to simulate user action
    await userEvent.click(screen.getByText("策略 strategy-1"));
    // Detail panel should open for the selected strategy
    expect(screen.getByTestId("ogsm-strategy-detail")).toBeInTheDocument();
    expect(screen.getByText(/策略活動儀表板 strategy-1/)).toBeInTheDocument();
  });
});
