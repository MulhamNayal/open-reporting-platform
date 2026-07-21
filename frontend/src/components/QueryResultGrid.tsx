import { Alert, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import type { QueryResult } from "../api/datasets";

function QueryResultGrid({ result }: { result: QueryResult | null }) {
  if (!result) {
    return null;
  }

  if (result.rows.length === 0) {
    return <Alert severity="info">Query ran successfully but returned no rows.</Alert>;
  }

  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {result.columns.map((c) => (
              <TableCell key={c.name}>{c.name} <em>({c.nativeType})</em></TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {result.rows.map((row, rowIndex) => (
            <TableRow key={rowIndex}>
              {row.map((value, colIndex) => (
                <TableCell key={colIndex}>{value === null ? <em>null</em> : String(value)}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default QueryResultGrid;
