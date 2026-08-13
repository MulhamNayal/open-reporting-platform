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
