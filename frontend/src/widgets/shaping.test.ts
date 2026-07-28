import { describe, expect, it } from "vitest";
import type { QueryResult } from "../api/datasets";
import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
import { formatToSeriesOptions, PALETTES, shapeBarOption, shapeKpiValue, shapeLineOption, shapePieOption, shapeScatterOption, shapeTableRows } from "./shaping";

const result: QueryResult = {
  columns: [
    { name: "Month", nativeType: "nvarchar(20)" },
    { name: "Revenue", nativeType: "decimal(18,2)" },
    { name: "Cost", nativeType: "decimal(18,2)" },
  ],
  rows: [
    ["Jan", 100, 40],
    ["Feb", 150, 60],
  ],
};

describe("shapeTableRows", () => {
  it("returns every column when valueFields is empty", () => {
    const shaped = shapeTableRows(result, []);

    expect(shaped.columns).toEqual(["Month", "Revenue", "Cost"]);
    expect(shaped.rows).toEqual(result.rows);
  });

  it("restricts to the requested subset, preserving requested order", () => {
    const shaped = shapeTableRows(result, ["Revenue", "Month"]);

    expect(shaped.columns).toEqual(["Revenue", "Month"]);
    expect(shaped.rows).toEqual([
      [100, "Jan"],
      [150, "Feb"],
    ]);
  });
});

describe("shapeBarOption", () => {
  it("builds one series per value field sharing the category axis", () => {
    const option = shapeBarOption(result, "Month", ["Revenue", "Cost"]);
    const series = option.series as Array<{ name: string; type: string; data: number[] }>;

    expect(option.xAxis).toMatchObject({ type: "category", data: ["Jan", "Feb"] });
    expect(series).toHaveLength(2);
    expect(series[0]).toMatchObject({ name: "Revenue", type: "bar", data: [100, 150] });
    expect(series[1]).toMatchObject({ name: "Cost", type: "bar", data: [40, 60] });
  });
});

describe("shapeBarOption sort/data-labels options", () => {
  it("sorts series data ascending by value when sortDirection is asc", () => {
    const option = shapeBarOption(result, "Month", ["Revenue"], { sortDirection: "asc" });

    expect(option.xAxis).toMatchObject({ data: ["Jan", "Feb"] });
    const series = option.series as Array<{ data: number[] }>;
    expect(series[0].data).toEqual([100, 150]);
  });

  it("sorts series data descending by value when sortDirection is desc", () => {
    const option = shapeBarOption(result, "Month", ["Revenue"], { sortDirection: "desc" });

    expect(option.xAxis).toMatchObject({ data: ["Feb", "Jan"] });
  });

  it("enables data labels on every series when dataLabels is true", () => {
    const option = shapeBarOption(result, "Month", ["Revenue"], { dataLabels: true });

    const series = option.series as Array<{ label?: { show: boolean } }>;
    expect(series[0].label).toMatchObject({ show: true });
  });

  it("leaves data unsorted and labels off by default", () => {
    const option = shapeBarOption(result, "Month", ["Revenue"]);

    expect(option.xAxis).toMatchObject({ data: ["Jan", "Feb"] });
    const series = option.series as Array<{ label?: { show: boolean } }>;
    expect(series[0].label).toBeUndefined();
  });
});

describe("shapeBarOption stacked/horizontal options", () => {
  it("sets stack on every series when stacked is true", () => {
    const option = shapeBarOption(result, "Month", ["Revenue", "Cost"], { stacked: true });

    const series = option.series as Array<{ stack?: string }>;
    expect(series[0].stack).toBeDefined();
    expect(series[0].stack).toBe(series[1].stack);
  });

  it("does not set stack by default", () => {
    const option = shapeBarOption(result, "Month", ["Revenue", "Cost"]);

    const series = option.series as Array<{ stack?: string }>;
    expect(series[0].stack).toBeUndefined();
  });

  it("swaps the category axis to Y and value axis to X when horizontal is true", () => {
    const option = shapeBarOption(result, "Month", ["Revenue"], { horizontal: true });

    expect(option.yAxis).toMatchObject({ type: "category", data: ["Jan", "Feb"] });
    expect(option.xAxis).toMatchObject({ type: "value" });
  });
});

describe("shapeBarOption legend/grid/palette options", () => {
  it("emits a legend block only when showLegend is true", () => {
    expect(shapeBarOption(result, "Month", ["Revenue"], { showLegend: true }).legend).toBeDefined();
    expect(shapeBarOption(result, "Month", ["Revenue"], { showLegend: false }).legend).toBeUndefined();
    expect(shapeBarOption(result, "Month", ["Revenue"]).legend).toBeUndefined();
  });

  it("toggles value-axis gridlines via splitLine.show when grid is set", () => {
    const on = shapeBarOption(result, "Month", ["Revenue"], { grid: true });
    const off = shapeBarOption(result, "Month", ["Revenue"], { grid: false });

    expect((on.yAxis as { splitLine?: { show: boolean } }).splitLine).toEqual({ show: true });
    expect((off.yAxis as { splitLine?: { show: boolean } }).splitLine).toEqual({ show: false });
    // Unset by default so ECharts' own default gridlines stand.
    expect((shapeBarOption(result, "Month", ["Revenue"]).yAxis as { splitLine?: unknown }).splitLine).toBeUndefined();
  });

  it("feeds the named palette's colors into ECharts' color array", () => {
    const option = shapeBarOption(result, "Month", ["Revenue"], { palette: "ocean" });

    expect(option.color).toEqual(PALETTES.ocean);
    // A different palette produces a different color array — proving it is load-bearing.
    expect(shapeBarOption(result, "Month", ["Revenue"], { palette: "forest" }).color).toEqual(PALETTES.forest);
    expect(shapeBarOption(result, "Month", ["Revenue"]).color).toBeUndefined();
  });
});

describe("shapePieOption", () => {
  it("builds one slice per category row", () => {
    const option = shapePieOption(result, "Month", "Revenue");

    const series = option.series as Array<{ data: Array<{ name: string; value: number }> }>;
    expect(series[0].data).toEqual([
      { name: "Jan", value: 100 },
      { name: "Feb", value: 150 },
    ]);
  });
});

describe("shapeLineOption area option", () => {
  it("sets areaStyle on every series when area is true", () => {
    const option = shapeLineOption(result, "Month", ["Revenue"], { area: true });

    const series = option.series as Array<{ areaStyle?: object }>;
    expect(series[0].areaStyle).toBeDefined();
  });

  it("does not set areaStyle by default", () => {
    const option = shapeLineOption(result, "Month", ["Revenue"]);

    const series = option.series as Array<{ areaStyle?: object }>;
    expect(series[0].areaStyle).toBeUndefined();
  });
});

describe("shapePieOption donut option", () => {
  it("sets a cutout radius range when donut is true", () => {
    const option = shapePieOption(result, "Month", "Revenue", { donut: true });

    const series = option.series as Array<{ radius?: string[] }>;
    expect(series[0].radius).toEqual(["50%", "70%"]);
  });

  it("uses a full-circle radius by default", () => {
    const option = shapePieOption(result, "Month", "Revenue");

    const series = option.series as Array<{ radius?: string[] }>;
    expect(series[0].radius).toBeUndefined();
  });
});

describe("shapePieOption legend/palette options", () => {
  it("emits a legend block and palette colors when requested", () => {
    const option = shapePieOption(result, "Month", "Revenue", { showLegend: true, palette: "sunset" });

    expect(option.legend).toBeDefined();
    expect(option.color).toEqual(PALETTES.sunset);
  });

  it("omits legend and color by default", () => {
    const option = shapePieOption(result, "Month", "Revenue");

    expect(option.legend).toBeUndefined();
    expect(option.color).toBeUndefined();
  });
});

describe("formatToSeriesOptions", () => {
  it("maps the persisted format options onto shaping options", () => {
    const mapped = formatToSeriesOptions({ ...DEFAULT_FORMAT_OPTIONS, sortDirection: "desc", dataLabels: true, showLegend: false, grid: false, palette: "forest" });

    expect(mapped).toMatchObject({ sortDirection: "desc", dataLabels: true, showLegend: false, grid: false, palette: "forest" });
  });

  it("returns an empty object when no format is given", () => {
    expect(formatToSeriesOptions(undefined)).toEqual({});
  });
});

describe("shapeScatterOption", () => {
  const scatterResult: QueryResult = {
    columns: [
      { name: "Segment", nativeType: "nvarchar(20)" },
      { name: "Sales", nativeType: "decimal(18,2)" },
      { name: "Profit", nativeType: "decimal(18,2)" },
    ],
    rows: [
      ["Consumer", 100, 20],
      ["Corporate", 200, 50],
    ],
  };

  it("builds one point per row, using valueFields[0] as X and valueFields[1] as Y positionally", () => {
    const option = shapeScatterOption(scatterResult, "Sales", "Profit", null);

    const series = option.series as Array<{ data: Array<[number, number]> }>;
    expect(series[0].data).toEqual([[100, 20], [200, 50]]);
  });

  it("groups points into one series per distinct value of the details field when provided", () => {
    const option = shapeScatterOption(scatterResult, "Sales", "Profit", "Segment");

    const series = option.series as Array<{ name: string; data: Array<[number, number]> }>;
    expect(series).toHaveLength(2);
    expect(series.map((s) => s.name).sort()).toEqual(["Consumer", "Corporate"]);
  });

  it("swapping the field order swaps which axis each measure lands on", () => {
    const optionA = shapeScatterOption(scatterResult, "Sales", "Profit", null);
    const optionB = shapeScatterOption(scatterResult, "Profit", "Sales", null);

    const seriesA = optionA.series as Array<{ data: Array<[number, number]> }>;
    const seriesB = optionB.series as Array<{ data: Array<[number, number]> }>;
    expect(seriesA[0].data[0]).toEqual([100, 20]);
    expect(seriesB[0].data[0]).toEqual([20, 100]);
  });

  it("threads legend, palette, and gridline toggles through the format options", () => {
    const option = shapeScatterOption(scatterResult, "Sales", "Profit", "Segment", { showLegend: true, palette: "meridian", grid: false });

    expect(option.legend).toBeDefined();
    expect(option.color).toEqual(PALETTES.meridian);
    expect((option.xAxis as { splitLine?: { show: boolean } }).splitLine).toEqual({ show: false });
    expect((option.yAxis as { splitLine?: { show: boolean } }).splitLine).toEqual({ show: false });
  });

  it("omits legend/color and leaves gridlines at ECharts defaults when no options are given", () => {
    const option = shapeScatterOption(scatterResult, "Sales", "Profit", null);

    expect(option.legend).toBeUndefined();
    expect(option.color).toBeUndefined();
    expect((option.xAxis as { splitLine?: unknown }).splitLine).toBeUndefined();
  });
});

describe("shapeBarOption value formatting (tooltip/axis-label/data-label)", () => {
  const format = { ...DEFAULT_FORMAT_OPTIONS, fieldFormats: { Revenue: { type: "decimal" as const, decimalPlaces: 1, prefix: "$" } } };

  it("formats the axis label using the first value field's format", () => {
    const option = shapeBarOption(result, "Month", ["Revenue"], { format });

    const axisLabel = (option.yAxis as { axisLabel: { formatter: (v: number) => string } }).axisLabel;
    expect(axisLabel.formatter(1234.5)).toBe("$1,234.5");
  });

  it("formats each series' data label using that series' own field format", () => {
    const option = shapeBarOption(result, "Month", ["Revenue"], { format, dataLabels: true });

    const series = option.series as Array<{ label: { formatter: (p: { value: unknown }) => string } }>;
    expect(series[0].label.formatter({ value: 100 })).toBe("$100.0");
  });

  it("formats each series' tooltip line using that series' own field format", () => {
    const option = shapeBarOption(result, "Month", ["Revenue", "Cost"], { format });

    // seriesIndex is what real ECharts callback params always carry for an axis-trigger
    // tooltip — the formatter uses it (not seriesName) to recover each line's raw field.
    const tooltip = option.tooltip as { formatter: (params: unknown) => string };
    const text = tooltip.formatter([
      { axisValue: "Jan", marker: "●", seriesIndex: 0, seriesName: "Revenue", value: 100 },
      { axisValue: "Jan", marker: "●", seriesIndex: 1, seriesName: "Cost", value: 40 },
    ]);
    expect(text).toContain("$100.0");
    // Cost has no configured format, so it falls back to plain text (native type unknown here).
    expect(text).toContain("Cost: 40");
  });
});

describe("shapeBarOption display name", () => {
  it("uses the configured display name for a series' name/legend label", () => {
    const format = { ...DEFAULT_FORMAT_OPTIONS, fieldFormats: { Revenue: { displayName: "Total Sales" } } };
    const option = shapeBarOption(result, "Month", ["Revenue"], { format });

    const series = option.series as Array<{ name: string }>;
    expect(series[0].name).toBe("Total Sales");
  });

  it("falls back to the raw field name when no display name is configured", () => {
    const option = shapeBarOption(result, "Month", ["Revenue"], {});

    const series = option.series as Array<{ name: string }>;
    expect(series[0].name).toBe("Revenue");
  });

  it("labels the tooltip line with the display name while still formatting using the correct field's own format", () => {
    const format = {
      ...DEFAULT_FORMAT_OPTIONS,
      fieldFormats: {
        Revenue: { displayName: "Total Sales", type: "decimal" as const, decimalPlaces: 1, prefix: "$" },
        Cost: { displayName: "Total Cost" },
      },
    };
    const option = shapeBarOption(result, "Month", ["Revenue", "Cost"], { format });

    const tooltip = option.tooltip as { formatter: (params: unknown) => string };
    const text = tooltip.formatter([
      { axisValue: "Jan", marker: "●", seriesIndex: 0, seriesName: "Total Sales", value: 100 },
      { axisValue: "Jan", marker: "●", seriesIndex: 1, seriesName: "Total Cost", value: 40 },
    ]);
    expect(text).toContain("Total Sales: $100.0");
    expect(text).toContain("Total Cost: 40");
    expect(text).not.toContain("Revenue");
  });
});

describe("shapePieOption value formatting (tooltip/data-label)", () => {
  it("formats the data label and tooltip using the value field's format", () => {
    const format = { ...DEFAULT_FORMAT_OPTIONS, fieldFormats: { Revenue: { type: "decimal" as const, decimalPlaces: 0, suffix: " USD" } } };
    const option = shapePieOption(result, "Month", "Revenue", { format, dataLabels: true, showLegend: false });

    const series = option.series as Array<{ label: { formatter: (p: { value: unknown }) => string } }>;
    expect(series[0].label.formatter({ value: 100 })).toBe("100 USD");

    const tooltip = option.tooltip as { formatter: (params: unknown) => string };
    expect(tooltip.formatter({ name: "Jan", marker: "●", value: 100, percent: 40 })).toBe("●Jan: 100 USD (40%)");
  });
});

describe("shapeScatterOption value formatting (tooltip/axis-label/data-label)", () => {
  const scatterResult: QueryResult = {
    columns: [
      { name: "Segment", nativeType: "nvarchar(20)" },
      { name: "Sales", nativeType: "decimal(18,2)" },
      { name: "Profit", nativeType: "decimal(18,2)" },
    ],
    rows: [["Consumer", 100, 20]],
  };
  const format = {
    ...DEFAULT_FORMAT_OPTIONS,
    fieldFormats: { Sales: { type: "decimal" as const, decimalPlaces: 0, prefix: "$" }, Profit: { type: "decimal" as const, decimalPlaces: 0, prefix: "$" } },
  };

  it("formats each axis independently using that field's own format", () => {
    const option = shapeScatterOption(scatterResult, "Sales", "Profit", null, { format });

    const xAxis = option.xAxis as { axisLabel: { formatter: (v: number) => string } };
    const yAxis = option.yAxis as { axisLabel: { formatter: (v: number) => string } };
    expect(xAxis.axisLabel.formatter(1000)).toBe("$1,000");
    expect(yAxis.axisLabel.formatter(250)).toBe("$250");
  });

  it("formats the data label showing both formatted coordinates", () => {
    const option = shapeScatterOption(scatterResult, "Sales", "Profit", null, { format, dataLabels: true });

    const series = option.series as Array<{ label: { formatter: (p: unknown) => string } }>;
    expect(series[0].label.formatter({ value: [1000, 250] })).toBe("($1,000, $250)");
  });

  it("formats the tooltip showing both fields with their own formats", () => {
    const option = shapeScatterOption(scatterResult, "Sales", "Profit", null, { format });

    const tooltip = option.tooltip as { formatter: (p: unknown) => string };
    const text = tooltip.formatter({ marker: "●", value: [1000, 250] });
    expect(text).toContain("Sales: $1,000");
    expect(text).toContain("Profit: $250");
  });
});

describe("shapeScatterOption display name", () => {
  const scatterResult: QueryResult = {
    columns: [
      { name: "Sales", nativeType: "decimal(18,2)" },
      { name: "Profit", nativeType: "decimal(18,2)" },
    ],
    rows: [[100, 20]],
  };

  it("uses configured display names for the axis titles and tooltip labels", () => {
    const format = {
      ...DEFAULT_FORMAT_OPTIONS,
      fieldFormats: { Sales: { displayName: "Total Sales" }, Profit: { displayName: "Net Profit" } },
    };
    const option = shapeScatterOption(scatterResult, "Sales", "Profit", null, { format });

    expect((option.xAxis as { name: string }).name).toBe("Total Sales");
    expect((option.yAxis as { name: string }).name).toBe("Net Profit");

    const tooltip = option.tooltip as { formatter: (p: unknown) => string };
    const text = tooltip.formatter({ marker: "●", value: [100, 20] });
    expect(text).toContain("Total Sales:");
    expect(text).toContain("Net Profit:");
  });

  it("falls back to the raw field name for axis titles when no display name is configured", () => {
    const option = shapeScatterOption(scatterResult, "Sales", "Profit", null, {});

    expect((option.xAxis as { name: string }).name).toBe("Sales");
    expect((option.yAxis as { name: string }).name).toBe("Profit");
  });
});

describe("shapeKpiValue", () => {
  it("returns the first row's value for the given field", () => {
    expect(shapeKpiValue(result, "Revenue")).toBe(100);
  });

  it("returns null when there are no rows", () => {
    const empty: QueryResult = { columns: result.columns, rows: [] };
    expect(shapeKpiValue(empty, "Revenue")).toBeNull();
  });
});
