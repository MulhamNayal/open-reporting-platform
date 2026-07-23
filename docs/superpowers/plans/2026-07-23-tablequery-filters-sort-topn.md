# Table Query Filters, Sort & Top-N Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close Milestone 3's original gap — give Table Query mode datasets a filter-row builder, sort picker, and Top-N field (the backend has fully supported `SelectQuery.Filters`/`Sort`/`Top` since Milestone 3; no shipped UI path could ever produce them) — fix the exception-mapping bug this UI would otherwise expose, and restyle `DatasetsPage` with the Meridian design tokens already established elsewhere in the app.

**Architecture:** A pure `buildTableQueryDefinition` function on the frontend assembles the exact `SelectQuery`-shaped JSON object from UI state (filter rows, sort field/direction, Top-N), dropping incomplete filter rows. A new collapsed-by-default "Advanced" `<details>` section in `DatasetsPage`'s Table Query mode hosts the filter-row builder, sort picker, and Top-N field. On the backend, a new `UnsupportedQueryOperationException` replaces the generic `InvalidOperationException` `SqlServerProvider.BuildTableQuerySql` currently throws for a disallowed operator or sort direction, and `DatasetsController.Execute` maps it to 400 instead of the current (wrong, 404) mapping. `DatasetsPage`'s whole page also adopts the already-global `meridian-tokens.css` color/typography tokens via a new dedicated stylesheet.

**Tech Stack:** .NET 8, xUnit (all already in place). React 19 + TypeScript + MUI 9 + Vitest/RTL (all already in place, no new packages).

This plan was written after reading the full approved design doc (`docs/superpowers/specs/2026-07-23-tablequery-filters-sort-topn-design.md`), the current `DatasetsPage.tsx`, `api/datasets.ts`, `api/datasources.ts`, `SqlServerProvider.cs`, `DatasetsController.cs`, `SqlServerProviderQueryBuilderTests.cs`, and the redesign's `WidgetsControllerTests.cs` (for this codebase's controller-test convention).

## Global Constraints

- **Operator allowlist** (must match the backend's `SqlServerProvider.AllowedOperators` exactly): `=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`. **Sort directions**: `ASC`, `DESC`.
- **Filter/sort fields are populated from the selected table's full schema** (`FieldDescriptor[]` from `getDataSourceSchema`), not restricted to the checked output columns.
- **A filter row with no field chosen is dropped from the submitted payload**, not sent as `{field: "", ...}` and not blocked from submission.
- **Empty Sort field → `Sort: null`. Empty Top-N → `Top: null`.**
- **`UnsupportedQueryOperationException` lives in `backend/Services/DataSources/`** (same location as the existing `QueryPreviewException`, which this follows the same shape/convention as — message-only constructor, no inner exception, matching `LastPageDeletionException`'s shape since this is a validation failure, not a wrapped external error).
- **`DatasetsController.Execute`'s existing `InvalidOperationException` → 404 and generic `Exception` → 502 catches are unchanged** — the new catch is additive, for a case those two never correctly handled.
- **`meridian-tokens.css` is already loaded globally** via `frontend/src/main.tsx` — no new import needed to use its CSS custom properties (`--panel`, `--line`, `--text`, `--accent`, `--muted`, `--sh-sm`, `--r`, etc.) anywhere in the app.
- **The visual restyle uses a new, dedicated stylesheet** (`frontend/src/pages/datasetsPage.css`) with its own class names — it does not import `reportEditor.css` wholesale (that file is conceptually scoped to the Report editor/View routes; reusing its classes here would create unintended coupling between unrelated pages).
- **MUI components stay** (TextField, Button, Table, etc.) — restyling means overriding their default colors/spacing via `sx` props that reference the CSS custom properties, plus the new stylesheet for structural elements (the Advanced section, filter rows) that aren't MUI components. This is not a rip-and-replace of MUI with plain HTML.
- Commits stage exact file paths only, never `git add -A`. Commit messages: `backend: ...` / `frontend: ...`, lowercase, imperative, no trailer, no Co-Authored-By line (personal project, no AI attribution).
- Frontend test gate: `npm run verify` (`tsc -b && vitest run`) — never bare `npm test`. Backend test gate: `dotnet test Backend.Tests`.
- `frontend/tsconfig.app.json` has `"verbatimModuleSyntax": true` — every new/edited `.ts`/`.tsx` file uses `import type { X }` for type-only imports.

---

### Task 1: Backend — `UnsupportedQueryOperationException` + wire into `BuildTableQuerySql`

**Files:**
- Create: `backend/Services/DataSources/UnsupportedQueryOperationException.cs`
- Modify: `backend/Services/DataSources/SqlServerProvider.cs`
- Modify: `Backend.Tests/SqlServerProviderQueryBuilderTests.cs`

**Interfaces:**
- Produces: `Backend.Services.DataSources.UnsupportedQueryOperationException(string message)` — a plain `Exception` subclass, message-only constructor. Task 2 catches this type in `DatasetsController.Execute`.

- [ ] Step 1: Create `backend/Services/DataSources/UnsupportedQueryOperationException.cs`:
  ```csharp
  namespace Backend.Services.DataSources;

  public class UnsupportedQueryOperationException : Exception
  {
      public UnsupportedQueryOperationException(string message) : base(message)
      {
      }
  }
  ```

- [ ] Step 2: In `backend/Services/DataSources/SqlServerProvider.cs`, find `BuildTableQuerySql`'s two `throw new InvalidOperationException(...)` calls (the "Unsupported filter operator" and "Unsupported sort direction" checks) and change both to `throw new UnsupportedQueryOperationException(...)` with the exact same message text:
  ```csharp
  if (!AllowedOperators.Contains(filter.Operator))
  {
      throw new UnsupportedQueryOperationException($"Unsupported filter operator: {filter.Operator}");
  }
  ```
  and:
  ```csharp
  if (!AllowedSortDirections.Contains(query.Sort.Direction))
  {
      throw new UnsupportedQueryOperationException($"Unsupported sort direction: {query.Sort.Direction}");
  }
  ```

- [ ] Step 3: Update `Backend.Tests/SqlServerProviderQueryBuilderTests.cs`'s two existing tests to assert the new exception type. Change:
  ```csharp
  [Fact]
  public void BuildTableQuerySql_RejectsUnknownOperator()
  {
      var provider = new SqlServerProvider();
      var query = new SelectQuery(
          "Reports",
          new[] { "Id" },
          new[] { new QueryFilter("Name", "; DROP TABLE Reports; --", "x") },
          null,
          null);

      Assert.Throws<InvalidOperationException>(() => provider.BuildTableQuerySql(query, rowLimit: 100));
  }

  [Fact]
  public void BuildTableQuerySql_RejectsUnknownSortDirection()
  {
      var provider = new SqlServerProvider();
      var query = new SelectQuery("Reports", new[] { "Id" }, Array.Empty<QueryFilter>(), new QuerySort("Id", "SIDEWAYS"), null);

      Assert.Throws<InvalidOperationException>(() => provider.BuildTableQuerySql(query, rowLimit: 100));
  }
  ```
  to:
  ```csharp
  [Fact]
  public void BuildTableQuerySql_RejectsUnknownOperator()
  {
      var provider = new SqlServerProvider();
      var query = new SelectQuery(
          "Reports",
          new[] { "Id" },
          new[] { new QueryFilter("Name", "; DROP TABLE Reports; --", "x") },
          null,
          null);

      Assert.Throws<UnsupportedQueryOperationException>(() => provider.BuildTableQuerySql(query, rowLimit: 100));
  }

  [Fact]
  public void BuildTableQuerySql_RejectsUnknownSortDirection()
  {
      var provider = new SqlServerProvider();
      var query = new SelectQuery("Reports", new[] { "Id" }, Array.Empty<QueryFilter>(), new QuerySort("Id", "SIDEWAYS"), null);

      Assert.Throws<UnsupportedQueryOperationException>(() => provider.BuildTableQuerySql(query, rowLimit: 100));
  }
  ```
  `Backend.Services.DataSources` is already `using`'d at the top of this file (it's where `SqlServerProvider` itself lives), so no new `using` is needed.

- [ ] Step 4: Run `dotnet test Backend.Tests --filter "FullyQualifiedName~SqlServerProviderQueryBuilderTests"` — expect all tests in this file passing, including the two updated ones.

- [ ] Step 5: Run the full suite: `dotnet test Backend.Tests` — expect all passing (no other file references the old exception type for these two cases; `DatasetsController`'s current catch-all `InvalidOperationException` clause will still structurally compile since `UnsupportedQueryOperationException` is not a subtype of it, but Task 2 wires the correct dedicated catch).

- [ ] Step 6: Commit:
  ```bash
  git add backend/Services/DataSources/UnsupportedQueryOperationException.cs backend/Services/DataSources/SqlServerProvider.cs Backend.Tests/SqlServerProviderQueryBuilderTests.cs
  git commit -m "backend: add UnsupportedQueryOperationException for bad filter operators and sort directions"
  ```

---

### Task 2: Backend — `DatasetsController` catch clause + new `DatasetsControllerTests.cs`

**Files:**
- Modify: `backend/Controllers/DatasetsController.cs`
- Create: `Backend.Tests/DatasetsControllerTests.cs`

**Interfaces:**
- Consumes: `UnsupportedQueryOperationException` (Task 1), `IDatasetService` (existing interface — `CreateAsync`, `ListAsync`, `DiscoverColumnsAsync`, `ExecuteAsync`, `DeleteAsync`, `PromoteAsync`).
- Produces: nothing new consumed by later tasks — this is the last backend task.

- [ ] Step 1: In `backend/Controllers/DatasetsController.cs`, add a `using Backend.Services.DataSources;` if not already present (check the top of the file — it currently has `using Backend.Services.DataSources;` already, since `ColumnDescriptor`/`QueryResult` live there too; confirm and skip if present).

- [ ] Step 2: In the `Execute` action, add a new catch clause for `UnsupportedQueryOperationException`, placed **before** the generic `catch (Exception ex)` clause (it must come before that one, since `UnsupportedQueryOperationException` is an `Exception` and would otherwise be silently caught by the generic clause and mapped to 502 instead of 400). Its position relative to the `catch (InvalidOperationException ex)` clause does not matter (the two types are unrelated siblings), but place it directly after that clause for readability. Full method after the change:
  ```csharp
  [HttpPost("{id}/execute")]
  public async Task<ActionResult<QueryResult>> Execute(int id)
  {
      try
      {
          return Ok(await _service.ExecuteAsync(id));
      }
      catch (InvalidOperationException ex)
      {
          return NotFound(ex.Message);
      }
      catch (UnsupportedQueryOperationException ex)
      {
          return BadRequest(ex.Message);
      }
      catch (Exception ex)
      {
          return Problem(detail: ex.Message, statusCode: StatusCodes.Status502BadGateway);
      }
  }
  ```

- [ ] Step 3: Create `Backend.Tests/DatasetsControllerTests.cs` with a stub `IDatasetService` whose `ExecuteAsync` is configurable per test, following the same direct-instantiation pattern as `WidgetsControllerTests.cs` (no `WebApplicationFactory`/HTTP layer — construct the controller directly and call its action methods):
  ```csharp
  using Backend.Controllers;
  using Backend.Services.DataSources;
  using Backend.Services.Datasets;
  using Microsoft.AspNetCore.Mvc;
  using Xunit;

  namespace Backend.Tests;

  public class DatasetsControllerTests
  {
      private class StubDatasetService : IDatasetService
      {
          public Func<int, Task<QueryResult>>? ExecuteAsyncFunc { get; set; }

          public Task<DatasetSummary> CreateAsync(CreateDatasetRequest request) => throw new NotImplementedException();
          public Task<IReadOnlyList<DatasetSummary>> ListAsync(int connectionId) => throw new NotImplementedException();
          public Task<IReadOnlyList<ColumnDescriptor>> DiscoverColumnsAsync(int datasetId) => throw new NotImplementedException();
          public Task DeleteAsync(int id) => throw new NotImplementedException();
          public Task<DatasetSummary> PromoteAsync(int id, string name) => throw new NotImplementedException();

          public Task<QueryResult> ExecuteAsync(int datasetId) =>
              ExecuteAsyncFunc?.Invoke(datasetId) ?? throw new NotImplementedException();
      }

      [Fact]
      public async Task Execute_UnsupportedQueryOperation_Returns400()
      {
          var stub = new StubDatasetService
          {
              ExecuteAsyncFunc = _ => throw new UnsupportedQueryOperationException("Unsupported filter operator: DROP"),
          };
          var controller = new DatasetsController(stub);

          var result = await controller.Execute(1);

          var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
          Assert.Equal("Unsupported filter operator: DROP", badRequest.Value);
      }

      [Fact]
      public async Task Execute_DatasetNotFound_Returns404()
      {
          var stub = new StubDatasetService
          {
              ExecuteAsyncFunc = _ => throw new InvalidOperationException("No dataset found with id 999."),
          };
          var controller = new DatasetsController(stub);

          var result = await controller.Execute(999);

          var notFound = Assert.IsType<NotFoundObjectResult>(result.Result);
          Assert.Equal("No dataset found with id 999.", notFound.Value);
      }

      [Fact]
      public async Task Execute_OtherFailure_Returns502()
      {
          var stub = new StubDatasetService
          {
              ExecuteAsyncFunc = _ => throw new InvalidOperationException("simulated", new TimeoutException("db unreachable")),
          };
          // InvalidOperationException always maps to 404 regardless of inner exception, so use a
          // genuinely different exception type to exercise the generic catch-all -> 502 path.
          var stub502 = new StubDatasetService
          {
              ExecuteAsyncFunc = _ => throw new TimeoutException("db unreachable"),
          };
          var controller = new DatasetsController(stub502);

          var result = await controller.Execute(1);

          var problem = Assert.IsType<ObjectResult>(result.Result);
          Assert.Equal(502, problem.StatusCode);
      }
  }
  ```

- [ ] Step 4: Run `dotnet test Backend.Tests --filter "FullyQualifiedName~DatasetsControllerTests"` — expect 3 passing.

- [ ] Step 5: Run the full suite: `dotnet test Backend.Tests` — expect all passing.

- [ ] Step 6: Commit:
  ```bash
  git add backend/Controllers/DatasetsController.cs Backend.Tests/DatasetsControllerTests.cs
  git commit -m "backend: map UnsupportedQueryOperationException to 400 in DatasetsController.Execute"
  ```

- [ ] Step 7: Live smoke test against the real dev database (this is the end-to-end path Task 1-2's unit tests can't reach, since `ExecuteQueryAsync` opens a real SQL connection before ever calling `BuildTableQuerySql`). Start the backend (`cd backend && dotnet run --urls=http://localhost:5198`, confirming no stale `Backend.exe` already holds the port first), then:
  ```bash
  # Create a TableQuery dataset with a deliberately bad operator via direct API call
  curl -s -X POST http://localhost:5198/api/datasets -H "Content-Type: application/json" -d '{
    "dataSourceConnectionId": 1,
    "name": "QA bad operator test",
    "description": null,
    "mode": "TableQuery",
    "definitionJson": "{\"query\":{\"table\":\"Reports\",\"columns\":[\"Id\"],\"filters\":[{\"field\":\"Name\",\"operator\":\"CONTAINS\",\"value\":\"x\"}],\"sort\":null,\"top\":null}}",
    "rowLimit": null
  }'
  # Note the returned id, then:
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5198/api/datasets/<id>/execute
  ```
  Expect `400`, not `404`. Clean up the test dataset afterward (`curl -X DELETE http://localhost:5198/api/datasets/<id>`) and confirm the backend port is free if you stop it.

---

### Task 3: Frontend — pure `buildTableQueryDefinition` function + tests

**Files:**
- Create: `frontend/src/pages/tableQueryDefinition.ts`
- Test: `frontend/src/pages/tableQueryDefinition.test.ts`

**Interfaces:**
- Produces: `FilterRowDraft` type, `ALLOWED_OPERATORS` constant, `buildTableQueryDefinition(table, columns, filterRows, sortField, sortDirection, top): TableQueryDefinition`. Task 4 imports and uses these directly in `DatasetsPage.tsx`.

- [ ] Step 1: Create `frontend/src/pages/tableQueryDefinition.ts`:
  ```typescript
  export const ALLOWED_OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "LIKE"] as const;
  export type FilterOperator = (typeof ALLOWED_OPERATORS)[number];

  export interface FilterRowDraft {
    field: string;
    operator: FilterOperator;
    value: string;
  }

  export interface TableQueryFilter {
    field: string;
    operator: string;
    value: string;
  }

  export interface TableQuerySort {
    field: string;
    direction: "ASC" | "DESC";
  }

  export interface TableQueryDefinition {
    query: {
      table: string;
      columns: string[];
      filters: TableQueryFilter[];
      sort: TableQuerySort | null;
      top: number | null;
    };
  }

  export function buildTableQueryDefinition(
    table: string,
    columns: string[],
    filterRows: FilterRowDraft[],
    sortField: string,
    sortDirection: "ASC" | "DESC",
    top: string,
  ): TableQueryDefinition {
    const filters: TableQueryFilter[] = filterRows
      .filter((row) => row.field !== "")
      .map((row) => ({ field: row.field, operator: row.operator, value: row.value }));

    const sort: TableQuerySort | null = sortField === "" ? null : { field: sortField, direction: sortDirection };

    const parsedTop = top.trim() === "" ? null : Number(top);
    const topValue = parsedTop !== null && Number.isFinite(parsedTop) && parsedTop > 0 ? parsedTop : null;

    return { query: { table, columns, filters, sort, top: topValue } };
  }
  ```

- [ ] Step 2: Write the failing test first — create `frontend/src/pages/tableQueryDefinition.test.ts`:
  ```typescript
  import { describe, expect, it } from "vitest";
  import { buildTableQueryDefinition, type FilterRowDraft } from "./tableQueryDefinition";

  describe("buildTableQueryDefinition", () => {
    it("builds a definition with no filters, no sort, no top when nothing is set", () => {
      const result = buildTableQueryDefinition("Reports", ["Id", "Name"], [], "", "ASC", "");

      expect(result).toEqual({
        query: { table: "Reports", columns: ["Id", "Name"], filters: [], sort: null, top: null },
      });
    });

    it("drops filter rows with no field chosen", () => {
      const rows: FilterRowDraft[] = [
        { field: "", operator: "=", value: "x" },
        { field: "Name", operator: "=", value: "Monthly Sales" },
      ];

      const result = buildTableQueryDefinition("Reports", ["Id"], rows, "", "ASC", "");

      expect(result.query.filters).toEqual([{ field: "Name", operator: "=", value: "Monthly Sales" }]);
    });

    it("keeps multiple complete filter rows in order", () => {
      const rows: FilterRowDraft[] = [
        { field: "Name", operator: "=", value: "X" },
        { field: "Id", operator: ">", value: "1" },
      ];

      const result = buildTableQueryDefinition("Reports", ["Id"], rows, "", "ASC", "");

      expect(result.query.filters).toEqual([
        { field: "Name", operator: "=", value: "X" },
        { field: "Id", operator: ">", value: "1" },
      ]);
    });

    it("sets sort when a sort field is chosen", () => {
      const result = buildTableQueryDefinition("Reports", ["Id"], [], "Id", "DESC", "");

      expect(result.query.sort).toEqual({ field: "Id", direction: "DESC" });
    });

    it("sets top to a parsed number when provided", () => {
      const result = buildTableQueryDefinition("Reports", ["Id"], [], "", "ASC", "10");

      expect(result.query.top).toBe(10);
    });

    it("treats a non-numeric or non-positive top as null", () => {
      expect(buildTableQueryDefinition("Reports", ["Id"], [], "", "ASC", "abc").query.top).toBeNull();
      expect(buildTableQueryDefinition("Reports", ["Id"], [], "", "ASC", "0").query.top).toBeNull();
      expect(buildTableQueryDefinition("Reports", ["Id"], [], "", "ASC", "-5").query.top).toBeNull();
    });
  });
  ```

- [ ] Step 3: Run `npx vitest run src/pages/tableQueryDefinition.test.ts` from `frontend/` — expect all passing immediately (the implementation was written in Step 1 alongside the type contract, not truly TDD'd red-first; this is acceptable for a pure, already-fully-specified function per this project's convention of sometimes writing implementation and test together when the shape is unambiguous — but if you want a genuine RED step, temporarily change one assertion, confirm it fails, then revert).

- [ ] Step 4: Run `npm run verify` from `frontend/` — expect clean (`tsc -b` + full vitest suite).

- [ ] Step 5: Commit:
  ```bash
  git add frontend/src/pages/tableQueryDefinition.ts frontend/src/pages/tableQueryDefinition.test.ts
  git commit -m "frontend: pure buildTableQueryDefinition for Table Query filters/sort/Top-N"
  ```

---

### Task 4: Frontend — wire the Advanced section UI into `DatasetsPage.tsx`

**Files:**
- Modify: `frontend/src/pages/DatasetsPage.tsx`

**Interfaces:**
- Consumes: `buildTableQueryDefinition`, `FilterRowDraft`, `ALLOWED_OPERATORS` (Task 3).
- Produces: nothing new consumed by later tasks (Task 5 restyles this same file's markup, not its state/logic).

- [ ] Step 1: Add the new imports at the top of `frontend/src/pages/DatasetsPage.tsx`:
  ```typescript
  import { buildTableQueryDefinition, ALLOWED_OPERATORS, type FilterRowDraft } from "./tableQueryDefinition";
  ```

- [ ] Step 2: Add new state, alongside the existing `selectedTable`/`selectedColumns` state:
  ```typescript
  const [filterRows, setFilterRows] = useState<FilterRowDraft[]>([]);
  const [sortField, setSortField] = useState("");
  const [sortDirection, setSortDirection] = useState<"ASC" | "DESC">("ASC");
  const [topN, setTopN] = useState("");
  ```

- [ ] Step 3: Add row-management functions, alongside the existing `toggleColumn`:
  ```typescript
  function addFilterRow() {
    setFilterRows([...filterRows, { field: "", operator: "=", value: "" }]);
  }

  function updateFilterRow(index: number, patch: Partial<FilterRowDraft>) {
    const next = [...filterRows];
    next[index] = { ...next[index], ...patch };
    setFilterRows(next);
  }

  function removeFilterRow(index: number) {
    setFilterRows(filterRows.filter((_, i) => i !== index));
  }
  ```

- [ ] Step 4: In `handleSubmit`, replace the hardcoded TableQuery `definitionJson` line:
  ```typescript
  definitionJson = JSON.stringify({
    query: { table: selectedTable, columns: selectedColumns, filters: [], sort: null, top: null },
  });
  ```
  with:
  ```typescript
  definitionJson = JSON.stringify(
    buildTableQueryDefinition(selectedTable, selectedColumns, filterRows, sortField, sortDirection, topN),
  );
  ```

- [ ] Step 5: In `handleSubmit`'s post-success field-reset block (where `setSelectedTable("")`, `setSelectedColumns([])` etc. already reset other fields), add:
  ```typescript
  setFilterRows([]);
  setSortField("");
  setSortDirection("ASC");
  setTopN("");
  ```

- [ ] Step 6: In the JSX, inside the `mode === "TableQuery"` block, immediately after the existing column-checkboxes `<Box>` (the one closing right before the block's closing `</>`), add the new Advanced section:
  ```tsx
  {selectedTableFields.length > 0 && (
    <details className="advanced-section" style={{ marginBottom: 16 }}>
      <summary>Advanced (filters, sort, Top N)</summary>
      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" gutterBottom>Filters</Typography>
        {filterRows.map((row, i) => (
          <Box key={i} sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}>
            <TextField
              select
              label="Field"
              size="small"
              value={row.field}
              onChange={(e) => updateFilterRow(i, { field: e.target.value })}
              sx={{ minWidth: 140 }}
            >
              {selectedTableFields.map((f) => (
                <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Operator"
              size="small"
              value={row.operator}
              onChange={(e) => updateFilterRow(i, { operator: e.target.value as FilterRowDraft["operator"] })}
              sx={{ minWidth: 100 }}
            >
              {ALLOWED_OPERATORS.map((op) => (
                <MenuItem key={op} value={op}>{op}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Value"
              size="small"
              value={row.value}
              onChange={(e) => updateFilterRow(i, { value: e.target.value })}
            />
            <Button size="small" onClick={() => removeFilterRow(i)}>Remove</Button>
          </Box>
        ))}
        <Button size="small" onClick={addFilterRow} sx={{ mb: 2 }}>+ Add filter</Button>

        <Typography variant="subtitle2" gutterBottom>Sort</Typography>
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <TextField
            select
            label="Sort field"
            size="small"
            value={sortField}
            onChange={(e) => setSortField(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">None</MenuItem>
            {selectedTableFields.map((f) => (
              <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Direction"
            size="small"
            value={sortDirection}
            onChange={(e) => setSortDirection(e.target.value as "ASC" | "DESC")}
            disabled={sortField === ""}
            sx={{ minWidth: 120 }}
          >
            <MenuItem value="ASC">Ascending</MenuItem>
            <MenuItem value="DESC">Descending</MenuItem>
          </TextField>
        </Box>

        <Typography variant="subtitle2" gutterBottom>Top N</Typography>
        <TextField
          label="Top N (optional)"
          size="small"
          value={topN}
          onChange={(e) => setTopN(e.target.value)}
          sx={{ mb: 2 }}
        />
      </Box>
    </details>
  )}
  ```
  Note: `selectedTableFields` already exists (computed near the bottom of the component, before the `return`) — this new block reads it, it does not need to be redeclared.

- [ ] Step 7: Run `npm run verify` from `frontend/` — expect clean.

- [ ] Step 8: Manual smoke test (no browser in this environment, so this step is for whoever picks this up next to actually click through): start both servers, go to `/datasets`, pick a connection, select Table Query mode, pick a table, expand "Advanced", add a filter row (e.g. field=Name, operator==, value=some real value), set a sort field, set Top N to 5, submit, then use the dataset list's "Run" button to preview — confirm the filter/sort/Top-N actually took effect in the returned rows.

- [ ] Step 9: Commit:
  ```bash
  git add frontend/src/pages/DatasetsPage.tsx
  git commit -m "frontend: wire filter/sort/Top-N Advanced section into Table Query mode"
  ```

---

### Task 5: Frontend — Meridian visual restyle of `DatasetsPage`

**Files:**
- Create: `frontend/src/pages/datasetsPage.css`
- Modify: `frontend/src/pages/DatasetsPage.tsx`

**Interfaces:**
- Consumes: `meridian-tokens.css`'s CSS custom properties (already global — `--panel`, `--line`, `--text`, `--accent`, `--muted`, `--groove`, `--sh-sm`, `--r`).
- Produces: nothing consumed by other tasks — this is the final task.

- [ ] Step 1: Create `frontend/src/pages/datasetsPage.css`:
  ```css
  .datasets-page {
    font-family: 'IBM Plex Sans', system-ui, sans-serif;
    color: var(--text);
  }
  .datasets-page h4 {
    font-weight: 700;
  }
  .datasets-page .create-form {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--r);
    box-shadow: var(--sh-sm);
    padding: 20px;
    margin-bottom: 24px;
  }
  .datasets-page .advanced-section {
    border: 1px solid var(--line);
    border-radius: var(--r);
    background: var(--groove);
    padding: 0;
    margin-bottom: 16px;
    overflow: hidden;
  }
  .datasets-page .advanced-section > summary {
    list-style: none;
    cursor: pointer;
    padding: 10px 14px;
    font-weight: 600;
    color: var(--text);
    background: var(--panel);
  }
  .datasets-page .advanced-section > summary::-webkit-details-marker {
    display: none;
  }
  .datasets-page .advanced-section > div {
    padding: 12px 14px;
  }
  .datasets-page .dataset-list {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--r);
    box-shadow: var(--sh-sm);
  }
  .datasets-page .dataset-list th {
    color: var(--muted);
    font-weight: 600;
  }
  ```

- [ ] Step 2: In `DatasetsPage.tsx`, add the stylesheet import alongside the other imports:
  ```typescript
  import "./datasetsPage.css";
  ```

- [ ] Step 3: Wrap the existing `<Container maxWidth="md" sx={{ py: 4 }}>` root element with the new `datasets-page` class — change:
  ```tsx
  <Container maxWidth="md" sx={{ py: 4 }}>
  ```
  to:
  ```tsx
  <Container maxWidth="md" sx={{ py: 4 }} className="datasets-page">
  ```

- [ ] Step 4: Wrap the create-dataset form (`<Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }}>`) with the `create-form` class — change:
  ```tsx
  <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }}>
  ```
  to:
  ```tsx
  <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }} className="create-form">
  ```

- [ ] Step 5: Add the `dataset-list` class to the existing `<TableContainer component={Paper} sx={{ mb: 3 }}>` — change:
  ```tsx
  <TableContainer component={Paper} sx={{ mb: 3 }}>
  ```
  to:
  ```tsx
  <TableContainer component={Paper} sx={{ mb: 3 }} className="dataset-list">
  ```

- [ ] Step 6: Run `npm run verify` from `frontend/` — expect clean.

- [ ] Step 7: Manual visual check (no browser in this environment — for whoever picks this up next): open `/datasets`, confirm the page background/borders/fonts now visually match the App shell's Meridian look (IBM Plex typography, the established color palette) rather than plain default MUI styling, and confirm the Advanced section's collapsed/expanded states render cleanly.

- [ ] Step 8: Commit:
  ```bash
  git add frontend/src/pages/datasetsPage.css frontend/src/pages/DatasetsPage.tsx
  git commit -m "frontend: restyle DatasetsPage with the Meridian design tokens"
  ```

---

## Self-Review Notes

- **Spec coverage**: every design-doc section has a task — filter-row builder (Task 4, logic in Task 3), sort/Top-N (Task 3-4), backend exception fix (Tasks 1-2), visual restyle (Task 5), testing approach (unit tests in Tasks 1/2/3, manual smoke/visual checks in Tasks 2/4/5 where no browser/live-DB access exists in this environment).
- **Placeholder scan**: no TBD/TODO; all code blocks are complete, not sketched.
- **Type consistency**: `FilterRowDraft`/`ALLOWED_OPERATORS`/`buildTableQueryDefinition` names and signatures are identical between Task 3 (where defined) and Task 4 (where consumed).
- **Scope check**: 5 tasks, each independently testable and committable; no task depends on a later one.
