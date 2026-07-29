import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
import type { DatasetSummary } from "../api/datasets";
import type { WidgetDraft } from "../widgets/widgetDraftReducer";
import BuildTab from "./BuildTab";

const columns = [
  { name: "Month", nativeType: "nvarchar(20)" },
  { name: "Revenue", nativeType: "decimal(18,2)" },
];

function makeWidget(overrides: Partial<WidgetDraft>): WidgetDraft {
  return {
    id: 1, type: "Bar", x: 0, y: 0, w: 4, h: 3, title: "W", content: null, datasetId: null,
    binding: { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS },
    ...overrides,
  };
}

const datasets: DatasetSummary[] = [
  {
    id: 7, dataSourceConnectionId: 1, name: "Sales by month", description: null, mode: "RawSql",
    definitionJson: "{}", rowLimit: null, isSaved: true, columns: [],
    createdAtUtc: "2026-01-01T00:00:00Z", updatedAtUtc: "2026-01-01T00:00:00Z",
  },
  {
    id: 8, dataSourceConnectionId: 1, name: "Leads detail", description: null, mode: "RawSql",
    definitionJson: "{}", rowLimit: null, isSaved: true, columns: [],
    createdAtUtc: "2026-01-01T00:00:00Z", updatedAtUtc: "2026-01-01T00:00:00Z",
  },
];

// Every render needs the picker's props; only the tests that exercise it pass a non-empty list.
function renderBuildTab(props: Partial<ComponentProps<typeof BuildTab>> = {}) {
  return render(
    <BuildTab
      widget={makeWidget({})}
      columns={columns}
      datasets={[]}
      reportDatasetId={null}
      onDatasetChange={vi.fn()}
      onChange={vi.fn()}
      {...props}
    />,
  );
}

describe("BuildTab", () => {
  afterEach(cleanup);

  it("shows a no-visual message when nothing is selected", () => {
    renderBuildTab({ widget: null });

    expect(screen.getByText(/select a visual/i)).toBeInTheDocument();
  });

  it("renders one well per the widget type's WELL_SPECS entry, labeled correctly", () => {
    renderBuildTab();

    expect(screen.getByText("Axis")).toBeInTheDocument();
    expect(screen.getByText("Values")).toBeInTheDocument();
  });

  it("shows Scatter's wells labeled X-axis/Y-axis, not a generic Values list", () => {
    renderBuildTab({
      widget: makeWidget({ type: "Scatter", binding: { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS } }),
    });

    expect(screen.getByText("X-axis")).toBeInTheDocument();
    expect(screen.getByText("Y-axis")).toBeInTheDocument();
  });

  it("shows a pill for an already-assigned field, removable via its x button", async () => {
    const onChange = vi.fn();
    renderBuildTab({
      widget: makeWidget({ binding: { categoryField: "Month", valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS } }),
      onChange,
    });

    expect(screen.getByText("Month")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /remove month/i }));

    expect(onChange).toHaveBeenCalledWith({ categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS });
  });

  it("lists every passed dataset plus a Report default option", () => {
    renderBuildTab({ datasets, reportDatasetId: 7 });

    const picker = screen.getByRole("combobox", { name: "Dataset" });
    const labels = [...picker.querySelectorAll("option")].map((o) => o.textContent);

    expect(labels).toEqual(["Report default (Sales by month)", "Sales by month", "Leads detail"]);
  });

  it("selecting a dataset calls onDatasetChange with its id", async () => {
    const onDatasetChange = vi.fn();
    renderBuildTab({ datasets, reportDatasetId: 7, onDatasetChange });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Dataset" }), "8");

    expect(onDatasetChange).toHaveBeenCalledWith(8);
  });

  it("selecting Report default calls onDatasetChange with null", async () => {
    const onDatasetChange = vi.fn();
    renderBuildTab({ widget: makeWidget({ datasetId: 8 }), datasets, reportDatasetId: 7, onDatasetChange });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Dataset" }), "");

    expect(onDatasetChange).toHaveBeenCalledWith(null);
  });

  it("is disabled when there are no datasets to choose from", () => {
    renderBuildTab({ datasets: [] });

    expect(screen.getByRole("combobox", { name: "Dataset" })).toBeDisabled();
  });

  it("shows the picker for a widget with no binding yet, so its dataset can be chosen first", () => {
    renderBuildTab({ widget: makeWidget({ binding: null }), datasets });

    expect(screen.getByRole("combobox", { name: "Dataset" })).toBeInTheDocument();
    expect(screen.queryByText("Axis")).not.toBeInTheDocument();
  });

  it("does not change the dataset when the confirm prompt is declined", async () => {
    const onDatasetChange = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderBuildTab({
      widget: makeWidget({ binding: { categoryField: "Month", valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS } }),
      datasets,
      onDatasetChange,
    });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Dataset" }), "8");

    expect(confirmSpy).toHaveBeenCalled();
    expect(onDatasetChange).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("changes the dataset when the confirm prompt is accepted", async () => {
    const onDatasetChange = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderBuildTab({
      widget: makeWidget({ binding: { categoryField: "Month", valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS } }),
      datasets,
      onDatasetChange,
    });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Dataset" }), "8");

    expect(onDatasetChange).toHaveBeenCalledWith(8);
    confirmSpy.mockRestore();
  });

  it("does not prompt when the widget has no fields assigned yet", async () => {
    const onDatasetChange = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderBuildTab({ datasets, onDatasetChange });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Dataset" }), "8");

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onDatasetChange).toHaveBeenCalledWith(8);
    confirmSpy.mockRestore();
  });
});
