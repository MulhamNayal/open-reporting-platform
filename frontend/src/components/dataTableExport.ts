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
