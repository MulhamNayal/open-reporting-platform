import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import DataTable, { type DataTableColumn } from "../components/DataTable";
import { formatFieldValue, getFieldFormat } from "./fieldFormat";
import { shapeTableRows } from "./shaping";

interface ResultRow {
  values: unknown[];
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

  const columns: DataTableColumn<ResultRow>[] = columnNames.map((name, colIndex) => {
    const nativeType = result.columns.find((c) => c.name === name)?.nativeType;
    const fieldFormat = getFieldFormat(format, name, nativeType);

    return {
      key: name,
      label: name,
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

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <DataTable columns={columns} rows={rows} rowKey={(row) => shapedRows.indexOf(row.values)} />
    </Paper>
  );
}

export default TableWidget;
