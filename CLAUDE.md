# CLAUDE.md

Guidance for Claude Code when working in this repository. Read it fully before making changes.

This is a personal project (not a company codebase) — optimize for clean, well-factored code and genuine learning value over enterprise process. Still: these are project conventions, not suggestions. If one appears to cause a concrete bug or contradicts the actual code, stop and flag it rather than silently working around it.

**If you've also worked in `IqiCore`/`erp-api` (Mulham's employer's ERP)**: several conventions here are the *opposite* of that codebase's rules (lazy loading, EF migrations, error handling). Don't carry those habits over — see the callouts below.

---

## Project Overview

- **Purpose:** Self-hosted, open-source, drag-and-drop report/dashboard builder — pluggable data sources, generic REST data contracts. Built to learn React and to explore a generalized version of a reporting tool built at work.
- **Stack:** ASP.NET Core 8 / C# 12 backend, React + TypeScript + Vite frontend, SQL Server (EF Core, code-first migrations).
- **Architecture:** `Controllers → Services → DbContext → SQL Server`. No separate Repository layer — Services talk to `ReportingDbContext` directly.

---

## Solution Structure

```
backend/
  Controllers/       one per resource, thin — see Error Handling below
  Services/{Area}/    one service per feature (Reports, Datasets, DataSources, ReportPages, Widgets, Materialization)
  Models/             EF entities
  Data/                ReportingDbContext
  Exceptions/          shared exception types (NotFoundException, etc.)
  Middleware/          GlobalExceptionHandler
  Migrations/          EF Core code-first migrations

frontend/src/
  api/{resource}.ts    thin axios wrapper per resource, typed request/response interfaces
  pages/               one component per route; owns its own local state
  components/          shared, reusable, no page-specific knowledge (DataTable is the canonical example)
  reportEditor/         report-designer-only UI (FormatTab, Ribbon, WidgetChrome, FiltersPane, ...)
  widgets/              one component per chart/visual type + WidgetRenderer dispatcher; shaping.ts converts QueryResult → ECharts options

Backend.Tests/          xUnit
docs/superpowers/        specs + plans from past milestones (brainstorming → writing-plans workflow)
scripts/                 deploy-bootstrap.ps1, winrm_deploy.py
```

---

## Build & Test

```bash
dotnet build backend/Backend.csproj                 # Build backend
dotnet test Backend.Tests/Backend.Tests.csproj       # Backend tests (xUnit)

cd frontend
npm run dev        # Vite dev server (:5173) — backend must be running on :5198
npm run verify      # tsc -b && vitest run — run before calling any frontend change done
npm run build       # production build
```

**Always verify with both backend tests and `npm run verify` after changes.** Never leave either broken.

---

## Backend — Error Handling (read before touching a controller)

**Controllers never catch exceptions.** A single `GlobalExceptionHandler` (`backend/Middleware/`, registered via `IExceptionHandler` in `Program.cs`) maps exception type → HTTP response for every endpoint:

| Exception | Status | Body |
|---|---|---|
| `NotFoundException` | 404 | raw string (exception message) |
| `LastPageDeletionException` | 409 | raw string |
| `WidgetValidationException` | 400 | raw string |
| `UnsupportedQueryOperationException` | 400 | raw string |
| `InvalidOperationException` | 400 | raw string |
| anything else | 502 | `ProblemDetails` with `.detail` |

The 400/404/409 bodies are a **raw JSON string**, not an object — the frontend reads `err.response.data` directly as a string in several places (e.g. `ReportsPage.tsx`, `DatasetsPage.tsx`). Don't change this shape without updating every consumer. 502 responses use `ProblemDetails` (`.detail`) because that's what the frontend's downstream-failure handling (e.g. `DatasetsPage`'s `columnPreviewError`) reads.

**When you need a new failure mode:**
- "No entity with this id" → throw `NotFoundException`, never `InvalidOperationException` (that's reserved for validation failures and is mapped differently in intent, even though it currently shares 400 with the others).
- A genuinely new *kind* of failure that needs its own status → add a exception type under `backend/Exceptions/` (or feature-local, matching the existing `WidgetValidationException`/`LastPageDeletionException` pattern) and add one line to `GlobalExceptionHandler.MapStatusCode`.
- Simple field-required checks (`"Name is required."`) stay as inline controller guard clauses (`if (string.IsNullOrWhiteSpace(...)) return BadRequest(...)`) — these aren't part of the exception-handling pattern and don't need a middleware round-trip.

**Testing exceptions:** `GlobalExceptionHandlerTests.cs` unit-tests the type→status mapping in isolation. `ExceptionMappingIntegrationTests.cs` (via `ApiWebApplicationFactory` / `WebApplicationFactory<Program>`, in-memory DB) proves the real HTTP pipeline wires it up end-to-end. Controller-level tests (`*ControllerTests.cs`, calling controllers directly with no HTTP pipeline) only cover guard-clause and success-path behavior — **do not** add a controller-level test asserting on a caught exception's status code; it can't observe middleware. Add an integration test instead.

---

## Backend — Services (SOLID, applied here)

- **SRP:** one service per feature/entity (`ReportService`, `DatasetService`, `DataSourceService`, `ReportPageService`, `WidgetService`). A service handling a second entity's lifecycle should be split.
- **Validate-before-persist:** `DatasetService.CreateAsync`/`UpdateAsync` are the reference implementation — the dataset's own query/procedure is actually run (via `DiscoverColumnsForAsync`) *before* `SaveChangesAsync`, so a broken definition (bad table, nonexistent stored procedure, mode/connection-type mismatch) is rejected and never persisted. Apply this same shape to any new Create/Update path whose input can be "syntactically valid but doesn't actually work."
- **OCP — `IDataSourceProvider`:** each data source type (`SqlServerProvider`, `RestApiProvider`) implements the interface and is resolved by `DataSourceType` at runtime (`DataSourceService`/`DatasetService`'s `ResolveProvider`). Adding a new source type is a new provider class + one DI registration in `Program.cs` — existing providers never change.
- **DIP:** constructor injection only, registered in `Program.cs`. Never `new` up a service or `DbContext` inside another service.
- **Credentials:** `ICredentialProtector` (ASP.NET Core Data Protection) encrypts before persisting. **Never** decrypt and return credentials to the client. The connection Update endpoint is write-only for credentials — a blank `credentialsJson` means "keep what's already there," matching how password fields work everywhere else.
- **Guard clauses first**, immutable request DTOs (records) where practical, no God classes.

---

## Backend — EF Core (opposite convention from IqiCore — read this if you know that repo)

- **This project uses code-first EF Core migrations.** Schema changes go through `dotnet ef migrations add <Name> --project backend/Backend.csproj`, applied via `dotnet ef database update`. This is *unlike* a schema-frozen/SSDT-driven codebase — migrations are the source of truth here.
- **Lazy loading is OFF** (no `UseLazyLoadingProxies()`). `.Include()`/`.ThenInclude()` is the correct, expected way to load navigation properties (see `WidgetService.GetWidgetsAsync`'s `.Include(w => w.Binding)`). Don't apply "avoid `.Include()`" habits from a lazy-loading-enabled codebase here — without it, a used-but-not-included navigation property is just `null`/empty, not a silent extra query.
- Local dev and the deployed host each point at a **completely separate SQL Server database** (own connection string, own `DataSourceConnections` rows, own Data Protection key folder under `%ProgramData%`). They never share state — a stale-credential or migration issue in one never affects the other.
- **Check the generated migration's `defaultValue` before applying it.** EF picks the CLR default for a new non-nullable column, which is not necessarily the right value for rows that already exist — a `bool` property initialised to `true` in C# still generates `defaultValue: false`, silently flipping every existing row. This has bitten twice.

---

## Two databases

- **`ReportingDb`** — the platform's own state: reports, pages, widgets, bindings, datasets, connections. Owned by EF Core migrations. Back this up.
- **`ReportingCacheDb`** — one `mat.Dataset_{id}` table per Import dataset, created and dropped at runtime, never in a migration. Everything in it can be regenerated by re-running a query, so it is not backed up.

The test for which database something belongs in is simply *"could this be regenerated?"*. Connection strings are `ConnectionStrings:ReportingDatabase` and `ConnectionStrings:ReportingCacheDatabase`.

---

## Dataset storage modes

A dataset's `Mode` (TableQuery/RawSql/StoredProcedure/RestQuery) says **how the source is queried**; its `StorageMode` says **where rows are served from**. They are orthogonal.

- **`DirectQuery`** (default) — execute the source per request, capped by `RowLimit`, filtered in the browser.
- **`Import`** — materialised into `ReportingCacheDb`, then filtered, paged and aggregated in SQL.

Both are valid for every query mode; it is the report author's choice. What differs is capability: `DatasetService.CanPushDownQueries` decides whether filtering can reach the source. A stored procedure can't be filtered inline — `SELECT * FROM (EXEC ...)` isn't valid SQL — so a DirectQuery procedure keeps the row cap and does the work in memory.

**A materialised table must never outlive the query that produced it.** `UpdateAsync` drops it on a definition change or when a dataset stops being an Import; `DeleteAsync` drops it too. Otherwise a widget can be served the old query's rows with nothing to indicate it.

---

## Frontend Conventions

- **`verbatimModuleSyntax` is on** — always use `import type { X }` for type-only imports, never a bare `import { X }` for a type. `tsc -b` will fail otherwise.
- **`api/{resource}.ts`**: one file per backend resource. Interfaces mirror the backend's DTO shape field-for-field (camelCase, matching `System.Text.Json`'s default). When a backend summary/request record changes, update the matching frontend interface in the same change.
- **Edit dialogs mirror Create forms**: an entity's edit dialog uses its own `edit*`-prefixed state, separate from the create form's state, so opening "Edit" on one row never clobbers an in-progress "Add" draft (see `DataSourcesPage.tsx`/`DatasetsPage.tsx`). For datasets, editing reconstructs the mode-specific definition fields from the persisted `definitionJson` — see `parseTableQueryDefinition` (the inverse of `buildTableQueryDefinition`) as the pattern for any other mode that needs the same treatment.
- **`components/`** must stay reusable — no knowledge of *what* data it's displaying. `DataTable` (search, sort, per-column filter with a rendered-value cap for high-cardinality columns, resize, export) is used by 5+ call sites specifically because it knows nothing about reports/datasets/connections.
- **`widgets/`**: keep ECharts specifics inside `widgets/` (`shaping.ts`, `useECharts.ts`) — `pages/` and `reportEditor/` should never import `echarts` directly.
- **`theme.ts`** is the single source for cross-cutting visual conventions (table density, palette, sticky headers). Don't re-solve a global look with page-local `sx` overrides — fix it in `theme.ts` so every page gets it.
- MUI + Emotion; `Container maxWidth={false}` + explicit `px` is the current pattern for full-width management pages (Reports/Datasets/Connections) — don't reintroduce a `maxWidth="md"/"lg"` cap on these.

---

## Testing

- **Backend (xUnit, `Backend.Tests/`):** service tests use EF Core's `UseInMemoryDatabase(Guid.NewGuid().ToString())` per test for full isolation — never a shared/static database name. Method naming: `MethodName_Scenario_ExpectedResult`.
- **Frontend (Vitest + React Testing Library):** `npm run verify` before calling any change done. Vitest globals are off, so RTL's automatic cleanup doesn't self-register — but `src/setupTests.ts` registers one `afterEach(cleanup)` globally (wired via `vite.config.ts` `setupFiles`), so a per-file cleanup is redundant. A test file that also needs `vi.restoreAllMocks()` between cases still declares its own `afterEach`.
- Add tests alongside the code they cover, not in a separate pass at the end.

---

## Commit Conventions

Lowercase, imperative, prefixed by area or type: `frontend: ...`, `backend: ...`, `fix: ...`, `ci: ...`, `docs: ...`. Concise — the "why" belongs in the body if it's non-obvious, not a wall of text.

**No AI attribution, no `Co-Authored-By` line, no AI-formulaic tone.** This is a personal project — commits should read like Mulham wrote them.

---

## Deployment

GitHub Actions → build → S3 (presigned URL) → WinRM → IIS on the dev EC2 box (`erpapidev.iqiglobal.com`), shared with Mulham's employer's other environments. Backend at `/reporting` (Swagger at `/reporting/swagger` in dev), frontend at `/reportingapp`.

- **Push to `main` deploys automatically** — no branch/PR workflow exists. Confirm with Mulham before pushing unless he's explicitly already asked for it in the current exchange.
- Company AWS/SQL Server infrastructure is deliberately reused (Mulham's own informed decision, given eventual plans to hand this project to his employer) — but **no IQI-identifying names/strings in any committed file**. Secret *values* sourced from company infra are fine; they live only in GitHub Secrets under generic names (`S3_BUCKET`, not `IQI_BUCKET`).
- Local dev and the deployed host are fully independent (separate DB, separate Data Protection keys per machine) — see the EF Core section above.

---

## Workflow

- This project has used the `superpowers` brainstorming → writing-plans → subagent-driven-development flow for past milestones (see `docs/superpowers/`) — reach for it again for a genuinely new, multi-step milestone. For a bug fix or a small, well-scoped addition to existing functionality, just do the work directly; don't force a design doc onto a two-file change.
- Read the relevant controller/service/page before writing — mirror existing patterns.
- Minimal, surgical diffs — don't reformat or "tidy" untouched code.
- Verify with backend tests + `npm run verify` before finishing.

---

## Never Do

- Add try/catch in a controller to translate an exception into a status code — throw a typed exception and let `GlobalExceptionHandler` map it
- Use `InvalidOperationException` for "entity not found" — use `NotFoundException`
- Return decrypted credentials to the client, in any endpoint
- Persist a Dataset/Connection whose query/procedure hasn't actually been run and confirmed to work
- Avoid `.Include()` out of lazy-loading habit — this project has lazy loading OFF; `.Include()` is required, not banned
- Hand-edit the database schema outside an EF Core migration
- Commit with AI attribution or a `Co-Authored-By` line
- Push to `main` without confirming — it deploys immediately
