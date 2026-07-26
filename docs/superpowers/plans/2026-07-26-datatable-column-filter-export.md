# DataTable Column Filtering & Excel/CSV Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-column distinct-value filter (Excel/Power BI-style checklist with a mini search box) and one-click Excel/CSV export to the shared `DataTable` component, so all 5 existing call sites gain both features automatically with no changes to their own code.

**Architecture:** Both features extend `frontend/src/components/DataTable.tsx` in place. Filtering reuses the existing `value` accessor on `DataTableColumn<T>` (no interface change). Export is a small, independently-testable pure function in a new file (`dataTableExport.ts`) that `DataTable` calls with its already filtered/sorted rows.

**Tech Stack:** React 19 + TypeScript (`verbatimModuleSyntax: true`), MUI 9 (`Popover`, `Menu`, `Checkbox`, `FormControlLabel`, `Button`, `IconButton` — no icon library is installed in this project; use plain text/unicode glyphs, not `@mui/icons-material`), `xlsx` (SheetJS) for Excel/CSV writing, Vitest + React Testing Library.

## Global Constraints

- `verbatimModuleSyntax: true` — every type-only import must use `import type { X }` (see existing `DataTable.test.tsx:4` for the mixed-import pattern: `import DataTable, { type DataTableColumn } from "./DataTable";`).
- Test gate: `npm run verify` (= `tsc -b && vitest run`) from `frontend/`, run at the end of every task. Never use bare `npm test` — this project has been bitten before by `tsc -b` failures that `npm test` alone misses.
- Commits: `frontend: ...`, lowercase, imperative, **no** AI attribution / Co-Authored-By line (personal project convention).
- No change to the `DataTableColumn<T>` interface — filtering and export both key off the existing `value`/`render` fields only. A column without `value` gets no filter icon and is excluded from export, exactly as it's already excluded from search and sort.
- Column filters do **not** cascade — each column's checklist always reflects the full, unfiltered `rows` prop's distinct values for that column, never narrowed by other active filters.
- A column filter starts with every distinct value checked (unfiltered); unchecking a value is what activates filtering.
- Export includes the current search + column-filter + sort result, but ignores pagination (exports every matching row, not just the visible page), and only columns with a `value` accessor (action columns are omitted).
- No `@mui/icons-material` dependency — this project doesn't have it installed (confirmed via `frontend/package.json`); use text buttons and a unicode glyph (`▾`) for the filter affordance, consistent with existing UI (`Button` with text labels like "Run"/"Test"/"View" elsewhere in the app).

---

### Task 1: Export utility (`dataTableExport.ts`) + `xlsx` dependency

**Files:**
- Modify: `frontend/package.json` (add `xlsx` dependency)
- Create: `frontend/src/components/dataTableExport.ts`
- Test: `frontend/src/components/dataTableExport.test.ts`

**Interfaces:**
- Consumes: `DataTableColumn<T>` (existing, from `./DataTable`).
- Produces: `exportRows<T>(columns: DataTableColumn<T>[], rows: T[], format: "xlsx" | "csv", fileName: string): void` — Task 3 calls this from inside `DataTable`.

- [ ] **Step 1: Install the `xlsx` dependency**

Run from `frontend/`:
```bash
npm install xlsx@^0.18.5
```
Expected: `frontend/package.json` gains `"xlsx": "^0.18.5"` under `dependencies`, and `frontend/package-lock.json` updates.

- [ ] **Step 2: Write the failing test**

Create `frontend/src/components/dataTableExport.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import type { DataTableColumn } from "./DataTable";
import { exportRows } from "./dataTableExport";

const { aoaToSheet, bookNew, bookAppendSheet, writeFile } = vi.hoisted(() => ({
  aoaToSheet: vi.fn(() => ({ mockSheet: true })),
  bookNew: vi.fn(() => ({ mockBook: true })),
  bookAppendSheet: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("xlsx", () => ({
  utils: {
    aoa_to_sheet: aoaToSheet,
    book_new: bookNew,
    book_append_sheet: bookAppendSheet,
  },
  writeFile,
}));

interface Row {
  id: number;
  name: string;
}

const columns: DataTableColumn<Row>[] = [
  { key: "id", label: "ID", value: (r) => r.id, render: (r) => r.id },
  { key: "name", label: "Name", value: (r) => r.name, render: (r) => r.name },
  { key: "actions", label: "Actions", render: () => "button" },
];

const rows: Row[] = [
  { id: 1, name: "Alice" },
  { id: 2, name: "Bob" },
];

describe("exportRows", () => {
  it("builds a worksheet with only value-bearing columns as header + data rows", () => {
    exportRows(columns, rows, "xlsx", "my-export");

    expect(aoaToSheet).toHaveBeenCalledWith([
      ["ID", "Name"],
      [1, "Alice"],
      [2, "Bob"],
    ]);
  });

  it("writes the file with the given name and matching book type", () => {
    exportRows(columns, rows, "csv", "my-export");

    expect(writeFile).toHaveBeenCalledWith({ mockBook: true }, "my-export.csv", { bookType: "csv" });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/dataTableExport.test.ts`
Expected: FAIL — `Cannot find module './dataTableExport'` (the module doesn't exist yet).

- [ ] **Step 4: Implement `dataTableExport.ts`**

Create `frontend/src/components/dataTableExport.ts`:

```typescript
import * as XLSX from "xlsx";
import type { DataTableColumn } from "./DataTable";

export type ExportFormat = "xlsx" | "csv";

export function exportRows<T>(
  columns: DataTableColumn<T>[],
  rows: T[],
  format: ExportFormat,
  fileName: string,
): void {
  const exportableColumns = columns.filter((c) => c.value);
  const header = exportableColumns.map((c) => c.label);
  const data = rows.map((row) => exportableColumns.map((c) => c.value!(row)));

  const worksheet = XLSX.utils.aoa_to_sheet([header, ...data]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
  XLSX.writeFile(workbook, `${fileName}.${format}`, { bookType: format });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/components/dataTableExport.test.ts`
Expected: PASS (2/2).

- [ ] **Step 6: Run the full verify gate**

Run: `cd frontend && npm run verify`
Expected: PASS — `tsc -b` clean (confirms `xlsx`'s bundled types resolve correctly) and all existing + new tests pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/dataTableExport.ts frontend/src/components/dataTableExport.test.ts
git commit -m "frontend: add value-column export utility (xlsx/csv)"
```

---

### Task 2: Per-column filter checklist in `DataTable`

**Files:**
- Modify: `frontend/src/components/DataTable.tsx`
- Test: `frontend/src/components/DataTable.test.tsx`

**Interfaces:**
- Consumes: nothing new from Task 1 — this task only touches `DataTable.tsx`'s own filtering/rendering logic.
- Produces: the `filtered`/`sorted` variables inside `DataTable` now also reflect active column filters (same variable names as before this task — Task 3 reads `sorted` after this task's change, expecting it to already include column-filter results). No new exported symbols.

This task assumes `frontend/src/components/DataTable.tsx` is exactly as it exists today (before this task): a component with `search`/`sortKey`/`sortDirection`/`page`/`rowsPerPage` state, a `filtered` variable computed via a `search === "" ? rows : rows.filter(...)` ternary, a `sorted` variable derived from `filtered`, and a header row built from `columns.map(...)` with a `TableSortLabel` per sortable column.

- [ ] **Step 1: Write the failing tests**

Open `frontend/src/components/DataTable.test.tsx`. First, add one assertion to the existing last test (`"a column with no value function is not sortable and excluded from search"`) confirming the new filter icon also respects the same `value`-gating — add this line right after the existing `expect(screen.queryByRole("button", { name: "Actions" })).not.toBeInTheDocument();` line, inside the same `it(...)` block:

```typescript
    expect(screen.queryByRole("button", { name: "Filter Actions" })).not.toBeInTheDocument();
```

Then add these 6 new `it(...)` blocks inside the existing `describe("DataTable", ...)` block, after the last test:

```typescript
  it("a column filter checklist narrows rows to only the checked values", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("the filter popover's search box narrows the checklist of values", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.type(screen.getByPlaceholderText("Search values"), "ali");

    expect(screen.getByRole("checkbox", { name: "Alice" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Bob" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Charlie" })).not.toBeInTheDocument();
  });

  it("a column filter combines with the global search box (AND)", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Alice" }));

    await userEvent.type(screen.getByPlaceholderText("Search"), "charlie");

    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
    expect(screen.getByText("Charlie")).toBeInTheDocument();
  });

  it("re-checking a value in the filter restores its rows", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("changing a column filter resets pagination to the first page", async () => {
    const manyRows: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: i, name: `Row ${i}` }));
    render(<DataTable columns={columns} rows={manyRows} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByRole("button", { name: /previous page/i })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Row 0" }));

    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
  });

  it("the filter icon shows an active state only while a filter narrows that column", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    const filterButton = screen.getByRole("button", { name: "Filter Name" });
    expect(filterButton).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(filterButton);
    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));

    expect(filterButton).toHaveAttribute("aria-pressed", "true");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/DataTable.test.tsx`
Expected: FAIL — no element with role `button`/name `"Filter Name"` exists yet (the filter icon isn't implemented).

- [ ] **Step 3: Implement column filtering**

In `frontend/src/components/DataTable.tsx`:

Update the `@mui/material` import to add `Checkbox`, `FormControlLabel`, `IconButton`, `Popover`:

```typescript
import {
  Checkbox, FormControlLabel, IconButton, Paper, Popover, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TableSortLabel, TextField, Typography,
} from "@mui/material";
```

Add this generic helper function above the `DataTable` component (after the `DataTableColumn` interface, before `function DataTable<T>(...)`):

```typescript
function distinctValues<T>(column: DataTableColumn<T>, rows: T[]): (string | number)[] {
  const seen = new Set<string | number>();
  rows.forEach((row) => {
    if (column.value) {
      seen.add(column.value(row));
    }
  });
  return Array.from(seen).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
```

Inside the `DataTable` component, add new state right after the existing `rowsPerPage` state declaration:

```typescript
  const [columnFilters, setColumnFilters] = useState<Record<string, Set<string | number>>>({});
  const [filterMenuColumnKey, setFilterMenuColumnKey] = useState<string | null>(null);
  const [filterMenuAnchor, setFilterMenuAnchor] = useState<HTMLElement | null>(null);
  const [filterSearchText, setFilterSearchText] = useState("");
```

Replace the existing `filtered` computation (the `search.trim() === "" ? rows : rows.filter(...)` block) with:

```typescript
  const filtered = rows.filter((row) => {
    const matchesSearch = search.trim() === ""
      || searchableColumns.some((c) => String(c.value!(row)).toLowerCase().includes(search.trim().toLowerCase()));
    const matchesColumnFilters = columns.every((c) => {
      const selected = c.value ? columnFilters[c.key] : undefined;
      return !selected || selected.has(c.value!(row));
    });
    return matchesSearch && matchesColumnFilters;
  });
```

(`searchableColumns` above it is unchanged — it's still `columns.filter((c) => c.value)`, already defined just before this block.)

Right after the existing `paged` computation, add:

```typescript
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
```

Replace the header cell's JSX (inside the `columns.map((c) => (...))` in `TableHead`) — currently:
```tsx
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
```
with:
```tsx
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
```

Finally, add the filter `Popover` right after the closing `</TableContainer>` tag (still inside the outer `<div>`):

```tsx
      <Popover open={Boolean(filterMenuAnchor)} anchorEl={filterMenuAnchor} onClose={closeFilterMenu}>
        <div style={{ padding: 8, minWidth: 200 }}>
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
        </div>
      </Popover>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/DataTable.test.tsx`
Expected: PASS — all tests, old and new.

- [ ] **Step 5: Run the full verify gate**

Run: `cd frontend && npm run verify`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DataTable.tsx frontend/src/components/DataTable.test.tsx
git commit -m "frontend: add per-column filter checklist to DataTable"
```

---

### Task 3: Excel/CSV export button wiring

**Files:**
- Modify: `frontend/src/components/DataTable.tsx`
- Test: `frontend/src/components/DataTable.test.tsx`

**Interfaces:**
- Consumes: `exportRows` from `./dataTableExport` (Task 1); the `sorted` variable inside `DataTable` (already reflects search + column filters + sort, per Task 2's change).
- Produces: new optional `exportFileName?: string` prop on `DataTable` (defaults to `"export"`). Nothing further depends on this task — it's the last task in the plan.

This task assumes Task 2 has landed, so `DataTable.tsx` already has the column-filter state, the `filtered`/`sorted` pipeline described in Task 2, and the `Popover` after `</TableContainer>`.

- [ ] **Step 1: Write the failing tests**

At the top of `frontend/src/components/DataTable.test.tsx`, add the export mock right after the existing imports (before the `interface Row` declaration):

```typescript
import { exportRows } from "./dataTableExport";

vi.mock("./dataTableExport", () => ({ exportRows: vi.fn() }));
```

Then add these 3 new `it(...)` blocks inside `describe("DataTable", ...)`, after the tests added in Task 2:

```typescript
  it("exporting as Excel calls exportRows with the current filtered/sorted rows and value-bearing columns", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} exportFileName="my-file" />);

    await userEvent.type(screen.getByPlaceholderText("Search"), "ali");
    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Export as Excel (.xlsx)" }));

    expect(exportRows).toHaveBeenCalledWith(columns, [rows[1]], "xlsx", "my-file");
  });

  it("defaults the export file name to 'export' when not provided", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Export as CSV" }));

    expect(exportRows).toHaveBeenCalledWith(columns, rows, "csv", "export");
  });

  it("export respects an active column filter, not just search", async () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Bob" }));

    await userEvent.click(screen.getByRole("button", { name: "Export" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Export as Excel (.xlsx)" }));

    expect(exportRows).toHaveBeenCalledWith(columns, [rows[0], rows[1]], "xlsx", "export");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/DataTable.test.tsx`
Expected: FAIL — no element with role `button`/name `"Export"` exists yet.

- [ ] **Step 3: Implement the export button**

In `frontend/src/components/DataTable.tsx`:

Add the import for the export utility, right after the `@mui/material` import block:

```typescript
import { exportRows } from "./dataTableExport";
```

Update the `@mui/material` import to add `Button`, `Menu`, `MenuItem`:

```typescript
import {
  Button, Checkbox, FormControlLabel, IconButton, Menu, MenuItem, Paper, Popover, Table, TableBody, TableCell,
  TableContainer, TableHead, TablePagination, TableRow, TableSortLabel, TextField, Typography,
} from "@mui/material";
```

Update the component's prop destructuring and type to add `exportFileName`:

```typescript
function DataTable<T>({
  columns, rows, rowKey, searchPlaceholder = "Search", exportFileName = "export",
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  searchPlaceholder?: string;
  exportFileName?: string;
}) {
```

Add new state and a handler, alongside the other state declared in Task 2 (anywhere after `rowsPerPage`'s declaration is fine):

```typescript
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(null);

  function handleExport(format: "xlsx" | "csv") {
    exportRows(columns, sorted, format, exportFileName);
    setExportMenuAnchor(null);
  }
```

(`sorted` here refers to the same variable already computed further up in the component from Task 2/the original implementation — this must be placed after `sorted` is declared.)

Replace the existing standalone search `TextField` JSX:
```tsx
      <TextField
        size="small"
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        sx={{ mb: 1 }}
      />
```
with a wrapping flex container that also holds the new Export button and its menu:
```tsx
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/DataTable.test.tsx`
Expected: PASS — all tests, old and new.

- [ ] **Step 5: Run the full verify gate**

Run: `cd frontend && npm run verify`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/DataTable.tsx frontend/src/components/DataTable.test.tsx
git commit -m "frontend: add Excel/CSV export button to DataTable"
```

- [ ] **Step 7: Manual smoke test note (no browser in this environment)**

Whoever next has browser access should open each of the 5 refactored surfaces (Reports list, Datasets list, Connections list, a Dataset's Run preview, a report's Table widget) and confirm: the filter icon opens a checklist with correct values, unchecking narrows the table, the mini search-within-popover works, and both "Export as Excel" and "Export as CSV" actually download a correct file.

---

## Self-Review Notes

- **Spec coverage**: every design-doc section has a task — the export utility + `xlsx` dependency (Task 1), column filtering (Task 2), export UI wiring that ties filtering + sorting into the exported rows (Task 3). Non-cascading filters, initial-all-checked state, AND-combination with search, page-reset-on-filter-change, active-state indicator, value-only export columns, and ignoring pagination in export are all implemented and covered by tests.
- **Placeholder scan**: no TBD/TODO; every step has complete, runnable code.
- **Type consistency**: `DataTableColumn<T>`'s `value`/`render` fields are used identically across all 3 tasks; `exportRows<T>(columns, rows, format, fileName)`'s signature in Task 1 matches its call site in Task 3 exactly; `ExportFormat` (`"xlsx" | "csv"`) matches `handleExport`'s parameter type.
- **Scope check**: 3 tasks, each independently testable and committable. Task 1 has no dependency on Tasks 2/3. Task 2 depends only on the current (pre-existing) `DataTable.tsx`. Task 3 depends on both Task 1 (the `exportRows` function it calls) and Task 2 (the filtered `sorted` rows it passes) — sequential order matters here, unlike the largely-parallel-safe tasks in the prior DataTable milestone.
