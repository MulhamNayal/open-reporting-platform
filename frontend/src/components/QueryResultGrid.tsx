import { Alert } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import DataTable, { type DataTableColumn } from "./DataTable";

interface ResultRow {
  values: unknown[];
}

function QueryResultGrid({ result }: { result: QueryResult | null }) {
  if (!result) {
    return null;
  }

  if (result.rows.length === 0) {
    return <Alert severity="info">Query ran successfully but returned no rows.</Alert>;
  }

  const columns: DataTableColumn<ResultRow>[] = result.columns.map((c, colIndex) => ({
    key: c.name,
    label: `${c.name} (${c.nativeType})`,
    value: (row) => {
      const cell = row.values[colIndex];
      return cell === null || cell === undefined ? "" : String(cell);
    },
    render: (row) => {
      const cell = row.values[colIndex];
      return cell === null ? <em>null</em> : String(cell);
    },
  }));

  const rows: ResultRow[] = result.rows.map((values) => ({ values }));

  return <DataTable columns={columns} rows={rows} rowKey={(row) => result.rows.indexOf(row.values)} />;
}

export default QueryResultGrid;
