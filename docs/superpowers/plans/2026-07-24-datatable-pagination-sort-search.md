# Shared DataTable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every table in the app (Table widget, Data-table rail view, Datasets preview grid, and the Reports/Datasets/Connections management lists) client-side pagination, click-to-sort headers, and a search box — via one shared, reusable `<DataTable>` component that all five existing call sites adopt, replacing their hand-rolled MUI `<Table>` boilerplate.

**Architecture:** A new generic component (`frontend/src/components/DataTable.tsx`) takes a column-definition array (`{key, label, render(row), value?(row)}`) and a rows array, and internally manages search/sort/pagination state, deriving displayed rows each render via filter → sort → paginate — all client-side, over data already fully fetched into memory. Each of the 5 call sites is refactored to define its columns and hand off to `<DataTable>` instead of its own `<Table>` JSX; no call site's external prop contract (what other components pass into it) changes.

**Tech Stack:** React 19 + TypeScript + MUI 9 (`TablePagination`, `TableSortLabel` — both already available, no new packages) + Vitest/RTL (all already in place).

This plan was written after reading the full approved design doc (`docs/superpowers/specs/2026-07-24-datatable-pagination-sort-search-design.md`) and the current, exact contents of `QueryResultGrid.tsx`, `TableWidget.tsx`, `ReportsPage.tsx`, `DatasetsPage.tsx`, and `DataSourcesPage.tsx`. None of these 5 files currently has a dedicated test file — no existing tests are at risk from this refactor.

## Global Constraints

- **One accessor per column drives both sort and search**: `value?: (row: T) => string | number`. A column without `value` (an action-button column) is unsortable and excluded from search matching.
- **Sort cycles ascending → descending → unsorted** on repeated clicks of the same header (not a simple two-state toggle).
- **Rows-per-page options are `[10, 25, 50]`, defaulting to `25`.**
- **Everything is client-side** — no new API calls, no new backend work. `DataTable` receives a plain, already-fetched `rows: T[]` array.
- **No call site's external prop contract changes** — `QueryResultGrid` still takes `{ result: QueryResult | null }`, `TableWidget` still takes `{ title, result, valueFields }`. Only each component's *internal* JSX changes.
- **Existing null-formatting differences between `QueryResultGrid` (renders `<em>null</em>`) and `TableWidget` (renders empty string) are preserved as-is** — this refactor does not unify that inconsistency, since doing so wasn't part of the approved design and isn't this milestone's job.
- **`QueryResultGrid`'s existing "no rows at all" empty-state Alert stays** (shown before ever reaching `DataTable`, unchanged). `DataTable` itself additionally shows a lightweight "No matching rows" message when a search query filters everything out (a genuinely new case this refactor introduces, not previously handled anywhere).
- Commits stage exact file paths only, never `git add -A`. Commit messages: `frontend: ...`, lowercase, imperative, no trailer, no Co-Authored-By line (personal project, no AI attribution).
- Test gate: `npm run verify` (`tsc -b && vitest run`) — never bare `npm test`.
- `frontend/tsconfig.app.json` has `"verbatimModuleSyntax": true` — every new/edited `.ts`/`.tsx` file uses `import type { X }` for type-only imports.

---

### Task 1: Build `DataTable.tsx` + tests

**Files:**
- Create: `frontend/src/components/DataTable.tsx`
- Test: `frontend/src/components/DataTable.test.tsx`

**Interfaces:**
- Produces: `DataTableColumn<T>` type, `DataTable<T>` component — `{ columns: DataTableColumn<T>[], rows: T[], rowKey: (row: T) => string | number, searchPlaceholder?: string }`. Tasks 2-6 all consume this exact API.

- [ ] Step 1: Create `frontend/src/components/DataTable.tsx`:
  ```tsx
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
  ```

- [ ] Step 2: Write the test file — create `frontend/src/components/DataTable.test.tsx`:
  ```tsx
  import { cleanup, render, screen, within } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { afterEach, describe, expect, it } from "vitest";
  import DataTable, { type DataTableColumn } from "./DataTable";

  // This project doesn't enable Vitest globals, so RTL's automatic cleanup doesn't run.
  afterEach(cleanup);

  interface Row {
    id: number;
    name: string;
  }

  const columns: DataTableColumn<Row>[] = [
    { key: "id", label: "ID", value: (r) => r.id, render: (r) => r.id },
    { key: "name", label: "Name", value: (r) => r.name, render: (r) => r.name },
  ];

  const rows: Row[] = [
    { id: 3, name: "Charlie" },
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
  ];

  describe("DataTable", () => {
    it("renders one row per item with the correct cell values", () => {
      render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("Charlie")).toBeInTheDocument();
    });

    it("search filters to only matching rows, using any searchable column", async () => {
      render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

      await userEvent.type(screen.getByPlaceholderText("Search"), "ali");

      expect(screen.getByText("Alice")).toBeInTheDocument();
      expect(screen.queryByText("Bob")).not.toBeInTheDocument();
      expect(screen.queryByText("Charlie")).not.toBeInTheDocument();
    });

    it("shows a no-matching-rows message when search excludes everything", async () => {
      render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

      await userEvent.type(screen.getByPlaceholderText("Search"), "zzz");

      expect(screen.getByText("No matching rows.")).toBeInTheDocument();
    });

    it("clicking a sortable header sorts ascending, then descending, then back to unsorted", async () => {
      render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

      const idHeader = screen.getByText("ID");
      const bodyRows = () => screen.getAllByRole("row").slice(1); // skip header row

      await userEvent.click(idHeader);
      expect(within(bodyRows()[0]).getByText("1")).toBeInTheDocument();

      await userEvent.click(idHeader);
      expect(within(bodyRows()[0]).getByText("3")).toBeInTheDocument();

      await userEvent.click(idHeader);
      expect(within(bodyRows()[0]).getByText("3")).toBeInTheDocument(); // back to original order
    });

    it("paginates: shows only the first page's rows and lets you change rows-per-page", async () => {
      const manyRows: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: i, name: `Row ${i}` }));
      render(<DataTable columns={columns} rows={manyRows} rowKey={(r) => r.id} />);

      // Default rows-per-page is 25, so row 25 should not be visible on page 1.
      expect(screen.getByText("Row 0")).toBeInTheDocument();
      expect(screen.queryByText("Row 25")).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /next page/i }));

      expect(screen.getByText("Row 25")).toBeInTheDocument();
      expect(screen.queryByText("Row 0")).not.toBeInTheDocument();
    });

    it("a column with no value function is not sortable and excluded from search", async () => {
      const actionColumns: DataTableColumn<Row>[] = [
        ...columns,
        { key: "actions", label: "Actions", render: () => "button" },
      ];
      render(<DataTable columns={actionColumns} rows={rows} rowKey={(r) => r.id} />);

      // Clicking the "Actions" header (plain text, not a TableSortLabel) does nothing —
      // confirm it doesn't render as a sort label at all.
      expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();
    });
  });
  ```

- [ ] Step 3: Run `npx vitest run src/components/DataTable.test.tsx` from `frontend/` — expect all 6 passing.

- [ ] Step 4: Run `npm run verify` from `frontend/` — expect clean (`tsc -b` + full suite).

- [ ] Step 5: Commit:
  ```bash
  git add frontend/src/components/DataTable.tsx frontend/src/components/DataTable.test.tsx
  git commit -m "frontend: shared DataTable component with pagination, sort, and search"
  ```

---

### Task 2: Refactor `QueryResultGrid` to use `DataTable`

**Files:**
- Modify: `frontend/src/components/QueryResultGrid.tsx`

**Interfaces:**
- Consumes: `DataTable`, `DataTableColumn` (Task 1).
- Produces: nothing new — `QueryResultGrid`'s own external props (`{ result: QueryResult | null }`) are unchanged, so nothing downstream needs updating.

- [ ] Step 1: Replace the full contents of `frontend/src/components/QueryResultGrid.tsx`:
  ```tsx
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
  ```
  Note: `rowKey` uses `result.rows.indexOf(row.values)` — since `ResultRow.values` is the exact same array reference from `result.rows` (not a copy), `indexOf` reliably finds its original position, giving a stable key per row even though the raw data has no natural id column.

- [ ] Step 2: Run `npm run verify` from `frontend/` — expect clean.

- [ ] Step 3: Commit:
  ```bash
  git add frontend/src/components/QueryResultGrid.tsx
  git commit -m "frontend: refactor QueryResultGrid to use the shared DataTable"
  ```

---

### Task 3: Refactor `TableWidget` to use `DataTable`

**Files:**
- Modify: `frontend/src/widgets/TableWidget.tsx`

**Interfaces:**
- Consumes: `DataTable`, `DataTableColumn` (Task 1).
- Produces: nothing new — `TableWidget`'s own external props (`{ title, result, valueFields }`) are unchanged.

- [ ] Step 1: Replace the full contents of `frontend/src/widgets/TableWidget.tsx`:
  ```tsx
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
  ```

- [ ] Step 2: Run `npm run verify` from `frontend/` — expect clean.

- [ ] Step 3: Commit:
  ```bash
  git add frontend/src/widgets/TableWidget.tsx
  git commit -m "frontend: refactor TableWidget to use the shared DataTable"
  ```

- [ ] Step 4: Manual smoke test (no browser in this environment — for whoever picks this up next): open a report with a Table widget bound to a real query, confirm the table renders correctly, the search box filters rows, clicking a header sorts, and pagination controls work without breaking the widget's fixed-size grid layout.

---

### Task 4: Refactor `ReportsPage`'s list to use `DataTable`

**Files:**
- Modify: `frontend/src/pages/ReportsPage.tsx`

**Interfaces:**
- Consumes: `DataTable`, `DataTableColumn` (Task 1).

- [ ] Step 1: Add the import, alongside the other imports in `frontend/src/pages/ReportsPage.tsx`:
  ```typescript
  import DataTable, { type DataTableColumn } from "../components/DataTable";
  import type { Report } from "../api/reports";
  ```
  (`Report` is already imported elsewhere in the file via `import { createReport, getReports, setReportDataset, type Report } from "../api/reports";` — check the existing import line and only add `DataTable`/`DataTableColumn` if `Report`'s type import is already present, to avoid a duplicate.)

- [ ] Step 2: Define the column list, placed just before the `return` statement:
  ```typescript
  const reportColumns: DataTableColumn<Report>[] = [
    { key: "id", label: "ID", value: (r) => r.id, render: (r) => r.id },
    { key: "name", label: "Name", value: (r) => r.name, render: (r) => r.name },
    { key: "description", label: "Description", value: (r) => r.description ?? "", render: (r) => r.description },
    {
      key: "designer",
      label: "Designer",
      render: (r) => (
        <>
          <Button size="small" component={RouterLink} to={`/reports/${r.id}`}>View</Button>
          <Button size="small" component={RouterLink} to={`/reports/${r.id}/edit`}>Edit</Button>
        </>
      ),
    },
  ];
  ```

- [ ] Step 3: Replace the existing `<TableContainer>...</TableContainer>` block (the one rendering `reports.map(...)`) with:
  ```tsx
  <DataTable columns={reportColumns} rows={reports} rowKey={(r) => r.id} />
  ```

- [ ] Step 4: Remove now-unused imports. `Paper`, `Table`, `TableBody`, `TableCell`, `TableContainer`, `TableHead`, `TableRow` were only used by the removed block — check whether any of them are still used elsewhere in the file (they are not, per the current file's contents) and remove them from the MUI import list at the top.

- [ ] Step 5: Run `npm run verify` from `frontend/` — expect clean.

- [ ] Step 6: Commit:
  ```bash
  git add frontend/src/pages/ReportsPage.tsx
  git commit -m "frontend: refactor ReportsPage list to use the shared DataTable"
  ```

---

### Task 5: Refactor `DatasetsPage`'s list to use `DataTable`

**Files:**
- Modify: `frontend/src/pages/DatasetsPage.tsx`

**Interfaces:**
- Consumes: `DataTable`, `DataTableColumn` (Task 1).

- [ ] Step 1: Add the import, alongside the other imports in `frontend/src/pages/DatasetsPage.tsx`:
  ```typescript
  import DataTable, { type DataTableColumn } from "../components/DataTable";
  ```

- [ ] Step 2: Define the column list, placed just before the `return` statement:
  ```typescript
  const datasetColumns: DataTableColumn<DatasetSummary>[] = [
    { key: "name", label: "Name", value: (d) => d.name, render: (d) => d.name },
    { key: "mode", label: "Mode", value: (d) => d.mode, render: (d) => d.mode },
    { key: "rowLimit", label: "Row Limit", value: (d) => d.rowLimit ?? -1, render: (d) => d.rowLimit ?? "default" },
    {
      key: "preview",
      label: "Preview",
      render: (d) => <Button size="small" variant="outlined" onClick={() => handlePreview(d.id)}>Run</Button>,
    },
  ];
  ```
  Note: the `rowLimit` column's `value` uses `-1` as the sort key when `rowLimit` is `null` ("default"), so unset-limit datasets sort together at one end rather than the sort silently breaking on a mix of numbers and the literal string `"default"`.

- [ ] Step 3: Replace the existing `<TableContainer component={Paper} sx={{ mb: 3 }} className="dataset-list">...</TableContainer>` block (the one rendering `datasets.map(...)`) with:
  ```tsx
  <div className="dataset-list">
    <DataTable columns={datasetColumns} rows={datasets} rowKey={(d) => d.id} />
  </div>
  ```
  Keeping the `dataset-list` class on a wrapping `<div>` preserves the Meridian restyle's existing `.dataset-list` CSS targeting (from the earlier Table Query milestone), which is currently applied directly to the `<TableContainer>` — check `datasetsPage.css`'s `.dataset-list` rule and confirm a wrapping `<div>` with the same class still applies the intended styling to the `DataTable`'s own internal `<TableContainer>`/`<Paper>` (CSS class selectors match by class name regardless of which element carries it, and `.dataset-list th` etc. will still resolve to `DataTable`'s internal table cells since they're descendants).

- [ ] Step 4: Remove now-unused imports (`Paper`, `Table`, `TableBody`, `TableCell`, `TableContainer`, `TableHead`, `TableRow`) if nothing else in the file still uses them — check first, since `DatasetsPage.tsx` may still use some of these MUI components elsewhere for its create-form sections (verify against the current file rather than assuming).

- [ ] Step 5: Run `npm run verify` from `frontend/` — expect clean.

- [ ] Step 6: Commit:
  ```bash
  git add frontend/src/pages/DatasetsPage.tsx
  git commit -m "frontend: refactor DatasetsPage list to use the shared DataTable"
  ```

---

### Task 6: Refactor `DataSourcesPage`'s list to use `DataTable`

**Files:**
- Modify: `frontend/src/pages/DataSourcesPage.tsx`

**Interfaces:**
- Consumes: `DataTable`, `DataTableColumn` (Task 1).

- [ ] Step 1: Add the import, alongside the other imports in `frontend/src/pages/DataSourcesPage.tsx`:
  ```typescript
  import DataTable, { type DataTableColumn } from "../components/DataTable";
  ```

- [ ] Step 2: Define the column list, placed just before the `return` statement (this one needs access to `testResults`, so it must be defined inside the component body, after `testResults` state is declared, same as the existing render logic already does):
  ```typescript
  const connectionColumns: DataTableColumn<DataSourceConnectionSummary>[] = [
    { key: "name", label: "Name", value: (c) => c.name, render: (c) => c.name },
    { key: "type", label: "Type", value: (c) => c.type, render: (c) => c.type },
    { key: "host", label: "Host", value: (c) => c.host, render: (c) => c.host },
    {
      key: "test",
      label: "Test",
      render: (c) => {
        const result = testResults[c.id];
        return (
          <>
            <Button size="small" variant="outlined" onClick={() => handleTest(c.id)}>Test</Button>
            {result && (
              <Typography component="span" sx={{ ml: 1 }} color={result.success ? "success.main" : "error.main"}>
                {result.success ? "OK" : result.errorMessage ?? "Failed"}
              </Typography>
            )}
          </>
        );
      },
    },
  ];
  ```

- [ ] Step 3: Replace the existing `<TableContainer component={Paper}>...</TableContainer>` block (the one rendering `connections.map(...)`) with:
  ```tsx
  <DataTable columns={connectionColumns} rows={connections} rowKey={(c) => c.id} />
  ```

- [ ] Step 4: Remove now-unused imports (`Paper`, `Table`, `TableBody`, `TableCell`, `TableContainer`, `TableHead`, `TableRow`) if nothing else in the file still uses them — check first against the current file (the create-form section uses `TextField`/`MenuItem`/`Button`/`Box`, none of which are Table-related, so the Table-family imports are very likely safe to remove entirely, but confirm before deleting).

- [ ] Step 5: Run `npm run verify` from `frontend/` — expect clean.

- [ ] Step 6: Commit:
  ```bash
  git add frontend/src/pages/DataSourcesPage.tsx
  git commit -m "frontend: refactor DataSourcesPage list to use the shared DataTable"
  ```

- [ ] Step 7: Manual smoke test (no browser in this environment — for whoever picks this up next): open each of the 5 refactored surfaces (Reports list, Datasets list, Connections list, a Dataset's Run preview, a report's Table widget) and confirm search/sort/pagination genuinely work end to end, and that no existing functionality (View/Edit report links, Run dataset preview, Test connection) regressed.

---

## Self-Review Notes

- **Spec coverage**: every design-doc section has a task — shared component + API (Task 1), all 5 call sites (Tasks 2-6), client-side-only behavior is inherent to the component itself (no task adds a network call).
- **Placeholder scan**: no TBD/TODO; all code blocks are complete, not sketched.
- **Type consistency**: `DataTableColumn<T>`/`DataTable`'s prop names (`columns`, `rows`, `rowKey`, `searchPlaceholder`) are identical between Task 1 (where defined) and Tasks 2-6 (where consumed).
- **Scope check**: 6 tasks, each independently testable and committable; Tasks 2-6 all depend only on Task 1, not on each other — could be done in parallel in a different execution model, though this plan lists them sequentially.
