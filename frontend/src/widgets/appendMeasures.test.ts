import { describe, expect, it } from "vitest";
import { aggregateResult, appendMeasures } from "./aggregate";
import type { QueryResult } from "../api/datasets";

const teamRows: QueryResult = {
  columns: [
    { name: "Team", nativeType: "nvarchar" },
    { name: "Project", nativeType: "nvarchar" },
    { name: "ThisYear", nativeType: "decimal" },
    { name: "LastYear", nativeType: "decimal" },
  ],
  rows: [
    ["Elite", "Subsales", 110, 100],
    ["Elite", "Rentals", 10, 0],
    ["United", "Subsales", 50, 80],
  ],
} as unknown as QueryResult;

const GROWTH = { name: "Growth", expression: "DIVIDE([ThisYear] - [LastYear], [LastYear])" };

describe("measures on an aggregated result", () => {
  // The reason a measure can't be an aggregation function: Elite's growth is (120-100)/100 = 0.2,
  // the ratio of the sums. Averaging the two rows' own growths would give something else entirely.
  it("computes from the summed values, not per source row", () => {
    const result = aggregateResult(teamRows, "Team", ["ThisYear", "LastYear"], ["Sum", "Sum"], [GROWTH]);

    expect(result.columns.map((c) => c.name)).toEqual(["Team", "ThisYear", "LastYear", "Growth"]);
    const elite = result.rows.find((r) => r[0] === "Elite")!;
    expect(elite[1]).toBe(120);
    expect(elite[3]).toBeCloseTo(0.2);
  });

  it("is blank for a group with nothing to compare against", () => {
    const noPriorYear: QueryResult = {
      columns: teamRows.columns,
      rows: [["Ace", "Subsales", 40, 0]],
    } as unknown as QueryResult;

    const result = aggregateResult(noPriorYear, "Team", ["ThisYear", "LastYear"], ["Sum", "Sum"], [GROWTH]);

    expect(result.rows[0][3]).toBeNull();
  });

  // Typed as a number so the formatter gives it decimals and right alignment; as text it would be
  // left-aligned with no formatting, next to columns that have both.
  it("declares a measure column as numeric", () => {
    const result = aggregateResult(teamRows, "Team", ["ThisYear", "LastYear"], ["Sum", "Sum"], [GROWTH]);

    expect(result.columns.at(-1)!.nativeType).toBe("decimal");
  });

  it("lets a later measure read an earlier one", () => {
    const result = appendMeasures(teamRows, [
      { name: "Delta", expression: "[ThisYear] - [LastYear]" },
      { name: "DoubleDelta", expression: "[Delta] * 2" },
    ]);

    expect(result.rows[0].slice(-2)).toEqual([10, 20]);
  });

  // One bad expression shouldn't cost the other columns, but it must not look like real data either.
  it("leaves a broken expression blank without failing the rest", () => {
    const result = appendMeasures(teamRows, [
      { name: "Broken", expression: "DIVIDE(" },
      { name: "Delta", expression: "[ThisYear] - [LastYear]" },
    ]);

    expect(result.columns.map((c) => c.name)).toContain("Broken");
    expect(result.rows[0].at(-2)).toBeNull();
    expect(result.rows[0].at(-1)).toBe(10);
  });

  // A raw table can carry a computed column too; it just computes per row instead of per group.
  it("applies to an unaggregated result, row by row", () => {
    const result = aggregateResult(teamRows, null, [], null, [
      { name: "Delta", expression: "[ThisYear] - [LastYear]" },
    ]);

    expect(result.rows.map((r) => r.at(-1))).toEqual([10, 10, -30]);
  });

  it("returns the result untouched when there are no measures", () => {
    expect(appendMeasures(teamRows, null)).toBe(teamRows);
    expect(appendMeasures(teamRows, [])).toBe(teamRows);
  });
});
