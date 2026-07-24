# Shared DataTable — Pagination, Sort & Search — Design

## Overview

Every table in the app — the Table widget on a report, the Data-table rail view, the Datasets preview grid, and the Reports/Datasets/Connections management lists — currently renders every row into the DOM at once with no way to sort by clicking a header or search within it. This closes that gap with one shared, reusable `<DataTable>` component that all five call sites adopt, rather than patching each individually — eliminating the duplicated MUI `<Table>` boilerplate each page currently hand-rolls, and landing the same UX everywhere at once.

## Architecture

A new generic component, `frontend/src/components/DataTable.tsx`, takes a column-definition array and a rows array, and internally manages search/sort/pagination state, deriving the displayed rows each render via: filter by search query → sort by the active column (if any) → slice to the current page. All 5 existing call sites define their columns and hand off to this component instead of hand-rolling their own `<Table>` JSX.

## Column-Definition API

```typescript
export interface DataTableColumn<T> {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  value?: (row: T) => string | number; // used for BOTH sorting and search matching; omit for a non-data column (e.g. action buttons)
}
```

One accessor (`value`) drives both sort and search-matching; `render` stays purely presentational (formatting, buttons, links). A column with no `value` (e.g. a "Designer" column rendering View/Edit buttons, or a "Test"/"Run" action column) is simply not sortable and excluded from search matching — clicking its header does nothing, and search never matches against it.

## Behavior — Client-Side Only

Every result set this component renders is already fully fetched into memory before it reaches the table (query results are capped by `Dataset.RowLimit`, default 10,000; the management lists are small, hand-curated collections). Search, sort, and pagination all operate on that already-in-hand data — no new backend endpoints, no additional network calls, consistent with the "fetch once" philosophy already established for the Report Designer's cross-filtering.

- **Search**: a text input above the table; matches if ANY column's `value(row)` (coerced to string, case-insensitive) contains the query substring. Columns without `value` are excluded from matching.
- **Sort**: clicking a sortable column's header cycles ascending → descending → unsorted, with `TableSortLabel`'s arrow indicating direction. Only one column sorts at a time.
- **Pagination**: MUI's `TablePagination`, rows-per-page options 10/25/50, defaulting to 25.

## Applying It to the 5 Call Sites

- **`QueryResultGrid`** (Data-table rail view, Datasets preview): columns built dynamically from `result.columns`, one per query column — `value` returns the raw cell, `render` formats it (`null` displayed as *null*, matching current behavior).
- **`TableWidget`**: columns built dynamically from `shapeTableRows`'s output columns — same `value`/`render` split, `null` rendered as empty string (matching current behavior, distinct from `QueryResultGrid`'s *null* label since the two already format nulls differently today).
- **`ReportsPage`**: ID/Name/Description columns (`value` + `render`) plus a Designer column (View/Edit buttons, `render`-only).
- **`DatasetsPage`**: Name/Mode/RowLimit columns (`value` + `render`) plus a Preview column (Run button, `render`-only).
- **`DataSourcesPage`**: Name/Type/Host columns (`value` + `render`) plus a Test column (button, `render`-only).

## Testing Approach

Vitest + RTL tests on `DataTable` itself: search filters to matching rows only, clicking a sortable header reorders rows and cycles direction (asc → desc → unsorted) on repeated clicks, pagination shows the correct slice for the current page and respects a changed rows-per-page value. The 5 call sites are column-definition wiring around an already-tested component — no new dedicated tests needed there beyond confirming existing tests for those pages still pass.

## Explicitly Out of Scope

- **Server-side pagination.** Discussed explicitly: `Dataset.RowLimit` already bounds how much is ever fetched (default 10,000), so client-side pagination only affects DOM row count, not network/database load — genuine server-side paging (re-querying per page) would only be worth building if a real need for datasets far larger than `RowLimit` ever materializes, and even then only for standalone previews (Data-table view, Datasets preview) — the Table *widget* cannot be server-side paged without breaking cross-filtering, since every widget on a report needs the same full, in-memory result set to filter against each other.
- **Server-side ("DirectQuery-style") filtering.** Also discussed and explicitly deferred: re-querying on every filter interaction would make filtering network-bound and noticeably slower, has no generic way to inject a dynamic filter into arbitrary Raw SQL or a Stored Procedure call, and is impossible for REST-based datasets — a materially larger and more fragile undertaking than the "fetch once, filter in memory" model already in place.
- Persisting sort/search/page state across page reloads or between sessions.
- Multi-column sort (one column at a time, matching a typical BI table visual's own basic sort behavior).
- Column resizing or drag-to-reorder.
