/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import TagManagementPage from "./TagManagementPage";
import type { TagDictionaryItem } from "../schemas/ogsm";
import type { TourStep } from "../types/tour";

const mockedTour = {
  isActive: false,
  step: null as TourStep | null,
};

vi.mock("../contexts/TourContext", () => ({
  useTour: () => ({
    startPageTour: vi.fn(),
    isActive: mockedTour.isActive,
    step: mockedTour.step,
  }),
}));

describe("TagManagementPage guided tour", () => {
  test("tags-delete-dialog step should auto-open delete dialog", async () => {
    mockedTour.isActive = true;
    mockedTour.step = {
      id: "tags-delete-dialog",
      page: "tags",
      title: "",
      content: "",
    };

    const dictionary: TagDictionaryItem[] = [
      { id: "tag-a", name: "品牌", status: "active", weight: 1 },
      { id: "tag-b", name: "成長", status: "active", weight: 1 },
    ];

    render(
      <TagManagementPage
        tagDictionary={dictionary}
        onUpdateTagDictionary={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("刪除標籤設定")).toBeInTheDocument();
    });
    expect(screen.getByText(/刪除標籤：/)).toBeInTheDocument();
    expect(screen.getByText("合併到其他標籤")).toBeInTheDocument();
  });
});
