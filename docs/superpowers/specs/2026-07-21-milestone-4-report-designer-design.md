# Milestone 4: Report Designer — Design

## Overview

Milestones 0-3 built up to this point but never let a `Report` actually show anything: `Report` is still just `Id, Name, Description`. This milestone builds the actual designer the project's vision doc described — a drag-and-drop canvas where widgets get placed on a grid, bound to a `Dataset` (from Milestone 3), and rendered as real charts/tables/text, with a separate read-only view page for the finished result.

Full scope in one milestone: all six widget types (Table, Bar, Line, Pie, Kpi, Text), the full gridstack canvas (drag/resize/add/remove), live data preview while editing, and an explicit Save flow.

## Architecture

`ReportCanvas` (edit, `/reports/{id}/edit`) and `ReportView` (view, `/reports/{id}`) are separate top-level route components. Both hydrate from the same `GET /api/reports/{id}/widgets` payload and render the same six per-widget-type components via the same data-fetch hook. The only difference between them is whether gridstack's drag/resize/add/remove chrome is mounted around the widgets — no duplicated rendering logic between edit and view.

## Data Model

```
Widget
  Id, ReportId (FK)
  Type          (enum: Table | Bar | Line | Pie | Kpi | Text)
  X, Y, W, H    (int, grid units)
  Title         (string)
  Content       (string?, nullable — only meaningful when Type == Text; plain text, no rich formatting in v1)

WidgetBinding
  Id, WidgetId  (FK, unique — one-to-one; ABSENCE of a row means "unconfigured", not a nullable FK on Widget)
  DatasetId     (FK)
  CategoryField (string?, nullable)
  ValueFields   (string — JSON-serialized string[], mirroring how Milestone 3 already stores structured
                 per-mode Dataset config as JSON; not a new storage pattern for this project)
```

Text widgets never get a `WidgetBinding` row at all — `DatasetId` doesn't apply to them.

### Uniform binding shape, per-type cardinality rules

`WidgetBinding` has the same two fields (`CategoryField`, `ValueFields`) for every widget type that has a binding at all — no widget-type-specific schema branching. This was deliberately checked against real Power BI behavior: Bar/Line/Pie's `Values` field well genuinely accepts multiple measures in Power BI (clustered bars, multiple lines, multi-slice pies with no category), while only KPI is a true single-value outlier (its `Indicator` well replaces rather than accumulates). Modeling this as one uniform list field plus a validation rule for KPI — rather than special-casing the schema per widget type — keeps the data model simple and pushes widget-specific behavior to where it belongs: validation and rendering.

Per-type cardinality rules (enforced at validation/rendering time, not schema-enforced):
- **Kpi**: `CategoryField` must be null, `ValueFields` exactly 1 entry.
- **Bar / Line**: `CategoryField` required, `ValueFields` 1+ entries (multi-series — one bar/line per value field, sharing the category axis).
- **Pie**: `CategoryField` required, `ValueFields` exactly 1 entry. Power BI does support a multi-measure, no-category pie mode, but that's a genuinely distinct UI toggle ("sliced by category" vs. "sliced by measure") that adds real picker complexity for a niche case — deferred, not adopted, for v1.
- **Table**: `CategoryField` unused (null). `ValueFields` is repurposed as an ordered subset of column names to display (reusing the same field-list mechanism already needed for charts, rather than inventing a separate `Columns` field just for this widget type). An empty `ValueFields` list defaults to "show every column the query returns," so a Table bound to a Dataset with no columns picked yet still renders something.

## Field-Shape Classification

A pure function, `Classify(nativeType: string) -> FieldKind` where `FieldKind` is `Categorical | Numeric | Temporal | Unsupported`. Matches on the type name's prefix before any `(...)` suffix, case-insensitive:

- **Numeric**: `int`, `bigint`, `smallint`, `tinyint`, `decimal`, `numeric`, `float`, `real`, `money`, `smallmoney`, plus REST's `"number"`.
- **Temporal**: `date`, `datetime`, `datetime2`, `smalldatetime`, `time`, `datetimeoffset`.
- **Categorical**: `nvarchar`, `varchar`, `nchar`, `char`, `text`, `ntext`, `uniqueidentifier`, `bit`, plus REST's `"string"`, `"boolean"`.
- **Unsupported**: `varbinary`, `image`, `xml`, `geography`, `geometry`, `sql_variant`, plus REST's `"object"`, `"array"`, `"null"`.

This is **advisory, not a hard gate**. The field picker uses it to group/label options ("Numeric" vs. "Categorical" headers, sorted sensibly) and to pre-filter obviously-wrong choices (an `"object"`-typed REST field can't be picked for anything), but it doesn't hard-block unusual-but-legitimate choices (e.g. grouping a Bar chart by a numeric ID column) — Power BI itself doesn't block that either.

This resolves the gap the Milestone 3 design doc explicitly deferred ("a small pure function ... called only at bind time by the future Report Designer").

## Canvas & Rendering Integration

One `ReportCanvas` owns a single gridstack instance via a `ref` + `useEffect` (init on mount, `destroy()` on unmount), per the original vision doc. Widget position/size state lives in a React `useReducer` array of "draft" widgets; gridstack's `change` event (fired once per drag/resize gesture, not per-frame) syncs `X/Y/W/H` back into React state — gridstack owns the DOM during a gesture, React reconciles after.

Each widget type is its own component (`TableWidget`, `BarWidget`, `LineWidget`, `PieWidget`, `KpiWidget`, `TextWidget`), all consuming a shared `useDatasetExecute(datasetId)` hook that calls `POST /api/datasets/{id}/execute` and re-fires whenever the binding changes (live preview, see below). Each chart component has a small pure "shaping" function (`QueryResult + binding -> EChartsOption`) kept separate from the rendering shell, so it's unit-testable without mounting a chart. Bar/Line/Pie wrap ECharts via a shared `useECharts(containerRef, option)` hook (`echarts.init` on mount, `setOption` on option change, `dispose` on unmount) — the standard vision-doc pattern.

**Deliberate deviation from the vision doc**: Kpi does NOT wrap ECharts. It's just a styled number + label; pulling in a full charting library for a single number is unnecessary weight. Table is a plain HTML table over the selected columns. Text renders `Widget.Content` as-is.

## Live Data Preview

While editing (`/reports/{id}/edit`), as soon as a widget has a valid binding (Dataset + required fields per its cardinality rule), it fetches and renders real data immediately via `useDatasetExecute` — no placeholder/mock content, no manual "preview" button. Changing the binding re-fetches. The same hook and shaping functions are reused unchanged on the view page, so there's exactly one code path for "turn a binding into rendered output," used by both modes.

## Save/Load Flow & API Contract

- `GET /api/reports/{id}/widgets` — returns the full widget array: `Type`, `X/Y/W/H`, `Title`, `Content`, and `Binding: { DatasetId, CategoryField, ValueFields } | null`. Used by both edit and view.
- `PUT /api/reports/{id}/widgets` — body is the ENTIRE current widget array from the client. No autosave; explicit Save button only (matches the Milestone 0 form-submit pattern, sidesteps autosave's debounce/race-condition complexity). While editing, drag/resize/add/remove only touches in-memory React state — nothing hits the backend until Save.
- The server validates structurally (cardinality rules per type, Text widgets never carry a binding, `DatasetId` must exist), then in ONE transaction deletes all existing `Widget`/`WidgetBinding` rows for the report and inserts the submitted set, returning the saved array with real generated `Id`s (so the client reconciles any client-side temporary ids for widgets added since the last save). Delete-then-insert, not diff-and-patch — widgets have no identity worth preserving across saves; nothing outside a report ever references a `WidgetId`.
- Save-time validation deliberately checks only **structural** rules — NOT that `CategoryField`/`ValueFields` are still valid column names in the target Dataset. Checking field existence at save time would need an extra column-discovery round-trip and would be stale the instant the Dataset's query changes afterward anyway. That check belongs at render time instead (see Error Handling).

## Error Handling — Stale Bindings

When a bound widget executes and gets back `QueryResult.Columns`, it checks whether `CategoryField` and every `ValueFields` entry are still present by name in the result. If not, that ONE widget renders an inline "Field 'Cost' no longer exists in this Dataset" card instead of a chart — isolated per widget, never a page-level failure; every other widget on the report keeps rendering normally. This check runs identically on the edit canvas (where it doubles as a prompt to fix the binding) and the view page. There is no proactive validation cascade when a Dataset's query changes elsewhere (e.g. no "warn every report using this Dataset") — consistent with Milestone 3's existing no-caching, discover-lazily philosophy.

## Testing Approach

- **Backend (xUnit)**: table-driven tests for `Classify()` covering every SQL and REST type bucket; controller/service tests for the save/replace transaction (add/remove/update in one `PUT`, confirms no partial state on failure); an explicit test that a `Text` widget's binding is ignored/stripped server-side even if a client sends one.
- **Frontend (Vitest + React Testing Library — new test infrastructure for this project)**: each widget's pure shaping function tested directly (`QueryResult + binding -> expected rows/EChartsOption`) without mounting gridstack/ECharts; a couple of canvas-level tests for the drag/resize-to-state sync and the stale-binding error card. Gridstack/ECharts internals themselves are not tested — only the ref/`useEffect` integration seams (mount handoff, unmount teardown). This is the first milestone in this project to add a frontend test runner; prior milestones (0-3) had none.

## Explicitly Out of Scope

- Rich text formatting for Text widgets (plain text only in v1).
- Pie chart's "sliced by measure, no category" mode (Power BI supports it; deferred as added picker complexity for a niche case).
- Any proactive validation/warning when a Dataset's query changes and a report elsewhere depends on now-missing fields — handled reactively (isolated per-widget error card) at render time only.
- Widget identity/history across saves (no undo, no version history) — delete-then-insert is the whole story.
- Anything from the Milestone 3 design's own "Explicitly Out of Scope" list that this milestone doesn't change (multi-table joins, a cross-dialect SQL abstraction, Dataset result caching, runtime-editable stored-proc parameters, non-GET REST methods) plus the still-open Milestone 3 gap (TableQuery mode's filter/sort/Top-N UI) — none of that is this milestone's job to fix.
