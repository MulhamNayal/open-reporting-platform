import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import DataTable, { type DataTableColumn } from "../components/DataTable";
import { shapeTableRows } from "./shaping";

interface ResultRow {
  values: unknown[];
}

function TableWidget({ title, result, valueFields }: { title: string; result: QueryResult; valueFields: string[] }) {
  const { columns: columnNames, rows: shapedRows } = shapeTableRows(result, valueFields);

  const columns: DataTableColumn<ResultRow>[] = columnNames.map((name, colIndex) => ({
    key: name,
    label: name,
    value: (row) => {
      const cell = row.values[colIndex];
      return cell === null || cell === undefined ? "" : String(cell);
    },
    render: (row) => {
      const cell = row.values[colIndex];
      return cell === null ? "" : String(cell);
    },
  }));

  const rows: ResultRow[] = shapedRows.map((values) => ({ values }));

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <DataTable columns={columns} rows={rows} rowKey={(row) => shapedRows.indexOf(row.values)} />
    </Paper>
  );
}

export default TableWidget;
