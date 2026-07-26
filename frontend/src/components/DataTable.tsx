import { useState } from "react";
import type { ReactNode } from "react";
import {
  Button, Checkbox, ClickAwayListener, FormControlLabel, IconButton, Menu, MenuItem, Paper, Popper, Table,
  TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TableSortLabel, TextField, Typography,
} from "@mui/material";
import { exportRows } from "./dataTableExport";

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  value?: (row: T) => string | number;
}

function distinctValues<T>(column: DataTableColumn<T>, rows: T[]): (string | number)[] {
  const seen = new Set<string | number>();
  rows.forEach((row) => {
    if (column.value) {
      seen.add(column.value(row));
    }
  });
  return Array.from(seen).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function DataTable<T>({
  columns, rows, rowKey, searchPlaceholder = "Search", exportFileName = "export",
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  searchPlaceholder?: string;
  exportFileName?: string;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string | number>>>({});
  const [filterMenuColumnKey, setFilterMenuColumnKey] = useState<string | null>(null);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<HTMLElement | null>(null);
  const [filterSearchText, setFilterSearchText] = useState("");
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(null);

  const searchableColumns = columns.filter((c) => c.value);
  const filtered = rows.filter((row) => {
    const matchesSearch = search.trim() === ""
      || searchableColumns.some((c) => String(c.value!(row)).toLowerCase().includes(search.trim().toLowerCase()));
    const matchesColumnFilters = columns.every((c) => {
      const selected = c.value ? columnFilters[c.key] : undefined;
      return !selected || selected.has(c.value!(row));
    });
    return matchesSearch && matchesColumnFilters;
  });

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

  const activeFilterColumn = filterMenuColumnKey ? columns.find((c) => c.key === filterMenuColumnKey) : undefined;
  const activeFilterValues = activeFilterColumn ? distinctValues(activeFilterColumn, rows) : [];
  const visibleFilterValues = activeFilterValues.filter((v) =>
    String(v).toLowerCase().includes(filterSearchText.toLowerCase()),
  );

  function isValueSelected(columnKey: string, value: string | number): boolean {
    const selected = columnFilters[columnKey];
    return selected ? selected.has(value) : true;
  }

  function isColumnFiltered(column: DataTableColumn<T>): boolean {
    const selected = columnFilters[column.key];
    if (!selected) {
      return false;
    }
    return selected.size < distinctValues(column, rows).length;
  }

  function openFilterMenu(column: DataTableColumn<T>, anchor: HTMLElement) {
    setFilterMenuColumnKey(column.key);
    setFilterMenuAnchor(anchor);
    setFilterSearchText("");
  }

  function closeFilterMenu() {
    setFilterMenuColumnKey(null);
    setFilterMenuAnchor(null);
  }

  function toggleFilterValue(column: DataTableColumn<T>, value: string | number) {
    setColumnFilters((prev) => {
      const allValues = distinctValues(column, rows);
      const current = prev[column.key] ?? new Set(allValues);
      const next = new Set(current);
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return { ...prev, [column.key]: next };
    });
    setPage(0);
  }

  function handleExport(format: "xlsx" | "csv") {
    exportRows(columns, sorted, format, exportFileName);
    setExportMenuAnchor(null);
  }

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
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <TextField
          size="small"
          placeholder={searchPlaceholder}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <Button size="small" variant="outlined" onClick={(e) => setExportMenuAnchor(e.currentTarget)}>
          Export
        </Button>
        <Menu anchorEl={exportMenuAnchor} open={Boolean(exportMenuAnchor)} onClose={() => setExportMenuAnchor(null)}>
          <MenuItem onClick={() => handleExport("xlsx")}>Export as Excel (.xlsx)</MenuItem>
          <MenuItem onClick={() => handleExport("csv")}>Export as CSV</MenuItem>
        </Menu>
      </div>
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
                  {c.value && (
                    <IconButton
                      size="small"
                      color={isColumnFiltered(c) ? "primary" : "default"}
                      aria-label={`Filter ${c.label}`}
                      aria-pressed={isColumnFiltered(c)}
                      onClick={(e) => openFilterMenu(c, e.currentTarget)}
                    >
                      <span aria-hidden="true">&#9662;</span>
                    </IconButton>
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
      <Popper open={Boolean(filterMenuAnchor)} anchorEl={filterMenuAnchor} placement="bottom-start" style={{ zIndex: 1300 }}>
        <ClickAwayListener onClickAway={closeFilterMenu}>
          <Paper elevation={4} style={{ padding: 8, minWidth: 200 }}>
            <TextField
              size="small"
              placeholder="Search values"
              value={filterSearchText}
              onChange={(e) => setFilterSearchText(e.target.value)}
              sx={{ mb: 1 }}
              fullWidth
            />
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {visibleFilterValues.map((value) => (
                <FormControlLabel
                  key={String(value)}
                  control={
                    <Checkbox
                      size="small"
                      checked={activeFilterColumn ? isValueSelected(activeFilterColumn.key, value) : false}
                      onChange={() => activeFilterColumn && toggleFilterValue(activeFilterColumn, value)}
                    />
                  }
                  label={String(value)}
                />
              ))}
            </div>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </div>
  );
}

export default DataTable;
