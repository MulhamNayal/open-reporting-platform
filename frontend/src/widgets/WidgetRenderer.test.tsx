import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts";
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
  // Chart widgets init ECharts, which needs a real canvas jsdom lacks. Stub init
  // to a no-op chart — same seam useECharts.test.tsx uses; ECharts is not asserted on here.
  beforeEach(() => {
    vi.spyOn(echarts, "init").mockReturnValue({
      setOption: vi.fn(),
      dispose: vi.fn(),
    } as unknown as echarts.ECharts);
  });

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

  it("renders a StackedColumn widget when the binding is valid", () => {
    const result: QueryResult = {
      columns: [
        { name: "Month", nativeType: "nvarchar(20)" },
        { name: "Revenue", nativeType: "decimal(18,2)" },
      ],
      rows: [["Jan", 100]],
    };

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "StackedColumn", binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    // No throw and no stale-binding/incomplete-binding messaging is the assertion here —
    // ECharts itself is not asserted on (see Milestone 4's own useECharts.test.tsx for that seam).
    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finish configuring/)).not.toBeInTheDocument();
  });

  it("renders a ClusteredBar widget when the binding is valid", () => {
    const result: QueryResult = {
      columns: [
        { name: "Month", nativeType: "nvarchar(20)" },
        { name: "Revenue", nativeType: "decimal(18,2)" },
      ],
      rows: [["Jan", 100]],
    };

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "ClusteredBar", binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finish configuring/)).not.toBeInTheDocument();
  });

  it("renders an Area widget when the binding is valid", () => {
    const result: QueryResult = {
      columns: [
        { name: "Month", nativeType: "nvarchar(20)" },
        { name: "Revenue", nativeType: "decimal(18,2)" },
      ],
      rows: [["Jan", 100]],
    };

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "Area", binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
  });

  it("renders a Donut widget when the binding is valid", () => {
    const result: QueryResult = {
      columns: [
        { name: "Month", nativeType: "nvarchar(20)" },
        { name: "Revenue", nativeType: "decimal(18,2)" },
      ],
      rows: [["Jan", 100]],
    };

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "Donut", binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
  });

  it("renders a Scatter widget, using valueFields[0]/[1] positionally as X/Y", () => {
    const result: QueryResult = {
      columns: [
        { name: "Sales", nativeType: "decimal(18,2)" },
        { name: "Profit", nativeType: "decimal(18,2)" },
      ],
      rows: [[100, 20]],
    };

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "Scatter", binding: { categoryField: null, valueFields: ["Sales", "Profit"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finish configuring/)).not.toBeInTheDocument();
  });
});
