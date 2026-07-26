import { describe, expect, it, vi } from "vitest";
import type { DataTableColumn } from "./DataTable";
import { exportRows } from "./dataTableExport";

const { aoaToSheet, bookNew, bookAppendSheet, writeFile } = vi.hoisted(() => ({
  aoaToSheet: vi.fn(() => ({ mockSheet: true })),
  bookNew: vi.fn(() => ({ mockBook: true })),
  bookAppendSheet: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: aoaToSheet,
    book_new: bookNew,
    book_append_sheet: bookAppendSheet,
  },
  writeFile,
}));

interface Row {
  id: number;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { key: "id", label: "ID", value: (r) => r.id, render: (r) => r.id },
  { key: "name", label: "Name", value: (r) => r.name, render: (r) => r.name },
  { key: "actions", label: "Actions", render: () => "button" },
];

const rows: Row[] = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
];

describe("exportRows", () => {
  it("builds a worksheet with only value-bearing columns as header + data rows", () => {
    exportRows(columns, rows, "xlsx", "my-export");

    expect(aoaToSheet).toHaveBeenCalledWith([
      ["ID", "Name"],
      [1, "Alice"],
      [2, "Bob"],
    ]);
  });

  it("writes the file with the given name and matching book type", () => {
    exportRows(columns, rows, "csv", "my-export");

    expect(writeFile).toHaveBeenCalledWith({ mockBook: true }, "my-export.csv", { bookType: "csv" });
  });
});
