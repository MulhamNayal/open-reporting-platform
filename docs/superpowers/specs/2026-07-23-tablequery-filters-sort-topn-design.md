# Table Query Filters, Sort & Top-N — Design

## Overview

Milestone 3 shipped the backend fully supporting `SelectQuery.Filters`/`Sort`/`Top` for Table Query mode datasets — the SQL builder, its operator/sort-direction allowlists, and dedicated tests all exist — but the frontend's Table Query editor hardcoded `filters: [], sort: null, top: null` at every step, so no shipped UI path could ever produce a non-empty `SelectQuery`. This was caught during Milestone 4's final review and recorded as an unintentional gap, not a deliberate descope.

This milestone closes that gap: a filter-row builder, sort picker, and Top-N field for Table Query mode, tucked into a collapsed-by-default "Advanced" section below the existing table/column picker. Alongside it, `DatasetsPage` — untouched by the Report Designer redesign — gets restyled with the Meridian design tokens already established there, and a latent exception-mapping bug this new UI would otherwise finally expose gets fixed.

## Filter-Row Builder

A collapsible `<details>` section (matching the `.fgroup` summary/chevron pattern already used by the Report editor's Format tab) appears below the column checkboxes once a table is selected in Table Query mode. Inside:

- Each filter row: a **Field** dropdown populated from the *full* schema of the selected table (not just the checked output columns — filtering by a column you're not displaying is normal SQL and the backend already supports it, since `SelectQuery.Filters` references field names independently of `Columns`), an **Operator** dropdown fixed to the backend's exact allowlist (`=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`), and a plain text **Value** input (matches `QueryFilter.Value: string` — no type-aware widgets; the value is passed through as a SQL parameter regardless of the column's actual type).
- "+ Add filter" appends a blank row; each row has a remove (×) button.
- Multiple rows are always ANDed together — no OR logic, no nested groups (see Explicitly Out of Scope).
- A row with no field chosen is silently dropped from the submitted payload rather than erroring, so starting a filter and changing your mind doesn't block saving.

## Sort & Top-N

In the same Advanced section: a **Sort field** dropdown (same full-schema list as filters, plus a "None" option) and a **Direction** dropdown (`ASC`/`DESC`), both optional — if no field is chosen, `Sort` is submitted as `null`. A plain numeric **Top-N** text field, optional — empty submits `Top: null`, falling back to the dataset's effective `RowLimit` (per Milestone 3's existing `min(Top, RowLimit)` semantics — unchanged by this milestone).

## Backend Fix — Exception Mapping

`SqlServerProvider.BuildTableQuerySql` throws plain `InvalidOperationException` for two validation failures: an operator outside the allowlist, and a sort direction outside `{ASC, DESC}`. `DatasetsController.Execute` currently catches `InvalidOperationException` broadly and returns `404 Not Found` — the same status used for "no such dataset." Since this UI is the first real path that can reach those two checks, leaving them mapped to 404 would be actively misleading (a malformed filter/sort is a client input problem, not a missing entity).

This is a *different* case from Milestone 3's `QueryPreviewException` fix (which handled a RawSql `ORDER BY` discovery failure against the live database, correctly mapped to 502 — an upstream/dependency failure). Here, the `SelectQuery` itself is malformed before any database call happens, which is a `400 Bad Request` situation. Fix: a new, narrowly-scoped `UnsupportedQueryOperationException`, thrown by `BuildTableQuerySql`'s two checks in place of `InvalidOperationException`, caught separately in `DatasetsController.Execute` and mapped to 400 — placed alongside (not replacing) the existing `InvalidOperationException` → 404 and generic `Exception` → 502 catches, which continue to serve their existing cases unchanged.

Since the new UI constrains users to only valid operators/directions via dropdowns, this path becomes practically unreachable through normal use — the fix's real value is correctness for direct API callers and defensive-in-depth, not something a UI user will routinely hit.

## Visual Restyle

`meridian-tokens.css` is already loaded globally (via `main.tsx`), so this is applying an already-established design system to a page that never got it, not a new design problem. `DatasetsPage`'s connection picker, dataset list, and create-dataset form swap MUI's default theme colors/spacing for the existing color tokens (`--panel`, `--line`, `--text`, `--accent`, etc.) and typography, and reuse the same collapsible `<details>`/summary pattern already established for the Format tab's groups — for the new Advanced (filter/sort/Top-N) section, and for the create-dataset form's existing mode-specific sections if it reads better grouped that way. The dataset list stays a plain table, reskinned rather than restructured into a new component pattern.

## Testing Approach

- **Frontend (Vitest)**: pure-function tests for the filter-row builder's add/remove/serialize logic (building the submitted `filters`/`sort`/`top` payload shape from UI state), following this project's established "test the seam" pattern.
- **Backend (xUnit)**: a test proving `UnsupportedQueryOperationException` maps to 400 for both the bad-operator and bad-sort-direction cases, plus a regression test confirming the existing "no such dataset" 404 case is unaffected by the new catch clause.

## Explicitly Out of Scope

- OR logic between filters, or nested filter groups — `SelectQuery.Filters` stays a flat, always-ANDed list.
- Filtering or sorting on computed/expression columns (only real schema columns).
- Saved/named filter presets.
- Any change to `RestQuery`, `RawSql`, or `StoredProcedure` mode editors — this milestone is Table Query mode only.
- Any change to `Dataset.RowLimit`'s existing `min(Top, RowLimit)` interaction with `Top`.
