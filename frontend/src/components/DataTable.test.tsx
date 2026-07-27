import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import DataTable, { type DataTableColumn } from "./DataTable";
import { exportRows } from "./dataTableExport";

vi.mock("./dataTableExport", () => ({ exportRows: vi.fn() }));

// This project doesn't enable Vitest globals, so RTL's automatic cleanup doesn't run.
afterEach(cleanup);

interface Row {
  id: number;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { key: "id", label: "ID", value: (r) => r.id, render: (r) => r.id },
  { key: "name", label: "Name", value: (r) => r.name, render: (r) => r.name },
];

const rows: Row[] = [
  { id: 3, name: "Charlie" },
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
];

describe("DataTable", () => {
  it("renders one row per item with the correct cell values", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("search filters to only matching rows, using any searchable column", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    await userEvent.type(screen.getByPlaceholderText("Search"), "ali");

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
  });

  it("shows a no-matching-rows message when search excludes everything", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    await userEvent.type(screen.getByPlaceholderText("Search"), "zzz");

    expect(screen.getByText("No matching rows.")).toBeInTheDocument();
  });

  it("clicking a sortable header sorts ascending, then descending, then back to unsorted", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    const idHeader = screen.getByText("ID");
    const bodyRows = () => screen.getAllByRole("row").slice(1); // skip header row

    await userEvent.click(idHeader);
    expect(within(bodyRows()[0]).getByText("1")).toBeInTheDocument();

    await userEvent.click(idHeader);
    expect(within(bodyRows()[0]).getByText("3")).toBeInTheDocument();

    await userEvent.click(idHeader);
    expect(within(bodyRows()[0]).getByText("3")).toBeInTheDocument(); // back to original order
  });

  it("paginates: shows only the first page's rows and lets you change rows-per-page", async () => {
    const manyRows: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: i, name: `Row ${i}` }));
    render(<DataTable columns={columns} rows={manyRows} rowKey={(r) => r.id} />);

    // Default rows-per-page is 25, so row 25 should not be visible on page 1.
    expect(screen.getByText("Row 0")).toBeInTheDocument();
    expect(screen.queryByText("Row 25")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /next page/i }));

    expect(screen.getByText("Row 25")).toBeInTheDocument();
    expect(screen.queryByText("Row 0")).not.toBeInTheDocument();
  });

  it("changing rows-per-page resets pagination to the first page", async () => {
    const manyRows: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: i, name: `Row ${i}` }));
    render(<DataTable columns={columns} rows={manyRows} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByRole("button", { name: /previous page/i })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "10 rows per page" }));

    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
  });

  it("a column with no value function is not sortable and excluded from search", async () => {
    const actionColumns: DataTableColumn<Row>[] = [
      ...columns,
      { key: "actions", label: "Actions", render: () => "button" },
    ];
    render(<DataTable columns={actionColumns} rows={rows} rowKey={(r) => r.id} />);

    // Clicking the "Actions" header (plain text, not a TableSortLabel) does nothing —
    // confirm it doesn't render as a sort label at all.
    expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Filter Actions" })).not.toBeInTheDocument();
  });

  it("a column filter checklist narrows rows to only the checked values", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));

    expect(within(table).getByText("Alice")).toBeInTheDocument();
    expect(within(table).queryByText("Bob")).not.toBeInTheDocument();
    expect(within(table).getByText("Charlie")).toBeInTheDocument();
  });

  it("the filter popover's search box narrows the checklist of values", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.type(screen.getByPlaceholderText("Search values"), "ali");

    expect(screen.getByRole("checkbox", { name: "Alice" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Bob" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Charlie" })).not.toBeInTheDocument();
  });

  it("a column filter combines with the global search box (AND)", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Alice" }));

    await userEvent.type(screen.getByPlaceholderText("Search"), "charlie");

    expect(within(table).queryByText("Alice")).not.toBeInTheDocument();
    expect(within(table).queryByText("Bob")).not.toBeInTheDocument();
    expect(within(table).getByText("Charlie")).toBeInTheDocument();
  });

  it("re-checking a value in the filter restores its rows", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));
    expect(within(table).queryByText("Bob")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));
    expect(within(table).getByText("Bob")).toBeInTheDocument();
  });

  it("changing a column filter resets pagination to the first page", async () => {
    const manyRows: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: i, name: `Row ${i}` }));
    render(<DataTable columns={columns} rows={manyRows} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByRole("button", { name: /previous page/i })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Row 0" }));

    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
  });

  it("the filter icon shows an active state only while a filter narrows that column", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    const filterButton = screen.getByRole("button", { name: "Filter Name" });
    expect(filterButton).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(filterButton);
    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));

    expect(filterButton).toHaveAttribute("aria-pressed", "true");
  });

  it("unchecking 'Select all' in the filter popover hides every row for that column", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    expect(screen.getByRole("checkbox", { name: "Select all" })).toBeChecked();

    await userEvent.click(screen.getByRole("checkbox", { name: "Select all" }));

    expect(within(table).queryByText("Alice")).not.toBeInTheDocument();
    expect(within(table).queryByText("Bob")).not.toBeInTheDocument();
    expect(within(table).queryByText("Charlie")).not.toBeInTheDocument();
  });

  it("re-checking 'Select all' after unchecking one value restores every row", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));
    expect(screen.getByRole("checkbox", { name: "Select all" })).not.toBeChecked();

    await userEvent.click(screen.getByRole("checkbox", { name: "Select all" }));

    expect(within(table).getByText("Alice")).toBeInTheDocument();
    expect(within(table).getByText("Bob")).toBeInTheDocument();
    expect(within(table).getByText("Charlie")).toBeInTheDocument();
  });

  it("'Select all' only affects values narrowed by the value-search box, leaving others untouched", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const table = screen.getByRole("table");

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Charlie" }));
    expect(within(table).getByText("Alice")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Search values"), "char");
    await userEvent.click(screen.getByRole("checkbox", { name: "Select all" }));

    expect(within(table).getByText("Alice")).toBeInTheDocument();
    expect(within(table).getByText("Charlie")).toBeInTheDocument();
    expect(within(table).queryByText("Bob")).not.toBeInTheDocument();
  });

  it("exporting as Excel calls exportRows with the current filtered/sorted rows and value-bearing columns", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} exportFileName="my-file" />);

    await userEvent.type(screen.getByPlaceholderText("Search"), "ali");
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Export as Excel (.xlsx)" }));

    expect(exportRows).toHaveBeenCalledWith(columns, [rows[1]], "xlsx", "my-file");
  });

  it("defaults the export file name to 'export' when not provided", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Export as CSV" }));

    expect(exportRows).toHaveBeenCalledWith(columns, rows, "csv", "export");
  });

  it("export respects an active column filter, not just search", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));

    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Export as Excel (.xlsx)" }));

    expect(exportRows).toHaveBeenCalledWith(columns, [rows[0], rows[1]], "xlsx", "export");
  });

  it("dragging a column's resize handle sets an explicit pixel width on that column's cells", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    const handle = screen.getByRole("separator", { name: "Resize Name column" });
    fireEvent.mouseDown(handle, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 160 });
    fireEvent.mouseUp(window);

    const nameHeaderCell = screen.getByText("Name").closest("th");
    expect(nameHeaderCell).toHaveStyle({ width: "60px" });
  });

  it("a column marked numeric right-aligns its header and body cells", () => {
    const numericColumns: DataTableColumn<Row>[] = [
      columns[0],
      { ...columns[1] },
      { key: "score", label: "Score", value: () => 0, render: () => "9.5", numeric: true },
    ];
    render(<DataTable columns={numericColumns} rows={rows} rowKey={(r) => r.id} />);

    const scoreHeaderCell = screen.getByText("Score").closest("th");
    expect(scoreHeaderCell).toHaveClass("MuiTableCell-alignRight");
  });
});
