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

    expect(option.xAxis).toMatchObject({ type: "category", data: ["Jan", "Feb"] });
    expect(option.series).toHaveLength(2);
    expect(option.series![0]).toMatchObject({ name: "Revenue", type: "bar", data: [100, 150] });
    expect(option.series![1]).toMatchObject({ name: "Cost", type: "bar", data: [40, 60] });
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
