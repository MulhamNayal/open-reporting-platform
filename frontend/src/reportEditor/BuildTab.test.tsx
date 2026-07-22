import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
import type { WidgetDraft } from "../widgets/widgetDraftReducer";
import BuildTab from "./BuildTab";

const columns = [
  { name: "Month", nativeType: "nvarchar(20)" },
  { name: "Revenue", nativeType: "decimal(18,2)" },
];

function makeWidget(overrides: Partial<WidgetDraft>): WidgetDraft {
  return {
    id: 1, type: "Bar", x: 0, y: 0, w: 4, h: 3, title: "W", content: null,
    binding: { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS },
    ...overrides,
  };
}

describe("BuildTab", () => {
  it("shows a no-visual message when nothing is selected", () => {
    render(<BuildTab widget={null} columns={columns} onChange={vi.fn()} />);

    expect(screen.getByText(/select a visual/i)).toBeInTheDocument();
  });

  it("renders one well per the widget type's WELL_SPECS entry, labeled correctly", () => {
    render(<BuildTab widget={makeWidget({})} columns={columns} onChange={vi.fn()} />);

    expect(screen.getByText("Axis")).toBeInTheDocument();
    expect(screen.getByText("Values")).toBeInTheDocument();
  });

  it("shows Scatter's wells labeled X-axis/Y-axis, not a generic Values list", () => {
    render(
      <BuildTab
        widget={makeWidget({ type: "Scatter", binding: { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS } })}
        columns={columns}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText("X-axis")).toBeInTheDocument();
    expect(screen.getByText("Y-axis")).toBeInTheDocument();
  });

  it("shows a pill for an already-assigned field, removable via its x button", async () => {
    const onChange = vi.fn();
    render(
      <BuildTab
        widget={makeWidget({ binding: { categoryField: "Month", valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS } })}
        columns={columns}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Month")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /remove month/i }));

    expect(onChange).toHaveBeenCalledWith({ categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS });
  });
});
