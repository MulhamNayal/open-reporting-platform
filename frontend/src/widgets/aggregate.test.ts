import { describe, expect, it } from "vitest";
import type { QueryResult } from "../api/datasets";
import { aggregateResult } from "./aggregate";

const sales: QueryResult = {
  columns: [
    { name: "Source", nativeType: "nvarchar(50)" },
    { name: "Agent", nativeType: "nvarchar(50)" },
    { name: "Amount", nativeType: "decimal(18,2)" },
  ],
  rows: [
    ["Facebook", "Ann", 100],
    ["Facebook", "Ben", 250],
    ["Google", "Ann", 40],
    ["Facebook", "Ann", null],
    ["Google", "Cal", 60],
  ],
};

function cell(result: QueryResult, row: number, column: string) {
  return result.rows[row][result.columns.findIndex((c) => c.name === column)];
}

describe("aggregateResult", () => {
  it("returns the input untouched when no aggregation is set", () => {
    expect(aggregateResult(sales, "Source", ["Amount"], null)).toBe(sales);
    expect(aggregateResult(sales, "Source", ["Amount"], ["None"])).toBe(sales);
  });

  it("sums by category, ignoring nulls like SQL does", () => {
    const out = aggregateResult(sales, "Source", ["Amount"], ["Sum"]);

    expect(out.rows).toHaveLength(2);
    expect(cell(out, 0, "Source")).toBe("Facebook");
    expect(cell(out, 0, "Amount")).toBe(350);
    expect(cell(out, 1, "Amount")).toBe(100);
  });

  it("counts non-null values and distinct values separately", () => {
    const counted = aggregateResult(sales, "Source", ["Amount"], ["Count"]);
    expect(cell(counted, 0, "Amount")).toBe(2); // the null row is not counted

    const distinct = aggregateResult(sales, "Source", ["Agent"], ["CountDistinct"]);
    expect(cell(distinct, 0, "Agent")).toBe(2); // Ann, Ben
  });

  it("averages over present values only", () => {
    const out = aggregateResult(sales, "Source", ["Amount"], ["Avg"]);

    expect(cell(out, 0, "Amount")).toBe(175); // (100 + 250) / 2, not / 3
  });

  it("computes numeric min and max", () => {
    expect(cell(aggregateResult(sales, "Source", ["Amount"], ["Min"]), 0, "Amount")).toBe(100);
    expect(cell(aggregateResult(sales, "Source", ["Amount"], ["Max"]), 0, "Amount")).toBe(250);
  });

  it("falls back to string comparison for non-numeric min/max", () => {
    const out = aggregateResult(sales, "Source", ["Agent"], ["Min"]);

    expect(cell(out, 0, "Agent")).toBe("Ann");
  });

  it("retypes count results as int so they aren't formatted as currency", () => {
    const out = aggregateResult(sales, "Source", ["Amount"], ["Count"]);

    expect(out.columns.find((c) => c.name === "Amount")?.nativeType).toBe("int");
  });

  it("keeps the source type for sum, so field formatting still applies", () => {
    const out = aggregateResult(sales, "Source", ["Amount"], ["Sum"]);

    expect(out.columns.find((c) => c.name === "Amount")?.nativeType).toBe("decimal(18,2)");
  });

  it("aggregates to a single row when there is no category field", () => {
    const out = aggregateResult(sales, null, ["Amount"], ["Sum"]);

    expect(out.rows).toHaveLength(1);
    expect(cell(out, 0, "Amount")).toBe(450);
  });

  it("preserves first-seen category order", () => {
    const out = aggregateResult(sales, "Source", ["Amount"], ["Sum"]);

    expect(out.rows.map((r) => r[0])).toEqual(["Facebook", "Google"]);
  });

  it("supports a different function per value field", () => {
    const out = aggregateResult(sales, "Source", ["Amount", "Agent"], ["Sum", "CountDistinct"]);

    expect(cell(out, 0, "Amount")).toBe(350);
    expect(cell(out, 0, "Agent")).toBe(2);
  });

  it("returns the input untouched when the category field is missing", () => {
    expect(aggregateResult(sales, "Nope", ["Amount"], ["Sum"])).toBe(sales);
  });

  it("yields null rather than 0 when a group has no usable values", () => {
    const allNull: QueryResult = {
      columns: sales.columns,
      rows: [["Facebook", "Ann", null]],
    };

    expect(cell(aggregateResult(allNull, "Source", ["Amount"], ["Sum"]), 0, "Amount")).toBeNull();
  });
});
