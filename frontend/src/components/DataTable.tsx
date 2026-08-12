import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Box, Button, Checkbox, ClickAwayListener, FormControlLabel, IconButton, Menu, MenuItem, Paper, Popper, Table,
  TableBody, TableCell, TableContainer, TableFooter, TableHead, TableRow, TableSortLabel, TextField, Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { exportRows } from "./dataTableExport";
import DataTablePager from "./DataTablePager";

export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  value?: (row: T) => string | number;
  numeric?: boolean;
}

const MIN_COLUMN_WIDTH = 60;

// Header text has no natural bound until a column is manually resized — a long column name
// (or a narrowed column) previously just got hard-clipped by the table's own overflow with no
// visual indication there was more, or forced the whole table wider until it overflowed its
// container. Ellipsis + a title tooltip degrades gracefully either way. Leaves room for the
// filter icon button next to it.
const DEFAULT_HEADER_LABEL_MAX_WIDTH = 200;
const HEADER_ICON_ALLOWANCE = 34;

// A high-cardinality column (e.g. a near-unique text field) can have thousands of distinct
// values. Mounting a real Checkbox + FormControlLabel per value made the popover itself the
// bottleneck — not the filtering logic — since React has to render/reconcile every one of them
// on each interaction. Capping what's actually rendered keeps the popover responsive regardless
// of how large the underlying column's distinct-value count is; "Select all" still applies to
// the full search-narrowed set, not just the rendered slice.
const MAX_RENDERED_FILTER_VALUES = 200;

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
  columns, rows, rowKey, searchPlaceholder = "Search", exportFileName = "export", columnWidths: presetColumnWidths, rowHeight,
  footer, columnValues, tableSx,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  searchPlaceholder?: string;
  exportFileName?: string;
  // Persisted per-column widths (e.g. from a widget's saved format) — the starting point for
  // each column's width. A manual in-session drag (below) overrides this for that column only,
  // but never writes back to it; persisting a drag is a separate, explicit "save" action.
  columnWidths?: Record<string, number>;
  rowHeight?: number;
  // Optional summary row, keyed by column key; columns without an entry render blank. Called with
  // the filtered+sorted rows across every page, not just the visible one, so a total reflects the
  // active search/column filters the way a spreadsheet's would. Taking a callback rather than a
  // ready-made record is what keeps this component ignorant of what's being aggregated — it never
  // needs to know which columns are numeric or how they should be summarised.
  footer?: (rows: T[]) => Record<string, ReactNode>;
  // Supplies a column's full set of distinct values. Without it the filter checklist is built from
  // the rows this component happens to hold — which for a server-paged table is one page, so the
  // list silently omits everything not on screen. Callers that can ask the source for the real
  // distinct values pass this instead.
  columnValues?: (columnKey: string) => Promise<(string | number)[]>;
  // Styling for the table itself, so a report widget can adopt the Power BI look without this
  // component knowing anything about Power BI. Management pages leave it unset.
  tableSx?: SxProps<Theme>;
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
  const [manualColumnWidths, setManualColumnWidths] = useState<Record<string, number>>({});
  const [fetchedColumnValues, setFetchedColumnValues] = useState<Record<string, (string | number)[]>>({});
  const [loadingColumnValues, setLoadingColumnValues] = useState(false);
  const headerCellRefs = useRef<Record<string, HTMLTableCellElement | null>>({});

  function effectiveWidth(columnKey: string): number | undefined {
    const width = manualColumnWidths[columnKey] ?? presetColumnWidths?.[columnKey];
    return width ? Math.max(MIN_COLUMN_WIDTH, width) : undefined;
  }

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

  const footerCells = footer ? footer(sorted) : null;

  // Distinct values only depend on rows/columns, not on the filter/search/sort/page state
  // that changes on every keystroke or checkbox click — memoized so those interactions don't
  // re-scan every filterable column's full row set on every render.
  const distinctValuesByColumn = useMemo(() => {
    const map = new Map<string, (string | number)[]>();
    columns.forEach((column) => {
      if (column.value) {
        map.set(column.key, distinctValues(column, rows));
      }
    });
    return map;
  }, [columns, rows]);

  // Server-supplied values win once they arrive; until then the locally-derived set keeps the
  // checklist populated rather than showing an empty menu.
  function distinctValuesFor(column: DataTableColumn<T>): (string | number)[] {
    return fetchedColumnValues[column.key] ?? distinctValuesByColumn.get(column.key) ?? [];
  }

  const activeFilterColumn = filterMenuColumnKey ? columns.find((c) => c.key === filterMenuColumnKey) : undefined;
  const activeFilterValues = activeFilterColumn ? distinctValuesFor(activeFilterColumn) : [];
  const visibleFilterValues = activeFilterValues.filter((v) =>
    String(v).toLowerCase().includes(filterSearchText.toLowerCase()),
  );
  const renderedFilterValues = visibleFilterValues.slice(0, MAX_RENDERED_FILTER_VALUES);
  const hiddenFilterValueCount = visibleFilterValues.length - renderedFilterValues.length;
  const allVisibleFilterValuesSelected = activeFilterColumn
    ? visibleFilterValues.length > 0 && visibleFilterValues.every((v) => isValueSelected(activeFilterColumn.key, v))
    : false;
  const someVisibleFilterValuesSelected = activeFilterColumn
    ? visibleFilterValues.some((v) => isValueSelected(activeFilterColumn.key, v))
    : false;

  function isValueSelected(columnKey: string, value: string | number): boolean {
    const selected = columnFilters[columnKey];
    return selected ? selected.has(value) : true;
  }

  function isColumnFiltered(column: DataTableColumn<T>): boolean {
    const selected = columnFilters[column.key];
    if (!selected) {
      return false;
    }
    return selected.size < distinctValuesFor(column).length;
  }

  function openFilterMenu(column: DataTableColumn<T>, anchor: HTMLElement) {
    setFilterMenuColumnKey(column.key);
    setFilterMenuAnchor(anchor);
    setFilterSearchText("");

    // Fetched once per column per mount — the distinct set doesn't change as the user pages around,
    // and refetching on every menu open would make the filter feel sluggish.
    if (columnValues && !fetchedColumnValues[column.key]) {
      setLoadingColumnValues(true);
      columnValues(column.key)
        .then((values) => setFetchedColumnValues((prev) => ({ ...prev, [column.key]: values })))
        .catch(() => {
          // Leave the locally-derived list in place; a failed lookup must not empty the filter.
        })
        .finally(() => setLoadingColumnValues(false));
    }
  }

  function closeFilterMenu() {
    setFilterMenuColumnKey(null);
    setFilterMenuAnchor(null);
  }

  function toggleFilterValue(column: DataTableColumn<T>, value: string | number) {
    setColumnFilters((prev) => {
      const allValues = distinctValuesFor(column);
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

  // Only touches the given values (the currently search-narrowed checklist), leaving any
  // value hidden by that search untouched — same "Select All applies to what's visible" behaviour as Excel.
  function setFilterValues(column: DataTableColumn<T>, values: (string | number)[], selected: boolean) {
    setColumnFilters((prev) => {
      const allValues = distinctValuesFor(column);
      const current = prev[column.key] ?? new Set(allValues);
      const next = new Set(current);
      values.forEach((v) => (selected ? next.add(v) : next.delete(v)));
      return { ...prev, [column.key]: next };
    });
    setPage(0);
  }

  function handleExport(format: "xlsx" | "csv") {
    exportRows(columns, sorted, format, exportFileName);
    setExportMenuAnchor(null);
  }

  function startColumnResize(columnKey: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = effectiveWidth(columnKey) ?? headerCellRefs.current[columnKey]?.getBoundingClientRect().width
      ?? MIN_COLUMN_WIDTH;

    function handleMouseMove(moveEvent: MouseEvent) {
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, Math.round(startWidth + (moveEvent.clientX - startX)));
      setManualColumnWidths((prev) => ({ ...prev, [columnKey]: nextWidth }));
    }

    function handleMouseUp() {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
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
        <Table size="small" sx={tableSx}>
          <TableHead>
            <TableRow>
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  ref={(el: HTMLTableCellElement | null) => { headerCellRefs.current[c.key] = el; }}
                  align={c.numeric ? "right" : undefined}
                  style={effectiveWidth(c.key) ? { width: effectiveWidth(c.key), maxWidth: effectiveWidth(c.key) } : undefined}
                >
                  {c.value ? (
                    <TableSortLabel
                      active={sortKey === c.key}
                      direction={sortKey === c.key ? sortDirection : "asc"}
                      onClick={() => handleHeaderClick(c)}
                    >
                      <span
                        title={c.label}
                        style={{
                          display: "inline-block",
                          maxWidth: effectiveWidth(c.key) ? effectiveWidth(c.key)! - HEADER_ICON_ALLOWANCE : DEFAULT_HEADER_LABEL_MAX_WIDTH,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          verticalAlign: "bottom",
                        }}
                      >
                        {c.label}
                      </span>
                    </TableSortLabel>
                  ) : (
                    <span
                      title={c.label}
                      style={{
                        display: "inline-block",
                        maxWidth: effectiveWidth(c.key) ? effectiveWidth(c.key)! - HEADER_ICON_ALLOWANCE : DEFAULT_HEADER_LABEL_MAX_WIDTH,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        verticalAlign: "bottom",
                      }}
                    >
                      {c.label}
                    </span>
                  )}
                  {c.value && (
                    <IconButton
                      color={isColumnFiltered(c) ? "primary" : "default"}
                      aria-label={`Filter ${c.label}`}
                      aria-pressed={isColumnFiltered(c)}
                      onClick={(e) => openFilterMenu(c, e.currentTarget)}
                      // A default IconButton is 34px tall and forces the header row to match it,
                      // which is most of why the header looked oversized next to Power BI's. Sized
                      // to the text instead, and kept on the same line as the label.
                      sx={{
                        p: 0,
                        ml: 0.25,
                        fontSize: "0.7em",
                        lineHeight: 1,
                        verticalAlign: "middle",
                        color: isColumnFiltered(c) ? undefined : "text.disabled",
                      }}
                    >
                      <span aria-hidden="true">&#9662;</span>
                    </IconButton>
                  )}
                  <Box
                    component="span"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${c.label} column`}
                    onMouseDown={(e) => startColumnResize(c.key, e)}
                    sx={{
                      position: "absolute",
                      right: 0,
                      top: 0,
                      bottom: 0,
                      width: 10,
                      cursor: "col-resize",
                      userSelect: "none",
                      zIndex: 1,
                      "&:hover, &:active": { backgroundColor: "rgba(91, 79, 230, 0.35)" },
                    }}
                  />
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paged.map((row) => (
              <TableRow key={rowKey(row)} style={rowHeight ? { height: rowHeight } : undefined}>
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    align={c.numeric ? "right" : undefined}
                    sx={c.numeric ? { fontVariantNumeric: "tabular-nums" } : undefined}
                    style={effectiveWidth(c.key) ? {
                      width: effectiveWidth(c.key),
                      maxWidth: effectiveWidth(c.key),
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    } : undefined}
                  >
                    {c.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          {footerCells && (
            <TableFooter>
              <TableRow>
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    align={c.numeric ? "right" : undefined}
                    sx={{
                      fontWeight: 600,
                      color: "text.primary",
                      borderTop: 2,
                      borderTopColor: "divider",
                      ...(c.numeric ? { fontVariantNumeric: "tabular-nums" } : {}),
                    }}
                    style={effectiveWidth(c.key) ? { width: effectiveWidth(c.key), maxWidth: effectiveWidth(c.key) } : undefined}
                  >
                    {footerCells[c.key] ?? ""}
                  </TableCell>
                ))}
              </TableRow>
            </TableFooter>
          )}
        </Table>
        {sorted.length === 0 && (
          <Typography variant="body2" sx={{ p: 2, color: "text.secondary" }}>
            No matching rows.
          </Typography>
        )}
        <DataTablePager
          page={page}
          rowsPerPage={rowsPerPage}
          totalRows={sorted.length}
          onPageChange={setPage}
          onRowsPerPageChange={(n) => { setRowsPerPage(n); setPage(0); }}
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
            <FormControlLabel
              sx={{ display: "flex", width: "100%", m: 0, borderBottom: "1px solid #eef0f4", mb: 0.5, pb: 0.5 }}
              control={
                <Checkbox
                  size="small"
                  checked={allVisibleFilterValuesSelected}
                  indeterminate={someVisibleFilterValuesSelected && !allVisibleFilterValuesSelected}
                  onChange={(e) => activeFilterColumn && setFilterValues(activeFilterColumn, visibleFilterValues, e.target.checked)}
                />
              }
              label="Select all"
            />
            {loadingColumnValues && (
              <Typography variant="caption" sx={{ color: "text.secondary", px: 1 }}>
                Loading all values…
              </Typography>
            )}
            <div style={{ display: "flex", flexDirection: "column", maxHeight: 200, overflowY: "auto" }}>
              {renderedFilterValues.map((value) => (
                <FormControlLabel
                  key={String(value)}
                  sx={{ display: "flex", width: "100%", m: 0 }}
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
              {hiddenFilterValueCount > 0 && (
                <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, px: 1 }}>
                  Showing {renderedFilterValues.length} of {visibleFilterValues.length} — type to narrow further
                </Typography>
              )}
            </div>
          </Paper>
        </ClickAwayListener>
      </Popper>
    </div>
  );
}

export default DataTable;
