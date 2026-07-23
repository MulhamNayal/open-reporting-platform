import { describe, expect, it } from "vitest";
import { buildTableQueryDefinition, type FilterRowDraft } from "./tableQueryDefinition";

describe("buildTableQueryDefinition", () => {
  it("builds a definition with no filters, no sort, no top when nothing is set", () => {
    const result = buildTableQueryDefinition("Reports", ["Id", "Name"], [], "", "ASC", "");

    expect(result).toEqual({
      query: { table: "Reports", columns: ["Id", "Name"], filters: [], sort: null, top: null },
    });
  });

  it("drops filter rows with no field chosen", () => {
    const rows: FilterRowDraft[] = [
      { field: "", operator: "=", value: "x" },
      { field: "Name", operator: "=", value: "Monthly Sales" },
    ];

    const result = buildTableQueryDefinition("Reports", ["Id"], rows, "", "ASC", "");

    expect(result.query.filters).toEqual([{ field: "Name", operator: "=", value: "Monthly Sales" }]);
  });

  it("keeps multiple complete filter rows in order", () => {
    const rows: FilterRowDraft[] = [
      { field: "Name", operator: "=", value: "X" },
      { field: "Id", operator: ">", value: "1" },
    ];

    const result = buildTableQueryDefinition("Reports", ["Id"], rows, "", "ASC", "");

    expect(result.query.filters).toEqual([
      { field: "Name", operator: "=", value: "X" },
      { field: "Id", operator: ">", value: "1" },
    ]);
  });

  it("sets sort when a sort field is chosen", () => {
    const result = buildTableQueryDefinition("Reports", ["Id"], [], "Id", "DESC", "");

    expect(result.query.sort).toEqual({ field: "Id", direction: "DESC" });
  });

  it("sets top to a parsed number when provided", () => {
    const result = buildTableQueryDefinition("Reports", ["Id"], [], "", "ASC", "10");

    expect(result.query.top).toBe(10);
  });

  it("treats a non-numeric or non-positive top as null", () => {
    expect(buildTableQueryDefinition("Reports", ["Id"], [], "", "ASC", "abc").query.top).toBeNull();
    expect(buildTableQueryDefinition("Reports", ["Id"], [], "", "ASC", "0").query.top).toBeNull();
    expect(buildTableQueryDefinition("Reports", ["Id"], [], "", "ASC", "-5").query.top).toBeNull();
  });

  it("treats a decimal top as null (backend Top is an int)", () => {
    expect(buildTableQueryDefinition("Reports", ["Id"], [], "", "ASC", "2.5").query.top).toBeNull();
  });
});
