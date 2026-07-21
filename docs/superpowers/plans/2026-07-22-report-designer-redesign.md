# Report Designer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** replace Milestone 4's per-widget "Connection → Dataset → Widget" ceremony with a Power BI-style model — **one query per report**, written once as `Report.DatasetId`, whose result columns become a shared field list that every widget on every page is built from by dragging fields into type-specific wells — and adopt the approved "Meridian" visual/interaction system (`report-designer.html`) across the whole app.

**Architecture:** A breaking schema change on top of the already-shipped Milestone 4 tables: `WidgetBinding.DatasetId` is removed (replaced by `Report.DatasetId`, shared across all of a report's pages), `Widget.ReportId` becomes `Widget.ReportPageId` pointing at a new `ReportPage` entity, `Dataset` gains `IsSaved`. Backend adds `ReportPage` CRUD, a report-level quick-query creation/replacement endpoint, and Dataset promote/delete endpoints. Frontend splits into two chrome layers: a persistent-sidebar **App shell** (Connections/Datasets/Reports lists) and an immersive **Report editor shell** (ribbon/rail/canvas/Filters+Visualizations+Data panes/page tabs) matching `report-designer.html` pixel-for-pixel where practical. The report's query is fetched exactly once into a shared React context; every widget's existing pure shaping function re-runs against a client-side-filtered subset on every Filters-pane or click-to-cross-filter interaction — no per-widget or per-filter-click backend round trip.

**Tech Stack:** .NET 8, EF Core 8 (SqlServer + InMemory, pinned `8.0.11`), xUnit, System.Text.Json (all already in place, no new backend packages). React 19 + Vite 8 + TypeScript ~6.0.2 + MUI 9 + axios + echarts + gridstack + Vitest/RTL/jsdom (all already in place, no new frontend packages — native HTML5 drag-and-drop only, no DnD library).

This plan was written after reading the full approved design doc (`docs/superpowers/specs/2026-07-22-report-designer-redesign-design.md`), the entire current `backend/` and `frontend/src/` trees as they exist after Milestone 4 (`git log` shows `80c033675`..`c13bd839a` as the most recent commits — Milestone 4's Report Designer, plus the standalone `IqiCore.Reports.Api` work which is a *different, unrelated* repository and irrelevant here), and the full ~1150-line `report-designer.html` reference prototype.

## Global Constraints

- **Source of truth is the design doc, not the mockup, when they disagree.** `report-designer.html`'s `VTYPES` table gives Bar/Line/Area a "Legend" well (a second category dimension for series-splitting) that the approved design doc's cardinality rules do **not** include — the design doc keeps Milestone 4's exact two-field shape (`CategoryField` + `ValueFields` list, multi-series via multiple measures only). This plan follows the design doc: **no Legend well anywhere.**
- **`Dataset.RowLimit` default is 10000** (up from Milestone 3/4's `1000`) — `DatasetService.DefaultRowLimit`. This is a runtime fallback used only when executing a Dataset whose `RowLimit` column is null; it is never written back to the row.
- **Final `WidgetType` enum, in this exact order** (matches `report-designer.html`'s picker-grid order): `Bar, ClusteredBar, StackedColumn, Line, Area, Pie, Donut, Scatter, Kpi, Table, Text`. `Bar` = clustered column (unchanged rendering from Milestone 4, just newly clarified as "clustered column" in the picker's tooltip). `ClusteredBar` = the new horizontal-bar type. `Text` never gets a `WidgetBinding` row — unchanged invariant from Milestone 4, enforced the same two places (validator + service).
- **Cardinality rules** (extends Milestone 4's validator): Kpi — `CategoryField` null, `ValueFields` exactly 1. Bar/ClusteredBar/StackedColumn/Line/Area — `CategoryField` required, `ValueFields` 1+. Pie/Donut — `CategoryField` required, `ValueFields` exactly 1. Table — `CategoryField` unused, `ValueFields` is an ordered column subset (empty = every column). **Scatter — `CategoryField` optional (a "Details" grouping field, not a shared axis), `ValueFields` exactly 2, positionally meaningful: index 0 = X measure, index 1 = Y measure.** This positional rule is the one exception to "ValueFields order doesn't matter," and the field-well UI must label Scatter's two value wells "X-axis" / "Y-axis" specifically (never a generic "Values" list) so the position is unambiguous to the person building it.
- **StackedColumn/ClusteredBar are rendering-flag variants of Bar's existing `shapeBarOption`** (`stacked`/`horizontal` boolean options, same function, same `BarWidget.tsx` component with new props) — **Area is a rendering-flag variant of `shapeLineOption`** (`area` option) — **Donut is a rendering-flag variant of `shapePieOption`** (`donut` option, cutout percentage). No new shaping functions, no new widget component files, no new backend validation branches beyond routing the new enum values to the existing Bar/Line/Pie cardinality checks. **Scatter is genuinely new**: its own shaping function (`shapeScatterOption`), its own component (`ScatterWidget.tsx`), its own validator branch, its own well spec (`x`/`y`/`category` keyed, not `category`/`values`).
- **One query per report, fetched exactly once.** The editor and view pages each fetch `GET /api/reports/{id}` (for `DatasetId`) then `POST /api/datasets/{datasetId}/execute` exactly once per page load/refresh, hold the raw `QueryResult` in a shared React context (`ReportQueryContext`), and every widget's existing pure shaping function re-runs against a client-side-filtered subset. **No widget ever calls `executeDataset` on its own** — Milestone 4's `useDatasetExecute` hook is deleted (dead code once `WidgetRenderer` takes a shared `result` prop instead).
- **Import-style filtering only, explicitly not DirectQuery.** A Filters-pane checkbox or a direct click on a widget's data point (click-to-cross-filter) re-filters the already-fetched in-memory row set via a pure function (`applyFilters`) — zero extra HTTP calls. The ribbon's "Refresh data" button is the only way to re-run the query against the source. `ReportPage.FilterState` (JSON) persists the Filters-pane selections per page, saved only when the ribbon's explicit Save button is clicked (no autosave — same pattern as Milestone 4).
- **Widget-level format options (title text/visibility, legend visibility, gridlines, palette, sort direction, data-labels toggle) persist on the existing `WidgetBinding` row as a new opaque JSON string column, `FormatOptions`** (default `"{}"`) — exactly like `ValueFields`, the backend never parses or validates it, it's a pure passthrough blob the frontend serializes/deserializes. This is an additive, backward-compatible column added in the same migration as the `DatasetId` removal (not a separate migration) since design doc's Format-tab requirements need *some* persistence mechanism and the doc doesn't specify one — this is the implementation decision, made once, used everywhere.
- **This project has (almost) zero navigation properties or fluent relationship config** — same rule as Milestone 4's Global Constraints. `ReportPage.ReportId` and `Widget.ReportPageId` stay bare `int`s with no FK constraint and no nav property, exactly mirroring how `Widget.ReportId` and `Dataset.DataSourceConnectionId` were already bare ints. `Report.DatasetId` is also a bare nullable `int`, no FK constraint — the same loose-coupling style. The one deliberate exception remains `Widget.Binding` (unchanged from Milestone 4).
- **`Datasets.IsSaved` backfills to `true` for every pre-existing row** at the SQL default-value level, because every dataset created through the Milestone 2/3 Datasets-library flow was already explicitly named — treating pre-existing rows as "saved" is the semantically correct backfill, not an arbitrary choice. New quick-query datasets always set `IsSaved = false` explicitly in application code (never relying on the column default).
- **`DatasetService.ListAsync` (the Datasets-library listing) now filters to `IsSaved == true` only** — unsaved, report-owned quick-query Datasets never appear in the library, per the design doc ("hidden from the Datasets library").
- **`DatasetsController.Create`'s HTTP endpoint always forces `IsSaved = true` server-side** (`request with { IsSaved = true }`), regardless of what a caller's JSON body contains. The only code path that ever creates an `IsSaved = false` Dataset is `ReportService`, calling `IDatasetService.CreateAsync` directly (in-process, not over HTTP) with `IsSaved: false` explicit in the request. This sidesteps any ambiguity around whether `System.Text.Json` honors a record parameter's C# default value for an absent JSON property — nothing in this plan depends on that behavior either way.
- **Two distinct exception types map to two distinct HTTP statuses, same lesson as Milestone 4's own Global Constraints** (`git log` — Milestone 3's original `InvalidOperationException` reuse bug): `InvalidOperationException` (parent/entity not found) → 404 everywhere in this plan's new controllers, and the new `LastPageDeletionException` (an app-level conflict, not a missing-entity problem) → 409, in `ReportPagesController.Delete`. Never conflate the two.
- **Report deletion cascades manually** (`ReportService.DeleteAsync` explicitly `RemoveRange`s `WidgetBindings` → `Widgets` → `ReportPages` → `Report`, in that order, then conditionally deletes the report's Dataset via `IDatasetService.DeleteAsync` if and only if it's `IsSaved == false`) — same manual-remove-range style Milestone 4's `WidgetService.SaveWidgetsAsync` already uses, not DB-level cascade (there is no FK to cascade on, per the no-nav-properties rule above).
- **`ReportPagesController`'s delete enforces "a report needs at least one page"** by counting remaining pages before deleting, throwing `LastPageDeletionException` if the page being deleted is the last one for that report. `ReportService.DeleteAsync` (deleting the *entire report*) does **not** go through `IReportPageService.DeleteAsync` per page — it manipulates `ReportPages` directly via the context, because the per-page "at least one" invariant does not apply when the whole report is being destroyed.
- **CSS for the Report editor shell is ported near-verbatim from `report-designer.html`'s `<style>` block** into `frontend/src/reportEditor/reportEditor.css`, keeping the mockup's exact class names (`.ribbon`, `.rail`, `.stage`, `.canvas`, `.pane-filters`, `.pane-viz`, `.pane-data`, `.viz-cell`, `.well-box`, `.pill`, `.field-row`, `.ptab`, etc.) and its exact CSS custom-property color tokens (`--ink:#15171e; --accent:#5b4fe6; --good:#12a594; --warn:#e5843a` etc. — copied verbatim in Task 10) rather than reimplementing the same visuals through MUI `sx` props, which would drift from what was actually approved. These class names are deliberately left unprefixed/global (this is a personal project, not a component library) — a documented, accepted risk, not an oversight — because MUI's own generated classes are already namespaced (`Mui*`) and collision is not realistically expected against ordinary page content in `ReportsPage`/`DatasetsPage`/`DataSourcesPage`.
- **IBM Plex Sans (body) / IBM Plex Mono (monospace figures)** loaded via a Google Fonts `<link>` in `frontend/index.html`, applied globally (both shells), exactly matching the reference.
- **Every frontend task's test-running step is `npm run verify`** (`tsc -b && vitest run`), run from `frontend/`, never bare `npm test` — this project has been bitten three times by `npm test` passing while `tsc -b` failed. **Every backend task's test-running step is `dotnet test Backend.Tests` (or `dotnet test Backend.Tests --filter "FullyQualifiedName~X"` for a single class while iterating, always followed by the unfiltered run before marking the task done).**
- `frontend/tsconfig.app.json` has `"verbatimModuleSyntax": true` — every new/edited `.ts`/`.tsx` file uses `import type { X }` for type-only imports.
- Commits stage **exact file paths only, never `git add -A`.** Commit messages follow this project's real style (`backend: ...` / `frontend: ...`, lowercase, imperative, no trailer, **no `Co-Authored-By` line** — Mulham's personal project, no AI attribution in commits per his standing preference).
- `$env:ASPNETCORE_ENVIRONMENT = "Development"` before any `dotnet ef` command. Same SQL Server Express instance (`localhost\SQLEXPRESS`, `OpenReportingPlatform` database) as every prior milestone.
- Any step involving `dotnet run` + manual `curl` testing must first confirm no stale `Backend.exe` is already holding port 5198, and confirm the port is free again afterward.
- **Explicitly out of scope** (from the design doc's own list, repeated here so it stays visible mid-implementation): DirectQuery-style live per-filter re-querying, visual-level filters (only page-level Filters pane + click-to-cross-filter), export data/image, conditional formatting, drill-down hierarchies, bookmarks, report-wide themes beyond the per-visual palette picker, numeric/temporal range filters (categorical checkbox filters only), more than one dataset per report, undo/redo, zoom/fit-to-page, any new DnD library, Model view/multi-table joins, reporting over huge data volumes. Resist scope creep toward any of these.

---

### Task 1: Schema redesign — models, DbContext, and every existing consumer updated to compile

**Files:**
- Modify: `backend/Models/Report.cs`
- Create: `backend/Models/ReportPage.cs`
- Modify: `backend/Models/Widget.cs`
- Modify: `backend/Models/WidgetBinding.cs`
- Modify: `backend/Models/Dataset.cs`
- Modify: `backend/Models/WidgetType.cs`
- Modify: `backend/Data/ReportingDbContext.cs`
- Modify: `backend/Services/IReportRepository.cs`
- Modify: `backend/Services/EfReportRepository.cs`
- Modify: `backend/Services/Widgets/SaveWidgetsRequest.cs`
- Modify: `backend/Services/Widgets/WidgetSummary.cs`
- Modify: `backend/Services/Widgets/WidgetService.cs`
- Modify: `backend/Controllers/WidgetsController.cs`
- Test: `Backend.Tests/EfReportRepositoryTests.cs`
- Test: `Backend.Tests/ReportsControllerTests.cs`
- Test: `Backend.Tests/WidgetServiceTests.cs`
- Test: `Backend.Tests/WidgetsControllerTests.cs`
- Test: `Backend.Tests/WidgetBindingValidatorTests.cs`

**Interfaces:**
- Consumes: nothing new — this is the foundational task every later backend task builds on.
- Produces: `Backend.Models.Report` (now a mutable class: `Id, Name, Description, DatasetId (int?)` — was a positional record; converting was necessary because `DatasetId`/`Name` must be mutable post-creation via ordinary property assignment, which C#'s compiler forbids on a positional record's `init`-only properties outside its own constructor). `Backend.Models.ReportPage` (`Id, ReportId, Name, SortOrder, FilterState`). `Backend.Models.Widget.ReportPageId` (renamed from `ReportId`). `Backend.Models.WidgetBinding` (`DatasetId` removed, `FormatOptions` added, default `"{}"`). `Backend.Models.Dataset.IsSaved` (`bool`, default `true`). `Backend.Models.WidgetType` full final enum. `Backend.Services.Widgets.SaveWidgetBindingRequest(string? CategoryField, IReadOnlyList<string> ValueFields, string? FormatOptions)` (was `(int DatasetId, ...)`). `Backend.Services.Widgets.WidgetBindingSummary(string? CategoryField, IReadOnlyList<string> ValueFields, string FormatOptions)`. `WidgetsController` route becomes `api/reportpages/{reportPageId}/widgets`. Every later task depends on these exact shapes and names.

- [ ] Step 1: Modify `backend/Models/Report.cs` — full file after the change:
  ```csharp
  namespace Backend.Models;

  public class Report
  {
      public int Id { get; set; }

      public string Name { get; set; } = "";

      public string Description { get; set; } = "";

      public int? DatasetId { get; set; }
  }
  ```

- [ ] Step 2: Create `backend/Models/ReportPage.cs`:
  ```csharp
  namespace Backend.Models;

  public class ReportPage
  {
      public int Id { get; set; }

      public int ReportId { get; set; }

      public string Name { get; set; } = "";

      public int SortOrder { get; set; }

      public string FilterState { get; set; } = "{}";
  }
  ```
  `FilterState` is a JSON object mapping a Categorical field name to its selected distinct values, e.g. `{"Region":["North","South"]}` — defaults to `"{}"` (no filters), never `""`, same reasoning as `WidgetBinding.ValueFields` defaulting to `"[]"`.

- [ ] Step 3: Modify `backend/Models/Widget.cs` — full file after the change:
  ```csharp
  namespace Backend.Models;

  public class Widget
  {
      public int Id { get; set; }

      public int ReportPageId { get; set; }

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

- [ ] Step 4: Modify `backend/Models/WidgetBinding.cs` — full file after the change:
  ```csharp
  namespace Backend.Models;

  public class WidgetBinding
  {
      public int Id { get; set; }

      public int WidgetId { get; set; }

      public string? CategoryField { get; set; }

      public string ValueFields { get; set; } = "[]";

      public string FormatOptions { get; set; } = "{}";
  }
  ```
  `DatasetId` is gone — a widget's Dataset is now always implicitly its parent `ReportPage.Report.DatasetId`. `FormatOptions` is an opaque JSON blob (title/legend/gridlines/palette/sort/data-labels) the backend never parses — see Global Constraints.

- [ ] Step 5: Modify `backend/Models/Dataset.cs` — add one property (after `RowLimit`):
  ```csharp
      public bool IsSaved { get; set; } = true;
  ```

- [ ] Step 6: Modify `backend/Models/WidgetType.cs` — full file after the change:
  ```csharp
  namespace Backend.Models;

  public enum WidgetType
  {
      Bar,
      ClusteredBar,
      StackedColumn,
      Line,
      Area,
      Pie,
      Donut,
      Scatter,
      Kpi,
      Table,
      Text
  }
  ```

- [ ] Step 7: Modify `backend/Data/ReportingDbContext.cs` — full file after the change:
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

      public DbSet<ReportPage> ReportPages => Set<ReportPage>();

      public DbSet<DataSourceConnection> DataSourceConnections => Set<DataSourceConnection>();

      public DbSet<Dataset> Datasets => Set<Dataset>();

      public DbSet<Widget> Widgets => Set<Widget>();

      public DbSet<WidgetBinding> WidgetBindings => Set<WidgetBinding>();

      protected override void OnModelCreating(ModelBuilder modelBuilder)
      {
          base.OnModelCreating(modelBuilder);

          modelBuilder.Entity<Report>().HasData(
              new Report { Id = 1, Name = "Monthly Sales", Description = "Sales totals grouped by month", DatasetId = null },
              new Report { Id = 2, Name = "Top Agents", Description = "Agents ranked by closed deals", DatasetId = null },
              new Report { Id = 3, Name = "Pipeline Overview", Description = "Open deals by stage", DatasetId = null }
          );

          modelBuilder.Entity<Widget>()
              .HasOne(w => w.Binding)
              .WithOne()
              .HasForeignKey<WidgetBinding>(b => b.WidgetId);
      }
  }
  ```

- [ ] Step 8: Modify `backend/Services/IReportRepository.cs` — no shape change needed, but confirm it still compiles against the new `Report` class (it does — the interface only references `Report` by type, not by its record-ness). No edit required; open the file only to confirm.

- [ ] Step 9: Modify `backend/Services/EfReportRepository.cs` — change the one line that constructed `Report` positionally:
  ```csharp
      public Report Add(string name, string description)
      {
          var report = new Report { Name = name, Description = description };
          _context.Reports.Add(report);
          _context.SaveChanges();
          return report;
      }
  ```

- [ ] Step 10: Modify `backend/Services/Widgets/SaveWidgetsRequest.cs` — full file after the change:
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

  public record SaveWidgetBindingRequest(string? CategoryField, IReadOnlyList<string> ValueFields, string? FormatOptions);
  ```

- [ ] Step 11: Modify `backend/Services/Widgets/WidgetSummary.cs` — full file after the change:
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

  public record WidgetBindingSummary(string? CategoryField, IReadOnlyList<string> ValueFields, string FormatOptions);
  ```

- [ ] Step 12: Modify `backend/Services/Widgets/WidgetService.cs` — full file after the change:
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

      public async Task<IReadOnlyList<WidgetSummary>> GetWidgetsAsync(int reportPageId)
      {
          await EnsureReportPageExistsAsync(reportPageId);

          var widgets = await _context.Widgets
              .Include(w => w.Binding)
              .Where(w => w.ReportPageId == reportPageId)
              .ToListAsync();

          return widgets.Select(ToSummary).ToList();
      }

      public async Task<IReadOnlyList<WidgetSummary>> SaveWidgetsAsync(int reportPageId, SaveWidgetsRequest request)
      {
          await EnsureReportPageExistsAsync(reportPageId);

          foreach (var widgetRequest in request.Widgets)
          {
              var validation = _validator.Validate(widgetRequest.Type, widgetRequest.Binding);
              if (!validation.IsValid)
              {
                  throw new WidgetValidationException(validation.Error!);
              }
          }

          var existingWidgets = await _context.Widgets.Where(w => w.ReportPageId == reportPageId).ToListAsync();
          var existingWidgetIds = existingWidgets.Select(w => w.Id).ToList();
          var existingBindings = await _context.WidgetBindings.Where(b => existingWidgetIds.Contains(b.WidgetId)).ToListAsync();

          _context.WidgetBindings.RemoveRange(existingBindings);
          _context.Widgets.RemoveRange(existingWidgets);

          foreach (var widgetRequest in request.Widgets)
          {
              var widget = new Widget
              {
                  ReportPageId = reportPageId,
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
                      CategoryField = widgetRequest.Binding.CategoryField,
                      ValueFields = JsonSerializer.Serialize(widgetRequest.Binding.ValueFields),
                      FormatOptions = widgetRequest.Binding.FormatOptions ?? "{}"
                  };
              }

              _context.Widgets.Add(widget);
          }

          await _context.SaveChangesAsync();

          return await GetWidgetsAsync(reportPageId);
      }

      private async Task EnsureReportPageExistsAsync(int reportPageId)
      {
          var exists = await _context.ReportPages.AnyAsync(p => p.Id == reportPageId);
          if (!exists)
          {
              throw new InvalidOperationException($"No report page found with id {reportPageId}.");
          }
      }

      private static WidgetSummary ToSummary(Widget widget)
      {
          WidgetBindingSummary? bindingSummary = null;
          if (widget.Binding != null)
          {
              var valueFields = JsonSerializer.Deserialize<List<string>>(widget.Binding.ValueFields) ?? new List<string>();
              bindingSummary = new WidgetBindingSummary(widget.Binding.CategoryField, valueFields, widget.Binding.FormatOptions);
          }

          return new WidgetSummary(widget.Id, widget.Type, widget.X, widget.Y, widget.W, widget.H, widget.Title, widget.Content, bindingSummary);
      }
  }
  ```

- [ ] Step 13: Modify `backend/Controllers/WidgetsController.cs` — full file after the change:
  ```csharp
  using Backend.Services.Widgets;
  using Microsoft.AspNetCore.Mvc;

  namespace Backend.Controllers;

  [ApiController]
  [Route("api/reportpages/{reportPageId}/widgets")]
  public class WidgetsController : ControllerBase
  {
      private readonly IWidgetService _service;

      public WidgetsController(IWidgetService service)
      {
          _service = service;
      }

      [HttpGet]
      public async Task<ActionResult<IReadOnlyList<WidgetSummary>>> GetWidgets(int reportPageId)
      {
          try
          {
              return Ok(await _service.GetWidgetsAsync(reportPageId));
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
      }

      [HttpPut]
      public async Task<ActionResult<IReadOnlyList<WidgetSummary>>> SaveWidgets(int reportPageId, SaveWidgetsRequest request)
      {
          try
          {
              return Ok(await _service.SaveWidgetsAsync(reportPageId, request));
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

- [ ] Step 14: Modify `Backend.Tests/EfReportRepositoryTests.cs` — only the `Add` assertions need no change (they already just check `Id`/`Name`/`Description`); confirm it still compiles as-is (it does, `Report` is still constructed only via `repository.Add(...)`, never positionally in this file). No edit required; open the file only to confirm.

- [ ] Step 15: Modify `Backend.Tests/ReportsControllerTests.cs` — no shape change needed (`Report` is only read by property, never constructed positionally, in this file). No edit required; open the file only to confirm.

- [ ] Step 16: Modify `Backend.Tests/WidgetBindingValidatorTests.cs` — every `SaveWidgetBindingRequest` construction drops its leading `datasetId` argument. Full file after the change:
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
          var binding = new SaveWidgetBindingRequest(null, new List<string> { "Anything" }, null);

          var result = _validator.Validate(WidgetType.Text, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Text widgets must not have a binding.", result.Error);
      }

      [Fact]
      public void Validate_KpiWithCategoryField_Fails()
      {
          var binding = new SaveWidgetBindingRequest("Region", new List<string> { "Revenue" }, null);

          var result = _validator.Validate(WidgetType.Kpi, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Kpi widgets must not have a CategoryField.", result.Error);
      }

      [Fact]
      public void Validate_KpiWithTwoValueFields_Fails()
      {
          var binding = new SaveWidgetBindingRequest(null, new List<string> { "Revenue", "Cost" }, null);

          var result = _validator.Validate(WidgetType.Kpi, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Kpi widgets must have exactly one ValueField.", result.Error);
      }

      [Fact]
      public void Validate_KpiWithSingleValueFieldAndNoCategory_Succeeds()
      {
          var binding = new SaveWidgetBindingRequest(null, new List<string> { "Revenue" }, null);

          var result = _validator.Validate(WidgetType.Kpi, binding);

          Assert.True(result.IsValid);
      }

      [Fact]
      public void Validate_PieWithTwoValueFields_Fails()
      {
          var binding = new SaveWidgetBindingRequest("Region", new List<string> { "Revenue", "Cost" }, null);

          var result = _validator.Validate(WidgetType.Pie, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Pie widgets must have exactly one ValueField.", result.Error);
      }

      [Fact]
      public void Validate_PieWithNoCategoryField_Fails()
      {
          var binding = new SaveWidgetBindingRequest(null, new List<string> { "Revenue" }, null);

          var result = _validator.Validate(WidgetType.Pie, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Pie widgets require a CategoryField.", result.Error);
      }

      [Fact]
      public void Validate_BarWithNoCategoryField_Fails()
      {
          var binding = new SaveWidgetBindingRequest(null, new List<string> { "Revenue" }, null);

          var result = _validator.Validate(WidgetType.Bar, binding);

          Assert.False(result.IsValid);
          Assert.Equal("This widget type requires a CategoryField.", result.Error);
      }

      [Fact]
      public void Validate_BarWithCategoryAndMultipleValueFields_Succeeds()
      {
          var binding = new SaveWidgetBindingRequest("Month", new List<string> { "Revenue", "Cost" }, null);

          var result = _validator.Validate(WidgetType.Bar, binding);

          Assert.True(result.IsValid);
      }

      [Fact]
      public void Validate_LineWithNoValueFields_Fails()
      {
          var binding = new SaveWidgetBindingRequest("Month", new List<string>(), null);

          var result = _validator.Validate(WidgetType.Line, binding);

          Assert.False(result.IsValid);
          Assert.Equal("This widget type requires at least one ValueField.", result.Error);
      }

      [Fact]
      public void Validate_TableWithAnyValueFields_Succeeds()
      {
          var binding = new SaveWidgetBindingRequest(null, new List<string>(), null);

          var result = _validator.Validate(WidgetType.Table, binding);

          Assert.True(result.IsValid);
      }

      [Fact]
      public void Validate_UnconfiguredNonTextWidget_Succeeds()
      {
          var result = _validator.Validate(WidgetType.Bar, null);

          Assert.True(result.IsValid);
      }

      [Fact]
      public void Validate_StillUnroutedNewWidgetType_FailsAsUnknown()
      {
          // StackedColumn/ClusteredBar/Area/Donut/Scatter aren't routed to their own cardinality
          // rule yet — that's Task 6. Until then they must fall through the validator's existing
          // default arm rather than crash, proving the enum addition alone didn't break anything.
          var binding = new SaveWidgetBindingRequest("Month", new List<string> { "Revenue" }, null);

          var result = _validator.Validate(WidgetType.Scatter, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Unknown widget type 'Scatter'.", result.Error);
      }
  }
  ```

- [ ] Step 17: Modify `Backend.Tests/WidgetServiceTests.cs` — every test now seeds a `ReportPage` row (id `1`) instead of relying on a bare `Report` row, and every `SaveWidgetBindingRequest`/binding-summary assertion drops `DatasetId`. Full file after the change:
  ```csharp
  using Backend.Data;
  using Backend.Models;
  using Backend.Services.Widgets;
  using Microsoft.EntityFrameworkCore;
  using Xunit;

  namespace Backend.Tests;

  public class WidgetServiceTests
  {
      private class AlwaysValidBindingValidator : IWidgetBindingValidator
      {
          public WidgetBindingValidationResult Validate(WidgetType type, SaveWidgetBindingRequest? binding) =>
              WidgetBindingValidationResult.Success();
      }

      private static (IWidgetService Service, ReportingDbContext Context) CreateService(string databaseName)
      {
          var options = new DbContextOptionsBuilder<ReportingDbContext>()
              .UseInMemoryDatabase(databaseName)
              .Options;

          var context = new ReportingDbContext(options);
          context.Database.EnsureCreated();
          context.ReportPages.Add(new ReportPage { Id = 1, ReportId = 1, Name = "Page 1", SortOrder = 0, FilterState = "{}" });
          context.SaveChanges();

          var service = new WidgetService(context, new WidgetBindingValidator());
          return (service, context);
      }

      private static (IWidgetService Service, ReportingDbContext Context) CreateServiceWithValidator(string databaseName, IWidgetBindingValidator validator)
      {
          var options = new DbContextOptionsBuilder<ReportingDbContext>()
              .UseInMemoryDatabase(databaseName)
              .Options;

          var context = new ReportingDbContext(options);
          context.Database.EnsureCreated();
          context.ReportPages.Add(new ReportPage { Id = 1, ReportId = 1, Name = "Page 1", SortOrder = 0, FilterState = "{}" });
          context.SaveChanges();

          var service = new WidgetService(context, validator);
          return (service, context);
      }

      [Fact]
      public async Task GetWidgetsAsync_ReportPageNotFound_Throws()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());

          await Assert.ThrowsAsync<InvalidOperationException>(() => service.GetWidgetsAsync(999));
      }

      [Fact]
      public async Task GetWidgetsAsync_ReportPageWithNoWidgets_ReturnsEmptyList()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());

          var widgets = await service.GetWidgetsAsync(1);

          Assert.Empty(widgets);
      }

      [Fact]
      public async Task SaveWidgetsAsync_ReportPageNotFound_Throws()
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
              new SaveWidgetBindingRequest("Region", new List<string> { "Revenue" }, null));
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { badWidget });

          await Assert.ThrowsAsync<WidgetValidationException>(() => service.SaveWidgetsAsync(1, request));
      }

      [Fact]
      public async Task SaveWidgetsAsync_MixedBatchWithInvalidLast_ThrowsAndPersistsNothing()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());
          var validWidgetOne = new SaveWidgetRequest(WidgetType.Text, 0, 0, 4, 2, "Valid Widget", "content", null);
          var validWidgetTwo = new SaveWidgetRequest(WidgetType.Text, 4, 0, 4, 2, "Another Valid Widget", "content", null);
          var badWidget = new SaveWidgetRequest(
              WidgetType.Kpi, 0, 2, 4, 3, "Bad Kpi", null,
              new SaveWidgetBindingRequest("Region", new List<string> { "Revenue" }, null));
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { validWidgetOne, validWidgetTwo, badWidget });

          await Assert.ThrowsAsync<WidgetValidationException>(() => service.SaveWidgetsAsync(1, request));

          Assert.Equal(0, await context.Widgets.CountAsync());
          Assert.Equal(0, await context.WidgetBindings.CountAsync());
      }

      [Fact]
      public async Task SaveWidgetsAsync_PersistsWidgetsWithBindings()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var barWidget = new SaveWidgetRequest(
              WidgetType.Bar, 0, 0, 4, 3, "Revenue by Month", null,
              new SaveWidgetBindingRequest("Month", new List<string> { "Revenue" }, null));
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { barWidget });

          var saved = await service.SaveWidgetsAsync(1, request);

          var widget = Assert.Single(saved);
          Assert.True(widget.Id > 0);
          Assert.Equal("Revenue by Month", widget.Title);
          Assert.NotNull(widget.Binding);
          Assert.Equal("Month", widget.Binding!.CategoryField);
          Assert.Equal(new List<string> { "Revenue" }, widget.Binding.ValueFields);
          Assert.Equal("{}", widget.Binding.FormatOptions);
      }

      [Fact]
      public async Task SaveWidgetsAsync_BindingWithFormatOptions_PersistsThemVerbatim()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var barWidget = new SaveWidgetRequest(
              WidgetType.Bar, 0, 0, 4, 3, "Revenue by Month", null,
              new SaveWidgetBindingRequest("Month", new List<string> { "Revenue" }, "{\"showLegend\":false}"));
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { barWidget });

          var saved = await service.SaveWidgetsAsync(1, request);

          Assert.Equal("{\"showLegend\":false}", saved[0].Binding!.FormatOptions);
      }

      [Fact]
      public async Task SaveWidgetsAsync_TextWidgetWithSubmittedBinding_RejectedByValidator()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var textWidget = new SaveWidgetRequest(
              WidgetType.Text, 0, 0, 4, 2, "A note", "Hello",
              new SaveWidgetBindingRequest(null, new List<string> { "Anything" }, null));
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { textWidget });

          await Assert.ThrowsAsync<WidgetValidationException>(() => service.SaveWidgetsAsync(1, request));
      }

      [Fact]
      public async Task SaveWidgetsAsync_TextWidgetWithSubmittedBinding_StrippedAtPersistenceEvenIfValidatorAllowsIt()
      {
          var (service, _) = CreateServiceWithValidator(Guid.NewGuid().ToString(), new AlwaysValidBindingValidator());
          var textWidget = new SaveWidgetRequest(
              WidgetType.Text, 0, 0, 4, 2, "A note", "Hello",
              new SaveWidgetBindingRequest(null, new List<string> { "Anything" }, null));
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { textWidget });

          var saved = await service.SaveWidgetsAsync(1, request);

          var widget = Assert.Single(saved);
          Assert.Null(widget.Binding);
      }

      [Fact]
      public async Task SaveWidgetsAsync_ReplacesEntireExistingSetInOneCall()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());
          var firstRequest = new SaveWidgetsRequest(new List<SaveWidgetRequest>
          {
              new(WidgetType.Kpi, 0, 0, 2, 2, "Widget A", null, new SaveWidgetBindingRequest(null, new List<string> { "Revenue" }, null)),
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
              new SaveWidgetBindingRequest(null, new List<string>(), null));
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { tableWidget });

          var saved = await service.SaveWidgetsAsync(1, request);

          Assert.Empty(saved[0].Binding!.ValueFields);
      }
  }
  ```

- [ ] Step 18: Modify `Backend.Tests/WidgetsControllerTests.cs` — same `ReportPage` seeding + dropped-`DatasetId` treatment. Full file after the change:
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
          context.ReportPages.Add(new ReportPage { Id = 1, ReportId = 1, Name = "Page 1", SortOrder = 0, FilterState = "{}" });
          context.SaveChanges();

          var service = new WidgetService(context, new WidgetBindingValidator());
          return new WidgetsController(service);
      }

      [Fact]
      public async Task GetWidgets_ReportPageNotFound_Returns404()
      {
          var controller = CreateController(Guid.NewGuid().ToString());

          var result = await controller.GetWidgets(999);

          Assert.IsType<NotFoundObjectResult>(result.Result);
      }

      [Fact]
      public async Task GetWidgets_ReportPageWithNoWidgets_ReturnsEmptyOk()
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
              new SaveWidgetBindingRequest("Region", new List<string> { "A", "B" }, null));
          var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { badWidget });

          var result = await controller.SaveWidgets(1, request);

          Assert.IsType<BadRequestObjectResult>(result.Result);
      }

      [Fact]
      public async Task SaveWidgets_ReportPageNotFound_Returns404()
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
              new SaveWidgetBindingRequest(null, new List<string> { "Revenue" }, null));
          await controller.SaveWidgets(1, new SaveWidgetsRequest(new List<SaveWidgetRequest> { kpiWidget }));

          var result = await controller.GetWidgets(1);

          var ok = Assert.IsType<OkObjectResult>(result.Result);
          var widgets = Assert.IsAssignableFrom<IReadOnlyList<WidgetSummary>>(ok.Value);
          Assert.Single(widgets);
      }
  }
  ```

- [ ] Step 19: Build the whole solution:
  ```
  dotnet build Backend.Tests --no-incremental
  ```
  Expected: builds `backend` and `Backend.Tests` with zero errors. Fix any remaining reference you missed (search the whole repo for `.ReportId` on a `Widget`, `.DatasetId` on a `WidgetBinding`, and positional `new Report(` if the build surfaces one).

- [ ] Step 20: Run the tests:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass (this includes every pre-existing Dataset/DataSource/SqlServerProvider/RestApiProvider test file, untouched by this task, still green).

- [ ] Step 21: Commit:
  ```
  git add backend/Models backend/Data/ReportingDbContext.cs backend/Services/IReportRepository.cs backend/Services/EfReportRepository.cs backend/Services/Widgets backend/Controllers/WidgetsController.cs Backend.Tests/EfReportRepositoryTests.cs Backend.Tests/ReportsControllerTests.cs Backend.Tests/WidgetBindingValidatorTests.cs Backend.Tests/WidgetServiceTests.cs Backend.Tests/WidgetsControllerTests.cs
  git commit -m "backend: redesign schema — ReportPage, Report.DatasetId, Widget.ReportPageId, WidgetBinding without DatasetId"
  ```

---

### Task 2: Generate and apply the real EF Core migration

**Files:**
- Create: `backend/Migrations/*_RedesignReportDataModel.cs` (and its `.Designer.cs` companion, plus an updated `ReportingDbContextModelSnapshot.cs`, all tool-generated)

**Interfaces:**
- Consumes: the model/DbContext shapes from Task 1.
- Produces: the real `OpenReportingPlatform` database schema every later backend task runs its manual smoke tests against.

- [ ] Step 1: Set the environment for this terminal session:
  ```
  $env:ASPNETCORE_ENVIRONMENT = "Development"
  ```

- [ ] Step 2: Generate the migration:
  ```
  dotnet ef migrations add RedesignReportDataModel --project backend/Backend.csproj --startup-project backend/Backend.csproj
  ```
  Expected: ends with `Done.`, creates `backend/Migrations/{timestamp}_RedesignReportDataModel.cs` + `.Designer.cs`, updates `ReportingDbContextModelSnapshot.cs`, doesn't touch any earlier migration file.

- [ ] Step 3: Open the generated migration and confirm the `Up()` method does all of the following (EF Core cannot detect the `Widgets.ReportId` → `ReportPageId` rename as a rename — it will emit a `DropColumn`/`AddColumn` pair instead, which is fine: this is a personal dev database with only hand-entered test data, and the architecture note explicitly allows a clean drop/recreate over an over-engineered zero-downtime path):
  - `CreateTable` for `ReportPages` (`Id` identity PK, `ReportId` int, `Name` nvarchar, `SortOrder` int, `FilterState` nvarchar).
  - `AddColumn` `Reports.DatasetId` (int, nullable).
  - `DropColumn` `Widgets.ReportId` + `AddColumn` `Widgets.ReportPageId` (int, not nullable — any pre-existing `Widgets` row in the dev DB will get `ReportPageId = 0`, an orphan; acceptable, this is throwaway dev data, and Task 6 onward always creates widgets against a real `ReportPageId`).
  - `DropColumn` `WidgetBindings.DatasetId`.
  - `AddColumn` `WidgetBindings.FormatOptions` (nvarchar, not nullable, default `'{}'`).
  - `AddColumn` `Datasets.IsSaved` (bit, not nullable, default `1`).
  No edits needed if all six are present — just confirm.

- [ ] Step 4: Apply the migration:
  ```
  dotnet ef database update --project backend/Backend.csproj --startup-project backend/Backend.csproj
  ```
  Expected: ends with `Done.`, no errors.

- [ ] Step 5: Verify the new/changed columns exist:
  ```
  sqlcmd -S "localhost\SQLEXPRESS" -E -d OpenReportingPlatform -Q "SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE (TABLE_NAME='ReportPages') OR (TABLE_NAME='Reports' AND COLUMN_NAME='DatasetId') OR (TABLE_NAME='Widgets' AND COLUMN_NAME='ReportPageId') OR (TABLE_NAME='WidgetBindings' AND COLUMN_NAME='FormatOptions') OR (TABLE_NAME='Datasets' AND COLUMN_NAME='IsSaved')"
  ```
  Expected: rows for all five (`ReportPages` returns multiple rows, one per column).

- [ ] Step 6: Commit:
  ```
  git add backend/Migrations
  git commit -m "backend: add RedesignReportDataModel migration"
  ```

---

### Task 3: Extend Dataset — `IsSaved`, 10000 row-limit default, `DeleteAsync`, `PromoteAsync`

**Files:**
- Modify: `backend/Services/Datasets/CreateDatasetRequest.cs`
- Modify: `backend/Services/Datasets/DatasetSummary.cs`
- Modify: `backend/Services/Datasets/IDatasetService.cs`
- Modify: `backend/Services/Datasets/DatasetService.cs`
- Create: `backend/Services/Datasets/PromoteDatasetRequest.cs`
- Modify: `backend/Controllers/DatasetsController.cs`
- Test: `Backend.Tests/DatasetServiceTests.cs`

**Interfaces:**
- Consumes: `Dataset.IsSaved` (Task 1).
- Produces: `CreateDatasetRequest(int DataSourceConnectionId, string Name, string? Description, DatasetMode Mode, string DefinitionJson, int? RowLimit, bool IsSaved = true)`. `DatasetSummary(int Id, int DataSourceConnectionId, string Name, string? Description, DatasetMode Mode, int? RowLimit, bool IsSaved, IReadOnlyList<ColumnDescriptor> Columns, DateTime CreatedAtUtc, DateTime UpdatedAtUtc)`. `IDatasetService.DeleteAsync(int id)` and `IDatasetService.PromoteAsync(int id, string name)` — Task 5's `ReportService` depends on both.

- [ ] Step 1: Modify `backend/Services/Datasets/CreateDatasetRequest.cs` — full file after the change:
  ```csharp
  using Backend.Models;

  namespace Backend.Services.Datasets;

  public record CreateDatasetRequest(
      int DataSourceConnectionId,
      string Name,
      string? Description,
      DatasetMode Mode,
      string DefinitionJson,
      int? RowLimit,
      bool IsSaved = true);
  ```

- [ ] Step 2: Modify `backend/Services/Datasets/DatasetSummary.cs` — full file after the change:
  ```csharp
  using Backend.Models;
  using Backend.Services.DataSources;

  namespace Backend.Services.Datasets;

  public record DatasetSummary(
      int Id,
      int DataSourceConnectionId,
      string Name,
      string? Description,
      DatasetMode Mode,
      int? RowLimit,
      bool IsSaved,
      IReadOnlyList<ColumnDescriptor> Columns,
      DateTime CreatedAtUtc,
      DateTime UpdatedAtUtc);
  ```

- [ ] Step 3: Create `backend/Services/Datasets/PromoteDatasetRequest.cs`:
  ```csharp
  namespace Backend.Services.Datasets;

  public record PromoteDatasetRequest(string? Name);
  ```

- [ ] Step 4: Modify `backend/Services/Datasets/IDatasetService.cs` — full file after the change:
  ```csharp
  using Backend.Services.DataSources;

  namespace Backend.Services.Datasets;

  public interface IDatasetService
  {
      Task<DatasetSummary> CreateAsync(CreateDatasetRequest request);

      Task<IReadOnlyList<DatasetSummary>> ListAsync(int connectionId);

      Task<IReadOnlyList<ColumnDescriptor>> DiscoverColumnsAsync(int datasetId);

      Task<QueryResult> ExecuteAsync(int datasetId);

      Task DeleteAsync(int id);

      Task<DatasetSummary> PromoteAsync(int id, string name);
  }
  ```

- [ ] Step 5: Write the failing tests first — append to `Backend.Tests/DatasetServiceTests.cs` (inside the `DatasetServiceTests` class, after `DiscoverColumnsAsync_TableQueryMode_FiltersConnectionSchemaToSelectedColumns`):
  ```csharp
      [Fact]
      public async Task ListAsync_ExcludesUnsavedDatasets()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          await service.CreateAsync(new CreateDatasetRequest(1, "Saved One", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), null, IsSaved: true));
          await service.CreateAsync(new CreateDatasetRequest(1, "", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), null, IsSaved: false));

          var datasets = await service.ListAsync(1);

          var dataset = Assert.Single(datasets);
          Assert.Equal("Saved One", dataset.Name);
          Assert.True(dataset.IsSaved);
      }

      [Fact]
      public async Task CreateAsync_UnsavedDataset_PersistsIsSavedFalse()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());

          var summary = await service.CreateAsync(new CreateDatasetRequest(1, "", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), null, IsSaved: false));

          Assert.False(summary.IsSaved);
          var stored = await context.Datasets.FirstAsync(d => d.Id == summary.Id);
          Assert.False(stored.IsSaved);
      }

      [Fact]
      public async Task DeleteAsync_RemovesTheDataset()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());
          var created = await service.CreateAsync(new CreateDatasetRequest(1, "Reports Table", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), null));

          await service.DeleteAsync(created.Id);

          Assert.Equal(0, await context.Datasets.CountAsync(d => d.Id == created.Id));
      }

      [Fact]
      public async Task DeleteAsync_NotFound_Throws()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());

          await Assert.ThrowsAsync<InvalidOperationException>(() => service.DeleteAsync(999));
      }

      [Fact]
      public async Task PromoteAsync_SetsNameAndFlipsIsSavedToTrue()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var created = await service.CreateAsync(new CreateDatasetRequest(1, "", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), null, IsSaved: false));

          var promoted = await service.PromoteAsync(created.Id, "Quarterly Sales");

          Assert.Equal("Quarterly Sales", promoted.Name);
          Assert.True(promoted.IsSaved);
      }

      [Fact]
      public async Task PromoteAsync_NotFound_Throws()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());

          await Assert.ThrowsAsync<InvalidOperationException>(() => service.PromoteAsync(999, "Name"));
      }
  ```

- [ ] Step 6: Run the new tests to confirm they fail to compile/fail (the service doesn't have `DeleteAsync`/`PromoteAsync`/`IsSaved` handling yet):
  ```
  dotnet test Backend.Tests --filter "FullyQualifiedName~DatasetServiceTests"
  ```
  Expected: build error (missing members) — confirms the tests are exercising code that doesn't exist yet.

- [ ] Step 7: Modify `backend/Services/Datasets/DatasetService.cs` — apply these changes to the existing file: change `DefaultRowLimit` to `10000`; in `CreateAsync`, add `IsSaved = request.IsSaved` to the `new Dataset { ... }` initializer; in `ListAsync`, add `&& d.IsSaved` to the `Where` clause; in `ToSummary`, add `dataset.IsSaved` as the 7th positional argument; add the two new methods. The full changed regions:
  ```csharp
      private const int DefaultRowLimit = 10000;
  ```
  ```csharp
      public async Task<DatasetSummary> CreateAsync(CreateDatasetRequest request)
      {
          var connection = await GetConnectionAsync(request.DataSourceConnectionId);
          ValidateModeMatchesConnectionType(request.Mode, connection.Type);

          var now = DateTime.UtcNow;
          var dataset = new Dataset
          {
              DataSourceConnectionId = request.DataSourceConnectionId,
              Name = request.Name,
              Description = request.Description,
              Mode = request.Mode,
              Definition = request.DefinitionJson,
              RowLimit = request.RowLimit,
              IsSaved = request.IsSaved,
              Columns = "[]",
              CreatedAtUtc = now,
              UpdatedAtUtc = now
          };

          _context.Datasets.Add(dataset);
          await _context.SaveChangesAsync();

          return ToSummary(dataset);
      }

      public async Task<IReadOnlyList<DatasetSummary>> ListAsync(int connectionId)
      {
          var datasets = await _context.Datasets
              .Where(d => d.DataSourceConnectionId == connectionId && d.IsSaved)
              .ToListAsync();

          return datasets.Select(ToSummary).ToList();
      }
  ```
  ```csharp
      public async Task DeleteAsync(int id)
      {
          var dataset = await GetDatasetAsync(id);
          _context.Datasets.Remove(dataset);
          await _context.SaveChangesAsync();
      }

      public async Task<DatasetSummary> PromoteAsync(int id, string name)
      {
          var dataset = await GetDatasetAsync(id);
          dataset.Name = name;
          dataset.IsSaved = true;
          dataset.UpdatedAtUtc = DateTime.UtcNow;
          await _context.SaveChangesAsync();

          return ToSummary(dataset);
      }
  ```
  ```csharp
      private static DatasetSummary ToSummary(Dataset dataset)
      {
          var columns = JsonSerializer.Deserialize<IReadOnlyList<ColumnDescriptor>>(dataset.Columns) ?? new List<ColumnDescriptor>();
          return new DatasetSummary(
              dataset.Id,
              dataset.DataSourceConnectionId,
              dataset.Name,
              dataset.Description,
              dataset.Mode,
              dataset.RowLimit,
              dataset.IsSaved,
              columns,
              dataset.CreatedAtUtc,
              dataset.UpdatedAtUtc);
      }
  ```

- [ ] Step 8: Run the tests again:
  ```
  dotnet test Backend.Tests --filter "FullyQualifiedName~DatasetServiceTests"
  ```
  Expected: all pass, including the pre-existing tests in this file (`ExecuteAsync_UsesDefaultRowLimitWhenDatasetRowLimitIsNull` still passes — it never asserted the literal `1000` value, only that execution succeeds).

- [ ] Step 9: Modify `backend/Controllers/DatasetsController.cs` — change the `Create` action's service call and add two new actions:
  ```csharp
      [HttpPost]
      public async Task<ActionResult<DatasetSummary>> Create(CreateDatasetRequest request)
      {
          if (string.IsNullOrWhiteSpace(request.Name))
          {
              return BadRequest("Name is required.");
          }

          try
          {
              var summary = await _service.CreateAsync(request with { IsSaved = true });
              return Created($"/api/datasets/{summary.Id}", summary);
          }
          catch (InvalidOperationException ex)
          {
              return BadRequest(ex.Message);
          }
      }
  ```
  ```csharp
      [HttpDelete("{id}")]
      public async Task<IActionResult> Delete(int id)
      {
          try
          {
              await _service.DeleteAsync(id);
              return NoContent();
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
      }

      [HttpPost("{id}/promote")]
      public async Task<ActionResult<DatasetSummary>> Promote(int id, PromoteDatasetRequest request)
      {
          if (string.IsNullOrWhiteSpace(request.Name))
          {
              return BadRequest("Name is required.");
          }

          try
          {
              return Ok(await _service.PromoteAsync(id, request.Name!));
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
      }
  ```
  (Every HTTP-bound `Create` call now always persists `IsSaved = true`, regardless of what the request body contains — see Global Constraints.)

- [ ] Step 10: Run the full backend test suite:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass.

- [ ] Step 11: Commit:
  ```
  git add backend/Services/Datasets backend/Controllers/DatasetsController.cs Backend.Tests/DatasetServiceTests.cs
  git commit -m "backend: Dataset IsSaved, 10000 default row limit, DeleteAsync, PromoteAsync"
  ```

---

### Task 4: `ReportPage` CRUD service + controller

**Files:**
- Create: `backend/Services/ReportPages/ReportPageSummary.cs`
- Create: `backend/Services/ReportPages/CreateReportPageRequest.cs`
- Create: `backend/Services/ReportPages/UpdateReportPageRequest.cs`
- Create: `backend/Services/ReportPages/LastPageDeletionException.cs`
- Create: `backend/Services/ReportPages/IReportPageService.cs`
- Create: `backend/Services/ReportPages/ReportPageService.cs`
- Create: `backend/Controllers/ReportPagesController.cs`
- Modify: `backend/Program.cs`
- Test: `Backend.Tests/ReportPageServiceTests.cs`
- Test: `Backend.Tests/ReportPagesControllerTests.cs`

**Interfaces:**
- Consumes: `Backend.Models.ReportPage` (Task 1).
- Produces: `ReportPageSummary(int Id, int ReportId, string Name, int SortOrder, string FilterState)`. `IReportPageService.CreateAsync(int reportId, CreateReportPageRequest request)` — Task 5's `ReportService.CreateAsync` calls this to create a new report's first page. `IReportPageService.GetPagesAsync(int reportId)`, `UpdateAsync(int reportId, int pageId, UpdateReportPageRequest request)`, `DeleteAsync(int reportId, int pageId)` (throws `LastPageDeletionException` — mapped to 409 — when it's the report's only remaining page).

- [ ] Step 1: Create `backend/Services/ReportPages/ReportPageSummary.cs`:
  ```csharp
  namespace Backend.Services.ReportPages;

  public record ReportPageSummary(int Id, int ReportId, string Name, int SortOrder, string FilterState);
  ```

- [ ] Step 2: Create `backend/Services/ReportPages/CreateReportPageRequest.cs`:
  ```csharp
  namespace Backend.Services.ReportPages;

  public record CreateReportPageRequest(string? Name);
  ```

- [ ] Step 3: Create `backend/Services/ReportPages/UpdateReportPageRequest.cs`:
  ```csharp
  namespace Backend.Services.ReportPages;

  public record UpdateReportPageRequest(string? Name, int? SortOrder, string? FilterState);
  ```

- [ ] Step 4: Create `backend/Services/ReportPages/LastPageDeletionException.cs`:
  ```csharp
  namespace Backend.Services.ReportPages;

  public class LastPageDeletionException : Exception
  {
      public LastPageDeletionException(string message) : base(message)
      {
      }
  }
  ```

- [ ] Step 5: Create `backend/Services/ReportPages/IReportPageService.cs`:
  ```csharp
  namespace Backend.Services.ReportPages;

  public interface IReportPageService
  {
      Task<IReadOnlyList<ReportPageSummary>> GetPagesAsync(int reportId);

      Task<ReportPageSummary> CreateAsync(int reportId, CreateReportPageRequest request);

      Task<ReportPageSummary> UpdateAsync(int reportId, int pageId, UpdateReportPageRequest request);

      Task DeleteAsync(int reportId, int pageId);
  }
  ```

- [ ] Step 6: Write the failing tests first — create `Backend.Tests/ReportPageServiceTests.cs`:
  ```csharp
  using Backend.Data;
  using Backend.Models;
  using Backend.Services.ReportPages;
  using Microsoft.EntityFrameworkCore;
  using Xunit;

  namespace Backend.Tests;

  public class ReportPageServiceTests
  {
      private static (IReportPageService Service, ReportingDbContext Context) CreateService(string databaseName)
      {
          var options = new DbContextOptionsBuilder<ReportingDbContext>()
              .UseInMemoryDatabase(databaseName)
              .Options;

          var context = new ReportingDbContext(options);
          context.Database.EnsureCreated();

          var service = new ReportPageService(context);
          return (service, context);
      }

      [Fact]
      public async Task GetPagesAsync_ReportNotFound_Throws()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());

          await Assert.ThrowsAsync<InvalidOperationException>(() => service.GetPagesAsync(999));
      }

      [Fact]
      public async Task CreateAsync_FirstPageForAReport_DefaultsNameAndSortOrderZero()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());

          var page = await service.CreateAsync(1, new CreateReportPageRequest(null));

          Assert.Equal("Page 1", page.Name);
          Assert.Equal(0, page.SortOrder);
          Assert.Equal("{}", page.FilterState);
      }

      [Fact]
      public async Task CreateAsync_SecondPage_IncrementsSortOrderAndDefaultName()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          await service.CreateAsync(1, new CreateReportPageRequest(null));

          var second = await service.CreateAsync(1, new CreateReportPageRequest(null));

          Assert.Equal("Page 2", second.Name);
          Assert.Equal(1, second.SortOrder);
      }

      [Fact]
      public async Task CreateAsync_ExplicitName_IsUsedVerbatim()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());

          var page = await service.CreateAsync(1, new CreateReportPageRequest("Executive Summary"));

          Assert.Equal("Executive Summary", page.Name);
      }

      [Fact]
      public async Task UpdateAsync_RenamesAndSetsFilterState()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var page = await service.CreateAsync(1, new CreateReportPageRequest(null));

          var updated = await service.UpdateAsync(1, page.Id, new UpdateReportPageRequest("Renamed", null, "{\"Region\":[\"North\"]}"));

          Assert.Equal("Renamed", updated.Name);
          Assert.Equal("{\"Region\":[\"North\"]}", updated.FilterState);
      }

      [Fact]
      public async Task DeleteAsync_LastRemainingPage_ThrowsLastPageDeletionException()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var page = await service.CreateAsync(1, new CreateReportPageRequest(null));

          await Assert.ThrowsAsync<LastPageDeletionException>(() => service.DeleteAsync(1, page.Id));
      }

      [Fact]
      public async Task DeleteAsync_OneOfSeveralPages_RemovesItAndLeavesTheOthers()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var first = await service.CreateAsync(1, new CreateReportPageRequest(null));
          await service.CreateAsync(1, new CreateReportPageRequest(null));

          await service.DeleteAsync(1, first.Id);

          var remaining = await service.GetPagesAsync(1);
          Assert.Single(remaining);
      }

      [Fact]
      public async Task DeleteAsync_AlsoRemovesThatPagesWidgetsAndBindings()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());
          var first = await service.CreateAsync(1, new CreateReportPageRequest(null));
          await service.CreateAsync(1, new CreateReportPageRequest(null));
          var widget = new Widget { ReportPageId = first.Id, Type = WidgetType.Text, Title = "Note", Content = "hi" };
          context.Widgets.Add(widget);
          await context.SaveChangesAsync();

          await service.DeleteAsync(1, first.Id);

          Assert.Equal(0, await context.Widgets.CountAsync(w => w.ReportPageId == first.Id));
      }
  }
  ```

- [ ] Step 7: Run the tests to confirm they fail to build (no `ReportPageService` yet):
  ```
  dotnet test Backend.Tests --filter "FullyQualifiedName~ReportPageServiceTests"
  ```
  Expected: build error.

- [ ] Step 8: Create `backend/Services/ReportPages/ReportPageService.cs`:
  ```csharp
  using Backend.Data;
  using Backend.Models;
  using Microsoft.EntityFrameworkCore;

  namespace Backend.Services.ReportPages;

  public class ReportPageService : IReportPageService
  {
      private readonly ReportingDbContext _context;

      public ReportPageService(ReportingDbContext context)
      {
          _context = context;
      }

      public async Task<IReadOnlyList<ReportPageSummary>> GetPagesAsync(int reportId)
      {
          await EnsureReportExistsAsync(reportId);

          var pages = await _context.ReportPages
              .Where(p => p.ReportId == reportId)
              .OrderBy(p => p.SortOrder)
              .ToListAsync();

          return pages.Select(ToSummary).ToList();
      }

      public async Task<ReportPageSummary> CreateAsync(int reportId, CreateReportPageRequest request)
      {
          await EnsureReportExistsAsync(reportId);

          var existing = await _context.ReportPages.Where(p => p.ReportId == reportId).ToListAsync();
          var sortOrder = existing.Count == 0 ? 0 : existing.Max(p => p.SortOrder) + 1;
          var name = string.IsNullOrWhiteSpace(request.Name) ? $"Page {existing.Count + 1}" : request.Name!;

          var page = new ReportPage { ReportId = reportId, Name = name, SortOrder = sortOrder, FilterState = "{}" };
          _context.ReportPages.Add(page);
          await _context.SaveChangesAsync();

          return ToSummary(page);
      }

      public async Task<ReportPageSummary> UpdateAsync(int reportId, int pageId, UpdateReportPageRequest request)
      {
          await EnsureReportExistsAsync(reportId);
          var page = await GetPageEntityAsync(reportId, pageId);

          if (request.Name != null)
          {
              page.Name = request.Name;
          }

          if (request.SortOrder.HasValue)
          {
              page.SortOrder = request.SortOrder.Value;
          }

          if (request.FilterState != null)
          {
              page.FilterState = request.FilterState;
          }

          await _context.SaveChangesAsync();
          return ToSummary(page);
      }

      public async Task DeleteAsync(int reportId, int pageId)
      {
          await EnsureReportExistsAsync(reportId);
          var page = await GetPageEntityAsync(reportId, pageId);

          var remainingCount = await _context.ReportPages.CountAsync(p => p.ReportId == reportId);
          if (remainingCount <= 1)
          {
              throw new LastPageDeletionException("A report needs at least one page.");
          }

          var widgetIds = await _context.Widgets.Where(w => w.ReportPageId == pageId).Select(w => w.Id).ToListAsync();
          var bindings = await _context.WidgetBindings.Where(b => widgetIds.Contains(b.WidgetId)).ToListAsync();
          var widgets = await _context.Widgets.Where(w => w.ReportPageId == pageId).ToListAsync();

          _context.WidgetBindings.RemoveRange(bindings);
          _context.Widgets.RemoveRange(widgets);
          _context.ReportPages.Remove(page);
          await _context.SaveChangesAsync();
      }

      private async Task EnsureReportExistsAsync(int reportId)
      {
          var exists = await _context.Reports.AnyAsync(r => r.Id == reportId);
          if (!exists)
          {
              throw new InvalidOperationException($"No report found with id {reportId}.");
          }
      }

      private async Task<ReportPage> GetPageEntityAsync(int reportId, int pageId)
      {
          var page = await _context.ReportPages.FirstOrDefaultAsync(p => p.Id == pageId && p.ReportId == reportId);
          if (page is null)
          {
              throw new InvalidOperationException($"No page found with id {pageId} on report {reportId}.");
          }

          return page;
      }

      private static ReportPageSummary ToSummary(ReportPage page) =>
          new(page.Id, page.ReportId, page.Name, page.SortOrder, page.FilterState);
  }
  ```

- [ ] Step 9: Run the tests:
  ```
  dotnet test Backend.Tests --filter "FullyQualifiedName~ReportPageServiceTests"
  ```
  Expected: all pass. Note: `GetPagesAsync_ReportNotFound_Throws` and the widget/binding cleanup test rely on `_context.Reports`/`_context.Widgets` directly — no seeded `Report` row is needed for the "not found" case (id `999` never exists), and the other tests use report id `1`, which the `ReportingDbContextModelSnapshot`'s seed data (Task 1) already provides via `context.Database.EnsureCreated()`.

- [ ] Step 10: Write the failing controller tests first — create `Backend.Tests/ReportPagesControllerTests.cs`:
  ```csharp
  using Backend.Controllers;
  using Backend.Data;
  using Backend.Services.ReportPages;
  using Microsoft.AspNetCore.Mvc;
  using Microsoft.EntityFrameworkCore;
  using Xunit;

  namespace Backend.Tests;

  public class ReportPagesControllerTests
  {
      private static ReportPagesController CreateController(string databaseName)
      {
          var options = new DbContextOptionsBuilder<ReportingDbContext>()
              .UseInMemoryDatabase(databaseName)
              .Options;

          var context = new ReportingDbContext(options);
          context.Database.EnsureCreated();

          return new ReportPagesController(new ReportPageService(context));
      }

      [Fact]
      public async Task GetPages_ReportNotFound_Returns404()
      {
          var controller = CreateController(Guid.NewGuid().ToString());

          var result = await controller.GetPages(999);

          Assert.IsType<NotFoundObjectResult>(result.Result);
      }

      [Fact]
      public async Task Create_ValidRequest_Returns201()
      {
          var controller = CreateController(Guid.NewGuid().ToString());

          var result = await controller.Create(1, new CreateReportPageRequest("Overview"));

          Assert.IsType<CreatedResult>(result.Result);
      }

      [Fact]
      public async Task Delete_LastPage_Returns409()
      {
          var controller = CreateController(Guid.NewGuid().ToString());
          var created = await controller.Create(1, new CreateReportPageRequest(null));
          var page = (ReportPageSummary)((CreatedResult)created.Result!).Value!;

          var result = await controller.Delete(1, page.Id);

          var conflict = Assert.IsType<ConflictObjectResult>(result);
          Assert.Equal("A report needs at least one page.", conflict.Value);
      }

      [Fact]
      public async Task Delete_NotFoundPage_Returns404()
      {
          var controller = CreateController(Guid.NewGuid().ToString());

          var result = await controller.Delete(1, 999);

          Assert.IsType<NotFoundObjectResult>(result);
      }
  }
  ```

- [ ] Step 11: Run the controller tests to confirm they fail to build (no `ReportPagesController` yet):
  ```
  dotnet test Backend.Tests --filter "FullyQualifiedName~ReportPagesControllerTests"
  ```
  Expected: build error.

- [ ] Step 12: Create `backend/Controllers/ReportPagesController.cs`:
  ```csharp
  using Backend.Services.ReportPages;
  using Microsoft.AspNetCore.Mvc;

  namespace Backend.Controllers;

  [ApiController]
  [Route("api/reports/{reportId}/pages")]
  public class ReportPagesController : ControllerBase
  {
      private readonly IReportPageService _service;

      public ReportPagesController(IReportPageService service)
      {
          _service = service;
      }

      [HttpGet]
      public async Task<ActionResult<IReadOnlyList<ReportPageSummary>>> GetPages(int reportId)
      {
          try
          {
              return Ok(await _service.GetPagesAsync(reportId));
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
      }

      [HttpPost]
      public async Task<ActionResult<ReportPageSummary>> Create(int reportId, CreateReportPageRequest request)
      {
          try
          {
              var summary = await _service.CreateAsync(reportId, request);
              return Created($"/api/reports/{reportId}/pages/{summary.Id}", summary);
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
      }

      [HttpPut("{pageId}")]
      public async Task<ActionResult<ReportPageSummary>> Update(int reportId, int pageId, UpdateReportPageRequest request)
      {
          try
          {
              return Ok(await _service.UpdateAsync(reportId, pageId, request));
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
      }

      [HttpDelete("{pageId}")]
      public async Task<IActionResult> Delete(int reportId, int pageId)
      {
          try
          {
              await _service.DeleteAsync(reportId, pageId);
              return NoContent();
          }
          catch (LastPageDeletionException ex)
          {
              return Conflict(ex.Message);
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
      }
  }
  ```
  (`LastPageDeletionException` is caught *before* `InvalidOperationException` — it isn't a subclass of it, order doesn't strictly matter here, but keeping the more specific conflict case first mirrors how `WidgetsController` orders `WidgetValidationException` before `InvalidOperationException`.)

- [ ] Step 13: Modify `backend/Program.cs` — add the DI registration (after the existing `IWidgetService` line):
  ```csharp
  builder.Services.AddScoped<IReportPageService, ReportPageService>();
  ```
  and add the using:
  ```csharp
  using Backend.Services.ReportPages;
  ```

- [ ] Step 14: Run the full backend test suite:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass.

- [ ] Step 15: Commit:
  ```
  git add backend/Services/ReportPages backend/Controllers/ReportPagesController.cs backend/Program.cs Backend.Tests/ReportPageServiceTests.cs Backend.Tests/ReportPagesControllerTests.cs
  git commit -m "backend: ReportPage CRUD service and controller"
  ```

---

### Task 5: `ReportService` (replaces `IReportRepository`) + `ReportsController` rewrite

**Files:**
- Delete: `backend/Services/IReportRepository.cs`
- Delete: `backend/Services/EfReportRepository.cs`
- Delete: `Backend.Tests/EfReportRepositoryTests.cs`
- Create: `backend/Services/Reports/ReportSummary.cs`
- Create: `backend/Services/Reports/CreateReportRequest.cs`
- Create: `backend/Services/Reports/RenameReportRequest.cs`
- Create: `backend/Services/Reports/SetReportDatasetRequest.cs`
- Create: `backend/Services/Reports/IReportService.cs`
- Create: `backend/Services/Reports/ReportService.cs`
- Modify: `backend/Controllers/ReportsController.cs`
- Modify: `backend/Program.cs`
- Create: `Backend.Tests/ReportServiceTests.cs`
- Modify: `Backend.Tests/ReportsControllerTests.cs`

**Interfaces:**
- Consumes: `IDatasetService.CreateAsync`/`DeleteAsync` (Task 3), `IReportPageService.CreateAsync` (Task 4).
- Produces: `ReportSummary(int Id, string Name, string Description, int? DatasetId)`. `IReportService` with `GetAllAsync`, `GetByIdAsync`, `CreateAsync` (creates the `Report` **and** its first `ReportPage` in one call), `RenameAsync`, `DeleteAsync` (cascades pages/widgets/bindings, conditionally deletes an unsaved Dataset), `SetDatasetAsync` (the quick-query create-or-replace flow) — every frontend task from Task 7 onward calls these through `ReportsController`.

- [ ] Step 1: Create `backend/Services/Reports/ReportSummary.cs`:
  ```csharp
  namespace Backend.Services.Reports;

  public record ReportSummary(int Id, string Name, string Description, int? DatasetId);
  ```

- [ ] Step 2: Create `backend/Services/Reports/CreateReportRequest.cs`:
  ```csharp
  namespace Backend.Services.Reports;

  public record CreateReportRequest(string? Name, string? Description);
  ```

- [ ] Step 3: Create `backend/Services/Reports/RenameReportRequest.cs`:
  ```csharp
  namespace Backend.Services.Reports;

  public record RenameReportRequest(string? Name);
  ```

- [ ] Step 4: Create `backend/Services/Reports/SetReportDatasetRequest.cs`:
  ```csharp
  using Backend.Models;

  namespace Backend.Services.Reports;

  public record SetReportDatasetRequest(int DataSourceConnectionId, DatasetMode Mode, string DefinitionJson, int? RowLimit);
  ```

- [ ] Step 5: Create `backend/Services/Reports/IReportService.cs`:
  ```csharp
  namespace Backend.Services.Reports;

  public interface IReportService
  {
      Task<IReadOnlyList<ReportSummary>> GetAllAsync();

      Task<ReportSummary> GetByIdAsync(int id);

      Task<ReportSummary> CreateAsync(CreateReportRequest request);

      Task<ReportSummary> RenameAsync(int id, RenameReportRequest request);

      Task DeleteAsync(int id);

      Task<ReportSummary> SetDatasetAsync(int id, SetReportDatasetRequest request);
  }
  ```

- [ ] Step 6: Delete the old files:
  ```
  git rm backend/Services/IReportRepository.cs backend/Services/EfReportRepository.cs Backend.Tests/EfReportRepositoryTests.cs
  ```

- [ ] Step 7: Write the failing tests first — create `Backend.Tests/ReportServiceTests.cs`:
  ```csharp
  using Backend.Data;
  using Backend.Models;
  using Backend.Services.DataSources;
  using Backend.Services.Datasets;
  using Backend.Services.ReportPages;
  using Backend.Services.Reports;
  using Microsoft.EntityFrameworkCore;
  using Xunit;

  namespace Backend.Tests;

  public class ReportServiceTests
  {
      private class PassThroughCredentialProtector : ICredentialProtector
      {
          public string Protect(string plaintext) => $"encrypted:{plaintext}";
          public string Unprotect(string protectedText) => protectedText.Replace("encrypted:", "");
      }

      private class StubSqlServerProvider : IDataSourceProvider
      {
          public DataSourceType SupportedType => DataSourceType.SqlServer;

          public Task<ConnectionTestResult> TestConnectionAsync(DataSourceConnection connection) =>
              Task.FromResult(new ConnectionTestResult(true, null));

          public Task<SchemaDescriptor> DiscoverSchemaAsync(DataSourceConnection connection) =>
              throw new NotImplementedException();

          public Task<QueryResult> ExecuteQueryAsync(DataSourceConnection connection, Dataset dataset, int rowLimit, CancellationToken cancellationToken) =>
              throw new NotImplementedException();
      }

      private static (IReportService Service, ReportingDbContext Context) CreateService(string databaseName)
      {
          var options = new DbContextOptionsBuilder<ReportingDbContext>()
              .UseInMemoryDatabase(databaseName)
              .Options;

          var context = new ReportingDbContext(options);
          context.Database.EnsureCreated();
          context.DataSourceConnections.Add(new DataSourceConnection
          {
              Id = 1,
              Name = "Test SQL Source",
              Type = DataSourceType.SqlServer,
              Host = "localhost\\SQLEXPRESS",
              DatabaseName = "TestDb",
              EncryptedCredentials = "encrypted:{}",
              CreatedAtUtc = DateTime.UtcNow
          });
          context.SaveChanges();

          var datasetService = new DatasetService(context, new PassThroughCredentialProtector(), new List<IDataSourceProvider> { new StubSqlServerProvider() });
          var reportPageService = new ReportPageService(context);
          var service = new ReportService(context, datasetService, reportPageService);
          return (service, context);
      }

      [Fact]
      public async Task CreateAsync_CreatesTheReportAndItsFirstPage()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());

          var report = await service.CreateAsync(new CreateReportRequest("Churn", "Customers lost per quarter"));

          Assert.True(report.Id > 0);
          Assert.Null(report.DatasetId);
          var pages = await context.ReportPages.Where(p => p.ReportId == report.Id).ToListAsync();
          var page = Assert.Single(pages);
          Assert.Equal("Page 1", page.Name);
      }

      [Fact]
      public async Task GetByIdAsync_NotFound_Throws()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());

          await Assert.ThrowsAsync<InvalidOperationException>(() => service.GetByIdAsync(999));
      }

      [Fact]
      public async Task RenameAsync_UpdatesName()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var report = await service.CreateAsync(new CreateReportRequest("Old Name", ""));

          var renamed = await service.RenameAsync(report.Id, new RenameReportRequest("New Name"));

          Assert.Equal("New Name", renamed.Name);
      }

      [Fact]
      public async Task SetDatasetAsync_FirstTime_CreatesAnUnsavedDatasetAndLinksIt()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());
          var report = await service.CreateAsync(new CreateReportRequest("Churn", ""));

          var updated = await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 1\"}", null));

          Assert.NotNull(updated.DatasetId);
          var dataset = await context.Datasets.FirstAsync(d => d.Id == updated.DatasetId);
          Assert.False(dataset.IsSaved);
      }

      [Fact]
      public async Task SetDatasetAsync_CalledAgain_DeletesThePreviousUnsavedDataset()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());
          var report = await service.CreateAsync(new CreateReportRequest("Churn", ""));
          var first = await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 1\"}", null));
          var firstDatasetId = first.DatasetId!.Value;

          await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 2\"}", null));

          Assert.Equal(0, await context.Datasets.CountAsync(d => d.Id == firstDatasetId));
      }

      [Fact]
      public async Task SetDatasetAsync_CalledAgain_KeepsThePreviousDatasetIfItWasPromoted()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());
          var report = await service.CreateAsync(new CreateReportRequest("Churn", ""));
          var first = await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 1\"}", null));
          var firstDataset = await context.Datasets.FirstAsync(d => d.Id == first.DatasetId!.Value);
          firstDataset.IsSaved = true;
          await context.SaveChangesAsync();

          await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 2\"}", null));

          Assert.Equal(1, await context.Datasets.CountAsync(d => d.Id == firstDataset.Id));
      }

      [Fact]
      public async Task DeleteAsync_RemovesReportPagesWidgetsBindings_AndUnsavedDataset()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());
          var report = await service.CreateAsync(new CreateReportRequest("Churn", ""));
          var updated = await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 1\"}", null));
          var page = await context.ReportPages.FirstAsync(p => p.ReportId == report.Id);
          var widget = new Widget { ReportPageId = page.Id, Type = WidgetType.Text, Title = "Note" };
          context.Widgets.Add(widget);
          await context.SaveChangesAsync();

          await service.DeleteAsync(report.Id);

          Assert.Equal(0, await context.Reports.CountAsync(r => r.Id == report.Id));
          Assert.Equal(0, await context.ReportPages.CountAsync(p => p.ReportId == report.Id));
          Assert.Equal(0, await context.Widgets.CountAsync(w => w.ReportPageId == page.Id));
          Assert.Equal(0, await context.Datasets.CountAsync(d => d.Id == updated.DatasetId));
      }

      [Fact]
      public async Task DeleteAsync_KeepsASavedDataset()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());
          var report = await service.CreateAsync(new CreateReportRequest("Churn", ""));
          var updated = await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 1\"}", null));
          var dataset = await context.Datasets.FirstAsync(d => d.Id == updated.DatasetId);
          dataset.IsSaved = true;
          await context.SaveChangesAsync();

          await service.DeleteAsync(report.Id);

          Assert.Equal(1, await context.Datasets.CountAsync(d => d.Id == dataset.Id));
      }
  }
  ```

- [ ] Step 8: Run the tests to confirm they fail to build (no `ReportService` yet):
  ```
  dotnet test Backend.Tests --filter "FullyQualifiedName~ReportServiceTests"
  ```
  Expected: build error.

- [ ] Step 9: Create `backend/Services/Reports/ReportService.cs`:
  ```csharp
  using Backend.Data;
  using Backend.Models;
  using Backend.Services.Datasets;
  using Backend.Services.ReportPages;
  using Microsoft.EntityFrameworkCore;

  namespace Backend.Services.Reports;

  public class ReportService : IReportService
  {
      private readonly ReportingDbContext _context;
      private readonly IDatasetService _datasetService;
      private readonly IReportPageService _reportPageService;

      public ReportService(ReportingDbContext context, IDatasetService datasetService, IReportPageService reportPageService)
      {
          _context = context;
          _datasetService = datasetService;
          _reportPageService = reportPageService;
      }

      public async Task<IReadOnlyList<ReportSummary>> GetAllAsync()
      {
          var reports = await _context.Reports.ToListAsync();
          return reports.Select(ToSummary).ToList();
      }

      public async Task<ReportSummary> GetByIdAsync(int id)
      {
          var report = await GetReportEntityAsync(id);
          return ToSummary(report);
      }

      public async Task<ReportSummary> CreateAsync(CreateReportRequest request)
      {
          var report = new Report { Name = request.Name!, Description = request.Description ?? "" };
          _context.Reports.Add(report);
          await _context.SaveChangesAsync();

          await _reportPageService.CreateAsync(report.Id, new CreateReportPageRequest(null));

          return ToSummary(report);
      }

      public async Task<ReportSummary> RenameAsync(int id, RenameReportRequest request)
      {
          var report = await GetReportEntityAsync(id);
          report.Name = request.Name!;
          await _context.SaveChangesAsync();
          return ToSummary(report);
      }

      public async Task<ReportSummary> SetDatasetAsync(int id, SetReportDatasetRequest request)
      {
          var report = await GetReportEntityAsync(id);
          var previousDatasetId = report.DatasetId;

          var created = await _datasetService.CreateAsync(new CreateDatasetRequest(
              request.DataSourceConnectionId, "", null, request.Mode, request.DefinitionJson, request.RowLimit, IsSaved: false));

          report.DatasetId = created.Id;
          await _context.SaveChangesAsync();

          if (previousDatasetId.HasValue && previousDatasetId.Value != created.Id)
          {
              var previous = await _context.Datasets.FirstOrDefaultAsync(d => d.Id == previousDatasetId.Value);
              if (previous != null && !previous.IsSaved)
              {
                  await _datasetService.DeleteAsync(previous.Id);
              }
          }

          return ToSummary(report);
      }

      public async Task DeleteAsync(int id)
      {
          var report = await GetReportEntityAsync(id);

          var pageIds = await _context.ReportPages.Where(p => p.ReportId == id).Select(p => p.Id).ToListAsync();
          var widgetIds = await _context.Widgets.Where(w => pageIds.Contains(w.ReportPageId)).Select(w => w.Id).ToListAsync();
          var bindings = await _context.WidgetBindings.Where(b => widgetIds.Contains(b.WidgetId)).ToListAsync();
          var widgets = await _context.Widgets.Where(w => pageIds.Contains(w.ReportPageId)).ToListAsync();
          var pages = await _context.ReportPages.Where(p => p.ReportId == id).ToListAsync();

          _context.WidgetBindings.RemoveRange(bindings);
          _context.Widgets.RemoveRange(widgets);
          _context.ReportPages.RemoveRange(pages);

          var datasetId = report.DatasetId;
          _context.Reports.Remove(report);
          await _context.SaveChangesAsync();

          if (datasetId.HasValue)
          {
              var dataset = await _context.Datasets.FirstOrDefaultAsync(d => d.Id == datasetId.Value);
              if (dataset != null && !dataset.IsSaved)
              {
                  await _datasetService.DeleteAsync(dataset.Id);
              }
          }
      }

      private async Task<Report> GetReportEntityAsync(int id)
      {
          var report = await _context.Reports.FirstOrDefaultAsync(r => r.Id == id);
          if (report is null)
          {
              throw new InvalidOperationException($"No report found with id {id}.");
          }

          return report;
      }

      private static ReportSummary ToSummary(Report report) =>
          new(report.Id, report.Name, report.Description, report.DatasetId);
  }
  ```

- [ ] Step 10: Run the tests:
  ```
  dotnet test Backend.Tests --filter "FullyQualifiedName~ReportServiceTests"
  ```
  Expected: all pass.

- [ ] Step 11: Modify `backend/Controllers/ReportsController.cs` — full file after the change:
  ```csharp
  using Backend.Services.Reports;
  using Microsoft.AspNetCore.Mvc;

  namespace Backend.Controllers;

  [ApiController]
  [Route("api/reports")]
  public class ReportsController : ControllerBase
  {
      private readonly IReportService _service;

      public ReportsController(IReportService service)
      {
          _service = service;
      }

      [HttpGet]
      public async Task<ActionResult<IEnumerable<ReportSummary>>> GetAll()
      {
          return Ok(await _service.GetAllAsync());
      }

      [HttpGet("{id}")]
      public async Task<ActionResult<ReportSummary>> GetById(int id)
      {
          try
          {
              return Ok(await _service.GetByIdAsync(id));
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
      }

      [HttpPost]
      public async Task<ActionResult<ReportSummary>> Create(CreateReportRequest request)
      {
          if (string.IsNullOrWhiteSpace(request.Name))
          {
              return BadRequest("Name is required.");
          }

          var report = await _service.CreateAsync(request);
          return Created($"/api/reports/{report.Id}", report);
      }

      [HttpPut("{id}")]
      public async Task<ActionResult<ReportSummary>> Rename(int id, RenameReportRequest request)
      {
          if (string.IsNullOrWhiteSpace(request.Name))
          {
              return BadRequest("Name is required.");
          }

          try
          {
              return Ok(await _service.RenameAsync(id, request));
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
      }

      [HttpDelete("{id}")]
      public async Task<IActionResult> Delete(int id)
      {
          try
          {
              await _service.DeleteAsync(id);
              return NoContent();
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
      }

      [HttpPut("{id}/dataset")]
      public async Task<ActionResult<ReportSummary>> SetDataset(int id, SetReportDatasetRequest request)
      {
          try
          {
              return Ok(await _service.SetDatasetAsync(id, request));
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
      }
  }
  ```
  (`SetDataset` maps every `InvalidOperationException` — whether it's "report not found" from `ReportService` itself, or "connection not found"/"mode mismatch" bubbling up from the underlying `DatasetService.CreateAsync` call — to 404, consistent with how `WidgetsController` treats every not-found-shaped failure on a nested resource. This mirrors a pre-existing, unfixed imprecision already in `DatasetsController` itself from Milestone 2/3 — not a new problem introduced here, and out of scope to fix now.)

- [ ] Step 12: Modify `backend/Program.cs` — replace the old registration and add new ones:
  ```csharp
  builder.Services.AddScoped<IReportService, ReportService>();
  ```
  (remove the line `builder.Services.AddScoped<IReportRepository, EfReportRepository>();` and its now-unused `using Backend.Services;` if nothing else in the file needs it — check first, `DecimalAsStringJsonConverter` also lives in `Backend.Services` namespace but `Program.cs` doesn't reference it by name, only via `AddJsonOptions`, so confirm whether the bare `using Backend.Services;` is still needed before removing it), and add:
  ```csharp
  using Backend.Services.Reports;
  ```

- [ ] Step 13: Modify `Backend.Tests/ReportsControllerTests.cs` — full file after the change:
  ```csharp
  using Backend.Controllers;
  using Backend.Data;
  using Backend.Services.DataSources;
  using Backend.Services.Datasets;
  using Backend.Services.ReportPages;
  using Backend.Services.Reports;
  using Microsoft.AspNetCore.Mvc;
  using Microsoft.EntityFrameworkCore;

  namespace Backend.Tests;

  public class ReportsControllerTests
  {
      private class NoOpCredentialProtector : ICredentialProtector
      {
          public string Protect(string plaintext) => plaintext;
          public string Unprotect(string protectedText) => protectedText;
      }

      private static ReportsController CreateController(string databaseName)
      {
          var options = new DbContextOptionsBuilder<ReportingDbContext>()
              .UseInMemoryDatabase(databaseName)
              .Options;

          var context = new ReportingDbContext(options);
          context.Database.EnsureCreated();

          var datasetService = new DatasetService(context, new NoOpCredentialProtector(), new List<IDataSourceProvider>());
          var reportPageService = new ReportPageService(context);
          var service = new ReportService(context, datasetService, reportPageService);
          return new ReportsController(service);
      }

      [Fact]
      public async Task GetAll_ReturnsOkWithSeededReports()
      {
          var controller = CreateController(Guid.NewGuid().ToString());

          var result = await controller.GetAll();

          var ok = Assert.IsType<OkObjectResult>(result.Result);
          var reports = Assert.IsAssignableFrom<IEnumerable<ReportSummary>>(ok.Value);
          Assert.NotEmpty(reports);
      }

      [Fact]
      public async Task GetById_NotFound_Returns404()
      {
          var controller = CreateController(Guid.NewGuid().ToString());

          var result = await controller.GetById(999);

          Assert.IsType<NotFoundObjectResult>(result.Result);
      }

      [Fact]
      public async Task Create_BlankName_Returns400()
      {
          var controller = CreateController(Guid.NewGuid().ToString());

          var result = await controller.Create(new CreateReportRequest("   ", "whatever"));

          Assert.IsType<BadRequestObjectResult>(result.Result);
      }

      [Fact]
      public async Task Create_NullName_Returns400()
      {
          var controller = CreateController(Guid.NewGuid().ToString());

          var result = await controller.Create(new CreateReportRequest(null, null));

          Assert.IsType<BadRequestObjectResult>(result.Result);
      }

      [Fact]
      public async Task Create_ValidInput_Returns201WithTheReport()
      {
          var controller = CreateController(Guid.NewGuid().ToString());

          var result = await controller.Create(new CreateReportRequest("Churn", "Customers lost per quarter"));

          var created = Assert.IsType<CreatedResult>(result.Result);
          var report = Assert.IsType<ReportSummary>(created.Value);
          Assert.Equal("Churn", report.Name);
          Assert.Null(report.DatasetId);
      }

      [Fact]
      public async Task Rename_BlankName_Returns400()
      {
          var controller = CreateController(Guid.NewGuid().ToString());
          var created = await controller.Create(new CreateReportRequest("Churn", ""));
          var report = (ReportSummary)((CreatedResult)created.Result!).Value!;

          var result = await controller.Rename(report.Id, new RenameReportRequest("   "));

          Assert.IsType<BadRequestObjectResult>(result.Result);
      }

      [Fact]
      public async Task Delete_ThenGetById_Returns404()
      {
          var controller = CreateController(Guid.NewGuid().ToString());
          var created = await controller.Create(new CreateReportRequest("Churn", ""));
          var report = (ReportSummary)((CreatedResult)created.Result!).Value!;

          await controller.Delete(report.Id);
          var result = await controller.GetById(report.Id);

          Assert.IsType<NotFoundObjectResult>(result.Result);
      }
  }
  ```

- [ ] Step 14: Run the full backend test suite:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass.

- [ ] Step 15: Commit:
  ```
  git add backend/Services/Reports backend/Controllers/ReportsController.cs backend/Program.cs Backend.Tests/ReportServiceTests.cs Backend.Tests/ReportsControllerTests.cs
  git commit -m "backend: replace IReportRepository with ReportService (GetById, Rename, Delete, SetDataset)"
  ```

---

### Task 6: `WidgetBindingValidator` cardinality rules for the 5 new widget types

**Files:**
- Modify: `backend/Services/Widgets/WidgetBindingValidator.cs`
- Test: `Backend.Tests/WidgetBindingValidatorTests.cs`

**Interfaces:**
- Consumes: `WidgetType.StackedColumn/ClusteredBar/Area/Donut/Scatter` (Task 1).
- Produces: fully validated cardinality rules for all 11 widget types — no later task adds any more `WidgetBindingValidator` cases.

- [ ] Step 1: Write the failing tests first — append to `Backend.Tests/WidgetBindingValidatorTests.cs` (replacing the placeholder `Validate_StillUnroutedNewWidgetType_FailsAsUnknown` test from Task 1, which was only ever a temporary marker):
  ```csharp
      [Fact]
      public void Validate_StackedColumnWithNoCategoryField_Fails()
      {
          var binding = new SaveWidgetBindingRequest(null, new List<string> { "Revenue" }, null);

          var result = _validator.Validate(WidgetType.StackedColumn, binding);

          Assert.False(result.IsValid);
          Assert.Equal("This widget type requires a CategoryField.", result.Error);
      }

      [Fact]
      public void Validate_ClusteredBarWithCategoryAndValues_Succeeds()
      {
          var binding = new SaveWidgetBindingRequest("Region", new List<string> { "Revenue" }, null);

          var result = _validator.Validate(WidgetType.ClusteredBar, binding);

          Assert.True(result.IsValid);
      }

      [Fact]
      public void Validate_AreaWithNoValueFields_Fails()
      {
          var binding = new SaveWidgetBindingRequest("Month", new List<string>(), null);

          var result = _validator.Validate(WidgetType.Area, binding);

          Assert.False(result.IsValid);
          Assert.Equal("This widget type requires at least one ValueField.", result.Error);
      }

      [Fact]
      public void Validate_DonutWithTwoValueFields_Fails()
      {
          var binding = new SaveWidgetBindingRequest("Region", new List<string> { "Revenue", "Cost" }, null);

          var result = _validator.Validate(WidgetType.Donut, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Pie widgets must have exactly one ValueField.", result.Error);
      }

      [Fact]
      public void Validate_ScatterWithExactlyTwoValueFieldsAndNoCategory_Succeeds()
      {
          var binding = new SaveWidgetBindingRequest(null, new List<string> { "Sales", "Profit" }, null);

          var result = _validator.Validate(WidgetType.Scatter, binding);

          Assert.True(result.IsValid);
      }

      [Fact]
      public void Validate_ScatterWithCategoryField_StillSucceeds()
      {
          // CategoryField is optional for Scatter — a "Details" grouping field, not a shared axis.
          var binding = new SaveWidgetBindingRequest("Segment", new List<string> { "Sales", "Profit" }, null);

          var result = _validator.Validate(WidgetType.Scatter, binding);

          Assert.True(result.IsValid);
      }

      [Fact]
      public void Validate_ScatterWithOneValueField_Fails()
      {
          var binding = new SaveWidgetBindingRequest(null, new List<string> { "Sales" }, null);

          var result = _validator.Validate(WidgetType.Scatter, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Scatter widgets must have exactly two ValueFields (X then Y).", result.Error);
      }

      [Fact]
      public void Validate_ScatterWithThreeValueFields_Fails()
      {
          var binding = new SaveWidgetBindingRequest(null, new List<string> { "Sales", "Profit", "Units" }, null);

          var result = _validator.Validate(WidgetType.Scatter, binding);

          Assert.False(result.IsValid);
          Assert.Equal("Scatter widgets must have exactly two ValueFields (X then Y).", result.Error);
      }
  ```
  Also delete the now-superseded `Validate_StillUnroutedNewWidgetType_FailsAsUnknown` test method from Task 1 — it asserted `WidgetType.Scatter` falls through to "Unknown widget type," which is about to become false.

- [ ] Step 2: Run the tests to confirm the new ones fail (Scatter still falls through to "Unknown widget type", the others still fail on the old error message or lack thereof):
  ```
  dotnet test Backend.Tests --filter "FullyQualifiedName~WidgetBindingValidatorTests"
  ```
  Expected: several failures.

- [ ] Step 3: Modify `backend/Services/Widgets/WidgetBindingValidator.cs` — full file after the change:
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
              WidgetType.Donut => ValidatePie(binding),
              WidgetType.Bar => ValidateCategoryPlusValues(binding),
              WidgetType.ClusteredBar => ValidateCategoryPlusValues(binding),
              WidgetType.StackedColumn => ValidateCategoryPlusValues(binding),
              WidgetType.Line => ValidateCategoryPlusValues(binding),
              WidgetType.Area => ValidateCategoryPlusValues(binding),
              WidgetType.Scatter => ValidateScatter(binding),
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

      private static WidgetBindingValidationResult ValidateScatter(SaveWidgetBindingRequest binding)
      {
          if (binding.ValueFields.Count != 2)
          {
              return WidgetBindingValidationResult.Failure("Scatter widgets must have exactly two ValueFields (X then Y).");
          }

          return WidgetBindingValidationResult.Success();
      }
  }
  ```

- [ ] Step 4: Run the tests:
  ```
  dotnet test Backend.Tests --filter "FullyQualifiedName~WidgetBindingValidatorTests"
  ```
  Expected: all pass.

- [ ] Step 5: Run the full backend test suite one last time — this is the last backend-only task in the plan:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass.

- [ ] Step 6: Commit:
  ```
  git add backend/Services/Widgets/WidgetBindingValidator.cs Backend.Tests/WidgetBindingValidatorTests.cs
  git commit -m "backend: cardinality rules for StackedColumn, ClusteredBar, Area, Donut, Scatter"
  ```

---

### Task 7: Frontend API/type ripple + shared-fetch-once wiring

**Files:**
- Modify: `frontend/src/api/reports.ts`
- Create: `frontend/src/api/reportPages.ts`
- Modify: `frontend/src/api/datasets.ts`
- Modify: `frontend/src/api/widgets.ts`
- Modify: `frontend/src/widgets/widgetDraftReducer.ts`
- Test: `frontend/src/widgets/widgetDraftReducer.test.ts`
- Modify: `frontend/src/widgets/staleBindingCheck.ts`
- Test: `frontend/src/widgets/staleBindingCheck.test.ts`
- Modify: `frontend/src/widgets/WidgetBindingEditor.tsx`
- Modify: `frontend/src/widgets/WidgetRenderer.tsx`
- Test: `frontend/src/widgets/WidgetRenderer.test.tsx`
- Delete: `frontend/src/widgets/useDatasetExecute.ts`
- Delete: `frontend/src/widgets/useDatasetExecute.test.ts`
- Modify: `frontend/src/pages/ReportCanvas.tsx`
- Modify: `frontend/src/pages/ReportView.tsx`

**Interfaces:**
- Consumes: `GET /api/reports/{id}`, `PUT /api/reports/{id}/dataset`, `GET/POST/PUT/DELETE /api/reports/{reportId}/pages`, `GET/PUT /api/reportpages/{reportPageId}/widgets`, `POST /api/datasets/{id}/promote`, `DELETE /api/datasets/{id}` (Tasks 1-6).
- Produces: `WidgetBindingDraft { categoryField: string | null; valueFields: string[]; formatOptions: WidgetFormatOptions }` (drops `datasetId`) and `WidgetFormatOptions`/`DEFAULT_FORMAT_OPTIONS` (`frontend/src/api/widgets.ts`) — every later frontend task uses these exact names. `WidgetRenderer` now takes `{ widget: WidgetSummary; result: QueryResult | null }` instead of fetching its own data — Task 9's `ReportQueryContext` is what supplies `result` from here on.

- [ ] Step 1: Modify `frontend/src/api/reports.ts` — full file after the change:
  ```ts
  import axios from "axios";
  import type { DatasetMode } from "./datasets";

  export interface Report {
    id: number;
    name: string;
    description: string;
    datasetId: number | null;
  }

  export interface SetReportDatasetRequest {
    dataSourceConnectionId: number;
    mode: DatasetMode;
    definitionJson: string;
    rowLimit: number | null;
  }

  const api = axios.create({ baseURL: "http://localhost:5198/api" });

  export async function getReports(): Promise<Report[]> {
    const res = await api.get<Report[]>("/reports");
    return res.data;
  }

  export async function getReport(id: number): Promise<Report> {
    const res = await api.get<Report>(`/reports/${id}`);
    return res.data;
  }

  export async function createReport(name: string, description: string): Promise<Report> {
    const res = await api.post<Report>("/reports", { name, description });
    return res.data;
  }

  export async function renameReport(id: number, name: string): Promise<Report> {
    const res = await api.put<Report>(`/reports/${id}`, { name });
    return res.data;
  }

  export async function deleteReport(id: number): Promise<void> {
    await api.delete(`/reports/${id}`);
  }

  export async function setReportDataset(id: number, request: SetReportDatasetRequest): Promise<Report> {
    const res = await api.put<Report>(`/reports/${id}/dataset`, request);
    return res.data;
  }
  ```

- [ ] Step 2: Create `frontend/src/api/reportPages.ts`:
  ```ts
  import axios from "axios";

  export interface ReportPage {
    id: number;
    reportId: number;
    name: string;
    sortOrder: number;
    filterState: string;
  }

  export interface UpdateReportPageRequest {
    name?: string;
    sortOrder?: number;
    filterState?: string;
  }

  const api = axios.create({ baseURL: "http://localhost:5198/api" });

  export async function getReportPages(reportId: number): Promise<ReportPage[]> {
    const res = await api.get<ReportPage[]>(`/reports/${reportId}/pages`);
    return res.data;
  }

  export async function createReportPage(reportId: number, name: string | null): Promise<ReportPage> {
    const res = await api.post<ReportPage>(`/reports/${reportId}/pages`, { name });
    return res.data;
  }

  export async function updateReportPage(reportId: number, pageId: number, updates: UpdateReportPageRequest): Promise<ReportPage> {
    const res = await api.put<ReportPage>(`/reports/${reportId}/pages/${pageId}`, updates);
    return res.data;
  }

  export async function deleteReportPage(reportId: number, pageId: number): Promise<void> {
    await api.delete(`/reports/${reportId}/pages/${pageId}`);
  }
  ```

- [ ] Step 3: Modify `frontend/src/api/datasets.ts` — add `isSaved` to `DatasetSummary` and add `deleteDataset`/`promoteDataset`. Full file after the change:
  ```ts
  import axios from "axios";

  export type DatasetMode = "TableQuery" | "RawSql" | "StoredProcedure" | "RestQuery";

  export interface ColumnDescriptor {
    name: string;
    nativeType: string;
  }

  export interface DatasetSummary {
    id: number;
    dataSourceConnectionId: number;
    name: string;
    description: string | null;
    mode: DatasetMode;
    rowLimit: number | null;
    isSaved: boolean;
    columns: ColumnDescriptor[];
    createdAtUtc: string;
    updatedAtUtc: string;
  }

  export interface CreateDatasetRequest {
    dataSourceConnectionId: number;
    name: string;
    description: string | null;
    mode: DatasetMode;
    definitionJson: string;
    rowLimit: number | null;
  }

  export interface QueryResult {
    columns: ColumnDescriptor[];
    rows: unknown[][];
  }

  const api = axios.create({ baseURL: "http://localhost:5198/api" });

  export async function getDatasets(connectionId: number): Promise<DatasetSummary[]> {
    const res = await api.get<DatasetSummary[]>("/datasets", { params: { connectionId } });
    return res.data;
  }

  export async function createDataset(request: CreateDatasetRequest): Promise<DatasetSummary> {
    const res = await api.post<DatasetSummary>("/datasets", request);
    return res.data;
  }

  export async function discoverDatasetColumns(id: number): Promise<ColumnDescriptor[]> {
    const res = await api.post<ColumnDescriptor[]>(`/datasets/${id}/columns`);
    return res.data;
  }

  export async function executeDataset(id: number): Promise<QueryResult> {
    const res = await api.post<QueryResult>(`/datasets/${id}/execute`);
    return res.data;
  }

  export async function deleteDataset(id: number): Promise<void> {
    await api.delete(`/datasets/${id}`);
  }

  export async function promoteDataset(id: number, name: string): Promise<DatasetSummary> {
    const res = await api.post<DatasetSummary>(`/datasets/${id}/promote`, { name });
    return res.data;
  }
  ```

- [ ] Step 4: Modify `frontend/src/api/widgets.ts` — full file after the change:
  ```ts
  import axios from "axios";

  export type WidgetType =
    | "Bar" | "ClusteredBar" | "StackedColumn" | "Line" | "Area" | "Pie" | "Donut" | "Scatter" | "Kpi" | "Table" | "Text";

  export interface WidgetFormatOptions {
    showTitle: boolean;
    title: string | null;
    showLegend: boolean;
    grid: boolean;
    palette: string;
    sortField: string | null;
    sortDirection: "asc" | "desc" | null;
    dataLabels: boolean;
  }

  export const DEFAULT_FORMAT_OPTIONS: WidgetFormatOptions = {
    showTitle: true,
    title: null,
    showLegend: true,
    grid: true,
    palette: "meridian",
    sortField: null,
    sortDirection: null,
    dataLabels: false,
  };

  export interface WidgetBindingSummary {
    categoryField: string | null;
    valueFields: string[];
    formatOptions: string;
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
    categoryField: string | null;
    valueFields: string[];
    formatOptions: string;
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

  export async function getWidgets(reportPageId: number): Promise<WidgetSummary[]> {
    const res = await api.get<WidgetSummary[]>(`/reportpages/${reportPageId}/widgets`);
    return res.data;
  }

  export async function saveWidgets(reportPageId: number, widgets: SaveWidgetRequest[]): Promise<WidgetSummary[]> {
    const res = await api.put<WidgetSummary[]>(`/reportpages/${reportPageId}/widgets`, { widgets });
    return res.data;
  }

  export function parseFormatOptions(json: string): WidgetFormatOptions {
    try {
      return { ...DEFAULT_FORMAT_OPTIONS, ...JSON.parse(json) };
    } catch {
      return DEFAULT_FORMAT_OPTIONS;
    }
  }
  ```

- [ ] Step 5: Write the failing test first — modify `frontend/src/widgets/widgetDraftReducer.test.ts`, changing `baseWidget`'s binding-related test to drop `datasetId` and add `formatOptions`. Replace the `bindingChanged updates only the matching widget's binding` test with:
  ```ts
    it("bindingChanged updates only the matching widget's binding", () => {
      const binding = { categoryField: "Month", valueFields: ["Revenue"], formatOptions: DEFAULT_FORMAT_OPTIONS };
      const result = widgetDraftReducer([baseWidget], { type: "bindingChanged", id: 1, binding });
      expect(result[0].binding).toEqual(binding);
    });
  ```
  and add the import at the top of the file:
  ```ts
  import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
  ```

- [ ] Step 6: Run the test to confirm it fails to compile (`WidgetBindingDraft` still has `datasetId`):
  ```
  cd frontend && npm run verify
  ```
  Expected: `tsc -b` fails on `widgetDraftReducer.ts`/`.test.ts` type mismatch.

- [ ] Step 7: Modify `frontend/src/widgets/widgetDraftReducer.ts` — full file after the change:
  ```ts
  import type { WidgetFormatOptions, WidgetType } from "../api/widgets";

  export interface WidgetBindingDraft {
    categoryField: string | null;
    valueFields: string[];
    formatOptions: WidgetFormatOptions;
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
    | { type: "bindingChanged"; id: number; binding: WidgetBindingDraft | null }
    | { type: "typeChanged"; id: number; newType: WidgetType; binding: WidgetBindingDraft | null };

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
      case "typeChanged":
        return state.map((widget) =>
          widget.id === action.id ? { ...widget, type: action.newType, binding: action.binding } : widget,
        );
      default:
        return state;
    }
  }
  ```

- [ ] Step 8: Run the test:
  ```
  cd frontend && npm run verify
  ```
  Expected: still fails — `WidgetBindingEditor.tsx`/`WidgetRenderer.tsx`/`ReportCanvas.tsx`/`ReportView.tsx` all still reference the old shapes. Continue to the remaining steps before re-running.

- [ ] Step 9: Modify `frontend/src/widgets/staleBindingCheck.ts` — extend `isBindingComplete`'s switch for the new types. Full file after the change:
  ```ts
  import type { ColumnDescriptor } from "../api/datasets";
  import type { WidgetType } from "../api/widgets";

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

  export function isBindingComplete(
    type: WidgetType,
    categoryField: string | null,
    valueFields: string[],
  ): boolean {
    switch (type) {
      case "Kpi":
        return categoryField === null && valueFields.length === 1;
      case "Pie":
      case "Donut":
        return categoryField !== null && valueFields.length === 1;
      case "Bar":
      case "ClusteredBar":
      case "StackedColumn":
      case "Line":
      case "Area":
        return categoryField !== null && valueFields.length >= 1;
      case "Scatter":
        return valueFields.length === 2;
      case "Table":
        return true;
      default:
        return true;
    }
  }
  ```

- [ ] Step 10: Append to `frontend/src/widgets/staleBindingCheck.test.ts` (inside the existing `describe("isBindingComplete", ...)` block):
  ```ts
    it("returns true for a Scatter with exactly two value fields and no category", () => {
      expect(isBindingComplete("Scatter", null, ["Sales", "Profit"])).toBe(true);
    });

    it("returns false for a Scatter with only one value field", () => {
      expect(isBindingComplete("Scatter", null, ["Sales"])).toBe(false);
    });

    it("returns true for a StackedColumn with a category and one value field", () => {
      expect(isBindingComplete("StackedColumn", "Month", ["Revenue"])).toBe(true);
    });

    it("returns true for a Donut with a category and one value field", () => {
      expect(isBindingComplete("Donut", "Month", ["Revenue"])).toBe(true);
    });
  ```

- [ ] Step 11: Modify `frontend/src/widgets/WidgetRenderer.tsx` to accept a `result` prop instead of calling `useDatasetExecute` itself. Full file after the change:
  ```tsx
  import { Alert, Paper, Typography } from "@mui/material";
  import type { QueryResult } from "../api/datasets";
  import type { WidgetSummary } from "../api/widgets";
  import { findMissingFields, isBindingComplete } from "./staleBindingCheck";
  import TableWidget from "./TableWidget";
  import BarWidget from "./BarWidget";
  import LineWidget from "./LineWidget";
  import PieWidget from "./PieWidget";
  import KpiWidget from "./KpiWidget";
  import TextWidget from "./TextWidget";

  function WidgetRenderer({ widget, result }: { widget: WidgetSummary; result: QueryResult | null }) {
    if (widget.type === "Text") {
      return <TextWidget title={widget.title} content={widget.content} />;
    }

    if (!widget.binding) {
      return (
        <Paper sx={{ p: 2, height: "100%" }}>
          <Typography variant="subtitle2">{widget.title}</Typography>
          <Alert severity="info" sx={{ mt: 1 }}>Not bound to a field yet.</Alert>
        </Paper>
      );
    }

    if (!result) {
      return (
        <Paper sx={{ p: 2, height: "100%" }}>
          <Typography variant="subtitle2">{widget.title}</Typography>
          <Typography variant="body2">Loading…</Typography>
        </Paper>
      );
    }

    const missingFields = findMissingFields(result.columns, widget.binding.categoryField, widget.binding.valueFields);
    if (missingFields.length > 0) {
      return (
        <Paper sx={{ p: 2, height: "100%" }}>
          <Typography variant="subtitle2">{widget.title}</Typography>
          <Alert severity="warning" sx={{ mt: 1 }}>
            Field {missingFields.join(", ")} no longer exists in this report's query — edit the binding to fix.
          </Alert>
        </Paper>
      );
    }

    if (!isBindingComplete(widget.type, widget.binding.categoryField, widget.binding.valueFields)) {
      return (
        <Paper sx={{ p: 2, height: "100%" }}>
          <Typography variant="subtitle2">{widget.title}</Typography>
          <Alert severity="info" sx={{ mt: 1 }}>Finish configuring this widget's fields to see a preview.</Alert>
        </Paper>
      );
    }

    switch (widget.type) {
      case "Table":
        return <TableWidget title={widget.title} result={result} valueFields={widget.binding.valueFields} />;
      case "Bar":
        return <BarWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} />;
      case "Line":
        return <LineWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} />;
      case "Pie":
        return <PieWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} />;
      case "Kpi":
        return <KpiWidget title={widget.title} result={result} valueField={widget.binding.valueFields[0]} />;
      default:
        return null;
    }
  }

  export default WidgetRenderer;
  ```
  (The `StackedColumn`/`ClusteredBar`/`Area`/`Donut`/`Scatter` cases are added in Tasks 17-19 once their components exist — until then those types simply fall through to `null`, which is fine, nothing produces them yet.)

- [ ] Step 12: Modify `frontend/src/widgets/WidgetRenderer.test.tsx` — replace every `vi.spyOn(useDatasetExecuteModule, "useDatasetExecute").mockReturnValue({ data: ..., loading: false, error: null })` call with a `result` prop passed directly, and remove the `useDatasetExecute` import/mock entirely. Full file after the change:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import { describe, expect, it } from "vitest";
  import type { QueryResult } from "../api/datasets";
  import type { WidgetSummary } from "../api/widgets";
  import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
  import WidgetRenderer from "./WidgetRenderer";

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

  const formatOptionsJson = JSON.stringify(DEFAULT_FORMAT_OPTIONS);

  describe("WidgetRenderer", () => {
    it("renders a Text widget without needing a result", () => {
      render(<WidgetRenderer widget={makeWidget({ type: "Text", title: "A note", content: "hello" })} result={null} />);

      expect(screen.getByText("hello")).toBeInTheDocument();
    });

    it("shows an info state for a data-driven widget with no binding yet", () => {
      render(<WidgetRenderer widget={makeWidget({ type: "Kpi", binding: null })} result={null} />);

      expect(screen.getByText("Not bound to a field yet.")).toBeInTheDocument();
    });

    it("shows the stale-binding warning when a bound field no longer exists", () => {
      const result: QueryResult = { columns: [{ name: "Id", nativeType: "int" }], rows: [[1]] };

      render(
        <WidgetRenderer
          widget={makeWidget({ type: "Kpi", binding: { categoryField: null, valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
          result={result}
        />,
      );

      expect(screen.getByText(/no longer exists in this report's query/)).toBeInTheDocument();
    });

    it("shows the finish-configuring info state for a Kpi with no fields chosen yet", () => {
      const result: QueryResult = { columns: [{ name: "Revenue", nativeType: "decimal(18,2)" }], rows: [[500]] };

      render(
        <WidgetRenderer
          widget={makeWidget({ type: "Kpi", title: "Total Revenue", binding: { categoryField: null, valueFields: [], formatOptions: formatOptionsJson } })}
          result={result}
        />,
      );

      expect(screen.getByText("Finish configuring this widget's fields to see a preview.")).toBeInTheDocument();
      expect(screen.queryByText("NaN")).not.toBeInTheDocument();
    });

    it("renders a Kpi value when the binding is valid", () => {
      const result: QueryResult = { columns: [{ name: "Revenue", nativeType: "decimal(18,2)" }], rows: [[500]] };

      render(
        <WidgetRenderer
          widget={makeWidget({ type: "Kpi", title: "Total Revenue", binding: { categoryField: null, valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
          result={result}
        />,
      );

      expect(screen.getByText("500")).toBeInTheDocument();
    });
  });
  ```

- [ ] Step 13: Modify `frontend/src/widgets/WidgetBindingEditor.tsx` to receive `columns` as a prop instead of self-fetching a Dataset. Full file after the change:
  ```tsx
  import { Box, MenuItem, TextField } from "@mui/material";
  import type { ColumnDescriptor } from "../api/datasets";
  import { classify } from "./fieldClassification";
  import type { WidgetBindingDraft, WidgetDraft } from "./widgetDraftReducer";

  function WidgetBindingEditor({
    widget, columns, onChange,
  }: { widget: WidgetDraft; columns: ColumnDescriptor[]; onChange: (binding: WidgetBindingDraft | null) => void }) {
    if (widget.type === "Text") {
      return null;
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
  (This is a deliberately temporary simplification — the "Dataset" picker is gone since a widget no longer has its own Dataset, but this dropdown-based editor is itself fully replaced by the drag-and-drop wells UI in Task 14. `WidgetBindingEditor.test.tsx` is deleted wholesale in that later task along with this file; no point updating its now-obsolete "shows a Dataset picker" test here.)

- [ ] Step 14: Modify `frontend/src/widgets/WidgetBindingEditor.test.tsx` — delete the "shows a Dataset picker populated from every connection's datasets" test (no more Dataset picker) and update the remaining test to pass `columns` directly. Full file after the change:
  ```tsx
  import { render } from "@testing-library/react";
  import { describe, expect, it, vi } from "vitest";
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
      const { container } = render(
        <WidgetBindingEditor widget={makeWidget({ type: "Text" })} columns={[]} onChange={vi.fn()} />,
      );
      expect(container).toBeEmptyDOMElement();
    });
  });
  ```

- [ ] Step 15: Modify `frontend/src/pages/ReportCanvas.tsx` to fetch the report once and pass `columns`/`result` down. Full file after the change:
  ```tsx
  import { useEffect, useReducer, useRef, useState } from "react";
  import { useNavigate, useParams } from "react-router-dom";
  import { Alert, Box, Button, Container, MenuItem, TextField, Typography } from "@mui/material";
  import { GridStack } from "gridstack";
  import "gridstack/dist/gridstack.min.css";
  import axios from "axios";
  import { getReport } from "../api/reports";
  import { executeDataset, type QueryResult } from "../api/datasets";
  import { getWidgets, saveWidgets, DEFAULT_FORMAT_OPTIONS, type SaveWidgetRequest, type WidgetType } from "../api/widgets";
  import { getReportPages } from "../api/reportPages";
  import { widgetDraftReducer, type WidgetDraft } from "../widgets/widgetDraftReducer";
  import WidgetRenderer from "../widgets/WidgetRenderer";
  import WidgetBindingEditor from "../widgets/WidgetBindingEditor";

  let tempIdCounter = -1;

  const WIDGET_TYPES: WidgetType[] = ["Table", "Bar", "Line", "Pie", "Kpi", "Text"];

  function ReportCanvas() {
    const { id } = useParams<{ id: string }>();
    const reportId = Number(id);

    const [reportPageId, setReportPageId] = useState<number | null>(null);
    const [result, setResult] = useState<QueryResult | null>(null);
    const [widgets, dispatch] = useReducer(widgetDraftReducer, [] as WidgetDraft[]);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();
    const gridRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      async function load() {
        const report = await getReport(reportId);
        if (report.datasetId !== null) {
          setResult(await executeDataset(report.datasetId));
        }

        const pages = await getReportPages(reportId);
        const firstPageId = pages[0]?.id ?? null;
        setReportPageId(firstPageId);
        if (firstPageId === null) {
          return;
        }

        const summaries = await getWidgets(firstPageId);
        dispatch({
          type: "loaded",
          widgets: summaries.map((s) => ({
            id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h, title: s.title, content: s.content,
            binding: s.binding
              ? { categoryField: s.binding.categoryField, valueFields: s.binding.valueFields, formatOptions: DEFAULT_FORMAT_OPTIONS }
              : null,
          })),
        });
      }

      load().catch(() => setError("Could not load this report."));
    }, [reportId]);

    const widgetIds = widgets.map((w) => w.id).join(",");

    useEffect(() => {
      if (!gridRef.current) {
        return;
      }

      const grid = GridStack.init({ column: 12, cellHeight: 80 }, gridRef.current);
      if (!grid) {
        return;
      }

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

    async function handleSave() {
      if (reportPageId === null) {
        return;
      }

      setError(null);
      const payload: SaveWidgetRequest[] = widgets.map((w) => ({
        type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, title: w.title, content: w.content,
        binding: w.binding
          ? { categoryField: w.binding.categoryField, valueFields: w.binding.valueFields, formatOptions: JSON.stringify(w.binding.formatOptions) }
          : null,
      }));

      try {
        await saveWidgets(reportPageId, payload);
        navigate(`/reports/${reportId}`);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 400) {
          setError(typeof err.response.data === "string" ? err.response.data : "Could not save this report's widgets.");
        } else {
          setError("Could not save this report's widgets.");
        }
      }
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
          <Button variant="contained" onClick={handleSave}>Save</Button>
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
                <WidgetBindingEditor widget={w} columns={result?.columns ?? []} onChange={(binding) => dispatch({ type: "bindingChanged", id: w.id, binding })} />
                <WidgetRenderer widget={w} result={result} />
              </div>
            </div>
          ))}
        </div>
      </Container>
    );
  }

  export default ReportCanvas;
  ```
  Note: `w.binding.categoryField ? { categoryField, valueFields, formatOptions: DEFAULT_FORMAT_OPTIONS }` throws away a previously-saved `FormatOptions` blob on load — that's fixed in Task 9 when this inline fetch logic gets extracted and the loader starts round-tripping `parseFormatOptions(s.binding.formatOptions)` instead of always defaulting. Acceptable as a known, temporary gap for this task only (nothing downstream depends on it yet).

- [ ] Step 16: Modify `frontend/src/pages/ReportView.tsx` similarly. Full file after the change:
  ```tsx
  import { useEffect, useState } from "react";
  import { useParams } from "react-router-dom";
  import { Alert, Box, Container, Typography } from "@mui/material";
  import { getReport } from "../api/reports";
  import { executeDataset, type QueryResult } from "../api/datasets";
  import { getWidgets, type WidgetSummary } from "../api/widgets";
  import { getReportPages } from "../api/reportPages";
  import WidgetRenderer from "../widgets/WidgetRenderer";

  function ReportView() {
    const { id } = useParams<{ id: string }>();
    const reportId = Number(id);
    const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
    const [result, setResult] = useState<QueryResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      async function load() {
        const report = await getReport(reportId);
        if (report.datasetId !== null) {
          setResult(await executeDataset(report.datasetId));
        }

        const pages = await getReportPages(reportId);
        const firstPageId = pages[0]?.id ?? null;
        if (firstPageId === null) {
          setWidgets([]);
          return;
        }

        setWidgets(await getWidgets(firstPageId));
      }

      load().catch(() => setError("Could not load this report."));
    }, [reportId]);

    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>Report</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 2 }}>
          {widgets.map((w) => (
            <Box key={w.id} sx={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}>
              <WidgetRenderer widget={w} result={result} />
            </Box>
          ))}
        </Box>
      </Container>
    );
  }

  export default ReportView;
  ```

- [ ] Step 17: Delete the now-dead hook and its test:
  ```
  git rm frontend/src/widgets/useDatasetExecute.ts frontend/src/widgets/useDatasetExecute.test.ts
  ```

- [ ] Step 18: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: `tsc -b` succeeds and every Vitest test passes.

- [ ] Step 19: Commit:
  ```
  git add frontend/src/api frontend/src/widgets/widgetDraftReducer.ts frontend/src/widgets/widgetDraftReducer.test.ts frontend/src/widgets/staleBindingCheck.ts frontend/src/widgets/staleBindingCheck.test.ts frontend/src/widgets/WidgetRenderer.tsx frontend/src/widgets/WidgetRenderer.test.tsx frontend/src/widgets/WidgetBindingEditor.tsx frontend/src/widgets/WidgetBindingEditor.test.tsx frontend/src/pages/ReportCanvas.tsx frontend/src/pages/ReportView.tsx
  git commit -m "frontend: fetch a report's query once, drop per-widget DatasetId, delete useDatasetExecute"
  ```

---

### Task 8: Report creation flow — immediate query definition

**Files:**
- Create: `frontend/src/pages/QueryDefinitionForm.tsx`
- Test: `frontend/src/pages/QueryDefinitionForm.test.tsx`
- Modify: `frontend/src/pages/ReportsPage.tsx`

**Interfaces:**
- Consumes: `setReportDataset` (Task 7's `api/reports.ts`), `getDataSources`/`getDataSourceSchema` (Milestone 2), `QueryResultGrid` (Milestone 3).
- Produces: `QueryDefinitionForm` — a reusable `{ connectionId, mode, definitionJson, rowLimit }`-collecting form with a live "Run" preview, taking an `onSubmit` callback. Task 11's ribbon "Change data source" action reuses this exact component.

- [ ] Step 1: Create `frontend/src/pages/QueryDefinitionForm.tsx`:
  ```tsx
  import { useEffect, useState } from "react";
  import { Alert, Box, Button, MenuItem, TextField } from "@mui/material";
  import { getDataSources, type DataSourceConnectionSummary } from "../api/datasources";
  import type { DatasetMode, QueryResult } from "../api/datasets";
  import QueryResultGrid from "../components/QueryResultGrid";

  export interface QueryDefinitionValue {
    dataSourceConnectionId: number;
    mode: DatasetMode;
    definitionJson: string;
    rowLimit: number | null;
  }

  function QueryDefinitionForm({
    onRun, onSubmit,
  }: {
    onRun: (value: QueryDefinitionValue) => Promise<QueryResult>;
    onSubmit: (value: QueryDefinitionValue) => Promise<void>;
  }) {
    const [connections, setConnections] = useState<DataSourceConnectionSummary[]>([]);
    const [connectionId, setConnectionId] = useState<number | "">("");
    const [mode, setMode] = useState<DatasetMode>("RawSql");
    const [sqlText, setSqlText] = useState("");
    const [routineName, setRoutineName] = useState("");
    const [rowLimit, setRowLimit] = useState("");
    const [previewResult, setPreviewResult] = useState<QueryResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      getDataSources().then(setConnections).catch(() => setError("Could not load connections."));
    }, []);

    const selectedConnection = connections.find((c) => c.id === connectionId);
    const isRestConnection = selectedConnection?.type === "RestApi";

    useEffect(() => {
      setMode(isRestConnection ? "RestQuery" : "RawSql");
    }, [connectionId, isRestConnection]);

    function buildValue(): QueryDefinitionValue | null {
      if (typeof connectionId !== "number") {
        return null;
      }

      const definitionJson =
        mode === "RawSql" ? JSON.stringify({ sqlText })
        : mode === "StoredProcedure" ? JSON.stringify({ routineName, parameters: [] })
        : JSON.stringify({ pathSuffix: null, queryParams: [] });

      return {
        dataSourceConnectionId: connectionId,
        mode,
        definitionJson,
        rowLimit: rowLimit === "" ? null : Number(rowLimit),
      };
    }

    async function handleRun() {
      setError(null);
      const value = buildValue();
      if (!value) {
        return;
      }

      try {
        setPreviewResult(await onRun(value));
      } catch {
        setError("Could not run this query.");
      }
    }

    async function handleSubmit() {
      setError(null);
      const value = buildValue();
      if (!value) {
        return;
      }

      try {
        await onSubmit(value);
      } catch {
        setError("Could not save this query.");
      }
    }

    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          select
          label="Connection"
          size="small"
          value={connectionId}
          onChange={(e) => setConnectionId(e.target.value === "" ? "" : Number(e.target.value))}
          sx={{ minWidth: 240 }}
        >
          {connections.map((c) => <MenuItem key={c.id} value={c.id}>{c.name} ({c.type})</MenuItem>)}
        </TextField>

        {typeof connectionId === "number" && !isRestConnection && (
          <TextField select label="Mode" size="small" value={mode} onChange={(e) => setMode(e.target.value as DatasetMode)} sx={{ minWidth: 180 }}>
            <MenuItem value="RawSql">Raw SQL</MenuItem>
            <MenuItem value="StoredProcedure">Stored Procedure</MenuItem>
          </TextField>
        )}

        {mode === "RawSql" && (
          <TextField label="SQL" multiline minRows={3} fullWidth value={sqlText} onChange={(e) => setSqlText(e.target.value)} />
        )}
        {mode === "StoredProcedure" && (
          <TextField label="Procedure or Function Name" size="small" value={routineName} onChange={(e) => setRoutineName(e.target.value)} />
        )}

        <TextField label="Row Limit (default 10000)" size="small" value={rowLimit} onChange={(e) => setRowLimit(e.target.value)} sx={{ maxWidth: 220 }} />

        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="outlined" onClick={handleRun} disabled={typeof connectionId !== "number"}>Run</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={typeof connectionId !== "number"}>Use this query</Button>
        </Box>

        <QueryResultGrid result={previewResult} />
      </Box>
    );
  }

  export default QueryDefinitionForm;
  ```

- [ ] Step 2: Write the failing test first — create `frontend/src/pages/QueryDefinitionForm.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { describe, expect, it, vi } from "vitest";
  import * as datasourcesApi from "../api/datasources";
  import QueryDefinitionForm from "./QueryDefinitionForm";

  describe("QueryDefinitionForm", () => {
    it("disables Run and Use this query until a connection is picked", async () => {
      vi.spyOn(datasourcesApi, "getDataSources").mockResolvedValue([
        { id: 1, name: "Prod DB", type: "SqlServer", host: "h", databaseName: null, createdAtUtc: "" },
      ]);

      render(<QueryDefinitionForm onRun={vi.fn()} onSubmit={vi.fn()} />);

      expect(await screen.findByRole("button", { name: "Run" })).toBeDisabled();
    });

    it("calls onSubmit with the built query definition after picking a connection and writing SQL", async () => {
      vi.spyOn(datasourcesApi, "getDataSources").mockResolvedValue([
        { id: 1, name: "Prod DB", type: "SqlServer", host: "h", databaseName: null, createdAtUtc: "" },
      ]);
      const onSubmit = vi.fn().mockResolvedValue(undefined);

      render(<QueryDefinitionForm onRun={vi.fn()} onSubmit={onSubmit} />);

      await userEvent.click((await screen.findAllByRole("combobox"))[0]);
      await userEvent.click(await screen.findByText("Prod DB (SqlServer)"));
      await userEvent.type(screen.getByLabelText("SQL"), "select 1");
      await userEvent.click(screen.getByRole("button", { name: "Use this query" }));

      expect(onSubmit).toHaveBeenCalledWith({
        dataSourceConnectionId: 1,
        mode: "RawSql",
        definitionJson: JSON.stringify({ sqlText: "select 1" }),
        rowLimit: null,
      });
    });
  });
  ```

- [ ] Step 3: Run the test to confirm it fails (component doesn't exist until Step 1 lands — run after Step 1 to confirm pass instead, this is a same-task create-then-verify, not a strict red-green since the component and test are written in the same task; still run it once to make sure it's genuinely exercising the real component):
  ```
  cd frontend && npm run verify
  ```
  Expected: passes after Steps 1-2 are both in place.

- [ ] Step 4: Modify `frontend/src/pages/ReportsPage.tsx` to prompt for the query immediately after creating a report. Full file after the change:
  ```tsx
  import { useEffect, useState } from "react";
  import {
    Alert, Box, Button, Container, Dialog, DialogContent, DialogTitle, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, TextField, Typography,
  } from "@mui/material";
  import axios from "axios";
  import { useNavigate, Link as RouterLink } from "react-router-dom";
  import { createReport, getReports, setReportDataset, type Report } from "../api/reports";
  import { executeDataset, type QueryResult } from "../api/datasets";
  import QueryDefinitionForm, { type QueryDefinitionValue } from "./QueryDefinitionForm";

  function ReportsPage() {
    const [reports, setReports] = useState<Report[]>([]);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [pendingReport, setPendingReport] = useState<Report | null>(null);
    const navigate = useNavigate();

    async function refresh() {
      setReports(await getReports());
    }

    useEffect(() => {
      refresh().catch(() => setError("Could not load reports — is the backend running on :5198?"));
    }, []);

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      try {
        const created = await createReport(name, description);
        setName("");
        setDescription("");
        await refresh();
        setPendingReport(created);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 400) {
          setError(typeof err.response.data === "string" ? err.response.data : "Invalid input.");
        } else {
          setError("Something went wrong talking to the backend.");
        }
      }
    }

    async function handleRunQuery(value: QueryDefinitionValue): Promise<QueryResult> {
      // A dry run just to show a preview — doesn't persist anything. Reuses the connection's
      // own execute-style preview by temporarily wiring the Dataset via the report itself is
      // unnecessary here: the simplest, side-effect-free preview is running the same query
      // definition against the connection directly is out of scope for this form (Milestone 3
      // didn't build a connection-level ad-hoc preview endpoint either) — so "Run" here previews
      // by provisionally setting the report's dataset, same as "Use this query" would. This is a
      // deliberate simplification: there's no separate "preview without saving" endpoint.
      if (!pendingReport) {
        throw new Error("No pending report");
      }
      const updated = await setReportDataset(pendingReport.id, value);
      setPendingReport(updated);
      return executeDataset(updated.datasetId!);
    }

    async function handleUseQuery(value: QueryDefinitionValue) {
      if (!pendingReport) {
        return;
      }
      await setReportDataset(pendingReport.id, value);
      const reportId = pendingReport.id;
      setPendingReport(null);
      navigate(`/reports/${reportId}/edit`);
    }

    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>Reports</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", gap: 2, mb: 3 }}>
          <TextField label="Name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField label="Description" size="small" value={description} onChange={(e) => setDescription(e.target.value)} sx={{ flexGrow: 1 }} />
          <Button type="submit" variant="contained">Add</Button>
        </Box>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow><TableCell>ID</TableCell><TableCell>Name</TableCell><TableCell>Description</TableCell><TableCell>Designer</TableCell></TableRow>
            </TableHead>
            <TableBody>
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
            </TableBody>
          </Table>
        </TableContainer>

        <Dialog open={pendingReport !== null} maxWidth="sm" fullWidth onClose={() => {}}>
          <DialogTitle>Define this report's query</DialogTitle>
          <DialogContent>
            <QueryDefinitionForm onRun={handleRunQuery} onSubmit={handleUseQuery} />
          </DialogContent>
        </Dialog>
      </Container>
    );
  }

  export default ReportsPage;
  ```

- [ ] Step 5: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 6: Commit:
  ```
  git add frontend/src/pages/QueryDefinitionForm.tsx frontend/src/pages/QueryDefinitionForm.test.tsx frontend/src/pages/ReportsPage.tsx
  git commit -m "frontend: prompt for a report's query immediately after creating it"
  ```

---

### Task 9: Shared `ReportQueryContext` + pure cross-filter function

**Files:**
- Create: `frontend/src/reportEditor/crossFilter.ts`
- Test: `frontend/src/reportEditor/crossFilter.test.ts`
- Create: `frontend/src/reportEditor/ReportQueryContext.tsx`
- Test: `frontend/src/reportEditor/ReportQueryContext.test.tsx`
- Modify: `frontend/src/pages/ReportCanvas.tsx`
- Modify: `frontend/src/pages/ReportView.tsx`

**Interfaces:**
- Consumes: `getReport`, `getReportPages`, `getWidgets`, `executeDataset` (Task 7).
- Produces: `applyFilters(result: QueryResult, filterState: Record<string, string[]>): QueryResult` — pure function every later filtering task (Filters pane, click-to-cross-filter) calls. `ReportQueryProvider` + `useReportQuery()` returning `{ rawResult, filteredResult, filterState, setFilterState, loading, error, refresh, reportPageId, reportPages }` — Tasks 11, 20, 21, 22, 23 all consume this hook instead of fetching anything themselves.

- [ ] Step 1: Write the failing test first — create `frontend/src/reportEditor/crossFilter.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import type { QueryResult } from "../api/datasets";
  import { applyFilters } from "./crossFilter";

  const result: QueryResult = {
    columns: [
      { name: "Region", nativeType: "nvarchar(20)" },
      { name: "Revenue", nativeType: "decimal(18,2)" },
    ],
    rows: [
      ["North", 100],
      ["South", 200],
      ["East", 150],
    ],
  };

  describe("applyFilters", () => {
    it("returns every row unchanged when filterState is empty", () => {
      expect(applyFilters(result, {})).toEqual(result);
    });

    it("keeps only rows whose value is in the field's selected set", () => {
      const filtered = applyFilters(result, { Region: ["North", "East"] });

      expect(filtered.rows).toEqual([["North", 100], ["East", 150]]);
    });

    it("intersects across multiple filtered fields", () => {
      const filtered = applyFilters(result, { Region: ["North", "South"], Revenue: ["100"] });

      expect(filtered.rows).toEqual([["North", 100]]);
    });

    it("ignores a filter field that selects zero values (treated as no filter on that field, not exclude-everything)", () => {
      const filtered = applyFilters(result, { Region: [] });

      expect(filtered.rows).toEqual(result.rows);
    });

    it("ignores a filter field that doesn't exist in the result's columns", () => {
      const filtered = applyFilters(result, { Segment: ["Consumer"] });

      expect(filtered.rows).toEqual(result.rows);
    });
  });
  ```

- [ ] Step 2: Run the test to confirm it fails (module doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `./crossFilter`.

- [ ] Step 3: Create `frontend/src/reportEditor/crossFilter.ts`:
  ```ts
  import type { QueryResult } from "../api/datasets";

  export function applyFilters(result: QueryResult, filterState: Record<string, string[]>): QueryResult {
    const activeFilters = Object.entries(filterState).filter(([field, values]) => {
      const columnExists = result.columns.some((c) => c.name === field);
      return columnExists && values.length > 0;
    });

    if (activeFilters.length === 0) {
      return result;
    }

    const columnIndex = (field: string) => result.columns.findIndex((c) => c.name === field);

    const rows = result.rows.filter((row) =>
      activeFilters.every(([field, values]) => {
        const index = columnIndex(field);
        const cell = row[index];
        return values.includes(cell === null || cell === undefined ? "" : String(cell));
      }),
    );

    return { columns: result.columns, rows };
  }
  ```

- [ ] Step 4: Run the test:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 5: Write the failing test first — create `frontend/src/reportEditor/ReportQueryContext.test.tsx`:
  ```tsx
  import { render, screen, waitFor } from "@testing-library/react";
  import { describe, expect, it, vi } from "vitest";
  import * as reportsApi from "../api/reports";
  import * as reportPagesApi from "../api/reportPages";
  import * as datasetsApi from "../api/datasets";
  import { ReportQueryProvider, useReportQuery } from "./ReportQueryContext";

  function Probe() {
    const { rawResult, filteredResult, loading, reportPageId } = useReportQuery();
    if (loading) {
      return <div>loading</div>;
    }
    return (
      <div>
        <div>rows: {rawResult?.rows.length ?? 0}</div>
        <div>filtered: {filteredResult?.rows.length ?? 0}</div>
        <div>page: {reportPageId ?? "none"}</div>
      </div>
    );
  }

  describe("ReportQueryProvider", () => {
    it("fetches the report's dataset and first page exactly once", async () => {
      vi.spyOn(reportsApi, "getReport").mockResolvedValue({ id: 1, name: "R", description: "", datasetId: 5 });
      vi.spyOn(reportPagesApi, "getReportPages").mockResolvedValue([
        { id: 10, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{}" },
      ]);
      const executeSpy = vi.spyOn(datasetsApi, "executeDataset").mockResolvedValue({
        columns: [{ name: "Region", nativeType: "nvarchar(20)" }],
        rows: [["North"], ["South"]],
      });

      render(
        <ReportQueryProvider reportId={1}>
          <Probe />
        </ReportQueryProvider>,
      );

      await waitFor(() => expect(screen.getByText("rows: 2")).toBeInTheDocument());
      expect(screen.getByText("filtered: 2")).toBeInTheDocument();
      expect(screen.getByText("page: 10")).toBeInTheDocument();
      expect(executeSpy).toHaveBeenCalledTimes(1);
    });

    it("does not call executeDataset when the report has no datasetId yet", async () => {
      vi.spyOn(reportsApi, "getReport").mockResolvedValue({ id: 2, name: "R", description: "", datasetId: null });
      vi.spyOn(reportPagesApi, "getReportPages").mockResolvedValue([
        { id: 11, reportId: 2, name: "Page 1", sortOrder: 0, filterState: "{}" },
      ]);
      const executeSpy = vi.spyOn(datasetsApi, "executeDataset");

      render(
        <ReportQueryProvider reportId={2}>
          <Probe />
        </ReportQueryProvider>,
      );

      await waitFor(() => expect(screen.getByText("rows: 0")).toBeInTheDocument());
      expect(executeSpy).not.toHaveBeenCalled();
    });
  });
  ```

- [ ] Step 6: Run the test to confirm it fails (module doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `./ReportQueryContext`.

- [ ] Step 7: Create `frontend/src/reportEditor/ReportQueryContext.tsx`:
  ```tsx
  import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
  import type { ReactNode } from "react";
  import { getReport } from "../api/reports";
  import { executeDataset, type QueryResult } from "../api/datasets";
  import { getReportPages, type ReportPage } from "../api/reportPages";
  import { applyFilters } from "./crossFilter";

  export interface ReportQueryContextValue {
    reportId: number;
    reportPages: ReportPage[];
    reportPageId: number | null;
    setReportPageId: (id: number) => void;
    rawResult: QueryResult | null;
    filteredResult: QueryResult | null;
    filterState: Record<string, string[]>;
    setFilterState: (next: Record<string, string[]>) => void;
    loading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
  }

  const ReportQueryContext = createContext<ReportQueryContextValue | null>(null);

  export function ReportQueryProvider({ reportId, children }: { reportId: number; children: ReactNode }) {
    const [reportPages, setReportPages] = useState<ReportPage[]>([]);
    const [reportPageId, setReportPageId] = useState<number | null>(null);
    const [rawResult, setRawResult] = useState<QueryResult | null>(null);
    const [filterState, setFilterState] = useState<Record<string, string[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
      setLoading(true);
      setError(null);
      try {
        const report = await getReport(reportId);
        const pages = await getReportPages(reportId);
        setReportPages(pages);
        const firstPageId = pages[0]?.id ?? null;
        setReportPageId(firstPageId);
        setFilterState(firstPageId !== null ? JSON.parse(pages[0].filterState || "{}") : {});

        if (report.datasetId !== null) {
          setRawResult(await executeDataset(report.datasetId));
        } else {
          setRawResult(null);
        }
      } catch {
        setError("Could not load this report's data.");
      } finally {
        setLoading(false);
      }
    }, [reportId]);

    useEffect(() => {
      load();
    }, [load]);

    const filteredResult = useMemo(
      () => (rawResult ? applyFilters(rawResult, filterState) : null),
      [rawResult, filterState],
    );

    const value: ReportQueryContextValue = {
      reportId,
      reportPages,
      reportPageId,
      setReportPageId,
      rawResult,
      filteredResult,
      filterState,
      setFilterState,
      loading,
      error,
      refresh: load,
    };

    return <ReportQueryContext.Provider value={value}>{children}</ReportQueryContext.Provider>;
  }

  export function useReportQuery(): ReportQueryContextValue {
    const context = useContext(ReportQueryContext);
    if (!context) {
      throw new Error("useReportQuery must be used within a ReportQueryProvider");
    }
    return context;
  }
  ```

- [ ] Step 8: Run the test:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 9: Modify `frontend/src/pages/ReportCanvas.tsx` to consume `ReportQueryProvider`/`useReportQuery` instead of its own inline fetch effect. Replace the whole file:
  ```tsx
  import { useEffect, useReducer, useRef, useState } from "react";
  import { useNavigate, useParams } from "react-router-dom";
  import { Alert, Box, Button, Container, MenuItem, TextField, Typography } from "@mui/material";
  import { GridStack } from "gridstack";
  import "gridstack/dist/gridstack.min.css";
  import axios from "axios";
  import { getWidgets, saveWidgets, DEFAULT_FORMAT_OPTIONS, parseFormatOptions, type SaveWidgetRequest, type WidgetType } from "../api/widgets";
  import { widgetDraftReducer, type WidgetDraft } from "../widgets/widgetDraftReducer";
  import WidgetRenderer from "../widgets/WidgetRenderer";
  import WidgetBindingEditor from "../widgets/WidgetBindingEditor";
  import { ReportQueryProvider, useReportQuery } from "../reportEditor/ReportQueryContext";

  let tempIdCounter = -1;

  const WIDGET_TYPES: WidgetType[] = ["Table", "Bar", "Line", "Pie", "Kpi", "Text"];

  function ReportCanvasInner() {
    const navigate = useNavigate();
    const { reportId, reportPageId, filteredResult, loading: queryLoading } = useReportQuery();

    const [widgets, dispatch] = useReducer(widgetDraftReducer, [] as WidgetDraft[]);
    const [error, setError] = useState<string | null>(null);
    const gridRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      if (reportPageId === null) {
        return;
      }

      getWidgets(reportPageId)
        .then((summaries) =>
          dispatch({
            type: "loaded",
            widgets: summaries.map((s) => ({
              id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h, title: s.title, content: s.content,
              binding: s.binding
                ? { categoryField: s.binding.categoryField, valueFields: s.binding.valueFields, formatOptions: parseFormatOptions(s.binding.formatOptions) }
                : null,
            })),
          }),
        )
        .catch(() => setError("Could not load this report's widgets."));
    }, [reportPageId]);

    const widgetIds = widgets.map((w) => w.id).join(",");

    useEffect(() => {
      if (!gridRef.current) {
        return;
      }

      const grid = GridStack.init({ column: 12, cellHeight: 80 }, gridRef.current);
      if (!grid) {
        return;
      }

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

    async function handleSave() {
      if (reportPageId === null) {
        return;
      }

      setError(null);
      const payload: SaveWidgetRequest[] = widgets.map((w) => ({
        type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, title: w.title, content: w.content,
        binding: w.binding
          ? { categoryField: w.binding.categoryField, valueFields: w.binding.valueFields, formatOptions: JSON.stringify(w.binding.formatOptions) }
          : null,
      }));

      try {
        await saveWidgets(reportPageId, payload);
        navigate(`/reports/${reportId}`);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 400) {
          setError(typeof err.response.data === "string" ? err.response.data : "Could not save this report's widgets.");
        } else {
          setError("Could not save this report's widgets.");
        }
      }
    }

    if (queryLoading) {
      return <Container maxWidth="lg" sx={{ py: 4 }}><Typography>Loading…</Typography></Container>;
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
          <Button variant="contained" onClick={handleSave}>Save</Button>
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
                <WidgetBindingEditor widget={w} columns={filteredResult?.columns ?? []} onChange={(binding) => dispatch({ type: "bindingChanged", id: w.id, binding })} />
                <WidgetRenderer widget={w} result={filteredResult} />
              </div>
            </div>
          ))}
        </div>
      </Container>
    );
  }

  function ReportCanvas() {
    const { id } = useParams<{ id: string }>();
    const reportId = Number(id);

    return (
      <ReportQueryProvider reportId={reportId}>
        <ReportCanvasInner />
      </ReportQueryProvider>
    );
  }

  export default ReportCanvas;
  ```
  Note `DEFAULT_FORMAT_OPTIONS` is imported but no longer directly referenced here — remove it from the import list if `tsc` flags it as unused (it isn't used in this file after switching to `parseFormatOptions`; only import what's actually referenced).

- [ ] Step 10: Modify `frontend/src/pages/ReportView.tsx` the same way. Full file after the change:
  ```tsx
  import { useEffect, useState } from "react";
  import { useParams } from "react-router-dom";
  import { Alert, Box, Container, Typography } from "@mui/material";
  import { getWidgets, type WidgetSummary } from "../api/widgets";
  import WidgetRenderer from "../widgets/WidgetRenderer";
  import { ReportQueryProvider, useReportQuery } from "../reportEditor/ReportQueryContext";

  function ReportViewInner() {
    const { reportPageId, filteredResult, loading: queryLoading } = useReportQuery();
    const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      if (reportPageId === null) {
        return;
      }

      getWidgets(reportPageId).then(setWidgets).catch(() => setError("Could not load this report's widgets."));
    }, [reportPageId]);

    if (queryLoading) {
      return <Container maxWidth="lg" sx={{ py: 4 }}><Typography>Loading…</Typography></Container>;
    }

    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>Report</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 2 }}>
          {widgets.map((w) => (
            <Box key={w.id} sx={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}>
              <WidgetRenderer widget={w} result={filteredResult} />
            </Box>
          ))}
        </Box>
      </Container>
    );
  }

  function ReportView() {
    const { id } = useParams<{ id: string }>();
    const reportId = Number(id);

    return (
      <ReportQueryProvider reportId={reportId}>
        <ReportViewInner />
      </ReportQueryProvider>
    );
  }

  export default ReportView;
  ```

- [ ] Step 11: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 12: Commit:
  ```
  git add frontend/src/reportEditor/crossFilter.ts frontend/src/reportEditor/crossFilter.test.ts frontend/src/reportEditor/ReportQueryContext.tsx frontend/src/reportEditor/ReportQueryContext.test.tsx frontend/src/pages/ReportCanvas.tsx frontend/src/pages/ReportView.tsx
  git commit -m "frontend: shared ReportQueryContext and pure applyFilters cross-filter function"
  ```

---

### Task 10: Meridian design tokens + App shell sidebar

**Files:**
- Modify: `frontend/index.html`
- Create: `frontend/src/meridian-tokens.css`
- Create: `frontend/src/components/AppSidebar.tsx`
- Test: `frontend/src/components/AppSidebar.test.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/DataSourcesPage.tsx`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `frontend/src/meridian-tokens.css` (the `:root { --ink; --accent; ... }` custom-property set, imported globally) — Task 11's `reportEditor.css` reuses these same variables rather than redefining them. `AppSidebar` — a persistent left icon rail with three routes (Connections/Datasets/Reports), rendered by `App.tsx`'s `Layout` only for non-editor/non-view routes.

- [ ] Step 1: Modify `frontend/index.html` — add the Google Fonts preconnect + stylesheet links inside `<head>`, right after the existing `<title>` tag (open the file first to find its exact current contents and insert after `<title>`):
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  ```

- [ ] Step 2: Create `frontend/src/meridian-tokens.css` — the exact custom-property set from `report-designer.html`'s `:root` block, plus the two global rules that make them take effect app-wide:
  ```css
  :root {
    --ink: #15171e;
    --rail: #1b1e27;
    --rail-hover: #2a2e3a;
    --rail-line: #2f333f;
    --panel: #ffffff;
    --panel-2: #f6f7f9;
    --groove: #eef0f4;
    --line: #e3e7ef;
    --line-strong: #cfd5e0;
    --canvas: #e7eaf1;
    --page: #ffffff;
    --text: #1b1e27;
    --muted: #6c7480;
    --faint: #9aa1ad;
    --accent: #5b4fe6;
    --accent-ink: #4a3fd6;
    --accent-soft: #edeafc;
    --accent-line: #c9c2f7;
    --good: #12a594;
    --warn: #e5843a;
    --sh-sm: 0 1px 2px rgba(20, 24, 40, 0.06), 0 1px 1px rgba(20, 24, 40, 0.04);
    --sh-md: 0 4px 14px rgba(20, 24, 40, 0.1), 0 1px 3px rgba(20, 24, 40, 0.06);
    --r: 8px;
  }

  body {
    font-family: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: var(--text);
  }

  .mono {
    font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace;
  }
  ```

- [ ] Step 3: Modify `frontend/src/main.tsx` to import the new stylesheet globally (add near the top, alongside any existing CSS import — open the file first to see its exact current imports and add this line among them):
  ```ts
  import "./meridian-tokens.css";
  ```

- [ ] Step 4: Write the failing test first — create `frontend/src/components/AppSidebar.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import { describe, expect, it } from "vitest";
  import { MemoryRouter } from "react-router-dom";
  import AppSidebar from "./AppSidebar";

  describe("AppSidebar", () => {
    it("renders links to Connections, Datasets, and Reports", () => {
      render(
        <MemoryRouter initialEntries={["/reports"]}>
          <AppSidebar />
        </MemoryRouter>,
      );

      expect(screen.getByRole("link", { name: /connections/i })).toHaveAttribute("href", "/datasources");
      expect(screen.getByRole("link", { name: /datasets/i })).toHaveAttribute("href", "/datasets");
      expect(screen.getByRole("link", { name: /reports/i })).toHaveAttribute("href", "/reports");
    });
  });
  ```

- [ ] Step 5: Run the test to confirm it fails (module doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `./AppSidebar`.

- [ ] Step 6: Create `frontend/src/components/AppSidebar.tsx`:
  ```tsx
  import { Box, Tooltip } from "@mui/material";
  import { Link, useLocation } from "react-router-dom";

  const ITEMS = [
    { to: "/datasources", label: "Connections", icon: "🔌" },
    { to: "/datasets", label: "Datasets", icon: "📚" },
    { to: "/reports", label: "Reports", icon: "📊" },
  ];

  function AppSidebar() {
    const location = useLocation();

    return (
      <Box
        component="nav"
        sx={{
          width: 56,
          flex: "0 0 56px",
          background: "var(--rail)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 1,
          py: 2,
        }}
      >
        {ITEMS.map((item) => {
          const active = location.pathname.startsWith(item.to);
          return (
            <Tooltip key={item.to} title={item.label} placement="right">
              <Box
                component={Link}
                to={item.to}
                aria-label={item.label}
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "8px",
                  display: "grid",
                  placeItems: "center",
                  fontSize: 18,
                  textDecoration: "none",
                  color: active ? "#c9c2f7" : "#9aa2b2",
                  background: active ? "rgba(91,79,230,.18)" : "transparent",
                }}
              >
                {item.icon}
              </Box>
            </Tooltip>
          );
        })}
      </Box>
    );
  }

  export default AppSidebar;
  ```

- [ ] Step 7: Run the test:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 8: Modify `frontend/src/App.tsx` — replace the top `TopNav`/`Layout` with the sidebar, and stop wrapping the editor/view routes in any shell at all (they build their own full-viewport chrome starting in Task 11). Full file after the change:
  ```tsx
  import { Box, CssBaseline } from "@mui/material";
  import { createBrowserRouter, RouterProvider } from "react-router-dom";
  import DataSourcesPage from "./pages/DataSourcesPage";
  import ReportsPage from "./pages/ReportsPage";
  import DatasetsPage from "./pages/DatasetsPage";
  import ReportCanvas from "./pages/ReportCanvas";
  import ReportView from "./pages/ReportView";
  import AppSidebar from "./components/AppSidebar";

  function AppShellLayout({ children }: { children: React.ReactNode }) {
    return (
      <>
        <CssBaseline />
        <Box sx={{ display: "flex", minHeight: "100vh" }}>
          <AppSidebar />
          <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
        </Box>
      </>
    );
  }

  const router = createBrowserRouter([
    { path: "/", element: <AppShellLayout><ReportsPage /></AppShellLayout> },
    { path: "/reports", element: <AppShellLayout><ReportsPage /></AppShellLayout> },
    { path: "/reports/:id", element: <><CssBaseline /><ReportView /></> },
    { path: "/reports/:id/edit", element: <><CssBaseline /><ReportCanvas /></> },
    { path: "/datasources", element: <AppShellLayout><DataSourcesPage /></AppShellLayout> },
    { path: "/datasets", element: <AppShellLayout><DatasetsPage /></AppShellLayout> },
  ]);

  function App() {
    return <RouterProvider router={router} />;
  }

  export default App;
  ```

- [ ] Step 9: Modify `frontend/src/pages/DataSourcesPage.tsx` — change the page heading only, to match the sidebar's "Connections" naming (find `<Typography variant="h4" gutterBottom>Data Sources</Typography>` and change the text to `Connections`):
  ```tsx
        <Typography variant="h4" gutterBottom>Connections</Typography>
  ```

- [ ] Step 10: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 11: Commit:
  ```
  git add frontend/index.html frontend/src/meridian-tokens.css frontend/src/main.tsx frontend/src/components/AppSidebar.tsx frontend/src/components/AppSidebar.test.tsx frontend/src/App.tsx frontend/src/pages/DataSourcesPage.tsx
  git commit -m "frontend: Meridian design tokens, IBM Plex fonts, persistent App shell sidebar"
  ```

---

### Task 11: Report editor shell chrome — ribbon, left rail, stage, page tabs

**Files:**
- Create: `frontend/src/reportEditor/reportEditor.css`
- Create: `frontend/src/reportEditor/Ribbon.tsx`
- Test: `frontend/src/reportEditor/Ribbon.test.tsx`
- Modify: `frontend/src/pages/ReportCanvas.tsx`

**Interfaces:**
- Consumes: `useReportQuery()` (Task 9), `QueryDefinitionForm` (Task 8), `renameReport`/`setReportDataset` (Task 7).
- Produces: `frontend/src/reportEditor/reportEditor.css` (ported Meridian classes: `.ribbon`, `.rail`, `.stage`, `.stagebar`, `.canvas`, `.canvas-empty`, `.pagetabs`, `.ptab`) — Tasks 12/14/15/20/22 all rely on these same class names. `Ribbon` component with File/Insert/View/Refresh/Save, all functioning (not stubs): File→Rename, File→Change data source, File→Back to Reports; Insert→Add Text widget; View→toggle Filters pane visibility; Refresh→`useReportQuery().refresh()`; Save→existing save flow.

- [ ] Step 1: Create `frontend/src/reportEditor/reportEditor.css` — ported from `report-designer.html`'s `<style>` block (ribbon/rail/stage/canvas/pagetabs sections only; the panes/viz/data/filters sections are added in Tasks 12/15/20 as those tasks introduce the elements that use them, to keep this file's diff traceable to what's actually wired up in each task):
  ```css
  .ribbon {
    height: 52px;
    flex: 0 0 52px;
    background: var(--panel);
    border-bottom: 1px solid var(--line);
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px;
    position: relative;
    z-index: 40;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    padding-right: 14px;
    margin-right: 6px;
    border-right: 1px solid var(--line);
    font-weight: 700;
    font-size: 15px;
  }
  .menu {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .menu button {
    background: none;
    border: 0;
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
    padding: 7px 10px;
    border-radius: 6px;
    font-family: inherit;
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--groove);
  }
  .ribbon .spacer {
    flex: 1;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .iconbtn {
    width: 32px;
    height: 32px;
    display: grid;
    place-items: center;
    border: 0;
    background: none;
    border-radius: 6px;
    color: var(--muted);
    cursor: pointer;
  }
  .iconbtn:hover {
    background: var(--groove);
    color: var(--text);
  }
  .divider-v {
    width: 1px;
    height: 22px;
    background: var(--line);
    margin: 0 4px;
  }
  .btn-primary {
    background: var(--accent);
    color: #fff;
    border: 0;
    border-radius: 7px;
    font-weight: 600;
    font-size: 13px;
    padding: 8px 15px;
    box-shadow: var(--sh-sm);
    cursor: pointer;
    font-family: inherit;
  }
  .btn-primary:hover {
    background: var(--accent-ink);
  }

  .body {
    flex: 1;
    display: flex;
    min-height: 0;
  }

  .rail {
    width: 52px;
    flex: 0 0 52px;
    background: var(--rail);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 10px 0;
    gap: 6px;
  }
  .rail .rbtn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: 0;
    background: none;
    color: #9aa2b2;
    display: grid;
    place-items: center;
    position: relative;
    cursor: pointer;
  }
  .rail .rbtn:hover {
    background: var(--rail-hover);
    color: #dfe3ec;
  }
  .rail .rbtn.active {
    background: rgba(91, 79, 230, 0.18);
    color: #c9c2f7;
  }
  .rail .rspacer {
    flex: 1;
  }

  .stage {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--canvas);
  }
  .stagebar {
    height: 34px;
    flex: 0 0 34px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 14px;
    border-bottom: 1px solid var(--line-strong);
    background: #eef1f6;
    color: var(--muted);
    font-size: 12px;
  }
  .scroll {
    flex: 1;
    overflow: auto;
    padding: 26px;
    display: flex;
    justify-content: center;
    align-items: flex-start;
  }
  .canvas {
    position: relative;
    background: var(--page);
    width: 960px;
    min-height: 600px;
    box-shadow: var(--sh-md);
    border-radius: 4px;
    background-image: linear-gradient(rgba(27, 30, 39, 0.035) 1px, transparent 1px),
      linear-gradient(90deg, rgba(27, 30, 39, 0.035) 1px, transparent 1px);
    background-size: 24px 24px;
  }
  .canvas-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--faint);
    pointer-events: none;
    text-align: center;
  }
  .canvas-empty b {
    color: var(--muted);
    font-weight: 600;
    font-size: 14px;
  }

  .pagetabs {
    height: 36px;
    flex: 0 0 36px;
    background: var(--panel);
    border-top: 1px solid var(--line);
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 8px;
  }
  .ptab {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 26px;
    padding: 0 10px;
    border-radius: 6px;
    border: 1px solid transparent;
    background: none;
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
  }
  .ptab:hover {
    background: var(--groove);
    color: var(--text);
  }
  .ptab.active {
    background: var(--accent-soft);
    color: var(--accent-ink);
    border-color: var(--accent-line);
    font-weight: 600;
  }
  ```

- [ ] Step 2: Write the failing test first — create `frontend/src/reportEditor/Ribbon.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { describe, expect, it, vi } from "vitest";
  import Ribbon from "./Ribbon";

  describe("Ribbon", () => {
    it("calls onRename when File > Rename report is chosen", async () => {
      const onRename = vi.fn();
      render(
        <Ribbon
          reportName="My Report"
          onRename={onRename}
          onChangeDataSource={vi.fn()}
          onBackToReports={vi.fn()}
          onAddText={vi.fn()}
          onToggleFilters={vi.fn()}
          onRefresh={vi.fn()}
          onSave={vi.fn()}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "File" }));
      await userEvent.click(await screen.findByText("Rename report"));

      expect(onRename).toHaveBeenCalledTimes(1);
    });

    it("calls onSave when the primary Save button is clicked", async () => {
      const onSave = vi.fn();
      render(
        <Ribbon
          reportName="My Report"
          onRename={vi.fn()}
          onChangeDataSource={vi.fn()}
          onBackToReports={vi.fn()}
          onAddText={vi.fn()}
          onToggleFilters={vi.fn()}
          onRefresh={vi.fn()}
          onSave={onSave}
        />,
      );

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });
  ```

- [ ] Step 3: Run the test to confirm it fails (module doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `./Ribbon`.

- [ ] Step 4: Create `frontend/src/reportEditor/Ribbon.tsx`:
  ```tsx
  import { useState } from "react";
  import { Menu, MenuItem } from "@mui/material";
  import "./reportEditor.css";

  function Ribbon({
    reportName, onRename, onChangeDataSource, onBackToReports, onAddText, onToggleFilters, onRefresh, onSave,
  }: {
    reportName: string;
    onRename: () => void;
    onChangeDataSource: () => void;
    onBackToReports: () => void;
    onAddText: () => void;
    onToggleFilters: () => void;
    onRefresh: () => void;
    onSave: () => void;
  }) {
    const [fileAnchor, setFileAnchor] = useState<HTMLElement | null>(null);
    const [insertAnchor, setInsertAnchor] = useState<HTMLElement | null>(null);
    const [viewAnchor, setViewAnchor] = useState<HTMLElement | null>(null);

    return (
      <div className="ribbon">
        <div className="brand">{reportName}</div>
        <div className="menu">
          <button onClick={(e) => setFileAnchor(e.currentTarget)}>File</button>
          <Menu anchorEl={fileAnchor} open={Boolean(fileAnchor)} onClose={() => setFileAnchor(null)}>
            <MenuItem onClick={() => { setFileAnchor(null); onRename(); }}>Rename report</MenuItem>
            <MenuItem onClick={() => { setFileAnchor(null); onChangeDataSource(); }}>Change data source</MenuItem>
            <MenuItem onClick={() => { setFileAnchor(null); onBackToReports(); }}>Back to Reports</MenuItem>
          </Menu>

          <button onClick={(e) => setInsertAnchor(e.currentTarget)}>Insert</button>
          <Menu anchorEl={insertAnchor} open={Boolean(insertAnchor)} onClose={() => setInsertAnchor(null)}>
            <MenuItem onClick={() => { setInsertAnchor(null); onAddText(); }}>Add Text widget</MenuItem>
          </Menu>

          <button onClick={(e) => setViewAnchor(e.currentTarget)}>View</button>
          <Menu anchorEl={viewAnchor} open={Boolean(viewAnchor)} onClose={() => setViewAnchor(null)}>
            <MenuItem onClick={() => { setViewAnchor(null); onToggleFilters(); }}>Toggle Filters pane</MenuItem>
          </Menu>
        </div>
        <div className="spacer" />
        <div className="tools">
          <button className="iconbtn" title="Refresh data" onClick={onRefresh}>⟳</button>
          <div className="divider-v" />
          <button className="btn-primary" onClick={onSave}>Save</button>
        </div>
      </div>
    );
  }

  export default Ribbon;
  ```

- [ ] Step 5: Run the test:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 6: Modify `frontend/src/pages/ReportCanvas.tsx` to mount the Ribbon + rail + `.stage`/`.canvas` skeleton around the existing gridstack canvas, and wire the File/Insert/View/Refresh actions. Full file after the change:
  ```tsx
  import { useEffect, useReducer, useRef, useState } from "react";
  import { useNavigate, useParams } from "react-router-dom";
  import { Alert, Dialog, DialogContent, DialogTitle } from "@mui/material";
  import { GridStack } from "gridstack";
  import "gridstack/dist/gridstack.min.css";
  import axios from "axios";
  import { getWidgets, saveWidgets, parseFormatOptions, type SaveWidgetRequest, type WidgetType } from "../api/widgets";
  import { renameReport, setReportDataset } from "../api/reports";
  import { widgetDraftReducer, type WidgetDraft } from "../widgets/widgetDraftReducer";
  import WidgetRenderer from "../widgets/WidgetRenderer";
  import WidgetBindingEditor from "../widgets/WidgetBindingEditor";
  import { ReportQueryProvider, useReportQuery } from "../reportEditor/ReportQueryContext";
  import Ribbon from "../reportEditor/Ribbon";
  import QueryDefinitionForm from "./QueryDefinitionForm";
  import "../reportEditor/reportEditor.css";

  let tempIdCounter = -1;

  function ReportCanvasInner() {
    const navigate = useNavigate();
    const { reportId, reportPageId, filteredResult, loading: queryLoading, refresh } = useReportQuery();

    const [widgets, dispatch] = useReducer(widgetDraftReducer, [] as WidgetDraft[]);
    const [error, setError] = useState<string | null>(null);
    const [reportName, setReportName] = useState("Report");
    const [changeSourceOpen, setChangeSourceOpen] = useState(false);
    const gridRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
      if (reportPageId === null) {
        return;
      }

      getWidgets(reportPageId)
        .then((summaries) =>
          dispatch({
            type: "loaded",
            widgets: summaries.map((s) => ({
              id: s.id, type: s.type, x: s.x, y: s.y, w: s.w, h: s.h, title: s.title, content: s.content,
              binding: s.binding
                ? { categoryField: s.binding.categoryField, valueFields: s.binding.valueFields, formatOptions: parseFormatOptions(s.binding.formatOptions) }
                : null,
            })),
          }),
        )
        .catch(() => setError("Could not load this report's widgets."));
    }, [reportPageId]);

    const widgetIds = widgets.map((w) => w.id).join(",");

    useEffect(() => {
      if (!gridRef.current) {
        return;
      }

      const grid = GridStack.init({ column: 12, cellHeight: 80 }, gridRef.current);
      if (!grid) {
        return;
      }

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

    async function handleSave() {
      if (reportPageId === null) {
        return;
      }

      setError(null);
      const payload: SaveWidgetRequest[] = widgets.map((w) => ({
        type: w.type, x: w.x, y: w.y, w: w.w, h: w.h, title: w.title, content: w.content,
        binding: w.binding
          ? { categoryField: w.binding.categoryField, valueFields: w.binding.valueFields, formatOptions: JSON.stringify(w.binding.formatOptions) }
          : null,
      }));

      try {
        await saveWidgets(reportPageId, payload);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 400) {
          setError(typeof err.response.data === "string" ? err.response.data : "Could not save this report's widgets.");
        } else {
          setError("Could not save this report's widgets.");
        }
      }
    }

    async function handleRename() {
      const next = window.prompt("Rename report", reportName);
      if (next && next.trim() !== "") {
        await renameReport(reportId, next.trim());
        setReportName(next.trim());
      }
    }

    if (queryLoading) {
      return <div>Loading…</div>;
    }

    return (
      <div className="app" style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
        <Ribbon
          reportName={reportName}
          onRename={handleRename}
          onChangeDataSource={() => setChangeSourceOpen(true)}
          onBackToReports={() => navigate("/reports")}
          onAddText={() => addWidget("Text")}
          onToggleFilters={() => {}}
          onRefresh={refresh}
          onSave={handleSave}
        />
        {error && <Alert severity="error">{error}</Alert>}
        <div className="body">
          <div className="rail">
            <button className="rbtn active" title="Report">▦</button>
            <button className="rbtn" title="Data table">☰</button>
          </div>
          <div className="stage">
            <div className="stagebar">
              <span>{widgets.length} widget{widgets.length === 1 ? "" : "s"}</span>
            </div>
            <div className="scroll">
              <div className="canvas" ref={gridRef} data-testid="gridstack-canvas">
                {widgets.length === 0 && (
                  <div className="canvas-empty">
                    <b>Build your report</b>
                    <div>Pick a visual from the right, or drag a field onto the canvas.</div>
                  </div>
                )}
                <div className="grid-stack">
                  {widgets.map((w) => (
                    <div
                      key={w.id}
                      className="grid-stack-item"
                      {...({ "gs-id": String(w.id), "gs-x": w.x, "gs-y": w.y, "gs-w": w.w, "gs-h": w.h } as Record<string, unknown>)}
                    >
                      <div className="grid-stack-item-content">
                        <button onClick={() => removeWidget(w.id)}>Remove</button>
                        <input
                          value={w.title}
                          onChange={(e) => dispatch({ type: "titleChanged", id: w.id, title: e.target.value })}
                        />
                        {w.type === "Text" && (
                          <textarea
                            value={w.content ?? ""}
                            onChange={(e) => dispatch({ type: "contentChanged", id: w.id, content: e.target.value })}
                          />
                        )}
                        <WidgetBindingEditor widget={w} columns={filteredResult?.columns ?? []} onChange={(binding) => dispatch({ type: "bindingChanged", id: w.id, binding })} />
                        <WidgetRenderer widget={w} result={filteredResult} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="pagetabs">
          <button className="ptab active">Page 1</button>
        </div>

        <Dialog open={changeSourceOpen} maxWidth="sm" fullWidth onClose={() => setChangeSourceOpen(false)}>
          <DialogTitle>Change data source</DialogTitle>
          <DialogContent>
            <QueryDefinitionForm
              onRun={async (value) => {
                const updated = await setReportDataset(reportId, value);
                const { executeDataset } = await import("../api/datasets");
                return executeDataset(updated.datasetId!);
              }}
              onSubmit={async (value) => {
                await setReportDataset(reportId, value);
                setChangeSourceOpen(false);
                await refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  function ReportCanvas() {
    const { id } = useParams<{ id: string }>();
    const reportId = Number(id);

    return (
      <ReportQueryProvider reportId={reportId}>
        <ReportCanvasInner />
      </ReportQueryProvider>
    );
  }

  export default ReportCanvas;
  ```
  Note: gridstack is now initialized directly on the `.canvas` div (`data-testid="gridstack-canvas"`) rather than a separate ref, so the dotted-grid background and the widget grid occupy the same element — matching the mockup's structure where `#canvas` *is* the gridstack container. The `.grid-stack`/`.grid-stack-item` markup is unchanged from Milestone 4, just nested one level deeper.

- [ ] Step 7: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes. If any existing `ReportCanvas`-adjacent test broke on the plain-HTML `button`/`input` swap (MUI components were replaced with bare elements to match the mockup's raw-HTML chrome), there are no such tests today (`ReportCanvas.tsx` never had a dedicated test file in this project) — nothing to fix.

- [ ] Step 8: Commit:
  ```
  git add frontend/src/reportEditor/reportEditor.css frontend/src/reportEditor/Ribbon.tsx frontend/src/reportEditor/Ribbon.test.tsx frontend/src/pages/ReportCanvas.tsx
  git commit -m "frontend: report editor shell chrome — ribbon, rail, stage, page tabs"
  ```

---

### Task 12: Visualizations pane shell — viz-type picker grid + Build/Format tabs

**Files:**
- Modify: `frontend/src/reportEditor/reportEditor.css` (append the `.pane*`/`.viz*`/`.buildtabs` sections)
- Create: `frontend/src/reportEditor/vizIcons.ts`
- Create: `frontend/src/reportEditor/VisualizationsPane.tsx`
- Test: `frontend/src/reportEditor/VisualizationsPane.test.tsx`
- Modify: `frontend/src/pages/ReportCanvas.tsx`

**Interfaces:**
- Consumes: `WidgetDraft`/`widgetDraftReducer`'s `"typeChanged"` action (Task 7).
- Produces: `VIZ_ICONS: Record<WidgetType, string>` (`vizIcons.ts`, exported SVG path data keyed by widget type) and `VIZ_LABELS: Record<WidgetType, string>` — Tasks 17-19 don't need to touch this, all 10 types' icons/labels are added here upfront since it's just a lookup table. `VisualizationsPane` component: `{ selectedWidget: WidgetDraft | null; onAddWidget: (type: WidgetType) => void; onChangeType: (type: WidgetType) => void; children: (tab: "build" | "format") => ReactNode }` — Tasks 14/16 slot their Build/Format tab content in via the `children` render-prop rather than this component owning that content directly, keeping the picker-grid-and-tabs shell decoupled from what's inside each tab.

- [ ] Step 1: Modify `frontend/src/reportEditor/reportEditor.css` — append:
  ```css
  .pane {
    background: var(--panel);
    border-left: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .pane-head {
    display: flex;
    align-items: center;
    height: 38px;
    flex: 0 0 38px;
    padding: 0 12px;
    border-bottom: 1px solid var(--line);
    font-weight: 600;
    font-size: 12.5px;
    color: var(--text);
  }
  .pane-scroll {
    flex: 1;
    overflow: auto;
  }
  .pane-viz {
    width: 256px;
    flex: 0 0 256px;
  }
  .viz-picker {
    padding: 10px 10px 12px;
    border-bottom: 1px solid var(--line);
  }
  .viz-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 5px;
  }
  .viz-cell {
    aspect-ratio: 1;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: #fff;
    color: var(--muted);
    display: grid;
    place-items: center;
    position: relative;
    cursor: pointer;
  }
  .viz-cell:hover {
    border-color: var(--accent-line);
    color: var(--accent);
    background: var(--accent-soft);
  }
  .viz-cell.active {
    border-color: var(--accent);
    color: var(--accent);
    background: var(--accent-soft);
    box-shadow: 0 0 0 1px var(--accent) inset;
  }
  .viz-cell svg {
    width: 20px;
    height: 20px;
  }
  .buildtabs {
    display: flex;
    padding: 8px 10px 0;
    gap: 2px;
    border-bottom: 1px solid var(--line);
  }
  .buildtab {
    flex: 1;
    border: 0;
    background: none;
    color: var(--muted);
    font-weight: 600;
    font-size: 12.5px;
    padding: 8px 0 9px;
    border-bottom: 2px solid transparent;
    cursor: pointer;
    font-family: inherit;
  }
  .buildtab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }
  ```

- [ ] Step 2: Create `frontend/src/reportEditor/vizIcons.ts`:
  ```ts
  import type { WidgetType } from "../api/widgets";

  export const VIZ_LABELS: Record<WidgetType, string> = {
    Bar: "Clustered column",
    ClusteredBar: "Clustered bar",
    StackedColumn: "Stacked column",
    Line: "Line chart",
    Area: "Area chart",
    Pie: "Pie chart",
    Donut: "Donut chart",
    Scatter: "Scatter chart",
    Kpi: "Card (KPI)",
    Table: "Table",
    Text: "Text box",
  };

  // Path data copied verbatim from report-designer.html's VIZ_ICONS map (viewBox 0 0 24 24).
  export const VIZ_ICON_PATHS: Record<Exclude<WidgetType, "Text">, string> = {
    Bar: '<rect x="4" y="11" width="4" height="9"/><rect x="10" y="6" width="4" height="14"/><rect x="16" y="13" width="4" height="7"/>',
    ClusteredBar: '<rect x="4" y="4" width="10" height="4"/><rect x="4" y="10" width="15" height="4"/><rect x="4" y="16" width="7" height="4"/>',
    StackedColumn: '<rect x="5" y="12" width="5" height="8"/><rect x="5" y="7" width="5" height="4"/><rect x="14" y="9" width="5" height="11"/><rect x="14" y="4" width="5" height="4"/>',
    Line: '<polyline points="4,16 9,10 13,13 20,5" fill="none" stroke-width="2"/>',
    Area: '<path d="M4 17l5-6 4 3 7-8v11z" fill-opacity=".35"/><polyline points="4,17 9,11 13,14 20,6" fill="none" stroke-width="2"/>',
    Pie: '<path d="M12 12V3a9 9 0 1 0 9 9z" fill-opacity=".35"/><path d="M12 12V3a9 9 0 0 1 9 9z"/>',
    Donut: '<circle cx="12" cy="12" r="8" fill="none" stroke-width="6" stroke-dasharray="34 60"/>',
    Scatter: '<circle cx="7" cy="15" r="1.6"/><circle cx="11" cy="9" r="1.6"/><circle cx="15" cy="13" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="9" cy="17" r="1.6"/>',
    Kpi: '<rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke-width="2"/><path d="M8 13h6M8 10h3" stroke-width="2"/>',
    Table: '<rect x="4" y="5" width="16" height="14" rx="1.5" fill="none" stroke-width="1.8"/><path d="M4 9.5h16M4 14h16M11 5.5v13" stroke-width="1.5"/>',
  };

  // Picker-grid order, matching report-designer.html's VTYPES key order.
  export const VIZ_PICKER_ORDER: Array<Exclude<WidgetType, "Text">> = [
    "Bar", "ClusteredBar", "StackedColumn", "Line", "Area", "Pie", "Donut", "Scatter", "Kpi", "Table",
  ];
  ```

- [ ] Step 3: Write the failing test first — create `frontend/src/reportEditor/VisualizationsPane.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { describe, expect, it, vi } from "vitest";
  import VisualizationsPane from "./VisualizationsPane";
  import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
  import type { WidgetDraft } from "../widgets/widgetDraftReducer";

  const kpiWidget: WidgetDraft = {
    id: 1, type: "Kpi", x: 0, y: 0, w: 2, h: 2, title: "Total", content: null,
    binding: { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS },
  };

  describe("VisualizationsPane", () => {
    it("clicking a viz-cell with nothing selected calls onAddWidget with that type", async () => {
      const onAddWidget = vi.fn();
      render(
        <VisualizationsPane selectedWidget={null} onAddWidget={onAddWidget} onChangeType={vi.fn()}>
          {() => <div>tab content</div>}
        </VisualizationsPane>,
      );

      await userEvent.click(screen.getByTitle("Table"));

      expect(onAddWidget).toHaveBeenCalledWith("Table");
    });

    it("clicking a viz-cell with a widget selected calls onChangeType instead", async () => {
      const onChangeType = vi.fn();
      render(
        <VisualizationsPane selectedWidget={kpiWidget} onAddWidget={vi.fn()} onChangeType={onChangeType}>
          {() => <div>tab content</div>}
        </VisualizationsPane>,
      );

      await userEvent.click(screen.getByTitle("Table"));

      expect(onChangeType).toHaveBeenCalledWith("Table");
    });

    it("marks the selected widget's own type as active", () => {
      render(
        <VisualizationsPane selectedWidget={kpiWidget} onAddWidget={vi.fn()} onChangeType={vi.fn()}>
          {() => <div>tab content</div>}
        </VisualizationsPane>,
      );

      expect(screen.getByTitle("Card (KPI)")).toHaveClass("active");
    });

    it("switches between Build and Format tabs", async () => {
      render(
        <VisualizationsPane selectedWidget={null} onAddWidget={vi.fn()} onChangeType={vi.fn()}>
          {(tab) => <div>current tab: {tab}</div>}
        </VisualizationsPane>,
      );

      expect(screen.getByText("current tab: build")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Format" }));

      expect(screen.getByText("current tab: format")).toBeInTheDocument();
    });
  });
  ```

- [ ] Step 4: Run the test to confirm it fails (module doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `./VisualizationsPane`.

- [ ] Step 5: Create `frontend/src/reportEditor/VisualizationsPane.tsx`:
  ```tsx
  import { useState } from "react";
  import type { ReactNode } from "react";
  import type { WidgetType } from "../api/widgets";
  import type { WidgetDraft } from "../widgets/widgetDraftReducer";
  import { VIZ_ICON_PATHS, VIZ_LABELS, VIZ_PICKER_ORDER } from "./vizIcons";
  import "./reportEditor.css";

  function VisualizationsPane({
    selectedWidget, onAddWidget, onChangeType, children,
  }: {
    selectedWidget: WidgetDraft | null;
    onAddWidget: (type: WidgetType) => void;
    onChangeType: (type: WidgetType) => void;
    children: (tab: "build" | "format") => ReactNode;
  }) {
    const [tab, setTab] = useState<"build" | "format">("build");

    function handlePick(type: WidgetType) {
      if (selectedWidget) {
        onChangeType(type);
      } else {
        onAddWidget(type);
      }
    }

    return (
      <div className="pane pane-viz">
        <div className="pane-head">Visualizations</div>
        <div className="viz-picker">
          <div className="viz-grid">
            {VIZ_PICKER_ORDER.map((type) => (
              <button
                key={type}
                type="button"
                title={VIZ_LABELS[type]}
                className={"viz-cell" + (selectedWidget?.type === type ? " active" : "")}
                onClick={() => handlePick(type)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" dangerouslySetInnerHTML={{ __html: VIZ_ICON_PATHS[type] }} />
              </button>
            ))}
          </div>
        </div>
        <div className="buildtabs">
          <button type="button" className={"buildtab" + (tab === "build" ? " active" : "")} onClick={() => setTab("build")}>Build visual</button>
          <button type="button" className={"buildtab" + (tab === "format" ? " active" : "")} onClick={() => setTab("format")}>Format</button>
        </div>
        <div className="pane-scroll">{children(tab)}</div>
      </div>
    );
  }

  export default VisualizationsPane;
  ```

- [ ] Step 6: Run the test:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 7: Modify `frontend/src/pages/ReportCanvas.tsx` to mount `VisualizationsPane` alongside the `.stage`, tracking a `selectedWidgetId` and wiring `onChangeType` to dispatch `"typeChanged"` (fields are dropped on type change here — Task 13 adds real field migration). Apply this diff: add `const [selectedWidgetId, setSelectedWidgetId] = useState<number | null>(null);` near the other `useState` calls; add `onClick={() => setSelectedWidgetId(w.id)}` to each `.grid-stack-item-content` div; wrap the `.body`'s children with the `VisualizationsPane` as a sibling of `.stage`:
  ```tsx
        <div className="body">
          <div className="rail">
            <button className="rbtn active" title="Report">▦</button>
            <button className="rbtn" title="Data table">☰</button>
          </div>
          <div className="stage">
            {/* ...unchanged stagebar/scroll/canvas from Task 11... */}
          </div>
          <VisualizationsPane
            selectedWidget={widgets.find((w) => w.id === selectedWidgetId) ?? null}
            onAddWidget={(type) => addWidget(type)}
            onChangeType={(type) => {
              if (selectedWidgetId !== null) {
                dispatch({ type: "typeChanged", id: selectedWidgetId, newType: type, binding: null });
              }
            }}
          >
            {(tab) => <div>{tab} tab content — Tasks 14/16</div>}
          </VisualizationsPane>
        </div>
  ```
  and add the import:
  ```tsx
  import VisualizationsPane from "../reportEditor/VisualizationsPane";
  ```
  (Open the actual current file from Task 11 and apply these as targeted edits rather than retyping the whole file — the `stagebar`/`scroll`/`canvas` block is unchanged.)

- [ ] Step 8: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 9: Commit:
  ```
  git add frontend/src/reportEditor/reportEditor.css frontend/src/reportEditor/vizIcons.ts frontend/src/reportEditor/VisualizationsPane.tsx frontend/src/reportEditor/VisualizationsPane.test.tsx frontend/src/pages/ReportCanvas.tsx
  git commit -m "frontend: Visualizations pane shell — viz-type picker grid, Build/Format tabs"
  ```

---

### Task 13: Field/well assignment pure functions

**Files:**
- Create: `frontend/src/reportEditor/fieldAssignment.ts`
- Test: `frontend/src/reportEditor/fieldAssignment.test.ts`

**Interfaces:**
- Consumes: `FieldKind` (`fieldClassification.ts`, Milestone 4), `WidgetBindingDraft`/`WidgetType` (Task 7).
- Produces: `WELL_SPECS: Record<WidgetType, WellSpec[]>` (full table for all 11 types, defined once — no later task edits it), `accepts(wellAccept, fieldKind)`, `assignField(binding, widgetType, wellKey, fieldName, fieldKind)`, `removeField(binding, wellKey, fieldName)`, `smartAdd(binding, widgetType, fieldName, fieldKind)`, `migrateFieldsOnTypeChange(oldBinding, newType, fieldKinds)` — Task 14 wires all of these into the Build tab UI, Task 12's `onChangeType` interim placeholder (`binding: null`) is replaced with a real call to `migrateFieldsOnTypeChange`.

- [ ] Step 1: Write the failing tests first — create `frontend/src/reportEditor/fieldAssignment.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
  import type { WidgetBindingDraft } from "../widgets/widgetDraftReducer";
  import { accepts, assignField, migrateFieldsOnTypeChange, removeField, smartAdd, WELL_SPECS } from "./fieldAssignment";

  const emptyBinding: WidgetBindingDraft = { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS };

  describe("WELL_SPECS", () => {
    it("gives Bar/StackedColumn/ClusteredBar/Line/Area exactly Axis + Values (no Legend well)", () => {
      for (const type of ["Bar", "StackedColumn", "ClusteredBar", "Line", "Area"] as const) {
        expect(WELL_SPECS[type].map((w) => w.key)).toEqual(["category", "values"]);
      }
    });

    it("gives Scatter x/y/category wells, not a generic values well", () => {
      expect(WELL_SPECS.Scatter.map((w) => w.key)).toEqual(["x", "y", "category"]);
      expect(WELL_SPECS.Scatter.find((w) => w.key === "x")!.label).toBe("X-axis");
      expect(WELL_SPECS.Scatter.find((w) => w.key === "y")!.label).toBe("Y-axis");
    });

    it("gives Text no wells at all", () => {
      expect(WELL_SPECS.Text).toEqual([]);
    });
  });

  describe("accepts", () => {
    it("a categorical well accepts both Categorical and Temporal fields", () => {
      expect(accepts("categorical", "Categorical")).toBe(true);
      expect(accepts("categorical", "Temporal")).toBe(true);
      expect(accepts("categorical", "Numeric")).toBe(false);
    });

    it("a numeric well only accepts Numeric fields", () => {
      expect(accepts("numeric", "Numeric")).toBe(true);
      expect(accepts("numeric", "Categorical")).toBe(false);
    });

    it("an any well accepts everything", () => {
      expect(accepts("any", "Unsupported")).toBe(true);
    });
  });

  describe("assignField", () => {
    it("assigning to the category well replaces any existing categoryField", () => {
      const binding = assignField(emptyBinding, "Bar", "category", "Month", "Temporal");
      const replaced = assignField(binding, "Bar", "category", "Region", "Categorical");

      expect(replaced.categoryField).toBe("Region");
    });

    it("assigning to the values well appends, up to the well's max", () => {
      let binding = assignField(emptyBinding, "Bar", "values", "Revenue", "Numeric");
      binding = assignField(binding, "Bar", "values", "Cost", "Numeric");

      expect(binding.valueFields).toEqual(["Revenue", "Cost"]);
    });

    it("assigning to a Kpi's single-slot values well replaces rather than appends", () => {
      let binding = assignField(emptyBinding, "Kpi", "values", "Revenue", "Numeric");
      binding = assignField(binding, "Kpi", "values", "Profit", "Numeric");

      expect(binding.valueFields).toEqual(["Profit"]);
    });

    it("Scatter's x well writes to valueFields[0] positionally", () => {
      const binding = assignField(emptyBinding, "Scatter", "x", "Sales", "Numeric");

      expect(binding.valueFields[0]).toBe("Sales");
    });

    it("Scatter's y well writes to valueFields[1] positionally, preserving an already-set x", () => {
      let binding = assignField(emptyBinding, "Scatter", "x", "Sales", "Numeric");
      binding = assignField(binding, "Scatter", "y", "Profit", "Numeric");

      expect(binding.valueFields).toEqual(["Sales", "Profit"]);
    });

    it("does not add a duplicate field to the same well", () => {
      let binding = assignField(emptyBinding, "Bar", "values", "Revenue", "Numeric");
      binding = assignField(binding, "Bar", "values", "Revenue", "Numeric");

      expect(binding.valueFields).toEqual(["Revenue"]);
    });
  });

  describe("removeField", () => {
    it("removes a value field", () => {
      let binding = assignField(emptyBinding, "Bar", "values", "Revenue", "Numeric");
      binding = removeField(binding, "values", "Revenue");

      expect(binding.valueFields).toEqual([]);
    });

    it("removes a category field", () => {
      let binding = assignField(emptyBinding, "Bar", "category", "Month", "Temporal");
      binding = removeField(binding, "category", "Month");

      expect(binding.categoryField).toBeNull();
    });
  });

  describe("smartAdd", () => {
    it("places a numeric field into the empty values well", () => {
      const binding = smartAdd(emptyBinding, "Bar", "Revenue", "Numeric");

      expect(binding.valueFields).toEqual(["Revenue"]);
    });

    it("places a categorical field into the empty category well", () => {
      const binding = smartAdd(emptyBinding, "Bar", "Region", "Categorical");

      expect(binding.categoryField).toBe("Region");
    });

    it("for Scatter, fills x before y", () => {
      let binding = smartAdd(emptyBinding, "Scatter", "Sales", "Numeric");
      binding = smartAdd(binding, "Scatter", "Profit", "Numeric");

      expect(binding.valueFields).toEqual(["Sales", "Profit"]);
    });
  });

  describe("migrateFieldsOnTypeChange", () => {
    it("carries a compatible categoryField and valueField over to the new type", () => {
      const oldBinding: WidgetBindingDraft = { categoryField: "Month", valueFields: ["Revenue"], formatOptions: DEFAULT_FORMAT_OPTIONS };
      const fieldKinds = { Month: "Temporal" as const, Revenue: "Numeric" as const };

      const migrated = migrateFieldsOnTypeChange(oldBinding, "Line", fieldKinds);

      expect(migrated.categoryField).toBe("Month");
      expect(migrated.valueFields).toEqual(["Revenue"]);
    });

    it("drops a field with no compatible well in the new type (e.g. two value fields migrating to Kpi)", () => {
      const oldBinding: WidgetBindingDraft = { categoryField: "Month", valueFields: ["Revenue", "Cost"], formatOptions: DEFAULT_FORMAT_OPTIONS };
      const fieldKinds = { Month: "Temporal" as const, Revenue: "Numeric" as const, Cost: "Numeric" as const };

      const migrated = migrateFieldsOnTypeChange(oldBinding, "Kpi", fieldKinds);

      expect(migrated.categoryField).toBeNull();
      expect(migrated.valueFields).toEqual(["Revenue"]);
    });

    it("preserves the previous formatOptions", () => {
      const custom = { ...DEFAULT_FORMAT_OPTIONS, showLegend: false };
      const oldBinding: WidgetBindingDraft = { categoryField: null, valueFields: [], formatOptions: custom };

      const migrated = migrateFieldsOnTypeChange(oldBinding, "Table", {});

      expect(migrated.formatOptions).toEqual(custom);
    });
  });
  ```

- [ ] Step 2: Run the tests to confirm they fail (module doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `./fieldAssignment`.

- [ ] Step 3: Create `frontend/src/reportEditor/fieldAssignment.ts`:
  ```ts
  import type { FieldKind } from "../widgets/fieldClassification";
  import type { WidgetBindingDraft } from "../widgets/widgetDraftReducer";
  import type { WidgetType } from "../api/widgets";

  export interface WellSpec {
    key: "category" | "values" | "x" | "y";
    label: string;
    accept: "categorical" | "numeric" | "any";
    max: number;
  }

  const AXIS_VALUES_WELLS: WellSpec[] = [
    { key: "category", label: "Axis", accept: "categorical", max: 1 },
    { key: "values", label: "Values", accept: "numeric", max: 6 },
  ];

  const LEGEND_CATEGORY_VALUE_WELLS: WellSpec[] = [
    { key: "category", label: "Legend", accept: "categorical", max: 1 },
    { key: "values", label: "Values", accept: "numeric", max: 1 },
  ];

  export const WELL_SPECS: Record<WidgetType, WellSpec[]> = {
    Bar: AXIS_VALUES_WELLS,
    ClusteredBar: AXIS_VALUES_WELLS,
    StackedColumn: AXIS_VALUES_WELLS,
    Line: AXIS_VALUES_WELLS,
    Area: AXIS_VALUES_WELLS,
    Pie: LEGEND_CATEGORY_VALUE_WELLS,
    Donut: LEGEND_CATEGORY_VALUE_WELLS,
    Scatter: [
      { key: "x", label: "X-axis", accept: "numeric", max: 1 },
      { key: "y", label: "Y-axis", accept: "numeric", max: 1 },
      { key: "category", label: "Details", accept: "categorical", max: 1 },
    ],
    Kpi: [{ key: "values", label: "Fields", accept: "numeric", max: 1 }],
    Table: [{ key: "values", label: "Columns", accept: "any", max: 8 }],
    Text: [],
  };

  export function accepts(wellAccept: WellSpec["accept"], fieldKind: FieldKind): boolean {
    if (wellAccept === "any") {
      return true;
    }
    if (wellAccept === "numeric") {
      return fieldKind === "Numeric";
    }
    return fieldKind === "Categorical" || fieldKind === "Temporal";
  }

  function wellFor(widgetType: WidgetType, wellKey: string): WellSpec | undefined {
    return WELL_SPECS[widgetType].find((w) => w.key === wellKey);
  }

  export function assignField(
    binding: WidgetBindingDraft,
    widgetType: WidgetType,
    wellKey: string,
    fieldName: string,
    _fieldKind: FieldKind,
  ): WidgetBindingDraft {
    const well = wellFor(widgetType, wellKey);
    if (!well) {
      return binding;
    }

    if (wellKey === "category") {
      return { ...binding, categoryField: fieldName };
    }

    if (wellKey === "x") {
      const next = [...binding.valueFields];
      next[0] = fieldName;
      return { ...binding, valueFields: next };
    }

    if (wellKey === "y") {
      const next = [...binding.valueFields];
      next[1] = fieldName;
      return { ...binding, valueFields: next };
    }

    // "values" well
    if (binding.valueFields.includes(fieldName)) {
      return binding;
    }

    if (well.max === 1) {
      return { ...binding, valueFields: [fieldName] };
    }

    if (binding.valueFields.length >= well.max) {
      return binding;
    }

    return { ...binding, valueFields: [...binding.valueFields, fieldName] };
  }

  export function removeField(binding: WidgetBindingDraft, wellKey: string, fieldName: string): WidgetBindingDraft {
    if (wellKey === "category") {
      return binding.categoryField === fieldName ? { ...binding, categoryField: null } : binding;
    }

    return { ...binding, valueFields: binding.valueFields.filter((f) => f !== fieldName) };
  }

  export function smartAdd(
    binding: WidgetBindingDraft,
    widgetType: WidgetType,
    fieldName: string,
    fieldKind: FieldKind,
  ): WidgetBindingDraft {
    const wells = WELL_SPECS[widgetType];

    function wellFieldCount(well: WellSpec): number {
      if (well.key === "category") {
        return binding.categoryField ? 1 : 0;
      }
      if (well.key === "x") {
        return binding.valueFields[0] ? 1 : 0;
      }
      if (well.key === "y") {
        return binding.valueFields[1] ? 1 : 0;
      }
      return binding.valueFields.length;
    }

    const target =
      wells.find((w) => accepts(w.accept, fieldKind) && wellFieldCount(w) === 0) ??
      wells.find((w) => accepts(w.accept, fieldKind) && wellFieldCount(w) < w.max);

    if (!target) {
      return binding;
    }

    return assignField(binding, widgetType, target.key, fieldName, fieldKind);
  }

  export function migrateFieldsOnTypeChange(
    oldBinding: WidgetBindingDraft,
    newType: WidgetType,
    fieldKinds: Record<string, FieldKind>,
  ): WidgetBindingDraft {
    const flatFields: string[] = [];
    if (oldBinding.categoryField) {
      flatFields.push(oldBinding.categoryField);
    }
    flatFields.push(...oldBinding.valueFields);

    let binding: WidgetBindingDraft = { categoryField: null, valueFields: [], formatOptions: oldBinding.formatOptions };

    for (const fieldName of flatFields) {
      const kind = fieldKinds[fieldName];
      if (!kind) {
        continue;
      }
      binding = smartAdd(binding, newType, fieldName, kind);
    }

    return binding;
  }
  ```

- [ ] Step 4: Run the tests:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 5: Commit:
  ```
  git add frontend/src/reportEditor/fieldAssignment.ts frontend/src/reportEditor/fieldAssignment.test.ts
  git commit -m "frontend: pure field/well assignment functions (assignField, smartAdd, migrateFieldsOnTypeChange)"
  ```

---

### Task 14: Build tab — wells UI wired to drag-and-drop, replaces `WidgetBindingEditor`

**Files:**
- Modify: `frontend/src/reportEditor/reportEditor.css` (append `.wells`/`.well-box`/`.pill` sections)
- Create: `frontend/src/reportEditor/BuildTab.tsx`
- Test: `frontend/src/reportEditor/BuildTab.test.tsx`
- Delete: `frontend/src/widgets/WidgetBindingEditor.tsx`
- Delete: `frontend/src/widgets/WidgetBindingEditor.test.tsx`
- Modify: `frontend/src/pages/ReportCanvas.tsx`

**Interfaces:**
- Consumes: `WELL_SPECS`, `assignField`, `removeField` (Task 13), native HTML5 `dragstart`/`drop` (no library — Task 15's Data pane rows are the drag source).
- Produces: `BuildTab` component: `{ widget: WidgetDraft; columns: ColumnDescriptor[]; onChange: (binding: WidgetBindingDraft | null) => void }` — slotted into `VisualizationsPane`'s Build tab in `ReportCanvas.tsx`. This is the only place a field gets dropped onto a well from here on; the Data pane (Task 15) is a drag source only.

- [ ] Step 1: Modify `frontend/src/reportEditor/reportEditor.css` — append:
  ```css
  .wells {
    padding: 10px;
  }
  .no-visual {
    color: var(--faint);
    font-size: 12px;
    line-height: 1.55;
    padding: 16px 12px;
    text-align: center;
  }
  .well {
    margin-bottom: 10px;
  }
  .well-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    font-weight: 600;
    margin: 0 0 5px;
  }
  .well-box {
    min-height: 36px;
    border: 1px dashed var(--line-strong);
    border-radius: 7px;
    padding: 5px;
    background: var(--panel-2);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .well-box.drop-hot {
    border-color: var(--accent);
    border-style: solid;
    background: var(--accent-soft);
  }
  .well-box .hint {
    color: var(--faint);
    font-size: 11.5px;
    padding: 5px 6px;
  }
  .pill {
    display: flex;
    align-items: center;
    gap: 7px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 5px 7px;
    font-size: 12px;
    box-shadow: var(--sh-sm);
  }
  .pill .gl {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    border-radius: 4px;
    display: grid;
    place-items: center;
    font-size: 10px;
    font-weight: 700;
    font-family: "IBM Plex Mono", monospace;
  }
  .gl.dim {
    background: #e4f4f1;
    color: #0f8b7d;
  }
  .gl.measure {
    background: var(--accent-soft);
    color: var(--accent-ink);
  }
  .gl.date {
    background: #fdeede;
    color: #c9701e;
  }
  .pill .pname {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pill .x {
    border: 0;
    background: none;
    color: var(--faint);
    width: 16px;
    height: 16px;
    border-radius: 4px;
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .pill .x:hover {
    background: var(--groove);
    color: var(--text);
  }
  ```

- [ ] Step 2: Write the failing test first — create `frontend/src/reportEditor/BuildTab.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { describe, expect, it, vi } from "vitest";
  import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
  import type { WidgetDraft } from "../widgets/widgetDraftReducer";
  import BuildTab from "./BuildTab";

  const columns = [
    { name: "Month", nativeType: "nvarchar(20)" },
    { name: "Revenue", nativeType: "decimal(18,2)" },
  ];

  function makeWidget(overrides: Partial<WidgetDraft>): WidgetDraft {
    return {
      id: 1, type: "Bar", x: 0, y: 0, w: 4, h: 3, title: "W", content: null,
      binding: { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS },
      ...overrides,
    };
  }

  describe("BuildTab", () => {
    it("shows a no-visual message when nothing is selected", () => {
      render(<BuildTab widget={null} columns={columns} onChange={vi.fn()} />);

      expect(screen.getByText(/select a visual/i)).toBeInTheDocument();
    });

    it("renders one well per the widget type's WELL_SPECS entry, labeled correctly", () => {
      render(<BuildTab widget={makeWidget({})} columns={columns} onChange={vi.fn()} />);

      expect(screen.getByText("Axis")).toBeInTheDocument();
      expect(screen.getByText("Values")).toBeInTheDocument();
    });

    it("shows Scatter's wells labeled X-axis/Y-axis, not a generic Values list", () => {
      render(
        <BuildTab
          widget={makeWidget({ type: "Scatter", binding: { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS } })}
          columns={columns}
          onChange={vi.fn()}
        />,
      );

      expect(screen.getByText("X-axis")).toBeInTheDocument();
      expect(screen.getByText("Y-axis")).toBeInTheDocument();
    });

    it("shows a pill for an already-assigned field, removable via its x button", async () => {
      const onChange = vi.fn();
      render(
        <BuildTab
          widget={makeWidget({ binding: { categoryField: "Month", valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS } })}
          columns={columns}
          onChange={onChange}
        />,
      );

      expect(screen.getByText("Month")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: /remove month/i }));

      expect(onChange).toHaveBeenCalledWith({ categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS });
    });
  });
  ```

- [ ] Step 3: Run the tests to confirm they fail (module doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `./BuildTab`.

- [ ] Step 4: Create `frontend/src/reportEditor/BuildTab.tsx`:
  ```tsx
  import { useState } from "react";
  import { classify } from "../widgets/fieldClassification";
  import type { ColumnDescriptor } from "../api/datasets";
  import type { WidgetBindingDraft, WidgetDraft } from "../widgets/widgetDraftReducer";
  import { assignField, removeField, WELL_SPECS } from "./fieldAssignment";
  import "./reportEditor.css";

  function glyphFor(nativeType: string): { glyphClass: string; glyph: string } {
    const kind = classify(nativeType);
    if (kind === "Numeric") {
      return { glyphClass: "measure", glyph: "Σ" };
    }
    if (kind === "Temporal") {
      return { glyphClass: "date", glyph: "▦" };
    }
    return { glyphClass: "dim", glyph: "Abc" };
  }

  function fieldNamesInWell(binding: WidgetBindingDraft, wellKey: string): string[] {
    if (wellKey === "category") {
      return binding.categoryField ? [binding.categoryField] : [];
    }
    if (wellKey === "x") {
      return binding.valueFields[0] ? [binding.valueFields[0]] : [];
    }
    if (wellKey === "y") {
      return binding.valueFields[1] ? [binding.valueFields[1]] : [];
    }
    return binding.valueFields;
  }

  function BuildTab({
    widget, columns, onChange,
  }: {
    widget: WidgetDraft | null;
    columns: ColumnDescriptor[];
    onChange: (binding: WidgetBindingDraft | null) => void;
  }) {
    const [dropHotWell, setDropHotWell] = useState<string | null>(null);

    if (!widget || widget.type === "Text" || !widget.binding) {
      return <div className="no-visual">Select a visual to configure its fields, or drag a field onto the canvas to start.</div>;
    }

    const binding = widget.binding;
    const wells = WELL_SPECS[widget.type];
    const columnByName = (name: string) => columns.find((c) => c.name === name);

    function handleDrop(wellKey: string, fieldName: string) {
      setDropHotWell(null);
      const column = columnByName(fieldName);
      if (!column || !widget!.binding) {
        return;
      }
      onChange(assignField(widget!.binding, widget!.type, wellKey, fieldName, classify(column.nativeType)));
    }

    return (
      <div className="wells">
        {wells.map((well) => (
          <div className="well" key={well.key}>
            <p className="well-label">{well.label}</p>
            <div
              className={"well-box" + (dropHotWell === well.key ? " drop-hot" : "")}
              onDragOver={(e) => { e.preventDefault(); setDropHotWell(well.key); }}
              onDragLeave={() => setDropHotWell(null)}
              onDrop={(e) => {
                e.preventDefault();
                const fieldName = e.dataTransfer.getData("text/field");
                if (fieldName) {
                  handleDrop(well.key, fieldName);
                }
              }}
            >
              {fieldNamesInWell(binding, well.key).length === 0 && <div className="hint">Add data fields here</div>}
              {fieldNamesInWell(binding, well.key).map((fieldName) => {
                const column = columnByName(fieldName);
                const { glyphClass, glyph } = glyphFor(column?.nativeType ?? "");
                return (
                  <div className="pill" key={fieldName}>
                    <span className={`gl ${glyphClass}`}>{glyph}</span>
                    <span className="pname">{fieldName}</span>
                    <button
                      type="button"
                      className="x"
                      aria-label={`Remove ${fieldName}`}
                      onClick={() => onChange(removeField(binding, well.key, fieldName))}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  export default BuildTab;
  ```

- [ ] Step 5: Run the tests:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 6: Delete the superseded dropdown editor:
  ```
  git rm frontend/src/widgets/WidgetBindingEditor.tsx frontend/src/widgets/WidgetBindingEditor.test.tsx
  ```

- [ ] Step 7: Modify `frontend/src/pages/ReportCanvas.tsx` — replace every `<WidgetBindingEditor .../>` usage (there are two: one inside the `.grid-stack-item-content` per-widget block, which is removed entirely now that field assignment happens in the Visualizations pane, not per-widget on the canvas) and wire `VisualizationsPane`'s `children` render-prop to `BuildTab` for the `"build"` tab (the `"format"` tab keeps its Task-12 placeholder until Task 16). Apply these targeted edits to the file from Task 12:
  - Remove the `import WidgetBindingEditor from "../widgets/WidgetBindingEditor";` line and the `<WidgetBindingEditor .../>` element inside the widget-rendering loop.
  - Remove the `columns={filteredResult?.columns ?? []}` prop that was only ever passed to `WidgetBindingEditor` (keep `filteredResult` itself, still used by `WidgetRenderer` and the new `BuildTab`).
  - Add `import BuildTab from "../reportEditor/BuildTab";`.
  - Replace the `children` render-prop body of `VisualizationsPane`:
    ```tsx
          <VisualizationsPane
            selectedWidget={widgets.find((w) => w.id === selectedWidgetId) ?? null}
            onAddWidget={(type) => addWidget(type)}
            onChangeType={(type) => {
              if (selectedWidgetId !== null) {
                dispatch({ type: "typeChanged", id: selectedWidgetId, newType: type, binding: null });
              }
            }}
          >
            {(tab) =>
              tab === "build"
                ? (
                  <BuildTab
                    widget={widgets.find((w) => w.id === selectedWidgetId) ?? null}
                    columns={filteredResult?.columns ?? []}
                    onChange={(binding) => {
                      if (selectedWidgetId !== null) {
                        dispatch({ type: "bindingChanged", id: selectedWidgetId, binding });
                      }
                    }}
                  />
                )
                : <div>format tab content — Task 16</div>
            }
          </VisualizationsPane>
    ```

- [ ] Step 8: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 9: Commit:
  ```
  git add frontend/src/reportEditor/reportEditor.css frontend/src/reportEditor/BuildTab.tsx frontend/src/reportEditor/BuildTab.test.tsx frontend/src/pages/ReportCanvas.tsx
  git commit -m "frontend: Build tab wells UI replaces the dropdown-based WidgetBindingEditor"
  ```

---

### Task 15: Data pane — searchable, draggable, checkbox-driven field list

**Files:**
- Modify: `frontend/src/reportEditor/reportEditor.css` (append `.pane-data`/`.field-row` sections)
- Create: `frontend/src/reportEditor/DataPane.tsx`
- Test: `frontend/src/reportEditor/DataPane.test.tsx`
- Modify: `frontend/src/pages/ReportCanvas.tsx`

**Interfaces:**
- Consumes: `classify` (`fieldClassification.ts`), `smartAdd` (Task 13).
- Produces: `DataPane` component: `{ columns: ColumnDescriptor[]; selectedWidget: WidgetDraft | null; onSmartAdd: (fieldName: string, fieldKind: FieldKind) => void }` — sets `dataTransfer.setData("text/field", name)` on `dragstart`, exactly matching `BuildTab`'s drop handler's `"text/field"` read (Task 14) and the mockup's own wire format.

- [ ] Step 1: Modify `frontend/src/reportEditor/reportEditor.css` — append:
  ```css
  .pane-data {
    width: 224px;
    flex: 0 0 224px;
  }
  .data-search {
    padding: 10px 10px 6px;
  }
  .data-search input {
    width: 100%;
    border: 1px solid var(--line-strong);
    border-radius: 7px;
    padding: 7px 9px;
    font-size: 12.5px;
    font-family: inherit;
  }
  .field-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 11px;
    cursor: grab;
  }
  .field-row:hover {
    background: var(--accent-soft);
  }
  .field-row input {
    accent-color: var(--accent);
    width: 14px;
    height: 14px;
    flex: 0 0 14px;
  }
  .field-row .fgl {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    border-radius: 3px;
    display: grid;
    place-items: center;
    font-size: 9px;
    font-weight: 700;
    font-family: "IBM Plex Mono", monospace;
  }
  .field-row .fname {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
  }
  ```

- [ ] Step 2: Write the failing test first — create `frontend/src/reportEditor/DataPane.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { describe, expect, it, vi } from "vitest";
  import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
  import type { WidgetDraft } from "../widgets/widgetDraftReducer";
  import DataPane from "./DataPane";

  const columns = [
    { name: "Region", nativeType: "nvarchar(20)" },
    { name: "Month", nativeType: "date" },
    { name: "Revenue", nativeType: "decimal(18,2)" },
  ];

  describe("DataPane", () => {
    it("lists every column, filtered by the search box", async () => {
      render(<DataPane columns={columns} selectedWidget={null} onSmartAdd={vi.fn()} />);

      await userEvent.type(screen.getByPlaceholderText("Search fields"), "rev");

      expect(screen.getByText("Revenue")).toBeInTheDocument();
      expect(screen.queryByText("Region")).not.toBeInTheDocument();
    });

    it("checking a field's checkbox calls onSmartAdd with its name and classified kind", async () => {
      const onSmartAdd = vi.fn();
      render(<DataPane columns={columns} selectedWidget={null} onSmartAdd={onSmartAdd} />);

      await userEvent.click(screen.getByRole("checkbox", { name: "Revenue" }));

      expect(onSmartAdd).toHaveBeenCalledWith("Revenue", "Numeric");
    });

    it("marks a field's checkbox checked when it's already used in the selected widget's binding", () => {
      const widget: WidgetDraft = {
        id: 1, type: "Bar", x: 0, y: 0, w: 4, h: 3, title: "W", content: null,
        binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: DEFAULT_FORMAT_OPTIONS },
      };

      render(<DataPane columns={columns} selectedWidget={widget} onSmartAdd={vi.fn()} />);

      expect(screen.getByRole("checkbox", { name: "Month" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Revenue" })).toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Region" })).not.toBeChecked();
    });
  });
  ```

- [ ] Step 3: Run the tests to confirm they fail (module doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `./DataPane`.

- [ ] Step 4: Create `frontend/src/reportEditor/DataPane.tsx`:
  ```tsx
  import { useState } from "react";
  import type { ColumnDescriptor } from "../api/datasets";
  import { classify } from "../widgets/fieldClassification";
  import type { WidgetDraft } from "../widgets/widgetDraftReducer";
  import "./reportEditor.css";

  function glyphFor(nativeType: string): { glyphClass: string; glyph: string } {
    const kind = classify(nativeType);
    if (kind === "Numeric") {
      return { glyphClass: "measure", glyph: "Σ" };
    }
    if (kind === "Temporal") {
      return { glyphClass: "date", glyph: "▦" };
    }
    return { glyphClass: "dim", glyph: "Abc" };
  }

  function isFieldUsed(widget: WidgetDraft | null, fieldName: string): boolean {
    if (!widget?.binding) {
      return false;
    }
    return widget.binding.categoryField === fieldName || widget.binding.valueFields.includes(fieldName);
  }

  function DataPane({
    columns, selectedWidget, onSmartAdd,
  }: {
    columns: ColumnDescriptor[];
    selectedWidget: WidgetDraft | null;
    onSmartAdd: (fieldName: string, fieldKind: ReturnType<typeof classify>) => void;
  }) {
    const [search, setSearch] = useState("");

    const filtered = columns.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

    return (
      <div className="pane pane-data">
        <div className="pane-head">Data</div>
        <div className="data-search">
          <input placeholder="Search fields" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="pane-scroll">
          {filtered.map((column) => {
            const { glyphClass, glyph } = glyphFor(column.nativeType);
            const kind = classify(column.nativeType);
            return (
              <div
                className="field-row"
                key={column.name}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/field", column.name);
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <input
                  type="checkbox"
                  aria-label={column.name}
                  checked={isFieldUsed(selectedWidget, column.name)}
                  onChange={() => onSmartAdd(column.name, kind)}
                />
                <span className={`fgl gl ${glyphClass}`}>{glyph}</span>
                <span className="fname">{column.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  export default DataPane;
  ```

- [ ] Step 5: Run the tests:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 6: Modify `frontend/src/pages/ReportCanvas.tsx` — mount `DataPane` as the far-right pane (sibling of `VisualizationsPane`, inside `.body`), wired to `smartAdd`:
  - Add the import: `import DataPane from "../reportEditor/DataPane"; import { smartAdd } from "../reportEditor/fieldAssignment";`
  - After the `</VisualizationsPane>` closing tag, add:
    ```tsx
          <DataPane
            columns={filteredResult?.columns ?? []}
            selectedWidget={widgets.find((w) => w.id === selectedWidgetId) ?? null}
            onSmartAdd={(fieldName, fieldKind) => {
              if (selectedWidgetId === null) {
                return;
              }
              const widget = widgets.find((w) => w.id === selectedWidgetId);
              if (!widget?.binding) {
                return;
              }
              dispatch({ type: "bindingChanged", id: selectedWidgetId, binding: smartAdd(widget.binding, widget.type, fieldName, fieldKind) });
            }}
          />
    ```
  (Unchecking a field to remove it, and smart-adding a field when nothing is selected — creating a new widget first — are deliberately deferred: this task only wires the "already-selected-widget" path; the mockup's "no widget selected → create one" behavior is folded into Task 24's polish pass once every widget-type task has landed, since `smartAdd` alone can't decide *which* type to create.)

- [ ] Step 7: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 8: Commit:
  ```
  git add frontend/src/reportEditor/reportEditor.css frontend/src/reportEditor/DataPane.tsx frontend/src/reportEditor/DataPane.test.tsx frontend/src/pages/ReportCanvas.tsx
  git commit -m "frontend: Data pane — searchable, draggable, checkbox-driven field list"
  ```

---

### Task 16: Format tab — title, legend, gridlines, palette, sort, data labels

**Files:**
- Modify: `frontend/src/reportEditor/reportEditor.css` (append `.format`/`.frow`/`.switch`/`.swatches` sections)
- Create: `frontend/src/reportEditor/FormatTab.tsx`
- Test: `frontend/src/reportEditor/FormatTab.test.tsx`
- Modify: `frontend/src/widgets/shaping.ts`
- Test: `frontend/src/widgets/shaping.test.ts`
- Modify: `frontend/src/pages/ReportCanvas.tsx`

**Interfaces:**
- Consumes: `WidgetFormatOptions` (Task 7).
- Produces: `FormatTab` component: `{ widget: WidgetDraft | null; onChange: (binding: WidgetBindingDraft) => void }`. `shapeBarOption`/`shapeLineOption`/`shapePieOption` gain an optional 4th `options` parameter accepting `{ sortDirection?, dataLabels? }` (on top of the `stacked`/`horizontal`/`area`/`donut` flags Tasks 17-18 add) — every widget component built from Task 17 onward passes `widget.binding.formatOptions` through to its shaping call.

- [ ] Step 1: Modify `frontend/src/reportEditor/reportEditor.css` — append:
  ```css
  .format {
    padding: 12px;
  }
  .fgroup {
    border: 1px solid var(--line);
    border-radius: 8px;
    margin-bottom: 9px;
    overflow: hidden;
  }
  .fgroup > summary {
    list-style: none;
    cursor: pointer;
    padding: 10px 11px;
    font-weight: 600;
    background: var(--panel-2);
  }
  .fgroup > summary::-webkit-details-marker {
    display: none;
  }
  .fbody {
    padding: 11px;
  }
  .frow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 11px;
  }
  .frow:last-child {
    margin-bottom: 0;
  }
  .frow label {
    color: var(--text);
    font-size: 12.5px;
  }
  .text-in {
    width: 100%;
    border: 1px solid var(--line-strong);
    border-radius: 6px;
    padding: 7px 9px;
    font-family: inherit;
    font-size: 12.5px;
  }
  .swatches {
    display: flex;
    gap: 6px;
  }
  .swatch {
    width: 26px;
    height: 22px;
    border-radius: 5px;
    border: 2px solid transparent;
    cursor: pointer;
  }
  .swatch.active {
    border-color: var(--text);
  }
  ```

- [ ] Step 2: Write the failing test first — create `frontend/src/reportEditor/FormatTab.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { describe, expect, it, vi } from "vitest";
  import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
  import type { WidgetDraft } from "../widgets/widgetDraftReducer";
  import FormatTab from "./FormatTab";

  function makeWidget(): WidgetDraft {
    return {
      id: 1, type: "Bar", x: 0, y: 0, w: 4, h: 3, title: "W", content: null,
      binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: DEFAULT_FORMAT_OPTIONS },
    };
  }

  describe("FormatTab", () => {
    it("shows a no-visual message when nothing is selected", () => {
      render(<FormatTab widget={null} onChange={vi.fn()} />);
      expect(screen.getByText(/select a visual/i)).toBeInTheDocument();
    });

    it("toggling Show legend updates formatOptions.showLegend", async () => {
      const onChange = vi.fn();
      render(<FormatTab widget={makeWidget()} onChange={onChange} />);

      await userEvent.click(screen.getByRole("checkbox", { name: "Show legend" }));

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        formatOptions: expect.objectContaining({ showLegend: false }),
      }));
    });

    it("toggling the data labels switch updates formatOptions.dataLabels", async () => {
      const onChange = vi.fn();
      render(<FormatTab widget={makeWidget()} onChange={onChange} />);

      await userEvent.click(screen.getByRole("checkbox", { name: "Data labels" }));

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        formatOptions: expect.objectContaining({ dataLabels: true }),
      }));
    });

    it("clicking a palette swatch updates formatOptions.palette", async () => {
      const onChange = vi.fn();
      render(<FormatTab widget={makeWidget()} onChange={onChange} />);

      await userEvent.click(screen.getByTitle("ocean"));

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        formatOptions: expect.objectContaining({ palette: "ocean" }),
      }));
    });

    it("clicking the sort-direction toggle cycles null -> asc -> desc -> null", async () => {
      const onChange = vi.fn();
      const widget = makeWidget();
      render(<FormatTab widget={widget} onChange={onChange} />);

      await userEvent.click(screen.getByRole("button", { name: /sort/i }));

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        formatOptions: expect.objectContaining({ sortDirection: "asc" }),
      }));
    });
  });
  ```

- [ ] Step 3: Run the tests to confirm they fail (module doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `./FormatTab`.

- [ ] Step 4: Create `frontend/src/reportEditor/FormatTab.tsx`:
  ```tsx
  import type { WidgetBindingDraft, WidgetDraft } from "../widgets/widgetDraftReducer";
  import "./reportEditor.css";

  const PALETTE_NAMES = ["meridian", "ocean", "sunset", "forest"];
  const PALETTE_SWATCH_COLORS: Record<string, string> = {
    meridian: "#5b4fe6",
    ocean: "#0ea5e9",
    sunset: "#f5a524",
    forest: "#46a758",
  };

  function nextSortDirection(current: "asc" | "desc" | null): "asc" | "desc" | null {
    if (current === null) {
      return "asc";
    }
    if (current === "asc") {
      return "desc";
    }
    return null;
  }

  function FormatTab({ widget, onChange }: { widget: WidgetDraft | null; onChange: (binding: WidgetBindingDraft) => void }) {
    if (!widget || !widget.binding) {
      return <div className="no-visual">Select a visual to format it.</div>;
    }

    const binding = widget.binding;
    const options = binding.formatOptions;

    function update(partial: Partial<typeof options>) {
      onChange({ ...binding, formatOptions: { ...options, ...partial } });
    }

    return (
      <div className="format">
        <details className="fgroup" open>
          <summary>Title</summary>
          <div className="fbody">
            <div className="frow">
              <label htmlFor="format-show-title">Show title</label>
              <input id="format-show-title" type="checkbox" checked={options.showTitle} onChange={(e) => update({ showTitle: e.target.checked })} />
            </div>
            <div className="frow" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
              <label htmlFor="format-title-text">Title text</label>
              <input id="format-title-text" className="text-in" value={options.title ?? ""} onChange={(e) => update({ title: e.target.value || null })} />
            </div>
          </div>
        </details>

        <details className="fgroup" open>
          <summary>Legend &amp; colors</summary>
          <div className="fbody">
            <div className="frow">
              <label htmlFor="format-show-legend">Show legend</label>
              <input id="format-show-legend" type="checkbox" checked={options.showLegend} onChange={(e) => update({ showLegend: e.target.checked })} />
            </div>
            <div className="frow">
              <label htmlFor="format-grid">Gridlines</label>
              <input id="format-grid" type="checkbox" checked={options.grid} onChange={(e) => update({ grid: e.target.checked })} />
            </div>
            <div className="frow" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
              <label>Color theme</label>
              <div className="swatches">
                {PALETTE_NAMES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    className={"swatch" + (options.palette === name ? " active" : "")}
                    style={{ background: PALETTE_SWATCH_COLORS[name] }}
                    onClick={() => update({ palette: name })}
                  />
                ))}
              </div>
            </div>
          </div>
        </details>

        <details className="fgroup" open>
          <summary>Sort &amp; labels</summary>
          <div className="fbody">
            <div className="frow">
              <label>Sort ({options.sortDirection ?? "none"})</label>
              <button type="button" aria-label="Sort direction" onClick={() => update({ sortDirection: nextSortDirection(options.sortDirection) })}>
                Sort
              </button>
            </div>
            <div className="frow">
              <label htmlFor="format-data-labels">Data labels</label>
              <input id="format-data-labels" type="checkbox" checked={options.dataLabels} onChange={(e) => update({ dataLabels: e.target.checked })} />
            </div>
          </div>
        </details>
      </div>
    );
  }

  export default FormatTab;
  ```

- [ ] Step 5: Run the tests:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 6: Write the failing tests first — append to `frontend/src/widgets/shaping.test.ts` (inside the relevant `describe` blocks):
  ```ts
  describe("shapeBarOption sort/data-labels options", () => {
    it("sorts series data ascending by value when sortDirection is asc", () => {
      const option = shapeBarOption(result, "Month", ["Revenue"], { sortDirection: "asc" });

      expect(option.xAxis).toMatchObject({ data: ["Jan", "Feb"] });
      const series = option.series as Array<{ data: number[] }>;
      expect(series[0].data).toEqual([100, 150]);
    });

    it("sorts series data descending by value when sortDirection is desc", () => {
      const option = shapeBarOption(result, "Month", ["Revenue"], { sortDirection: "desc" });

      expect(option.xAxis).toMatchObject({ data: ["Feb", "Jan"] });
    });

    it("enables data labels on every series when dataLabels is true", () => {
      const option = shapeBarOption(result, "Month", ["Revenue"], { dataLabels: true });

      const series = option.series as Array<{ label?: { show: boolean } }>;
      expect(series[0].label).toMatchObject({ show: true });
    });

    it("leaves data unsorted and labels off by default", () => {
      const option = shapeBarOption(result, "Month", ["Revenue"]);

      expect(option.xAxis).toMatchObject({ data: ["Jan", "Feb"] });
      const series = option.series as Array<{ label?: { show: boolean } }>;
      expect(series[0].label).toBeUndefined();
    });
  });
  ```

- [ ] Step 7: Run the tests to confirm they fail (no 4th parameter accepted yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: `tsc -b` error — `shapeBarOption` doesn't accept a 4th argument yet.

- [ ] Step 8: Modify `frontend/src/widgets/shaping.ts` — extend `buildCategorySeriesOption` and `shapeBarOption`'s signature (the `stacked`/`horizontal` flags land in Task 17 — this step only adds `sortDirection`/`dataLabels`, both already meaningful for the existing plain Bar/Line today). Full file after the change:
  ```ts
  import type { EChartsOption } from "echarts";
  import type { QueryResult } from "../api/datasets";

  export interface ShapedTableRows {
    columns: string[];
    rows: unknown[][];
  }

  export interface CategorySeriesOptions {
    sortDirection?: "asc" | "desc" | null;
    dataLabels?: boolean;
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

  function sortCategoriesAndSeries(
    categories: string[],
    seriesValues: number[][],
    sortDirection: "asc" | "desc" | null | undefined,
  ): { categories: string[]; seriesValues: number[][] } {
    if (!sortDirection) {
      return { categories, seriesValues };
    }

    const order = categories
      .map((_, i) => i)
      .sort((a, b) => (sortDirection === "asc" ? seriesValues[0][a] - seriesValues[0][b] : seriesValues[0][b] - seriesValues[0][a]));

    return {
      categories: order.map((i) => categories[i]),
      seriesValues: seriesValues.map((values) => order.map((i) => values[i])),
    };
  }

  function buildCategorySeriesOption(
    result: QueryResult,
    categoryField: string,
    valueFields: string[],
    seriesType: "bar" | "line",
    options?: CategorySeriesOptions,
  ): EChartsOption {
    const categoryIndex = columnIndex(result, categoryField);
    let categories = result.rows.map((row) => String(row[categoryIndex]));

    let seriesValues = valueFields.map((field) => {
      const valueIndex = columnIndex(result, field);
      return result.rows.map((row) => Number(row[valueIndex]));
    });

    ({ categories, seriesValues } = sortCategoriesAndSeries(categories, seriesValues, options?.sortDirection));

    const series = valueFields.map((field, i) => ({
      name: field,
      type: seriesType,
      data: seriesValues[i],
      ...(options?.dataLabels ? { label: { show: true } } : {}),
    }));

    return {
      xAxis: { type: "category", data: categories },
      yAxis: { type: "value" },
      series,
    };
  }

  export function shapeBarOption(
    result: QueryResult,
    categoryField: string,
    valueFields: string[],
    options?: CategorySeriesOptions,
  ): EChartsOption {
    return buildCategorySeriesOption(result, categoryField, valueFields, "bar", options);
  }

  export function shapeLineOption(
    result: QueryResult,
    categoryField: string,
    valueFields: string[],
    options?: CategorySeriesOptions,
  ): EChartsOption {
    return buildCategorySeriesOption(result, categoryField, valueFields, "line", options);
  }

  export function shapePieOption(
    result: QueryResult,
    categoryField: string,
    valueField: string,
    options?: CategorySeriesOptions,
  ): EChartsOption {
    const categoryIndex = columnIndex(result, categoryField);
    const valueIndex = columnIndex(result, valueField);

    let data = result.rows.map((row) => ({ name: String(row[categoryIndex]), value: Number(row[valueIndex]) }));
    if (options?.sortDirection) {
      data = [...data].sort((a, b) => (options.sortDirection === "asc" ? a.value - b.value : b.value - a.value));
    }

    return {
      series: [
        {
          type: "pie",
          data,
          ...(options?.dataLabels ? { label: { show: true } } : { label: { show: false } }),
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

- [ ] Step 9: Run the tests:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass, including every pre-existing `shapeBarOption`/`shapePieOption` test from Milestone 4 (none of them passed a 4th argument, so `options` is always `undefined` for them, and every new branch is additive/opt-in).

- [ ] Step 10: Modify `frontend/src/pages/ReportCanvas.tsx` — wire the Format tab into `VisualizationsPane`'s `"format"` branch:
  - Add the import: `import FormatTab from "../reportEditor/FormatTab";`
  - Replace the `: <div>format tab content — Task 16</div>` branch with:
    ```tsx
                : (
                  <FormatTab
                    widget={widgets.find((w) => w.id === selectedWidgetId) ?? null}
                    onChange={(binding) => {
                      if (selectedWidgetId !== null) {
                        dispatch({ type: "bindingChanged", id: selectedWidgetId, binding });
                      }
                    }}
                  />
                )
    ```

- [ ] Step 11: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 12: Commit:
  ```
  git add frontend/src/reportEditor/reportEditor.css frontend/src/reportEditor/FormatTab.tsx frontend/src/reportEditor/FormatTab.test.tsx frontend/src/widgets/shaping.ts frontend/src/widgets/shaping.test.ts frontend/src/pages/ReportCanvas.tsx
  git commit -m "frontend: Format tab — title, legend, gridlines, palette, sort, data labels"
  ```

---

### Task 17: New widget types — StackedColumn + ClusteredBar (Bar family)

**Files:**
- Modify: `frontend/src/widgets/shaping.ts`
- Test: `frontend/src/widgets/shaping.test.ts`
- Modify: `frontend/src/widgets/BarWidget.tsx`
- Modify: `frontend/src/widgets/WidgetRenderer.tsx`
- Test: `frontend/src/widgets/WidgetRenderer.test.tsx`

**Interfaces:**
- Consumes: `shapeBarOption` (Task 16), `WELL_SPECS`/`isBindingComplete` already covering these types (Tasks 7, 13).
- Produces: `shapeBarOption`'s `CategorySeriesOptions` gains `stacked?: boolean; horizontal?: boolean`. `BarWidget` gains `stacked`/`horizontal` props (default `false`) — used by `WidgetRenderer`'s `Bar`/`StackedColumn`/`ClusteredBar` cases.

- [ ] Step 1: Write the failing tests first — append to `frontend/src/widgets/shaping.test.ts`:
  ```ts
  describe("shapeBarOption stacked/horizontal options", () => {
    it("sets stack on every series when stacked is true", () => {
      const option = shapeBarOption(result, "Month", ["Revenue", "Cost"], { stacked: true });

      const series = option.series as Array<{ stack?: string }>;
      expect(series[0].stack).toBeDefined();
      expect(series[0].stack).toBe(series[1].stack);
    });

    it("does not set stack by default", () => {
      const option = shapeBarOption(result, "Month", ["Revenue", "Cost"]);

      const series = option.series as Array<{ stack?: string }>;
      expect(series[0].stack).toBeUndefined();
    });

    it("swaps the category axis to Y and value axis to X when horizontal is true", () => {
      const option = shapeBarOption(result, "Month", ["Revenue"], { horizontal: true });

      expect(option.yAxis).toMatchObject({ type: "category", data: ["Jan", "Feb"] });
      expect(option.xAxis).toMatchObject({ type: "value" });
    });
  });
  ```

- [ ] Step 2: Run the tests to confirm they fail (no `stacked`/`horizontal` options accepted yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails — `stack` never set, axes never swapped.

- [ ] Step 3: Modify `frontend/src/widgets/shaping.ts` — extend `CategorySeriesOptions` and `buildCategorySeriesOption`. Apply these changes to the existing file:
  ```ts
  export interface CategorySeriesOptions {
    sortDirection?: "asc" | "desc" | null;
    dataLabels?: boolean;
    stacked?: boolean;
    horizontal?: boolean;
  }
  ```
  ```ts
  function buildCategorySeriesOption(
    result: QueryResult,
    categoryField: string,
    valueFields: string[],
    seriesType: "bar" | "line",
    options?: CategorySeriesOptions,
  ): EChartsOption {
    const categoryIndex = columnIndex(result, categoryField);
    let categories = result.rows.map((row) => String(row[categoryIndex]));

    let seriesValues = valueFields.map((field) => {
      const valueIndex = columnIndex(result, field);
      return result.rows.map((row) => Number(row[valueIndex]));
    });

    ({ categories, seriesValues } = sortCategoriesAndSeries(categories, seriesValues, options?.sortDirection));

    const series = valueFields.map((field, i) => ({
      name: field,
      type: seriesType,
      data: seriesValues[i],
      ...(options?.stacked ? { stack: "total" } : {}),
      ...(options?.dataLabels ? { label: { show: true } } : {}),
    }));

    const categoryAxis = { type: "category" as const, data: categories };
    const valueAxis = { type: "value" as const };

    return options?.horizontal
      ? { yAxis: categoryAxis, xAxis: valueAxis, series }
      : { xAxis: categoryAxis, yAxis: valueAxis, series };
  }
  ```
  (`shapeBarOption`/`shapeLineOption`'s own signatures are unchanged — both already forward their `options` parameter straight through to `buildCategorySeriesOption`, so no edit needed there.)

- [ ] Step 4: Run the tests:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 5: Modify `frontend/src/widgets/BarWidget.tsx` — full file after the change:
  ```tsx
  import { useRef } from "react";
  import { Paper, Typography } from "@mui/material";
  import type { QueryResult } from "../api/datasets";
  import { shapeBarOption } from "./shaping";
  import { useECharts } from "./useECharts";

  function BarWidget({
    title, result, categoryField, valueFields, stacked = false, horizontal = false,
  }: {
    title: string;
    result: QueryResult;
    categoryField: string;
    valueFields: string[];
    stacked?: boolean;
    horizontal?: boolean;
  }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    useECharts(containerRef, shapeBarOption(result, categoryField, valueFields, { stacked, horizontal }));

    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2" gutterBottom>{title}</Typography>
        <div ref={containerRef} style={{ width: "100%", height: 220 }} />
      </Paper>
    );
  }

  export default BarWidget;
  ```

- [ ] Step 6: Modify `frontend/src/widgets/WidgetRenderer.tsx` — add the two new `switch` cases:
  ```tsx
      case "StackedColumn":
        return <BarWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} stacked />;
      case "ClusteredBar":
        return <BarWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} horizontal />;
  ```
  (Insert these two cases right after the existing `case "Bar":` case.)

- [ ] Step 7: Write the failing tests first — append to `frontend/src/widgets/WidgetRenderer.test.tsx`:
  ```tsx
  it("renders a StackedColumn widget when the binding is valid", () => {
    const result: QueryResult = {
      columns: [
        { name: "Month", nativeType: "nvarchar(20)" },
        { name: "Revenue", nativeType: "decimal(18,2)" },
      ],
      rows: [["Jan", 100]],
    };

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "StackedColumn", binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    // No throw and no stale-binding/incomplete-binding messaging is the assertion here —
    // ECharts itself is not asserted on (see Milestone 4's own useECharts.test.tsx for that seam).
    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finish configuring/)).not.toBeInTheDocument();
  });

  it("renders a ClusteredBar widget when the binding is valid", () => {
    const result: QueryResult = {
      columns: [
        { name: "Month", nativeType: "nvarchar(20)" },
        { name: "Revenue", nativeType: "decimal(18,2)" },
      ],
      rows: [["Jan", 100]],
    };

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "ClusteredBar", binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finish configuring/)).not.toBeInTheDocument();
  });
  ```

- [ ] Step 8: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 9: Commit:
  ```
  git add frontend/src/widgets/shaping.ts frontend/src/widgets/shaping.test.ts frontend/src/widgets/BarWidget.tsx frontend/src/widgets/WidgetRenderer.tsx frontend/src/widgets/WidgetRenderer.test.tsx
  git commit -m "frontend: StackedColumn and ClusteredBar as rendering-flag variants of BarWidget"
  ```

---

### Task 18: New widget types — Area + Donut (Line/Pie family)

**Files:**
- Modify: `frontend/src/widgets/shaping.ts`
- Test: `frontend/src/widgets/shaping.test.ts`
- Modify: `frontend/src/widgets/LineWidget.tsx`
- Modify: `frontend/src/widgets/PieWidget.tsx`
- Modify: `frontend/src/widgets/WidgetRenderer.tsx`
- Test: `frontend/src/widgets/WidgetRenderer.test.tsx`

**Interfaces:**
- Consumes: `shapeLineOption`, `shapePieOption` (Task 16).
- Produces: `shapeLineOption`'s options gain `area?: boolean`. `shapePieOption`'s options gain `donut?: boolean`. `LineWidget` gains an `area` prop, `PieWidget` gains a `donut` prop.

- [ ] Step 1: Write the failing tests first — append to `frontend/src/widgets/shaping.test.ts`:
  ```ts
  describe("shapeLineOption area option", () => {
    it("sets areaStyle on every series when area is true", () => {
      const option = shapeLineOption(result, "Month", ["Revenue"], { area: true });

      const series = option.series as Array<{ areaStyle?: object }>;
      expect(series[0].areaStyle).toBeDefined();
    });

    it("does not set areaStyle by default", () => {
      const option = shapeLineOption(result, "Month", ["Revenue"]);

      const series = option.series as Array<{ areaStyle?: object }>;
      expect(series[0].areaStyle).toBeUndefined();
    });
  });

  describe("shapePieOption donut option", () => {
    it("sets a cutout radius range when donut is true", () => {
      const option = shapePieOption(result, "Month", "Revenue", { donut: true });

      const series = option.series as Array<{ radius?: string[] }>;
      expect(series[0].radius).toEqual(["50%", "70%"]);
    });

    it("uses a full-circle radius by default", () => {
      const option = shapePieOption(result, "Month", "Revenue");

      const series = option.series as Array<{ radius?: string[] }>;
      expect(series[0].radius).toBeUndefined();
    });
  });
  ```

- [ ] Step 2: Run the tests to confirm they fail:
  ```
  cd frontend && npm run verify
  ```
  Expected: fails — neither option is honored yet.

- [ ] Step 3: Modify `frontend/src/widgets/shaping.ts` — apply these changes:
  ```ts
  export interface CategorySeriesOptions {
    sortDirection?: "asc" | "desc" | null;
    dataLabels?: boolean;
    stacked?: boolean;
    horizontal?: boolean;
    area?: boolean;
  }
  ```
  ```ts
    const series = valueFields.map((field, i) => ({
      name: field,
      type: seriesType,
      data: seriesValues[i],
      ...(options?.stacked ? { stack: "total" } : {}),
      ...(options?.area ? { areaStyle: {} } : {}),
      ...(options?.dataLabels ? { label: { show: true } } : {}),
    }));
  ```
  ```ts
  export function shapePieOption(
    result: QueryResult,
    categoryField: string,
    valueField: string,
    options?: CategorySeriesOptions & { donut?: boolean },
  ): EChartsOption {
    const categoryIndex = columnIndex(result, categoryField);
    const valueIndex = columnIndex(result, valueField);

    let data = result.rows.map((row) => ({ name: String(row[categoryIndex]), value: Number(row[valueIndex]) }));
    if (options?.sortDirection) {
      data = [...data].sort((a, b) => (options.sortDirection === "asc" ? a.value - b.value : b.value - a.value));
    }

    return {
      series: [
        {
          type: "pie",
          data,
          ...(options?.donut ? { radius: ["50%", "70%"] } : {}),
          ...(options?.dataLabels ? { label: { show: true } } : { label: { show: false } }),
        },
      ],
    };
  }
  ```
  (Replace the existing `shapePieOption` function and the `series` line inside `buildCategorySeriesOption` with the versions above; everything else in the file is unchanged from Task 17.)

- [ ] Step 4: Run the tests:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 5: Modify `frontend/src/widgets/LineWidget.tsx` — full file after the change:
  ```tsx
  import { useRef } from "react";
  import { Paper, Typography } from "@mui/material";
  import type { QueryResult } from "../api/datasets";
  import { shapeLineOption } from "./shaping";
  import { useECharts } from "./useECharts";

  function LineWidget({
    title, result, categoryField, valueFields, area = false,
  }: { title: string; result: QueryResult; categoryField: string; valueFields: string[]; area?: boolean }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    useECharts(containerRef, shapeLineOption(result, categoryField, valueFields, { area }));

    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2" gutterBottom>{title}</Typography>
        <div ref={containerRef} style={{ width: "100%", height: 220 }} />
      </Paper>
    );
  }

  export default LineWidget;
  ```

- [ ] Step 6: Modify `frontend/src/widgets/PieWidget.tsx` — full file after the change:
  ```tsx
  import { useRef } from "react";
  import { Paper, Typography } from "@mui/material";
  import type { QueryResult } from "../api/datasets";
  import { shapePieOption } from "./shaping";
  import { useECharts } from "./useECharts";

  function PieWidget({
    title, result, categoryField, valueField, donut = false,
  }: { title: string; result: QueryResult; categoryField: string; valueField: string; donut?: boolean }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    useECharts(containerRef, shapePieOption(result, categoryField, valueField, { donut }));

    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2" gutterBottom>{title}</Typography>
        <div ref={containerRef} style={{ width: "100%", height: 220 }} />
      </Paper>
    );
  }

  export default PieWidget;
  ```

- [ ] Step 7: Modify `frontend/src/widgets/WidgetRenderer.tsx` — add the two new cases (right after `case "Pie":`, before `case "Kpi":`):
  ```tsx
      case "Area":
        return <LineWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} area />;
      case "Donut":
        return <PieWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} donut />;
  ```

- [ ] Step 8: Write the failing tests first — append to `frontend/src/widgets/WidgetRenderer.test.tsx`:
  ```tsx
  it("renders an Area widget when the binding is valid", () => {
    const result: QueryResult = {
      columns: [
        { name: "Month", nativeType: "nvarchar(20)" },
        { name: "Revenue", nativeType: "decimal(18,2)" },
      ],
      rows: [["Jan", 100]],
    };

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "Area", binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
  });

  it("renders a Donut widget when the binding is valid", () => {
    const result: QueryResult = {
      columns: [
        { name: "Month", nativeType: "nvarchar(20)" },
        { name: "Revenue", nativeType: "decimal(18,2)" },
      ],
      rows: [["Jan", 100]],
    };

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "Donut", binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
  });
  ```

- [ ] Step 9: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 10: Commit:
  ```
  git add frontend/src/widgets/shaping.ts frontend/src/widgets/shaping.test.ts frontend/src/widgets/LineWidget.tsx frontend/src/widgets/PieWidget.tsx frontend/src/widgets/WidgetRenderer.tsx frontend/src/widgets/WidgetRenderer.test.tsx
  git commit -m "frontend: Area and Donut as rendering-flag variants of LineWidget/PieWidget"
  ```

---

### Task 19: New widget type — Scatter (genuinely new)

**Files:**
- Modify: `frontend/src/widgets/shaping.ts`
- Test: `frontend/src/widgets/shaping.test.ts`
- Create: `frontend/src/widgets/ScatterWidget.tsx`
- Modify: `frontend/src/widgets/WidgetRenderer.tsx`
- Test: `frontend/src/widgets/WidgetRenderer.test.tsx`

**Interfaces:**
- Consumes: nothing new beyond `QueryResult`.
- Produces: `shapeScatterOption(result: QueryResult, xField: string, yField: string, detailsField: string | null): EChartsOption`, `ScatterWidget` component, `WidgetRenderer`'s `Scatter` case (`widget.binding.valueFields[0]` = X, `[1]` = Y — positional, matching Task 6's backend rule and Task 13's well-key mapping).

- [ ] Step 1: Write the failing tests first — append to `frontend/src/widgets/shaping.test.ts`:
  ```ts
  describe("shapeScatterOption", () => {
    const scatterResult: QueryResult = {
      columns: [
        { name: "Segment", nativeType: "nvarchar(20)" },
        { name: "Sales", nativeType: "decimal(18,2)" },
        { name: "Profit", nativeType: "decimal(18,2)" },
      ],
      rows: [
        ["Consumer", 100, 20],
        ["Corporate", 200, 50],
      ],
    };

    it("builds one point per row, using valueFields[0] as X and valueFields[1] as Y positionally", () => {
      const option = shapeScatterOption(scatterResult, "Sales", "Profit", null);

      const series = option.series as Array<{ data: Array<[number, number]> }>;
      expect(series[0].data).toEqual([[100, 20], [200, 50]]);
    });

    it("groups points into one series per distinct value of the details field when provided", () => {
      const option = shapeScatterOption(scatterResult, "Sales", "Profit", "Segment");

      const series = option.series as Array<{ name: string; data: Array<[number, number]> }>;
      expect(series).toHaveLength(2);
      expect(series.map((s) => s.name).sort()).toEqual(["Consumer", "Corporate"]);
    });

    it("swapping the field order swaps which axis each measure lands on", () => {
      const optionA = shapeScatterOption(scatterResult, "Sales", "Profit", null);
      const optionB = shapeScatterOption(scatterResult, "Profit", "Sales", null);

      const seriesA = optionA.series as Array<{ data: Array<[number, number]> }>;
      const seriesB = optionB.series as Array<{ data: Array<[number, number]> }>;
      expect(seriesA[0].data[0]).toEqual([100, 20]);
      expect(seriesB[0].data[0]).toEqual([20, 100]);
    });
  });
  ```

- [ ] Step 2: Run the tests to confirm they fail (function doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `shapeScatterOption`.

- [ ] Step 3: Modify `frontend/src/widgets/shaping.ts` — append this function at the end of the file:
  ```ts
  export function shapeScatterOption(
    result: QueryResult,
    xField: string,
    yField: string,
    detailsField: string | null,
  ): EChartsOption {
    const xIndex = columnIndex(result, xField);
    const yIndex = columnIndex(result, yField);

    if (!detailsField) {
      return {
        xAxis: { type: "value", name: xField },
        yAxis: { type: "value", name: yField },
        series: [{ type: "scatter", data: result.rows.map((row) => [Number(row[xIndex]), Number(row[yIndex])]) }],
      };
    }

    const detailsIndex = columnIndex(result, detailsField);
    const groups = new Map<string, Array<[number, number]>>();
    for (const row of result.rows) {
      const key = String(row[detailsIndex]);
      const points = groups.get(key) ?? [];
      points.push([Number(row[xIndex]), Number(row[yIndex])]);
      groups.set(key, points);
    }

    return {
      xAxis: { type: "value", name: xField },
      yAxis: { type: "value", name: yField },
      series: [...groups.entries()].map(([name, data]) => ({ type: "scatter", name, data })),
    };
  }
  ```

- [ ] Step 4: Run the tests:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 5: Create `frontend/src/widgets/ScatterWidget.tsx`:
  ```tsx
  import { useRef } from "react";
  import { Paper, Typography } from "@mui/material";
  import type { QueryResult } from "../api/datasets";
  import { shapeScatterOption } from "./shaping";
  import { useECharts } from "./useECharts";

  function ScatterWidget({
    title, result, xField, yField, detailsField,
  }: { title: string; result: QueryResult; xField: string; yField: string; detailsField: string | null }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    useECharts(containerRef, shapeScatterOption(result, xField, yField, detailsField));

    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2" gutterBottom>{title}</Typography>
        <div ref={containerRef} style={{ width: "100%", height: 220 }} />
      </Paper>
    );
  }

  export default ScatterWidget;
  ```

- [ ] Step 6: Modify `frontend/src/widgets/WidgetRenderer.tsx` — add the import and the `Scatter` case (right after `case "Kpi":`):
  ```tsx
  import ScatterWidget from "./ScatterWidget";
  ```
  ```tsx
      case "Scatter":
        return (
          <ScatterWidget
            title={widget.title}
            result={result}
            xField={widget.binding.valueFields[0]}
            yField={widget.binding.valueFields[1]}
            detailsField={widget.binding.categoryField}
          />
        );
  ```

- [ ] Step 7: Write the failing test first — append to `frontend/src/widgets/WidgetRenderer.test.tsx`:
  ```tsx
  it("renders a Scatter widget, using valueFields[0]/[1] positionally as X/Y", () => {
    const result: QueryResult = {
      columns: [
        { name: "Sales", nativeType: "decimal(18,2)" },
        { name: "Profit", nativeType: "decimal(18,2)" },
      ],
      rows: [[100, 20]],
    };

    render(
      <WidgetRenderer
        widget={makeWidget({ type: "Scatter", binding: { categoryField: null, valueFields: ["Sales", "Profit"], formatOptions: formatOptionsJson } })}
        result={result}
      />,
    );

    expect(screen.queryByText(/no longer exists/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Finish configuring/)).not.toBeInTheDocument();
  });
  ```

- [ ] Step 8: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 9: Commit:
  ```
  git add frontend/src/widgets/shaping.ts frontend/src/widgets/shaping.test.ts frontend/src/widgets/ScatterWidget.tsx frontend/src/widgets/WidgetRenderer.tsx frontend/src/widgets/WidgetRenderer.test.tsx
  git commit -m "frontend: Scatter widget type with positional X/Y ValueFields"
  ```

---

### Task 20: Filters pane + persisted `FilterState`

**Files:**
- Modify: `frontend/src/reportEditor/reportEditor.css` (append `.pane-filters`/`.filter-card`/`.opt` sections)
- Create: `frontend/src/reportEditor/FiltersPane.tsx`
- Test: `frontend/src/reportEditor/FiltersPane.test.tsx`
- Modify: `frontend/src/reportEditor/ReportQueryContext.tsx`
- Test: `frontend/src/reportEditor/ReportQueryContext.test.tsx`
- Modify: `frontend/src/pages/ReportCanvas.tsx`

**Interfaces:**
- Consumes: `useReportQuery()`'s `rawResult`/`filterState`/`setFilterState` (Task 9), `classify` (Milestone 4), `updateReportPage` (Task 7's `api/reportPages.ts`).
- Produces: `FiltersPane` component: `{ visible: boolean; rawResult: QueryResult | null; filterState: Record<string, string[]>; onChange: (next: Record<string, string[]>) => void }` — auto-populates one collapsible checkbox list per Categorical field. `useReportQuery()` gains a `saveFilterState: () => Promise<void>` method that persists the current `filterState` to `ReportPage.FilterState` via `updateReportPage` — called from the ribbon's Save action (Task 21/22 don't need to touch this, Task 11's `Ribbon` Save handler is extended here).

- [ ] Step 1: Modify `frontend/src/reportEditor/reportEditor.css` — append:
  ```css
  .pane-filters {
    width: 214px;
    flex: 0 0 214px;
  }
  .filter-scope {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--faint);
    font-weight: 600;
    padding: 12px 12px 4px;
  }
  .filter-card {
    margin: 6px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
  }
  .filter-card > summary {
    list-style: none;
    cursor: pointer;
    padding: 9px 11px;
    font-weight: 500;
    background: var(--panel-2);
  }
  .filter-card > summary::-webkit-details-marker {
    display: none;
  }
  .filter-card .opts {
    padding: 6px 11px 10px;
  }
  .opt {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    color: var(--text);
    cursor: pointer;
  }
  .opt input {
    accent-color: var(--accent);
    width: 14px;
    height: 14px;
  }
  .filters-empty {
    color: var(--faint);
    font-size: 12px;
    padding: 12px;
    line-height: 1.5;
  }
  ```

- [ ] Step 2: Write the failing test first — create `frontend/src/reportEditor/FiltersPane.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { describe, expect, it, vi } from "vitest";
  import type { QueryResult } from "../api/datasets";
  import FiltersPane from "./FiltersPane";

  const result: QueryResult = {
    columns: [
      { name: "Region", nativeType: "nvarchar(20)" },
      { name: "Revenue", nativeType: "decimal(18,2)" },
    ],
    rows: [["North", 100], ["South", 200], ["North", 150]],
  };

  describe("FiltersPane", () => {
    it("renders nothing visible when visible is false", () => {
      const { container } = render(<FiltersPane visible={false} rawResult={result} filterState={{}} onChange={vi.fn()} />);
      expect(container.firstChild).toBeNull();
    });

    it("auto-populates one collapsible group per Categorical field, with its distinct values", () => {
      render(<FiltersPane visible rawResult={result} filterState={{}} onChange={vi.fn()} />);

      expect(screen.getByText("Region")).toBeInTheDocument();
      expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
      expect(screen.getAllByText("North")).toHaveLength(1);
      expect(screen.getByText("South")).toBeInTheDocument();
    });

    it("checking a value adds it to that field's filterState selection", async () => {
      const onChange = vi.fn();
      render(<FiltersPane visible rawResult={result} filterState={{}} onChange={onChange} />);

      await userEvent.click(screen.getByRole("checkbox", { name: "North" }));

      expect(onChange).toHaveBeenCalledWith({ Region: ["North"] });
    });

    it("unchecking a value removes it from that field's filterState selection", async () => {
      const onChange = vi.fn();
      render(<FiltersPane visible rawResult={result} filterState={{ Region: ["North", "South"] }} onChange={onChange} />);

      await userEvent.click(screen.getByRole("checkbox", { name: "North" }));

      expect(onChange).toHaveBeenCalledWith({ Region: ["South"] });
    });

    it("shows an empty-state message when there's no data yet", () => {
      render(<FiltersPane visible rawResult={null} filterState={{}} onChange={vi.fn()} />);

      expect(screen.getByText(/no data to filter yet/i)).toBeInTheDocument();
    });
  });
  ```

- [ ] Step 3: Run the test to confirm it fails (module doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `./FiltersPane`.

- [ ] Step 4: Create `frontend/src/reportEditor/FiltersPane.tsx`:
  ```tsx
  import type { QueryResult } from "../api/datasets";
  import { classify } from "../widgets/fieldClassification";
  import "./reportEditor.css";

  function distinctValues(result: QueryResult, field: string): string[] {
    const index = result.columns.findIndex((c) => c.name === field);
    const values = new Set(result.rows.map((row) => String(row[index])));
    return [...values].sort();
  }

  function FiltersPane({
    visible, rawResult, filterState, onChange,
  }: {
    visible: boolean;
    rawResult: QueryResult | null;
    filterState: Record<string, string[]>;
    onChange: (next: Record<string, string[]>) => void;
  }) {
    if (!visible) {
      return null;
    }

    if (!rawResult) {
      return (
        <div className="pane pane-filters">
          <div className="pane-head">Filters</div>
          <div className="filters-empty">No data to filter yet — define this report's query first.</div>
        </div>
      );
    }

    const categoricalFields = rawResult.columns.filter((c) => classify(c.nativeType) === "Categorical");

    function toggle(field: string, value: string, checked: boolean) {
      const current = filterState[field] ?? [];
      const next = checked ? [...current, value] : current.filter((v) => v !== value);
      onChange({ ...filterState, [field]: next });
    }

    return (
      <div className="pane pane-filters">
        <div className="pane-head">Filters</div>
        <div className="pane-scroll">
          <div className="filter-scope">Filters on this page</div>
          {categoricalFields.map((column) => (
            <details className="filter-card" key={column.name}>
              <summary>{column.name}</summary>
              <div className="opts">
                {distinctValues(rawResult, column.name).map((value) => (
                  <label className="opt" key={value}>
                    <input
                      type="checkbox"
                      checked={(filterState[column.name] ?? []).includes(value)}
                      onChange={(e) => toggle(column.name, value, e.target.checked)}
                    />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    );
  }

  export default FiltersPane;
  ```

- [ ] Step 5: Run the test:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 6: Write the failing test first — append to `frontend/src/reportEditor/ReportQueryContext.test.tsx`:
  ```tsx
  import * as reportPagesApi from "../api/reportPages";

  // (add this describe block at the end of the existing file)
  describe("ReportQueryProvider saveFilterState", () => {
    function Probe2() {
      const { setFilterState, saveFilterState } = useReportQuery();
      return (
        <div>
          <button onClick={() => setFilterState({ Region: ["North"] })}>set</button>
          <button onClick={() => saveFilterState()}>save</button>
        </div>
      );
    }

    it("persists the current filterState to the active ReportPage via updateReportPage", async () => {
      vi.spyOn(reportsApi, "getReport").mockResolvedValue({ id: 1, name: "R", description: "", datasetId: null });
      vi.spyOn(reportPagesApi, "getReportPages").mockResolvedValue([
        { id: 10, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{}" },
      ]);
      const updateSpy = vi.spyOn(reportPagesApi, "updateReportPage").mockResolvedValue({
        id: 10, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{\"Region\":[\"North\"]}",
      });

      render(
        <ReportQueryProvider reportId={1}>
          <Probe2 />
        </ReportQueryProvider>,
      );

      await waitFor(() => expect(screen.getByText("set")).toBeInTheDocument());
      await userEvent.setup().click(screen.getByText("set"));
      await userEvent.setup().click(screen.getByText("save"));

      expect(updateSpy).toHaveBeenCalledWith(1, 10, { filterState: JSON.stringify({ Region: ["North"] }) });
    });
  });
  ```
  and add the missing import at the top of the file:
  ```tsx
  import userEvent from "@testing-library/user-event";
  ```

- [ ] Step 7: Run the test to confirm it fails (`saveFilterState` doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: `tsc -b` error — `useReportQuery()` doesn't return `saveFilterState`.

- [ ] Step 8: Modify `frontend/src/reportEditor/ReportQueryContext.tsx` — add `saveFilterState` to the context value. Apply these changes to the existing file: add `updateReportPage` to the `import { getReportPages, type ReportPage } from "../api/reportPages";` line (becomes `import { getReportPages, updateReportPage, type ReportPage } from "../api/reportPages";`), add `saveFilterState: () => Promise<void>;` to `ReportQueryContextValue`, and add the implementation:
  ```tsx
      const saveFilterState = useCallback(async () => {
        if (reportPageId === null) {
          return;
        }
        await updateReportPage(reportId, reportPageId, { filterState: JSON.stringify(filterState) });
      }, [reportId, reportPageId, filterState]);
  ```
  (place this right after the `load` callback, before `useEffect(() => { load(); }, [load]);`), and add `saveFilterState,` to the `value` object.

- [ ] Step 9: Run the tests:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 10: Modify `frontend/src/pages/ReportCanvas.tsx` — mount `FiltersPane` (a `filtersVisible` boolean toggled by the Ribbon's View menu), and call `saveFilterState()` alongside `saveWidgets` in `handleSave`. Apply these targeted edits:
  - Add `const [filtersVisible, setFiltersVisible] = useState(true);` near the other `useState` calls.
  - Destructure `filterState, setFilterState, saveFilterState, rawResult` alongside the existing `reportId, reportPageId, filteredResult, loading: queryLoading, refresh` from `useReportQuery()`.
  - Change `onToggleFilters={() => {}}` to `onToggleFilters={() => setFiltersVisible((v) => !v)}`.
  - In `handleSave`, after the existing `await saveWidgets(reportPageId, payload);` line, add `await saveFilterState();`.
  - Add the import: `import FiltersPane from "../reportEditor/FiltersPane";`.
  - Mount it as the first child of `.body` (before `.rail`):
    ```tsx
            <FiltersPane visible={filtersVisible} rawResult={rawResult} filterState={filterState} onChange={setFilterState} />
    ```

- [ ] Step 11: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 12: Commit:
  ```
  git add frontend/src/reportEditor/reportEditor.css frontend/src/reportEditor/FiltersPane.tsx frontend/src/reportEditor/FiltersPane.test.tsx frontend/src/reportEditor/ReportQueryContext.tsx frontend/src/reportEditor/ReportQueryContext.test.tsx frontend/src/pages/ReportCanvas.tsx
  git commit -m "frontend: Filters pane, auto-populated from Categorical fields, persisted per page"
  ```

---

### Task 21: Click-to-cross-filter

**Files:**
- Create: `frontend/src/reportEditor/clickToCrossFilter.ts`
- Test: `frontend/src/reportEditor/clickToCrossFilter.test.ts`
- Modify: `frontend/src/widgets/useECharts.ts`
- Test: `frontend/src/widgets/useECharts.test.tsx`
- Modify: `frontend/src/widgets/BarWidget.tsx`
- Modify: `frontend/src/widgets/LineWidget.tsx`
- Modify: `frontend/src/widgets/PieWidget.tsx`
- Modify: `frontend/src/widgets/ScatterWidget.tsx`
- Modify: `frontend/src/widgets/WidgetRenderer.tsx`
- Modify: `frontend/src/pages/ReportCanvas.tsx`

**Interfaces:**
- Consumes: `filterState`/`setFilterState` (Task 9), ECharts' native `click` event.
- Produces: `toggleCrossFilterValue(filterState: Record<string, string[]>, field: string, value: string): Record<string, string[]>` — the pure toggle function every chart widget's click handler calls. `useECharts` gains an optional 3rd parameter, `onDataPointClick?: (categoryValue: string) => void`, wired via ECharts' `chart.on("click", ...)`.

- [ ] Step 1: Write the failing tests first — create `frontend/src/reportEditor/clickToCrossFilter.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { toggleCrossFilterValue } from "./clickToCrossFilter";

  describe("toggleCrossFilterValue", () => {
    it("adds the value to an empty selection for that field", () => {
      expect(toggleCrossFilterValue({}, "Region", "North")).toEqual({ Region: ["North"] });
    });

    it("adds the value alongside an existing selection for that field", () => {
      expect(toggleCrossFilterValue({ Region: ["South"] }, "Region", "North")).toEqual({ Region: ["South", "North"] });
    });

    it("removes the value if it's already selected (toggle off)", () => {
      expect(toggleCrossFilterValue({ Region: ["North", "South"] }, "Region", "North")).toEqual({ Region: ["South"] });
    });

    it("leaves other fields' selections untouched", () => {
      expect(toggleCrossFilterValue({ Category: ["Furniture"] }, "Region", "North")).toEqual({
        Category: ["Furniture"],
        Region: ["North"],
      });
    });
  });
  ```

- [ ] Step 2: Run the tests to confirm they fail (module doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `./clickToCrossFilter`.

- [ ] Step 3: Create `frontend/src/reportEditor/clickToCrossFilter.ts`:
  ```ts
  export function toggleCrossFilterValue(
    filterState: Record<string, string[]>,
    field: string,
    value: string,
  ): Record<string, string[]> {
    const current = filterState[field] ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    return { ...filterState, [field]: next };
  }
  ```

- [ ] Step 4: Run the tests:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 5: Write the failing test first — append to `frontend/src/widgets/useECharts.test.tsx`:
  ```tsx
  it("wires an onDataPointClick callback to the chart's native click event, receiving the clicked category value", () => {
    const clickHandlers: Record<string, (params: { name: string }) => void> = {};
    vi.spyOn(echarts, "init").mockReturnValue({
      setOption: vi.fn(),
      dispose: vi.fn(),
      on: vi.fn((event: string, handler: (params: { name: string }) => void) => { clickHandlers[event] = handler; }),
    } as unknown as echarts.ECharts);

    const onDataPointClick = vi.fn();
    render(<TestComponentWithClick option={{ series: [] }} onDataPointClick={onDataPointClick} />);

    clickHandlers["click"]({ name: "North" });

    expect(onDataPointClick).toHaveBeenCalledWith("North");
  });
  ```
  and add this second test component definition above the `describe` block:
  ```tsx
  function TestComponentWithClick({
    option, onDataPointClick,
  }: { option: echarts.EChartsOption | null; onDataPointClick: (categoryValue: string) => void }) {
    const ref = useRef<HTMLDivElement | null>(null);
    useECharts(ref, option, onDataPointClick);
    return <div ref={ref} />;
  }
  ```

- [ ] Step 6: Run the test to confirm it fails (no 3rd parameter accepted yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: `tsc -b` error.

- [ ] Step 7: Modify `frontend/src/widgets/useECharts.ts` — full file after the change:
  ```ts
  import { useEffect, useRef } from "react";
  import * as echarts from "echarts";
  import type { EChartsOption } from "echarts";

  export function useECharts(
    containerRef: React.RefObject<HTMLDivElement | null>,
    option: EChartsOption | null,
    onDataPointClick?: (categoryValue: string) => void,
  ) {
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

    useEffect(() => {
      const chart = chartRef.current;
      if (!chart || !onDataPointClick) {
        return;
      }

      const handler = (params: { name?: string }) => {
        if (params.name) {
          onDataPointClick(params.name);
        }
      };

      chart.on("click", handler);
      return () => {
        chart.off("click", handler);
      };
    }, [onDataPointClick]);
  }
  ```
  Note: `chart.off` is called in the cleanup, but the mocked `ECharts` object in the existing `useECharts.test.tsx`'s first test doesn't define `off` — that test never triggers this new effect's cleanup path with a real chart, since it doesn't pass `onDataPointClick`, so the `if (!chart || !onDataPointClick) return;` guard skips registering (and thus never needs to clean up) a handler; no change needed to that pre-existing test's mock.

- [ ] Step 8: Run the tests:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 9: Modify `frontend/src/widgets/BarWidget.tsx`, `LineWidget.tsx`, `PieWidget.tsx`, `ScatterWidget.tsx` — each accepts an optional `onDataPointClick?: (categoryValue: string) => void` prop and forwards it as `useECharts`'s 3rd argument. Example for `BarWidget.tsx` (apply the same pattern to the other three — add the prop to the destructured props and to the `useECharts` call):
  ```tsx
  function BarWidget({
    title, result, categoryField, valueFields, stacked = false, horizontal = false, onDataPointClick,
  }: {
    title: string;
    result: QueryResult;
    categoryField: string;
    valueFields: string[];
    stacked?: boolean;
    horizontal?: boolean;
    onDataPointClick?: (categoryValue: string) => void;
  }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    useECharts(containerRef, shapeBarOption(result, categoryField, valueFields, { stacked, horizontal }), onDataPointClick);
    // ...unchanged JSX below...
  ```
  For `PieWidget.tsx`, ECharts' pie/donut click event's `params.name` is already the slice's category label, same shape — no special-casing needed. For `ScatterWidget.tsx`, the click event's `params.name` is only meaningful when the series is split by `detailsField` (each series is named after its group) — pass `onDataPointClick` through the same way; a click on an ungrouped (single-series) scatter simply won't have a usable `params.name` and the callback won't fire (ECharts sets `params.name` from the series `name`, and an ungrouped series has no `name` — this is an accepted, minor scope limitation: ungrouped Scatter doesn't support click-to-cross-filter, only Scatter with a Details field does).

- [ ] Step 10: Modify `frontend/src/widgets/WidgetRenderer.tsx` — thread an `onDataPointClick` prop through from `WidgetRenderer` itself down to every chart-type case (`Bar`, `StackedColumn`, `ClusteredBar`, `Line`, `Area`, `Pie`, `Donut`, `Scatter` — not `Table`/`Kpi`/`Text`, which have no clickable data points). Add `onDataPointClick?: (field: string, value: string) => void` to `WidgetRenderer`'s own props, and change each chart case to pass `onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined}` (for Bar/StackedColumn/ClusteredBar/Line/Area/Pie/Donut, all of which cross-filter on their `categoryField`) or, for Scatter, `onDataPointClick={onDataPointClick && widget.binding!.categoryField ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined}` (Scatter's clickable field is its optional Details/`categoryField`, not either axis measure).

- [ ] Step 11: Modify `frontend/src/pages/ReportCanvas.tsx` — pass `onDataPointClick` down from `ReportCanvasInner`, wired to `toggleCrossFilterValue` + `setFilterState`:
  - Add the import: `import { toggleCrossFilterValue } from "../reportEditor/clickToCrossFilter";`
  - Add `filterState, setFilterState` to the `useReportQuery()` destructure (if not already present from Task 20).
  - Change `<WidgetRenderer widget={w} result={filteredResult} />` (inside the widget-rendering loop) to:
    ```tsx
    <WidgetRenderer
      widget={w}
      result={filteredResult}
      onDataPointClick={(field, value) => setFilterState(toggleCrossFilterValue(filterState, field, value))}
    />
    ```

- [ ] Step 12: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 13: Commit:
  ```
  git add frontend/src/reportEditor/clickToCrossFilter.ts frontend/src/reportEditor/clickToCrossFilter.test.ts frontend/src/widgets/useECharts.ts frontend/src/widgets/useECharts.test.tsx frontend/src/widgets/BarWidget.tsx frontend/src/widgets/LineWidget.tsx frontend/src/widgets/PieWidget.tsx frontend/src/widgets/ScatterWidget.tsx frontend/src/widgets/WidgetRenderer.tsx frontend/src/pages/ReportCanvas.tsx
  git commit -m "frontend: click-to-cross-filter on chart data points"
  ```

---

### Task 22: Multi-page — `ReportPage` tabs UI (add/rename/delete)

**Files:**
- Create: `frontend/src/reportEditor/PageTabsBar.tsx`
- Test: `frontend/src/reportEditor/PageTabsBar.test.tsx`
- Modify: `frontend/src/reportEditor/ReportQueryContext.tsx`
- Test: `frontend/src/reportEditor/ReportQueryContext.test.tsx`
- Modify: `frontend/src/pages/ReportCanvas.tsx`

**Interfaces:**
- Consumes: `getReportPages`/`createReportPage`/`updateReportPage`/`deleteReportPage` (Task 7's `api/reportPages.ts`), `LastPageDeletionException` → 409 (Task 4, surfaced here as an axios error).
- Produces: `PageTabsBar` component: `{ pages: ReportPage[]; activePageId: number | null; onSelect: (id: number) => void; onAdd: () => void; onRename: (id: number, name: string) => void; onDelete: (id: number) => void }`. `useReportQuery()` gains `reportPages` refresh-after-mutation behavior (already exposed since Task 9 — this task is the first to actually mutate pages and needs `refresh()` to re-pull the page list afterward).

- [ ] Step 1: Modify `frontend/src/reportEditor/reportEditor.css` — append (the `.addpage` control from the mockup):
  ```css
  .addpage {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    border: 1px dashed var(--line-strong);
    background: none;
    color: var(--muted);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .addpage:hover {
    border-color: var(--accent);
    color: var(--accent);
  }
  ```

- [ ] Step 2: Write the failing test first — create `frontend/src/reportEditor/PageTabsBar.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { describe, expect, it, vi } from "vitest";
  import type { ReportPage } from "../api/reportPages";
  import PageTabsBar from "./PageTabsBar";

  const pages: ReportPage[] = [
    { id: 1, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{}" },
    { id: 2, reportId: 1, name: "Page 2", sortOrder: 1, filterState: "{}" },
  ];

  describe("PageTabsBar", () => {
    it("renders one tab per page, marking the active one", () => {
      render(<PageTabsBar pages={pages} activePageId={2} onSelect={vi.fn()} onAdd={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />);

      expect(screen.getByRole("button", { name: "Page 2" })).toHaveClass("active");
      expect(screen.getByRole("button", { name: "Page 1" })).not.toHaveClass("active");
    });

    it("clicking a tab calls onSelect with its id", async () => {
      const onSelect = vi.fn();
      render(<PageTabsBar pages={pages} activePageId={2} onSelect={onSelect} onAdd={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />);

      await userEvent.click(screen.getByRole("button", { name: "Page 1" }));

      expect(onSelect).toHaveBeenCalledWith(1);
    });

    it("clicking the add-page button calls onAdd", async () => {
      const onAdd = vi.fn();
      render(<PageTabsBar pages={pages} activePageId={1} onSelect={vi.fn()} onAdd={onAdd} onRename={vi.fn()} onDelete={vi.fn()} />);

      await userEvent.click(screen.getByTitle("New page"));

      expect(onAdd).toHaveBeenCalledTimes(1);
    });

    it("double-clicking a tab starts a rename, committing on blur", async () => {
      const onRename = vi.fn();
      render(<PageTabsBar pages={pages} activePageId={1} onSelect={vi.fn()} onAdd={vi.fn()} onRename={onRename} onDelete={vi.fn()} />);

      await userEvent.dblClick(screen.getByRole("button", { name: "Page 1" }));
      const input = screen.getByDisplayValue("Page 1");
      await userEvent.clear(input);
      await userEvent.type(input, "Overview");
      await userEvent.tab();

      expect(onRename).toHaveBeenCalledWith(1, "Overview");
    });
  });
  ```

- [ ] Step 3: Run the test to confirm it fails (module doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `./PageTabsBar`.

- [ ] Step 3b: Fix a gap found during this plan's self-review: `ReportQueryContext`'s `setReportPageId` (Task 9) is a bare `useState` setter — switching pages changes which page's widgets load, but leaves the *previous* page's `filterState` in place instead of loading the newly-selected page's own stored `FilterState`, breaking "each page has its own independent FilterState." Modify `frontend/src/reportEditor/ReportQueryContext.tsx`: rename the raw state setter and add a wrapper that also reloads `filterState` from the target page's own `filterState` column. Apply this change: replace `const [reportPageId, setReportPageId] = useState<number | null>(null);` with `const [reportPageId, setReportPageIdState] = useState<number | null>(null);`, and add this function (placed after `saveFilterState`, before the `useEffect` that calls `load()`):
  ```tsx
      const setReportPageId = useCallback((id: number) => {
        setReportPageIdState(id);
        const page = reportPages.find((p) => p.id === id);
        setFilterState(page ? JSON.parse(page.filterState || "{}") : {});
      }, [reportPages]);
  ```
  The context's public `ReportQueryContextValue.setReportPageId` signature (Task 9) is unchanged — only its implementation changes from a bare setter to this wrapper — so no other file needs to change.

- [ ] Step 3c: Write the failing test first — append to `frontend/src/reportEditor/ReportQueryContext.test.tsx`:
  ```tsx
  describe("ReportQueryProvider setReportPageId", () => {
    it("loads the newly-selected page's own FilterState instead of keeping the previous page's", async () => {
      vi.spyOn(reportsApi, "getReport").mockResolvedValue({ id: 1, name: "R", description: "", datasetId: null });
      vi.spyOn(reportPagesApi, "getReportPages").mockResolvedValue([
        { id: 10, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{\"Region\":[\"North\"]}" },
        { id: 11, reportId: 1, name: "Page 2", sortOrder: 1, filterState: "{\"Region\":[\"South\"]}" },
      ]);

      function Probe3() {
        const { setReportPageId, filterState } = useReportQuery();
        return (
          <div>
            <button onClick={() => setReportPageId(11)}>go to page 2</button>
            <div>filters: {JSON.stringify(filterState)}</div>
          </div>
        );
      }

      render(
        <ReportQueryProvider reportId={1}>
          <Probe3 />
        </ReportQueryProvider>,
      );

      await waitFor(() => expect(screen.getByText('filters: {"Region":["North"]}')).toBeInTheDocument());
      await userEvent.setup().click(screen.getByText("go to page 2"));

      expect(await screen.findByText('filters: {"Region":["South"]}')).toBeInTheDocument();
    });
  });
  ```

- [ ] Step 3d: Run the tests:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 4: Create `frontend/src/reportEditor/PageTabsBar.tsx`:
  ```tsx
  import { useState } from "react";
  import type { ReportPage } from "../api/reportPages";
  import "./reportEditor.css";

  function PageTabsBar({
    pages, activePageId, onSelect, onAdd, onRename, onDelete,
  }: {
    pages: ReportPage[];
    activePageId: number | null;
    onSelect: (id: number) => void;
    onAdd: () => void;
    onRename: (id: number, name: string) => void;
    onDelete: (id: number) => void;
  }) {
    const [renamingId, setRenamingId] = useState<number | null>(null);
    const [draftName, setDraftName] = useState("");

    function startRename(page: ReportPage) {
      setRenamingId(page.id);
      setDraftName(page.name);
    }

    function commitRename(page: ReportPage) {
      setRenamingId(null);
      if (draftName.trim() !== "" && draftName !== page.name) {
        onRename(page.id, draftName.trim());
      }
    }

    return (
      <div className="pagetabs">
        {pages.map((page) =>
          renamingId === page.id ? (
            <input
              key={page.id}
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={() => commitRename(page)}
              onKeyDown={(e) => { if (e.key === "Enter") { (e.target as HTMLInputElement).blur(); } }}
            />
          ) : (
            <button
              key={page.id}
              type="button"
              className={"ptab" + (page.id === activePageId ? " active" : "")}
              onClick={() => onSelect(page.id)}
              onDoubleClick={() => startRename(page)}
            >
              {page.name}
              {page.id === activePageId && pages.length > 1 && (
                <span onClick={(e) => { e.stopPropagation(); onDelete(page.id); }}> ×</span>
              )}
            </button>
          ),
        )}
        <button className="addpage" title="New page" onClick={onAdd}>+</button>
      </div>
    );
  }

  export default PageTabsBar;
  ```

- [ ] Step 5: Run the test:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 6: Modify `frontend/src/pages/ReportCanvas.tsx` — replace the Task-11 placeholder `<div className="pagetabs"><button className="ptab active">Page 1</button></div>` with a real `PageTabsBar`, wired to `reportPages`/`reportPageId`/`setReportPageId` (from `useReportQuery()`) and the CRUD API calls, catching a 409 from `deleteReportPage` (the last-page invariant) with a plain `window.alert`:
  ```tsx
        <div className="pagetabs">
          <PageTabsBar
            pages={reportPages}
            activePageId={reportPageId}
            onSelect={setReportPageId}
            onAdd={async () => {
              const created = await createReportPage(reportId, null);
              await refresh();
              setReportPageId(created.id);
            }}
            onRename={async (pageId, name) => {
              await updateReportPage(reportId, pageId, { name });
              await refresh();
            }}
            onDelete={async (pageId) => {
              try {
                await deleteReportPage(reportId, pageId);
                await refresh();
              } catch (err) {
                if (axios.isAxiosError(err) && err.response?.status === 409) {
                  window.alert(typeof err.response.data === "string" ? err.response.data : "A report needs at least one page.");
                }
              }
            }}
          />
        </div>
  ```
  Add the imports: `import PageTabsBar from "../reportEditor/PageTabsBar"; import { createReportPage, deleteReportPage, updateReportPage } from "../api/reportPages";`, and destructure `reportPages, setReportPageId` from `useReportQuery()` alongside the existing values.

- [ ] Step 7: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 8: Commit:
  ```
  git add frontend/src/reportEditor/reportEditor.css frontend/src/reportEditor/PageTabsBar.tsx frontend/src/reportEditor/PageTabsBar.test.tsx frontend/src/pages/ReportCanvas.tsx
  git commit -m "frontend: multi-page ReportPage tabs — add, rename, delete"
  ```

---

### Task 23: `ReportView` interactive — Filters + click-to-cross-filter, read-only

**Files:**
- Modify: `frontend/src/pages/ReportView.tsx`

**Interfaces:**
- Consumes: `useReportQuery()` (Task 9), `FiltersPane` (Task 20), `toggleCrossFilterValue` (Task 21), `PageTabsBar` (Task 22, in read-only mode — no add/rename/delete callbacks wired to anything destructive).

- [ ] Step 1: Modify `frontend/src/pages/ReportView.tsx` — full file after the change:
  ```tsx
  import { useEffect, useState } from "react";
  import { useParams } from "react-router-dom";
  import { Alert, Box, Typography } from "@mui/material";
  import { getWidgets, type WidgetSummary } from "../api/widgets";
  import WidgetRenderer from "../widgets/WidgetRenderer";
  import { ReportQueryProvider, useReportQuery } from "../reportEditor/ReportQueryContext";
  import FiltersPane from "../reportEditor/FiltersPane";
  import PageTabsBar from "../reportEditor/PageTabsBar";
  import { toggleCrossFilterValue } from "../reportEditor/clickToCrossFilter";
  import "../reportEditor/reportEditor.css";

  function ReportViewInner() {
    const {
      reportPageId, setReportPageId, reportPages, rawResult, filteredResult, filterState, setFilterState, loading: queryLoading,
    } = useReportQuery();
    const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      if (reportPageId === null) {
        return;
      }

      getWidgets(reportPageId).then(setWidgets).catch(() => setError("Could not load this report's widgets."));
    }, [reportPageId]);

    if (queryLoading) {
      return <Box sx={{ p: 4 }}><Typography>Loading…</Typography></Box>;
    }

    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
        {error && <Alert severity="error">{error}</Alert>}
        <div className="body" style={{ flex: 1 }}>
          <FiltersPane visible rawResult={rawResult} filterState={filterState} onChange={setFilterState} />
          <div className="stage">
            <div className="scroll">
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 2, width: 960 }}>
                {widgets.map((w) => (
                  <Box key={w.id} sx={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}>
                    <WidgetRenderer
                      widget={w}
                      result={filteredResult}
                      onDataPointClick={(field, value) => setFilterState(toggleCrossFilterValue(filterState, field, value))}
                    />
                  </Box>
                ))}
              </Box>
            </div>
          </div>
        </div>
        <div className="pagetabs">
          <PageTabsBar
            pages={reportPages}
            activePageId={reportPageId}
            onSelect={setReportPageId}
            onAdd={() => {}}
            onRename={() => {}}
            onDelete={() => {}}
          />
        </div>
      </div>
    );
  }

  function ReportView() {
    const { id } = useParams<{ id: string }>();
    const reportId = Number(id);

    return (
      <ReportQueryProvider reportId={reportId}>
        <ReportViewInner />
      </ReportQueryProvider>
    );
  }

  export default ReportView;
  ```
  Note: `PageTabsBar`'s add-page `+` button and each tab's rename-on-double-click/delete-`×` are all still visually present here (this component has no "read-only" prop of its own — see Global Constraints' "no scope creep," this is a deliberate, minimal reuse rather than forking the component). Passing no-op callbacks for `onAdd`/`onRename`/`onDelete` means clicking them does nothing destructive; a future `readOnly` prop on `PageTabsBar` that hides those affordances entirely is a reasonable follow-up but is not required by the design doc's explicit list of what View must support (page *navigation*, not page *editing*), so it's left out here rather than adding an unrequested prop.

- [ ] Step 2: Run the full frontend check:
  ```
  cd frontend && npm run verify
  ```
  Expected: passes.

- [ ] Step 3: Commit:
  ```
  git add frontend/src/pages/ReportView.tsx
  git commit -m "frontend: ReportView — Filters pane and click-to-cross-filter, read-only"
  ```

---

### Task 24: Final polish and consistency pass

**Files:**
- Modify: `frontend/src/reportEditor/reportEditor.css`
- Create: `frontend/src/reportEditor/WidgetChrome.tsx`
- Test: `frontend/src/reportEditor/WidgetChrome.test.tsx`
- Modify: `frontend/src/reportEditor/DataPane.tsx`
- Test: `frontend/src/reportEditor/DataPane.test.tsx`
- Modify: `frontend/src/pages/ReportCanvas.tsx`
- Modify: `frontend/src/pages/ReportsPage.tsx`
- Modify: `frontend/src/pages/DatasetsPage.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1-23.
- Produces: `WidgetChrome` component: `{ title: string; selected: boolean; onDuplicate: () => void; onDelete: () => void; children: ReactNode }` — the per-widget header (title always visible; duplicate/delete icons only rendered when `selected` is true) wrapping every widget on the canvas.

- [ ] Step 1: Close a gap found during this plan's self-review — the design doc's Canvas & Widget Chrome section requires "Widget header shows its title always; duplicate/delete icons appear only when the widget is selected... Duplicate is a new, cheap action (client-side copy of widget + binding before Save)," which no task so far implemented (Task 11's canvas markup shows a plain always-visible `Remove` button and no Duplicate at all). Modify `frontend/src/reportEditor/reportEditor.css` — append:
  ```css
  .vhead {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    cursor: move;
    user-select: none;
  }
  .vtitle {
    font-weight: 600;
    font-size: 13px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .vhead .vtools {
    margin-left: auto;
    display: none;
    gap: 2px;
  }
  .visual.selected .vhead .vtools {
    display: flex;
  }
  .vtool {
    width: 22px;
    height: 22px;
    border: 0;
    background: none;
    border-radius: 5px;
    color: var(--muted);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .vtool:hover {
    background: var(--groove);
    color: var(--text);
  }
  ```

- [ ] Step 2: Write the failing test first — create `frontend/src/reportEditor/WidgetChrome.test.tsx`:
  ```tsx
  import { render, screen } from "@testing-library/react";
  import userEvent from "@testing-library/user-event";
  import { describe, expect, it, vi } from "vitest";
  import WidgetChrome from "./WidgetChrome";

  describe("WidgetChrome", () => {
    it("always shows the title", () => {
      render(<WidgetChrome title="Revenue by Month" selected={false} onDuplicate={vi.fn()} onDelete={vi.fn()}><div>body</div></WidgetChrome>);

      expect(screen.getByText("Revenue by Month")).toBeInTheDocument();
    });

    it("hides duplicate/delete icons when not selected", () => {
      render(<WidgetChrome title="W" selected={false} onDuplicate={vi.fn()} onDelete={vi.fn()}><div>body</div></WidgetChrome>);

      expect(screen.queryByTitle("Duplicate")).not.toBeInTheDocument();
      expect(screen.queryByTitle("Delete")).not.toBeInTheDocument();
    });

    it("shows duplicate/delete icons when selected, and each calls its callback", async () => {
      const onDuplicate = vi.fn();
      const onDelete = vi.fn();
      render(<WidgetChrome title="W" selected onDuplicate={onDuplicate} onDelete={onDelete}><div>body</div></WidgetChrome>);

      await userEvent.click(screen.getByTitle("Duplicate"));
      await userEvent.click(screen.getByTitle("Delete"));

      expect(onDuplicate).toHaveBeenCalledTimes(1);
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });
  ```

- [ ] Step 3: Run the test to confirm it fails (module doesn't exist yet):
  ```
  cd frontend && npm run verify
  ```
  Expected: fails to resolve `./WidgetChrome`.

- [ ] Step 4: Create `frontend/src/reportEditor/WidgetChrome.tsx`:
  ```tsx
  import type { ReactNode } from "react";
  import "./reportEditor.css";

  function WidgetChrome({
    title, selected, onDuplicate, onDelete, children,
  }: {
    title: string;
    selected: boolean;
    onDuplicate: () => void;
    onDelete: () => void;
    children: ReactNode;
  }) {
    return (
      <div className={"visual" + (selected ? " selected" : "")}>
        <div className="vhead">
          <span className="vtitle">{title}</span>
          <div className="vtools">
            <button type="button" className="vtool" title="Duplicate" onClick={onDuplicate}>⧉</button>
            <button type="button" className="vtool" title="Delete" onClick={onDelete}>🗑</button>
          </div>
        </div>
        {children}
      </div>
    );
  }

  export default WidgetChrome;
  ```

- [ ] Step 5: Run the test:
  ```
  cd frontend && npm run verify
  ```
  Expected: all pass.

- [ ] Step 6: Modify `frontend/src/pages/ReportCanvas.tsx` — wrap each `.grid-stack-item-content`'s inner markup in `WidgetChrome`, replacing the bare always-visible `Remove` button, and add a `duplicateWidget` function (a client-side copy of the widget + its binding, given a new negative temp id, offset by 24px per the mockup's own `duplicate()` — matching Milestone 4's existing temp-id convention for not-yet-saved widgets):
  ```tsx
    function duplicateWidget(source: WidgetDraft) {
      dispatch({
        type: "added",
        widget: { ...source, id: tempIdCounter--, x: source.x + 1, y: source.y + 1 },
      });
    }
  ```
  and replace the widget-rendering loop's inner content:
  ```tsx
                      <div className="grid-stack-item-content">
                        <WidgetChrome
                          title={w.title}
                          selected={selectedWidgetId === w.id}
                          onDuplicate={() => duplicateWidget(w)}
                          onDelete={() => removeWidget(w.id)}
                        >
                          <input
                            value={w.title}
                            onChange={(e) => dispatch({ type: "titleChanged", id: w.id, title: e.target.value })}
                          />
                          {w.type === "Text" && (
                            <textarea
                              value={w.content ?? ""}
                              onChange={(e) => dispatch({ type: "contentChanged", id: w.id, content: e.target.value })}
                            />
                          )}
                          <WidgetRenderer
                            widget={w}
                            result={filteredResult}
                            onDataPointClick={(field, value) => setFilterState(toggleCrossFilterValue(filterState, field, value))}
                          />
                        </WidgetChrome>
                      </div>
  ```
  Add the import: `import WidgetChrome from "../reportEditor/WidgetChrome";`. (The `onClick={() => setSelectedWidgetId(w.id)}` from Task 12 stays on the outer `.grid-stack-item-content` div, unchanged — clicking anywhere on the widget still selects it; only the header/tools markup changes here.)

- [ ] Step 7: Close the second self-review gap — the left rail's "Data table" button (Task 11) has no behavior. Add a `railView` state and a raw-rows table using the existing `QueryResultGrid` component (Milestone 3) when "Data table" is active:
  ```tsx
    const [railView, setRailView] = useState<"Report" | "Data table">("Report");
  ```
  Add the import: `import QueryResultGrid from "../components/QueryResultGrid";` and `const { rawResult } = useReportQuery();` (add `rawResult` to the existing destructure). Wire the two rail buttons:
  ```tsx
            <button className={"rbtn" + (railView === "Report" ? " active" : "")} title="Report" onClick={() => setRailView("Report")}>▦</button>
            <button className={"rbtn" + (railView === "Data table" ? " active" : "")} title="Data table" onClick={() => setRailView("Data table")}>☰</button>
  ```
  and wrap the existing `.stage` content so it only renders for `railView === "Report"`, adding a sibling branch for `"Data table"`:
  ```tsx
          <div className="stage">
            {railView === "Report" ? (
              <>
                {/* ...unchanged stagebar/scroll/canvas from Tasks 11-22... */}
              </>
            ) : (
              <div className="scroll">
                <QueryResultGrid result={rawResult} />
              </div>
            )}
          </div>
  ```

- [ ] Step 8: Close the one deliberately-deferred gap from Task 15 — checking a field in the Data pane when **no widget is selected** should create a new widget (defaulting to a Bar/"clustered column", matching the mockup's `toggleFieldOnSelected` behavior) rather than silently doing nothing. Write the failing test first — append to `frontend/src/reportEditor/DataPane.test.tsx`:
  ```tsx
  it("checking a field when nothing is selected calls onSmartAdd anyway, letting the caller decide to create a widget", async () => {
    const onSmartAdd = vi.fn();
    render(<DataPane columns={columns} selectedWidget={null} onSmartAdd={onSmartAdd} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Revenue" }));

    expect(onSmartAdd).toHaveBeenCalledWith("Revenue", "Numeric");
  });
  ```
  This test already passes as-is (`onSmartAdd` was never gated on `selectedWidget` inside `DataPane` itself — the gap is entirely in `ReportCanvas.tsx`'s `onSmartAdd` handler, which returns early when `selectedWidgetId === null`). Confirm it passes, then move to Step 9 for the real fix.

- [ ] Step 9: Modify `frontend/src/pages/ReportCanvas.tsx` — change the `DataPane`'s `onSmartAdd` handler (added in Task 15) so that when nothing is selected, it creates a new `Bar` widget first and applies the field to it:
  ```tsx
            onSmartAdd={(fieldName, fieldKind) => {
              if (selectedWidgetId === null) {
                const newId = tempIdCounter--;
                const binding = smartAdd(
                  { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS },
                  "Bar",
                  fieldName,
                  fieldKind,
                );
                dispatch({
                  type: "added",
                  widget: { id: newId, type: "Bar", x: 0, y: 0, w: 4, h: 3, title: "New Bar widget", content: null, binding },
                });
                setSelectedWidgetId(newId);
                return;
              }

              const widget = widgets.find((w) => w.id === selectedWidgetId);
              if (!widget?.binding) {
                return;
              }
              dispatch({ type: "bindingChanged", id: selectedWidgetId, binding: smartAdd(widget.binding, widget.type, fieldName, fieldKind) });
            }}
  ```
  Add `DEFAULT_FORMAT_OPTIONS` to the existing `import { getWidgets, saveWidgets, parseFormatOptions, ... } from "../api/widgets";` line if it isn't already imported.

- [ ] Step 10: Wire `VisualizationsPane`'s viz-cell click to also assign the just-smart-added field the same way when adding a brand-new widget from the picker grid — confirm `onAddWidget` (Task 12) still creates a blank widget with an empty binding for its type; this is already correct and needs no change, since the picker grid's job is only to create the shell, not to pre-fill it (only Data-pane smart-add pre-fills a field, matching the mockup's own split between `addVisual` (blank) and `toggleFieldOnSelected` (smart-add, possibly creating a widget first)). No code change — verification only.

- [ ] Step 11: Verify the empty-state copy matches `report-designer.html` verbatim. Open `frontend/src/pages/ReportCanvas.tsx` and confirm the `.canvas-empty` block reads exactly:
  ```tsx
                  <div className="canvas-empty">
                    <b>Build your report</b>
                    <div>Pick a visual from the right, or drag a field onto the canvas.</div>
                  </div>
  ```
  (Already correct from Task 11 — this step is a confirmation, not a change.)

- [ ] Step 12: Modify `frontend/src/pages/ReportsPage.tsx` and `frontend/src/pages/DatasetsPage.tsx` for visual consistency with the Meridian tokens now that they exist (Task 10) — replace the bare MUI default `Button`/`Typography` color usage with nothing functionally different, but confirm both pages render under `AppShellLayout` (already true since Task 10) and that `DatasetsPage`'s dataset listing table has no way to reach an `IsSaved: false` row (it can't — `DatasetService.ListAsync` filters those out server-side per Task 3 — this step is a read-through confirmation, not a code change unless something is found broken).

- [ ] Step 13: Run a full manual smoke test end-to-end against the real backend. Confirm no stale `Backend.exe` is holding port 5198, then start both apps:
  ```
  Get-Process -Name Backend -ErrorAction SilentlyContinue | Stop-Process -Force
  dotnet run --project backend --launch-profile http
  ```
  In a second terminal:
  ```
  cd frontend && npm run dev
  ```
  In a browser: create a Connection (if none exist), create a Report, define its query with a real `SELECT`, confirm the editor opens with the Data pane populated, drag a categorical field and a numeric field onto a new Bar widget's Axis/Values wells, Save, reload `/reports/{id}` (View) and confirm the same widget renders read-only, click a bar to cross-filter, confirm the Filters pane checkbox reflects the click, add a second page via the `+` tab, confirm its widgets are independent of the first page's, click the rail's "Data table" button and confirm it shows the report's raw query rows, select a widget and confirm Duplicate/Delete icons appear only then.

- [ ] Step 14: Run both full test suites one final time:
  ```
  dotnet test Backend.Tests
  cd frontend && npm run verify
  ```
  Expected: both fully green — this is the last task in the plan.

- [ ] Step 15: Commit:
  ```
  git add frontend/src/reportEditor/reportEditor.css frontend/src/reportEditor/WidgetChrome.tsx frontend/src/reportEditor/WidgetChrome.test.tsx frontend/src/reportEditor/DataPane.tsx frontend/src/reportEditor/DataPane.test.tsx frontend/src/pages/ReportCanvas.tsx
  git commit -m "frontend: widget header chrome with select-gated duplicate/delete, Data table rail view, smart-add creates a widget when none is selected"
  ```

---
