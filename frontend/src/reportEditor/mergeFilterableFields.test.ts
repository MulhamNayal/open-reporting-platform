import { describe, expect, it } from "vitest";
import type { QueryResult } from "../api/datasets";
import { MAX_FILTER_VALUES, mergeFilterableFields } from "./mergeFilterableFields";

function result(columns: Array<[string, string]>, rows: unknown[][]): QueryResult {
  return { columns: columns.map(([name, nativeType]) => ({ name, nativeType })), rows };
}

describe("mergeFilterableFields", () => {
  it("returns an empty list for no results", () => {
    expect(mergeFilterableFields([])).toEqual([]);
  });

  it("lists a single result's categorical fields with sorted distinct values", () => {
    const r = result([["Team", "nvarchar"]], [["Beta"], ["Alpha"], ["Beta"]]);

    expect(mergeFilterableFields([r])).toEqual([
      { column: { name: "Team", nativeType: "nvarchar" }, values: ["Alpha", "Beta"] },
    ]);
  });

  it("excludes non-categorical columns", () => {
    const r = result([["Revenue", "decimal"], ["Team", "nvarchar"]], [[100, "Alpha"]]);

    expect(mergeFilterableFields([r]).map((f) => f.column.name)).toEqual(["Team"]);
  });

  it("merges a same-named column across datasets into one group with the union of values", () => {
    const a = result([["Team", "nvarchar"]], [["Alpha"], ["Beta"]]);
    const b = result([["Team", "nvarchar"]], [["Beta"], ["Gamma"]]);

    const merged = mergeFilterableFields([a, b]);

    expect(merged).toHaveLength(1);
    expect(merged[0].values).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("keeps differently-named columns as separate groups", () => {
    const a = result([["Team", "nvarchar"]], [["Alpha"]]);
    const b = result([["Location", "nvarchar"]], [["KL"]]);

    expect(mergeFilterableFields([a, b]).map((f) => f.column.name).sort()).toEqual(["Location", "Team"]);
  });

  it("reads each dataset's column by its own index, not a shared one", () => {
    // Team is index 1 in the first result and index 0 in the second. A shared index would
    // pull the wrong column's values out of one of them.
    const a = result([["Location", "nvarchar"], ["Team", "nvarchar"]], [["KL", "Alpha"]]);
    const b = result([["Team", "nvarchar"], ["Location", "nvarchar"]], [["Beta", "JB"]]);

    const team = mergeFilterableFields([a, b]).find((f) => f.column.name === "Team");

    expect(team?.values).toEqual(["Alpha", "Beta"]);
  });

  it("excludes a field whose distinct values exceed the cap", () => {
    const rows = Array.from({ length: MAX_FILTER_VALUES + 1 }, (_, i) => [`v${i}`]);
    const r = result([["DocNo", "nvarchar"]], rows);

    expect(mergeFilterableFields([r])).toEqual([]);
  });

  it("applies the cap after merging, not per dataset", () => {
    // Each result is individually under the cap; together they exceed it. A per-result cap
    // would let this through and render an unbrowsable group.
    const half = Math.ceil((MAX_FILTER_VALUES + 1) / 2);
    const a = result([["DocNo", "nvarchar"]], Array.from({ length: half }, (_, i) => [`a${i}`]));
    const b = result([["DocNo", "nvarchar"]], Array.from({ length: half }, (_, i) => [`b${i}`]));

    expect(mergeFilterableFields([a, b])).toEqual([]);
  });

  it("collapses null and undefined cells to the blank key", () => {
    const r = result([["Team", "nvarchar"]], [[null], [undefined], ["Alpha"]]);

    expect(mergeFilterableFields([r])[0].values).toEqual(["", "Alpha"]);
  });
});
