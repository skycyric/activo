/**
 * KpiConfigModal — regression lock for click-outside protection
 *
 * @vitest-environment jsdom
 *
 * Ensures:
 * 1. Click-outside overlay does NOT close modal
 * 2. Only Esc key or Cancel button closes modal
 * 3. KPI selector shows actual values and disables empty ones
 * 4. Warning message appears when all KPIs are empty
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import KpiConfigModal from "./KpiConfigModal";
import type { KPI } from "../../schemas/ogsm";

describe("KpiConfigModal regression", () => {
  const mockKpi: KPI = {
    id: "KPI-1",
    label: "G1-KPI-1",
    formulaType: "direct_rate",
    target: 100,
    actual: 50,
    unit: "",
    achievementRate: 50,
  };

  const mockSiblingKpis: KPI[] = [
    {
      id: "KPI-2",
      label: "G1-KPI-2",
      formulaType: "direct_rate",
      target: 200,
      actual: 150,
      unit: "",
      achievementRate: 75,
    },
    {
      id: "KPI-3",
      label: "G1-KPI-3",
      formulaType: "direct_rate",
      target: 300,
      actual: null,
      unit: "",
      achievementRate: null,
    },
  ];

  it("click-outside overlay should NOT close modal (click-outside protection)", async () => {
    const mockOnClose = vi.fn();
    const mockOnSave = vi.fn();

    const { container } = render(
      <KpiConfigModal
        kpi={mockKpi}
        siblingKpis={mockSiblingKpis}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />,
    );

    const overlay = container.querySelector(".kpi-modal-overlay");
    if (!overlay) throw new Error("Overlay not found");

    await userEvent.click(overlay);

    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("Escape key should close modal", async () => {
    const mockOnClose = vi.fn();
    const mockOnSave = vi.fn();

    render(
      <KpiConfigModal
        kpi={mockKpi}
        siblingKpis={mockSiblingKpis}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />,
    );

    await userEvent.keyboard("{Escape}");

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("Cancel button should close modal", async () => {
    const mockOnClose = vi.fn();
    const mockOnSave = vi.fn();

    const { container } = render(
      <KpiConfigModal
        kpi={mockKpi}
        siblingKpis={mockSiblingKpis}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />,
    );

    const cancelBtn = container.querySelector(".kpi-modal-btn-cancel");
    if (!cancelBtn) throw new Error("Cancel button not found");

    await userEvent.click(cancelBtn);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it("hint text should be visible to indicate Esc key usage", () => {
    const mockOnClose = vi.fn();
    const mockOnSave = vi.fn();

    render(
      <KpiConfigModal
        kpi={mockKpi}
        siblingKpis={mockSiblingKpis}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />,
    );

    expect(screen.getByText("按 Esc 可取消")).toBeInTheDocument();
  });

  it("KPI selector should show actual values and disable KPIs without values", async () => {
    const mockOnClose = vi.fn();
    const mockOnSave = vi.fn();

    render(
      <KpiConfigModal
        kpi={{
          ...mockKpi,
          formulaType: "growth",
          baseline: { type: "kpiRef", kpiId: "KPI-2" },
        }}
        siblingKpis={mockSiblingKpis}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />,
    );

    // 選擇器應該顯示有實際值的 KPI 及其值
    const option2 = screen.getByText(/G1-KPI-2.*150/);
    expect(option2).toBeInTheDocument();

    // 選擇器應該顯示沒有實際值的 KPI 及警告
    const option3 = screen.getByText(/G1-KPI-3.*尚未設定值/);
    expect(option3).toBeInTheDocument();
    expect(option3).toBeDisabled();
  });

  it("warning message should show when all sibling KPIs have no actual values", async () => {
    const mockOnClose = vi.fn();
    const mockOnSave = vi.fn();

    const allEmptyKpis: KPI[] = [
      {
        id: "KPI-2",
        label: "G1-KPI-2",
        formulaType: "direct_rate",
        target: 200,
        actual: null,
        unit: "",
        achievementRate: null,
      },
      {
        id: "KPI-3",
        label: "G1-KPI-3",
        formulaType: "direct_rate",
        target: 300,
        actual: null,
        unit: "",
        achievementRate: null,
      },
    ];

    const { container } = render(
      <KpiConfigModal
        kpi={{
          ...mockKpi,
          formulaType: "growth",
        }}
        siblingKpis={allEmptyKpis}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />,
    );

    // 當選擇 "引用此活動的另一個 KPI" 時，應顯示警告
    const kpiRefRadios = container.querySelectorAll(
      'input[type="radio"][value="kpiRef"]',
    );
    if (kpiRefRadios.length === 0) throw new Error("KPI ref radio not found");

    await userEvent.click(kpiRefRadios[0]);

    const warningText = screen.getByText(/此活動沒有可引用的 KPI/);
    expect(warningText).toBeInTheDocument();
  });

  it("target_pct should save targetRate and clear target", async () => {
    const mockOnClose = vi.fn();
    const mockOnSave = vi.fn();

    const { container } = render(
      <KpiConfigModal
        kpi={{
          ...mockKpi,
          formulaType: "target_pct",
        }}
        siblingKpis={mockSiblingKpis}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />,
    );

    const targetPctRadio = container.querySelector(
      'input[type="radio"][value="target_pct"]',
    );
    if (!targetPctRadio) throw new Error("target_pct radio not found");
    await userEvent.click(targetPctRadio);
    const numberInputs = container.querySelectorAll('input[type="number"]');
    if (numberInputs.length < 2) throw new Error("number inputs not found");
    await userEvent.clear(numberInputs[0]);
    await userEvent.type(numberInputs[0], "50");
    await userEvent.clear(numberInputs[1]);
    await userEvent.type(numberInputs[1], "100");
    const saveBtn = container.querySelector(".kpi-modal-btn-save");
    if (!saveBtn) throw new Error("save button not found");
    await userEvent.click(saveBtn);

    expect(mockOnSave).toHaveBeenCalled();
    const saved = mockOnSave.mock.calls[0][0] as KPI;
    expect(saved.formulaType).toBe("target_pct");
    expect(saved.targetRate).toBe(50);
    expect(saved.target).toBeNull();
    expect(saved.baseline).toEqual({ type: "fixed", value: 100 });
    expect(saved.kpiType).toBe("target_rate");
  });

  it("completion should save target as null and map kpiType=progress", async () => {
    const mockOnClose = vi.fn();
    const mockOnSave = vi.fn();

    const { container } = render(
      <KpiConfigModal
        kpi={{
          ...mockKpi,
          formulaType: "completion",
        }}
        siblingKpis={mockSiblingKpis}
        onSave={mockOnSave}
        onClose={mockOnClose}
      />,
    );

    const completionRadio = container.querySelector(
      'input[type="radio"][value="completion"]',
    );
    if (!completionRadio) throw new Error("completion radio not found");
    await userEvent.click(completionRadio);
    const saveBtn = container.querySelector(".kpi-modal-btn-save");
    if (!saveBtn) throw new Error("save button not found");
    await userEvent.click(saveBtn);

    expect(mockOnSave).toHaveBeenCalled();
    const saved = mockOnSave.mock.calls[0][0] as KPI;
    expect(saved.formulaType).toBe("completion");
    expect(saved.target).toBeNull();
    expect(saved.kpiType).toBe("progress");
  });
});
