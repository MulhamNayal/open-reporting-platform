import { describe, expect, it } from "vitest";
import type { QueryResult } from "../api/datasets";
import { applyFilters } from "./crossFilter";

const result: QueryResult = {
  columns: [
    { name: "Region", nativeType: "nvarchar(20)" },
    { name: "Revenue", nativeType: "decimal(18,2)" },
  ],
  rows: [
    ["North", 100],
    ["South", 200],
    ["East", 150],
  ],
};

describe("applyFilters", () => {
  it("returns every row unchanged when filterState is empty", () => {
    expect(applyFilters(result, {})).toEqual(result);
  });

  it("keeps only rows whose value is in the field's selected set", () => {
    const filtered = applyFilters(result, { Region: ["North", "East"] });

    expect(filtered.rows).toEqual([["North", 100], ["East", 150]]);
  });

  it("intersects across multiple filtered fields", () => {
    const filtered = applyFilters(result, { Region: ["North", "South"], Revenue: ["100"] });

    expect(filtered.rows).toEqual([["North", 100]]);
  });

  it("ignores a filter field that selects zero values (treated as no filter on that field, not exclude-everything)", () => {
    const filtered = applyFilters(result, { Region: [] });

    expect(filtered.rows).toEqual(result.rows);
  });

  it("ignores a filter field that doesn't exist in the result's columns", () => {
    const filtered = applyFilters(result, { Segment: ["Consumer"] });

    expect(filtered.rows).toEqual(result.rows);
  });
});
