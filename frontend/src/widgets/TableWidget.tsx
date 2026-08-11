import type { ReactNode } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { FieldFormat, WidgetFormatOptions } from "../api/widgets";
import DataTable, { type DataTableColumn } from "../components/DataTable";
import { formatFieldValue, getFieldFormat, resolveDisplayName } from "./fieldFormat";
import { shapeTableRows } from "./shaping";

interface ResultRow {
  values: unknown[];
}

// Only quantities are summable. A date or a boolean has no meaningful total, and neither does an
// id that happens to be stored as an int — but "auto" has already been resolved to a concrete type
// by getFieldFormat, so an explicit Text format on an id column opts it out.
function isSummable(format: FieldFormat): boolean {
  return format.type === "decimal" || format.type === "integer";
}

function TableWidget({
  title, result, valueFields, format,
}: {
  title: string;
  result: QueryResult;
  valueFields: string[];
  format?: WidgetFormatOptions;
}) {
  const { columns: columnNames, rows: shapedRows } = shapeTableRows(result, valueFields);
  const columnWidths: Record<string, number> = {};
  const formatByColumn: Record<string, FieldFormat> = {};
  const indexByColumn: Record<string, number> = {};

  const columns: DataTableColumn<ResultRow>[] = columnNames.map((name, colIndex) => {
    const nativeType = result.columns.find((c) => c.name === name)?.nativeType;
    const fieldFormat = getFieldFormat(format, name, nativeType);
    formatByColumn[name] = fieldFormat;
    indexByColumn[name] = colIndex;
    if (fieldFormat.columnWidth !== null) {
      columnWidths[name] = fieldFormat.columnWidth;
    }

    return {
      key: name,
      label: resolveDisplayName(name, fieldFormat),
      // Sorting/searching compares the raw value, not the formatted display string — formatting
      // a number as "1,234.50" would sort lexicographically ("10" < "2"), not numerically.
      value: (row) => {
        const cell = row.values[colIndex];
        return cell === null || cell === undefined ? "" : String(cell);
      },
      render: (row) => {
        const cell = row.values[colIndex];
        return cell === null || cell === undefined ? "" : formatFieldValue(cell, fieldFormat);
      },
    };
  });

  const rows: ResultRow[] = shapedRows.map((values) => ({ values }));

  // Labelled in the leftmost column so the row reads as a total rather than as data; every
  // summable column gets its sum, formatted exactly as its cells are.
  function buildFooter(visible: ResultRow[]): Record<string, ReactNode> {
    const cells: Record<string, ReactNode> = {};
    columnNames.forEach((name, colIndex) => {
      const fieldFormat = formatByColumn[name];
      if (!isSummable(fieldFormat)) {
        cells[name] = colIndex === 0 ? "Total" : "";
        return;
      }
      const sum = visible.reduce((acc, row) => {
        const cell = row.values[indexByColumn[name]];
        const num = typeof cell === "number" ? cell : Number(cell);
        return Number.isNaN(num) ? acc : acc + num;
      }, 0);
      cells[name] = formatFieldValue(sum, fieldFormat);
    });
    return cells;
  }

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => shapedRows.indexOf(row.values)}
        columnWidths={columnWidths}
        rowHeight={format?.rowHeight ?? undefined}
        footer={format?.showTotals ? buildFooter : undefined}
      />
    </Paper>
  );
}

export default TableWidget;
