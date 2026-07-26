# DataTable — Column Filtering & Excel/CSV Export — Design

## Overview

The shared `DataTable` component (built in the previous milestone) already gives all 5 table-rendering call sites — `QueryResultGrid`, `TableWidget`, `ReportsPage`, `DatasetsPage`, `DataSourcesPage` — client-side search, sort, and pagination. This milestone adds two more capabilities to that same component: a per-column filter (Excel/Power BI-style distinct-value checklist) and one-click export of the current table view to Excel or CSV. Both extend `DataTable` directly, so all 5 call sites gain both features automatically, with no changes to their column definitions.

Server-side pagination for TableQuery-mode datasets, and whole-report/PDF export, are both explicitly deferred to later, separate milestones (discussed and agreed beforehand) — this milestone is scoped to these two client-side additions only.

## Architecture

Neither feature changes the `DataTableColumn<T>` interface:

```typescript
export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  value?: (row: T) => string | number; // already drives search + sort; now also drives filtering + export
}
```

Column filtering and export both reuse the existing `value` accessor exactly as search and sort already do. A column without `value` (an action column — Designer/Preview/Test buttons) gets no filter icon and is excluded from export, the same way it's already excluded from search and sort today. This is why no call site needs to change its column definitions: the same accessor that already opted a column into search/sort automatically opts it into filter/export too.

## Column Filtering

**UI:** a filter icon appears in the header of every column that has a `value` accessor, next to its existing sort label. Clicking it opens a popover containing:
- A small text box to search within that column's own values (for high-cardinality columns like `Host` or `Description`).
- A scrollable checkbox list of every distinct value present in that column, each with its own checkbox.

**Distinct values:** computed from the full, unfiltered `rows` prop for each column independently — not cascading based on other columns' currently-active filters. This keeps the implementation simple (no cross-column dependency graph to maintain) at the cost of occasionally letting a user pick a combination across two columns that yields zero rows; that case is already handled gracefully by the existing "No matching rows." empty state, so no new error handling is needed.

**Combining logic:** a row must match every column's active filter (AND across columns) and the existing global search box (AND with search, unchanged). A column with no checkboxes unchecked-from-all (i.e., filter untouched or all values checked) is not filtering anything — filtering only takes effect once at least one distinct value has been unchecked.

**Initial state:** a column's filter starts with every distinct value checked (i.e., unfiltered) the first time its popover is opened — unchecking a value is what activates filtering, not an empty-by-default list that requires opting in to every value.

**State shape (internal to `DataTable`):**
```typescript
const [columnFilters, setColumnFilters] = useState<Record<string, Set<string | number>>>({});
```
A column key present in `columnFilters` with a non-empty `Set` means: only rows whose `value(row)` is in that set pass. A column key absent from `columnFilters` (or whose set equals the column's full distinct-value set) means: no filtering on that column.

**Visual indicator:** the filter icon renders in a highlighted/filled state when a filter is actively narrowing that column (i.e., its selected set is a strict subset of all distinct values), so a filtered column that's scrolled out of view isn't invisible to the user.

**Pagination interaction:** any change to a column's filter selection resets `page` to `0`, matching the existing behavior when search text changes.

## Export

**UI:** one "Export" icon button placed near the existing search box, opening a small menu with two items: "Export as Excel (.xlsx)" and "Export as CSV".

**Library:** the `xlsx` (SheetJS) package. A single worksheet is built once from the exportable rows, then written out via `XLSX.writeFile` with the appropriate book type (`xlsx` or `csv`) depending on which menu item was clicked — one code path serves both formats.

**Row/column scope:**
- Rows: the current search + column-filter + sort result (i.e., `sorted` in the existing implementation) — pagination is ignored, so export always includes every currently-matching row, not just the visible page.
- Columns: only columns with a `value` accessor are included. The column's `label` becomes the header cell; `value(row)` becomes the data cell. Action columns (no `value`) are omitted entirely, since a button has no meaningful exported value.

**Filename:** a generic default (`export.xlsx` / `export.csv`). `DataTable` gains an optional prop:
```typescript
exportFileName?: string; // defaults to "export" if omitted
```
No call site is required to pass this in this milestone; a call site MAY optionally pass a friendlier name (e.g. a report or dataset name) as a small, separate follow-up — not required for this milestone to ship.

## Testing Approach

Vitest + RTL tests on `DataTable` itself (the 5 call sites need no new tests beyond confirming their existing tests still pass, same as the prior milestone):

- Opening a column's filter popover shows the correct distinct values for that column.
- Unchecking a value filters out matching rows; the mini-search box within the popover narrows the checklist itself.
- A column filter and the global search box combine via AND (both active at once narrows further than either alone).
- Clearing a column's filter (re-checking all values) restores the previously-filtered rows.
- Any filter change resets pagination to page 0.
- The column header's filter icon shows an active/highlighted state only when that column's filter is a strict subset of all its values.
- Export: mock `xlsx`'s write call and assert it's invoked with the correctly filtered + sorted, value-only row data and the correct header labels, for both the Excel and CSV menu items. Verifying actual file bytes is not practical or necessary.

## Explicitly Out of Scope

- **Cascading filters** — each column's checklist always reflects the full dataset's distinct values, not the values still reachable given other active filters.
- **PDF export**, and **whole-report/canvas export** — a materially different, bigger feature (rendering the report's full layout, not a single table) discussed and deferred separately.
- **Server-side pagination for TableQuery-mode datasets** — already discussed at length and deferred to its own, later milestone; unaffected by this one.
- **Per-call-site custom export filenames** — the generic default is sufficient for this milestone; a call site can add a custom name later as a trivial follow-up.
- **Persisting filter/export state across reloads or sessions** — consistent with the prior milestone's decision not to persist search/sort/page state either.
