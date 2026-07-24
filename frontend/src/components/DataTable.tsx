import { useState } from "react";
import type { ReactNode } from "react";
import {
  Paper, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TableSortLabel, TextField,
  Typography,
} from "@mui/material";

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  value?: (row: T) => string | number;
}

function DataTable<T>({
  columns, rows, rowKey, searchPlaceholder = "Search",
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  searchPlaceholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const searchableColumns = columns.filter((c) => c.value);
  const filtered = search.trim() === ""
    ? rows
    : rows.filter((row) =>
        searchableColumns.some((c) => String(c.value!(row)).toLowerCase().includes(search.trim().toLowerCase())),
      );

  const sortColumn = columns.find((c) => c.key === sortKey);
  const sorted = sortColumn?.value
    ? [...filtered].sort((a, b) => {
        const av = sortColumn.value!(a);
        const bv = sortColumn.value!(b);
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return sortDirection === "asc" ? cmp : -cmp;
      })
    : filtered;

  const paged = sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  function handleHeaderClick(column: DataTableColumn<T>) {
    if (!column.value) {
      return;
    }
    if (sortKey !== column.key) {
      setSortKey(column.key);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortKey(null);
      setSortDirection("asc");
    }
    setPage(0);
  }

  return (
    <div>
      <TextField
        size="small"
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        sx={{ mb: 1 }}
      />
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell key={c.key}>
                  {c.value ? (
                    <TableSortLabel
                      active={sortKey === c.key}
                      direction={sortKey === c.key ? sortDirection : "asc"}
                      onClick={() => handleHeaderClick(c)}
                    >
                      {c.label}
                    </TableSortLabel>
                  ) : (
                    c.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((c) => <TableCell key={c.key}>{c.render(row)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {sorted.length === 0 && (
          <Typography variant="body2" sx={{ p: 2, color: "text.secondary" }}>
            No matching rows.
          </Typography>
        )}
        <TablePagination
          component="div"
          count={sorted.length}
          page={page}
          onPageChange={(_e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={[10, 25, 50]}
        />
      </TableContainer>
    </div>
  );
}

export default DataTable;
