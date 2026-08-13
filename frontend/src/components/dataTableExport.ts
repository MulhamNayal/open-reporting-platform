import * as XLSX from "xlsx";
import type { DataTableColumn } from "./DataTable";

export type ExportFormat = "xlsx" | "csv";

export function exportRows<T>(
  columns: DataTableColumn<T>[],
  rows: T[],
  format: ExportFormat,
  fileName: string,
): void {
  const exportableColumns = columns.filter((c) => c.value);
  const header = exportableColumns.map((c) => c.label);
  const data = rows.map((row) => exportableColumns.map((c) => c.value!(row)));

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, `${fileName}.${format}`, { bookType: format });
}

/** One table's worth of already-resolved values: a header row and the rows beneath it. */
export interface ExportSheet {
  name: string;
  header: string[];
  rows: (string | number)[][];
}

/**
 * A whole report in one file — a sheet per table for xlsx.
 *
 * CSV has no concept of multiple sheets, so the sheets are concatenated with a blank line and a
 * title between them. That keeps one download per report either way rather than silently exporting
 * only the first table.
 */
export function exportSheets(sheets: ExportSheet[], format: ExportFormat, fileName: string): void {
  if (sheets.length === 0) {
    return;
  }

  const workbook = XLSX.utils.book_new();

  if (format === "csv") {
    const lines: (string | number)[][] = [];
    sheets.forEach((sheet, index) => {
      if (index > 0) {
        lines.push([]);
      }
      if (sheets.length > 1) {
        lines.push([sheet.name]);
      }
      lines.push(sheet.header, ...sheet.rows);
    });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(lines), "Sheet1");
  } else {
    const used = new Set<string>();
    sheets.forEach((sheet) => {
      // Excel sheet names are capped at 31 characters and have to be unique, so a long widget
      // title is truncated and de-duplicated rather than throwing.
      const base = (sheet.name || "Sheet").replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "Sheet";
      let name = base;
      let suffix = 2;
      while (used.has(name)) {
        name = `${base} ${suffix++}`;
      }
      used.add(name);
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([sheet.header, ...sheet.rows]), name);
    });
  }

  XLSX.writeFile(workbook, `${fileName}.${format}`, { bookType: format });
}
