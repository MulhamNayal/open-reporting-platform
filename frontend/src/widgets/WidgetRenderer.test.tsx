import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { QueryResult } from "../api/datasets";
import type { WidgetSummary } from "../api/widgets";
import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
import WidgetRenderer from "./WidgetRenderer";

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

const formatOptionsJson = JSON.stringify(DEFAULT_FORMAT_OPTIONS);

describe("WidgetRenderer", () => {
  it("renders a Text widget without needing a result", () => {
    render(<WidgetRenderer widget={makeWidget({ type: "Text", title: "A note", content: "hello" })} result={null} />);

    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows an info state for a data-driven widget with no binding yet", () => {
    render(<WidgetRenderer widget={makeWidget({ type: "Kpi", binding: null })} result={null} />);

    expect(screen.getByText("Not bound to a field yet.")).toBeInTheDocument();
  });

  it("shows the stale-binding warning when a bound field no longer exists", () => {
    const result: QueryResult = { columns: [{ name: "Id", nativeType: "int" }], rows: [[1]] };

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "Kpi", binding: { categoryField: null, valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.getByText(/no longer exists in this report's query/)).toBeInTheDocument();
  });

  it("shows the finish-configuring info state for a Kpi with no fields chosen yet", () => {
    const result: QueryResult = { columns: [{ name: "Revenue", nativeType: "decimal(18,2)" }], rows: [[500]] };

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "Kpi", title: "Total Revenue", binding: { categoryField: null, valueFields: [], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.getByText("Finish configuring this widget's fields to see a preview.")).toBeInTheDocument();
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
  });

  it("renders a Kpi value when the binding is valid", () => {
    const result: QueryResult = { columns: [{ name: "Revenue", nativeType: "decimal(18,2)" }], rows: [[500]] };

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "Kpi", title: "Total Revenue", binding: { categoryField: null, valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.getByText("500")).toBeInTheDocument();
  });
});
