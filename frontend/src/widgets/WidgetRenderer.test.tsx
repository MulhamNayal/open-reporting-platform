import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as echarts from "echarts";
import type { QueryResult } from "../api/datasets";
import type { WidgetSummary } from "../api/widgets";
import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
import { AppearanceProvider } from "../appearance/AppearanceContext";
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
    datasetId: null,
    binding: null,
    ...overrides,
  };
}

function renderWidget(ui: React.ReactElement) {
  return render(<AppearanceProvider>{ui}</AppearanceProvider>);
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

  // Aggregating reshapes columns to [categoryField, ...valueFields]. A table given only valueFields
  // rendered correct totals with nothing saying which group each belonged to.
  describe("an aggregated table", () => {
    const teamResult: QueryResult = {
      columns: [
        { name: "Team", nativeType: "nvarchar" },
        { name: "Project", nativeType: "nvarchar" },
        { name: "ThisYear", nativeType: "decimal" },
      ],
      rows: [
        ["Elite", "Subsales", 100],
        ["Elite", "Rentals", 20],
        ["United", "Subsales", 50],
      ],
    } as unknown as QueryResult;

    const widget = makeWidget({
      type: "Table",
      title: "By Team",
      datasetId: 1,
      binding: {
        categoryField: "Team",
        valueFields: ["ThisYear"],
        aggregations: ["Sum"],
        formatOptions: formatOptionsJson,
      },
    });

    // A header cell also holds a sort label and a filter control, so its accessible name is not the
    // bare column name — the header text is what's being asserted here.
    function headerTexts(): string[] {
      return Array.from(document.querySelectorAll("thead th")).map((th) => th.textContent ?? "");
    }

    it("keeps the grouped column and collapses the rows", () => {
      renderWidget(<WidgetRenderer widget={widget} result={teamResult} />);

      expect(headerTexts().some((h) => h.includes("Team"))).toBe(true);
      expect(screen.getByText("Elite")).toBeInTheDocument();
      expect(screen.getByText("United")).toBeInTheDocument();
      // Elite's two rows summed into one, so the split column is gone with them.
      expect(screen.queryByText("Subsales")).not.toBeInTheDocument();
      expect(screen.getByText("120.00")).toBeInTheDocument();
    });

    it("leaves an unaggregated table's columns alone", () => {
      const plain = makeWidget({
        type: "Table",
        datasetId: 1,
        binding: {
          categoryField: "Team",
          valueFields: ["Project", "ThisYear"],
          aggregations: null,
          formatOptions: formatOptionsJson,
        },
      });
      renderWidget(<WidgetRenderer widget={plain} result={teamResult} />);

      // No aggregation, so the binding is rendered verbatim — Team is not silently prepended.
      expect(headerTexts().some((h) => h.includes("Team"))).toBe(false);
      expect(headerTexts().some((h) => h.includes("Project"))).toBe(true);
      expect(screen.getAllByText("Subsales")).toHaveLength(2);
    });
  });

  it("renders a Text widget without needing a result", () => {
    renderWidget(<WidgetRenderer widget={makeWidget({ type: "Text", title: "A note", content: "hello" })} result={null} />);

    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("shows an info state for a data-driven widget with no binding yet", () => {
    renderWidget(<WidgetRenderer widget={makeWidget({ type: "Kpi", binding: null })} result={null} />);

    expect(screen.getByText("Not bound to a field yet.")).toBeInTheDocument();
  });

  it("shows the dataset error instead of Loading when that widget's dataset failed", () => {
    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Kpi", binding: { categoryField: null, valueFields: ["Total"], formatOptions: formatOptionsJson } })}
        result={null}
        error="Could not load this dataset."
      />,
    );

    expect(screen.getByText("Could not load this dataset.")).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("still shows Loading when there is no result and no error yet", () => {
    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Kpi", binding: { categoryField: null, valueFields: ["Total"], formatOptions: formatOptionsJson } })}
        result={null}
      />,
    );

    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows the stale-binding warning when a bound field no longer exists", () => {
    const result: QueryResult = { columns: [{ name: "Id", nativeType: "int" }], rows: [[1]] };

    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Kpi", binding: { categoryField: null, valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.getByText(/no longer exists in this report's query/)).toBeInTheDocument();
  });

  it("shows the finish-configuring info state for a Kpi with no fields chosen yet", () => {
    const result: QueryResult = { columns: [{ name: "Revenue", nativeType: "decimal(18,2)" }], rows: [[500]] };

    renderWidget(
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

    renderWidget(
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

    renderWidget(
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

    renderWidget(
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

    renderWidget(
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

    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Donut", binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
  });

  it("renders a format-overridden title instead of the widget's own when format.title is set", () => {
    const result: QueryResult = {
      columns: [
        { name: "Month", nativeType: "nvarchar(20)" },
        { name: "Revenue", nativeType: "decimal(18,2)" },
      ],
      rows: [["Jan", 100]],
    };
    const formatOptions = JSON.stringify({ ...DEFAULT_FORMAT_OPTIONS, title: "Quarterly revenue" });

    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Bar", title: "Widget", binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions } })}
        result={result}
      />,
    );

    expect(screen.getByText("Quarterly revenue")).toBeInTheDocument();
    expect(screen.queryByText("Widget")).not.toBeInTheDocument();
  });

  it("suppresses the title entirely when format.showTitle is false", () => {
    const result: QueryResult = {
      columns: [
        { name: "Month", nativeType: "nvarchar(20)" },
        { name: "Revenue", nativeType: "decimal(18,2)" },
      ],
      rows: [["Jan", 100]],
    };
    const formatOptions = JSON.stringify({ ...DEFAULT_FORMAT_OPTIONS, showTitle: false, title: "Quarterly revenue" });

    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Bar", title: "Widget", binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions } })}
        result={result}
      />,
    );

    expect(screen.queryByText("Quarterly revenue")).not.toBeInTheDocument();
    expect(screen.queryByText("Widget")).not.toBeInTheDocument();
  });

  it("renders a Kpi with a format-overridden title instead of the widget's own", () => {
    const result: QueryResult = { columns: [{ name: "Revenue", nativeType: "decimal(18,2)" }], rows: [[500]] };
    const formatOptions = JSON.stringify({ ...DEFAULT_FORMAT_OPTIONS, title: "Total revenue" });

    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Kpi", title: "Widget", binding: { categoryField: null, valueFields: ["Revenue"], formatOptions } })}
        result={result}
      />,
    );

    expect(screen.getByText("Total revenue")).toBeInTheDocument();
    expect(screen.queryByText("Widget")).not.toBeInTheDocument();
  });

  it("suppresses a Kpi's title entirely when format.showTitle is false", () => {
    const result: QueryResult = { columns: [{ name: "Revenue", nativeType: "decimal(18,2)" }], rows: [[500]] };
    const formatOptions = JSON.stringify({ ...DEFAULT_FORMAT_OPTIONS, showTitle: false, title: "Total revenue" });

    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Kpi", title: "Widget", binding: { categoryField: null, valueFields: ["Revenue"], formatOptions } })}
        result={result}
      />,
    );

    // The value still renders; only the title is suppressed.
    expect(screen.getByText("500")).toBeInTheDocument();
    expect(screen.queryByText("Total revenue")).not.toBeInTheDocument();
    expect(screen.queryByText("Widget")).not.toBeInTheDocument();
  });

  it("renders a Table with a format-overridden title instead of the widget's own", () => {
    const result: QueryResult = {
      columns: [{ name: "Region", nativeType: "nvarchar(20)" }],
      rows: [["North"]],
    };
    const formatOptions = JSON.stringify({ ...DEFAULT_FORMAT_OPTIONS, title: "Sales breakdown" });

    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Table", title: "Widget", binding: { categoryField: null, valueFields: ["Region"], formatOptions } })}
        result={result}
      />,
    );

    expect(screen.getByText("Sales breakdown")).toBeInTheDocument();
    expect(screen.queryByText("Widget")).not.toBeInTheDocument();
  });

  it("suppresses a Table's title entirely when format.showTitle is false", () => {
    const result: QueryResult = {
      columns: [{ name: "Region", nativeType: "nvarchar(20)" }],
      rows: [["North"]],
    };
    const formatOptions = JSON.stringify({ ...DEFAULT_FORMAT_OPTIONS, showTitle: false, title: "Sales breakdown" });

    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Table", title: "Widget", binding: { categoryField: null, valueFields: ["Region"], formatOptions } })}
        result={result}
      />,
    );

    // The table body still renders; only the title is suppressed.
    expect(screen.getByText("North")).toBeInTheDocument();
    expect(screen.queryByText("Sales breakdown")).not.toBeInTheDocument();
    expect(screen.queryByText("Widget")).not.toBeInTheDocument();
  });

  it("renders a Kpi's value formatted per its fieldFormats entry", () => {
    const result: QueryResult = { columns: [{ name: "Revenue", nativeType: "decimal(18,2)" }], rows: [[1234.5]] };
    const formatOptions = JSON.stringify({
      ...DEFAULT_FORMAT_OPTIONS,
      fieldFormats: { Revenue: { type: "decimal", decimalPlaces: 2, thousandsSeparator: true, prefix: "$" } },
    });

    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Kpi", binding: { categoryField: null, valueFields: ["Revenue"], formatOptions } })}
        result={result}
      />,
    );

    expect(screen.getByText("$1,234.50")).toBeInTheDocument();
  });

  it("renders a Table's cells formatted per each column's fieldFormats entry", () => {
    const result: QueryResult = {
      columns: [
        { name: "Region", nativeType: "nvarchar(20)" },
        { name: "Revenue", nativeType: "decimal(18,2)" },
      ],
      rows: [["North", 1234.5]],
    };
    const formatOptions = JSON.stringify({
      ...DEFAULT_FORMAT_OPTIONS,
      fieldFormats: { Revenue: { type: "decimal", decimalPlaces: 0, suffix: " USD" } },
    });

    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Table", binding: { categoryField: null, valueFields: ["Region", "Revenue"], formatOptions } })}
        result={result}
      />,
    );

    expect(screen.getByText("North")).toBeInTheDocument();
    expect(screen.getByText("1,235 USD")).toBeInTheDocument();
  });

  it("renders a Table's column header using its configured display name instead of the raw field name", () => {
    const result: QueryResult = {
      columns: [{ name: "DocAmount", nativeType: "decimal(18,2)" }],
      rows: [[1234.5]],
    };
    const formatOptions = JSON.stringify({
      ...DEFAULT_FORMAT_OPTIONS,
      fieldFormats: { DocAmount: { displayName: "Total Sales" } },
    });

    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Table", binding: { categoryField: null, valueFields: ["DocAmount"], formatOptions } })}
        result={result}
      />,
    );

    expect(screen.getByText("Total Sales")).toBeInTheDocument();
    expect(screen.queryByText("DocAmount")).not.toBeInTheDocument();
  });

  it("applies a Table's configured column width and row height", () => {
    const result: QueryResult = {
      columns: [{ name: "DocAmount", nativeType: "decimal(18,2)" }],
      rows: [[1234.5]],
    };
    const formatOptions = JSON.stringify({
      ...DEFAULT_FORMAT_OPTIONS,
      rowHeight: 48,
      fieldFormats: { DocAmount: { columnWidth: 220, type: "decimal", decimalPlaces: 2 } },
    });

    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Table", binding: { categoryField: null, valueFields: ["DocAmount"], formatOptions } })}
        result={result}
      />,
    );

    const headerCell = screen.getByText("DocAmount").closest("th");
    expect(headerCell).toHaveStyle({ width: "220px" });

    const bodyRow = screen.getByText("1,234.50").closest("tr");
    expect(bodyRow).toHaveStyle({ height: "48px" });
  });

  it("renders a Scatter widget, using valueFields[0]/[1] positionally as X/Y", () => {
    const result: QueryResult = {
      columns: [
        { name: "Sales", nativeType: "decimal(18,2)" },
        { name: "Profit", nativeType: "decimal(18,2)" },
      ],
      rows: [[100, 20]],
    };

    renderWidget(
      <WidgetRenderer
        widget={makeWidget({ type: "Scatter", binding: { categoryField: null, valueFields: ["Sales", "Profit"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finish configuring/)).not.toBeInTheDocument();
  });
});
