import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
import type { WidgetDraft } from "../widgets/widgetDraftReducer";
import FormatTab from "./FormatTab";

function makeWidget(): WidgetDraft {
  return {
    id: 1, type: "Bar", x: 0, y: 0, w: 4, h: 3, title: "W", content: null,
    binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: DEFAULT_FORMAT_OPTIONS },
  };
}

describe("FormatTab", () => {
  it("shows a no-visual message when nothing is selected", () => {
    render(<FormatTab widget={null} onChange={vi.fn()} />);
    expect(screen.getByText(/select a visual/i)).toBeInTheDocument();
  });

  it("toggling Show legend updates formatOptions.showLegend", async () => {
    const onChange = vi.fn();
    render(<FormatTab widget={makeWidget()} onChange={onChange} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Show legend" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      formatOptions: expect.objectContaining({ showLegend: false }),
    }));
  });

  it("toggling the data labels switch updates formatOptions.dataLabels", async () => {
    const onChange = vi.fn();
    render(<FormatTab widget={makeWidget()} onChange={onChange} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Data labels" }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      formatOptions: expect.objectContaining({ dataLabels: true }),
    }));
  });

  it("clicking a palette swatch updates formatOptions.palette", async () => {
    const onChange = vi.fn();
    render(<FormatTab widget={makeWidget()} onChange={onChange} />);

    await userEvent.click(screen.getByTitle("ocean"));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      formatOptions: expect.objectContaining({ palette: "ocean" }),
    }));
  });

  it("clicking the sort-direction toggle cycles null -> asc -> desc -> null", async () => {
    const onChange = vi.fn();
    const widget = makeWidget();
    render(<FormatTab widget={widget} onChange={onChange} />);

    await userEvent.click(screen.getByRole("button", { name: /sort/i }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      formatOptions: expect.objectContaining({ sortDirection: "asc" }),
    }));
  });
});
