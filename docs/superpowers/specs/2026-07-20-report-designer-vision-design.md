# Report designer — vision

Status: forward-looking vision — not scheduled for implementation, no prerequisite milestone exists yet. Nothing here gets built until a data-source/dataset milestone lands first (see "Explicit dependency" below). This is written now so there's a clear destination to build toward, not a spec to pick up and start coding from.

Right now the whole app has one entity — `Report` (Id, Name, Description) — and that's it. No widgets, no datasets, no data sources. This doc describes the shape of the drag-and-drop dashboard builder that eventually sits on top of that, once there's something for it to actually visualize.

## What this is

The target end state: open a report, get a canvas, drag widgets onto a grid, resize them, point each one at a dataset, hit Save. Standard BI-tool dashboard building — think a stripped-down Power BI canvas, not a full report writer.

## Data model

Normalized, not a JSON blob column. Three tables instead of one:

- `Report` — unchanged (Id, Name, Description). No longer holds any layout — that all moves out to `Widget`.
- `Widget` — `Id, ReportId (FK), Type (Table/Bar/Line/Pie/Kpi/Text), X, Y, W, H, Title`. `X/Y/W/H` are grid units, not pixels — that's what gridstack.js works in natively.
- `WidgetBinding` — `Id, WidgetId (FK), DatasetId (FK), CategoryField, ValueField`. One-to-one with `Widget`, and nullable until the widget's been configured — you can drop a widget on the canvas before deciding what it shows. `Text` widgets never get a binding at all; they're just literal content typed straight into the widget.

Why normalized over a blob: real foreign keys mean the backend can validate a `DatasetId` actually exists, query "which widgets use dataset X," and change a widget's type without the frontend having to parse and rewrite an opaque JSON structure. Costs a join or two on load; worth it.

## Canvas mechanics

- **gridstack.js** for drag/resize — plain JS, not tied to React. This is the same library the sibling work-project reporting platform already settled on, so there's a known-good reference for how the grid/resize/collision behavior should feel.
- One thin React component per widget `Type`. The four chart types (Bar/Line/Pie/Kpi) each wrap **ECharts**; `Table` is a plain table renderer; `Text` is just rendered text — no charting library involved for either of those two.
- Integration pattern for both gridstack and ECharts: a `ref` on the container + a `useEffect` that hands the DOM node to the vanilla JS library on mount, and tears it down on unmount. Same pattern for both libraries, because they're both "vanilla JS thing that wants to own a DOM node" — this is exactly how the sibling project did it in Blazor (and how the Blazor version's approach carried over when parts of that got ported toward React). Nothing React-specific about gridstack or ECharts themselves; the React layer is just the mount/unmount glue.

## Save flow

Explicit Save button — no autosave. Chosen deliberately over autosave to match the form-submit pattern already established back in Milestone 0, and to sidestep the debounce/race-condition complexity autosave brings (last-write-wins across widgets being dragged, in-flight saves getting superseded, etc.).

While editing, dragging/resizing/adding/removing widgets only touches in-memory React state — nothing hits the backend until Save is clicked. On Save, the frontend sends the *entire* current widget array in one request. The backend replaces all `Widget` and `WidgetBinding` rows for that report in a single transaction — delete existing rows, insert the new set.

Delete-then-insert instead of diffing and patching individual widgets is a deliberate choice, not laziness: widgets don't have an identity worth preserving across saves (nothing else references a `WidgetId` from outside the report it belongs to), so there's no reason to compute a diff just to arrive at the same end state.

## Explicit dependency

`WidgetBinding.DatasetId` points at a `Dataset` concept that doesn't exist anywhere in this codebase yet. This doc treats it as an opaque foreign key — a placeholder for a real thing, nothing more. What a `Dataset` actually is (presumably a saved query against some pluggable data source) is a separate milestone's problem, and that milestone hasn't been brainstormed yet. Deliberately not inventing details about it here — that's scope creep for a doc that's just supposed to describe the designer sitting on top of it.

Bottom line: this doc exists so that when the data-source/dataset milestone does get planned, the designer's requirements are already written down instead of getting reverse-engineered from scratch.
