import { describe, expect, it } from "vitest";
import type { QueryResult } from "../api/datasets";
import { shapeBarOption, shapeKpiValue, shapePieOption, shapeTableRows } from "./shaping";

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

describe("shapeKpiValue", () => {
  it("returns the first row's value for the given field", () => {
    expect(shapeKpiValue(result, "Revenue")).toBe(100);
  });

  it("returns null when there are no rows", () => {
    const empty: QueryResult = { columns: result.columns, rows: [] };
    expect(shapeKpiValue(empty, "Revenue")).toBeNull();
  });
});
