# Milestone 4: Report Designer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** let a user build an actual dashboard for a `Report` — a drag-and-drop canvas where widgets are placed on a grid, bound to a `Dataset` (Milestone 3), and rendered as real charts/tables/text — plus a separate read-only view page, closing the gap every prior milestone deliberately left open (`Report` has been `Id, Name, Description` and nothing else since Milestone 0).

**Architecture:** `WidgetsController → WidgetService → ReportingDbContext` on the backend (new `Widget`/`WidgetBinding` tables, one more migration on the same database). On the frontend, `ReportCanvas` (`/reports/{id}/edit`) and `ReportView` (`/reports/{id}`) are separate route components that both hydrate from `GET /api/reports/{id}/widgets` and both render the same six per-widget-type components through one shared `WidgetRenderer`; the only difference is whether gridstack's drag/resize/add/remove chrome is mounted around them.

**Tech Stack:** .NET 8, EF Core 8 (SqlServer + InMemory, pinned `8.0.11`), xUnit, System.Text.Json — all already in place, no new backend packages. React 19 + Vite 8 + TypeScript ~6.0.2 + MUI 9 + axios (already in place) plus three genuinely new frontend dependencies: **gridstack** (canvas drag/resize), **echarts** (Bar/Line/Pie rendering), and **Vitest + React Testing Library + jsdom** (this project's first frontend test runner).

See `docs/superpowers/specs/2026-07-21-milestone-4-report-designer-design.md` for the full approved design — this plan is the task breakdown for building it. This plan was written after reading the actual current repo state (`backend/Models`, `backend/Services/Datasets`, `backend/Controllers`, `backend/Data/ReportingDbContext.cs`, `Backend.Tests/*`, `frontend/src/*`, `frontend/package.json`, prior plan/design docs, and `git log`) rather than assuming it — several refinements below (noted where they happen) exist *because* of that reading and go beyond what the design doc alone specifies.

## Global Constraints

- Namespace/casing stays `Backend.*` (capital B) everywhere, same rule as every prior milestone.
- No new backend NuGet packages. `WidgetBinding.ValueFields` is a plain `string` column holding JSON (serialized/deserialized with `System.Text.Json`), exactly mirroring `Dataset.Columns`'s existing pattern — not a new EF Core concept.
- **This project has zero navigation properties or fluent relationship config anywhere today** — `Dataset.DataSourceConnectionId` is a bare `int`, no FK constraint, no nav property, `OnModelCreating` only seeds `Report.HasData`. `Widget`/`WidgetBinding` is a deliberate, called-out exception: `Widget` gets a `Binding` nav property + one `HasOne(...).WithOne()` fluent config, specifically so a widget-plus-its-binding can be inserted together in a single `SaveChangesAsync()` call with EF Core's own key-fixup (the widget's generated `Id` gets wired into `WidgetBinding.WidgetId` automatically) — this is what makes the whole-report delete-then-insert atomic *without* needing `Database.BeginTransactionAsync()`, which matters because **the InMemory provider this project's tests already use throughout does not support relational transactions**, and one `SaveChangesAsync()` call is already one atomic transaction regardless of provider. `ReportId`, `DatasetId` stay bare `int`s with no nav property/constraint, same as every existing FK in this project.
- `WidgetBinding` has the same two fields (`CategoryField: string?`, `ValueFields: string` (JSON `string[]`)) for every widget type — no per-type schema branching. Per-type cardinality is enforced by `WidgetBindingValidator`, not the schema: **Kpi** — `CategoryField` null, `ValueFields` exactly 1; **Bar/Line** — `CategoryField` required, `ValueFields` 1+; **Pie** — `CategoryField` required, `ValueFields` exactly 1; **Table** — `CategoryField` unused, `ValueFields` is a column-name subset (empty means "show all columns"); **Text** — no binding at all, ever.
- **Text widgets never persist a `WidgetBinding` row.** This is enforced twice, deliberately: `WidgetBindingValidator` rejects a Text widget request that carries a binding (400), and `WidgetService.SaveWidgetsAsync` also never constructs a `WidgetBinding` for a `Type == Text` widget even if one somehow got past validation — belt and suspenders on the one invariant the design doc calls out by name.
- Save-time validation is **structural only** (cardinality + Text-never-binds + the referenced Dataset id is a plausible int) — it never checks that `CategoryField`/`ValueFields` are still real column names in the target Dataset. That check happens at render time on the frontend instead (stale-binding card), because save-time checking would need an extra column-discovery round-trip and would be stale the instant the Dataset's query changed afterward anyway.
- **Two distinct exception types map to two distinct HTTP statuses in `WidgetsController`, on purpose**: `InvalidOperationException` (report not found) → 404, `WidgetValidationException` (a widget failed cardinality validation) → 400. This mirrors a real lesson from this project's own history — Milestone 3 originally reused `InvalidOperationException` for both "not found" and "bad column preview," which made `ORDER BY` validation failures incorrectly return 404 instead of 502, and had to be fixed by introducing `QueryPreviewException` (see `git log` — `7976d06 backend: use a dedicated QueryPreviewException...`). Reusing one exception type for two different failure semantics here would be the same mistake again.
- **Field-shape classification (`Categorical`/`Numeric`/`Temporal`/`Unsupported`) lives ONLY on the frontend (TypeScript), not the backend.** The design doc left this ambiguous; reading the actual codebase resolved it — nothing in backend validation needs a field's *kind*, only its *cardinality* (see above), and the only consumer of classification is the frontend's binding-picker UI grouping/sorting already-fetched `ColumnDescriptor.nativeType` strings. Duplicating the classifier in C# would be dead code with no caller. Skip it.
- Case-insensitive JSON deserialization (a real, twice-bitten issue in this project per `git log` — `259984a backend: deserialize Dataset definitionJson case-insensitively`) does **not** need special handling in this milestone: every request DTO here is bound directly by ASP.NET Core's model binder (already case-insensitive by framework default, exactly like `DatasetsController.Create(CreateDatasetRequest request)`), and the one manual `JsonSerializer.Deserialize` this milestone does (`WidgetBinding.ValueFields`, a bare `string[]` with no property names) has no case-sensitivity surface at all. Noted explicitly so it's clear this was checked, not overlooked.
- `Backend.Tests/*.cs` files are **flat** in the `Backend.Tests/` folder root, namespace `Backend.Tests` — confirmed from the real directory listing (`DatasetServiceTests.cs`, `SqlServerProviderQueryBuilderTests.cs`, etc. all live directly there, no subfolders). New test files in this plan follow the same flat layout.
- Frontend versions already pinned in `frontend/package.json` (React `^19.2.7`, MUI `^9.2.0`, Vite `^8.1.1`, TypeScript `~6.0.2`) are untouched. The three new packages this milestone adds (`gridstack`, `echarts`, and the Vitest/RTL/jsdom test toolchain) get no hand-picked version numbers — `npm install` resolves current majors, matching how this project handled `react-router-dom` in Milestone 2.
- `frontend/tsconfig.app.json` has `"verbatimModuleSyntax": true` — every new `.ts`/`.tsx` file in this plan uses `import type { X }` for type-only imports, matching the existing convention seen in `ReportsPage.tsx` (`import { createReport, getReports, type Report } from "../api/reports"`).
- Commits stage **exact file paths only, never `git add -A`.** This project's own Milestone 3 Task 10 commit used `git add -A` — flagged here as a mistake to not repeat, not a pattern to follow.
- Commit messages follow this project's real style from `git log` (`backend: ...`, `frontend: ...`, lowercase, imperative, no trailer) — **no `Co-Authored-By` line on any commit in this plan.** This is Mulham's personal project; per his own standing preference, personal-repo commits carry no AI attribution.
- Any step involving `dotnet run` + manual `curl`/`sqlcmd` testing must first confirm no stale `Backend.exe` is already holding port 5198 (a repeat issue in this project's own migration/smoke-test history) and confirm the port is free again afterward.
- `$env:ASPNETCORE_ENVIRONMENT = "Development"` before any `dotnet ef` command, same as every prior milestone.
- Same SQL Server Express instance (`localhost\SQLEXPRESS`, `OpenReportingPlatform` database) as prior milestones — this migration adds two tables (`Widgets`, `WidgetBindings`), doesn't touch `Reports`/`DataSourceConnections`/`Datasets`.
- Every widget must have an editable `Title`, and every `Text` widget must have an editable `Content` — the canvas UI must expose controls for both (see Task 14), not just the reducer actions that update them. A Text widget with no way to type its content would make one of the six required widget types non-functional in practice.
- Explicitly **not** in scope (from the design doc's own "Explicitly Out of Scope," repeated here so it's visible mid-implementation): rich text formatting for Text widgets, Pie's "sliced by measure, no category" mode, any proactive cross-report validation when a Dataset's query changes, widget identity/undo/version history across saves, and anything already out of scope from Milestone 3 (multi-table joins, cross-dialect SQL, Dataset caching, runtime-editable stored-proc params, non-GET REST, the still-open TableQuery filter/sort/Top-N UI gap). Resist scope creep toward any of these.

---

### Task 1: `WidgetType` enum + `Widget`/`WidgetBinding` entities + `DbSet`s + one-to-one config

**Files:**
- Create: `backend/Models/WidgetType.cs`
- Create: `backend/Models/Widget.cs`
- Create: `backend/Models/WidgetBinding.cs`
- Modify: `backend/Data/ReportingDbContext.cs`

**Interfaces:**
- Consumes: nothing new — `ReportingDbContext` already has `Reports`/`DataSourceConnections`/`Datasets`.
- Produces: `Backend.Models.WidgetType` (enum: `Table`, `Bar`, `Line`, `Pie`, `Kpi`, `Text`), `Backend.Models.Widget` (mutable class, plain FK int `ReportId`, no nav property to `Report` — matching `Dataset.DataSourceConnectionId`'s existing style — plus a `Binding` nav property, the one deliberate exception explained in Global Constraints), `Backend.Models.WidgetBinding` (mutable class, `WidgetId`/`DatasetId` plain `int`s, `ValueFields` a JSON-string column defaulting to `"[]"`), `DbSet<Widget> Widgets`/`DbSet<WidgetBinding> WidgetBindings` on `ReportingDbContext`. Every later task depends on these exact shapes.

No test step here — same precedent as the Milestone 3 plan's own Task 1 (a plain entity + `DbSet` with no behavior isn't unit-testable; correctness is a compile check now and a real-DB check in Task 5).

- [ ] Step 1: Create `backend/Models/WidgetType.cs`:
  ```csharp
  namespace Backend.Models;

  public enum WidgetType
  {
      Table,
      Bar,
      Line,
      Pie,
      Kpi,
      Text
  }
  ```

- [ ] Step 2: Create `backend/Models/Widget.cs`:
  ```csharp
  namespace Backend.Models;

  public class Widget
  {
      public int Id { get; set; }

      public int ReportId { get; set; }

      public WidgetType Type { get; set; }

      public int X { get; set; }

      public int Y { get; set; }

      public int W { get; set; }

      public int H { get; set; }

      public string Title { get; set; } = "";

      public string? Content { get; set; }

      public WidgetBinding? Binding { get; set; }
  }
  ```
  `Content` is only meaningful when `Type == Text` (plain text, no rich formatting in v1) — left null for every other type. `Binding` is the one navigation property in this whole project; see Global Constraints for why.

- [ ] Step 3: Create `backend/Models/WidgetBinding.cs`:
  ```csharp
  namespace Backend.Models;

  public class WidgetBinding
  {
      public int Id { get; set; }

      public int WidgetId { get; set; }

      public int DatasetId { get; set; }

      public string? CategoryField { get; set; }

      public string ValueFields { get; set; } = "[]";
  }
  ```
  `ValueFields` defaults to `"[]"` (an empty JSON array), not `""`, for the same reason `Dataset.Columns` does — it's always deserialized as a `string[]`, and an empty array is a meaningful valid state (Table's "no columns picked yet, show everything" default from the design doc), whereas `""` isn't valid JSON.

- [ ] Step 4: Modify `backend/Data/ReportingDbContext.cs` — full file after the change:
  ```csharp
  using Backend.Models;
  using Microsoft.EntityFrameworkCore;

  namespace Backend.Data;

  public class ReportingDbContext : DbContext
  {
      public ReportingDbContext(DbContextOptions<ReportingDbContext> options) : base(options)
      {
      }

      public DbSet<Report> Reports => Set<Report>();

      public DbSet<DataSourceConnection> DataSourceConnections => Set<DataSourceConnection>();

      public DbSet<Dataset> Datasets => Set<Dataset>();

      public DbSet<Widget> Widgets => Set<Widget>();

      public DbSet<WidgetBinding> WidgetBindings => Set<WidgetBinding>();

      protected override void OnModelCreating(ModelBuilder modelBuilder)
      {
          base.OnModelCreating(modelBuilder);

          modelBuilder.Entity<Report>().HasData(
              new Report(1, "Monthly Sales", "Sales totals grouped by month"),
              new Report(2, "Top Agents", "Agents ranked by closed deals"),
              new Report(3, "Pipeline Overview", "Open deals by stage")
          );

          modelBuilder.Entity<Widget>()
              .HasOne(w => w.Binding)
              .WithOne()
              .HasForeignKey<WidgetBinding>(b => b.WidgetId);
      }
  }
  ```

- [ ] Step 5: Build to confirm it compiles:
  ```
  dotnet build backend/Backend.csproj
  ```
  Expected: `Build succeeded.` with 0 errors.

- [ ] Step 6: Commit:
  ```
  git add backend/Models/WidgetType.cs backend/Models/Widget.cs backend/Models/WidgetBinding.cs backend/Data/ReportingDbContext.cs
  git commit -m "backend: add Widget/WidgetBinding entities, DbSets, one-to-one config"
  ```

---

### Task 2: Widget request/response DTOs + `WidgetBindingValidator` (TDD)

**Files:**
- Create: `backend/Services/Widgets/WidgetSummary.cs`
- Create: `backend/Services/Widgets/SaveWidgetsRequest.cs`
- Create: `backend/Services/Widgets/WidgetBindingValidationResult.cs`
- Create: `backend/Services/Widgets/IWidgetBindingValidator.cs`
- Create: `backend/Services/Widgets/WidgetBindingValidator.cs`
- Create: `backend/Services/Widgets/WidgetValidationException.cs`
- Create: `Backend.Tests/WidgetBindingValidatorTests.cs`

**Interfaces:**
- Consumes: `Backend.Models.WidgetType` (Task 1).
- Produces: `WidgetSummary`/`WidgetBindingSummary` (GET response shape, mirrors `DatasetSummary`'s style), `SaveWidgetRequest`/`SaveWidgetBindingRequest`/`SaveWidgetsRequest` (PUT request shape — the whole array is the request body), `IWidgetBindingValidator.Validate(WidgetType type, SaveWidgetBindingRequest? binding) -> WidgetBindingValidationResult`, `WidgetValidationException`. Task 3's `WidgetService` and Task 4's `WidgetsController` both depend on these exact shapes/signatures.

- [ ] Step 1: Create `backend/Services/Widgets/WidgetSummary.cs`:
  ```csharp
  using Backend.Models;

  namespace Backend.Services.Widgets;

  public record WidgetSummary(
      int Id,
      WidgetType Type,
      int X,
      int Y,
      int W,
      int H,
      string Title,
      string? Content,
      WidgetBindingSummary? Binding);

  public record WidgetBindingSummary(int DatasetId, string? CategoryField, IReadOnlyList<string> ValueFields);
  ```

- [ ] Step 2: Create `backend/Services/Widgets/SaveWidgetsRequest.cs` (the three request shapes travel together, same bundling convention as `DatasetDefinitions.cs`):
  ```csharp
  using Backend.Models;

  namespace Backend.Services.Widgets;

  public record SaveWidgetsRequest(IReadOnlyList<SaveWidgetRequest> Widgets);

  public record SaveWidgetRequest(
      WidgetType Type,
      int X,
      int Y,
      int W,
      int H,
      string Title,
      string? Content,
      SaveWidgetBindingRequest? Binding);

  public record SaveWidgetBindingRequest(int DatasetId, string? CategoryField, IReadOnlyList<string> ValueFields);
  ```

- [ ] Step 3: Create `backend/Services/Widgets/WidgetBindingValidationResult.cs`:
  ```csharp
  namespace Backend.Services.Widgets;

  public class WidgetBindingValidationResult
  {
      public bool IsValid { get; }

      public string? Error { get; }

      private WidgetBindingValidationResult(bool isValid, string? error)
      {
          IsValid = isValid;
          Error = error;
      }

      public static WidgetBindingValidationResult Success() => new(true, null);

      public static WidgetBindingValidationResult Failure(string error) => new(false, error);
  }
  ```

- [ ] Step 4: Create `backend/Services/Widgets/IWidgetBindingValidator.cs`:
  ```csharp
  using Backend.Models;

  namespace Backend.Services.Widgets;

  public interface IWidgetBindingValidator
  {
      WidgetBindingValidationResult Validate(WidgetType type, SaveWidgetBindingRequest? binding);
  }
  ```

- [ ] Step 5: Create `backend/Services/Widgets/WidgetValidationException.cs`:
  ```csharp
  namespace Backend.Services.Widgets;

  public class WidgetValidationException : Exception
  {
      public WidgetValidationException(string message) : base(message)
      {
      }
  }
  ```

- [ ] Step 6: Write the failing tests — `Backend.Tests/WidgetBindingValidatorTests.cs`:
  ```csharp
  using Backend.Models;
  using Backend.Services.Widgets;
  using Xunit;

  namespace Backend.Tests;

  public class WidgetBindingValidatorTests
  {
      private readonly WidgetBindingValidator _validator = new();

      [Fact]
      public void Validate_TextWithNoBinding_Succeeds()
      {
          var result = _validator.Validate(WidgetType.Text, null);

          Assert.True(result.IsValid);
      }

      [Fact]
      public void Validate_TextWithBinding_Fails()
      {
          var binding = new SaveWidgetBindingRequest(1, null, new List<string> { "Anything" });

          var result = _validator.Validate(WidgetType.Text, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Text widgets must not have a binding.", result.Error);
      }

      [Fact]
      public void Validate_KpiWithCategoryField_Fails()
      {
          var binding = new SaveWidgetBindingRequest(1, "Region", new List<string> { "Revenue" });

          var result = _validator.Validate(WidgetType.Kpi, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Kpi widgets must not have a CategoryField.", result.Error);
      }

      [Fact]
      public void Validate_KpiWithTwoValueFields_Fails()
      {
          var binding = new SaveWidgetBindingRequest(1, null, new List<string> { "Revenue", "Cost" });

          var result = _validator.Validate(WidgetType.Kpi, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Kpi widgets must have exactly one ValueField.", result.Error);
      }

      [Fact]
      public void Validate_KpiWithSingleValueFieldAndNoCategory_Succeeds()
      {
          var binding = new SaveWidgetBindingRequest(1, null, new List<string> { "Revenue" });

          var result = _validator.Validate(WidgetType.Kpi, binding);

          Assert.True(result.IsValid);
      }

      [Fact]
      public void Validate_PieWithTwoValueFields_Fails()
      {
          var binding = new SaveWidgetBindingRequest(1, "Region", new List<string> { "Revenue", "Cost" });

          var result = _validator.Validate(WidgetType.Pie, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Pie widgets must have exactly one ValueField.", result.Error);
      }

      [Fact]
      public void Validate_PieWithNoCategoryField_Fails()
      {
          var binding = new SaveWidgetBindingRequest(1, null, new List<string> { "Revenue" });

          var result = _validator.Validate(WidgetType.Pie, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Pie widgets require a CategoryField.", result.Error);
      }

      [Fact]
      public void Validate_BarWithNoCategoryField_Fails()
      {
          var binding = new SaveWidgetBindingRequest(1, null, new List<string> { "Revenue" });

          var result = _validator.Validate(WidgetType.Bar, binding);

          Assert.False(result.IsValid);
          Assert.Equal("This widget type requires a CategoryField.", result.Error);
      }

      [Fact]
      public void Validate_BarWithCategoryAndMultipleValueFields_Succeeds()
      {
          var binding = new SaveWidgetBindingRequest(1, "Month", new List<string> { "Revenue", "Cost" });

          var result = _validator.Validate(WidgetType.Bar, binding);

          Assert.True(result.IsValid);
      }

      [Fact]
      public void Validate_LineWithNoValueFields_Fails()
      {
          var binding = new SaveWidgetBindingRequest(1, "Month", new List<string>());

          var result = _validator.Validate(WidgetType.Line, binding);

          Assert.False(result.IsValid);
          Assert.Equal("This widget type requires at least one ValueField.", result.Error);
      }

      [Fact]
      public void Validate_TableWithAnyValueFields_Succeeds()
      {
          var binding = new SaveWidgetBindingRequest(1, null, new List<string>());

          var result = _validator.Validate(WidgetType.Table, binding);

          Assert.True(result.IsValid);
      }

      [Fact]
      public void Validate_UnconfiguredNonTextWidget_Succeeds()
      {
          var result = _validator.Validate(WidgetType.Bar, null);

          Assert.True(result.IsValid);
      }
  }
  ```

- [ ] Step 7: Run the tests to confirm they fail to compile (`WidgetBindingValidator` doesn't exist yet):
  ```
  dotnet test Backend.Tests
  ```
  Expected: build errors — `CS0246` (type or namespace not found).

- [ ] Step 8: Create `backend/Services/Widgets/WidgetBindingValidator.cs`:
  ```csharp
  using Backend.Models;

  namespace Backend.Services.Widgets;

  public class WidgetBindingValidator : IWidgetBindingValidator
  {
      public WidgetBindingValidationResult Validate(WidgetType type, SaveWidgetBindingRequest? binding)
      {
          if (type == WidgetType.Text)
          {
              return binding == null
                  ? WidgetBindingValidationResult.Success()
                  : WidgetBindingValidationResult.Failure("Text widgets must not have a binding.");
          }

          if (binding == null)
          {
              return WidgetBindingValidationResult.Success();
          }

          return type switch
          {
              WidgetType.Kpi => ValidateKpi(binding),
              WidgetType.Pie => ValidatePie(binding),
              WidgetType.Bar => ValidateCategoryPlusValues(binding),
              WidgetType.Line => ValidateCategoryPlusValues(binding),
              WidgetType.Table => WidgetBindingValidationResult.Success(),
              _ => WidgetBindingValidationResult.Failure($"Unknown widget type '{type}'.")
          };
      }

      private static WidgetBindingValidationResult ValidateKpi(SaveWidgetBindingRequest binding)
      {
          if (binding.CategoryField != null)
          {
              return WidgetBindingValidationResult.Failure("Kpi widgets must not have a CategoryField.");
          }

          if (binding.ValueFields.Count != 1)
          {
              return WidgetBindingValidationResult.Failure("Kpi widgets must have exactly one ValueField.");
          }

          return WidgetBindingValidationResult.Success();
      }

      private static WidgetBindingValidationResult ValidatePie(SaveWidgetBindingRequest binding)
      {
          if (string.IsNullOrWhiteSpace(binding.CategoryField))
          {
              return WidgetBindingValidationResult.Failure("Pie widgets require a CategoryField.");
          }

          if (binding.ValueFields.Count != 1)
          {
              return WidgetBindingValidationResult.Failure("Pie widgets must have exactly one ValueField.");
          }

          return WidgetBindingValidationResult.Success();
      }

      private static WidgetBindingValidationResult ValidateCategoryPlusValues(SaveWidgetBindingRequest binding)
      {
          if (string.IsNullOrWhiteSpace(binding.CategoryField))
          {
              return WidgetBindingValidationResult.Failure("This widget type requires a CategoryField.");
          }

          if (binding.ValueFields.Count == 0)
          {
              return WidgetBindingValidationResult.Failure("This widget type requires at least one ValueField.");
          }

          return WidgetBindingValidationResult.Success();
      }
  }
  ```

- [ ] Step 9: Run the tests again to confirm they pass:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass, including every pre-existing test.

- [ ] Step 10: Commit:
  ```
  git add backend/Services/Widgets/WidgetSummary.cs backend/Services/Widgets/SaveWidgetsRequest.cs backend/Services/Widgets/WidgetBindingValidationResult.cs backend/Services/Widgets/IWidgetBindingValidator.cs backend/Services/Widgets/WidgetBindingValidator.cs backend/Services/Widgets/WidgetValidationException.cs Backend.Tests/WidgetBindingValidatorTests.cs
  git commit -m "backend: Widget DTOs, WidgetBindingValidator (TDD, per-type cardinality rules)"
  ```

---

### Task 3: `IWidgetService`/`WidgetService` (TDD via EF Core InMemory)

**Files:**
- Create: `backend/Services/Widgets/IWidgetService.cs`
- Create: `backend/Services/Widgets/WidgetService.cs`
- Create: `Backend.Tests/WidgetServiceTests.cs`

**Interfaces:**
- Consumes: `Backend.Data.ReportingDbContext` with `Widgets`/`WidgetBindings` (Task 1), all `Backend.Services.Widgets` DTOs + `IWidgetBindingValidator` (Task 2).
- Produces: `IWidgetService.GetWidgetsAsync(int reportId) -> Task<IReadOnlyList<WidgetSummary>>`, `IWidgetService.SaveWidgetsAsync(int reportId, SaveWidgetsRequest request) -> Task<IReadOnlyList<WidgetSummary>>`, `WidgetService(ReportingDbContext context, IWidgetBindingValidator validator)`. Task 4's controller depends on this exact constructor and both method signatures.

**Not found vs. validation failure:** `GetWidgetsAsync`/`SaveWidgetsAsync` both throw `InvalidOperationException` when `reportId` doesn't exist (→ 404 in the controller). `SaveWidgetsAsync` throws `WidgetValidationException` when any widget fails `WidgetBindingValidator` (→ 400). These are deliberately different exception types — see Global Constraints.

**Single `SaveChangesAsync()`, no explicit transaction:** `SaveWidgetsAsync` removes every existing `Widget`/`WidgetBinding` row for the report and adds the whole new set (each new `Widget` with its `Binding` set via the nav property from Task 1) in ONE `SaveChangesAsync()` call. EF Core wraps one `SaveChangesAsync()` call in one transaction regardless of provider, and its own key-fixup resolves each new widget's generated `Id` into its binding's `WidgetId` before the insert — no `Database.BeginTransactionAsync()` needed, which also means this is fully testable against the InMemory provider (which doesn't support that API at all).

- [ ] Step 1: Create `backend/Services/Widgets/IWidgetService.cs`:
  ```csharp
  namespace Backend.Services.Widgets;

  public interface IWidgetService
  {
      Task<IReadOnlyList<WidgetSummary>> GetWidgetsAsync(int reportId);

      Task<IReadOnlyList<WidgetSummary>> SaveWidgetsAsync(int reportId, SaveWidgetsRequest request);
  }
  ```

- [ ] Step 2: Write the failing tests — `Backend.Tests/WidgetServiceTests.cs`:
  ```csharp
  using Backend.Data;
  using Backend.Models;
  using Backend.Services.Widgets;
  using Microsoft.EntityFrameworkCore;
  using Xunit;

  namespace Backend.Tests;

  public class WidgetServiceTests
  {
      private static (IWidgetService Service, ReportingDbContext Context) CreateService(string databaseName)
      {
          var options = new DbContextOptionsBuilder<ReportingDbContext>()
              .UseInMemoryDatabase(databaseName)
              .Options;

          var context = new ReportingDbContext(options);
          context.Database.EnsureCreated();

          var service = new WidgetService(context, new WidgetBindingValidator());
          return (service, context);
      }

      [Fact]
      public async Task GetWidgetsAsync_ReportNotFound_Throws()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());

          await Assert.ThrowsAsync<InvalidOperationException>(() => service.GetWidgetsAsync(999));
      }

      [Fact]
      public async Task GetWidgetsAsync_ReportWithNoWidgets_ReturnsEmptyList()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());

          var widgets = await service.GetWidgetsAsync(1);

          Assert.Empty(widgets);
      }

      [Fact]
      public async Task SaveWidgetsAsync_ReportNotFound_Throws()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest>());

          await Assert.ThrowsAsync<InvalidOperationException>(() => service.SaveWidgetsAsync(999, request));
      }

      [Fact]
      public async Task SaveWidgetsAsync_InvalidBinding_ThrowsWidgetValidationException()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var badWidget = new SaveWidgetRequest(
              WidgetType.Kpi, 0, 0, 4, 3, "Bad Kpi", null,
              new SaveWidgetBindingRequest(1, "Region", new List<string> { "Revenue" }));
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { badWidget });

          await Assert.ThrowsAsync<WidgetValidationException>(() => service.SaveWidgetsAsync(1, request));
      }

      [Fact]
      public async Task SaveWidgetsAsync_PersistsWidgetsWithBindings()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var barWidget = new SaveWidgetRequest(
              WidgetType.Bar, 0, 0, 4, 3, "Revenue by Month", null,
              new SaveWidgetBindingRequest(1, "Month", new List<string> { "Revenue" }));
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { barWidget });

          var saved = await service.SaveWidgetsAsync(1, request);

          var widget = Assert.Single(saved);
          Assert.True(widget.Id > 0);
          Assert.Equal("Revenue by Month", widget.Title);
          Assert.NotNull(widget.Binding);
          Assert.Equal("Month", widget.Binding!.CategoryField);
          Assert.Equal(new List<string> { "Revenue" }, widget.Binding.ValueFields);
      }

      [Fact]
      public async Task SaveWidgetsAsync_TextWidgetWithSubmittedBinding_StripsBindingBeforeValidating()
      {
          // WidgetBindingValidator itself would reject this (Text must not have a binding), so this
          // proves the service surfaces that as a 400-mapped WidgetValidationException rather than
          // silently succeeding — Text-never-binds is enforced at the validation gate.
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var textWidget = new SaveWidgetRequest(
              WidgetType.Text, 0, 0, 4, 2, "A note", "Hello",
              new SaveWidgetBindingRequest(1, null, new List<string> { "Anything" }));
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { textWidget });

          await Assert.ThrowsAsync<WidgetValidationException>(() => service.SaveWidgetsAsync(1, request));
      }

      [Fact]
      public async Task SaveWidgetsAsync_ReplacesEntireExistingSetInOneCall()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());
          var firstRequest = new SaveWidgetsRequest(new List<SaveWidgetRequest>
          {
              new(WidgetType.Kpi, 0, 0, 2, 2, "Widget A", null, new SaveWidgetBindingRequest(1, null, new List<string> { "Revenue" })),
              new(WidgetType.Text, 2, 0, 2, 2, "Widget B", "note", null)
          });
          await service.SaveWidgetsAsync(1, firstRequest);

          var secondRequest = new SaveWidgetsRequest(new List<SaveWidgetRequest>
          {
              new(WidgetType.Text, 0, 0, 4, 2, "Only Widget", "replaced everything", null)
          });
          var saved = await service.SaveWidgetsAsync(1, secondRequest);

          Assert.Single(saved);
          Assert.Equal("Only Widget", saved[0].Title);
          Assert.Equal(1, await context.Widgets.CountAsync());
          Assert.Equal(0, await context.WidgetBindings.CountAsync());
      }

      [Fact]
      public async Task SaveWidgetsAsync_TableWidgetWithEmptyValueFields_Persists()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var tableWidget = new SaveWidgetRequest(
              WidgetType.Table, 0, 0, 6, 4, "All Columns", null,
              new SaveWidgetBindingRequest(1, null, new List<string>()));
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { tableWidget });

          var saved = await service.SaveWidgetsAsync(1, request);

          Assert.Empty(saved[0].Binding!.ValueFields);
      }
  }
  ```

- [ ] Step 3: Run the tests to confirm they fail to compile (`WidgetService` doesn't exist yet):
  ```
  dotnet test Backend.Tests
  ```
  Expected: `CS0246`. Red.

- [ ] Step 4: Create `backend/Services/Widgets/WidgetService.cs`:
  ```csharp
  using System.Text.Json;
  using Backend.Data;
  using Backend.Models;
  using Microsoft.EntityFrameworkCore;

  namespace Backend.Services.Widgets;

  public class WidgetService : IWidgetService
  {
      private readonly ReportingDbContext _context;
      private readonly IWidgetBindingValidator _validator;

      public WidgetService(ReportingDbContext context, IWidgetBindingValidator validator)
      {
          _context = context;
          _validator = validator;
      }

      public async Task<IReadOnlyList<WidgetSummary>> GetWidgetsAsync(int reportId)
      {
          await EnsureReportExistsAsync(reportId);

          var widgets = await _context.Widgets
              .Include(w => w.Binding)
              .Where(w => w.ReportId == reportId)
              .ToListAsync();

          return widgets.Select(ToSummary).ToList();
      }

      public async Task<IReadOnlyList<WidgetSummary>> SaveWidgetsAsync(int reportId, SaveWidgetsRequest request)
      {
          await EnsureReportExistsAsync(reportId);

          foreach (var widgetRequest in request.Widgets)
          {
              var validation = _validator.Validate(widgetRequest.Type, widgetRequest.Binding);
              if (!validation.IsValid)
              {
                  throw new WidgetValidationException(validation.Error!);
              }
          }

          var existingWidgets = await _context.Widgets.Where(w => w.ReportId == reportId).ToListAsync();
          var existingWidgetIds = existingWidgets.Select(w => w.Id).ToList();
          var existingBindings = await _context.WidgetBindings.Where(b => existingWidgetIds.Contains(b.WidgetId)).ToListAsync();

          _context.WidgetBindings.RemoveRange(existingBindings);
          _context.Widgets.RemoveRange(existingWidgets);

          foreach (var widgetRequest in request.Widgets)
          {
              var widget = new Widget
              {
                  ReportId = reportId,
                  Type = widgetRequest.Type,
                  X = widgetRequest.X,
                  Y = widgetRequest.Y,
                  W = widgetRequest.W,
                  H = widgetRequest.H,
                  Title = widgetRequest.Title,
                  Content = widgetRequest.Content
              };

              // Text widgets never persist a binding, even if one somehow got past validation above —
              // enforced again here at the point of persistence, not just at the validation gate.
              if (widgetRequest.Type != WidgetType.Text && widgetRequest.Binding != null)
              {
                  widget.Binding = new WidgetBinding
                  {
                      DatasetId = widgetRequest.Binding.DatasetId,
                      CategoryField = widgetRequest.Binding.CategoryField,
                      ValueFields = JsonSerializer.Serialize(widgetRequest.Binding.ValueFields)
                  };
              }

              _context.Widgets.Add(widget);
          }

          await _context.SaveChangesAsync();

          return await GetWidgetsAsync(reportId);
      }

      private async Task EnsureReportExistsAsync(int reportId)
      {
          var exists = await _context.Reports.AnyAsync(r => r.Id == reportId);
          if (!exists)
          {
              throw new InvalidOperationException($"No report found with id {reportId}.");
          }
      }

      private static WidgetSummary ToSummary(Widget widget)
      {
          WidgetBindingSummary? bindingSummary = null;
          if (widget.Binding != null)
          {
              var valueFields = JsonSerializer.Deserialize<List<string>>(widget.Binding.ValueFields) ?? new List<string>();
              bindingSummary = new WidgetBindingSummary(widget.Binding.DatasetId, widget.Binding.CategoryField, valueFields);
          }

          return new WidgetSummary(widget.Id, widget.Type, widget.X, widget.Y, widget.W, widget.H, widget.Title, widget.Content, bindingSummary);
      }
  }
  ```

- [ ] Step 5: Run the tests again to confirm they pass:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass, including every pre-existing test.

- [ ] Step 6: Commit:
  ```
  git add backend/Services/Widgets/IWidgetService.cs backend/Services/Widgets/WidgetService.cs Backend.Tests/WidgetServiceTests.cs
  git commit -m "backend: WidgetService, TDD'd against EF Core InMemory, single-SaveChanges delete-then-insert"
  ```

---

### Task 4: `WidgetsController` + `Program.cs` DI wiring

**Files:**
- Create: `backend/Controllers/WidgetsController.cs`
- Modify: `backend/Program.cs`
- Create: `Backend.Tests/WidgetsControllerTests.cs`

**Interfaces:**
- Consumes: `IWidgetService` (Task 3), all `Backend.Services.Widgets` DTOs (Task 2).
- Produces: `GET /api/reports/{reportId}/widgets`, `PUT /api/reports/{reportId}/widgets`. Task 9 (frontend API client) depends on these two routes and their exact request/response shapes.

- [ ] Step 1: Create `backend/Controllers/WidgetsController.cs`:
  ```csharp
  using Backend.Services.Widgets;
  using Microsoft.AspNetCore.Mvc;

  namespace Backend.Controllers;

  [ApiController]
  [Route("api/reports/{reportId}/widgets")]
  public class WidgetsController : ControllerBase
  {
      private readonly IWidgetService _service;

      public WidgetsController(IWidgetService service)
      {
          _service = service;
      }

      [HttpGet]
      public async Task<ActionResult<IReadOnlyList<WidgetSummary>>> GetWidgets(int reportId)
      {
          try
          {
              return Ok(await _service.GetWidgetsAsync(reportId));
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
      }

      [HttpPut]
      public async Task<ActionResult<IReadOnlyList<WidgetSummary>>> SaveWidgets(int reportId, SaveWidgetsRequest request)
      {
          try
          {
              return Ok(await _service.SaveWidgetsAsync(reportId, request));
          }
          catch (WidgetValidationException ex)
          {
              return BadRequest(ex.Message);
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
      }
  }
  ```

- [ ] Step 2: Modify `backend/Program.cs` — add the `using` and one DI registration line each for the service and validator, alongside the existing `AddScoped<IDatasetService, DatasetService>()`:
  ```csharp
  using Backend.Services.Widgets;
  ```
  ```csharp
  builder.Services.AddScoped<IDatasetService, DatasetService>();
  builder.Services.AddScoped<IWidgetBindingValidator, WidgetBindingValidator>();
  builder.Services.AddScoped<IWidgetService, WidgetService>();
  ```

- [ ] Step 3: Write the controller tests — `Backend.Tests/WidgetsControllerTests.cs` (same EF InMemory + real service pattern as `ReportsControllerTests`, not a mock — this project has no mocking library, matching Milestone 2's established convention):
  ```csharp
  using Backend.Controllers;
  using Backend.Data;
  using Backend.Models;
  using Backend.Services.Widgets;
  using Microsoft.AspNetCore.Mvc;
  using Microsoft.EntityFrameworkCore;
  using Xunit;

  namespace Backend.Tests;

  public class WidgetsControllerTests
  {
      private static WidgetsController CreateController(string databaseName)
      {
          var options = new DbContextOptionsBuilder<ReportingDbContext>()
              .UseInMemoryDatabase(databaseName)
              .Options;

          var context = new ReportingDbContext(options);
          context.Database.EnsureCreated();

          var service = new WidgetService(context, new WidgetBindingValidator());
          return new WidgetsController(service);
      }

      [Fact]
      public async Task GetWidgets_ReportNotFound_Returns404()
      {
          var controller = CreateController(Guid.NewGuid().ToString());

          var result = await controller.GetWidgets(999);

          Assert.IsType<NotFoundObjectResult>(result.Result);
      }

      [Fact]
      public async Task GetWidgets_ReportWithNoWidgets_ReturnsEmptyOk()
      {
          var controller = CreateController(Guid.NewGuid().ToString());

          var result = await controller.GetWidgets(1);

          var ok = Assert.IsType<OkObjectResult>(result.Result);
          var widgets = Assert.IsAssignableFrom<IReadOnlyList<WidgetSummary>>(ok.Value);
          Assert.Empty(widgets);
      }

      [Fact]
      public async Task SaveWidgets_InvalidBinding_Returns400()
      {
          var controller = CreateController(Guid.NewGuid().ToString());
          var badWidget = new SaveWidgetRequest(
              WidgetType.Pie, 0, 0, 4, 3, "Bad Pie", null,
              new SaveWidgetBindingRequest(1, "Region", new List<string> { "A", "B" }));
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { badWidget });

          var result = await controller.SaveWidgets(1, request);

          Assert.IsType<BadRequestObjectResult>(result.Result);
      }

      [Fact]
      public async Task SaveWidgets_ReportNotFound_Returns404()
      {
          var controller = CreateController(Guid.NewGuid().ToString());
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest>());

          var result = await controller.SaveWidgets(999, request);

          Assert.IsType<NotFoundObjectResult>(result.Result);
      }

      [Fact]
      public async Task SaveWidgets_ValidRequest_Returns200WithSavedWidgets()
      {
          var controller = CreateController(Guid.NewGuid().ToString());
          var textWidget = new SaveWidgetRequest(WidgetType.Text, 0, 0, 4, 2, "A note", "hello", null);
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { textWidget });

          var result = await controller.SaveWidgets(1, request);

          var ok = Assert.IsType<OkObjectResult>(result.Result);
          var widgets = Assert.IsAssignableFrom<IReadOnlyList<WidgetSummary>>(ok.Value);
          var widget = Assert.Single(widgets);
          Assert.Equal("A note", widget.Title);
          Assert.Null(widget.Binding);
      }

      [Fact]
      public async Task GetWidgets_AfterSave_ReturnsPersistedWidgets()
      {
          var controller = CreateController(Guid.NewGuid().ToString());
          var kpiWidget = new SaveWidgetRequest(
              WidgetType.Kpi, 0, 0, 2, 2, "Total Revenue", null,
              new SaveWidgetBindingRequest(1, null, new List<string> { "Revenue" }));
          await controller.SaveWidgets(1, new SaveWidgetsRequest(new List<SaveWidgetRequest> { kpiWidget }));

          var result = await controller.GetWidgets(1);

          var ok = Assert.IsType<OkObjectResult>(result.Result);
          var widgets = Assert.IsAssignableFrom<IReadOnlyList<WidgetSummary>>(ok.Value);
          Assert.Single(widgets);
      }
  }
  ```

- [ ] Step 4: Run the tests:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass.

- [ ] Step 5: Commit:
  ```
  git add backend/Controllers/WidgetsController.cs backend/Program.cs Backend.Tests/WidgetsControllerTests.cs
  git commit -m "backend: WidgetsController (GET/PUT), DI wiring for WidgetService/WidgetBindingValidator"
  ```

---

### Task 5: Migration + apply to real database

**Files:**
- Create: `backend/Migrations/*_AddWidgets.cs` (and its `.Designer.cs` companion, plus an updated `ReportingDbContextModelSnapshot.cs`, all tool-generated)

**Interfaces:**
- Consumes: `ReportingDbContext` with `Widgets`/`WidgetBindings` (Task 1).
- Produces: the `Widgets`/`WidgetBindings` tables on the real `OpenReportingPlatform` database. Task 6's smoke test depends on this having actually run.

- [ ] Step 1: Set the environment for this terminal session:
  ```
  $env:ASPNETCORE_ENVIRONMENT = "Development"
  ```

- [ ] Step 2: Generate the migration:
  ```
  dotnet ef migrations add AddWidgets --project backend/Backend.csproj --startup-project backend/Backend.csproj
  ```
  Expected: ends with `Done.`, creates `backend/Migrations/{timestamp}_AddWidgets.cs` + `.Designer.cs`, updates `ReportingDbContextModelSnapshot.cs`, doesn't touch any earlier migration file.

- [ ] Step 3: Open the generated migration and confirm the `Up()` method creates `Widgets` (`Id` identity PK, `ReportId` int, `Type` int, `X`/`Y`/`W`/`H` int, `Title` nvarchar, `Content` nullable nvarchar) and `WidgetBindings` (`Id` identity PK, `WidgetId` int with a unique index + FK constraint to `Widgets.Id` — this is the one FK constraint in the whole project, a direct result of Task 1's deliberate nav-property exception — `DatasetId` int, `CategoryField` nullable nvarchar, `ValueFields` nvarchar). No edits needed — just confirm it matches.

- [ ] Step 4: Apply the migration:
  ```
  dotnet ef database update --project backend/Backend.csproj --startup-project backend/Backend.csproj
  ```
  Expected: ends with `Done.`, no errors.

- [ ] Step 5: Verify both tables exist:
  ```
  sqlcmd -S "localhost\SQLEXPRESS" -E -Q "SELECT TABLE_NAME FROM OpenReportingPlatform.INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME IN ('Widgets','WidgetBindings')"
  ```
  Expected: two rows.

- [ ] Step 6: Commit:
  ```
  git add backend/Migrations
  git commit -m "backend: add AddWidgets migration"
  ```

---

### Task 6: Backend manual smoke test (full save/load round trip against the real DB)

**Files:** none — verification only.

**Interfaces:**
- Consumes: everything from Tasks 1-5 running for real against SQL Server Express, not InMemory.
- Produces: nothing downstream — proof the whole backend half of this milestone actually works end-to-end, same role as Milestone 3's own Task 9.

- [ ] Step 1: Confirm no stale backend process is holding the port, then free it if so:
  ```
  Get-Process -Name Backend -ErrorAction SilentlyContinue | Stop-Process -Force
  ```

- [ ] Step 2: Start the app:
  ```
  dotnet run --project backend --launch-profile http
  ```
  Confirm it logs listening on `http://localhost:5198`.

- [ ] Step 3: From a second terminal, confirm the seeded reports exist and note an id to use below (`{reportId}`, seeded report `1` — "Monthly Sales" — works):
  ```
  curl.exe http://localhost:5198/api/reports
  ```

- [ ] Step 4: Confirm a fresh report has no widgets yet:
  ```
  curl.exe http://localhost:5198/api/reports/1/widgets
  ```
  Expected: `200 OK`, `[]`.

- [ ] Step 5: Confirm a non-existent report 404s:
  ```
  curl.exe -i http://localhost:5198/api/reports/999/widgets
  ```
  Expected: `404 Not Found`.

- [ ] Step 6: Save a mixed set of widgets — Kpi (valid), Text (no binding), and one deliberately invalid Bar (no `CategoryField`) to confirm the 400 path, before saving the corrected version. First, the invalid attempt:
  ```
  curl.exe -i -X PUT http://localhost:5198/api/reports/1/widgets -H "Content-Type: application/json" -d "{\"widgets\":[{\"type\":\"Bar\",\"x\":0,\"y\":0,\"w\":4,\"h\":3,\"title\":\"Bad Bar\",\"content\":null,\"binding\":{\"datasetId\":1,\"categoryField\":null,\"valueFields\":[\"Revenue\"]}}]}"
  ```
  Expected: `400 Bad Request`, body contains `"This widget type requires a CategoryField."`.

- [ ] Step 7: Now save a valid set (requires at least one real `Dataset` — if none exists yet on this database from Milestone 3's own smoke testing, create one first against the `Reports` table, same as Milestone 3 Task 9 Step 8, then use its id as `{datasetId}` below):
  ```
  curl.exe -X PUT http://localhost:5198/api/reports/1/widgets -H "Content-Type: application/json" -d "{\"widgets\":[{\"type\":\"Kpi\",\"x\":0,\"y\":0,\"w\":2,\"h\":2,\"title\":\"Total Reports\",\"content\":null,\"binding\":{\"datasetId\":{datasetId},\"categoryField\":null,\"valueFields\":[\"Id\"]}},{\"type\":\"Text\",\"x\":2,\"y\":0,\"w\":4,\"h\":2,\"title\":\"Note\",\"content\":\"Hello from the report designer\",\"binding\":null}]}"
  ```
  Expected: `200 OK`, a two-item array; each item has a real positive `id`; the Text item's `binding` is `null`.

- [ ] Step 8: Confirm the save round-trips on read:
  ```
  curl.exe http://localhost:5198/api/reports/1/widgets
  ```
  Expected: `200 OK`, the same two widgets with the same field values.

- [ ] Step 9: Confirm delete-then-insert replaces the whole set — save again with just one widget, then re-read:
  ```
  curl.exe -X PUT http://localhost:5198/api/reports/1/widgets -H "Content-Type: application/json" -d "{\"widgets\":[{\"type\":\"Text\",\"x\":0,\"y\":0,\"w\":4,\"h\":2,\"title\":\"Only widget now\",\"content\":\"replaced\",\"binding\":null}]}"
  curl.exe http://localhost:5198/api/reports/1/widgets
  ```
  Expected: the second call returns exactly one widget titled "Only widget now" — the earlier Kpi/Text pair is gone, confirmed also at the DB level:
  ```
  sqlcmd -S "localhost\SQLEXPRESS" -E -d OpenReportingPlatform -Q "SELECT COUNT(*) FROM Widgets; SELECT COUNT(*) FROM WidgetBindings"
  ```
  Expected: `Widgets` count `1`, `WidgetBindings` count `0`.

- [ ] Step 10: Confirm a Text widget submitted WITH a binding is rejected (proves the validation-gate half of the Text-never-binds invariant against the real stack, not just InMemory):
  ```
  curl.exe -i -X PUT http://localhost:5198/api/reports/1/widgets -H "Content-Type: application/json" -d "{\"widgets\":[{\"type\":\"Text\",\"x\":0,\"y\":0,\"w\":4,\"h\":2,\"title\":\"Bad Text\",\"content\":\"x\",\"binding\":{\"datasetId\":{datasetId},\"categoryField\":null,\"valueFields\":[\"Id\"]}}]}"
  ```
  Expected: `400 Bad Request`, body contains `"Text widgets must not have a binding."`.

- [ ] Step 11: Stop the app (`Ctrl+C`, or kill the backgrounded PID) and confirm port 5198 is free:
  ```
  Get-Process -Name Backend -ErrorAction SilentlyContinue
  ```
  Expected: no process listed.

- [ ] Step 12: No commit for this task — verification only, no files changed.

---

### Task 7: Frontend — Vitest + React Testing Library test infrastructure

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.ts`
- Create: `frontend/src/setupTests.ts`
- Create: `frontend/src/sanityCheck.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm test` runs Vitest. Every later frontend TDD task (8, 10, 11, 12, 13, 14) depends on this working first — this is the first frontend test runner this project has ever had (Milestones 0-3 had none).

- [ ] Step 1: From `frontend/`, install the new dev dependencies (no version pins — let npm resolve current majors against the already-pinned React 19/Vite 8):
  ```
  npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
  ```

- [ ] Step 2: Add a `test` script to `frontend/package.json`'s `scripts` block, alongside the existing `dev`/`build`/`lint`/`preview`:
  ```json
  "test": "vitest run",
  ```

- [ ] Step 3: Modify `frontend/vite.config.ts` to add a Vitest `test` block — full file after the change:
  ```typescript
  /// <reference types="vitest/config" />
  import { defineConfig } from 'vite'
  import react from '@vitejs/plugin-react'

  // https://vite.dev/config/
  export default defineConfig({
    plugins: [react()],
    test: {
      environment: 'jsdom',
      setupFiles: './src/setupTests.ts',
    },
  })
  ```

- [ ] Step 4: Create `frontend/src/setupTests.ts`:
  ```typescript
  import "@testing-library/jest-dom/vitest";
  ```

- [ ] Step 5: Write a sanity-check test proving the whole toolchain actually runs — `frontend/src/sanityCheck.test.ts`:
  ```typescript
  import { describe, expect, it } from "vitest";

  describe("vitest sanity check", () => {
    it("runs a basic assertion", () => {
      expect(1 + 1).toBe(2);
    });
  });
  ```

- [ ] Step 6: Run it:
  ```
  npm test
  ```
  Expected: `1 passed`. This is the first green Vitest run in this project's history — confirm it before building anything real on top of it.

- [ ] Step 7: Confirm the production build still compiles cleanly with the new test file present under `src/` (it's type-checked by `tsc -b` per `tsconfig.app.json`'s `"include": ["src"]`, though never bundled into the shipped app):
  ```
  npm run build
  ```
  Expected: clean compile.

- [ ] Step 8: Commit:
  ```
  git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/src/setupTests.ts frontend/src/sanityCheck.test.ts
  git commit -m "frontend: add Vitest + React Testing Library test infrastructure"
  ```

---

### Task 8: Frontend — field-shape classification utility (TDD)

**Files:**
- Create: `frontend/src/widgets/fieldClassification.ts`
- Create: `frontend/src/widgets/fieldClassification.test.ts`

**Interfaces:**
- Consumes: nothing (pure function over a `string`).
- Produces: `classify(nativeType: string) -> FieldKind` where `FieldKind = "Categorical" | "Numeric" | "Temporal" | "Unsupported"`. Task 14's `WidgetBindingEditor` depends on this to group/sort the field picker.

- [ ] Step 1: Write the failing tests — `frontend/src/widgets/fieldClassification.test.ts`:
  ```typescript
  import { describe, expect, it } from "vitest";
  import { classify } from "./fieldClassification";

  describe("classify", () => {
    it.each([
      ["int", "Numeric"],
      ["bigint", "Numeric"],
      ["decimal(18,2)", "Numeric"],
      ["numeric(10,0)", "Numeric"],
      ["float", "Numeric"],
      ["money", "Numeric"],
      ["number", "Numeric"],
      ["date", "Temporal"],
      ["datetime2", "Temporal"],
      ["datetimeoffset", "Temporal"],
      ["nvarchar(50)", "Categorical"],
      ["varchar(max)", "Categorical"],
      ["uniqueidentifier", "Categorical"],
      ["bit", "Categorical"],
      ["string", "Categorical"],
      ["boolean", "Categorical"],
      ["varbinary(max)", "Unsupported"],
      ["xml", "Unsupported"],
      ["object", "Unsupported"],
      ["array", "Unsupported"],
      ["null", "Unsupported"],
      ["unknown", "Unsupported"],
      ["", "Unsupported"],
    ])("classifies %s as %s", (nativeType, expected) => {
      expect(classify(nativeType)).toBe(expected);
    });
  });
  ```

- [ ] Step 2: Run the tests to confirm they fail (module doesn't exist yet):
  ```
  npm test
  ```
  Expected: failure — cannot resolve `./fieldClassification`.

- [ ] Step 3: Create `frontend/src/widgets/fieldClassification.ts`:
  ```typescript
  export type FieldKind = "Categorical" | "Numeric" | "Temporal" | "Unsupported";

  const NUMERIC_PREFIXES = new Set([
    "int", "bigint", "smallint", "tinyint", "decimal", "numeric", "float", "real", "money", "smallmoney", "number",
  ]);

  const TEMPORAL_PREFIXES = new Set([
    "date", "datetime", "datetime2", "smalldatetime", "time", "datetimeoffset",
  ]);

  const CATEGORICAL_PREFIXES = new Set([
    "nvarchar", "varchar", "nchar", "char", "text", "ntext", "uniqueidentifier", "bit", "string", "boolean",
  ]);

  export function classify(nativeType: string): FieldKind {
    if (!nativeType || nativeType.trim() === "") {
      return "Unsupported";
    }

    const prefix = nativeType.split("(")[0].trim().toLowerCase();

    if (NUMERIC_PREFIXES.has(prefix)) {
      return "Numeric";
    }

    if (TEMPORAL_PREFIXES.has(prefix)) {
      return "Temporal";
    }

    if (CATEGORICAL_PREFIXES.has(prefix)) {
      return "Categorical";
    }

    return "Unsupported";
  }
  ```

- [ ] Step 4: Run the tests again to confirm they pass:
  ```
  npm test
  ```
  Expected: all pass.

- [ ] Step 5: Commit:
  ```
  git add frontend/src/widgets/fieldClassification.ts frontend/src/widgets/fieldClassification.test.ts
  git commit -m "frontend: field-shape classification utility (TDD), matches backend's native type buckets"
  ```

---

### Task 9: Frontend — Widget API client

**Files:**
- Create: `frontend/src/api/widgets.ts`

**Interfaces:**
- Consumes: `GET /api/reports/{reportId}/widgets`, `PUT /api/reports/{reportId}/widgets` (Task 4).
- Produces: `WidgetType`, `WidgetSummary`, `WidgetBindingSummary`, `SaveWidgetRequest`, `SaveWidgetBindingRequest`, `getWidgets`, `saveWidgets`. Every remaining frontend task depends on these types/functions. No test file — matching this project's existing precedent that thin `api/*.ts` axios wrappers (`reports.ts`, `datasets.ts`, `datasources.ts`) have never had dedicated tests.

- [ ] Step 1: Create `frontend/src/api/widgets.ts`:
  ```typescript
  import axios from "axios";

  export type WidgetType = "Table" | "Bar" | "Line" | "Pie" | "Kpi" | "Text";

  export interface WidgetBindingSummary {
    datasetId: number;
    categoryField: string | null;
    valueFields: string[];
  }

  export interface WidgetSummary {
    id: number;
    type: WidgetType;
    x: number;
    y: number;
    w: number;
    h: number;
    title: string;
    content: string | null;
    binding: WidgetBindingSummary | null;
  }

  export interface SaveWidgetBindingRequest {
    datasetId: number;
    categoryField: string | null;
    valueFields: string[];
  }

  export interface SaveWidgetRequest {
    type: WidgetType;
    x: number;
    y: number;
    w: number;
    h: number;
    title: string;
    content: string | null;
    binding: SaveWidgetBindingRequest | null;
  }

  const api = axios.create({ baseURL: "http://localhost:5198/api" });

  export async function getWidgets(reportId: number): Promise<WidgetSummary[]> {
    const res = await api.get<WidgetSummary[]>(`/reports/${reportId}/widgets`);
    return res.data;
  }

  export async function saveWidgets(reportId: number, widgets: SaveWidgetRequest[]): Promise<WidgetSummary[]> {
    const res = await api.put<WidgetSummary[]>(`/reports/${reportId}/widgets`, { widgets });
    return res.data;
  }
  ```

- [ ] Step 2: Confirm the build still compiles:
  ```
  npm run build
  ```
  Expected: clean compile.

- [ ] Step 3: Commit:
  ```
  git add frontend/src/api/widgets.ts
  git commit -m "frontend: Widget API client"
  ```

---

### Task 10: Frontend — pure shaping functions per widget type (TDD)

**Files:**
- Create: `frontend/src/widgets/shaping.ts`
- Create: `frontend/src/widgets/shaping.test.ts`

**Interfaces:**
- Consumes: `QueryResult`/`ColumnDescriptor` from `frontend/src/api/datasets.ts` (Milestone 3, unchanged).
- Produces: `shapeTableRows`, `shapeBarOption`, `shapeLineOption`, `shapePieOption`, `shapeKpiValue`. Task 12's widget components depend on these exact signatures.

- [ ] Step 1: Write the failing tests — `frontend/src/widgets/shaping.test.ts`:
  ```typescript
  import { describe, expect, it } from "vitest";
  import type { QueryResult } from "../api/datasets";
  import { shapeBarOption, shapeKpiValue, shapePieOption, shapeTableRows } from "./shaping";

  const result: QueryResult = {
    columns: [
      { name: "Month", nativeType: "nvarchar(20)" },
      { name: "Revenue", nativeType: "decimal(18,2)" },
      { name: "Cost", nativeType: "decimal(18,2)" },
    ],
    rows: [
      ["Jan", 100, 40],
      ["Feb", 150, 60],
    ],
  };

  describe("shapeTableRows", () => {
    it("returns every column when valueFields is empty", () => {
      const shaped = shapeTableRows(result, []);

      expect(shaped.columns).toEqual(["Month", "Revenue", "Cost"]);
      expect(shaped.rows).toEqual(result.rows);
    });

    it("restricts to the requested subset, preserving requested order", () => {
      const shaped = shapeTableRows(result, ["Revenue", "Month"]);

      expect(shaped.columns).toEqual(["Revenue", "Month"]);
      expect(shaped.rows).toEqual([
        [100, "Jan"],
        [150, "Feb"],
      ]);
    });
  });

  describe("shapeBarOption", () => {
    it("builds one series per value field sharing the category axis", () => {
      const option = shapeBarOption(result, "Month", ["Revenue", "Cost"]);

      expect(option.xAxis).toMatchObject({ type: "category", data: ["Jan", "Feb"] });
      expect(option.series).toHaveLength(2);
      expect(option.series![0]).toMatchObject({ name: "Revenue", type: "bar", data: [100, 150] });
      expect(option.series![1]).toMatchObject({ name: "Cost", type: "bar", data: [40, 60] });
    });
  });

  describe("shapePieOption", () => {
    it("builds one slice per category row", () => {
      const option = shapePieOption(result, "Month", "Revenue");

      const series = option.series as Array<{ data: Array<{ name: string; value: number }> }>;
      expect(series[0].data).toEqual([
        { name: "Jan", value: 100 },
        { name: "Feb", value: 150 },
      ]);
    });
  });

  describe("shapeKpiValue", () => {
    it("returns the first row's value for the given field", () => {
      expect(shapeKpiValue(result, "Revenue")).toBe(100);
    });

    it("returns null when there are no rows", () => {
      const empty: QueryResult = { columns: result.columns, rows: [] };
      expect(shapeKpiValue(empty, "Revenue")).toBeNull();
    });
  });
  ```

- [ ] Step 2: Run the tests to confirm they fail (module doesn't exist yet):
  ```
  npm test
  ```
  Expected: failure — cannot resolve `./shaping`.

- [ ] Step 3: Create `frontend/src/widgets/shaping.ts`:
  ```typescript
  import type { EChartsOption } from "echarts";
  import type { QueryResult } from "../api/datasets";

  export interface ShapedTableRows {
    columns: string[];
    rows: unknown[][];
  }

  function columnIndex(result: QueryResult, name: string): number {
    return result.columns.findIndex((c) => c.name === name);
  }

  export function shapeTableRows(result: QueryResult, valueFields: string[]): ShapedTableRows {
    const columns = valueFields.length > 0 ? valueFields : result.columns.map((c) => c.name);
    const indexes = columns.map((name) => columnIndex(result, name));

    const rows = result.rows.map((row) => indexes.map((i) => (i === -1 ? null : row[i])));

    return { columns, rows };
  }

  function buildCategorySeriesOption(
    result: QueryResult,
    categoryField: string,
    valueFields: string[],
    seriesType: "bar" | "line",
  ): EChartsOption {
    const categoryIndex = columnIndex(result, categoryField);
    const categories = result.rows.map((row) => String(row[categoryIndex]));

    const series = valueFields.map((field) => {
      const valueIndex = columnIndex(result, field);
      return {
        name: field,
        type: seriesType,
        data: result.rows.map((row) => Number(row[valueIndex])),
      };
    });

    return {
      xAxis: { type: "category", data: categories },
      yAxis: { type: "value" },
      series,
    };
  }

  export function shapeBarOption(result: QueryResult, categoryField: string, valueFields: string[]): EChartsOption {
    return buildCategorySeriesOption(result, categoryField, valueFields, "bar");
  }

  export function shapeLineOption(result: QueryResult, categoryField: string, valueFields: string[]): EChartsOption {
    return buildCategorySeriesOption(result, categoryField, valueFields, "line");
  }

  export function shapePieOption(result: QueryResult, categoryField: string, valueField: string): EChartsOption {
    const categoryIndex = columnIndex(result, categoryField);
    const valueIndex = columnIndex(result, valueField);

    return {
      series: [
        {
          type: "pie",
          data: result.rows.map((row) => ({ name: String(row[categoryIndex]), value: Number(row[valueIndex]) })),
        },
      ],
    };
  }

  export function shapeKpiValue(result: QueryResult, valueField: string): number | null {
    if (result.rows.length === 0) {
      return null;
    }

    const valueIndex = columnIndex(result, valueField);
    const value = result.rows[0][valueIndex];
    return typeof value === "number" ? value : Number(value);
  }
  ```

- [ ] Step 4: Install `echarts` (needed for the `EChartsOption` type this file imports; the runtime library itself is consumed starting Task 12):
  ```
  npm install echarts
  ```

- [ ] Step 5: Run the tests again to confirm they pass:
  ```
  npm test
  ```
  Expected: all pass.

- [ ] Step 6: Commit:
  ```
  git add frontend/src/widgets/shaping.ts frontend/src/widgets/shaping.test.ts frontend/package.json frontend/package-lock.json
  git commit -m "frontend: pure shaping functions per widget type (TDD), add echarts dependency"
  ```

---

### Task 11: Frontend — `useDatasetExecute`, `useECharts` hooks + stale-binding detection (TDD)

**Files:**
- Create: `frontend/src/widgets/useDatasetExecute.ts`
- Create: `frontend/src/widgets/useDatasetExecute.test.ts`
- Create: `frontend/src/widgets/useECharts.ts`
- Create: `frontend/src/widgets/useECharts.test.ts`
- Create: `frontend/src/widgets/staleBindingCheck.ts`
- Create: `frontend/src/widgets/staleBindingCheck.test.ts`

**Interfaces:**
- Consumes: `executeDataset`/`QueryResult` from `frontend/src/api/datasets.ts` (Milestone 3, unchanged), `echarts` (Task 10).
- Produces: `useDatasetExecute(datasetId: number | null) -> { data, loading, error }`, `useECharts(containerRef, option)`, `findMissingFields(columns, categoryField, valueFields) -> string[]`. Task 12's widget components depend on all three.

**Refinement over the design doc, discovered while writing this task:** the design doc says the live-preview hook "re-fires whenever the binding changes." Reading Milestone 3's actual `Dataset.Definition`/`ExecuteAsync` shows a Dataset's query is fixed at Dataset-definition time — `CategoryField`/`ValueFields` are purely client-side rendering choices over the same `QueryResult`, not query parameters. So `useDatasetExecute` only needs to re-fetch when `datasetId` itself changes; changing which fields are selected just re-runs the (already-imported) shaping function against already-fetched data, no network call. This is strictly fewer network calls than the design doc implied, with identical user-visible behavior.

- [ ] Step 1: Write the failing test for `useDatasetExecute` — `frontend/src/widgets/useDatasetExecute.test.ts`:
  ```typescript
  import { renderHook, waitFor } from "@testing-library/react";
  import { describe, expect, it, vi } from "vitest";
  import * as datasetsApi from "../api/datasets";
  import { useDatasetExecute } from "./useDatasetExecute";

  describe("useDatasetExecute", () => {
    it("returns null data and no fetch when datasetId is null", () => {
      const { result } = renderHook(() => useDatasetExecute(null));

      expect(result.current.data).toBeNull();
      expect(result.current.loading).toBe(false);
    });

    it("fetches and returns the result for a given datasetId", async () => {
      const fakeResult = { columns: [{ name: "Id", nativeType: "int" }], rows: [[1]] };
      vi.spyOn(datasetsApi, "executeDataset").mockResolvedValue(fakeResult);

      const { result } = renderHook(() => useDatasetExecute(1));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.data).toEqual(fakeResult);
      expect(result.current.error).toBeNull();
    });

    it("surfaces a friendly error when the fetch fails", async () => {
      vi.spyOn(datasetsApi, "executeDataset").mockRejectedValue(new Error("network down"));

      const { result } = renderHook(() => useDatasetExecute(1));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.data).toBeNull();
      expect(result.current.error).not.toBeNull();
    });
  });
  ```

- [ ] Step 2: Run the tests to confirm they fail:
  ```
  npm test
  ```
  Expected: failure — cannot resolve `./useDatasetExecute`.

- [ ] Step 3: Create `frontend/src/widgets/useDatasetExecute.ts`:
  ```typescript
  import { useEffect, useState } from "react";
  import { executeDataset, type QueryResult } from "../api/datasets";

  export interface UseDatasetExecuteResult {
    data: QueryResult | null;
    loading: boolean;
    error: string | null;
  }

  export function useDatasetExecute(datasetId: number | null): UseDatasetExecuteResult {
    const [data, setData] = useState<QueryResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      if (datasetId === null) {
        setData(null);
        setError(null);
        return;
      }

      let cancelled = false;
      setLoading(true);
      setError(null);

      executeDataset(datasetId)
        .then((result) => {
          if (!cancelled) {
            setData(result);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError("Could not load data for this widget's Dataset.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }, [datasetId]);

    return { data, loading, error };
  }
  ```

- [ ] Step 4: Run the tests again to confirm they pass:
  ```
  npm test
  ```

- [ ] Step 5: Write the failing test for `useECharts` — `frontend/src/widgets/useECharts.test.ts` (tests only the mount/unmount integration seam, per the design doc — not ECharts' own rendering):
  ```typescript
  import { render } from "@testing-library/react";
  import { useRef } from "react";
  import { describe, expect, it, vi } from "vitest";
  import * as echarts from "echarts";
  import { useECharts } from "./useECharts";

  function TestComponent({ option }: { option: echarts.EChartsOption | null }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useECharts(ref, option);
    return <div ref={ref} />;
  }

  describe("useECharts", () => {
    it("initializes and disposes the chart with the container's lifecycle", () => {
      const disposeSpy = vi.fn();
      const setOptionSpy = vi.fn();
      vi.spyOn(echarts, "init").mockReturnValue({
        setOption: setOptionSpy,
        dispose: disposeSpy,
      } as unknown as echarts.ECharts);

      const { unmount } = render(<TestComponent option={{ series: [] }} />);

      expect(echarts.init).toHaveBeenCalledTimes(1);
      expect(setOptionSpy).toHaveBeenCalledWith({ series: [] });

      unmount();

      expect(disposeSpy).toHaveBeenCalledTimes(1);
    });
  });
  ```

- [ ] Step 6: Run the tests to confirm they fail:
  ```
  npm test
  ```
  Expected: failure — cannot resolve `./useECharts`.

- [ ] Step 7: Create `frontend/src/widgets/useECharts.ts`:
  ```typescript
  import { useEffect, useRef } from "react";
  import * as echarts from "echarts";
  import type { EChartsOption } from "echarts";

  export function useECharts(containerRef: React.RefObject<HTMLDivElement | null>, option: EChartsOption | null) {
    const chartRef = useRef<echarts.ECharts | null>(null);

    useEffect(() => {
      if (!containerRef.current) {
        return;
      }

      const chart = echarts.init(containerRef.current);
      chartRef.current = chart;

      return () => {
        chart.dispose();
        chartRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [containerRef]);

    useEffect(() => {
      if (chartRef.current && option) {
        chartRef.current.setOption(option);
      }
    }, [option]);
  }
  ```

- [ ] Step 8: Run the tests again to confirm they pass:
  ```
  npm test
  ```

- [ ] Step 9: Write the failing tests for stale-binding detection — `frontend/src/widgets/staleBindingCheck.test.ts`:
  ```typescript
  import { describe, expect, it } from "vitest";
  import { findMissingFields } from "./staleBindingCheck";

  const columns = [
    { name: "Month", nativeType: "nvarchar(20)" },
    { name: "Revenue", nativeType: "decimal(18,2)" },
  ];

  describe("findMissingFields", () => {
    it("returns an empty array when every field still exists", () => {
      expect(findMissingFields(columns, "Month", ["Revenue"])).toEqual([]);
    });

    it("reports a missing categoryField", () => {
      expect(findMissingFields(columns, "Region", ["Revenue"])).toEqual(["Region"]);
    });

    it("reports missing valueFields", () => {
      expect(findMissingFields(columns, "Month", ["Cost"])).toEqual(["Cost"]);
    });

    it("ignores a null categoryField", () => {
      expect(findMissingFields(columns, null, ["Revenue"])).toEqual([]);
    });
  });
  ```

- [ ] Step 10: Run the tests to confirm they fail:
  ```
  npm test
  ```
  Expected: failure — cannot resolve `./staleBindingCheck`.

- [ ] Step 11: Create `frontend/src/widgets/staleBindingCheck.ts`:
  ```typescript
  import type { ColumnDescriptor } from "../api/datasets";

  export function findMissingFields(
    columns: ColumnDescriptor[],
    categoryField: string | null,
    valueFields: string[],
  ): string[] {
    const columnNames = new Set(columns.map((c) => c.name));
    const missing: string[] = [];

    if (categoryField && !columnNames.has(categoryField)) {
      missing.push(categoryField);
    }

    for (const field of valueFields) {
      if (!columnNames.has(field)) {
        missing.push(field);
      }
    }

    return missing;
  }
  ```

- [ ] Step 12: Run the full test suite once more:
  ```
  npm test
  ```
  Expected: all pass.

- [ ] Step 13: Commit:
  ```
  git add frontend/src/widgets/useDatasetExecute.ts frontend/src/widgets/useDatasetExecute.test.ts frontend/src/widgets/useECharts.ts frontend/src/widgets/useECharts.test.ts frontend/src/widgets/staleBindingCheck.ts frontend/src/widgets/staleBindingCheck.test.ts
  git commit -m "frontend: useDatasetExecute + useECharts hooks, stale-binding detection (TDD)"
  ```

---

### Task 12: Frontend — six widget rendering components + `WidgetRenderer` dispatcher

**Files:**
- Create: `frontend/src/widgets/TableWidget.tsx`
- Create: `frontend/src/widgets/BarWidget.tsx`
- Create: `frontend/src/widgets/LineWidget.tsx`
- Create: `frontend/src/widgets/PieWidget.tsx`
- Create: `frontend/src/widgets/KpiWidget.tsx`
- Create: `frontend/src/widgets/TextWidget.tsx`
- Create: `frontend/src/widgets/WidgetRenderer.tsx`
- Create: `frontend/src/widgets/WidgetRenderer.test.tsx`

**Interfaces:**
- Consumes: `WidgetSummary` (Task 9), `shapeTableRows`/`shapeBarOption`/`shapeLineOption`/`shapePieOption`/`shapeKpiValue` (Task 10), `useDatasetExecute` (Task 11), `useECharts` (Task 11), `findMissingFields` (Task 11).
- Produces: `<WidgetRenderer widget={WidgetSummary} />` — the single component both `ReportCanvas` (Task 13-14) and `ReportView` (Task 15) render for every widget, exactly per the design doc's "no duplicated rendering logic between edit and view."

**Deliberate deviation from the vision doc, carried over from the design doc:** `KpiWidget` does not use ECharts — it's a styled number, not worth a charting library. `TableWidget` is a plain MUI table. `TextWidget` just renders `content`.

- [ ] Step 1: Create `frontend/src/widgets/TableWidget.tsx`:
  ```tsx
  import { Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
  import type { QueryResult } from "../api/datasets";
  import { shapeTableRows } from "./shaping";

  function TableWidget({ title, result, valueFields }: { title: string; result: QueryResult; valueFields: string[] }) {
    const { columns, rows } = shapeTableRows(result, valueFields);

    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2" gutterBottom>{title}</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>{columns.map((c) => <TableCell key={c}>{c}</TableCell>)}</TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  {row.map((value, j) => <TableCell key={j}>{value === null ? "" : String(value)}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    );
  }

  export default TableWidget;
  ```

- [ ] Step 2: Create `frontend/src/widgets/BarWidget.tsx`:
  ```tsx
  import { useRef } from "react";
  import { Paper, Typography } from "@mui/material";
  import type { QueryResult } from "../api/datasets";
  import { shapeBarOption } from "./shaping";
  import { useECharts } from "./useECharts";

  function BarWidget({
    title, result, categoryField, valueFields,
  }: { title: string; result: QueryResult; categoryField: string; valueFields: string[] }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    useECharts(containerRef, shapeBarOption(result, categoryField, valueFields));

    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2" gutterBottom>{title}</Typography>
        <div ref={containerRef} style={{ width: "100%", height: 220 }} />
      </Paper>
    );
  }

  export default BarWidget;
  ```

- [ ] Step 3: Create `frontend/src/widgets/LineWidget.tsx` (identical shape to `BarWidget`, different shaping function):
  ```tsx
  import { useRef } from "react";
  import { Paper, Typography } from "@mui/material";
  import type { QueryResult } from "../api/datasets";
  import { shapeLineOption } from "./shaping";
  import { useECharts } from "./useECharts";

  function LineWidget({
    title, result, categoryField, valueFields,
  }: { title: string; result: QueryResult; categoryField: string; valueFields: string[] }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    useECharts(containerRef, shapeLineOption(result, categoryField, valueFields));

    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2" gutterBottom>{title}</Typography>
        <div ref={containerRef} style={{ width: "100%", height: 220 }} />
      </Paper>
    );
  }

  export default LineWidget;
  ```

- [ ] Step 4: Create `frontend/src/widgets/PieWidget.tsx`:
  ```tsx
  import { useRef } from "react";
  import { Paper, Typography } from "@mui/material";
  import type { QueryResult } from "../api/datasets";
  import { shapePieOption } from "./shaping";
  import { useECharts } from "./useECharts";

  function PieWidget({
    title, result, categoryField, valueField,
  }: { title: string; result: QueryResult; categoryField: string; valueField: string }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    useECharts(containerRef, shapePieOption(result, categoryField, valueField));

    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2" gutterBottom>{title}</Typography>
        <div ref={containerRef} style={{ width: "100%", height: 220 }} />
      </Paper>
    );
  }

  export default PieWidget;
  ```

- [ ] Step 5: Create `frontend/src/widgets/KpiWidget.tsx`:
  ```tsx
  import { Paper, Typography } from "@mui/material";
  import type { QueryResult } from "../api/datasets";
  import { shapeKpiValue } from "./shaping";

  function KpiWidget({ title, result, valueField }: { title: string; result: QueryResult; valueField: string }) {
    const value = shapeKpiValue(result, valueField);

    return (
      <Paper sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Typography variant="h3">{value ?? "—"}</Typography>
      </Paper>
    );
  }

  export default KpiWidget;
  ```

- [ ] Step 6: Create `frontend/src/widgets/TextWidget.tsx`:
  ```tsx
  import { Paper, Typography } from "@mui/material";

  function TextWidget({ title, content }: { title: string; content: string | null }) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2" gutterBottom>{title}</Typography>
        <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{content}</Typography>
      </Paper>
    );
  }

  export default TextWidget;
  ```

- [ ] Step 7: Create `frontend/src/widgets/WidgetRenderer.tsx`:
  ```tsx
  import { Alert, Paper, Typography } from "@mui/material";
  import type { WidgetSummary } from "../api/widgets";
  import { useDatasetExecute } from "./useDatasetExecute";
  import { findMissingFields } from "./staleBindingCheck";
  import TableWidget from "./TableWidget";
  import BarWidget from "./BarWidget";
  import LineWidget from "./LineWidget";
  import PieWidget from "./PieWidget";
  import KpiWidget from "./KpiWidget";
  import TextWidget from "./TextWidget";

  function WidgetRenderer({ widget }: { widget: WidgetSummary }) {
    const datasetId = widget.binding?.datasetId ?? null;
    const { data, loading, error } = useDatasetExecute(datasetId);

    if (widget.type === "Text") {
      return <TextWidget title={widget.title} content={widget.content} />;
    }

    if (!widget.binding) {
      return (
        <Paper sx={{ p: 2, height: "100%" }}>
          <Typography variant="subtitle2">{widget.title}</Typography>
          <Alert severity="info" sx={{ mt: 1 }}>Not bound to a Dataset yet.</Alert>
        </Paper>
      );
    }

    if (loading) {
      return (
        <Paper sx={{ p: 2, height: "100%" }}>
          <Typography variant="subtitle2">{widget.title}</Typography>
          <Typography variant="body2">Loading…</Typography>
        </Paper>
      );
    }

    if (error || !data) {
      return (
        <Paper sx={{ p: 2, height: "100%" }}>
          <Typography variant="subtitle2">{widget.title}</Typography>
          <Alert severity="error" sx={{ mt: 1 }}>{error ?? "No data."}</Alert>
        </Paper>
      );
    }

    const missingFields = findMissingFields(data.columns, widget.binding.categoryField, widget.binding.valueFields);
    if (missingFields.length > 0) {
      return (
        <Paper sx={{ p: 2, height: "100%" }}>
          <Typography variant="subtitle2">{widget.title}</Typography>
          <Alert severity="warning" sx={{ mt: 1 }}>
            Field {missingFields.join(", ")} no longer exists in this Dataset — edit the binding to fix.
          </Alert>
        </Paper>
      );
    }

    switch (widget.type) {
      case "Table":
        return <TableWidget title={widget.title} result={data} valueFields={widget.binding.valueFields} />;
      case "Bar":
        return <BarWidget title={widget.title} result={data} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} />;
      case "Line":
        return <LineWidget title={widget.title} result={data} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} />;
      case "Pie":
        return <PieWidget title={widget.title} result={data} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} />;
      case "Kpi":
        return <KpiWidget title={widget.title} result={data} valueField={widget.binding.valueFields[0]} />;
      default:
        return null;
    }
  }

  export default WidgetRenderer;
  ```

- [ ] Step 8: Write the tests — `frontend/src/widgets/WidgetRenderer.test.tsx` (mocks `useDatasetExecute`, the seam this component actually owns; doesn't try to assert on ECharts/gridstack internals):
  ```tsx
  import { render, screen } from "@testing-library/react";
  import { describe, expect, it, vi } from "vitest";
  import type { WidgetSummary } from "../api/widgets";
  import WidgetRenderer from "./WidgetRenderer";
  import * as useDatasetExecuteModule from "./useDatasetExecute";

  function makeWidget(overrides: Partial<WidgetSummary>): WidgetSummary {
    return {
      id: 1,
      type: "Text",
      x: 0,
      y: 0,
      w: 4,
      h: 2,
      title: "Widget",
      content: null,
      binding: null,
      ...overrides,
    };
  }

  describe("WidgetRenderer", () => {
    it("renders a Text widget without calling useDatasetExecute for real data", () => {
      vi.spyOn(useDatasetExecuteModule, "useDatasetExecute").mockReturnValue({ data: null, loading: false, error: null });

      render(<WidgetRenderer widget={makeWidget({ type: "Text", title: "A note", content: "hello" })} />);

      expect(screen.getByText("hello")).toBeInTheDocument();
    });

    it("shows an info state for a data-driven widget with no binding yet", () => {
      vi.spyOn(useDatasetExecuteModule, "useDatasetExecute").mockReturnValue({ data: null, loading: false, error: null });

      render(<WidgetRenderer widget={makeWidget({ type: "Kpi", binding: null })} />);

      expect(screen.getByText("Not bound to a Dataset yet.")).toBeInTheDocument();
    });

    it("shows the stale-binding warning when a bound field no longer exists", () => {
      vi.spyOn(useDatasetExecuteModule, "useDatasetExecute").mockReturnValue({
        data: { columns: [{ name: "Id", nativeType: "int" }], rows: [[1]] },
        loading: false,
        error: null,
      });

      render(
        <WidgetRenderer
          widget={makeWidget({ type: "Kpi", binding: { datasetId: 1, categoryField: null, valueFields: ["Revenue"] } })}
        />,
      );

      expect(screen.getByText(/no longer exists in this Dataset/)).toBeInTheDocument();
    });

    it("renders a Kpi value when the binding is valid", () => {
      vi.spyOn(useDatasetExecuteModule, "useDatasetExecute").mockReturnValue({
        data: { columns: [{ name: "Revenue", nativeType: "decimal(18,2)" }], rows: [[500]] },
        loading: false,
        error: null,
      });

      render(
        <WidgetRenderer
          widget={makeWidget({ type: "Kpi", title: "Total Revenue", binding: { datasetId: 1, categoryField: null, valueFields: ["Revenue"] } })}
        />,
      );

      expect(screen.getByText("500")).toBeInTheDocument();
    });
  });
  ```

- [ ] Step 9: Run the tests:
  ```
  npm test
  ```
  Expected: all pass.

- [ ] Step 10: Confirm the full build still compiles:
  ```
  npm run build
  ```

- [ ] Step 11: Commit:
  ```
  git add frontend/src/widgets/TableWidget.tsx frontend/src/widgets/BarWidget.tsx frontend/src/widgets/LineWidget.tsx frontend/src/widgets/PieWidget.tsx frontend/src/widgets/KpiWidget.tsx frontend/src/widgets/TextWidget.tsx frontend/src/widgets/WidgetRenderer.tsx frontend/src/widgets/WidgetRenderer.test.tsx
  git commit -m "frontend: six widget rendering components + WidgetRenderer dispatcher (shared by canvas and view)"
  ```

---

### Task 13: Frontend — widget-draft reducer (TDD) + `ReportCanvas` gridstack integration

**Files:**
- Create: `frontend/src/widgets/widgetDraftReducer.ts`
- Create: `frontend/src/widgets/widgetDraftReducer.test.ts`
- Create: `frontend/src/pages/ReportCanvas.tsx`

**Interfaces:**
- Consumes: `WidgetSummary`/`WidgetType`/`getWidgets` (Task 9), `WidgetRenderer` (Task 12).
- Produces: `widgetDraftReducer`, `WidgetDraft`/`WidgetBindingDraft`/`WidgetDraftAction` types, `<ReportCanvas />` mounted at `/reports/{id}/edit` (route wiring is Task 15). Task 14 modifies this same file to add the binding editor, a title/content editor, and the Save button.

- [ ] Step 1: Write the failing tests for the reducer — `frontend/src/widgets/widgetDraftReducer.test.ts`:
  ```typescript
  import { describe, expect, it } from "vitest";
  import { widgetDraftReducer, type WidgetDraft } from "./widgetDraftReducer";

  const baseWidget: WidgetDraft = {
    id: 1, type: "Text", x: 0, y: 0, w: 4, h: 2, title: "A", content: "hi", binding: null,
  };

  describe("widgetDraftReducer", () => {
    it("loaded replaces the whole state", () => {
      const result = widgetDraftReducer([], { type: "loaded", widgets: [baseWidget] });
      expect(result).toEqual([baseWidget]);
    });

    it("added appends a widget", () => {
      const newWidget: WidgetDraft = { ...baseWidget, id: -1, title: "B" };
      const result = widgetDraftReducer([baseWidget], { type: "added", widget: newWidget });
      expect(result).toEqual([baseWidget, newWidget]);
    });

    it("removed filters out the widget by id", () => {
      const other: WidgetDraft = { ...baseWidget, id: 2 };
      const result = widgetDraftReducer([baseWidget, other], { type: "removed", id: 1 });
      expect(result).toEqual([other]);
    });

    it("positionsChanged updates only matching widgets' x/y/w/h", () => {
      const other: WidgetDraft = { ...baseWidget, id: 2, x: 0, y: 0, w: 4, h: 2 };
      const result = widgetDraftReducer(
        [baseWidget, other],
        { type: "positionsChanged", changes: [{ id: 2, x: 4, y: 1, w: 6, h: 3 }] },
      );
      expect(result[0]).toEqual(baseWidget);
      expect(result[1]).toMatchObject({ id: 2, x: 4, y: 1, w: 6, h: 3 });
    });

    it("titleChanged updates only the matching widget's title", () => {
      const result = widgetDraftReducer([baseWidget], { type: "titleChanged", id: 1, title: "New title" });
      expect(result[0].title).toBe("New title");
    });

    it("contentChanged updates only the matching widget's content", () => {
      const result = widgetDraftReducer([baseWidget], { type: "contentChanged", id: 1, content: "New content" });
      expect(result[0].content).toBe("New content");
    });

    it("bindingChanged updates only the matching widget's binding", () => {
      const binding = { datasetId: 1, categoryField: "Month", valueFields: ["Revenue"] };
      const result = widgetDraftReducer([baseWidget], { type: "bindingChanged", id: 1, binding });
      expect(result[0].binding).toEqual(binding);
    });
  });
  ```

- [ ] Step 2: Run the tests to confirm they fail:
  ```
  npm test
  ```
  Expected: failure — cannot resolve `./widgetDraftReducer`.

- [ ] Step 3: Create `frontend/src/widgets/widgetDraftReducer.ts`:
  ```typescript
  import type { WidgetType } from "../api/widgets";

  export interface WidgetBindingDraft {
    datasetId: number;
    categoryField: string | null;
    valueFields: string[];
  }

  export interface WidgetDraft {
    id: number; // negative for widgets added this editing session and not yet saved
    type: WidgetType;
    x: number;
    y: number;
    w: number;
    h: number;
    title: string;
    content: string | null;
    binding: WidgetBindingDraft | null;
  }

  export type WidgetDraftAction =
    | { type: "loaded"; widgets: WidgetDraft[] }
    | { type: "added"; widget: WidgetDraft }
    | { type: "removed"; id: number }
    | { type: "positionsChanged"; changes: Array<{ id: number; x: number; y: number; w: number; h: number }> }
    | { type: "titleChanged"; id: number; title: string }
    | { type: "contentChanged"; id: number; content: string }
    | { type: "bindingChanged"; id: number; binding: WidgetBindingDraft | null };

  export function widgetDraftReducer(state: WidgetDraft[], action: WidgetDraftAction): WidgetDraft[] {
    switch (action.type) {
      case "loaded":
        return action.widgets;
      case "added":
        return [...state, action.widget];
      case "removed":
        return state.filter((widget) => widget.id !== action.id);
      case "positionsChanged":
        return state.map((widget) => {
          const change = action.changes.find((c) => c.id === widget.id);
          return change ? { ...widget, x: change.x, y: change.y, w: change.w, h: change.h } : widget;
        });
      case "titleChanged":
        return state.map((widget) => (widget.id === action.id ? { ...widget, title: action.title } : widget));
      case "contentChanged":
        return state.map((widget) => (widget.id === action.id ? { ...widget, content: action.content } : widget));
      case "bindingChanged":
        return state.map((widget) => (widget.id === action.id ? { ...widget, binding: action.binding } : widget));
      default:
        return state;
    }
  }
  ```

- [ ] Step 4: Run the tests again to confirm they pass:
  ```
  npm test
  ```

- [ ] Step 5: Install `gridstack`:
  ```
  npm install gridstack
  ```

- [ ] Step 6: Create `frontend/src/pages/ReportCanvas.tsx` (binding editor, title/content editing, and Save wiring come in Task 14 — this version mounts the grid, loads widgets, and supports add/remove/drag/resize):
  ```tsx
  import { useEffect, useReducer, useRef, useState } from "react";
  import { useParams } from "react-router-dom";
  import { Alert, Box, Button, Container, MenuItem, TextField, Typography } from "@mui/material";
  import { GridStack } from "gridstack";
  import "gridstack/dist/gridstack.min.css";
  import { getWidgets, type WidgetType } from "../api/widgets";
  import { widgetDraftReducer, type WidgetDraft } from "../widgets/widgetDraftReducer";
  import WidgetRenderer from "../widgets/WidgetRenderer";

  let tempIdCounter = -1;

  const WIDGET_TYPES: WidgetType[] = ["Table", "Bar", "Line", "Pie", "Kpi", "Text"];

  function ReportCanvas() {
    const { id } = useParams<{ id: string }>();
    const reportId = Number(id);

    const [widgets, dispatch] = useReducer(widgetDraftReducer, [] as WidgetDraft[]);
    const [error, setError] = useState<string | null>(null);
    const gridRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      getWidgets(reportId)
        .then((summaries) =>
          dispatch({
            type: "loaded",
            widgets: summaries.map((s) => ({
              id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h, title: s.title, content: s.content, binding: s.binding,
            })),
          }),
        )
        .catch(() => setError("Could not load this report's widgets."));
    }, [reportId]);

    const widgetIds = widgets.map((w) => w.id).join(",");

    useEffect(() => {
      if (!gridRef.current) {
        return;
      }

      const grid = GridStack.init({ column: 12, cellHeight: 80 }, gridRef.current);

      grid.on("change", (_event, items) => {
        const changes = (items ?? []).map((item) => ({
          id: Number(item.id),
          x: item.x ?? 0,
          y: item.y ?? 0,
          w: item.w ?? 1,
          h: item.h ?? 1,
        }));
        dispatch({ type: "positionsChanged", changes });
      });

      return () => {
        grid.destroy(false);
      };
    }, [widgetIds]);

    function addWidget(type: WidgetType) {
      dispatch({
        type: "added",
        widget: {
          id: tempIdCounter--,
          type,
          x: 0,
          y: 0,
          w: 4,
          h: 3,
          title: `New ${type} widget`,
          content: type === "Text" ? "" : null,
          binding: null,
        },
      });
    }

    function removeWidget(widgetId: number) {
      dispatch({ type: "removed", id: widgetId });
    }

    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>Edit Report</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: "flex", gap: 2, mb: 3 }}>
          <TextField
            select
            label="Add widget"
            size="small"
            value=""
            onChange={(e) => addWidget(e.target.value as WidgetType)}
            sx={{ minWidth: 160 }}
          >
            {WIDGET_TYPES.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
        </Box>
        <div className="grid-stack" ref={gridRef}>
          {widgets.map((w) => (
            <div
              key={w.id}
              className="grid-stack-item"
              {...({ "gs-id": String(w.id), "gs-x": w.x, "gs-y": w.y, "gs-w": w.w, "gs-h": w.h } as Record<string, unknown>)}
            >
              <div className="grid-stack-item-content">
                <Button size="small" onClick={() => removeWidget(w.id)}>Remove</Button>
                <WidgetRenderer widget={w} />
              </div>
            </div>
          ))}
        </div>
      </Container>
    );
  }

  export default ReportCanvas;
  ```

- [ ] Step 7: Confirm the build compiles:
  ```
  npm run build
  ```

- [ ] Step 8: Commit:
  ```
  git add frontend/src/widgets/widgetDraftReducer.ts frontend/src/widgets/widgetDraftReducer.test.ts frontend/src/pages/ReportCanvas.tsx frontend/package.json frontend/package-lock.json
  git commit -m "frontend: widget-draft reducer (TDD), ReportCanvas gridstack mount + add/remove/drag/resize"
  ```

---

### Task 14: Frontend — title/content editing, `WidgetBindingEditor` (Dataset + field pickers), Save wiring

**Files:**
- Create: `frontend/src/widgets/WidgetBindingEditor.tsx`
- Create: `frontend/src/widgets/WidgetBindingEditor.test.tsx`
- Modify: `frontend/src/pages/ReportCanvas.tsx`

**Interfaces:**
- Consumes: `getDataSources` (Milestone 2), `getDatasets`/`discoverDatasetColumns`/`DatasetSummary`/`ColumnDescriptor` (Milestone 3), `classify` (Task 8), `WidgetDraft`/`WidgetBindingDraft` (Task 13), `saveWidgets` (Task 9).
- Produces: `<WidgetBindingEditor widget={WidgetDraft} onChange={...} />`, a Title text field (every widget type) and a Content textarea (Text widgets only) wired into `ReportCanvas`, and a Save button that calls `PUT /api/reports/{id}/widgets`.

**Every widget needs an editable Title, and Text widgets need editable Content — this is a real gap the design/plan left implicit until this task.** The reducer already defines `titleChanged`/`contentChanged` actions (Task 13), but nothing in `ReportCanvas` dispatches them yet. Without wiring an actual input control to these actions, a Text widget could never have its text typed in at all — one of the six required widget types would be unusable. This task closes that gap alongside the binding editor and Save button, since all three are the same kind of "per-widget editing control" addition to the same grid item.

- [ ] Step 1: Write the failing tests for `WidgetBindingEditor` — `frontend/src/widgets/WidgetBindingEditor.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import { describe, expect, it, vi } from "vitest";
  import * as datasourcesApi from "../api/datasources";
  import * as datasetsApi from "../api/datasets";
  import WidgetBindingEditor from "./WidgetBindingEditor";
  import type { WidgetDraft } from "./widgetDraftReducer";

  function makeWidget(overrides: Partial<WidgetDraft>): WidgetDraft {
    return {
      id: 1, type: "Bar", x: 0, y: 0, w: 4, h: 3, title: "W", content: null, binding: null,
      ...overrides,
    };
  }

  describe("WidgetBindingEditor", () => {
    it("renders nothing for a Text widget", () => {
      const { container } = render(<WidgetBindingEditor widget={makeWidget({ type: "Text" })} onChange={vi.fn()} />);
      expect(container).toBeEmptyDOMElement();
    });

    it("shows a Dataset picker populated from every connection's datasets", async () => {
      vi.spyOn(datasourcesApi, "getDataSources").mockResolvedValue([
        { id: 1, name: "Prod DB", type: "SqlServer", host: "h", databaseName: null, createdAtUtc: "" },
      ]);
      vi.spyOn(datasetsApi, "getDatasets").mockResolvedValue([
        { id: 5, dataSourceConnectionId: 1, name: "Sales", description: null, mode: "TableQuery", rowLimit: null, columns: [], createdAtUtc: "", updatedAtUtc: "" },
      ]);

      render(<WidgetBindingEditor widget={makeWidget({})} onChange={vi.fn()} />);

      expect(await screen.findByText("Sales")).toBeInTheDocument();
    });
  });
  ```

- [ ] Step 2: Run the tests to confirm they fail:
  ```
  npm test
  ```
  Expected: failure — cannot resolve `./WidgetBindingEditor`.

- [ ] Step 3: Create `frontend/src/widgets/WidgetBindingEditor.tsx`:
  ```tsx
  import { useEffect, useState } from "react";
  import { Box, MenuItem, TextField } from "@mui/material";
  import { getDataSources } from "../api/datasources";
  import { getDatasets, discoverDatasetColumns, type DatasetSummary, type ColumnDescriptor } from "../api/datasets";
  import { classify } from "./fieldClassification";
  import type { WidgetBindingDraft, WidgetDraft } from "./widgetDraftReducer";

  function WidgetBindingEditor({
    widget, onChange,
  }: { widget: WidgetDraft; onChange: (binding: WidgetBindingDraft | null) => void }) {
    const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
    const [columns, setColumns] = useState<ColumnDescriptor[]>([]);

    useEffect(() => {
      getDataSources().then(async (connections) => {
        const perConnection = await Promise.all(connections.map((c) => getDatasets(c.id)));
        setDatasets(perConnection.flat());
      });
    }, []);

    const datasetId = widget.binding?.datasetId ?? null;

    useEffect(() => {
      if (datasetId !== null) {
        discoverDatasetColumns(datasetId).then(setColumns).catch(() => setColumns([]));
      } else {
        setColumns([]);
      }
    }, [datasetId]);

    if (widget.type === "Text") {
      return null;
    }

    function handleDatasetChange(newDatasetId: number) {
      onChange({ datasetId: newDatasetId, categoryField: null, valueFields: [] });
    }

    function handleCategoryChange(categoryField: string) {
      if (widget.binding) {
        onChange({ ...widget.binding, categoryField: categoryField || null });
      }
    }

    function handleValueFieldsChange(valueFields: string[]) {
      if (widget.binding) {
        onChange({ ...widget.binding, valueFields });
      }
    }

    const numericFields = columns.filter((c) => classify(c.nativeType) === "Numeric").map((c) => c.name);
    const otherFields = columns.filter((c) => classify(c.nativeType) !== "Numeric").map((c) => c.name);
    const showCategoryPicker = widget.type !== "Kpi" && widget.type !== "Table";
    const valueFieldOptions = widget.type === "Table" ? columns.map((c) => c.name) : numericFields;
    const allowMultipleValueFields = widget.type === "Bar" || widget.type === "Line" || widget.type === "Table";

    return (
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
        <TextField
          select
          size="small"
          label="Dataset"
          value={datasetId ?? ""}
          onChange={(e) => handleDatasetChange(Number(e.target.value))}
          sx={{ minWidth: 140 }}
        >
          {datasets.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
        </TextField>

        {showCategoryPicker && (
          <TextField
            select
            size="small"
            label="Category field"
            value={widget.binding?.categoryField ?? ""}
            onChange={(e) => handleCategoryChange(e.target.value)}
            sx={{ minWidth: 140 }}
          >
            {[...otherFields, ...numericFields].map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
          </TextField>
        )}

        <TextField
          select
          size="small"
          label={widget.type === "Table" ? "Columns" : "Value field(s)"}
          slotProps={{ select: { multiple: allowMultipleValueFields } }}
          value={allowMultipleValueFields ? (widget.binding?.valueFields ?? []) : (widget.binding?.valueFields[0] ?? "")}
          onChange={(e) => {
            const value = e.target.value;
            handleValueFieldsChange(Array.isArray(value) ? value : [value as string]);
          }}
          sx={{ minWidth: 140 }}
        >
          {valueFieldOptions.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
        </TextField>
      </Box>
    );
  }

  export default WidgetBindingEditor;
  ```

- [ ] Step 4: Run the tests again to confirm they pass:
  ```
  npm test
  ```

- [ ] Step 5: Modify `frontend/src/pages/ReportCanvas.tsx` to add Title/Content editing, wire in `WidgetBindingEditor`, and add a Save button. Add these imports:
  ```tsx
  import { useNavigate } from "react-router-dom";
  import { saveWidgets, type SaveWidgetRequest } from "../api/widgets";
  import WidgetBindingEditor from "../widgets/WidgetBindingEditor";
  ```
  Extend the existing `react-router-dom` import to also bring in `useNavigate` (same import line as `useParams`). Add inside the component, after `const [error, setError] = useState<string | null>(null);`:
  ```tsx
  const navigate = useNavigate();
  ```
  Add a `handleSave` function, after `removeWidget`:
  ```tsx
  async function handleSave() {
    setError(null);
    const payload: SaveWidgetRequest[] = widgets.map((w) => ({
      type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, title: w.title, content: w.content, binding: w.binding,
    }));

    try {
      await saveWidgets(reportId, payload);
      navigate(`/reports/${reportId}`);
    } catch {
      setError("Could not save this report's widgets.");
    }
  }
  ```
  Add a Save button next to the "Add widget" picker:
  ```tsx
  <Button variant="contained" onClick={handleSave}>Save</Button>
  ```
  Replace each grid item's inner content — currently just the Remove button + `WidgetRenderer` — with the full editing controls (Title field for every widget, Content field only for Text, the binding editor, then the live-rendered widget):
  ```tsx
  <div className="grid-stack-item-content">
    <Button size="small" onClick={() => removeWidget(w.id)}>Remove</Button>
    <TextField
      size="small"
      label="Title"
      value={w.title}
      onChange={(e) => dispatch({ type: "titleChanged", id: w.id, title: e.target.value })}
      sx={{ display: "block", mb: 1, mt: 1 }}
    />
    {w.type === "Text" && (
      <TextField
        size="small"
        label="Content"
        multiline
        minRows={2}
        fullWidth
        value={w.content ?? ""}
        onChange={(e) => dispatch({ type: "contentChanged", id: w.id, content: e.target.value })}
        sx={{ mb: 1 }}
      />
    )}
    <WidgetBindingEditor widget={w} onChange={(binding) => dispatch({ type: "bindingChanged", id: w.id, binding })} />
    <WidgetRenderer widget={w} />
  </div>
  ```
  (This replaces the grid item's inner `<div className="grid-stack-item-content">...</div>` block from Task 13 in full — the outer `<div className="grid-stack-item" {...gridstackAttrs}>` wrapper and the `.map` structure around it are unchanged.)

- [ ] Step 6: Confirm the build compiles:
  ```
  npm run build
  ```

- [ ] Step 7: Run the full test suite once more:
  ```
  npm test
  ```
  Expected: all pass.

- [ ] Step 8: Commit:
  ```
  git add frontend/src/widgets/WidgetBindingEditor.tsx frontend/src/widgets/WidgetBindingEditor.test.tsx frontend/src/pages/ReportCanvas.tsx
  git commit -m "frontend: Title/Content editing controls, WidgetBindingEditor (Dataset + classified field pickers), wire Save button to PUT"
  ```

---

### Task 15: Frontend — `ReportView`, routing, entry links from `ReportsPage`

**Files:**
- Create: `frontend/src/pages/ReportView.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/ReportsPage.tsx`

**Interfaces:**
- Consumes: `getWidgets` (Task 9), `WidgetRenderer` (Task 12), `ReportCanvas` (Tasks 13-14).
- Produces: route `/reports/:id` (read-only view) and `/reports/:id/edit` (canvas), plus an entry point from the existing Reports list — the last piece connecting this milestone to something a user can actually click into.

- [ ] Step 1: Create `frontend/src/pages/ReportView.tsx`:
  ```tsx
  import { useEffect, useState } from "react";
  import { useParams } from "react-router-dom";
  import { Alert, Box, Container, Typography } from "@mui/material";
  import { getWidgets, type WidgetSummary } from "../api/widgets";
  import WidgetRenderer from "../widgets/WidgetRenderer";

  function ReportView() {
    const { id } = useParams<{ id: string }>();
    const reportId = Number(id);
    const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      getWidgets(reportId)
        .then(setWidgets)
        .catch(() => setError("Could not load this report."));
    }, [reportId]);

    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>Report</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 2 }}>
          {widgets.map((w) => (
            <Box key={w.id} sx={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}>
              <WidgetRenderer widget={w} />
            </Box>
          ))}
        </Box>
      </Container>
    );
  }

  export default ReportView;
  ```

- [ ] Step 2: Modify `frontend/src/App.tsx` — add imports and two new routes. Add alongside the existing page imports:
  ```tsx
  import ReportCanvas from "./pages/ReportCanvas";
  import ReportView from "./pages/ReportView";
  ```
  Add to the `createBrowserRouter` array, alongside the existing `/reports` entry:
  ```tsx
  { path: "/reports/:id", element: <Layout><ReportView /></Layout> },
  { path: "/reports/:id/edit", element: <Layout><ReportCanvas /></Layout> },
  ```

- [ ] Step 3: Modify `frontend/src/pages/ReportsPage.tsx` to add "View"/"Edit" links per report row. Add the import:
  ```tsx
  import { Link as RouterLink } from "react-router-dom";
  ```
  Add a fourth header cell:
  ```tsx
  <TableRow><TableCell>ID</TableCell><TableCell>Name</TableCell><TableCell>Description</TableCell><TableCell>Designer</TableCell></TableRow>
  ```
  Add a matching cell in each row, replacing the existing row-rendering line:
  ```tsx
  {reports.map((r) => (
    <TableRow key={r.id}>
      <TableCell>{r.id}</TableCell>
      <TableCell>{r.name}</TableCell>
      <TableCell>{r.description}</TableCell>
      <TableCell>
        <Button size="small" component={RouterLink} to={`/reports/${r.id}`}>View</Button>
        <Button size="small" component={RouterLink} to={`/reports/${r.id}/edit`}>Edit</Button>
      </TableCell>
    </TableRow>
  ))}
  ```

- [ ] Step 4: Confirm the build compiles:
  ```
  npm run build
  ```
  Expected: clean compile.

- [ ] Step 5: Run the full test suite one final time:
  ```
  npm test
  ```
  Expected: all pass.

- [ ] Step 6: Manual smoke test — start both apps and click through the flow once, confirming no stale process first:
  ```
  Get-Process -Name Backend -ErrorAction SilentlyContinue | Stop-Process -Force
  dotnet run --project backend --launch-profile http
  ```
  In a second terminal:
  ```
  npm run dev --prefix frontend
  ```
  In a browser: open `http://localhost:5173/reports`, click "Edit" on a report, add a Kpi widget, set its Title, bind it to a Dataset created in Task 6's smoke test, confirm the live-preview number renders, click Save, confirm it navigates to the view page and the same number renders there too. Also add a Text widget, type content into it, Save, and confirm the same text shows on the view page. Stop both processes afterward and confirm port 5198 is free.

- [ ] Step 7: Commit:
  ```
  git add frontend/src/pages/ReportView.tsx frontend/src/App.tsx frontend/src/pages/ReportsPage.tsx
  git commit -m "frontend: ReportView, edit/view routing, entry links from the Reports list"
  ```

---

This closes Milestone 4: `Report` now has a real designer (`/reports/{id}/edit`) and a real read-only view (`/reports/{id}`), all six widget types render against live Dataset data with editable titles and Text content, saves are atomic delete-then-insert, and stale bindings degrade gracefully per-widget instead of breaking a whole report.
