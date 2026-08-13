import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { FieldFormat, WidgetFormatOptions, WidgetMeasure } from "../api/widgets";
import DataTable, { type DataTableColumn } from "../components/DataTable";
import { POWERBI_TABLE_SX } from "../theme";
import { compileMeasure } from "./measures";
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
  title, result, valueFields, format, columnValues, columnTotals, measures,
}: {
  title: string;
  result: QueryResult;
  valueFields: string[];
  format?: WidgetFormatOptions;
  // Needed by the totals row, which has to RECOMPUTE a measure from the column totals rather than
  // add the measure column up: summing six teams' growth percentages gives 45%, not the 1% Power BI
  // shows. isSummable can't tell a ratio from a quantity — both are decimals — so the widget has to
  // be told which columns are measures.
  measures?: WidgetMeasure[] | null;
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
      // Right-aligns the header, the cells and the total together, with tabular figures so the
      // digits line up in a column. Without this a total sat left-aligned under ragged
      // left-aligned numbers and read as belonging to no column in particular.
      numeric: isSummable(fieldFormat),
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

  // Labelled in the leftmost column that isn't itself being summed, so the row reads as a total
  // rather than as data. Anchoring it at column 0 unconditionally meant a table whose first column
  // is numeric got a total row with no label at all, since the sum overwrote it.
  const labelColumn = columnNames.find((name) => !isSummable(formatByColumn[name])) ?? null;

  const measureByName = new Map((measures ?? []).map((m) => [m.name, m.expression]));

  // Quantities get their sum; measures get recomputed from those sums, which is what makes the
  // totals row agree with Power BI's. Both formatted exactly as their cells are.
  function buildFooter(visible: ResultRow[]): Record<string, ReactNode> {
    const totals: Record<string, number> = {};

    // First pass: total the real quantities. Measures are skipped — adding up a ratio is meaningless
    // and it is the input to the second pass, not an output of this one.
    columnNames.forEach((name) => {
      if (!isSummable(formatByColumn[name]) || measureByName.has(name)) {
        return;
      }
      const serverTotal = serverTotals?.[name];
      totals[name] = serverTotal !== undefined
        ? serverTotal
        : visible.reduce((acc, row) => {
            const cell = row.values[indexByColumn[name]];
            const num = typeof cell === "number" ? cell : Number(cell);
            return Number.isNaN(num) ? acc : acc + num;
          }, 0);
    });

    const cells: Record<string, ReactNode> = {};
    columnNames.forEach((name) => {
      const fieldFormat = formatByColumn[name];

      const expression = measureByName.get(name);
      if (expression !== undefined) {
        // Same blank-rather-than-wrong rule as the rows: a measure whose inputs don't total to
        // anything usable leaves the cell empty instead of showing a number nobody can source.
        let value: number | null = null;
        try {
          value = compileMeasure(expression).evaluate((field) => totals[field]);
        } catch {
          value = null;
        }
        cells[name] = value === null ? "" : formatFieldValue(value, fieldFormat);
        return;
      }

      if (!isSummable(fieldFormat)) {
        cells[name] = name === labelColumn ? (totalsArePartial ? "Total (page)" : "Total") : "";
        return;
      }
      cells[name] = formatFieldValue(totals[name], fieldFormat);
    });
    return cells;
  }

  return (
    // Tighter than the app's default padding: Power BI gives a table visual almost the whole tile,
    // and the roomier chrome was costing two visible rows.
    <Paper sx={{ p: 1, height: "100%" }}>
      {title && (
        <Typography sx={{ fontSize: "12px", fontWeight: 600, mb: 0.5, px: 0.5 }}>{title}</Typography>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => shapedRows.indexOf(row.values)}
        columnWidths={columnWidths}
        rowHeight={format?.rowHeight ?? undefined}
        footer={format?.showTotals ? buildFooter : undefined}
        columnValues={columnValues}
        tableSx={POWERBI_TABLE_SX}
      />
    </Paper>
  );
}

export default TableWidget;
