import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
import TableWidget from "./TableWidget";

const result: QueryResult = {
  columns: [
    { name: "ProjectName", nativeType: "nvarchar" },
    { name: "Units", nativeType: "int" },
    { name: "NetPrice", nativeType: "decimal" },
    { name: "BookingDate", nativeType: "datetime" },
  ],
  rows: [
    ["Alpha", 2, 1000.5, "2026-01-02T00:00:00"],
    ["Beta", 3, 2000.25, "2026-02-03T00:00:00"],
  ],
} as unknown as QueryResult;

const valueFields = ["ProjectName", "Units", "NetPrice", "BookingDate"];

function options(overrides: Partial<WidgetFormatOptions>): WidgetFormatOptions {
  return { ...DEFAULT_FORMAT_OPTIONS, ...overrides };
}

describe("TableWidget totals row", () => {
  it("does not render a totals row by default", () => {
    render(<TableWidget title="T" result={result} valueFields={valueFields} format={options({})} />);

    expect(screen.queryByText("Total")).not.toBeInTheDocument();
  });

  it("sums numeric columns when showTotals is on", () => {
    render(<TableWidget title="T" result={result} valueFields={valueFields} format={options({ showTotals: true })} />);

    expect(screen.getByText("Total")).toBeInTheDocument();
    // 2 + 3, formatted as an integer.
    expect(screen.getByText("5")).toBeInTheDocument();
    // 1000.50 + 2000.25, formatted with the default 2 decimals and thousands separator.
    expect(screen.getByText("3,000.75")).toBeInTheDocument();
  });

  // A date total is meaningless — the cell has to stay blank rather than coerce to a number.
  it("leaves non-numeric columns blank in the totals row", () => {
    render(<TableWidget title="T" result={result} valueFields={valueFields} format={options({ showTotals: true })} />);

    const totalCell = screen.getByText("Total");
    const footerRow = totalCell.closest("tr");
    expect(footerRow).not.toBeNull();

    const cells = Array.from(footerRow!.querySelectorAll("td")).map((td) => td.textContent);
    expect(cells).toEqual(["Total", "5", "3,000.75", ""]);
  });

  // An id stored as an int is still an int, so the opt-out has to be the explicit format type.
  it("respects an explicit text format as an opt-out from summing", () => {
    render(
      <TableWidget
        title="T"
        result={result}
        valueFields={valueFields}
        format={options({ showTotals: true, fieldFormats: { Units: { type: "text" } } })}
      />,
    );

    const footerRow = screen.getByText("Total").closest("tr");
    const cells = Array.from(footerRow!.querySelectorAll("td")).map((td) => td.textContent);
    expect(cells).toEqual(["Total", "", "3,000.75", ""]);
  });

  // A total left-aligned under ragged left-aligned numbers reads as belonging to no column at all.
  // Power BI right-aligns a numeric column and its total together.
  it("right-aligns numeric columns in the body and the totals row alike", () => {
    render(<TableWidget title="T" result={result} valueFields={valueFields} format={options({ showTotals: true })} />);

    const footerRow = screen.getByText("Total").closest("tr")!;
    const footerCells = Array.from(footerRow.querySelectorAll("td"));
    // ProjectName and BookingDate are not numeric; Units and NetPrice are.
    expect(footerCells.map((td) => td.classList.contains("MuiTableCell-alignRight")))
      .toEqual([false, true, true, false]);

    const bodyRow = screen.getByText("Alpha").closest("tr")!;
    expect(Array.from(bodyRow.querySelectorAll("td")).map((td) => td.classList.contains("MuiTableCell-alignRight")))
      .toEqual([false, true, true, false]);
  });

  // Anchoring the label at column 0 unconditionally lost it entirely when that column was summed.
  it("labels the totals row in the first column that isn't being summed", () => {
    const numericFirst: QueryResult = {
      columns: [{ name: "Units", nativeType: "int" }, { name: "ProjectName", nativeType: "nvarchar" }],
      rows: [[2, "Alpha"], [3, "Beta"]],
    } as unknown as QueryResult;

    render(
      <TableWidget title="T" result={numericFirst} valueFields={["Units", "ProjectName"]} format={options({ showTotals: true })} />,
    );

    const footerRow = screen.getByText("Total").closest("tr")!;
    expect(Array.from(footerRow.querySelectorAll("td")).map((td) => td.textContent)).toEqual(["5", "Total"]);
  });

  // Summing a ratio column is meaningless: six teams' growth percentages added together gave 45%
  // where Power BI shows 1%. The totals row has to recompute the measure from the column totals.
  it("recomputes a measure in the totals row instead of summing it", () => {
    const growthResult: QueryResult = {
      columns: [
        { name: "Team", nativeType: "nvarchar" },
        { name: "ThisYear", nativeType: "decimal" },
        { name: "LastYear", nativeType: "decimal" },
        { name: "Growth", nativeType: "decimal" },
      ],
      rows: [
        ["Elite", 150, 100, 50],
        ["United", 300, 100, 200],
      ],
    } as unknown as QueryResult;

    render(
      <TableWidget
        title="T"
        result={growthResult}
        valueFields={["Team", "ThisYear", "LastYear", "Growth"]}
        format={options({ showTotals: true })}
        measures={[{ name: "Growth", expression: "DIVIDE([ThisYear] - [LastYear], [LastYear]) * 100" }]}
      />,
    );

    const footerRow = screen.getByText("Total").closest("tr")!;
    const cells = Array.from(footerRow.querySelectorAll("td")).map((td) => td.textContent);
    // Totals are 450 and 200, so growth recomputes to (450-200)/200 = 125%. Summing the column
    // would give 50 + 200 = 250% — deliberately a different number, so this test fails if the old
    // behaviour comes back.
    expect(cells[1]).toBe("450.00");
    expect(cells[2]).toBe("200.00");
    expect(cells[3]).toBe("125.00");
    expect(cells[3]).not.toBe("250.00");
  });

  it("blanks a measure total whose inputs don't total to anything usable", () => {
    const zeroBase: QueryResult = {
      columns: [
        { name: "Team", nativeType: "nvarchar" },
        { name: "ThisYear", nativeType: "decimal" },
        { name: "LastYear", nativeType: "decimal" },
        { name: "Growth", nativeType: "decimal" },
      ],
      rows: [["Ace", 40, 0, 0]],
    } as unknown as QueryResult;

    render(
      <TableWidget
        title="T"
        result={zeroBase}
        valueFields={["Team", "ThisYear", "LastYear", "Growth"]}
        format={options({ showTotals: true })}
        measures={[{ name: "Growth", expression: "DIVIDE([ThisYear] - [LastYear], [LastYear]) * 100" }]}
      />,
    );

    const footerRow = screen.getByText("Total").closest("tr")!;
    expect(Array.from(footerRow.querySelectorAll("td")).map((td) => td.textContent).at(-1)).toBe("");
  });

  it("applies a field's display name to the column header", () => {
    render(
      <TableWidget
        title="T"
        result={result}
        valueFields={valueFields}
        format={options({ fieldFormats: { NetPrice: { displayName: "Target" } } })}
      />,
    );

    expect(screen.getByText("Target")).toBeInTheDocument();
    expect(screen.queryByText("NetPrice")).not.toBeInTheDocument();
  });
});
