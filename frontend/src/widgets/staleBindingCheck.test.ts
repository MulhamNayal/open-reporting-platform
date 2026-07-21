import { describe, expect, it } from "vitest";
import { findMissingFields, isBindingComplete } from "./staleBindingCheck";

const columns = [
  { name: "Month", nativeType: "nvarchar(20)" },
  { name: "Revenue", nativeType: "decimal(18,2)" },
];

describe("findMissingFields", () => {
  it("returns an empty array when every field still exists", () => {
    expect(findMissingFields(columns, "Month", ["Revenue"])).toEqual([]);
  });

  it("reports a missing categoryField", () => {
    expect(findMissingFields(columns, "Region", ["Revenue"])).toEqual(["Region"]);
  });

  it("reports missing valueFields", () => {
    expect(findMissingFields(columns, "Month", ["Cost"])).toEqual(["Cost"]);
  });

  it("ignores a null categoryField", () => {
    expect(findMissingFields(columns, null, ["Revenue"])).toEqual([]);
  });
});

describe("isBindingComplete", () => {
  it("returns true for a Kpi with one value field and a null category", () => {
    expect(isBindingComplete("Kpi", null, ["Revenue"])).toBe(true);
  });

  it("returns false for a Kpi with no value fields", () => {
    expect(isBindingComplete("Kpi", null, [])).toBe(false);
  });

  it("returns false for a Bar with a category but no value fields", () => {
    expect(isBindingComplete("Bar", "Month", [])).toBe(false);
  });

  it("returns true for a Bar with a category and one value field", () => {
    expect(isBindingComplete("Bar", "Month", ["Revenue"])).toBe(true);
  });

  it("returns false for a Pie with a category and two value fields", () => {
    expect(isBindingComplete("Pie", "Month", ["Revenue", "Cost"])).toBe(false);
  });

  it("returns true for a Table with no value fields", () => {
    expect(isBindingComplete("Table", null, [])).toBe(true);
  });

  it("returns true for a Scatter with exactly two value fields and no category", () => {
    expect(isBindingComplete("Scatter", null, ["Sales", "Profit"])).toBe(true);
  });

  it("returns false for a Scatter with only one value field", () => {
    expect(isBindingComplete("Scatter", null, ["Sales"])).toBe(false);
  });

  it("returns true for a StackedColumn with a category and one value field", () => {
    expect(isBindingComplete("StackedColumn", "Month", ["Revenue"])).toBe(true);
  });

  it("returns true for a Donut with a category and one value field", () => {
    expect(isBindingComplete("Donut", "Month", ["Revenue"])).toBe(true);
  });
});
