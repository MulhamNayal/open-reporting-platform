# Per-Widget Datasets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each widget render from its own dataset instead of every widget on a report sharing one. A report currently executes exactly one query (`ReportQueryProvider` → `executeDataset(report.datasetId)`) and, because `shaping.ts` does no aggregation, that one query's grain is forced onto every visual. This blocks any report that needs several grains at once.

**Architecture:** `Widget` gains a nullable `DatasetId`; `null` falls back to `Report.DatasetId`, which stays as the report's *default*. That makes the change additive — existing rows get `NULL` and behave exactly as today. `ReportQueryContext` grows from a single `rawResult` into a lazy `Map<datasetId, QueryResult>` cache with an `ensureDatasets(ids)` entry point and a `filteredResultFor(datasetId)` accessor, while continuing to expose `rawResult`/`filteredResult` as the default dataset's results so existing consumers need no change. The page's single `filterState` is applied per dataset matched by column name — `applyFilters` already no-ops on absent columns, so this needs no change to that function. `BuildTab` gains a dataset picker; changing a widget's dataset clears its binding.

**Tech Stack:** .NET 8, EF Core code-first migrations, xUnit (all in place). React 19 + TypeScript + MUI 9 + Vitest/RTL (all in place, no new packages).

This plan was written after reading the approved design doc (`docs/superpowers/specs/2026-07-29-per-widget-datasets-design.md`), plus `Widget.cs`, `WidgetBinding.cs`, `Report.cs`, `Dataset.cs`, `ReportingDbContext.cs`, `WidgetService.cs`, `WidgetSummary.cs`, `SaveWidgetsRequest.cs`, `WidgetBindingValidator.cs`, `IDatasetService.cs`, `DatasetSummary.cs`, `ReportQueryContext.tsx`, `ReportCanvas.tsx`, `ReportView.tsx`, `FiltersPane.tsx`, `crossFilter.ts`, `staleBindingCheck.ts`, `fieldAssignment.ts`, `shaping.ts`, `api/widgets.ts`, `api/reports.ts`, and `api/datasets.ts`.

## Global Constraints

- **`Report.DatasetId` is not removed and not renamed.** It becomes the report *default*. The `PUT /api/reports/{id}/dataset` endpoint and the "Change data source" dialog keep writing it, unchanged.
- **`Widgets.DatasetId` is nullable with no FK constraint** to `Datasets.Id`. Widgets are delete-and-reinserted wholesale on every page save and datasets are independently deletable — a hard FK would make an unrelated dataset deletion break saves. Validation happens at save time instead.
- **No data migration.** Existing widget rows get `NULL` and resolve to the report default, which is the dataset they already render from.
- **`WidgetBindingValidator` is not touched.** It is a pure, DB-free type→binding-shape validator; dataset existence is neither.
- **`applyFilters` in `crossFilter.ts` is not modified.** Its existing `columnExists` guard *is* the per-dataset filter semantic — call it once per dataset.
- **`shaping.ts`, `WidgetRenderer`, `fieldAssignment.ts`, and every `widgets/*Widget.tsx` are untouched.** This milestone changes *which* result reaches a widget, never how a result is shaped or which wells a type has.
- **No new backend endpoint.** The frontend composes `GET /api/datasets?connectionId=`, `POST /api/datasets/{id}/execute`, and the existing widget endpoints.
- `frontend/tsconfig.app.json` has `"verbatimModuleSyntax": true` — every new/edited `.ts`/`.tsx` uses `import type { X }` for type-only imports.
- RTL automatic cleanup is **off** (no Vitest globals) — every new test file declares its own `afterEach(cleanup)`.
- Backend service tests use `UseInMemoryDatabase(Guid.NewGuid().ToString())` per test. Test naming: `MethodName_Scenario_ExpectedResult`.
- Test gates: `dotnet test Backend.Tests/Backend.Tests.csproj` and, from `frontend/`, `npm run verify` (`tsc -b && vitest run`) — never bare `npm test`.
- Commits stage exact file paths, never `git add -A`. Messages lowercase, imperative, `backend:`/`frontend:` prefixed. **No `Co-Authored-By`, no AI attribution, no AI-formulaic phrasing — these must read like Mulham wrote them.**
- **Do not push.** `main` deploys on push; pushing requires Mulham's explicit go-ahead in the moment.

## Open Decision (resolve before Task 2)

`SaveWidgetsAsync` rejecting an unknown dataset id: `NotFoundException` → 404, or `WidgetValidationException` → 400?

- **404** follows the project's explicit "no entity with this id → `NotFoundException`" rule, and requires widening `ReportCanvas.handleSave`'s error branch (it currently only reads the response body on a 400).
- **400** needs no frontend change and groups it with the other save-payload rejections, but bends that rule.

This plan implements **404 + widening the catch** (Tasks 2 and 7). If Mulham prefers 400, swap the exception type in Task 2 Step 2 and skip Task 7 Step 4.

---

### Task 1: Backend — `Widget.DatasetId`, migration, and DTO plumbing

**Files:**
- Modify: `backend/Models/Widget.cs`
- Modify: `backend/Services/Widgets/WidgetSummary.cs`
- Modify: `backend/Services/Widgets/SaveWidgetsRequest.cs`
- Modify: `backend/Services/Widgets/WidgetService.cs`
- Create: `backend/Migrations/<timestamp>_AddWidgetDatasetId.cs` (generated)

**Interfaces:**
- Produces: `Widget.DatasetId`, `WidgetSummary.DatasetId`, `SaveWidgetRequest.DatasetId` — all `int?`. Task 2 validates them; Tasks 3–8 consume them from the frontend.

- [ ] Step 1: In `backend/Models/Widget.cs`, add the property after `Type` (grouping it with the widget's other identity/source fields rather than after `Binding`):
  ```csharp
  public WidgetType Type { get; set; }

  // null means "use the report's default dataset" (Report.DatasetId). No FK to Datasets:
  // widgets are delete-and-reinserted on every page save and datasets are independently
  // deletable, so a constraint here would break unrelated saves. Validated at save time.
  public int? DatasetId { get; set; }
  ```

- [ ] Step 2: In `backend/Services/Widgets/WidgetSummary.cs`, add `int? DatasetId` immediately before `Binding`:
  ```csharp
  public record WidgetSummary(
      int Id,
      WidgetType Type,
      int X,
      int Y,
      int W,
      int H,
      string Title,
      string? Content,
      int? DatasetId,
      WidgetBindingSummary? Binding);
  ```

- [ ] Step 3: In `backend/Services/Widgets/SaveWidgetsRequest.cs`, add `int? DatasetId` in the same position:
  ```csharp
  public record SaveWidgetRequest(
      WidgetType Type,
      int X,
      int Y,
      int W,
      int H,
      string Title,
      string? Content,
      int? DatasetId,
      SaveWidgetBindingRequest? Binding);
  ```

- [ ] Step 4: In `backend/Services/Widgets/WidgetService.cs`, persist it in `SaveWidgetsAsync`'s widget construction:
  ```csharp
  var widget = new Widget
  {
      ReportPageId = reportPageId,
      Type = widgetRequest.Type,
      X = widgetRequest.X,
      Y = widgetRequest.Y,
      W = widgetRequest.W,
      H = widgetRequest.H,
      Title = widgetRequest.Title,
      Content = widgetRequest.Content,
      DatasetId = widgetRequest.DatasetId
  };
  ```

- [ ] Step 5: In the same file, read it back in `ToSummary`:
  ```csharp
  return new WidgetSummary(widget.Id, widget.Type, widget.X, widget.Y, widget.W, widget.H, widget.Title, widget.Content, widget.DatasetId, bindingSummary);
  ```

- [ ] Step 6: Build first so the migration is generated against compiling code:
  ```bash
  dotnet build backend/Backend.csproj
  ```
  Then generate the migration:
  ```bash
  dotnet ef migrations add AddWidgetDatasetId --project backend/Backend.csproj
  ```
  Open the generated file and confirm it contains exactly one `AddColumn<int>` for `DatasetId` on `Widgets` with `nullable: true`, and **no** `AddForeignKey`. If it contains anything else (a stray seed-data change, an unrelated column), stop — that means the model and the last migration had already drifted, which is a separate problem to raise rather than fold in here.

- [ ] Step 7: Apply it to the local dev database:
  ```bash
  dotnet ef database update --project backend/Backend.csproj
  ```

- [ ] Step 8: Fix the existing tests broken by the two positional record changes. `WidgetSummary` and `SaveWidgetRequest` are positional records, so every existing construction site needs the new argument. Find them:
  ```bash
  dotnet build backend/Backend.csproj
  dotnet build Backend.Tests/Backend.Tests.csproj
  ```
  Add `null` in the new position at each reported site (in `Backend.Tests/`, expect hits in the widget service and widget controller test files). Do not change any other argument.

- [ ] Step 9: Run the full backend suite: `dotnet test Backend.Tests/Backend.Tests.csproj` — expect all passing, with no behaviour change (every widget still resolves to the report default because `DatasetId` is `null` everywhere).

- [ ] Step 10: Commit:
  ```bash
  git add backend/Models/Widget.cs backend/Services/Widgets/WidgetSummary.cs backend/Services/Widgets/SaveWidgetsRequest.cs backend/Services/Widgets/WidgetService.cs backend/Migrations
  git commit -m "backend: add nullable DatasetId to widgets"
  ```
  Stage the test-file fixes from Step 8 in this same commit if any were needed.

---

### Task 2: Backend — validate the dataset id at save time

**Files:**
- Modify: `backend/Services/Widgets/WidgetService.cs`
- Modify: `Backend.Tests/WidgetServiceTests.cs` (or create if the widget service tests live elsewhere — check first)

**Interfaces:**
- Consumes: `Widget.DatasetId`, `SaveWidgetRequest.DatasetId` (Task 1).
- Produces: nothing consumed by later tasks; Task 7 Step 4 handles the resulting 404 on the frontend.

- [ ] Step 1: Confirm `Backend.Exceptions.NotFoundException` is already imported in `WidgetService.cs` — it is (`using Backend.Exceptions;` is present for `EnsureReportPageExistsAsync`). No new using needed.

- [ ] Step 2: In `SaveWidgetsAsync`, add the dataset check immediately after the existing binding-validation loop and **before** any `_context` mutation, so a bad payload never partially deletes the page's widgets:
  ```csharp
  foreach (var widgetRequest in request.Widgets)
  {
      var validation = _validator.Validate(widgetRequest.Type, widgetRequest.Binding);
      if (!validation.IsValid)
      {
          throw new WidgetValidationException(validation.Error!);
      }
  }

  await EnsureDatasetsExistAsync(request.Widgets);

  var existingWidgets = await _context.Widgets.Where(w => w.ReportPageId == reportPageId).ToListAsync();
  ```

- [ ] Step 3: Add the private helper alongside `EnsureReportPageExistsAsync`:
  ```csharp
  // Validates every distinct dataset id in the payload in one round-trip, before any
  // persistence — the same validate-before-persist shape DatasetService.CreateAsync uses.
  // A null DatasetId means "use the report default" and needs no lookup.
  private async Task EnsureDatasetsExistAsync(IReadOnlyList<SaveWidgetRequest> widgets)
  {
      var datasetIds = widgets
          .Where(w => w.DatasetId.HasValue)
          .Select(w => w.DatasetId!.Value)
          .Distinct()
          .ToList();

      if (datasetIds.Count == 0)
      {
          return;
      }

      var foundIds = await _context.Datasets
          .Where(d => datasetIds.Contains(d.Id))
          .Select(d => d.Id)
          .ToListAsync();

      var missingId = datasetIds.FirstOrDefault(id => !foundIds.Contains(id));
      if (missingId != 0)
      {
          throw new NotFoundException($"No dataset found with id {missingId}.");
      }
  }
  ```

- [ ] Step 4: Locate the existing widget service tests (`ls Backend.Tests/`) and add four tests following the file's established in-memory-DB setup and `MethodName_Scenario_ExpectedResult` naming:
  - `SaveWidgetsAsync_WidgetWithDatasetId_PersistsAndReturnsIt` — seed a dataset, save a widget naming it, assert the returned summary's `DatasetId` matches and a re-fetch via `GetWidgetsAsync` agrees.
  - `SaveWidgetsAsync_WidgetWithNullDatasetId_PersistsNull` — assert `DatasetId` round-trips as `null` and that no dataset needs to exist for the save to succeed.
  - `SaveWidgetsAsync_ChangedDatasetIdOnResave_PersistsTheNewValue` — save with dataset A, re-save the same page with dataset B, assert B. This is the case the delete-and-reinsert path could plausibly get wrong.
  - `SaveWidgetsAsync_UnknownDatasetId_ThrowsNotFoundException` — assert `NotFoundException` and, importantly, that the page's pre-existing widgets are **still present** afterwards (proving the check ran before the `RemoveRange`).

- [ ] Step 5: Run `dotnet test Backend.Tests/Backend.Tests.csproj` — expect all passing.

- [ ] Step 6: Commit:
  ```bash
  git add backend/Services/Widgets/WidgetService.cs Backend.Tests/
  git commit -m "backend: reject widgets referencing an unknown dataset"
  ```

---

### Task 3: Frontend — types and pure helpers

**Files:**
- Modify: `frontend/src/api/widgets.ts`
- Create: `frontend/src/reportEditor/widgetDataset.ts`
- Create: `frontend/src/reportEditor/widgetDataset.test.ts`

**Interfaces:**
- Produces: `WidgetSummary.datasetId` / `SaveWidgetRequest.datasetId` (both `number | null`), and `resolveWidgetDatasetId(widgetDatasetId, reportDatasetId): number | null`. Consumed by Tasks 4–8.

- [ ] Step 1: In `frontend/src/api/widgets.ts`, add `datasetId: number | null;` to both `WidgetSummary` and `SaveWidgetRequest`, before `binding` in each, mirroring the backend record order:
  ```typescript
  export interface WidgetSummary {
    id: number;
    type: WidgetType;
    x: number;
    y: number;
    w: number;
    h: number;
    title: string;
    content: string | null;
    datasetId: number | null;
    binding: WidgetBindingSummary | null;
  }

  export interface SaveWidgetRequest {
    type: WidgetType;
    x: number;
    y: number;
    w: number;
    h: number;
    title: string;
    content: string | null;
    datasetId: number | null;
    binding: SaveWidgetBindingRequest | null;
  }
  ```

- [ ] Step 2: Create `frontend/src/reportEditor/widgetDataset.ts`:
  ```typescript
  // A widget's dataset falls back to the report's default when it doesn't name its own.
  // Kept as one function so the fallback rule lives in a single testable place rather
  // than as a scattered `?? reportDatasetId` at every call site.
  export function resolveWidgetDatasetId(
    widgetDatasetId: number | null | undefined,
    reportDatasetId: number | null,
  ): number | null {
    return widgetDatasetId ?? reportDatasetId;
  }
  ```

- [ ] Step 3: Create `frontend/src/reportEditor/widgetDataset.test.ts`:
  ```typescript
  import { describe, expect, it } from "vitest";
  import { resolveWidgetDatasetId } from "./widgetDataset";

  describe("resolveWidgetDatasetId", () => {
    it("uses the widget's own dataset when it has one", () => {
      expect(resolveWidgetDatasetId(7, 3)).toBe(7);
    });

    it("falls back to the report default when the widget has none", () => {
      expect(resolveWidgetDatasetId(null, 3)).toBe(3);
      expect(resolveWidgetDatasetId(undefined, 3)).toBe(3);
    });

    it("returns null when neither is set", () => {
      expect(resolveWidgetDatasetId(null, null)).toBeNull();
    });

    it("does not treat dataset id 0 as absent", () => {
      expect(resolveWidgetDatasetId(0, 3)).toBe(0);
    });
  });
  ```
  The last case is why this uses `??` and not `||` — worth pinning even though ids are identity-seeded from 1.

- [ ] Step 4: Run `npm run verify` from `frontend/`. Expect `tsc -b` failures at every `SaveWidgetRequest`/`WidgetSummary` construction site (`ReportCanvas.handleSave`, `ReportCanvas`'s inline `WidgetRenderer` widget object, `toWidgetDrafts`, and any test fixtures). **Leave them failing** — Tasks 6 and 8 fix them properly. Note the list for those tasks.

- [ ] Step 5: Do not commit a red build. Fold this task's files into Task 6's commit, or if you want an isolated commit, add `datasetId: null` at each site now as a placeholder and let Task 6 replace it. Prefer the former.

---

### Task 4: Frontend — multi-dataset cache in `ReportQueryContext`

**Files:**
- Modify: `frontend/src/reportEditor/ReportQueryContext.tsx`
- Modify: `frontend/src/reportEditor/ReportQueryContext.test.tsx`

**Interfaces:**
- Consumes: `resolveWidgetDatasetId` (Task 3).
- Produces: `datasetResults`, `datasetErrors`, `ensureDatasets(ids)`, `filteredResultFor(datasetId)`, and `reportDatasetId` on the context value. Consumed by Tasks 5, 6, 8.

- [ ] Step 1: Extend `ReportQueryContextValue` with the new members, keeping every existing one:
  ```typescript
  export interface ReportQueryContextValue {
    reportId: number;
    reportName: string | null;
    reportDatasetId: number | null;
    reportPages: ReportPage[];
    reportPageId: number | null;
    setReportPageId: (id: number) => void;
    rawResult: QueryResult | null;
    filteredResult: QueryResult | null;
    datasetResults: Map<number, QueryResult>;
    datasetErrors: Map<number, string>;
    ensureDatasets: (ids: Array<number | null>) => Promise<void>;
    filteredResultFor: (datasetId: number | null) => QueryResult | null;
    filterState: Record<string, string[]>;
    setFilterState: (next: Record<string, string[]>) => void;
    saveFilterState: () => Promise<void>;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
  }
  ```

- [ ] Step 2: Add the backing state and an in-flight guard. The ref is what makes `ensureDatasets` idempotent under React's double-invoked effects — a state-only check would let two concurrent calls both miss:
  ```typescript
  const [reportDatasetId, setReportDatasetId] = useState<number | null>(null);
  const [datasetResults, setDatasetResults] = useState<Map<number, QueryResult>>(new Map());
  const [datasetErrors, setDatasetErrors] = useState<Map<number, string>>(new Map());
  const inFlightRef = useRef<Set<number>>(new Set());
  ```
  Add `useRef` to the React import.

- [ ] Step 3: Rework `load` so the default dataset populates both `rawResult` and the map, and so a re-`load` (via `refresh`) discards stale cached results rather than serving them:
  ```typescript
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const report = await getReport(reportId);
      setReportName(report.name);
      setReportDatasetId(report.datasetId);
      const pages = await getReportPages(reportId);
      setReportPages(pages);
      const firstPageId = pages[0]?.id ?? null;
      setReportPageIdState(firstPageId);
      setFilterState(firstPageId !== null ? JSON.parse(pages[0].filterState || "{}") : {});

      // A refresh must not serve results cached before it — drop everything and
      // re-seed with the default dataset. Consumers re-request via ensureDatasets.
      inFlightRef.current.clear();
      setDatasetErrors(new Map());

      if (report.datasetId !== null) {
        const result = await executeDataset(report.datasetId);
        setRawResult(result);
        setDatasetResults(new Map([[report.datasetId, result]]));
      } else {
        setRawResult(null);
        setDatasetResults(new Map());
      }
    } catch {
      setError("Could not load this report's data.");
    } finally {
      setLoading(false);
    }
  }, [reportId]);
  ```

- [ ] Step 4: Add `ensureDatasets`. It accepts `Array<number | null>` so callers can pass raw widget dataset ids without pre-filtering, and it resolves each `null` against the report default:
  ```typescript
  const ensureDatasets = useCallback(async (ids: Array<number | null>) => {
    const wanted = [...new Set(ids.map((id) => resolveWidgetDatasetId(id, reportDatasetId)))]
      .filter((id): id is number => id !== null)
      .filter((id) => !datasetResults.has(id) && !inFlightRef.current.has(id));

    if (wanted.length === 0) {
      return;
    }

    wanted.forEach((id) => inFlightRef.current.add(id));

    await Promise.all(
      wanted.map(async (id) => {
        try {
          const result = await executeDataset(id);
          setDatasetResults((prev) => new Map(prev).set(id, result));
        } catch {
          setDatasetErrors((prev) => new Map(prev).set(id, "Could not load this dataset."));
        } finally {
          inFlightRef.current.delete(id);
        }
      }),
    );
  }, [datasetResults, reportDatasetId]);
  ```
  Note the per-dataset `catch`: one failing query must not blank the rest of the report.

- [ ] Step 5: Add `filteredResultFor`, and redefine `filteredResult` in terms of it so the two can never disagree:
  ```typescript
  const filteredResultFor = useCallback(
    (datasetId: number | null) => {
      const resolved = resolveWidgetDatasetId(datasetId, reportDatasetId);
      if (resolved === null) {
        return null;
      }
      const result = datasetResults.get(resolved);
      return result ? applyFilters(result, filterState) : null;
    },
    [datasetResults, filterState, reportDatasetId],
  );

  const filteredResult = useMemo(() => filteredResultFor(null), [filteredResultFor]);
  ```
  Delete the old `filteredResult` `useMemo` that read `rawResult` directly.

- [ ] Step 6: Add `reportDatasetId`, `datasetResults`, `datasetErrors`, `ensureDatasets`, and `filteredResultFor` to the `value` object.

- [ ] Step 7: Add tests to `ReportQueryContext.test.tsx`, following the file's existing mocking of `getReport`/`getReportPages`/`executeDataset`:
  - `ensureDatasets` fetches an uncached id once and exposes it via `filteredResultFor`.
  - Calling `ensureDatasets` twice with the same id issues exactly **one** `executeDataset` call (assert the mock's call count) — the idempotence guarantee every consumer relies on.
  - `filteredResultFor(null)` returns the report default's result.
  - `filteredResultFor(id)` returns `null` for a not-yet-loaded id rather than throwing.
  - A rejected `executeDataset` for one id records a `datasetErrors` entry and leaves the default's result intact.
  - The existing `filteredResult`/`rawResult` assertions still pass unchanged.

- [ ] Step 8: Run `npm run verify` from `frontend/`. `tsc -b` will still fail at the Task 3 sites not yet fixed — confirm no *new* failures inside `ReportQueryContext.tsx` itself, then move on.

- [ ] Step 9: Do not commit yet (build is red until Task 6). Continue.

---

### Task 5: Frontend — Filters pane over the union of loaded datasets

**Files:**
- Create: `frontend/src/reportEditor/mergeFilterableFields.ts`
- Create: `frontend/src/reportEditor/mergeFilterableFields.test.ts`
- Modify: `frontend/src/reportEditor/FiltersPane.tsx`
- Modify: `frontend/src/reportEditor/FiltersPane.test.tsx`

**Interfaces:**
- Produces: `mergeFilterableFields(results: QueryResult[]): FilterableField[]`. Consumed by `FiltersPane` and, in Tasks 6/8, given the full `datasetResults` values.

- [ ] Step 1: Create `frontend/src/reportEditor/mergeFilterableFields.ts`, lifting the existing rules out of `FiltersPane` unchanged (`Categorical` only, `MAX_FILTER_VALUES = 30`) and extending them across datasets:
  ```typescript
  import type { ColumnDescriptor, QueryResult } from "../api/datasets";
  import { classify } from "../widgets/fieldClassification";
  import { normalizeCell } from "./crossFilter";

  // Above this many distinct values, a field isn't a usable checkbox filter regardless of
  // layout — e.g. a near-unique document-number column classified as "Categorical" purely
  // by its text type. Such fields are excluded entirely rather than dumped into the pane.
  export const MAX_FILTER_VALUES = 30;

  export interface FilterableField {
    column: ColumnDescriptor;
    values: string[];
  }

  // Fields are matched across datasets by column NAME — the same rule applyFilters uses.
  // Two datasets with a same-named column contribute to one filter group whose value list
  // is the union of both. This is deliberately name-based, not relationship-based; see the
  // design doc's "Filter Semantics" section for the limitation that implies.
  export function mergeFilterableFields(results: QueryResult[]): FilterableField[] {
    const byName = new Map<string, { column: ColumnDescriptor; values: Set<string> }>();

    for (const result of results) {
      for (const column of result.columns) {
        if (classify(column.nativeType) !== "Categorical") {
          continue;
        }

        const index = result.columns.findIndex((c) => c.name === column.name);
        const entry = byName.get(column.name) ?? { column, values: new Set<string>() };
        for (const row of result.rows) {
          entry.values.add(normalizeCell(row[index]));
        }
        byName.set(column.name, entry);
      }
    }

    return [...byName.values()]
      .map(({ column, values }) => ({ column, values: [...values].sort() }))
      .filter(({ values }) => values.length <= MAX_FILTER_VALUES);
  }
  ```

- [ ] Step 2: Create `frontend/src/reportEditor/mergeFilterableFields.test.ts` covering: single result matches today's behaviour; a same-named column across two results merges into one group with the union of values sorted; a non-`Categorical` column is excluded; a field exceeding `MAX_FILTER_VALUES` is excluded *after* merging (so two results each under the cap that jointly exceed it are correctly dropped — assert this case explicitly, it's the one a naive per-result implementation gets wrong); an empty input returns `[]`.

- [ ] Step 3: Change `FiltersPane`'s props — replace `rawResult: QueryResult | null` with `results: QueryResult[]`, and derive its empty state from `results.length === 0`:
  ```typescript
  function FiltersPane({
    visible, results, filterState, onChange, crossFilter, onClearCrossFilter, onResetAll,
  }: {
    visible: boolean;
    results: QueryResult[];
    filterState: Record<string, string[]>;
    onChange: (next: Record<string, string[]>) => void;
    crossFilter?: { field: string; value: string } | null;
    onClearCrossFilter?: () => void;
    onResetAll?: () => void;
  }) {
    if (!visible) {
      return null;
    }

    if (results.length === 0) {
      return (
        <div className="pane pane-filters">
          <div className="pane-head">Filters</div>
          <div className="filters-empty">No data to filter yet — define this report's query first.</div>
        </div>
      );
    }

    const filterableFields = mergeFilterableFields(results);
    // ...rest unchanged
  ```
  Delete the now-unused local `distinctValues` and `MAX_FILTER_VALUES` from this file (they moved to the new module), and drop the now-unused `classify`/`normalizeCell` imports. Keep every remaining line — the `toggle` handler, the cross-filter chip, the reset button, and the checkbox JSX are unchanged.

- [ ] Step 4: Update `FiltersPane.test.tsx` — existing tests pass `rawResult={someResult}`; change each to `results={[someResult]}`, and the null case to `results={[]}`. Add one test proving two results with a shared column render a single merged filter group.

- [ ] Step 5: Run `npx vitest run src/reportEditor/mergeFilterableFields.test.ts src/reportEditor/FiltersPane.test.tsx` from `frontend/` — expect passing.

---

### Task 6: Frontend — wire `ReportCanvas` to per-widget datasets

**Files:**
- Modify: `frontend/src/pages/ReportCanvas.tsx`
- Modify: `frontend/src/widgets/widgetDraftReducer.ts`
- Modify: `frontend/src/widgets/widgetDraftReducer.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3, 4, 5.
- Produces: a `datasetChanged` reducer action, consumed by Task 7's picker.

- [ ] Step 1: In `frontend/src/widgets/widgetDraftReducer.ts`, add `datasetId: number | null` to `WidgetDraft`, and a `datasetChanged` action. Changing the dataset clears the binding — the old field names refer to the previous dataset's columns:
  ```typescript
  case "datasetChanged":
    return state.map((w) => (w.id === action.id ? { ...w, datasetId: action.datasetId, binding: null } : w));
  ```
  Add the action to the reducer's action union: `{ type: "datasetChanged"; id: number; datasetId: number | null }`.

- [ ] Step 2: Add reducer tests: `datasetChanged` sets the id and nulls the binding; it leaves other widgets untouched; `added` defaults `datasetId` to `null`; `typeChanged` preserves `datasetId` (it currently rebuilds the binding — make sure the dataset survives that).

- [ ] Step 3: In `ReportCanvas.tsx`, pull the new context members in the `useReportQuery()` destructure:
  ```typescript
  const { reportId, reportName: fetchedReportName, reportDatasetId, reportPages, reportPageId, setReportPageId, filteredResult, filteredResultFor, datasetResults, ensureDatasets, filterState, setFilterState, saveFilterState, rawResult, loading: queryLoading, refresh } = useReportQuery();
  ```

- [ ] Step 4: Carry `datasetId` through `toWidgetDrafts`:
  ```typescript
  return summaries.map((s) => ({
    id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h, title: s.title, content: s.content,
    datasetId: s.datasetId,
    binding: s.binding
      ? { categoryField: s.binding.categoryField, valueFields: s.binding.valueFields, formatOptions: parseFormatOptions(s.binding.formatOptions) }
      : null,
  }));
  ```

- [ ] Step 5: Request the page's datasets once widgets have loaded. Extend the existing `getWidgets` effect rather than adding a second one, so the fetch is triggered by the same data that determines it:
  ```typescript
  getWidgets(reportPageId)
    .then((summaries) => {
      dispatch({ type: "loaded", widgets: toWidgetDrafts(summaries) });
      setWidgetsLoaded(true);
      void ensureDatasets(summaries.map((s) => s.datasetId));
    })
  ```
  `ensureDatasets` is deliberately **not** added to this effect's dependency array — it changes identity whenever `datasetResults` does, which would re-run the widget fetch on every dataset load. It is idempotent and the effect only needs the value at call time. Add an `// eslint-disable-next-line react-hooks/exhaustive-deps` above the dep array with a one-line reason if the lint config flags it.

- [ ] Step 6: Add `datasetId` to the two places `addWidget` and the `DataPane` quick-add construct a widget — both default to `null` (inherit the report default):
  ```typescript
  // in addWidget's dispatch
  content: type === "Text" ? "" : null,
  datasetId: null,
  ```
  and in the `onSmartAdd` no-selection branch:
  ```typescript
  widget: { id: newId, type: "Bar", ...nextWidgetPosition(), w: 4, h: 3, title: "New Bar widget", content: null, datasetId: null, binding },
  ```
  `duplicateWidget` spreads `...source`, so it already carries the dataset — no change.

- [ ] Step 7: Add `datasetId` to `handleSave`'s payload:
  ```typescript
  const payload: SaveWidgetRequest[] = widgets.map((w) => ({
    type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, title: w.title, content: w.content,
    datasetId: w.datasetId,
    binding: w.binding
      ? { categoryField: w.binding.categoryField, valueFields: w.binding.valueFields, formatOptions: JSON.stringify(w.binding.formatOptions) }
      : null,
  }));
  ```

- [ ] Step 8: Give each widget its own result. In the canvas map, replace `result={filteredResult}` on `WidgetRenderer` with `result={filteredResultFor(w.datasetId)}`, and add `datasetId: w.datasetId` to the inline widget object passed to it:
  ```tsx
  <WidgetRenderer
    widget={{
      id: w.id, type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, title: w.title, content: w.content,
      datasetId: w.datasetId,
      binding: w.binding
        ? { categoryField: w.binding.categoryField, valueFields: w.binding.valueFields, formatOptions: JSON.stringify(w.binding.formatOptions) }
        : null,
    }}
    result={filteredResultFor(w.datasetId)}
    onDataPointClick={handleDataPointClick}
    hideTitle
  />
  ```

- [ ] Step 9: Point the three panes at the *selected widget's* dataset. Add a single derived value near the other `widgets.find(...)` lookups, then use it:
  ```typescript
  const selectedWidget = widgets.find((w) => w.id === selectedWidgetId) ?? null;
  const selectedColumns = (selectedWidget ? filteredResultFor(selectedWidget.datasetId) : filteredResult)?.columns ?? [];
  ```
  Replace `columns={filteredResult?.columns ?? []}` with `columns={selectedColumns}` on `BuildTab`, `FormatTab`, and `DataPane`. Also replace the four repeated `widgets.find((w) => w.id === selectedWidgetId) ?? null` expressions with `selectedWidget` while you're in there — same value, and this is a touched line, not a drive-by tidy of untouched code.

- [ ] Step 10: Give `FiltersPane` every loaded dataset:
  ```tsx
  <FiltersPane
    visible={filtersVisible}
    results={[...datasetResults.values()]}
    filterState={filterState}
    onChange={setFilterState}
    crossFilter={crossFilter}
    onClearCrossFilter={handleClearCrossFilter}
    onResetAll={handleResetAllFilters}
  />
  ```

- [ ] Step 11: Run `npm run verify` from `frontend/` — expect **clean** now. This is the first green build since Task 3. If `tsc` still reports `datasetId` errors, they're construction sites this task's steps missed; fix each by threading the real value, never by casting.

- [ ] Step 12: Commit Tasks 3–6 together (they form the first coherent green state):
  ```bash
  git add frontend/src/api/widgets.ts frontend/src/reportEditor/widgetDataset.ts frontend/src/reportEditor/widgetDataset.test.ts frontend/src/reportEditor/ReportQueryContext.tsx frontend/src/reportEditor/ReportQueryContext.test.tsx frontend/src/reportEditor/mergeFilterableFields.ts frontend/src/reportEditor/mergeFilterableFields.test.ts frontend/src/reportEditor/FiltersPane.tsx frontend/src/reportEditor/FiltersPane.test.tsx frontend/src/pages/ReportCanvas.tsx frontend/src/widgets/widgetDraftReducer.ts frontend/src/widgets/widgetDraftReducer.test.ts
  git commit -m "frontend: render each widget from its own dataset"
  ```

---

### Task 7: Frontend — dataset picker in `BuildTab`

**Files:**
- Modify: `frontend/src/reportEditor/BuildTab.tsx`
- Modify: `frontend/src/reportEditor/BuildTab.test.tsx`
- Modify: `frontend/src/pages/ReportCanvas.tsx`

**Interfaces:**
- Consumes: `datasetChanged` (Task 6), `getDatasets` from `api/datasets`, `reportDatasetId` (Task 4).

- [ ] Step 1: In `ReportCanvas.tsx`, load the candidate dataset list. It is scoped to the connection of the report's default dataset — `getDatasets` requires a `connectionId`, and cross-connection reports would need a new endpoint (out of scope per the design doc):
  ```typescript
  const [availableDatasets, setAvailableDatasets] = useState<DatasetSummary[]>([]);

  useEffect(() => {
    if (reportDatasetId === null) {
      setAvailableDatasets([]);
      return;
    }
    void (async () => {
      try {
        const all = await getDatasets(0); // placeholder — see Step 2
        setAvailableDatasets(all);
      } catch {
        setAvailableDatasets([]);
      }
    })();
  }, [reportDatasetId]);
  ```

- [ ] Step 2: The connection id isn't on `Report` — only the dataset id is. Resolve it from the default dataset itself. There is no `GET /api/datasets/{id}`, so read it from the already-cached list only if present; otherwise the picker needs the connection. **Check first** whether `DatasetsController` exposes a by-id GET (`grep -n "HttpGet" backend/Controllers/DatasetsController.cs`). Then:
  - **If a by-id GET exists:** fetch the default dataset, read its `dataSourceConnectionId`, then `getDatasets(thatId)`.
  - **If it does not:** add `dataSourceConnectionId: number | null` to the `Report` DTO and `ReportSummary`/`ReportService` (the report's dataset already implies a connection, so this is denormalised read-only convenience), OR add the by-id GET. **Prefer adding the by-id GET** — it's a smaller, more generally useful addition than widening the report DTO, and `DatasetService` already has everything needed. Note this deviates from the design doc's "no new backend endpoint" constraint; flag it to Mulham rather than silently doing either.

- [ ] Step 3: Build the option list — saved datasets on that connection, plus the report's current default even when unsaved (the "Change data source" dialog creates `isSaved: false` ad-hoc datasets, and a widget's actual source must always appear in the list):
  ```typescript
  const datasetOptions = availableDatasets
    .filter((d) => d.isSaved || d.id === reportDatasetId)
    .sort((a, b) => a.name.localeCompare(b.name));
  ```

- [ ] Step 4: Widen `handleSave`'s error branch to surface the 404 from Task 2's validation (skip this step if the open decision resolved to 400):
  ```typescript
  } catch (err) {
    if (axios.isAxiosError(err) && (err.response?.status === 400 || err.response?.status === 404)) {
      setError(typeof err.response.data === "string" ? err.response.data : "Could not save this report's widgets.");
    } else {
      setError("Could not save this report's widgets.");
    }
  }
  ```

- [ ] Step 5: Add the picker to `BuildTab`. New props: `datasets: DatasetSummary[]`, `reportDatasetId: number | null`, `onDatasetChange: (datasetId: number | null) => void`. Render a `<select>` above the existing wells, using the same `.fgroup`-style markup the pane already uses for its sections. The selected value is `widget.datasetId ?? ""` where `""` renders as `Report default (<name>)`. Disable it when `datasets.length === 0`.

- [ ] Step 6: Guard the binding loss. `datasetChanged` clears the binding, so when the widget already has one, confirm first:
  ```typescript
  function handleDatasetChange(next: number | null) {
    const hasBinding = widget?.binding !== null
      && (widget.binding.categoryField !== null || widget.binding.valueFields.length > 0);
    if (hasBinding && !window.confirm("Changing the dataset clears this widget's fields. Continue?")) {
      return;
    }
    onDatasetChange(next);
  }
  ```
  `window.confirm` matches the existing prompt-based interaction in this editor (`handleRename` uses `window.prompt`, page delete uses `window.alert`) — not worth introducing a dialog component for.

- [ ] Step 7: Wire it in `ReportCanvas`'s `BuildTab` render:
  ```tsx
  <BuildTab
    widget={selectedWidget}
    columns={selectedColumns}
    datasets={datasetOptions}
    reportDatasetId={reportDatasetId}
    onDatasetChange={(datasetId) => {
      if (selectedWidgetId !== null) {
        dispatch({ type: "datasetChanged", id: selectedWidgetId, datasetId });
        void ensureDatasets([datasetId]);
      }
    }}
    onChange={(binding) => {
      if (selectedWidgetId !== null) {
        dispatch({ type: "bindingChanged", id: selectedWidgetId, binding });
      }
    }}
  />
  ```
  The `ensureDatasets` call is what makes the field list populate immediately after switching, rather than only after a save-and-reload.

- [ ] Step 8: Add `BuildTab` tests: the picker lists the passed datasets plus a "Report default" option; selecting one calls `onDatasetChange` with its id; selecting "Report default" calls it with `null`; with an existing binding and `window.confirm` stubbed to `false`, `onDatasetChange` is **not** called; with it stubbed to `true`, it is. Stub via `vi.spyOn(window, "confirm")` and restore in `afterEach`.

- [ ] Step 9: Run `npm run verify` from `frontend/` — expect clean.

- [ ] Step 10: Commit (include any backend files from Step 2 if the by-id GET was added):
  ```bash
  git add frontend/src/reportEditor/BuildTab.tsx frontend/src/reportEditor/BuildTab.test.tsx frontend/src/pages/ReportCanvas.tsx
  git commit -m "frontend: let a widget pick its own dataset"
  ```

---

### Task 8: Frontend — `ReportView` (read-only viewer)

**Files:**
- Modify: `frontend/src/pages/ReportView.tsx`

**Interfaces:**
- Consumes: Tasks 4 and 5's context members. No new interfaces.

- [ ] Step 1: Pull `filteredResultFor`, `datasetResults`, and `ensureDatasets` from `useReportQuery()`.

- [ ] Step 2: Request the page's datasets in the existing widget-load effect:
  ```typescript
  getWidgets(reportPageId)
    .then((loaded) => {
      setWidgets(loaded);
      void ensureDatasets(loaded.map((w) => w.datasetId));
    })
    .catch(() => setError("Could not load this report's widgets."));
  ```
  Same dependency-array note as Task 6 Step 5 — do not add `ensureDatasets` to the deps.

- [ ] Step 3: Per-widget result: replace `result={filteredResult}` with `result={filteredResultFor(w.datasetId)}`. `w` is a `WidgetSummary` here (not a draft), so `datasetId` comes straight from the API type — no mapping needed.

- [ ] Step 4: `FiltersPane` gets `results={[...datasetResults.values()]}` in place of `rawResult={rawResult}`. Drop `rawResult` and `filteredResult` from the destructure if they become unused (`tsc` with `noUnusedLocals` will say).

- [ ] Step 5: Run `npm run verify` from `frontend/` — expect clean.

- [ ] Step 6: Commit:
  ```bash
  git add frontend/src/pages/ReportView.tsx
  git commit -m "frontend: per-widget datasets in the report viewer"
  ```

---

### Task 9: Full verification and manual smoke test

**Files:** none modified.

- [ ] Step 1: `dotnet build backend/Backend.csproj` — clean.

- [ ] Step 2: `dotnet test Backend.Tests/Backend.Tests.csproj` — all passing.

- [ ] Step 3: From `frontend/`: `npm run verify` — clean.

- [ ] Step 4: From `frontend/`: `npm run build` — clean (catches production-only build issues `tsc -b` misses).

- [ ] Step 5: Manual smoke test — this is the only step that actually proves the milestone, and it needs a live SQL Server connection with two working datasets at **different grains** (e.g. one detail-level `SELECT`, one `GROUP BY` aggregate). Start the backend (`cd backend; dotnet run --urls=http://localhost:5198`, confirming no stale `Backend.exe` holds the port) and `npm run dev`, then:
  1. Open an existing report. Confirm every widget renders exactly as before — this is the backward-compatibility check, and the most important assertion in the whole plan.
  2. Add a widget, pick the second dataset in the Build pane's Dataset picker, confirm the field list switches to that dataset's columns and the widget renders at its own grain alongside the original.
  3. Save, reload the page, confirm both widgets come back with their datasets intact.
  4. Set a filter on a column that exists in **both** datasets — confirm both widgets narrow.
  5. Set a filter on a column present in only **one** — confirm only that widget narrows and the other is untouched (this is the documented name-matching semantic, working as designed).
  6. Click a data point to cross-filter, confirm the chip appears and the same name-matching propagation applies.
  7. Open the report in the read-only viewer (`ReportView`) and confirm both widgets render there too.
  8. Delete one of the two datasets from the Datasets page, reload the report, and confirm the orphaned widget shows the empty state rather than erroring the page.

- [ ] Step 6: Report results to Mulham. **Do not push** — `main` deploys on push and needs his explicit go-ahead.

---

## Self-Review Notes

- **Spec coverage:** data model (Task 1), save-time validation (Task 2), result cache (Task 4), filter semantics (Task 5), editor wiring (Task 6), dataset picker (Task 7), viewer (Task 8), testing approach (tests inside Tasks 1–8, manual in Task 9).
- **Known deviation from the design doc:** Task 7 Step 2 may need a `GET /api/datasets/{id}` endpoint, which the design doc's "no new backend endpoint" constraint didn't anticipate — the design assumed the report's connection id was reachable, and it isn't. Flagged in-place for a decision rather than resolved silently.
- **Open decision:** 404 vs 400 for an unknown dataset id on save (see the section above Task 1). Task 2 and Task 7 Step 4 both depend on it.
- **Red-build window:** Tasks 3–5 knowingly leave `tsc -b` failing (positional/interface changes ripple into `ReportCanvas` before Task 6 fixes it). Tasks 3–6 therefore commit together at Task 6 Step 12, so no commit lands on a red build. Called out explicitly in Task 3 Step 5 and Task 4 Step 9.
- **Backward compatibility is the load-bearing assertion:** every existing widget has `DatasetId = NULL` → `resolveWidgetDatasetId` returns the report default → `filteredResultFor(null)` returns what `filteredResult` returns today. Verified at three levels: `resolveWidgetDatasetId` unit tests (Task 3), `ReportQueryContext`'s unchanged existing tests (Task 4 Step 7), and Task 9 Step 5.1.
- **Scope check:** 9 tasks. Tasks 1, 2, 7, 8 are independently committable; 3–6 form one commit by necessity. No task depends on a later one.
- **Not bundled, deliberately:** combo/dual-axis and 100%-stacked widget types, a Series/legend well, the `Table` 8-column cap, cross-connection datasets, and relationship-aware filtering. All listed as out of scope in the design doc.
