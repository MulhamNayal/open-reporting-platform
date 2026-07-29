# Per-Widget Datasets — Design

## Overview

Today a report has exactly one dataset. `Report.DatasetId` is a single nullable int, and `ReportQueryProvider` executes it once for the whole report:

```ts
if (report.datasetId !== null) {
  setRawResult(await executeDataset(report.datasetId));
}
```

Every page, every widget renders off that one `rawResult`. Combined with the fact that `shaping.ts` performs no aggregation — `buildCategorySeriesOption` maps result rows 1:1 onto categories — whatever grain that single query returns *is* the grain of every visual on every page of the report.

This is the limitation that surfaced when three real Power BI reports were assessed for migration onto the platform. Each of them needs several grains at once. One example, all on a single report:

| Visual | Grain |
|---|---|
| detail table, 10 columns | one row per lead |
| column chart, source by month | Source × Month aggregate |
| team conversion table | Team |
| age-group donut | AgeGroup |
| agent recruitment combo chart | Month, from a *different* source table |

No single `SELECT` returns lead-level detail rows *and* Source × Month aggregates. It isn't a SQL-skill problem — the grains are mutually exclusive in one flat result. The same is true of the second report, whose four source entities are pre-aggregated at ProjectType, Team, Location, and Month × Year respectively.

This milestone makes the dataset a property of the **widget** rather than the report. A widget without its own dataset falls back to the report's, so the change is purely additive: every existing report and widget keeps working untouched, and the single-dataset path stays byte-for-byte the behaviour it is today.

Worth stating plainly: this is **not** a semantic model. There are no relationships, no joins across datasets, no measure layer. Each widget gets one flat result from one query, exactly as now — there are simply several such queries per report instead of one. Anything requiring a genuine join still gets pushed down into SQL.

## Data Model

`Widget` gains one nullable column:

```csharp
public int? DatasetId { get; set; }
```

`null` means "use the report's dataset". `Report.DatasetId` **stays** and is redefined as the report's *default* dataset — the fallback for widgets that don't name their own, the source for the Filters pane's baseline field list, and what the existing "Change data source" dialog continues to write. Keeping it is what makes this change require no data migration: every row already in `Widgets` gets `DatasetId = NULL` and resolves to exactly the dataset it renders from today.

### Why `Widget` and not `WidgetBinding`

`WidgetBinding` is the closer conceptual fit — it's the thing that names fields, and fields belong to a dataset. Two reasons against it:

- A freshly added bindable widget has `binding: null` until the user picks a field (`ReportCanvas.addWidget`, only `Table` gets a default binding). The user must be able to choose the dataset *before* choosing fields, so the dataset can't live somewhere that doesn't exist yet.
- "Which datasets does this page need?" becomes a single `Widgets` read rather than a join through `WidgetBindings`, and the frontend needs exactly that question answered to know what to fetch.

### Referential integrity

No FK constraint from `Widgets.DatasetId` to `Datasets.Id`. `WidgetService.SaveWidgetsAsync` deletes and re-inserts every widget on the page on every save, and datasets are independently deletable; a hard FK would turn "someone deleted a dataset" into a save failure on an unrelated page. Instead, the dataset id is validated at save time (below), and a widget pointing at a since-deleted dataset degrades to the existing no-data empty state rather than erroring — the same way `findMissingFields` already handles a column that disappeared from a dataset.

## Backend

`WidgetSummary` and `SaveWidgetRequest` each gain `int? DatasetId`, positioned before `Binding`. `WidgetService.SaveWidgetsAsync` persists it and `ToSummary` reads it back.

### Save-time validation

`SaveWidgetsAsync` validates the distinct non-null dataset ids in the payload against `Datasets` in one query, before `SaveChangesAsync` — following the validate-before-persist shape `DatasetService.CreateAsync` established. An unknown id throws `NotFoundException` ("No dataset found with id N."), mapped by `GlobalExceptionHandler` to 404 with a raw string body.

404 rather than 400 is the deliberate reading of the project's rule that "no entity with this id" is always `NotFoundException`. The alternative reading — that a save payload naming a nonexistent dataset is a client validation failure and belongs with the existing `WidgetValidationException` → 400 — is defensible, and `ReportCanvas.handleSave` currently only surfaces the response body as an error message on a 400. **Decision needed:** if we go with 404, `handleSave`'s error branch widens to include 404; if we go with 400, it needs no change but we bend the NotFoundException rule. This design assumes 404 + widening the catch.

`WidgetBindingValidator` is untouched. It's a pure, DB-free type→binding-shape validator, and dataset existence is neither of those things.

### Explicitly unchanged

`IDatasetService`, `DatasetService`, all four `DatasetMode` paths, both `IDataSourceProvider` implementations, `ReportService`, and the `PUT /api/reports/{id}/dataset` endpoint. This milestone adds no new backend endpoint — the frontend composes existing ones (`GET /api/datasets?connectionId=`, `POST /api/datasets/{id}/execute`).

## Frontend — Result Cache

`ReportQueryContext` becomes a small multi-dataset cache. It keeps everything it exposes today, so consumers that only care about the report default need no change:

- `rawResult` / `filteredResult` — still the **report default** dataset's result, still eagerly loaded on mount. `FiltersPane`'s empty state, the "Data table" rail view's `QueryResultGrid`, and the no-widget-selected `DataPane` field list all keep reading these unchanged.
- **new** `datasetResults: Map<number, QueryResult>` — every loaded dataset, keyed by id, including the default.
- **new** `ensureDatasets(ids: number[]): Promise<void>` — fetches any id not already cached (or in flight), then merges into the map. Idempotent, safe to call on every widget-load effect.
- **new** `datasetErrors: Map<number, string>` — per-dataset failure, so one broken query doesn't blank the whole report.
- **new** `filteredResultFor(datasetId: number | null): QueryResult | null` — resolves `null` to the report default, returns the cached result with the page's filters applied, or `null` if not loaded.

Loading is lazy and incremental rather than up-front: `ReportQueryProvider` doesn't know the page's widgets (`ReportCanvas` and `ReportView` fetch those separately via `getWidgets(reportPageId)`), so hoisting widget loading into the context to compute the dataset set eagerly would be a much larger restructure for no user-visible gain. Instead each consumer calls `ensureDatasets` from its existing widget-load effect. A widget whose dataset hasn't arrived yet passes `result={null}` to `WidgetRenderer` — the existing no-data path, so no new UI.

## Frontend — Filter Semantics

This is the one genuinely new *semantic* in the milestone and the part most worth scrutinising.

A page has one `filterState` (`Record<string, string[]>`, persisted as `ReportPage.filterState`). With several datasets, it is applied **per dataset, matched by field name**. `applyFilters` already does the right thing here without modification — it drops any filter whose field isn't a column of the result:

```ts
const activeFilters = Object.entries(filterState).filter(([field, values]) => {
  const columnExists = result.columns.some((c) => c.name === field);
  return columnExists && values.length > 0;
});
```

So a `Team` filter narrows every dataset that has a `Team` column and silently no-ops on those that don't. That gives cross-dataset filtering for free, which is most of what a slicer does in the source reports.

**The limitation, stated deliberately:** matching is by column name, not by relationship. Two datasets with a `Team` column meaning different things will both be filtered, and a filter cannot reach a dataset that lacks the column even when a real relationship exists (filter `Team`, and a dataset keyed only by `TeamId` is untouched). Resolving that properly *is* building a relationship model, which is explicitly out of scope. Name matching is the honest 80% and it is predictable, which matters more than being clever.

`FiltersPane` currently derives its checkbox groups from the single `rawResult`. It now derives them from the **union of all loaded datasets' columns**, deduped by name, keeping the existing `Categorical`-only and `MAX_FILTER_VALUES = 30` rules. Distinct values for a field come from the union across every dataset that has it. This is extracted as a pure `mergeFilterableFields(results, filterState)` function so it is testable without rendering.

Two consequences to accept: the pane's contents now grow as datasets load in (a field can appear a moment after first paint), and a field present in two datasets shows the union of both value sets. Both are correct-if-surprising rather than wrong.

## Frontend — Editor Wiring

The core change is that the panes stop reading "the report's columns" and start reading "the selected widget's dataset's columns".

- `BuildTab`, `FormatTab` — `columns` comes from `filteredResultFor(selectedWidget.datasetId)` instead of `filteredResult`.
- `DataPane` — same, falling back to the report default when nothing is selected (which is what the drag-a-field-to-create-a-widget path needs, since the new widget has no dataset yet and will inherit the default).
- `WidgetRenderer` — `result={filteredResultFor(w.datasetId)}` per widget, in both `ReportCanvas` and `ReportView`.
- `findMissingFields` — unchanged signature, called with the widget's own dataset's columns.

A pure `resolveWidgetDatasetId(widgetDatasetId, reportDatasetId)` helper carries the fallback rule in one testable place rather than scattering `?? reportDatasetId` across call sites.

### Dataset picker

A **Dataset** dropdown at the top of `BuildTab`, above the field wells. Options:

- every saved dataset on the same connection as the report's default (`getDatasets(connectionId)` filtered to `isSaved`), plus
- the report's current default dataset itself even when unsaved — the "Change data source" dialog creates ad-hoc (`IsSaved = false`) datasets, and the widget's actual current source must always be visible in the list that claims to show it.

Scoping to one connection is a deliberate simplification: `getDatasets` requires a `connectionId`, and cross-connection reports would need either a new endpoint or a fan-out over every connection. Same-connection covers all three source reports. If the report has no default dataset yet the picker is disabled, matching the pane's existing "define this report's query first" state.

Changing a widget's dataset **clears its binding** — the field names in it refer to the old dataset's columns and are near-certain to be wrong against the new one. This mirrors the existing `migrateFieldsOnTypeChange` decision to rebuild rather than guess, except here there's nothing worth carrying over, so it clears outright. A confirm prompt guards the case where a binding is already configured.

## Testing Approach

- **Backend (xUnit):** `WidgetService` round-trips `DatasetId` (set, null, and changed-on-resave); an unknown dataset id throws `NotFoundException`; `null` is accepted without a lookup. In-memory DB per test with `Guid.NewGuid()` naming, per project convention. The 404 mapping itself is already covered by the existing `GlobalExceptionHandler` tests — no new mapping test needed.
- **Frontend (Vitest):** pure-function tests carry the load — `resolveWidgetDatasetId` fallback, `mergeFilterableFields` dedup/union/cap behaviour, and `applyFilters`'s existing name-mismatch no-op re-asserted as the deliberate cross-dataset semantic rather than an accident. Plus an RTL test that `ReportQueryProvider.ensureDatasets` fetches each id exactly once across repeat calls. Every new test file needs its own `afterEach(cleanup)` (RTL auto-cleanup is off).
- **Manual:** the real proof is a report with two widgets at genuinely different grains rendering correctly side by side — not reachable by unit test, since it needs a live SQL Server connection and two working datasets.

## Explicitly Out of Scope

- **Relationships / a semantic model.** No joins between datasets, no relationship-aware filter propagation, no measure layer. Filters match by column name only.
- **Cross-dataset cross-filtering.** Clicking a data point on a widget writes to the shared page `filterState`, so it propagates by the same name-matching rule as any other filter — no relationship-aware behaviour, and no attempt to map a clicked value onto a differently-named key in another dataset.
- **Removing `Report.DatasetId`.** It stays as the report default. Retiring it would break the "Change data source" flow and force a data migration for zero gain.
- **New widget types.** The combo/dual-axis and 100%-stacked charts the source reports need are separate work, tracked independently of this milestone.
- **A Series/legend well.** Charts needing a series split keep pivoting in SQL for now.
- **The `Table` widget's 8-column cap** (`WELL_SPECS`) — a one-constant change, but unrelated to datasets and not bundled here.
- **Cross-connection datasets in the picker.** Same connection as the report default only.
- **A dataset selector for the "Data table" rail view.** It keeps showing the report default; a known rough edge, not worth a control yet.
- **Any `.pbix` import tooling.** The migration of the source reports is manual by decision — their `DataModel` parts are compressed, so DAX and M can't be read out of the files regardless.
