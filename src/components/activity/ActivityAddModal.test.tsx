/**
 * ActivityAddModal — component interaction tests
 *
 * @vitest-environment jsdom
 *
 * Covers:
 * 1. Rendering: two-column grid wrapper is present
 * 2. Close guard: overlay/X/cancel click does NOT call onClose when form has input;
 *    it does call onClose when the user confirms the native dialog
 * 3. Clean close: empty form → overlay click calls onClose immediately (no confirm)
 * 4. Submit: onAdd + onClose called with correct deptId and rawText on valid form
 */
import { describe, test, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ActivityAddModal from "./ActivityAddModal";
import type { WorkspaceData, DeptActivity } from "../../schemas/ogsm";

// ─── Minimal workspace fixture ────────────────────────────────────────────────

const WORKSPACE: WorkspaceData = {
  departments: [
    {
      id: "dept1",
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderModal(props: Partial<{ fixedDeptId: string }> = {}) {
  const onAdd = vi.fn() as unknown as (
    deptId: string,
    activity: DeptActivity,
  ) => void;
  // Keep a typed mock reference for assertion (.mock.calls etc.)
  const onAddMock = onAdd as unknown as Mock;
  const onCloseFn = vi.fn();
  const onClose = onCloseFn as unknown as () => void;
  const result = render(
    <ActivityAddModal
      workspace={WORKSPACE}
      fixedDeptId={props.fixedDeptId}
      onAdd={onAdd}
      onClose={onClose}
    />,
  );
  return { onAdd: onAddMock, onClose: onCloseFn, ...result };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ActivityAddModal", () => {
  beforeEach(() => {
    // Reset window.confirm before each test
    vi.restoreAllMocks();
  });

  test("renders form-grid wrapper for two-column layout", () => {
    const { container } = renderModal({ fixedDeptId: "dept1" });
    expect(container.querySelector(".act-modal-form-grid")).toBeTruthy();
  });

  test("empty form: overlay click closes immediately without confirm", async () => {
    vi.spyOn(window, "confirm");
    const { onClose, container } = renderModal({ fixedDeptId: "dept1" });

    const overlay = container.querySelector(".act-modal-overlay")!;
    fireEvent.click(overlay);

    expect(window.confirm).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("dirty form: overlay click shows confirm; cancel keeps modal open", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onClose, container } = renderModal({ fixedDeptId: "dept1" });

    const input = screen.getByPlaceholderText("活動名稱");
    await userEvent.type(input, "測試活動");

    const overlay = container.querySelector(".act-modal-overlay")!;
    fireEvent.click(overlay);

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("dirty form: overlay click shows confirm; confirm closes modal", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { onClose, container } = renderModal({ fixedDeptId: "dept1" });

    const input = screen.getByPlaceholderText("活動名稱");
    await userEvent.type(input, "測試活動");

    const overlay = container.querySelector(".act-modal-overlay")!;
    fireEvent.click(overlay);

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("dirty form: X button also triggers confirm guard", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onClose } = renderModal({ fixedDeptId: "dept1" });

    await userEvent.type(screen.getByPlaceholderText("活動名稱"), "x");

    const closeBtn = screen.getByRole("button", { name: "×" });
    await userEvent.click(closeBtn);

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("dirty form: 取消 button also triggers confirm guard", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { onClose } = renderModal({ fixedDeptId: "dept1" });

    await userEvent.type(screen.getByPlaceholderText("活動名稱"), "x");

    const cancelBtn = screen.getByRole("button", { name: "取消" });
    await userEvent.click(cancelBtn);

    expect(window.confirm).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
  });

  test("valid submit: calls onAdd with correct deptId and rawText, then onClose", async () => {
    const { onAdd, onClose } = renderModal({ fixedDeptId: "dept1" });

    await userEvent.type(screen.getByPlaceholderText("活動名稱"), "新測試活動");

    const submitBtn = screen.getByRole("button", { name: "新增活動" });
    await userEvent.click(submitBtn);

    expect(onAdd).toHaveBeenCalledOnce();
    const [deptId, activity] = onAdd.mock.calls[0] as [
      string,
      { rawText: string },
    ];
    expect(deptId).toBe("dept1");
    expect(activity.rawText).toBe("新測試活動");
    expect(onClose).toHaveBeenCalledOnce();
  });

  test("submit button disabled when rawText is empty", () => {
    renderModal({ fixedDeptId: "dept1" });
    const submitBtn = screen.getByRole("button", { name: "新增活動" });
    expect(submitBtn).toBeDisabled();
  });
});
