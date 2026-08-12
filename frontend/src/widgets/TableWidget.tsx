import { useEffect, useState } from "react";
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
  title, result, valueFields, format, columnValues, columnTotals,
}: {
  title: string;
  result: QueryResult;
  valueFields: string[];
  format?: WidgetFormatOptions;
  // Passed through to DataTable so a column's filter offers every value in the dataset, not just
  // the ones present in the rows this widget happens to be holding.
  columnValues?: (column: string) => Promise<(string | number)[]>;
  // Set only when this table is server-paged. Adding up the rows on hand would then total the
  // current page rather than the dataset, so the totals row has to come from the source.
  columnTotals?: (fields: string[]) => Promise<Record<string, number>>;
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

  const summableColumns = columnNames.filter((name) => isSummable(formatByColumn[name]));
  const summableKey = summableColumns.join("|");

  // Fetched once per column set. Left null when this table isn't paged, in which case the local
  // sum below is both correct and free.
  const [serverTotals, setServerTotals] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    if (!columnTotals || !format?.showTotals || summableColumns.length === 0) {
      setServerTotals(null);
      return;
    }
    let cancelled = false;
    columnTotals(summableColumns)
      .then((totals) => { if (!cancelled) { setServerTotals(totals); } })
      // A failed lookup falls back to the page sum rather than blanking the row. It understates,
      // so it is labelled as such below.
      .catch(() => { if (!cancelled) { setServerTotals(null); } });
    return () => { cancelled = true; };
    // summableKey stands in for the array identity, which is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columnTotals, format?.showTotals, summableKey]);

  const totalsArePartial = Boolean(columnTotals) && serverTotals === null;

  // Labelled in the leftmost column so the row reads as a total rather than as data; every
  // summable column gets its sum, formatted exactly as its cells are.
  function buildFooter(visible: ResultRow[]): Record<string, ReactNode> {
    const cells: Record<string, ReactNode> = {};
    columnNames.forEach((name, colIndex) => {
      const fieldFormat = formatByColumn[name];
      if (!isSummable(fieldFormat)) {
        cells[name] = colIndex === 0 ? (totalsArePartial ? "Total (page)" : "Total") : "";
        return;
      }
      const serverTotal = serverTotals?.[name];
      const sum = serverTotal !== undefined
        ? serverTotal
        : visible.reduce((acc, row) => {
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
        columnValues={columnValues}
      />
    </Paper>
  );
}

export default TableWidget;
