# Dataset Storage Modes Implementation Plan

> **Status: implemented 2026-08-03/04.** All three phases are done. Two things were revised while
> building and are corrected in place below: storage mode is the author's choice for every query
> mode (an earlier draft forbade DirectQuery on stored procedures), and the migration does **not**
> backfill anything. One gap the plan missed was found during testing and fixed — a materialised
> table outliving a changed definition; see `MaterializedTableLifecycleTests`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop sending whole result sets to the browser. A dataset is currently executed in full and
serialised as JSON; every widget then reads that one array. Measured on 2026-08-03, 26 datasets sit
pinned at the 50,000-row cap totalling 466 MB and 292 seconds of load **even fully cached**, and are
still truncated (true sizes reach 222,406 rows). Ten reports take over ten seconds to open with a
warm cache.

**Architecture:** `Dataset` gains a `StorageMode` of `DirectQuery` (default — today's behaviour) or
`Import`. Import datasets are materialised into a platform-owned table (`mat.Dataset_{id}`), after
which ordinary SQL can filter, sort and page them. The single "execute and return everything" call
is replaced by three narrower query shapes — **rows (paged)**, **aggregate**, and **distinct values**
— each serving one kind of consumer. The page's `filterState` becomes a parameterised `WHERE` clause
applied to all three, so a table and a chart on the same dataset are filtered identically at source.

**Why Import at all:** 50 of the 64 datasets in use are `StoredProcedure` mode, and a procedure's
result set cannot be filtered or paged inline — `SELECT * FROM (EXEC proc) WHERE ...` is not valid
SQL. The only alternative is `INSERT INTO #temp EXEC proc` per interaction, which re-runs procedures
measured at 34–166 seconds. Materialising first is what makes SQL-side paging possible at all.

**Tech Stack:** .NET 8, EF Core code-first migrations, xUnit (all in place). React 19 + TypeScript +
MUI 9 + Vitest/RTL (all in place, no new packages). No new NuGet or npm dependencies are required —
materialisation uses `SqlBulkCopy` from `Microsoft.Data.SqlClient`, already referenced.

This plan was written after reading the approved design doc
(`docs/superpowers/specs/2026-08-03-dataset-storage-modes-design.md`), plus `Dataset.cs`,
`DatasetMode.cs`, `DatasetService.cs`, `IDatasetService.cs`, `DatasetSummary.cs`,
`DatasetsController.cs`, `SqlServerProvider.cs`, `IDataSourceProvider.cs`, `QueryResult.cs`,
`MemoryDatasetResultCache.cs`, `DatasetCacheOptions.cs`, `ReportingDbContext.cs`, `Program.cs`,
`ReportQueryContext.tsx`, `crossFilter.ts`, `mergeFilterableFields.ts`, `aggregate.ts`,
`WidgetRenderer.tsx`, `TableWidget.tsx`, `FiltersPane.tsx`, `api/datasets.ts`, and `api/widgets.ts`.

## Global Constraints

- **`DatasetMode` is not touched.** `Mode` (TableQuery/RawSql/StoredProcedure/RestQuery) describes
  *how the source is queried*. The new `StorageMode` describes *where results are served from*. They
  are orthogonal and both are needed.
- **`StorageMode` defaults to `DirectQuery`.** Existing rows keep today's behaviour with no data
  migration — the same additive shape as `Widget.DatasetId` in the per-widget-datasets milestone.
- **Storage mode is the author's choice for every query mode, and defaults to `DirectQuery`.**
  *(Revised 2026-08-03 — an earlier draft forbade DirectQuery on stored procedures. That conflated
  storage mode with pushdown capability.)* What differs by query mode is what can be pushed to the
  source: `Import` always can; `RawSql`/`TableQuery` can because the provider wraps them in a
  derived table; `StoredProcedure`/`RestQuery` on DirectQuery cannot, so they keep the row cap and
  filter client-side. `DatasetService.CanPushDownQueries` is the one place that decides.
  **No migration backfill** — existing datasets stay DirectQuery, which is how they behave today.
- **Materialised tables live in a platform-owned database, never in a user's data source.** Its
  connection string is configuration (`ConnectionStrings:MaterializationDatabase`), not a
  `DataSourceConnection` row, and must not appear in the Connections UI.
- **Filter values are always SQL parameters.** Never concatenated into the predicate. Unlike the
  existing `SelectQuery` path there is no operator allow-list to lean on here.
- **`POST /api/datasets/{id}/execute` is kept and unchanged.** It stays the small-dataset path and
  every existing consumer keeps working; the new query endpoint is additive.
- **`aggregate.ts` is not deleted.** Client-side aggregation remains the path for DirectQuery
  datasets under the row cap. This milestone adds a server-side path, it does not replace the client one.
- **The result cache from `3b1ef1f` stays.** It now caches the three narrow query shapes rather than
  whole result sets; cache keys must include the filter predicate, paging window and sort.
- `frontend/tsconfig.app.json` has `"verbatimModuleSyntax": true` — every new/edited `.ts`/`.tsx`
  uses `import type { X }` for type-only imports.
- Backend service tests use `UseInMemoryDatabase(Guid.NewGuid().ToString())` per test. Test naming:
  `MethodName_Scenario_ExpectedResult`. **Note:** `EnsureCreated()` applies the InitialCreate seed,
  so Reports 1–3 already exist — do not insert them again.
- Test gates: `dotnet test Backend.Tests/Backend.Tests.csproj` and, from `frontend/`,
  `npm run verify` (`tsc -b && vitest run`) — never bare `npm test`. On this machine every `dotnet`
  command needs `DOTNET_ROLL_FORWARD=LatestMajor`; four `ExceptionMappingIntegrationTests` failures
  are pre-existing and environmental.
- Commits stage exact file paths, never `git add -A`. Messages lowercase, imperative,
  `backend:`/`frontend:` prefixed. **No `Co-Authored-By`, no AI attribution, no AI-formulaic
  phrasing — these must read like Mulham wrote them.**
- **Do not push.** `main` deploys on push; pushing requires Mulham's explicit go-ahead in the moment.
- **Correction to CLAUDE.md:** it states every test file needs its own `afterEach(cleanup)`. That is
  outdated — `frontend/src/setupTests.ts` registers a global one and is wired via `vite.config.ts`
  `setupFiles`. A per-file cleanup is redundant. Fix CLAUDE.md in Task 11.

## Open Decisions (resolve before Task 2)

1. ~~Which SQL Server hosts the materialisation database?~~ **Resolved 2026-08-03.** Two databases
   on the same instance: `ReportingDb` (application state, EF migrations, backed up) and
   `ReportingCacheDb` (materialised tables in a `mat` schema, runtime-created, never backed up).
   Both already exist locally and `ConnectionStrings:ReportingCacheDatabase` is configured. **Task 2
   is unblocked.** For deployment, note a company-owned `ReportingDb` already exists on the shared
   staging instance — those names would collide there.
2. **Refresh cadence default.** Plan assumes nightly. Several of these reports are weekly.
3. **Is DirectQuery worth offering for `RawSql` at all,** or should Import be the default for
   everything until a real-time requirement appears? Plan implements both; making Import universal
   would let Tasks 6 and 8 be dropped.

---

## Phase 1 — Materialisation (Tasks 1–5)

Delivers Import datasets with manual refresh, and paged/filtered querying over them. **This is the
stage that fixes the measured problem**; Phase 2 and 3 are refinements.

### Task 1: `StorageMode` on `Dataset`, migration, DTO plumbing

**Files:** `backend/Models/DatasetStorageMode.cs` (new), `backend/Models/Dataset.cs`,
`backend/Services/Datasets/DatasetSummary.cs`, `CreateDatasetRequest.cs`, `UpdateDatasetRequest.cs`,
`backend/Services/Datasets/DatasetService.cs`, `frontend/src/api/datasets.ts`, new migration.

- [ ] Add `DatasetStorageMode` enum (`DirectQuery`, `Import`).
- [ ] Add to `Dataset`: `StorageMode` (default `DirectQuery`), `MaterializedTableName`,
      `LastMaterializedAtUtc`, `MaterializedRowCount`, `LastMaterializeError`.
- [ ] Migration. **Verify the generated `defaultValue` for `StorageMode` is `DirectQuery` (0)** — EF
      generated `false` for a `bool` in `AddReportActiveAndUsage` and silently marked 55 rows
      inactive. Check the generated file, do not assume.
- [ ] Add `StorageMode` to the create/update request records **as a trailing parameter with a
      default**, so existing positional call sites keep compiling.
- [ ] Validate storage mode against `Mode` in `CreateAsync`/`UpdateAsync`; throw
      `InvalidOperationException` for `StoredProcedure`/`RestQuery` + `DirectQuery`.
- [ ] Mirror the fields in the frontend `Dataset` interface.
- [ ] Tests: default is `DirectQuery`; proc + DirectQuery rejected; proc + Import accepted; round-trip.

### Task 2: Materialisation database and schema management

**Blocked on Open Decision 1.**

**Files:** `backend/Services/Materialization/IMaterializationStore.cs` (new),
`SqlMaterializationStore.cs` (new), `MaterializationOptions.cs` (new), `backend/Program.cs`,
`backend/appsettings.Development.json`.

- [ ] `MaterializationOptions` bound from `Materialization` config section (connection string,
      schema name defaulting to `mat`, command timeout). Follow the `SqlServerProviderOptions` shape.
- [ ] `IMaterializationStore` with `EnsureTableAsync(datasetId, columns)`, `SwapAsync`, `DropAsync`.
- [ ] Map `ColumnDescriptor.NativeType` → target column type. Unknown types fall back to
      `nvarchar(max)`. Add a `__RowNumber int IDENTITY` column — paging without a stable order can
      repeat or skip rows.
- [ ] Register in `Program.cs`.
- [ ] Tests: type mapping, table naming, identifiers are quoted/escaped.

### Task 3: Materialise a dataset

**Files:** `backend/Services/Materialization/IMaterializationService.cs` (new),
`MaterializationService.cs` (new), `backend/Services/Datasets/DatasetService.cs`.

- [ ] `MaterializeAsync(datasetId)`: execute the source via the existing provider → create
      `mat.Dataset_{id}__loading` → `SqlBulkCopy` the rows → swap atomically → stamp
      `LastMaterializedAtUtc`/`MaterializedRowCount`.
- [ ] **Row limit does not apply to materialisation.** The cap exists because rows go to the
      browser; nothing goes to the browser here. Load the full result.
- [ ] On failure: record `LastMaterializeError`, leave the previous table untouched, throw.
- [ ] Detect a column-set change vs the existing table and rebuild rather than fail.
- [ ] Materialise on first use if `MaterializedTableName` is null.
- [ ] Tests: creates and populates; swap is atomic; failure preserves the previous copy; column
      drift triggers rebuild; row limit is ignored.

### Task 4: The three query shapes

**Files:** `backend/Services/Datasets/DatasetQuery.cs` (new — request records),
`backend/Services/Datasets/IDatasetQueryService.cs` (new), `DatasetQueryService.cs` (new).

- [ ] Request records: `QueryRowsRequest(filters, sort, skip, take, columns)`,
      `QueryAggregateRequest(filters, categoryField, valueFields, aggregations)`,
      `QueryDistinctRequest(filters, column)`.
- [ ] Translate `filterState` (`Dictionary<string, string[]>`, matching the frontend shape) into a
      parameterised `WHERE col IN (@p0, @p1, ...)`, one clause per field, ANDed.
- [ ] Build the three SQL shapes against `mat.Dataset_{id}`. Reuse the aggregation function names
      from `WidgetBinding.Aggregations` — they map 1:1 to SQL by design.
- [ ] Validate every column name against the dataset's stored `Columns` before it reaches SQL.
- [ ] Cap `take` (suggest 500) so a caller cannot request the whole table back.
- [ ] Tests: predicate generation and parameterisation; unknown column rejected; each aggregation
      function; empty filter state produces no `WHERE`; paging maths.

### Task 5: Query endpoints

**Files:** `backend/Controllers/DatasetsController.cs`, `IDatasetService.cs`, `DatasetService.cs`.

- [ ] `POST /api/datasets/{id}/query/rows`, `/query/aggregate`, `/query/distinct`.
- [ ] `POST /api/datasets/{id}/materialize` for manual refresh.
- [ ] Extend the result cache key to include the filter predicate, sort, paging window and
      aggregation spec.
- [ ] Integration tests through `ApiWebApplicationFactory` for status codes — controller-level tests
      cannot observe `GlobalExceptionHandler`.

**Gate:** backend tests green. Manually materialise `REN Analysis` (dataset 18) and confirm a paged
query returns in well under a second against 77,740 rows.

---

## Phase 2 — Frontend consumption (Tasks 6–9)

### Task 6: API layer

**Files:** `frontend/src/api/datasets.ts`.

- [ ] `queryRows`, `queryAggregate`, `queryDistinct`, `materializeDataset` + typed requests.

### Task 7: `ReportQueryContext` — from one result to per-widget queries

**Files:** `frontend/src/reportEditor/ReportQueryContext.tsx`.

- [ ] Keep `datasetResults` for DirectQuery datasets under the row cap — the existing path stays.
- [ ] Add per-widget query state for Import datasets, keyed by widget id.
- [ ] Filter changes re-issue queries for affected widgets rather than re-filtering an array.
- [ ] Keep `rawResult`/`filteredResult` exposed so existing consumers compile unchanged.

### Task 8: Widgets

**Files:** `WidgetRenderer.tsx`, `TableWidget.tsx`, `FiltersPane.tsx`, `mergeFilterableFields.ts`.

- [ ] Table: paged fetch, next/prev, total row count.
- [ ] Charts: use `queryAggregate` for Import datasets; keep `aggregate.ts` for DirectQuery.
- [ ] Filters pane: `queryDistinct` per column instead of scanning every row.
- [ ] Preserve the `findMissingFields` stale-binding message.

### Task 9: Storage mode UI + staleness

**Files:** `DatasetsPage.tsx`, `ReportView.tsx` or `Ribbon.tsx`.

- [ ] Storage mode selector on the dataset form, disabled where the query mode forces Import.
- [ ] Show `LastMaterializedAtUtc` ("as of 03:00") on Import-backed reports. **Without this, imported
      data is indistinguishable from live data.**
- [ ] "Refresh now" action, with the error surfaced if materialisation failed.

**Gate:** `npm run verify` green; open `REN Analysis Report` and confirm sub-second paging and a
chart total computed over the full table rather than a truncated set.

---

## Phase 3 — Scheduled refresh (Task 10)

Deliberately last. It introduces a background job runner, which is new infrastructure for this
codebase and is better added to something already working.

### Task 10: Scheduled materialisation

- [ ] `RefreshCron` or `RefreshIntervalMinutes` on `Dataset`.
- [ ] `IHostedService` that materialises due datasets, one at a time (these queries are heavy).
- [ ] Skip if a manual refresh is already running; record failures without stopping the loop.

### Task 11: Documentation

- [ ] Update `CLAUDE.md`: document `StorageMode`, and **fix the stale claim about
      `afterEach(cleanup)`** — `setupTests.ts` registers it globally.

---

## Verification

- **Backend:** `dotnet test Backend.Tests/Backend.Tests.csproj` (with `DOTNET_ROLL_FORWARD=LatestMajor`).
- **Frontend:** `npm run verify` from `frontend/`.
- **End-to-end, against the measured baseline:** REN Analysis is 49 MB / 30.1s warm at the 50,000-row
  cap today. After Phase 2 the same report should page in under a second while covering all 77,740
  rows, and its chart totals should be computed over the full table. Re-run the sweep in
  `scratchpad/perf-datasets.csv` to confirm the 26 capped datasets no longer dominate load.

## Interim mitigation (do this regardless)

Until Phase 1 lands, the 26 datasets pinned at 50,000 rows should be dropped to **5,000**. Measured
on REN Analysis this takes warm load from 30.08s to 2.32s. It does not fix truncation — those
reports were already truncated at 50,000 — but it makes them usable. This is a one-line change per
dataset via `PUT /api/datasets/{id}`, not code.
