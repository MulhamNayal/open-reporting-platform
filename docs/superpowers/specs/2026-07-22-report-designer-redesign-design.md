# Report Designer Redesign — Design

## Overview

Milestone 4 shipped a technically complete Report Designer that nobody enjoyed using: adding a widget meant registering a Connection, saving a Dataset, then binding a widget to it — three persisted, named entities before you ever saw a row of real data. Direct feedback after actually using it: "this is so poor... even basic functionality is not there... I don't need to create a datasource every time."

This redesign replaces that ceremony with a Power BI-style model, using an interactive reference mockup (`report-designer.html`, internally called "Meridian") as the adopted visual and interaction target: **one query per report**, written once, whose result columns become a shared field list; every widget on the report is then built by dragging fields into type-specific wells — no per-widget query authoring at all.

This is an architecture change, not a UI polish pass. Milestone 4's `WidgetBinding.DatasetId` (one Dataset *per widget*) is replaced by `Report.DatasetId` (one Dataset *per report*, shared by every widget on every page). Given this is a personal project mid-flight with no production data to preserve, this is a clean breaking migration.

## Architecture: Two Shells

The app has two distinct chrome layers, each fit to its own job:

- **App shell** (Connections list, Datasets library, Reports list) — a persistent left sidebar (icons: 🔌 Connections, 📚 Datasets, 📊 Reports), simple content pages. This is where you browse and manage things.
- **Report editor shell** (opened by clicking into a specific report) — a full immersive layout matching `report-designer.html`: top ribbon, left icon rail, center canvas, right-side Filters + Visualizations panes, far-right Data pane, bottom page tabs. "File → Back to Reports" returns to the app shell.

Both shells adopt the same visual design system (IBM Plex Sans/Mono, the color token set, spacing scale, component style from `report-designer.html`) for consistency across the whole app — directly addressing the "visual inconsistency across pages" and "not professional" feedback.

## Data Model

```
Report
  Id, Name, Description
  DatasetId (int?)         -- the report's one shared query; null until first query is run

ReportPage                  -- NEW entity
  Id, ReportId (FK)
  Name
  SortOrder
  FilterState (string)     -- JSON, e.g. {"Region":["North","South"]} — page-level cross-filter selections

Widget
  Id, ReportPageId (FK)    -- CHANGED from ReportId: widgets belong to a page, not directly to a report
  Type, X, Y, W, H, Title, Content   -- unchanged

WidgetBinding
  Id, WidgetId (FK)
  -- DatasetId REMOVED: always implicitly the parent Report's DatasetId, so a separate
  -- column would just be redundant/driftable
  CategoryField (string?)
  ValueFields (string)     -- JSON array, unchanged

Dataset
  ...existing fields...
  IsSaved (bool)           -- NEW. false = auto-created by a report's quick-query, hidden from
                             the Datasets library. true = explicitly named/promoted, shows in
                             the library and can be reused by other reports.
```

Text widgets still never get a `WidgetBinding` row — unchanged from Milestone 4.

## Query Creation Flow

Creating a new report (from the app shell's Reports page) immediately prompts for the report's one query: pick a Connection, choose Raw SQL or Stored Procedure mode (matching the existing per-connection-type Dataset editors from Milestone 2/3 — `RestQuery` mode for REST-type Connections), write it, hit Run, see a live preview. This creates an unnamed (`IsSaved = false`) `Dataset` row and sets `Report.DatasetId` to it — no separate "save" step required before you can start building widgets.

A "Save as Dataset" action (available via the ribbon's File menu — "Change data source" — and standalone from the Datasets library) lets you give it a name, flipping `IsSaved` to `true` and making it reusable by other reports. Deleting a report whose Dataset was never saved cleans up that unnamed Dataset row.

**Query-building modes deliberately stay simple**: raw SQL / stored procedure / REST only — no revival of Milestone 3's never-built no-code table/filter/sort/Top-N picker. That gap stays closed by this redesign moving the emphasis to drag-and-drop widget building instead, not a fancier query UI.

**Row volume**: the existing `Dataset.RowLimit` (nullable int, Milestone 3) is the safety valve — default it to 10,000 if the user doesn't set one explicitly. This tool operates at personal/business-report scale, not big-data scale; "report over genuinely huge data volumes" is explicitly out of scope (see below), same spirit as Milestone 3's existing "no result caching" descope.

## Widget Types & Cardinality Rules

Ten types, matching `report-designer.html`'s picker grid: **Table, Bar (clustered column), Stacked Column, Clustered Bar (horizontal), Line, Area, Pie, Donut, Kpi, Scatter**, plus **Text** (unchanged, no binding).

Cardinality rules extend Milestone 4's uniform `CategoryField` + `ValueFields` shape:

- **Kpi**: `CategoryField` null, `ValueFields` exactly 1.
- **Bar / Stacked Column / Clustered Bar / Line / Area**: `CategoryField` required, `ValueFields` 1+ (multi-series). Stacked Column and Area are rendering-flag variants of Bar and Line respectively (`stacked: true` / `areaStyle` set) — same shaping function, same binding rule, no new validation code.
- **Pie / Donut**: `CategoryField` required, `ValueFields` exactly 1. Donut is a rendering-flag variant of Pie (cutout percentage).
- **Table**: `CategoryField` unused. `ValueFields` is the ordered column subset (empty = show every column) — unchanged from Milestone 4.
- **Scatter** (NEW shape): `CategoryField` optional (used as the "Details" grouping field, not a shared axis), `ValueFields` exactly 2 entries, **positionally meaningful**: index 0 = X measure, index 1 = Y measure. This is the one genuine exception to "ValueFields order doesn't matter" — the field-well UI must label these wells "X-axis" and "Y-axis" specifically, not a generic "Values" list, so the position is unambiguous to the person building it.

## Canvas & Widget Chrome

Matches `report-designer.html`: dotted-grid canvas background, empty-state CTA ("Build your report — pick a visual from the right, or drag a field onto the canvas"), drag-to-move via the widget's header, corner resize handle, snap-to-grid (8px). Widget header shows its title always; duplicate/delete icons appear only when the widget is selected (not a persistent header strip, not hover-only — Meridian's actual behavior, refining our earlier chrome mockup). Duplicate is a new, cheap action (client-side copy of widget + binding before Save).

## Visualizations Pane

Persistent right-side pane: a 10-icon chart-type grid, then two tabs:
- **Build**: field wells per the cardinality rules above (e.g. Bar shows Axis / Legend / Values wells). Drag a field from the Data pane into a well, or check a field's checkbox to auto-place it into the best available well on the currently-selected widget (or create a new widget if none is selected) — same "smart add" behavior as the reference mockup.
- **Format**: title text/visibility, legend visibility, gridlines, color palette (a handful of named palettes, matching the reference), plus two new additions flagged as basic-but-missing during review: a sort toggle (ascending/descending by axis or value) and a data-labels-on-chart toggle.

## Data Pane

Searchable, draggable list of every field from the report's shared query result, color-coded by kind using the existing `Classify()` function (Categorical / Numeric / Temporal / Unsupported) from Milestone 4 — same glyph-per-kind convention as the reference mockup (Σ measure, ▦ date, Abc categorical).

## Filters Pane & Cross-Filtering

Auto-populated from every Categorical-classified field in the shared result — no manual filter configuration. Each field gets a collapsible checkbox list of its distinct values. Selections persist per-page via `ReportPage.FilterState`.

**Mechanics**: the report fetches its query exactly once (not once per widget, unlike Milestone 4) and holds the raw rows in a shared React context. Every filter interaction — a Filters-pane checkbox, or **clicking a data point directly on a widget** (click-to-cross-filter, included per review — the hallmark Power BI interaction) — re-filters that in-memory row set client-side. Each widget's existing pure shaping function (`shapeBarOption`, `shapeKpiValue`, etc., from Milestone 4) re-runs against the filtered subset. No extra backend round-trip per filter click; the ribbon's "Refresh data" button is the explicit on-demand re-fetch.

This is deliberately **Import-style**, not DirectQuery-style: Power BI's DirectQuery mode re-runs a live query against the source on every interaction instead of caching a copy. That's a real, larger undertaking here (it would need generically folding a dynamic WHERE clause into whatever the user's query is — tractable for `RawSql`/`TableQuery`/`StoredProcedure` via a wrapping subquery, not generalizable to `RestQuery` at all) and is explicitly out of scope for this pass.

## View Page Interactivity

The read-only View page (shared with someone else) is **not** a static snapshot — the Filters pane and click-to-cross-filter both work there too, using the same client-side mechanism. Only editing (moving/resizing/adding/removing widgets, changing bindings) is unavailable outside the editor. This is what makes a shared report actually useful rather than a picture of one.

## Multi-Page Reports

Bottom page-tab bar: add/rename (double-click)/delete a page. All pages within a report share the same `Report.DatasetId` — one query per report, not per page. Each page has its own widget layout and its own independent `FilterState`.

## Ribbon & Left Rail

- **Ribbon**: File (rename report, change data source, back to Reports), Insert (add a Text widget), View (toggle Filters pane visibility), Refresh data, Save (explicit button, no autosave — same pattern as Milestone 4). The reference mockup's ribbon Format menu is dropped (redundant with the Format tab already in the Visualizations pane); Undo/Redo is deferred (real state-history work, not part of the original complaint).
- **Left rail**: Report (canvas) and Data table (raw preview of the shared query's rows) views. The reference mockup's Model view is dropped — it only makes sense with multiple joined tables, which stays out of scope (same descope as Milestone 3's "no multi-table joins").

## Testing Approach

Extends Milestone 4's Vitest + RTL infrastructure:
- Pure-function tests for cross-filter row-shaping (given rows + filter selections, return the filtered subset) and the new Scatter cardinality rule.
- Field → well assignment tests (`assignField`, `smartAdd` equivalents) covering the same cardinality rules as validation, now triggered by drag/drop or checkbox instead of dropdowns.
- Page CRUD (add/rename/delete, at-least-one-page invariant).
- Drag-and-drop is tested at the state-transition-function seam, not by simulating native HTML5 drag events — same "test the seam, not the library" approach already used for gridstack/ECharts in Milestone 4.
- Backend: migration correctness for the `Report`/`ReportPage`/`Widget`/`WidgetBinding`/`Dataset` schema changes; a service-level test that deleting a report's only unsaved Dataset cleans it up; controller tests for the new page CRUD endpoints.

## Explicitly Out of Scope

- DirectQuery-style live per-filter re-querying (Import-style client-side filtering only).
- Visual-level filters (only page-level Filters pane + click-to-cross-filter).
- Export data/image from a widget or report.
- Conditional formatting (color-by-value on KPIs, table cells, etc.).
- Drill-down hierarchies (e.g. Year → Quarter → Month).
- Bookmarks (saved filter-state snapshots).
- Report-wide themes beyond the existing per-visual palette picker.
- Numeric/temporal range filters (categorical checkbox filters only).
- More than one dataset/query per report.
- Undo/redo, zoom/fit-to-page controls.
- Any drag-and-drop library — native HTML5 DnD (as demonstrated in `report-designer.html`) is sufficient, no new dependency.
- Model view / multi-table joins (carried forward from Milestone 3's existing descope).
- Reporting over genuinely huge data volumes (bounded by `Dataset.RowLimit`; a distinct future project if ever needed, not a tweak to this design).
