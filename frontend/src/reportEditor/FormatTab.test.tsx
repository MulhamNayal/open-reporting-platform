import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ColumnDescriptor } from "../api/datasets";
import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
import type { WidgetType } from "../api/widgets";
import type { WidgetBindingDraft, WidgetDraft } from "../widgets/widgetDraftReducer";
import FormatTab from "./FormatTab";

function makeWidget(type: WidgetType = "Bar"): WidgetDraft {
  return {
    id: 1, type, x: 0, y: 0, w: 4, h: 3, title: "W", content: null,
    binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: DEFAULT_FORMAT_OPTIONS },
  };
}

// FormatTab is a pure prop-driven component — it renders conditional controls (e.g. decimal
// places once type is "decimal") based on the widget prop it's given, not local state. A plain
// vi.fn() onChange can't feed a selection back in, so tests that need to see UI react to an
// interaction render this small stateful wrapper instead, matching how ReportCanvas really uses it.
function ControlledFormatTab({ initialWidget, columns }: { initialWidget: WidgetDraft; columns?: ColumnDescriptor[] }) {
  const [widget, setWidget] = useState(initialWidget);
  function handleChange(binding: WidgetBindingDraft) {
    setWidget((w) => ({ ...w, binding }));
  }
  return <FormatTab widget={widget} columns={columns} onChange={handleChange} />;
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

  it("shows a 'Value formats' section with each field collapsed, summarizing its current format", () => {
    render(<FormatTab widget={makeWidget()} onChange={vi.fn()} />);

    expect(screen.getByText("Revenue")).toBeInTheDocument();
    const row = screen.getByRole("button", { name: "Revenue format, currently Auto (text)" });
    expect(row).toHaveAttribute("aria-expanded", "false");
    // Collapsed by default — the actual Format control isn't mounted until expanded.
    expect(screen.queryByLabelText("Format")).not.toBeInTheDocument();
  });

  it("shows the native type inferred by Auto in the collapsed row's summary", () => {
    render(<FormatTab widget={makeWidget()} onChange={vi.fn()} columns={[{ name: "Revenue", nativeType: "decimal" }]} />);

    expect(screen.getByRole("button", { name: "Revenue format, currently Auto (decimal)" })).toBeInTheDocument();
  });

  it("clicking a field's row expands it, revealing the Format control", async () => {
    render(<ControlledFormatTab initialWidget={makeWidget()} />);

    await userEvent.click(screen.getByRole("button", { name: /Revenue format/ }));

    expect(screen.getByRole("button", { name: /Revenue format/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Format")).toHaveValue("auto");
  });

  it("selecting Decimal reveals decimal-specific controls and updates fieldFormats", async () => {
    render(<ControlledFormatTab initialWidget={makeWidget()} />);
    await userEvent.click(screen.getByRole("button", { name: /Revenue format/ }));

    await userEvent.selectOptions(screen.getByLabelText("Format"), "decimal");

    expect(screen.getByLabelText("Decimal places")).toBeInTheDocument();
    expect(screen.getByLabelText("Thousands separator")).toBeInTheDocument();
    expect(screen.getByLabelText("Prefix for Revenue")).toBeInTheDocument();
  });

  it("changing decimal places for a field updates its fieldFormats entry", async () => {
    const widget = makeWidget();
    widget.binding!.formatOptions = { ...widget.binding!.formatOptions, fieldFormats: { Revenue: { type: "decimal" } } };
    render(<ControlledFormatTab initialWidget={widget} />);
    await userEvent.click(screen.getByRole("button", { name: /Revenue format/ }));

    await userEvent.clear(screen.getByLabelText("Decimal places"));
    await userEvent.type(screen.getByLabelText("Decimal places"), "4");

    expect(screen.getByLabelText("Decimal places")).toHaveValue(4);
  });

  it("selecting Date reveals the date-format dropdown", async () => {
    render(<ControlledFormatTab initialWidget={makeWidget()} />);
    await userEvent.click(screen.getByRole("button", { name: /Revenue format/ }));

    await userEvent.selectOptions(screen.getByLabelText("Format"), "date");

    expect(screen.getByLabelText("Date format")).toBeInTheDocument();
  });

  it("selecting Boolean reveals the boolean-style dropdown", async () => {
    render(<ControlledFormatTab initialWidget={makeWidget()} />);
    await userEvent.click(screen.getByRole("button", { name: /Revenue format/ }));

    await userEvent.selectOptions(screen.getByLabelText("Format"), "boolean");

    expect(screen.getByLabelText("Style")).toBeInTheDocument();
  });

  it("expanding a field's row reveals a Display name input, empty by default", async () => {
    render(<ControlledFormatTab initialWidget={makeWidget()} />);

    await userEvent.click(screen.getByRole("button", { name: /Revenue format/ }));

    expect(screen.getByLabelText("Display name")).toHaveValue("");
    expect(screen.getByLabelText("Display name")).toHaveAttribute("placeholder", "Revenue");
  });

  it("typing a display name updates fieldFormats and shows a renamed badge on the collapsed row", async () => {
    render(<ControlledFormatTab initialWidget={makeWidget()} />);
    const row = () => screen.getByRole("button", { name: /Revenue format/ });

    await userEvent.click(row());
    await userEvent.type(screen.getByLabelText("Display name"), "Total Sales");
    await userEvent.click(row());

    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.getByText("renamed")).toBeInTheDocument();
  });

  it("does not show the renamed badge when no display name is set", () => {
    render(<FormatTab widget={makeWidget()} onChange={vi.fn()} />);

    expect(screen.queryByText("renamed")).not.toBeInTheDocument();
  });

  it("clearing the display name back to empty removes the renamed badge", async () => {
    const widget = makeWidget();
    widget.binding!.formatOptions = { ...widget.binding!.formatOptions, fieldFormats: { Revenue: { displayName: "Total Sales" } } };
    render(<ControlledFormatTab initialWidget={widget} />);
    const row = () => screen.getByRole("button", { name: /Revenue format/ });

    expect(screen.getByText("renamed")).toBeInTheDocument();

    await userEvent.click(row());
    await userEvent.clear(screen.getByLabelText("Display name"));
    await userEvent.click(row());

    expect(screen.queryByText("renamed")).not.toBeInTheDocument();
  });

  it("collapsing a field's row hides its controls again without discarding the saved format", async () => {
    const widget = makeWidget();
    widget.binding!.formatOptions = { ...widget.binding!.formatOptions, fieldFormats: { Revenue: { type: "decimal", decimalPlaces: 3 } } };
    render(<ControlledFormatTab initialWidget={widget} />);
    const row = () => screen.getByRole("button", { name: /Revenue format/ });

    await userEvent.click(row());
    expect(screen.getByLabelText("Decimal places")).toHaveValue(3);

    await userEvent.click(row());
    expect(screen.queryByLabelText("Decimal places")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revenue format, currently Decimal" })).toBeInTheDocument();
  });

  it("shows a Table layout section with a Row height input only for a Table widget", () => {
    render(<FormatTab widget={makeWidget("Table")} onChange={vi.fn()} />);

    expect(screen.getByText("Table layout")).toBeInTheDocument();
    expect(screen.getByLabelText("Row height (px)")).toHaveValue(null);
  });

  it("does not show the Table layout section for a non-Table widget", () => {
    render(<FormatTab widget={makeWidget("Bar")} onChange={vi.fn()} />);

    expect(screen.queryByText("Table layout")).not.toBeInTheDocument();
  });

  it("changing row height updates formatOptions.rowHeight", async () => {
    render(<ControlledFormatTab initialWidget={makeWidget("Table")} />);

    await userEvent.type(screen.getByLabelText("Row height (px)"), "40");

    expect(screen.getByLabelText("Row height (px)")).toHaveValue(40);
  });

  it("shows a Column width input inside a field's expanded row only for a Table widget", async () => {
    render(<ControlledFormatTab initialWidget={makeWidget("Table")} />);

    await userEvent.click(screen.getByRole("button", { name: /Revenue format/ }));

    expect(screen.getByLabelText("Column width (px)")).toHaveValue(null);
  });

  it("does not show a Column width input for a non-Table widget", async () => {
    render(<ControlledFormatTab initialWidget={makeWidget("Bar")} />);

    await userEvent.click(screen.getByRole("button", { name: /Revenue format/ }));

    expect(screen.queryByLabelText("Column width (px)")).not.toBeInTheDocument();
  });

  it("changing a field's column width updates its fieldFormats entry", async () => {
    render(<ControlledFormatTab initialWidget={makeWidget("Table")} />);
    await userEvent.click(screen.getByRole("button", { name: /Revenue format/ }));

    await userEvent.type(screen.getByLabelText("Column width (px)"), "140");

    expect(screen.getByLabelText("Column width (px)")).toHaveValue(140);
  });
});
