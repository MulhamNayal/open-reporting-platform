import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import { shapeTableRows } from "./shaping";

function TableWidget({ title, result, valueFields }: { title: string; result: QueryResult; valueFields: string[] }) {
  const { columns, rows } = shapeTableRows(result, valueFields);

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>{columns.map((c) => <TableCell key={c}>{c}</TableCell>)}</TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {row.map((value, j) => <TableCell key={j}>{value === null ? "" : String(value)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}

export default TableWidget;
