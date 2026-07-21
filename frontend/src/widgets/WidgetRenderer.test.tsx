import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WidgetSummary } from "../api/widgets";
import WidgetRenderer from "./WidgetRenderer";
import * as useDatasetExecuteModule from "./useDatasetExecute";

function makeWidget(overrides: Partial<WidgetSummary>): WidgetSummary {
  return {
    id: 1,
    type: "Text",
    x: 0,
    y: 0,
    w: 4,
    h: 2,
    title: "Widget",
    content: null,
    binding: null,
    ...overrides,
  };
}

describe("WidgetRenderer", () => {
  it("renders a Text widget without calling useDatasetExecute for real data", () => {
    vi.spyOn(useDatasetExecuteModule, "useDatasetExecute").mockReturnValue({ data: null, loading: false, error: null });

    render(<WidgetRenderer widget={makeWidget({ type: "Text", title: "A note", content: "hello" })} />);

    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows an info state for a data-driven widget with no binding yet", () => {
    vi.spyOn(useDatasetExecuteModule, "useDatasetExecute").mockReturnValue({ data: null, loading: false, error: null });

    render(<WidgetRenderer widget={makeWidget({ type: "Kpi", binding: null })} />);

    expect(screen.getByText("Not bound to a Dataset yet.")).toBeInTheDocument();
  });

  it("shows the stale-binding warning when a bound field no longer exists", () => {
    vi.spyOn(useDatasetExecuteModule, "useDatasetExecute").mockReturnValue({
      data: { columns: [{ name: "Id", nativeType: "int" }], rows: [[1]] },
      loading: false,
      error: null,
    });

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "Kpi", binding: { datasetId: 1, categoryField: null, valueFields: ["Revenue"] } })}
      />,
    );

    expect(screen.getByText(/no longer exists in this Dataset/)).toBeInTheDocument();
  });

  it("shows the finish-configuring info state for a Kpi bound to a Dataset with no fields chosen yet", () => {
    vi.spyOn(useDatasetExecuteModule, "useDatasetExecute").mockReturnValue({
      data: { columns: [{ name: "Revenue", nativeType: "decimal(18,2)" }], rows: [[500]] },
      loading: false,
      error: null,
    });

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "Kpi", title: "Total Revenue", binding: { datasetId: 1, categoryField: null, valueFields: [] } })}
      />,
    );

    expect(screen.getByText("Finish configuring this widget's fields to see a preview.")).toBeInTheDocument();
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
  });

  it("renders a Kpi value when the binding is valid", () => {
    vi.spyOn(useDatasetExecuteModule, "useDatasetExecute").mockReturnValue({
      data: { columns: [{ name: "Revenue", nativeType: "decimal(18,2)" }], rows: [[500]] },
      loading: false,
      error: null,
    });

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "Kpi", title: "Total Revenue", binding: { datasetId: 1, categoryField: null, valueFields: ["Revenue"] } })}
      />,
    );

    expect(screen.getByText("500")).toBeInTheDocument();
  });
});
