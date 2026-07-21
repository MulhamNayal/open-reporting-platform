# Milestone 3: Datasets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** let a user define a `Dataset` — a saved, named query against a registered `DataSourceConnection` — and actually execute it to get back typed tabular rows (columns + values), closing the gap Milestone 2 deliberately left open.

**Architecture:** `DatasetsController → DatasetService → IDataSourceProvider.ExecuteQueryAsync (SqlServerProvider | RestApiProvider) → real data source`. Same database Milestones 1-2 already stood up — `Dataset` is a new `DbSet` alongside `Reports`/`DataSourceConnections`, one more migration. Frontend adds a Dataset creation/preview flow reachable from `/datasources`.

**Tech Stack:** .NET 8, EF Core 8 (SqlServer + InMemory, both already pinned at `8.0.11`), `Microsoft.Data.SqlClient` (already referenced transitively), `System.Text.Json`, xUnit, hand-rolled fakes (no mocking library, matching Milestone 2's convention), React + Vite + TypeScript + MUI (already in place), axios.

See `docs/superpowers/specs/2026-07-21-milestone-3-datasets-design.md` for the full approved design — this plan is the task breakdown for building it.

## Global Constraints

- Package versions pinned to `8.0.11` for every EF Core package, same as Milestones 1-2 — no new EF Core package needed for this milestone (`Dataset` is a plain new entity, same `ReportingDbContext`).
- No new backend NuGet packages. `Microsoft.Data.SqlClient` is already referenced transitively via `Microsoft.EntityFrameworkCore.SqlServer`. `System.Net.Http.Headers` (for the REST Bearer-token header) ships in the base class library — no package.
- Namespace/casing stays `Backend.*` (capital B) everywhere — CI builds on `ubuntu-latest`, case-sensitive filesystem, same rule as every prior milestone.
- A single `DatasetMode` enum (`TableQuery`, `RawSql`, `StoredProcedure`, `RestQuery`) discriminates every `Dataset` row regardless of connection type — the design doc describes `TableQuery`/`RawSql`/`StoredProcedure` as "SqlServer connections only choose among these" and REST as "one implicit mode," but a single EF Core table needs one discriminator column for every row. `RestQuery` is that fourth enum value, used only for `DataSourceConnection.Type == RestApi`. This is the same unification the Milestone 2 design underwent during its own self-review (see that milestone's `SupportedType` fix) — flagging it here as a judgment call the design doc's prose doesn't spell out at the schema level, not a silent deviation.
- `Dataset.Definition` and `Dataset.Columns` are both stored as plain `string` columns holding JSON (serialized/deserialized with `System.Text.Json`), matching how Milestone 2 stored `EncryptedCredentials` as a string rather than adding EF Core JSON-column configuration — no new EF Core concept introduced.
- Real-I/O provider methods (`ExecuteQueryAsync` and the mode-specific discovery methods on `SqlServerProvider`/`RestApiProvider`) are NOT unit tested with real SQL Server / real HTTP in this plan's TDD tasks — same precedent as Milestone 2's `SqlServerProvider.TestConnectionAsync`/`DiscoverSchemaAsync`. Pure, non-I/O logic (SQL text building, filter-operator validation, JSON type inference, row-capping arithmetic) gets full TDD; real I/O gets a manual smoke test in the migration task.
- REST Dataset execution/discovery attaches the connection's decrypted credentials as `Authorization: Bearer <token>` (parsed from the connection's `{"token": "..."}` JSON, matching Milestone 2's existing REST credential shape) — unlike Milestone 2's own (deliberately unauthenticated) whole-connection schema discovery, which is unchanged by this milestone.
- `DatasetService` gets its own `ICredentialProtector` dependency and decrypts a connection's credentials itself (mirroring `DataSourceService.WithDecryptedCredentials`'s exact approach) rather than reusing or exposing anything from `DataSourceService`. This duplicates a small amount of decrypt-into-transient-copy logic across the two services — a deliberate, minimal duplication consistent with this project's established preference for two small independent pieces over a shared abstraction built for a single reuse.
- All commands run from the repo root `C:\Users\Mulham\source\repos\open-reporting-platform` unless a step says otherwise. Shell is PowerShell (or bash/git-bash, per implementer's environment) plus `sqlcmd`/`curl.exe` for the manual smoke test, same tools used in Milestone 2's Task 7.
- `$env:ASPNETCORE_ENVIRONMENT = "Development"` needs to be set before any `dotnet ef` command in the migration task, same as every prior milestone.
- Same SQL Server Express instance as prior milestones (`localhost\SQLEXPRESS`, `OpenReportingPlatform` database) — this migration adds one table (`Datasets`), doesn't touch `Reports` or `DataSourceConnections`.
- Not doing this milestone (see design doc "Explicitly Out of Scope" — repeating here so it's visible while executing tasks): no multi-table joins in the query builder, no Report Designer UI, no cross-dialect SQL abstraction layer, no caching/refresh infrastructure, no runtime-editable stored-proc parameters, no REST methods beyond GET. Resist scope creep toward any of these while implementing.

---

### Task 1: `DatasetMode` enum + `Dataset` entity + `DbSet` on `ReportingDbContext`

**Files:**
- Create: `backend/Models/DatasetMode.cs`
- Create: `backend/Models/Dataset.cs`
- Modify: `backend/Data/ReportingDbContext.cs`

**Interfaces:**
- Consumes: nothing new — `ReportingDbContext` already has `DbSet<Report> Reports` and `DbSet<DataSourceConnection> DataSourceConnections`.
- Produces: `Backend.Models.DatasetMode` (enum: `TableQuery`, `RawSql`, `StoredProcedure`, `RestQuery`), `Backend.Models.Dataset` (mutable class, same style as `DataSourceConnection` — built up in steps by the service layer, not a single-constructor record), `DbSet<Dataset> Datasets` on `ReportingDbContext`. Every later task depends on this exact shape — property names/types don't move once Task 2 starts consuming them.

- [ ] Step 1: Create `backend/Models/DatasetMode.cs`:
  ```csharp
  namespace Backend.Models;

  public enum DatasetMode
  {
      TableQuery,
      RawSql,
      StoredProcedure,
      RestQuery
  }
  ```

- [ ] Step 2: Create `backend/Models/Dataset.cs`:
  ```csharp
  namespace Backend.Models;

  public class Dataset
  {
      public int Id { get; set; }

      public int DataSourceConnectionId { get; set; }

      public string Name { get; set; } = "";

      public string? Description { get; set; }

      public DatasetMode Mode { get; set; }

      public string Definition { get; set; } = "";

      public int? RowLimit { get; set; }

      public string Columns { get; set; } = "[]";

      public DateTime CreatedAtUtc { get; set; }

      public DateTime UpdatedAtUtc { get; set; }
  }
  ```
  `Columns` defaults to `"[]"` (an empty JSON array) rather than `""` — it's always deserialized as a `ColumnDescriptor[]` snapshot, and an empty array is a valid, meaningful "no columns discovered yet" state for a freshly-created Dataset, whereas an empty string isn't valid JSON at all.

- [ ] Step 3: Add the `DbSet` to `backend/Data/ReportingDbContext.cs` — full file after the change:
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

      protected override void OnModelCreating(ModelBuilder modelBuilder)
      {
          base.OnModelCreating(modelBuilder);

          modelBuilder.Entity<Report>().HasData(
              new Report(1, "Monthly Sales", "Sales totals grouped by month"),
              new Report(2, "Top Agents", "Agents ranked by closed deals"),
              new Report(3, "Pipeline Overview", "Open deals by stage")
          );
      }
  }
  ```
  No `HasData` seed for `Dataset` — same reasoning as `DataSourceConnection`, there's nothing sensible to seed.

- [ ] Step 4: Build to confirm it compiles:
  ```
  dotnet build backend/Backend.csproj
  ```
  Expected: `Build succeeded.` with 0 errors.

- [ ] Step 5: Commit:
  ```
  git add backend/Models/DatasetMode.cs backend/Models/Dataset.cs backend/Data/ReportingDbContext.cs
  git commit -m "backend: add Dataset entity, DatasetMode enum, and DbSet"
  ```

---

### Task 2: Shared query/result records + per-mode `Definition` DTOs (TDD the JSON round-trips)

**Files:**
- Create: `backend/Services/DataSources/ColumnDescriptor.cs`
- Create: `backend/Services/DataSources/QueryResult.cs`
- Create: `backend/Services/Datasets/QueryFilter.cs`
- Create: `backend/Services/Datasets/QuerySort.cs`
- Create: `backend/Services/Datasets/SelectQuery.cs`
- Create: `backend/Services/Datasets/StoredProcedureParameter.cs`
- Create: `backend/Services/Datasets/QueryParam.cs`
- Create: `backend/Services/Datasets/DatasetDefinitions.cs`
- Create: `Backend.Tests/DatasetDefinitionSerializationTests.cs`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `Backend.Services.DataSources.ColumnDescriptor` — `public record ColumnDescriptor(string Name, string NativeType);`. Lives alongside `SchemaDescriptor`/`ConnectionTestResult` in the existing `Backend.Services.DataSources` namespace (provider-level contracts), not the new `Backend.Services.Datasets` namespace — Task 3 onward, both `IDataSourceProvider` (which already lives in `Backend.Services.DataSources`) and every provider implementation reference it without a cross-namespace `using`.
  - `Backend.Services.DataSources.QueryResult` — `public record QueryResult(IReadOnlyList<ColumnDescriptor> Columns, IReadOnlyList<object?[]> Rows);`. Same namespace, same reasoning.
  - `Backend.Services.Datasets.QueryFilter` — `public record QueryFilter(string Field, string Operator, string Value);`
  - `Backend.Services.Datasets.QuerySort` — `public record QuerySort(string Field, string Direction);` (`Direction` is `"ASC"` or `"DESC"`, validated later in Task 3 where it's consumed, not here).
  - `Backend.Services.Datasets.SelectQuery` — `public record SelectQuery(string Table, IReadOnlyList<string> Columns, IReadOnlyList<QueryFilter> Filters, QuerySort? Sort, int? Top);`
  - `Backend.Services.Datasets.StoredProcedureParameter` — `public record StoredProcedureParameter(string Name, string Value);`
  - `Backend.Services.Datasets.QueryParam` — `public record QueryParam(string Key, string Value);`
  - `Backend.Services.Datasets.TableQueryDefinition`, `RawSqlDefinition`, `StoredProcedureDefinition`, `RestQueryDefinition` — the four `Dataset.Definition`/`Dataset.Columns`-adjacent shapes, all in `DatasetDefinitions.cs`. Every later task (Tasks 3-8) deserializes `Dataset.Definition` into exactly one of these four records depending on `Dataset.Mode`.

All of `Backend.Services.Datasets`'s new records are pure data — no behavior — so this task is tested via JSON round-trip (serialize, deserialize, assert equality), proving the shapes are stable and that nested records (e.g. `SelectQuery.Filters`, a list of `QueryFilter`) actually round-trip correctly through `System.Text.Json`, which is worth confirming now since Tasks 3-6 build real logic on top of these shapes.

- [ ] Step 1: Create `backend/Services/DataSources/ColumnDescriptor.cs`:
  ```csharp
  namespace Backend.Services.DataSources;

  public record ColumnDescriptor(string Name, string NativeType);
  ```

- [ ] Step 2: Create `backend/Services/DataSources/QueryResult.cs`:
  ```csharp
  namespace Backend.Services.DataSources;

  public record QueryResult(IReadOnlyList<ColumnDescriptor> Columns, IReadOnlyList<object?[]> Rows);
  ```

- [ ] Step 3: Create `backend/Services/Datasets/QueryFilter.cs`:
  ```csharp
  namespace Backend.Services.Datasets;

  public record QueryFilter(string Field, string Operator, string Value);
  ```

- [ ] Step 4: Create `backend/Services/Datasets/QuerySort.cs`:
  ```csharp
  namespace Backend.Services.Datasets;

  public record QuerySort(string Field, string Direction);
  ```

- [ ] Step 5: Create `backend/Services/Datasets/SelectQuery.cs`:
  ```csharp
  namespace Backend.Services.Datasets;

  public record SelectQuery(
      string Table,
      IReadOnlyList<string> Columns,
      IReadOnlyList<QueryFilter> Filters,
      QuerySort? Sort,
      int? Top);
  ```

- [ ] Step 6: Create `backend/Services/Datasets/StoredProcedureParameter.cs`:
  ```csharp
  namespace Backend.Services.Datasets;

  public record StoredProcedureParameter(string Name, string Value);
  ```

- [ ] Step 7: Create `backend/Services/Datasets/QueryParam.cs`:
  ```csharp
  namespace Backend.Services.Datasets;

  public record QueryParam(string Key, string Value);
  ```

- [ ] Step 8: Create `backend/Services/Datasets/DatasetDefinitions.cs` (all four per-mode definition shapes together, since they only ever travel as a discriminated set — exactly one is deserialized per `Dataset.Mode`):
  ```csharp
  namespace Backend.Services.Datasets;

  public record TableQueryDefinition(SelectQuery Query);

  public record RawSqlDefinition(string SqlText);

  public record StoredProcedureDefinition(string RoutineName, IReadOnlyList<StoredProcedureParameter> Parameters);

  public record RestQueryDefinition(string? PathSuffix, IReadOnlyList<QueryParam> QueryParams);
  ```

- [ ] Step 9: Write the round-trip tests — `Backend.Tests/DatasetDefinitionSerializationTests.cs`:
  ```csharp
  using System.Text.Json;
  using Backend.Services.DataSources;
  using Backend.Services.Datasets;

  namespace Backend.Tests;

  public class DatasetDefinitionSerializationTests
  {
      [Fact]
      public void TableQueryDefinition_RoundTripsThroughJson()
      {
          var definition = new TableQueryDefinition(new SelectQuery(
              "Reports",
              new[] { "Id", "Name" },
              new[] { new QueryFilter("Name", "=", "Monthly Sales") },
              new QuerySort("Id", "ASC"),
              10));

          var json = JsonSerializer.Serialize(definition);
          var roundTripped = JsonSerializer.Deserialize<TableQueryDefinition>(json);

          Assert.Equal(definition, roundTripped);
      }

      [Fact]
      public void RawSqlDefinition_RoundTripsThroughJson()
      {
          var definition = new RawSqlDefinition("SELECT Id, Name FROM Reports");

          var json = JsonSerializer.Serialize(definition);
          var roundTripped = JsonSerializer.Deserialize<RawSqlDefinition>(json);

          Assert.Equal(definition, roundTripped);
      }

      [Fact]
      public void StoredProcedureDefinition_RoundTripsThroughJson()
      {
          var definition = new StoredProcedureDefinition(
              "usp_GetTopReports",
              new[] { new StoredProcedureParameter("MinCount", "5") });

          var json = JsonSerializer.Serialize(definition);
          var roundTripped = JsonSerializer.Deserialize<StoredProcedureDefinition>(json);

          Assert.Equal(definition, roundTripped);
      }

      [Fact]
      public void RestQueryDefinition_RoundTripsThroughJson()
      {
          var definition = new RestQueryDefinition(
              "/users",
              new[] { new QueryParam("active", "true") });

          var json = JsonSerializer.Serialize(definition);
          var roundTripped = JsonSerializer.Deserialize<RestQueryDefinition>(json);

          Assert.Equal(definition, roundTripped);
      }

      [Fact]
      public void QueryResult_RoundTripsThroughJson_IncludingMixedRowValues()
      {
          var result = new QueryResult(
              new[] { new ColumnDescriptor("Id", "int"), new ColumnDescriptor("Name", "nvarchar(50)") },
              new object?[][] { new object?[] { 1, "Monthly Sales" }, new object?[] { 2, null } });

          var json = JsonSerializer.Serialize(result);
          var roundTripped = JsonSerializer.Deserialize<QueryResult>(json);

          Assert.Equal(2, roundTripped!.Columns.Count);
          Assert.Equal(2, roundTripped.Rows.Count);
      }
  }
  ```
  `QueryResult`'s round-trip test only checks counts, not deep equality, because `object?[]` deserializes numeric values back as `JsonElement`/`double` rather than the original `int` — that's an artifact of round-tripping a loosely-typed `object?[]` through JSON in a test, not a real concern for production code, where `Rows` is always freshly produced by a provider (never deserialized back into `object?[]` from JSON on the .NET side).

- [ ] Step 10: Run the tests:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass, including the 21 pre-existing tests from Milestone 2.

- [ ] Step 11: Commit:
  ```
  git add backend/Services/DataSources/ColumnDescriptor.cs backend/Services/DataSources/QueryResult.cs backend/Services/Datasets/QueryFilter.cs backend/Services/Datasets/QuerySort.cs backend/Services/Datasets/SelectQuery.cs backend/Services/Datasets/StoredProcedureParameter.cs backend/Services/Datasets/QueryParam.cs backend/Services/Datasets/DatasetDefinitions.cs Backend.Tests/DatasetDefinitionSerializationTests.cs
  git commit -m "backend: Dataset query/result records and per-mode Definition DTOs (TDD JSON round-trips)"
  ```

---

### Task 3: `IDataSourceProvider.ExecuteQueryAsync` + `SqlServerProvider` `TableQuery` mode + `RestApiProvider` `RestQuery` mode

**Files:**
- Modify: `backend/Services/DataSources/IDataSourceProvider.cs`
- Modify: `backend/Services/DataSources/SqlServerProvider.cs`
- Modify: `backend/Services/DataSources/RestApiProvider.cs`
- Create: `Backend.Tests/SqlServerProviderQueryBuilderTests.cs`
- Create: `Backend.Tests/RestApiProviderExecuteQueryTests.cs`

**Interfaces:**
- Consumes: `Backend.Models.Dataset`/`DatasetMode` (Task 1), `SelectQuery`/`QueryFilter`/`QuerySort`/`RestQueryDefinition`/`QueryParam`/`TableQueryDefinition` (Task 2), `ColumnDescriptor`/`QueryResult` (Task 2).
- Produces: `IDataSourceProvider.ExecuteQueryAsync(DataSourceConnection connection, Dataset dataset, int rowLimit, CancellationToken cancellationToken) -> Task<QueryResult>`, implemented by both providers. `SqlServerProvider` gains a public `BuildTableQuerySql(SelectQuery query, int rowLimit) -> (string Sql, IReadOnlyList<SqlParameter> Parameters)` helper — TDD'd here — that Tasks 4-5 don't touch. Every later task (Tasks 7-8, the service/controller) depends on this exact method signature; the two mode-specific provider extensions (RawSql/StoredProcedure for SqlServer, discovery for both) come in Tasks 4-6.

This task adds a new member to `IDataSourceProvider`, which both concrete providers must implement immediately for the solution to compile — same situation Milestone 2's Tasks 8+9 hit with the frontend build. Rather than leave a red build between commits, this task folds the interface change together with each provider's *simplest* mode (`SqlServerProvider` → `TableQuery`, `RestApiProvider` → `RestQuery`) in one task, exactly mirroring how Milestone 2 folded its two frontend tasks for the same reason. `SqlServerProvider`'s `RawSql`/`StoredProcedure` modes and both providers' discovery methods come in Tasks 4-6, once the interface is stable and both providers already compile against it.

**Filter operator allow-list:** `QueryFilter.Operator` is inserted as literal SQL text (the operator itself, not the value — the value is always parameterized), so it must be validated against a fixed allow-list before use: `=`, `!=`, `>`, `<`, `>=`, `<=`, `LIKE`. An operator outside this list throws `InvalidOperationException` — this is the one place a Dataset's stored `Definition` could otherwise inject arbitrary SQL fragments if it were ever populated by something other than this app's own query-builder UI.

- [ ] Step 1: Add `ExecuteQueryAsync` to `backend/Services/DataSources/IDataSourceProvider.cs` — full file after the change:
  ```csharp
  using Backend.Models;

  namespace Backend.Services.DataSources;

  public interface IDataSourceProvider
  {
      DataSourceType SupportedType { get; }

      Task<ConnectionTestResult> TestConnectionAsync(DataSourceConnection connection);

      Task<SchemaDescriptor> DiscoverSchemaAsync(DataSourceConnection connection);

      Task<QueryResult> ExecuteQueryAsync(DataSourceConnection connection, Dataset dataset, int rowLimit, CancellationToken cancellationToken);
  }
  ```

- [ ] Step 2: Write the failing tests for the pure SQL-building logic — `Backend.Tests/SqlServerProviderQueryBuilderTests.cs`:
  ```csharp
  using Backend.Services.Datasets;
  using Backend.Services.DataSources;
  using Xunit;

  namespace Backend.Tests;

  public class SqlServerProviderQueryBuilderTests
  {
      [Fact]
      public void BuildTableQuerySql_IncludesTableColumnsAndTop()
      {
          var provider = new SqlServerProvider();
          var query = new SelectQuery("Reports", new[] { "Id", "Name" }, Array.Empty<QueryFilter>(), null, null);

          var (sql, parameters) = provider.BuildTableQuerySql(query, rowLimit: 100);

          Assert.Contains("SELECT TOP (100) [Id], [Name]", sql);
          Assert.Contains("FROM [Reports]", sql);
          Assert.Empty(parameters);
      }

      [Fact]
      public void BuildTableQuerySql_UsesSmallerOfTopAndRowLimit()
      {
          var provider = new SqlServerProvider();
          var query = new SelectQuery("Reports", new[] { "Id" }, Array.Empty<QueryFilter>(), null, Top: 5);

          var (sql, _) = provider.BuildTableQuerySql(query, rowLimit: 100);

          Assert.Contains("TOP (5)", sql);
      }

      [Fact]
      public void BuildTableQuerySql_AddsWhereClauseWithParameterizedValues()
      {
          var provider = new SqlServerProvider();
          var query = new SelectQuery(
              "Reports",
              new[] { "Id", "Name" },
              new[] { new QueryFilter("Name", "=", "Monthly Sales") },
              null,
              null);

          var (sql, parameters) = provider.BuildTableQuerySql(query, rowLimit: 100);

          Assert.Contains("WHERE [Name] = @p0", sql);
          Assert.Single(parameters);
          Assert.Equal("@p0", parameters[0].ParameterName);
          Assert.Equal("Monthly Sales", parameters[0].Value);
      }

      [Fact]
      public void BuildTableQuerySql_AndsMultipleFilters()
      {
          var provider = new SqlServerProvider();
          var query = new SelectQuery(
              "Reports",
              new[] { "Id" },
              new[] { new QueryFilter("Name", "=", "X"), new QueryFilter("Id", ">", "1") },
              null,
              null);

          var (sql, parameters) = provider.BuildTableQuerySql(query, rowLimit: 100);

          Assert.Contains("WHERE [Name] = @p0 AND [Id] > @p1", sql);
          Assert.Equal(2, parameters.Count);
      }

      [Fact]
      public void BuildTableQuerySql_AddsOrderByWhenSortSpecified()
      {
          var provider = new SqlServerProvider();
          var query = new SelectQuery("Reports", new[] { "Id" }, Array.Empty<QueryFilter>(), new QuerySort("Id", "DESC"), null);

          var (sql, _) = provider.BuildTableQuerySql(query, rowLimit: 100);

          Assert.Contains("ORDER BY [Id] DESC", sql);
      }

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
  }
  ```

- [ ] Step 3: Run the tests to confirm they fail to compile (`BuildTableQuerySql` doesn't exist yet, and `SqlServerProvider`/`RestApiProvider` no longer compile against the extended interface):
  ```
  dotnet test Backend.Tests
  ```
  Expected: build errors — `CS0246`/`CS0535` (missing method, interface member not implemented).

- [ ] Step 4: Implement `BuildTableQuerySql` and `ExecuteQueryAsync`'s `TableQuery` branch in `backend/Services/DataSources/SqlServerProvider.cs`. Add these members to the existing class (alongside `BuildConnectionString`/`TestConnectionAsync`/`DiscoverSchemaAsync` — don't remove anything already there):
  ```csharp
  using Backend.Models;
  using Backend.Services.Datasets;
  using Microsoft.Data.SqlClient;

  // ... inside the existing SqlServerProvider class ...

  private static readonly HashSet<string> AllowedOperators = new() { "=", "!=", ">", "<", ">=", "<=", "LIKE" };
  private static readonly HashSet<string> AllowedSortDirections = new() { "ASC", "DESC" };

  public (string Sql, IReadOnlyList<SqlParameter> Parameters) BuildTableQuerySql(SelectQuery query, int rowLimit)
  {
      var effectiveTop = query.Top.HasValue ? Math.Min(query.Top.Value, rowLimit) : rowLimit;
      var columnList = string.Join(", ", query.Columns.Select(c => $"[{c}]"));

      var parameters = new List<SqlParameter>();
      var whereClauses = new List<string>();

      foreach (var filter in query.Filters)
      {
          if (!AllowedOperators.Contains(filter.Operator))
          {
              throw new InvalidOperationException($"Unsupported filter operator: {filter.Operator}");
          }

          var parameterName = $"@p{parameters.Count}";
          whereClauses.Add($"[{filter.Field}] {filter.Operator} {parameterName}");
          parameters.Add(new SqlParameter(parameterName, filter.Value));
      }

      var sql = $"SELECT TOP ({effectiveTop}) {columnList} FROM [{query.Table}]";

      if (whereClauses.Count > 0)
      {
          sql += " WHERE " + string.Join(" AND ", whereClauses);
      }

      if (query.Sort is not null)
      {
          if (!AllowedSortDirections.Contains(query.Sort.Direction))
          {
              throw new InvalidOperationException($"Unsupported sort direction: {query.Sort.Direction}");
          }

          sql += $" ORDER BY [{query.Sort.Field}] {query.Sort.Direction}";
      }

      return (sql, parameters);
  }

  public async Task<QueryResult> ExecuteQueryAsync(DataSourceConnection connection, Dataset dataset, int rowLimit, CancellationToken cancellationToken)
  {
      var connectionString = BuildConnectionString(connection);
      await using var sqlConnection = new SqlConnection(connectionString);
      await sqlConnection.OpenAsync(cancellationToken);

      string sql;
      IReadOnlyList<SqlParameter> parameters;

      switch (dataset.Mode)
      {
          case DatasetMode.TableQuery:
              var tableQueryDefinition = JsonSerializer.Deserialize<TableQueryDefinition>(dataset.Definition)!;
              (sql, parameters) = BuildTableQuerySql(tableQueryDefinition.Query, rowLimit);
              break;
          default:
              throw new NotSupportedException($"SqlServerProvider.ExecuteQueryAsync does not yet support mode {dataset.Mode}.");
      }

      await using var command = new SqlCommand(sql, sqlConnection);
      foreach (var parameter in parameters)
      {
          command.Parameters.Add(parameter);
      }

      return await ReadQueryResultAsync(command, rowLimit, cancellationToken);
  }

  private static async Task<QueryResult> ReadQueryResultAsync(SqlCommand command, int rowLimit, CancellationToken cancellationToken)
  {
      await using var reader = await command.ExecuteReaderAsync(cancellationToken);

      var columns = new List<ColumnDescriptor>();
      for (var i = 0; i < reader.FieldCount; i++)
      {
          columns.Add(new ColumnDescriptor(reader.GetName(i), reader.GetDataTypeName(i)));
      }

      var rows = new List<object?[]>();
      while (rows.Count < rowLimit && await reader.ReadAsync(cancellationToken))
      {
          var row = new object?[reader.FieldCount];
          for (var i = 0; i < reader.FieldCount; i++)
          {
              row[i] = reader.IsDBNull(i) ? null : reader.GetValue(i);
          }

          rows.Add(row);
      }

      return new QueryResult(columns, rows);
  }
  ```
  Add `using System.Text.Json;` and `using Backend.Services.Datasets;` to the top of the file alongside the existing usings. `ReadQueryResultAsync` is `private static` and reused as-is by Tasks 4-5 (RawSql/StoredProcedure), which only differ in how `sql`/`parameters` get built, not in how results get read — this is the DRY seam between all three SqlServer modes.

- [ ] Step 5: Implement `RestQuery` mode in `backend/Services/DataSources/RestApiProvider.cs`. Add `ExecuteQueryAsync` alongside the existing `TestConnectionAsync`/`DiscoverSchemaAsync`:
  ```csharp
  using Backend.Models;
  using Backend.Services.Datasets;
  using System.Net.Http.Headers;
  using System.Text.Json;

  // ... inside the existing RestApiProvider class ...

  public async Task<QueryResult> ExecuteQueryAsync(DataSourceConnection connection, Dataset dataset, int rowLimit, CancellationToken cancellationToken)
  {
      if (dataset.Mode != DatasetMode.RestQuery)
      {
          throw new NotSupportedException($"RestApiProvider.ExecuteQueryAsync does not support mode {dataset.Mode}.");
      }

      var definition = JsonSerializer.Deserialize<RestQueryDefinition>(dataset.Definition)!;
      var client = _httpClientFactory.CreateClient(nameof(RestApiProvider));

      var url = connection.Host + (definition.PathSuffix ?? "");
      if (definition.QueryParams.Count > 0)
      {
          var query = string.Join("&", definition.QueryParams.Select(p => $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(p.Value)}"));
          url += (url.Contains('?') ? "&" : "?") + query;
      }

      using var request = new HttpRequestMessage(HttpMethod.Get, url);
      AttachCredentials(request, connection);

      var response = await client.SendAsync(request, cancellationToken);
      response.EnsureSuccessStatusCode();

      var body = await response.Content.ReadAsStringAsync(cancellationToken);
      using var document = JsonDocument.Parse(body);

      return ParseQueryResult(document.RootElement, rowLimit);
  }

  private static void AttachCredentials(HttpRequestMessage request, DataSourceConnection connection)
  {
      if (string.IsNullOrWhiteSpace(connection.EncryptedCredentials))
      {
          return;
      }

      var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
      var credentials = JsonSerializer.Deserialize<RestCredentials>(connection.EncryptedCredentials, options);
      if (!string.IsNullOrWhiteSpace(credentials?.Token))
      {
          request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);
      }
  }

  private static QueryResult ParseQueryResult(JsonElement root, int rowLimit)
  {
      var items = root.ValueKind == JsonValueKind.Array
          ? root.EnumerateArray().ToList()
          : new List<JsonElement> { root };

      var sample = items.Count > 0 ? items[0] : default;

      var columns = new List<ColumnDescriptor>();
      if (sample.ValueKind == JsonValueKind.Object)
      {
          foreach (var property in sample.EnumerateObject())
          {
              columns.Add(new ColumnDescriptor(property.Name, InferDataType(property.Value)));
          }
      }

      var rows = new List<object?[]>();
      foreach (var item in items.Take(rowLimit))
      {
          if (item.ValueKind != JsonValueKind.Object)
          {
              continue;
          }

          var row = new object?[columns.Count];
          for (var i = 0; i < columns.Count; i++)
          {
              row[i] = item.TryGetProperty(columns[i].Name, out var value) ? ExtractValue(value) : null;
          }

          rows.Add(row);
      }

      return new QueryResult(columns, rows);
  }

  private static object? ExtractValue(JsonElement value)
  {
      return value.ValueKind switch
      {
          JsonValueKind.String => value.GetString(),
          JsonValueKind.Number => value.GetDouble(),
          JsonValueKind.True => true,
          JsonValueKind.False => false,
          JsonValueKind.Null => null,
          _ => value.GetRawText()
      };
  }

  private record RestCredentials(string? Token);
  ```
  `AttachCredentials`/`RestCredentials` are the concrete implementation of the design's "attach the connection's stored credentials as `Authorization: Bearer <token>`" decision. `InferDataType` already exists in this file from Milestone 2 (used by `DiscoverSchemaAsync`) — reuse it as-is here, don't duplicate it; `ParseQueryResult` is new (Milestone 2's schema discovery never needed to extract row values, only field shapes). Note `AttachCredentials`'s `PropertyNameCaseInsensitive = true` — the established REST credential shape is lowercase JSON (`{"token": "..."}`), matching `SqlServerProvider.ParseCredentials`'s own case-insensitive deserialization a few files over; without it, `System.Text.Json`'s default case-sensitive matching would silently fail to populate `RestCredentials.Token` and the Bearer header would never get attached — no exception, just a missing header.

- [ ] Step 6: Run the tests again to confirm they pass:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass, including everything from Tasks 1-2 and Milestone 2's 21.

- [ ] Step 7: Commit:
  ```
  git add backend/Services/DataSources/IDataSourceProvider.cs backend/Services/DataSources/SqlServerProvider.cs backend/Services/DataSources/RestApiProvider.cs Backend.Tests/SqlServerProviderQueryBuilderTests.cs
  git commit -m "backend: ExecuteQueryAsync on IDataSourceProvider; SqlServer TableQuery mode (TDD'd query builder), REST RestQuery mode with Bearer-token credential attachment"
  ```

---

### Task 4: `SqlServerProvider` `RawSql` mode + raw-SQL column discovery

**Files:**
- Modify: `backend/Services/DataSources/SqlServerProvider.cs`
- Create: `Backend.Tests/SqlServerProviderRawSqlTests.cs`

**Interfaces:**
- Consumes: `RawSqlDefinition` (Task 2), `ReadQueryResultAsync` (Task 3, private helper reused unchanged).
- Produces: `SqlServerProvider.ExecuteQueryAsync`'s `RawSql` branch; `public Task<IReadOnlyList<ColumnDescriptor>> DiscoverRawSqlColumnsAsync(DataSourceConnection connection, string sqlText, CancellationToken cancellationToken)`. Task 7 (`DatasetService`) calls this method directly (after resolving/casting to the concrete `SqlServerProvider`) for `RawSql`-mode column discovery.

This task's real-I/O parts (actually opening a SQL connection and running the wrapped query) are not unit tested here, same reasoning as Milestone 2's `SqlServerProvider.TestConnectionAsync` — no fake/in-memory substitute for "does this SQL actually run." What IS unit-testable is the pure SQL-text construction for the discovery wrapper, and the row-capping arithmetic reused from Task 3.

- [ ] Step 1: Write the failing test for the pure wrapping logic — `Backend.Tests/SqlServerProviderRawSqlTests.cs`:
  ```csharp
  using Backend.Services.DataSources;
  using Xunit;

  namespace Backend.Tests;

  public class SqlServerProviderRawSqlTests
  {
      [Fact]
      public void BuildRawSqlDiscoveryWrapper_WrapsUserSqlInTopZeroDerivedTable()
      {
          var provider = new SqlServerProvider();

          var wrapped = provider.BuildRawSqlDiscoveryWrapper("SELECT Id, Name FROM Reports");

          Assert.Equal("SELECT TOP (0) * FROM (SELECT Id, Name FROM Reports) AS x", wrapped);
      }
  }
  ```

- [ ] Step 2: Run the tests to confirm they fail (compile error — `BuildRawSqlDiscoveryWrapper` doesn't exist yet):
  ```
  dotnet test Backend.Tests
  ```
  Expected: `error CS1061` (or similar — method not found on `SqlServerProvider`). Red.

- [ ] Step 3: Add the `RawSql` branch to `ExecuteQueryAsync`'s `switch`, add `BuildRawSqlDiscoveryWrapper`, and add `DiscoverRawSqlColumnsAsync` to `backend/Services/DataSources/SqlServerProvider.cs`:
  ```csharp
  // Inside ExecuteQueryAsync's switch (dataset.Mode), add this case above `default`:
  case DatasetMode.RawSql:
      var rawSqlDefinition = JsonSerializer.Deserialize<RawSqlDefinition>(dataset.Definition)!;
      sql = rawSqlDefinition.SqlText;
      parameters = Array.Empty<SqlParameter>();
      break;

  // New members, added alongside BuildTableQuerySql:

  public string BuildRawSqlDiscoveryWrapper(string sqlText)
  {
      return $"SELECT TOP (0) * FROM ({sqlText}) AS x";
  }

  public async Task<IReadOnlyList<ColumnDescriptor>> DiscoverRawSqlColumnsAsync(DataSourceConnection connection, string sqlText, CancellationToken cancellationToken)
  {
      var connectionString = BuildConnectionString(connection);
      await using var sqlConnection = new SqlConnection(connectionString);
      await sqlConnection.OpenAsync(cancellationToken);

      var wrappedSql = BuildRawSqlDiscoveryWrapper(sqlText);

      try
      {
          await using var command = new SqlCommand(wrappedSql, sqlConnection);
          await using var reader = await command.ExecuteReaderAsync(cancellationToken);

          var columns = new List<ColumnDescriptor>();
          for (var i = 0; i < reader.FieldCount; i++)
          {
              columns.Add(new ColumnDescriptor(reader.GetName(i), reader.GetDataTypeName(i)));
          }

          return columns;
      }
      catch (SqlException ex) when (ex.Message.Contains("ORDER BY", StringComparison.OrdinalIgnoreCase))
      {
          throw new InvalidOperationException(
              "Column preview requires removing a trailing ORDER BY from this query — SQL Server doesn't allow one inside a derived table without TOP/OFFSET. The query itself will still run fine at execution time.",
              ex);
      }
  }
  ```
  The `catch` clause is the concrete implementation of the design's documented `ORDER BY`-in-derived-table gotcha — it's a targeted, named catch (checks the exception message for the specific SQL Server complaint), not a blanket catch-and-rewrap, so any other `SqlException` still surfaces with its original message.

- [ ] Step 4: Run the tests again to confirm they pass:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass, including everything from Tasks 1-3.

- [ ] Step 5: Commit:
  ```
  git add backend/Services/DataSources/SqlServerProvider.cs Backend.Tests/SqlServerProviderRawSqlTests.cs
  git commit -m "backend: SqlServerProvider RawSql mode execution + discovery-by-execution with ORDER BY gotcha handling"
  ```

---

### Task 5: `SqlServerProvider` `StoredProcedure` mode + stored-procedure column discovery

**Files:**
- Modify: `backend/Services/DataSources/SqlServerProvider.cs`
- Create: `Backend.Tests/SqlServerProviderStoredProcedureTests.cs`

**Interfaces:**
- Consumes: `StoredProcedureDefinition`/`StoredProcedureParameter` (Task 2), `ReadQueryResultAsync` (Task 3).
- Produces: `SqlServerProvider.ExecuteQueryAsync`'s `StoredProcedure` branch; `public Task<IReadOnlyList<ColumnDescriptor>> DiscoverStoredProcedureColumnsAsync(DataSourceConnection connection, string routineName, IReadOnlyList<StoredProcedureParameter> parameters, CancellationToken cancellationToken)`. Task 7 calls this directly, same pattern as Task 4's `DiscoverRawSqlColumnsAsync`.

Same testing shape as Task 4: the pure "build an `EXEC` command's parameter list" logic is TDD'd; the real invocation (which the design accepts happens once, for real, during discovery) is exercised only by the manual smoke test in Task 9.

- [ ] Step 1: Write the failing test — `Backend.Tests/SqlServerProviderStoredProcedureTests.cs`:
  ```csharp
  using Backend.Services.Datasets;
  using Backend.Services.DataSources;
  using Xunit;

  namespace Backend.Tests;

  public class SqlServerProviderStoredProcedureTests
  {
      [Fact]
      public void BuildStoredProcedureCommandText_UsesExecWithNamedParameters()
      {
          var provider = new SqlServerProvider();
          var parameters = new[] { new StoredProcedureParameter("MinCount", "5") };

          var (sql, sqlParameters) = provider.BuildStoredProcedureCommand("usp_GetTopReports", parameters);

          Assert.Equal("EXEC [usp_GetTopReports] @MinCount", sql);
          Assert.Single(sqlParameters);
          Assert.Equal("@MinCount", sqlParameters[0].ParameterName);
          Assert.Equal("5", sqlParameters[0].Value);
      }

      [Fact]
      public void BuildStoredProcedureCommandText_HandlesNoParameters()
      {
          var provider = new SqlServerProvider();

          var (sql, sqlParameters) = provider.BuildStoredProcedureCommand("usp_GetAllReports", Array.Empty<StoredProcedureParameter>());

          Assert.Equal("EXEC [usp_GetAllReports]", sql);
          Assert.Empty(sqlParameters);
      }

      [Fact]
      public void BuildStoredProcedureCommandText_JoinsMultipleParametersWithCommas()
      {
          var provider = new SqlServerProvider();
          var parameters = new[]
          {
              new StoredProcedureParameter("MinCount", "5"),
              new StoredProcedureParameter("Region", "West")
          };

          var (sql, sqlParameters) = provider.BuildStoredProcedureCommand("usp_GetTopReports", parameters);

          Assert.Equal("EXEC [usp_GetTopReports] @MinCount, @Region", sql);
          Assert.Equal(2, sqlParameters.Count);
      }
  }
  ```

- [ ] Step 2: Run the tests to confirm they fail (compile error — `BuildStoredProcedureCommand` doesn't exist yet):
  ```
  dotnet test Backend.Tests
  ```
  Expected: `error CS1061`. Red.

- [ ] Step 3: Add the `StoredProcedure` branch, `BuildStoredProcedureCommand`, and `DiscoverStoredProcedureColumnsAsync` to `backend/Services/DataSources/SqlServerProvider.cs`:
  ```csharp
  // Inside ExecuteQueryAsync's switch (dataset.Mode), add this case above `default`:
  case DatasetMode.StoredProcedure:
      var storedProcedureDefinition = JsonSerializer.Deserialize<StoredProcedureDefinition>(dataset.Definition)!;
      (sql, parameters) = BuildStoredProcedureCommand(storedProcedureDefinition.RoutineName, storedProcedureDefinition.Parameters);
      break;

  // New members:

  public (string Sql, IReadOnlyList<SqlParameter> Parameters) BuildStoredProcedureCommand(string routineName, IReadOnlyList<StoredProcedureParameter> parameters)
  {
      var sqlParameters = parameters
          .Select(p => new SqlParameter($"@{p.Name}", p.Value))
          .ToList();

      var parameterNames = string.Join(", ", sqlParameters.Select(p => p.ParameterName));
      var sql = parameterNames.Length > 0
          ? $"EXEC [{routineName}] {parameterNames}"
          : $"EXEC [{routineName}]";

      return (sql, sqlParameters);
  }

  public async Task<IReadOnlyList<ColumnDescriptor>> DiscoverStoredProcedureColumnsAsync(DataSourceConnection connection, string routineName, IReadOnlyList<StoredProcedureParameter> parameters, CancellationToken cancellationToken)
  {
      var connectionString = BuildConnectionString(connection);
      await using var sqlConnection = new SqlConnection(connectionString);
      await sqlConnection.OpenAsync(cancellationToken);

      var (sql, sqlParameters) = BuildStoredProcedureCommand(routineName, parameters);

      await using var command = new SqlCommand(sql, sqlConnection);
      foreach (var parameter in sqlParameters)
      {
          command.Parameters.Add(parameter);
      }

      await using var reader = await command.ExecuteReaderAsync(cancellationToken);

      var columns = new List<ColumnDescriptor>();
      for (var i = 0; i < reader.FieldCount; i++)
      {
          columns.Add(new ColumnDescriptor(reader.GetName(i), reader.GetDataTypeName(i)));
      }

      return columns;
  }
  ```
  `DiscoverStoredProcedureColumnsAsync` deliberately does NOT wrap the `EXEC` in anything like Task 4's `TOP (0)` trick — you can't wrap an arbitrary stored procedure call in a derived table the way you can a `SELECT`. It genuinely runs the procedure once with the caller-supplied parameter values and reads whatever the first result set's shape is, exactly as the design document accepts ("proc discovery causes one real invocation").

- [ ] Step 4: Run the tests again to confirm they pass:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass, including everything from Tasks 1-4.

- [ ] Step 5: Commit:
  ```
  git add backend/Services/DataSources/SqlServerProvider.cs Backend.Tests/SqlServerProviderStoredProcedureTests.cs
  git commit -m "backend: SqlServerProvider StoredProcedure mode execution + one-real-invocation column discovery"
  ```

---

### Task 6: REST column discovery for a specific Dataset (`RestQuery` mode)

**Files:**
- Modify: `backend/Services/DataSources/RestApiProvider.cs`
- Create: `Backend.Tests/RestApiProviderDiscoverColumnsTests.cs`

**Interfaces:**
- Consumes: `RestQueryDefinition`/`QueryParam` (Task 2), the existing `InferDataType` helper (Milestone 2, unchanged), `AttachCredentials` (Task 3).
- Produces: `public Task<IReadOnlyList<ColumnDescriptor>> DiscoverRestQueryColumnsAsync(DataSourceConnection connection, string? pathSuffix, IReadOnlyList<QueryParam> queryParams, CancellationToken cancellationToken)`. Task 7 calls this directly for `RestQuery`-mode column discovery — the counterpart to Tasks 4-5's SqlServer discovery methods.

Unlike the SqlServer discovery methods, this one IS fully unit-testable via the same fake `HttpMessageHandler`/`IHttpClientFactory` pattern Milestone 2 already established for `RestApiProviderTests` — no real network call needed.

- [ ] Step 1: Write the failing tests — `Backend.Tests/RestApiProviderDiscoverColumnsTests.cs` (reuses `FakeHttpMessageHandler`/`FakeHttpClientFactory` from Milestone 2, already in `Backend.Tests/`):
  ```csharp
  using System.Net;
  using Backend.Models;
  using Backend.Services.DataSources;
  using Backend.Services.Datasets;
  using Xunit;

  namespace Backend.Tests;

  public class RestApiProviderDiscoverColumnsTests
  {
      private static DataSourceConnection CreateConnection(string host)
      {
          return new DataSourceConnection
          {
              Id = 1,
              Name = "Test REST Source",
              Type = DataSourceType.RestApi,
              Host = host,
              DatabaseName = null,
              EncryptedCredentials = "",
              CreatedAtUtc = DateTime.UtcNow
          };
      }

      [Fact]
      public async Task DiscoverRestQueryColumnsAsync_AppendsPathSuffixAndQueryParamsToHost()
      {
          const string json = """[{ "id": 1, "name": "Alice" }]""";
          var handler = new FakeHttpMessageHandler(HttpStatusCode.OK, json);
          var factory = new FakeHttpClientFactory(handler);
          var provider = new RestApiProvider(factory);
          var connection = CreateConnection("https://api.example.com");

          var columns = await provider.DiscoverRestQueryColumnsAsync(
              connection, "/users", new[] { new QueryParam("active", "true") }, CancellationToken.None);

          Assert.Equal(2, columns.Count);
          Assert.Contains(columns, c => c.Name == "id" && c.NativeType == "number");
          Assert.Contains(columns, c => c.Name == "name" && c.NativeType == "string");
      }

      [Fact]
      public async Task DiscoverRestQueryColumnsAsync_HandlesNullPathSuffixAndNoQueryParams()
      {
          const string json = """{ "total": 42 }""";
          var handler = new FakeHttpMessageHandler(HttpStatusCode.OK, json);
          var factory = new FakeHttpClientFactory(handler);
          var provider = new RestApiProvider(factory);
          var connection = CreateConnection("https://api.example.com/summary");

          var columns = await provider.DiscoverRestQueryColumnsAsync(connection, null, Array.Empty<QueryParam>(), CancellationToken.None);

          var column = Assert.Single(columns);
          Assert.Equal("total", column.Name);
          Assert.Equal("number", column.NativeType);
      }
  }
  ```

- [ ] Step 2: Run the tests to confirm they fail (compile error — `DiscoverRestQueryColumnsAsync` doesn't exist yet):
  ```
  dotnet test Backend.Tests
  ```
  Expected: `error CS1061`. Red.

- [ ] Step 3: Add `DiscoverRestQueryColumnsAsync` to `backend/Services/DataSources/RestApiProvider.cs`, extracting the shared URL-composition logic from `ExecuteQueryAsync` (Task 3) into a small private helper so it isn't duplicated:
  ```csharp
  // New member, added alongside ExecuteQueryAsync:

  public async Task<IReadOnlyList<ColumnDescriptor>> DiscoverRestQueryColumnsAsync(DataSourceConnection connection, string? pathSuffix, IReadOnlyList<QueryParam> queryParams, CancellationToken cancellationToken)
  {
      var client = _httpClientFactory.CreateClient(nameof(RestApiProvider));
      var url = BuildUrl(connection.Host, pathSuffix, queryParams);

      using var request = new HttpRequestMessage(HttpMethod.Get, url);
      AttachCredentials(request, connection);

      var response = await client.SendAsync(request, cancellationToken);
      response.EnsureSuccessStatusCode();

      var body = await response.Content.ReadAsStringAsync(cancellationToken);
      using var document = JsonDocument.Parse(body);

      return ParseQueryResult(document.RootElement, rowLimit: 0).Columns;
  }

  private static string BuildUrl(string host, string? pathSuffix, IReadOnlyList<QueryParam> queryParams)
  {
      var url = host + (pathSuffix ?? "");
      if (queryParams.Count > 0)
      {
          var query = string.Join("&", queryParams.Select(p => $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(p.Value)}"));
          url += (url.Contains('?') ? "&" : "?") + query;
      }

      return url;
  }
  ```
  Then update `ExecuteQueryAsync` (Task 3) to call this same `BuildUrl` helper instead of its own inline URL-building code. Replace this whole block from Task 3's `ExecuteQueryAsync`:
  ```csharp
  var url = connection.Host + (definition.PathSuffix ?? "");
  if (definition.QueryParams.Count > 0)
  {
      var query = string.Join("&", definition.QueryParams.Select(p => $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(p.Value)}"));
      url += (url.Contains('?') ? "&" : "?") + query;
  }
  ```
  with this single line:
  ```csharp
  var url = BuildUrl(connection.Host, definition.PathSuffix, definition.QueryParams);
  ```
  This removes the small duplication Task 3 would otherwise leave behind once this task adds a second caller that needs the same URL-composition logic. `rowLimit: 0` passed to `ParseQueryResult` means zero rows get collected — exactly the "discovery, not execution" semantics this method needs, reusing the same parsing/type-inference code Task 3 already wrote rather than duplicating it.

- [ ] Step 4: Run the tests again to confirm they pass:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass, including everything from Tasks 1-5.

- [ ] Step 5: Commit:
  ```
  git add backend/Services/DataSources/RestApiProvider.cs Backend.Tests/RestApiProviderDiscoverColumnsTests.cs
  git commit -m "backend: RestApiProvider RestQuery column discovery, extract shared URL-building helper"
  ```

---

### Task 7: `IDatasetService`/`DatasetService` (TDD via EF Core InMemory + stub providers)

**Files:**
- Create: `backend/Services/Datasets/DatasetSummary.cs`
- Create: `backend/Services/Datasets/CreateDatasetRequest.cs`
- Create: `backend/Services/Datasets/IDatasetService.cs`
- Create: `backend/Services/Datasets/DatasetService.cs`
- Create: `Backend.Tests/DatasetServiceTests.cs`

**Interfaces:**
- Consumes: `Backend.Data.ReportingDbContext` (now with `Datasets`, Task 1), `Backend.Models.Dataset`/`DatasetMode` (Task 1), all the `Backend.Services.Datasets` records (Task 2), `IDataSourceProvider`/`ExecuteQueryAsync`/`SupportedType` (Task 3), `SqlServerProvider.DiscoverRawSqlColumnsAsync`/`DiscoverStoredProcedureColumnsAsync` (Tasks 4-5), `RestApiProvider.DiscoverRestQueryColumnsAsync` (Task 6), `Backend.Services.DataSources.ICredentialProtector` (Milestone 2), `Backend.Services.DataSources.DataSourceConnection` (Milestone 2), `ColumnDescriptor`/`QueryResult`/`SchemaDescriptor` (Milestone 2 + Task 2).
- Produces:
  - `public record DatasetSummary(int Id, int DataSourceConnectionId, string Name, string? Description, DatasetMode Mode, int? RowLimit, IReadOnlyList<ColumnDescriptor> Columns, DateTime CreatedAtUtc, DateTime UpdatedAtUtc);` — the list/detail projection. Task 8's controller passes this straight through.
  - `public record CreateDatasetRequest(int DataSourceConnectionId, string Name, string? Description, DatasetMode Mode, string DefinitionJson, int? RowLimit);` — `DefinitionJson` is the already-JSON-serialized per-mode definition the frontend sends (the frontend, not the backend, knows which of the four definition shapes it's building); the service stores it as-is in `Dataset.Definition`.
  - `Backend.Services.Datasets.IDatasetService` — `Task<DatasetSummary> CreateAsync(CreateDatasetRequest request)`, `Task<IReadOnlyList<DatasetSummary>> ListAsync(int connectionId)`, `Task<IReadOnlyList<ColumnDescriptor>> DiscoverColumnsAsync(int datasetId)`, `Task<QueryResult> ExecuteAsync(int datasetId)`.
  - `Backend.Services.Datasets.DatasetService : IDatasetService`, constructor `DatasetService(ReportingDbContext context, ICredentialProtector credentialProtector, IEnumerable<IDataSourceProvider> providers)`. Task 8's DI wiring depends on this exact constructor shape.

**Mode/connection-type validation:** `CreateAsync` throws `InvalidOperationException` if `Mode` is `RestQuery` but the connection's `Type` isn't `RestApi`, or if `Mode` is anything else but the connection's `Type` isn't `SqlServer` — the guard clause the design doc calls for.

**Default row limit:** a `private const int DefaultRowLimit = 1000;` — used whenever `Dataset.RowLimit` is `null`.

- [ ] Step 1: Create `backend/Services/Datasets/DatasetSummary.cs`:
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
      IReadOnlyList<ColumnDescriptor> Columns,
      DateTime CreatedAtUtc,
      DateTime UpdatedAtUtc);
  ```

- [ ] Step 2: Create `backend/Services/Datasets/CreateDatasetRequest.cs`:
  ```csharp
  using Backend.Models;

  namespace Backend.Services.Datasets;

  public record CreateDatasetRequest(
      int DataSourceConnectionId,
      string Name,
      string? Description,
      DatasetMode Mode,
      string DefinitionJson,
      int? RowLimit);
  ```

- [ ] Step 3: Create `backend/Services/Datasets/IDatasetService.cs`:
  ```csharp
  using Backend.Services.DataSources;

  namespace Backend.Services.Datasets;

  public interface IDatasetService
  {
      Task<DatasetSummary> CreateAsync(CreateDatasetRequest request);

      Task<IReadOnlyList<DatasetSummary>> ListAsync(int connectionId);

      Task<IReadOnlyList<ColumnDescriptor>> DiscoverColumnsAsync(int datasetId);

      Task<QueryResult> ExecuteAsync(int datasetId);
  }
  ```

- [ ] Step 4: Write the failing tests — `Backend.Tests/DatasetServiceTests.cs`:
  ```csharp
  using Backend.Data;
  using Backend.Models;
  using Backend.Services.DataSources;
  using Backend.Services.Datasets;
  using Microsoft.EntityFrameworkCore;
  using System.Text.Json;
  using Xunit;

  namespace Backend.Tests;

  public class DatasetServiceTests
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
              Task.FromResult(new SchemaDescriptor(new List<TableDescriptor>
              {
                  new("Reports", new List<FieldDescriptor> { new("Id", "int"), new("Name", "nvarchar(50)") })
              }));

          public Task<QueryResult> ExecuteQueryAsync(DataSourceConnection connection, Dataset dataset, int rowLimit, CancellationToken cancellationToken) =>
              Task.FromResult(new QueryResult(
                  new List<ColumnDescriptor> { new("Id", "int") },
                  new List<object?[]> { new object?[] { 1 } }));
      }

      private static (IDatasetService Service, ReportingDbContext Context) CreateService(string databaseName)
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

          var providers = new List<IDataSourceProvider> { new StubSqlServerProvider() };
          var service = new DatasetService(context, new PassThroughCredentialProtector(), providers);
          return (service, context);
      }

      private static string TableQueryDefinitionJson()
      {
          var definition = new TableQueryDefinition(new SelectQuery("Reports", new[] { "Id", "Name" }, Array.Empty<QueryFilter>(), null, null));
          return JsonSerializer.Serialize(definition);
      }

      [Fact]
      public async Task CreateAsync_PersistsDatasetWithProvidedFields()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());

          var summary = await service.CreateAsync(new CreateDatasetRequest(
              1, "Reports Table", "All reports", DatasetMode.TableQuery, TableQueryDefinitionJson(), RowLimit: 50));

          var stored = await context.Datasets.FirstAsync(d => d.Id == summary.Id);
          Assert.Equal("Reports Table", stored.Name);
          Assert.Equal(DatasetMode.TableQuery, stored.Mode);
          Assert.Equal(50, stored.RowLimit);
          Assert.NotEqual(default, stored.CreatedAtUtc);
          Assert.NotEqual(default, stored.UpdatedAtUtc);
      }

      [Fact]
      public async Task CreateAsync_RejectsModeMismatchedWithConnectionType()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());

          await Assert.ThrowsAsync<InvalidOperationException>(() =>
              service.CreateAsync(new CreateDatasetRequest(1, "Bad", null, DatasetMode.RestQuery, "{}", null)));
      }

      [Fact]
      public async Task ListAsync_ReturnsDatasetsForTheGivenConnection()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          await service.CreateAsync(new CreateDatasetRequest(1, "Reports Table", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), null));

          var datasets = await service.ListAsync(1);

          var dataset = Assert.Single(datasets);
          Assert.Equal("Reports Table", dataset.Name);
      }

      [Fact]
      public async Task ExecuteAsync_ResolvesProviderByConnectionTypeAndReturnsItsResult()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var created = await service.CreateAsync(new CreateDatasetRequest(1, "Reports Table", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), null));

          var result = await service.ExecuteAsync(created.Id);

          Assert.Single(result.Rows);
      }

      [Fact]
      public async Task ExecuteAsync_UsesDefaultRowLimitWhenDatasetRowLimitIsNull()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var created = await service.CreateAsync(new CreateDatasetRequest(1, "Reports Table", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), RowLimit: null));

          // No direct way to assert the exact row-limit value passed into the stub provider without
          // a spy; this test instead confirms execution succeeds end-to-end with a null RowLimit,
          // which is the behavior that matters — the exact default value is asserted in Task 8's
          // manual smoke test against a real connection with more than the default's worth of rows.
          var result = await service.ExecuteAsync(created.Id);

          Assert.NotNull(result);
      }

      [Fact]
      public async Task DiscoverColumnsAsync_TableQueryMode_FiltersConnectionSchemaToSelectedColumns()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var created = await service.CreateAsync(new CreateDatasetRequest(1, "Reports Table", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), null));

          var columns = await service.DiscoverColumnsAsync(created.Id);

          Assert.Equal(2, columns.Count);
          Assert.Contains(columns, c => c.Name == "Id" && c.NativeType == "int");
          Assert.Contains(columns, c => c.Name == "Name" && c.NativeType == "nvarchar(50)");
      }
  }
  ```
  `ExecuteAsync_UsesDefaultRowLimitWhenDatasetRowLimitIsNull` is intentionally a smoke-level test rather than an exact-value assertion — `StubSqlServerProvider.ExecuteQueryAsync` ignores the `rowLimit` parameter it's handed (a stub, not a spy), so the only thing provable at the unit level is that a `null` `RowLimit` doesn't crash the call; the manual smoke test in Task 9 is where the actual default value gets proven against real data.

- [ ] Step 5: Run the tests to confirm they fail (compile error — `DatasetService` doesn't exist yet):
  ```
  dotnet test Backend.Tests
  ```
  Expected: `error CS0246`. Red.

- [ ] Step 6: Implement `backend/Services/Datasets/DatasetService.cs`:
  ```csharp
  using System.Text.Json;
  using Backend.Data;
  using Backend.Models;
  using Backend.Services.DataSources;
  using Microsoft.EntityFrameworkCore;

  namespace Backend.Services.Datasets;

  public class DatasetService : IDatasetService
  {
      private const int DefaultRowLimit = 1000;

      private readonly ReportingDbContext _context;
      private readonly ICredentialProtector _credentialProtector;
      private readonly IReadOnlyList<IDataSourceProvider> _providers;

      public DatasetService(ReportingDbContext context, ICredentialProtector credentialProtector, IEnumerable<IDataSourceProvider> providers)
      {
          _context = context;
          _credentialProtector = credentialProtector;
          _providers = providers.ToList();
      }

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
              .Where(d => d.DataSourceConnectionId == connectionId)
              .ToListAsync();

          return datasets.Select(ToSummary).ToList();
      }

      public async Task<IReadOnlyList<ColumnDescriptor>> DiscoverColumnsAsync(int datasetId)
      {
          var dataset = await GetDatasetAsync(datasetId);
          var connection = await GetConnectionAsync(dataset.DataSourceConnectionId);
          var decryptedConnection = WithDecryptedCredentials(connection);

          IReadOnlyList<ColumnDescriptor> columns = dataset.Mode switch
          {
              DatasetMode.TableQuery => await DiscoverTableQueryColumnsAsync(decryptedConnection, dataset),
              DatasetMode.RawSql => await DiscoverRawSqlColumnsAsync(decryptedConnection, dataset),
              DatasetMode.StoredProcedure => await DiscoverStoredProcedureColumnsAsync(decryptedConnection, dataset),
              DatasetMode.RestQuery => await DiscoverRestQueryColumnsAsync(decryptedConnection, dataset),
              _ => throw new InvalidOperationException($"Unsupported dataset mode: {dataset.Mode}.")
          };

          dataset.Columns = JsonSerializer.Serialize(columns);
          dataset.UpdatedAtUtc = DateTime.UtcNow;
          await _context.SaveChangesAsync();

          return columns;
      }

      public async Task<QueryResult> ExecuteAsync(int datasetId)
      {
          var dataset = await GetDatasetAsync(datasetId);
          var connection = await GetConnectionAsync(dataset.DataSourceConnectionId);
          var decryptedConnection = WithDecryptedCredentials(connection);
          var provider = ResolveProvider(connection.Type);

          var result = await provider.ExecuteQueryAsync(decryptedConnection, dataset, dataset.RowLimit ?? DefaultRowLimit, CancellationToken.None);

          dataset.Columns = JsonSerializer.Serialize(result.Columns);
          dataset.UpdatedAtUtc = DateTime.UtcNow;
          await _context.SaveChangesAsync();

          return result;
      }

      private async Task<IReadOnlyList<ColumnDescriptor>> DiscoverTableQueryColumnsAsync(DataSourceConnection connection, Dataset dataset)
      {
          var provider = ResolveProvider(connection.Type);
          var schema = await provider.DiscoverSchemaAsync(connection);
          var definition = JsonSerializer.Deserialize<TableQueryDefinition>(dataset.Definition)!;

          var table = schema.Tables.FirstOrDefault(t => t.Name == definition.Query.Table);
          if (table is null)
          {
              throw new InvalidOperationException($"Table '{definition.Query.Table}' was not found in the connection's discovered schema.");
          }

          return table.Fields
              .Where(f => definition.Query.Columns.Contains(f.Name))
              .Select(f => new ColumnDescriptor(f.Name, f.DataType))
              .ToList();
      }

      private async Task<IReadOnlyList<ColumnDescriptor>> DiscoverRawSqlColumnsAsync(DataSourceConnection connection, Dataset dataset)
      {
          var sqlServerProvider = (SqlServerProvider)ResolveProvider(connection.Type);
          var definition = JsonSerializer.Deserialize<RawSqlDefinition>(dataset.Definition)!;
          return await sqlServerProvider.DiscoverRawSqlColumnsAsync(connection, definition.SqlText, CancellationToken.None);
      }

      private async Task<IReadOnlyList<ColumnDescriptor>> DiscoverStoredProcedureColumnsAsync(DataSourceConnection connection, Dataset dataset)
      {
          var sqlServerProvider = (SqlServerProvider)ResolveProvider(connection.Type);
          var definition = JsonSerializer.Deserialize<StoredProcedureDefinition>(dataset.Definition)!;
          return await sqlServerProvider.DiscoverStoredProcedureColumnsAsync(connection, definition.RoutineName, definition.Parameters, CancellationToken.None);
      }

      private async Task<IReadOnlyList<ColumnDescriptor>> DiscoverRestQueryColumnsAsync(DataSourceConnection connection, Dataset dataset)
      {
          var restApiProvider = (RestApiProvider)ResolveProvider(connection.Type);
          var definition = JsonSerializer.Deserialize<RestQueryDefinition>(dataset.Definition)!;
          return await restApiProvider.DiscoverRestQueryColumnsAsync(connection, definition.PathSuffix, definition.QueryParams, CancellationToken.None);
      }

      private static void ValidateModeMatchesConnectionType(DatasetMode mode, DataSourceType connectionType)
      {
          var expectedType = mode == DatasetMode.RestQuery ? DataSourceType.RestApi : DataSourceType.SqlServer;
          if (connectionType != expectedType)
          {
              throw new InvalidOperationException($"Dataset mode {mode} is not valid for a connection of type {connectionType}.");
          }
      }

      private async Task<DataSourceConnection> GetConnectionAsync(int id)
      {
          var connection = await _context.DataSourceConnections.FirstOrDefaultAsync(c => c.Id == id);
          if (connection is null)
          {
              throw new InvalidOperationException($"No data source connection found with id {id}.");
          }

          return connection;
      }

      private async Task<Dataset> GetDatasetAsync(int id)
      {
          var dataset = await _context.Datasets.FirstOrDefaultAsync(d => d.Id == id);
          if (dataset is null)
          {
              throw new InvalidOperationException($"No dataset found with id {id}.");
          }

          return dataset;
      }

      private IDataSourceProvider ResolveProvider(DataSourceType type)
      {
          var provider = _providers.FirstOrDefault(p => p.SupportedType == type);
          if (provider is null)
          {
              throw new InvalidOperationException($"No provider registered for data source type {type}.");
          }

          return provider;
      }

      // Same transient-decrypted-copy pattern as DataSourceService.WithDecryptedCredentials (Milestone 2) —
      // duplicated deliberately rather than shared, so this service doesn't take a dependency on
      // DataSourceService or expose decryption outside either service's own boundary.
      private DataSourceConnection WithDecryptedCredentials(DataSourceConnection connection)
      {
          return new DataSourceConnection
          {
              Id = connection.Id,
              Name = connection.Name,
              Type = connection.Type,
              Host = connection.Host,
              DatabaseName = connection.DatabaseName,
              EncryptedCredentials = _credentialProtector.Unprotect(connection.EncryptedCredentials),
              CreatedAtUtc = connection.CreatedAtUtc
          };
      }

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
              columns,
              dataset.CreatedAtUtc,
              dataset.UpdatedAtUtc);
      }
  }
  ```
  `DiscoverRawSqlColumnsAsync`/`DiscoverStoredProcedureColumnsAsync`/`DiscoverRestQueryColumnsAsync` (the three private helpers) cast `ResolveProvider`'s result to the concrete provider type — safe by construction, since `ValidateModeMatchesConnectionType` already guarantees a `RawSql`/`StoredProcedure`/`TableQuery` dataset's connection is `SqlServer` (so `ResolveProvider` returns the `SqlServerProvider` instance) and a `RestQuery` dataset's connection is `RestApi` (so it returns `RestApiProvider`) at `CreateAsync` time, before either of these methods is ever called with mismatched data.

- [ ] Step 7: Run the tests again to confirm they pass:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass, including everything from Tasks 1-6.

- [ ] Step 8: Commit:
  ```
  git add backend/Services/Datasets/DatasetSummary.cs backend/Services/Datasets/CreateDatasetRequest.cs backend/Services/Datasets/IDatasetService.cs backend/Services/Datasets/DatasetService.cs Backend.Tests/DatasetServiceTests.cs
  git commit -m "backend: DatasetService, TDD'd against EF Core InMemory, mode/connection-type validation, per-mode discovery dispatch"
  ```

---

### Task 8: `DatasetsController` + `Program.cs` DI wiring + decimal-as-string JSON converter

**Files:**
- Create: `backend/Controllers/DatasetsController.cs`
- Create: `backend/Services/DecimalAsStringJsonConverter.cs`
- Modify: `backend/Program.cs`

**Interfaces:**
- Consumes: `IDatasetService`/`DatasetService` (Task 7), `CreateDatasetRequest`/`DatasetSummary` (Task 7), `ColumnDescriptor`/`QueryResult` (Task 2).
- Produces: routes `GET /api/datasets?connectionId={id}`, `POST /api/datasets`, `POST /api/datasets/{id}/columns`, `POST /api/datasets/{id}/execute`. Task 10 (frontend) hardcodes these routes.

Same "no new controller-level unit tests" precedent as `DataSourcesController` (Milestone 2) — coverage comes from Task 7's service tests plus Task 9's manual smoke test. `Test`/`Schema`-style error handling from Milestone 2's own post-review fix (unknown id → 404, I/O failure → 502) is replicated here for consistency, since the same class of gap (unhandled 500s) would otherwise slip through again.

- [ ] Step 1: Create `backend/Services/DecimalAsStringJsonConverter.cs` — implements the design's "exact-precision types serialize as JSON strings" rule:
  ```csharp
  using System.Text.Json;
  using System.Text.Json.Serialization;

  namespace Backend.Services;

  public class DecimalAsStringJsonConverter : JsonConverter<decimal>
  {
      public override decimal Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
      {
          return reader.TokenType == JsonTokenType.String
              ? decimal.Parse(reader.GetString()!)
              : reader.GetDecimal();
      }

      public override void Write(Utf8JsonWriter writer, decimal value, JsonSerializerOptions options)
      {
          writer.WriteStringValue(value.ToString(System.Globalization.CultureInfo.InvariantCulture));
      }
  }
  ```
  Registered as a global converter in Step 3 — this makes every `decimal` anywhere in an API response (not just inside `QueryResult.Rows`) serialize as a string, which is fine since `Report`/`DataSourceConnection`/`Dataset` have no `decimal` fields today.

- [ ] Step 2: Create `backend/Controllers/DatasetsController.cs`:
  ```csharp
  using Backend.Services.DataSources;
  using Backend.Services.Datasets;
  using Microsoft.AspNetCore.Mvc;

  namespace Backend.Controllers;

  [ApiController]
  [Route("api/datasets")]
  public class DatasetsController : ControllerBase
  {
      private readonly IDatasetService _service;

      public DatasetsController(IDatasetService service)
      {
          _service = service;
      }

      [HttpGet]
      public async Task<ActionResult<IEnumerable<DatasetSummary>>> GetAll([FromQuery] int connectionId)
      {
          return Ok(await _service.ListAsync(connectionId));
      }

      [HttpPost]
      public async Task<ActionResult<DatasetSummary>> Create(CreateDatasetRequest request)
      {
          if (string.IsNullOrWhiteSpace(request.Name))
          {
              return BadRequest("Name is required.");
          }

          try
          {
              var summary = await _service.CreateAsync(request);
              return Created($"/api/datasets/{summary.Id}", summary);
          }
          catch (InvalidOperationException ex)
          {
              return BadRequest(ex.Message);
          }
      }

      [HttpPost("{id}/columns")]
      public async Task<ActionResult<IEnumerable<ColumnDescriptor>>> DiscoverColumns(int id)
      {
          try
          {
              return Ok(await _service.DiscoverColumnsAsync(id));
          }
          catch (InvalidOperationException ex)
          {
              return NotFound(ex.Message);
          }
          catch (Exception ex)
          {
              return Problem(detail: ex.Message, statusCode: StatusCodes.Status502BadGateway);
          }
      }

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
          catch (Exception ex)
          {
              return Problem(detail: ex.Message, statusCode: StatusCodes.Status502BadGateway);
          }
      }
  }
  ```
  `Create`'s `InvalidOperationException` catch (→ 400) is new relative to `DataSourcesController`'s `Create` — this is where `DatasetService.CreateAsync`'s mode/connection-type mismatch surfaces as a client error rather than an unhandled 500, since a bad request body (not a server-side I/O failure) is the actual cause.

- [ ] Step 3: Wire up DI and the JSON converter in `backend/Program.cs` — full file after the change:
  ```csharp
  using System.Text.Json.Serialization;
  using Backend.Data;
  using Backend.Services;
  using Backend.Services.DataSources;
  using Backend.Services.Datasets;
  using Microsoft.EntityFrameworkCore;

  var builder = WebApplication.CreateBuilder(args);

  builder.Services.AddControllers().AddJsonOptions(options =>
  {
      options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
      options.JsonSerializerOptions.Converters.Add(new DecimalAsStringJsonConverter());
  });
  builder.Services.AddEndpointsApiExplorer();
  builder.Services.AddSwaggerGen();

  builder.Services.AddDbContext<ReportingDbContext>(options =>
      options.UseSqlServer(builder.Configuration.GetConnectionString("ReportingDatabase")));
  builder.Services.AddScoped<IReportRepository, EfReportRepository>();

  builder.Services.AddHttpClient();
  builder.Services.AddDataProtection();
  builder.Services.AddScoped<ICredentialProtector, CredentialProtector>();
  builder.Services.AddScoped<IDataSourceProvider, SqlServerProvider>();
  builder.Services.AddScoped<IDataSourceProvider, RestApiProvider>();
  builder.Services.AddScoped<IDataSourceService, DataSourceService>();
  builder.Services.AddScoped<IDatasetService, DatasetService>();

  builder.Services.AddCors(options =>
  {
      options.AddPolicy("Frontend", policy =>
      {
          policy.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod();
      });
  });

  var app = builder.Build();

  if (app.Environment.IsDevelopment())
  {
      app.UseSwagger();
      app.UseSwaggerUI();
      app.UseCors("Frontend");
  }

  app.UseAuthorization();
  app.MapControllers();

  app.Run();
  ```
  Only two additions relative to the post-Milestone-2 file: `DecimalAsStringJsonConverter` added to `AddJsonOptions` (alongside the existing `JsonStringEnumConverter`), and `AddScoped<IDatasetService, DatasetService>()`. Everything else — `AddDataProtection()`, the two `IDataSourceProvider` registrations, CORS, Swagger — is already there from Milestone 2 and its own review fix; don't remove or reorder any of it.

- [ ] Step 4: Build and run the full test suite:
  ```
  dotnet build backend/Backend.csproj
  dotnet test Backend.Tests
  ```
  Expected: both succeed, all tests from every prior task still pass.

- [ ] Step 5: Commit:
  ```
  git add backend/Controllers/DatasetsController.cs backend/Services/DecimalAsStringJsonConverter.cs backend/Program.cs
  git commit -m "backend: DatasetsController, decimal-as-string JSON converter, wire up DatasetService in DI"
  ```

---

### Task 9: Migration, apply to real database, manual smoke test of all four modes

**Files:**
- Create: `backend/Migrations/*_AddDatasets.cs` (and its `.Designer.cs` companion, plus an updated `ReportingDbContextModelSnapshot.cs`, all generated by the tool)

**Interfaces:**
- Consumes: `Backend.Data.ReportingDbContext` with `Datasets` (Task 1), the wired-up DI from Task 8, the connection string in `backend/appsettings.Development.json` (unchanged).
- Produces: nothing further downstream — the point of this task is the `Datasets` table existing on the real `OpenReportingPlatform` database, and a real end-to-end proof that all four Dataset modes actually work against real targets.

**Reusing an existing SqlServer connection and REST connection for the smoke test:** Milestone 2's own smoke test (its Task 7) registered a `DataSourceConnection` named "Local Reporting DB" (id likely `1`, pointing at `OpenReportingPlatform` itself via the `reporting_smoketest` SQL login) and a REST connection "JSONPlaceholder Users" (id likely `2`, pointing at `https://jsonplaceholder.typicode.com/users`) that are still registered in the real database from that milestone's own manual testing. This task's implementer should first run `GET /api/datasources` to confirm their actual current ids rather than assuming `1`/`2` — the steps below use placeholder ids `{sqlConnId}`/`{restConnId}` for exactly this reason.

- [ ] Step 1: Set the environment for this terminal session before running any `dotnet ef` command:
  ```
  $env:ASPNETCORE_ENVIRONMENT = "Development"
  ```

- [ ] Step 2: Generate the migration:
  ```
  dotnet ef migrations add AddDatasets --project backend/Backend.csproj --startup-project backend/Backend.csproj
  ```
  Expected: ends with `Done.`, creates `backend/Migrations/{timestamp}_AddDatasets.cs` and its `.Designer.cs` companion, updates `backend/Migrations/ReportingDbContextModelSnapshot.cs`, doesn't touch any earlier migration files.

- [ ] Step 3: Open the generated migration and confirm the `Up()` method creates table `Datasets` with columns matching Task 1's entity (`Id` identity PK, `DataSourceConnectionId`, `Name`, `Description` nullable, `Mode` int, `Definition`, `RowLimit` nullable int, `Columns`, `CreatedAtUtc`, `UpdatedAtUtc`) and no `InsertData` call. No edits needed — just confirm it matches.

- [ ] Step 4: Apply the migration to the real SQL Server Express instance:
  ```
  dotnet ef database update --project backend/Backend.csproj --startup-project backend/Backend.csproj
  ```
  Expected: ends with `Done.`, no errors.

- [ ] Step 5: Verify the table exists:
  ```
  sqlcmd -S "localhost\SQLEXPRESS" -E -Q "SELECT TABLE_NAME FROM OpenReportingPlatform.INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Datasets'"
  ```
  Expected: one row, `Datasets`.

- [ ] Step 6: Start the app:
  ```
  dotnet run --project backend --launch-profile http
  ```
  Confirm it logs listening on `http://localhost:5198`.

- [ ] Step 7: From a second terminal, list existing data source connections to find the real ids to use below:
  ```
  curl.exe http://localhost:5198/api/datasources
  ```
  Note the `id` of the entry with `"type":"SqlServer"` (call it `{sqlConnId}`) and the entry with `"type":"RestApi"` (call it `{restConnId}`). If neither exists (a fresh database), register them first using the same requests Milestone 2's Task 7 used — a SqlServer connection pointing at `localhost\SQLEXPRESS`/`OpenReportingPlatform` with the `reporting_smoketest` login (or equivalent SQL-auth credentials for this machine), and a RestApi connection pointing at `https://jsonplaceholder.typicode.com/users`.

- [ ] Step 8: **TableQuery mode smoke test** — create a Dataset against the `Reports` table (seeded with 3 rows since Milestone 1), then execute it:
  ```
  curl.exe -X POST http://localhost:5198/api/datasets -H "Content-Type: application/json" -d "{\"dataSourceConnectionId\":{sqlConnId},\"name\":\"All Reports\",\"description\":null,\"mode\":\"TableQuery\",\"definitionJson\":\"{\\\"query\\\":{\\\"table\\\":\\\"Reports\\\",\\\"columns\\\":[\\\"Id\\\",\\\"Name\\\",\\\"Description\\\"],\\\"filters\\\":[],\\\"sort\\\":null,\\\"top\\\":null}}\",\"rowLimit\":null}"
  ```
  Expected: `201 Created` with a `DatasetSummary` body (`id`, `dataSourceConnectionId`, `name`, `mode: \"TableQuery\"`, `rowLimit: null`, `columns: []` — empty until first discovery/execution, `createdAtUtc`, `updatedAtUtc`). Note the returned `id` (call it `{datasetId}`). If quoting the nested JSON string is fragile in your shell (Milestone 2's Task 7 hit exactly this with its own nested-JSON payloads), write the body to a scratch `.json` file and use `curl.exe -d @file.json` instead — functionally identical, just sidesteps shell-escaping fragility.

  Discover its columns:
  ```
  curl.exe -X POST http://localhost:5198/api/datasets/{datasetId}/columns
  ```
  Expected: `200 OK`, a JSON array with 3 entries (`Id`/`int`, `Name`/`nvarchar(...)`, `Description`/`nvarchar(...)`).

  Execute it:
  ```
  curl.exe -X POST http://localhost:5198/api/datasets/{datasetId}/execute
  ```
  Expected: `200 OK`, a `QueryResult` with `columns` (same 3) and `rows` — 3 rows, matching the seeded `Reports` data ("Monthly Sales", "Top Agents", "Pipeline Overview").

- [ ] Step 9: **RawSql mode smoke test** — a query joining nothing but proving the raw-SQL path and its `ORDER BY` gotcha both work:
  ```
  curl.exe -X POST http://localhost:5198/api/datasets -H "Content-Type: application/json" -d "{\"dataSourceConnectionId\":{sqlConnId},\"name\":\"Raw Reports Query\",\"description\":null,\"mode\":\"RawSql\",\"definitionJson\":\"{\\\"sqlText\\\":\\\"SELECT Id, Name FROM Reports WHERE Id > 1\\\"}\",\"rowLimit\":null}"
  ```
  Expected: `201 Created`. Note the `id` (call it `{rawSqlDatasetId}`).

  Discover its columns:
  ```
  curl.exe -X POST http://localhost:5198/api/datasets/{rawSqlDatasetId}/columns
  ```
  Expected: `200 OK`, two columns (`Id`, `Name`).

  Now confirm the documented `ORDER BY` gotcha — create a second RawSql Dataset whose SQL ends in a bare `ORDER BY`:
  ```
  curl.exe -X POST http://localhost:5198/api/datasets -H "Content-Type: application/json" -d "{\"dataSourceConnectionId\":{sqlConnId},\"name\":\"Raw Reports Query Ordered\",\"description\":null,\"mode\":\"RawSql\",\"definitionJson\":\"{\\\"sqlText\\\":\\\"SELECT Id, Name FROM Reports ORDER BY Name\\\"}\",\"rowLimit\":null}"
  ```
  Note its `id` (`{orderedDatasetId}`), then request its columns:
  ```
  curl.exe -X POST http://localhost:5198/api/datasets/{orderedDatasetId}/columns
  ```
  Expected: `502 Bad Gateway` (via `DatasetsController.DiscoverColumns`'s generic-`Exception` catch) with a `detail` mentioning the `ORDER BY` limitation — confirming `SqlServerProvider.DiscoverRawSqlColumnsAsync`'s targeted catch actually fires against a real SQL Server, not just in reasoning.

  Execute the first RawSql Dataset (not the `ORDER BY` one) to confirm real execution isn't affected by the wrapping trick (execution runs the SQL as-is, unwrapped):
  ```
  curl.exe -X POST http://localhost:5198/api/datasets/{rawSqlDatasetId}/execute
  ```
  Expected: `200 OK`, rows for `Id > 1` (2 rows: "Top Agents", "Pipeline Overview").

- [ ] Step 10: **StoredProcedure mode smoke test.** This milestone's `OpenReportingPlatform` database has no pre-existing stored procedure to call — create a minimal throwaway one first (via `sqlcmd`, Windows-integrated auth):
  ```
  sqlcmd -S "localhost\SQLEXPRESS" -E -d OpenReportingPlatform -Q "CREATE OR ALTER PROCEDURE usp_GetReportsAbove @MinId int AS BEGIN SELECT Id, Name FROM Reports WHERE Id > @MinId END"
  ```
  Then create a Dataset against it:
  ```
  curl.exe -X POST http://localhost:5198/api/datasets -H "Content-Type: application/json" -d "{\"dataSourceConnectionId\":{sqlConnId},\"name\":\"Reports Above\",\"description\":null,\"mode\":\"StoredProcedure\",\"definitionJson\":\"{\\\"routineName\\\":\\\"usp_GetReportsAbove\\\",\\\"parameters\\\":[{\\\"name\\\":\\\"MinId\\\",\\\"value\\\":\\\"1\\\"}]}\",\"rowLimit\":null}"
  ```
  Note its `id` (`{procDatasetId}`), discover columns, then execute:
  ```
  curl.exe -X POST http://localhost:5198/api/datasets/{procDatasetId}/columns
  curl.exe -X POST http://localhost:5198/api/datasets/{procDatasetId}/execute
  ```
  Expected: both `200 OK`; columns show `Id`/`Name`; execute returns the same 2 rows as Step 9's `Id > 1` raw-SQL query.

- [ ] Step 11: **RestQuery mode smoke test** — against the same `jsonplaceholder.typicode.com` connection Milestone 2 used:
  ```
  curl.exe -X POST http://localhost:5198/api/datasets -H "Content-Type: application/json" -d "{\"dataSourceConnectionId\":{restConnId},\"name\":\"All Users\",\"description\":null,\"mode\":\"RestQuery\",\"definitionJson\":\"{\\\"pathSuffix\\\":null,\\\"queryParams\\\":[]}\",\"rowLimit\":null}"
  ```
  Note its `id` (`{restDatasetId}`), discover columns, then execute:
  ```
  curl.exe -X POST http://localhost:5198/api/datasets/{restDatasetId}/columns
  curl.exe -X POST http://localhost:5198/api/datasets/{restDatasetId}/execute
  ```
  Expected: both `200 OK`; columns list the same fields Milestone 2's own REST discovery already showed (`id`/`name`/`username`/`email`/`address`/`phone`/`website`/`company`); execute returns up to 10 rows (JSONPlaceholder's `/users` endpoint has exactly 10 records) with real values for each field.

- [ ] Step 12: Confirm the Datasets list endpoint shows everything created, scoped correctly by connection:
  ```
  curl.exe "http://localhost:5198/api/datasets?connectionId={sqlConnId}"
  curl.exe "http://localhost:5198/api/datasets?connectionId={restConnId}"
  ```
  Expected: the first returns the 4 SqlServer-mode Datasets from Steps 8-10 (`All Reports`, `Raw Reports Query`, `Raw Reports Query Ordered`, `Reports Above`); the second returns the 1 REST Dataset from Step 11 (`All Users`).

- [ ] Step 13: Stop the app (`Ctrl+C`, or kill the backgrounded PID — confirm nothing left listening on port 5198 afterward).

- [ ] Step 14: Commit the migration files:
  ```
  git add backend/Migrations
  git commit -m "backend: add AddDatasets migration"
  ```

---

### Task 10: Frontend — Dataset API client + Datasets list page + navigation entry

**Files:**
- Create: `frontend/src/api/datasets.ts`
- Create: `frontend/src/pages/DatasetsPage.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/datasets?connectionId=`, `POST /api/datasets`, `POST /api/datasets/{id}/columns`, `POST /api/datasets/{id}/execute` (Tasks 8-9). `getDataSources`/`DataSourceConnectionSummary` from `frontend/src/api/datasources.ts` (Milestone 2, unchanged) — the Datasets page needs a connection picker.
- Produces: route `/datasets`, reachable from the top nav. Task 11 depends on this page existing and on `frontend/src/api/datasets.ts`'s exported types/functions. This task deliberately does NOT build the four mode-specific creation forms yet (Task 11) — it establishes the list/navigation shell and a connection-picker, with a minimal placeholder "create" action wired to the API client, so nothing here needs Task 11 to compile (unlike Milestone 2's Tasks 8/9, this split doesn't leave a red build in between).

- [ ] Step 1: Create `frontend/src/api/datasets.ts`:
  ```typescript
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
  ```
  `definitionJson` on `CreateDatasetRequest` is a plain string the frontend builds via `JSON.stringify(...)` on whichever mode-specific object it constructs — Task 11 is where that construction actually happens; this file just carries it through untouched, mirroring the backend's `CreateDatasetRequest.DefinitionJson` shape exactly.

- [ ] Step 2: Create `frontend/src/pages/DatasetsPage.tsx` — a connection picker plus a list, with `createDataset` wired to a minimal TableQuery-only inline form for now (Task 11 replaces this form with the full mode-aware editor; the list/picker/table structure built here doesn't change):
  ```tsx
  import { useEffect, useState } from "react";
  import {
    Alert,
    Box,
    Button,
    Container,
    MenuItem,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
  } from "@mui/material";
  import axios from "axios";
  import { getDataSources, type DataSourceConnectionSummary } from "../api/datasources";
  import { createDataset, getDatasets, type DatasetSummary } from "../api/datasets";

  function DatasetsPage() {
    const [connections, setConnections] = useState<DataSourceConnectionSummary[]>([]);
    const [selectedConnectionId, setSelectedConnectionId] = useState<number | "">("");
    const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
    const [name, setName] = useState("");
    const [tableName, setTableName] = useState("");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      getDataSources()
        .then(setConnections)
        .catch(() => setError("Could not load data source connections — is the backend running on :5198?"));
    }, []);

    async function refreshDatasets(connectionId: number) {
      setDatasets(await getDatasets(connectionId));
    }

    useEffect(() => {
      if (typeof selectedConnectionId === "number") {
        refreshDatasets(selectedConnectionId).catch(() => setError("Could not load datasets for this connection."));
      } else {
        setDatasets([]);
      }
    }, [selectedConnectionId]);

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      if (typeof selectedConnectionId !== "number") {
        return;
      }

      try {
        const definitionJson = JSON.stringify({
          query: { table: tableName, columns: [], filters: [], sort: null, top: null },
        });

        await createDataset({
          dataSourceConnectionId: selectedConnectionId,
          name,
          description: null,
          mode: "TableQuery",
          definitionJson,
          rowLimit: null,
        });

        setName("");
        setTableName("");
        await refreshDatasets(selectedConnectionId);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 400) {
          setError(typeof err.response.data === "string" ? err.response.data : "Invalid input.");
        } else {
          setError("Something went wrong talking to the backend.");
        }
      }
    }

    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>Datasets</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          select
          label="Connection"
          size="small"
          value={selectedConnectionId}
          onChange={(e) => setSelectedConnectionId(e.target.value === "" ? "" : Number(e.target.value))}
          sx={{ minWidth: 240, mb: 3 }}
        >
          {connections.map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name} ({c.type})</MenuItem>
          ))}
        </TextField>

        {typeof selectedConnectionId === "number" && (
          <>
            <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", gap: 2, mb: 3 }}>
              <TextField label="Dataset Name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
              <TextField label="Table Name" size="small" value={tableName} onChange={(e) => setTableName(e.target.value)} />
              <Button type="submit" variant="contained">Add (Table Query)</Button>
            </Box>
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>Name</TableCell><TableCell>Mode</TableCell><TableCell>Row Limit</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {datasets.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{d.name}</TableCell>
                      <TableCell>{d.mode}</TableCell>
                      <TableCell>{d.rowLimit ?? "default"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}
      </Container>
    );
  }

  export default DatasetsPage;
  ```

- [ ] Step 3: Add the `/datasets` route and a nav tab in `frontend/src/App.tsx`. Modify the existing router/nav shell (from Milestone 2) — add an import and a third route/tab, don't rewrite the rest of the file:
  ```tsx
  import DatasetsPage from "./pages/DatasetsPage";
  ```
  In `TopNav`, add a third `<Tab>` after the existing two:
  ```tsx
  <Tab label="Datasets" value="/datasets" component={Link} to="/datasets" />
  ```
  Update `currentTab`'s derivation to include the new path:
  ```tsx
  const currentTab = location.pathname.startsWith("/datasources")
    ? "/datasources"
    : location.pathname.startsWith("/datasets")
      ? "/datasets"
      : "/reports";
  ```
  Add the route to the `createBrowserRouter` array:
  ```tsx
  { path: "/datasets", element: <Layout><DatasetsPage /></Layout> },
  ```

- [ ] Step 4: From `frontend/`, run:
  ```
  npm run build
  ```
  Expected: clean compile.

- [ ] Step 5: Commit:
  ```
  git add -A
  git commit -m "frontend: Datasets page shell — connection picker, list, minimal table-query create form, nav tab"
  ```

---

### Task 11: Frontend — full `TableQuery` mode editor + shared results-preview grid

**Files:**
- Create: `frontend/src/components/QueryResultGrid.tsx`
- Modify: `frontend/src/pages/DatasetsPage.tsx`

**Interfaces:**
- Consumes: `discoverDatasetColumns`/`executeDataset`/`QueryResult` (Task 10), `getDataSources`'s connection schema — reuses the EXISTING `GET /api/datasources/{id}/schema` endpoint from Milestone 2 (not a new one) to populate the table/column picker.
- Produces: `QueryResultGrid` component, reused unchanged by Tasks 12-13 for `RawSql`/`StoredProcedure`/`RestQuery` modes' own preview grids — built once here since every mode's "Run Preview" action renders the same `QueryResult` shape.

- [ ] Step 1: Create `frontend/src/components/QueryResultGrid.tsx` — a small, mode-agnostic results table:
  ```tsx
  import { Alert, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
  import type { QueryResult } from "../api/datasets";

  function QueryResultGrid({ result }: { result: QueryResult | null }) {
    if (!result) {
      return null;
    }

    if (result.rows.length === 0) {
      return <Alert severity="info">Query ran successfully but returned no rows.</Alert>;
    }

    return (
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              {result.columns.map((c) => (
                <TableCell key={c.name}>{c.name} <em>({c.nativeType})</em></TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {result.rows.map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {row.map((value, colIndex) => (
                  <TableCell key={colIndex}>{value === null ? <em>null</em> : String(value)}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }

  export default QueryResultGrid;
  ```

- [ ] Step 2: Replace `DatasetsPage.tsx`'s minimal Table Query form (from Task 10) with the full query-builder editor. Full file after the change:
  ```tsx
  import { useEffect, useState } from "react";
  import {
    Alert,
    Box,
    Button,
    Checkbox,
    Container,
    FormControlLabel,
    MenuItem,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
  } from "@mui/material";
  import axios from "axios";
  import { getDataSources, getDataSourceSchema, type DataSourceConnectionSummary } from "../api/datasources";
  import {
    createDataset,
    discoverDatasetColumns,
    executeDataset,
    getDatasets,
    type DatasetSummary,
    type QueryResult,
  } from "../api/datasets";
  import QueryResultGrid from "../components/QueryResultGrid";

  function DatasetsPage() {
    const [connections, setConnections] = useState<DataSourceConnectionSummary[]>([]);
    const [selectedConnectionId, setSelectedConnectionId] = useState<number | "">("");
    const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
    const [tables, setTables] = useState<{ name: string; fields: { name: string }[] }[]>([]);

    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [selectedTable, setSelectedTable] = useState("");
    const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
    const [rowLimit, setRowLimit] = useState("");

    const [error, setError] = useState<string | null>(null);
    const [previewResult, setPreviewResult] = useState<QueryResult | null>(null);

    useEffect(() => {
      getDataSources()
        .then(setConnections)
        .catch(() => setError("Could not load data source connections — is the backend running on :5198?"));
    }, []);

    async function refreshDatasets(connectionId: number) {
      setDatasets(await getDatasets(connectionId));
    }

    useEffect(() => {
      if (typeof selectedConnectionId !== "number") {
        setDatasets([]);
        setTables([]);
        return;
      }

      refreshDatasets(selectedConnectionId).catch(() => setError("Could not load datasets for this connection."));
      getDataSourceSchema(selectedConnectionId)
        .then((schema) => setTables(schema.tables))
        .catch(() => setError("Could not load the connection's schema."));
    }, [selectedConnectionId]);

    function toggleColumn(fieldName: string) {
      setSelectedColumns((prev) =>
        prev.includes(fieldName) ? prev.filter((c) => c !== fieldName) : [...prev, fieldName]
      );
    }

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      setPreviewResult(null);
      if (typeof selectedConnectionId !== "number") {
        return;
      }

      try {
        const definitionJson = JSON.stringify({
          query: {
            table: selectedTable,
            columns: selectedColumns,
            filters: [],
            sort: null,
            top: null,
          },
        });

        const created = await createDataset({
          dataSourceConnectionId: selectedConnectionId,
          name,
          description: description === "" ? null : description,
          mode: "TableQuery",
          definitionJson,
          rowLimit: rowLimit === "" ? null : Number(rowLimit),
        });

        await discoverDatasetColumns(created.id);
        setName("");
        setDescription("");
        setSelectedTable("");
        setSelectedColumns([]);
        setRowLimit("");
        await refreshDatasets(selectedConnectionId);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 400) {
          setError(typeof err.response.data === "string" ? err.response.data : "Invalid input.");
        } else {
          setError("Something went wrong talking to the backend.");
        }
      }
    }

    async function handlePreview(datasetId: number) {
      setError(null);
      try {
        setPreviewResult(await executeDataset(datasetId));
      } catch {
        setError("Could not run this dataset.");
      }
    }

    const selectedTableFields = tables.find((t) => t.name === selectedTable)?.fields ?? [];

    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>Datasets</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          select
          label="Connection"
          size="small"
          value={selectedConnectionId}
          onChange={(e) => setSelectedConnectionId(e.target.value === "" ? "" : Number(e.target.value))}
          sx={{ minWidth: 240, mb: 3 }}
        >
          {connections.map((c) => (
            <MenuItem key={c.id} value={c.id}>{c.name} ({c.type})</MenuItem>
          ))}
        </TextField>

        {typeof selectedConnectionId === "number" && (
          <>
            <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }}>
              <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
                <TextField label="Dataset Name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
                <TextField label="Description (optional)" size="small" value={description} onChange={(e) => setDescription(e.target.value)} sx={{ flexGrow: 1 }} />
                <TextField
                  select
                  label="Table"
                  size="small"
                  value={selectedTable}
                  onChange={(e) => { setSelectedTable(e.target.value); setSelectedColumns([]); }}
                  sx={{ minWidth: 180 }}
                >
                  {tables.map((t) => (
                    <MenuItem key={t.name} value={t.name}>{t.name}</MenuItem>
                  ))}
                </TextField>
                <TextField label="Row Limit" size="small" value={rowLimit} onChange={(e) => setRowLimit(e.target.value)} />
              </Box>
              {selectedTableFields.length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
                  {selectedTableFields.map((f) => (
                    <FormControlLabel
                      key={f.name}
                      control={<Checkbox checked={selectedColumns.includes(f.name)} onChange={() => toggleColumn(f.name)} />}
                      label={f.name}
                    />
                  ))}
                </Box>
              )}
              <Button type="submit" variant="contained" disabled={!selectedTable || selectedColumns.length === 0}>
                Add Dataset
              </Button>
            </Box>

            <TableContainer component={Paper} sx={{ mb: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow><TableCell>Name</TableCell><TableCell>Mode</TableCell><TableCell>Row Limit</TableCell><TableCell>Preview</TableCell></TableRow>
                </TableHead>
                <TableBody>
                  {datasets.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{d.name}</TableCell>
                      <TableCell>{d.mode}</TableCell>
                      <TableCell>{d.rowLimit ?? "default"}</TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined" onClick={() => handlePreview(d.id)}>Run</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <QueryResultGrid result={previewResult} />
          </>
        )}
      </Container>
    );
  }

  export default DatasetsPage;
  ```
  This references `getDataSourceSchema` from `frontend/src/api/datasources.ts` — that file, as shipped in Milestone 2, does NOT export a function by this name (Milestone 2's frontend never needed to call `GET /api/datasources/{id}/schema`, only `/test`). Add it now:
  ```typescript
  export interface FieldDescriptor {
    name: string;
    dataType: string;
  }

  export interface TableDescriptor {
    name: string;
    fields: FieldDescriptor[];
  }

  export interface SchemaDescriptor {
    tables: TableDescriptor[];
  }

  export async function getDataSourceSchema(id: number): Promise<SchemaDescriptor> {
    const res = await api.get<SchemaDescriptor>(`/datasources/${id}/schema`);
    return res.data;
  }
  ```
  Add this to `frontend/src/api/datasources.ts` alongside its existing exports (same file, same `api` axios instance already defined there — don't create a second axios instance).

- [ ] Step 3: From `frontend/`, run:
  ```
  npm run build
  ```
  Expected: clean compile.

- [ ] Step 4: Commit:
  ```
  git add -A
  git commit -m "frontend: full TableQuery mode editor (table/column picker), shared QueryResultGrid, Run Preview action"
  ```

---

### Task 12: Frontend — `RawSql` and `StoredProcedure` mode editors

**Files:**
- Modify: `frontend/src/pages/DatasetsPage.tsx`

**Interfaces:**
- Consumes: everything from Task 11 (unchanged) plus the same create/discover/execute API functions, now used for two more modes.
- Produces: a mode selector (visible only for SqlServer connections) switching between `Table Query` / `Raw SQL` / `Stored Procedure` forms; `RestQuery`'s form comes in Task 13.

- [ ] Step 1: Add a `mode` state and a mode selector, plus the two new forms, to `DatasetsPage.tsx`. This step layers on top of Task 11's file — add the following state near the existing `name`/`selectedTable`/etc. state:
  ```tsx
  const [mode, setMode] = useState<"TableQuery" | "RawSql" | "StoredProcedure">("TableQuery");
  const [sqlText, setSqlText] = useState("");
  const [routineName, setRoutineName] = useState("");
  const [procParams, setProcParams] = useState<{ name: string; value: string }[]>([{ name: "", value: "" }]);
  const [columnPreviewError, setColumnPreviewError] = useState<string | null>(null);
  ```

  Add a mode dropdown right after the Connection selector (only rendered when a connection is selected):
  ```tsx
  <TextField
    select
    label="Mode"
    size="small"
    value={mode}
    onChange={(e) => setMode(e.target.value as typeof mode)}
    sx={{ minWidth: 180, mb: 3 }}
  >
    <MenuItem value="TableQuery">Table Query</MenuItem>
    <MenuItem value="RawSql">Raw SQL</MenuItem>
    <MenuItem value="StoredProcedure">Stored Procedure</MenuItem>
  </TextField>
  ```

  Replace the single `handleSubmit` from Task 11 with a mode-dispatching version:
  ```tsx
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPreviewResult(null);
    if (typeof selectedConnectionId !== "number") {
      return;
    }

    let definitionJson: string;
    if (mode === "TableQuery") {
      definitionJson = JSON.stringify({
        query: { table: selectedTable, columns: selectedColumns, filters: [], sort: null, top: null },
      });
    } else if (mode === "RawSql") {
      definitionJson = JSON.stringify({ sqlText });
    } else {
      definitionJson = JSON.stringify({
        routineName,
        parameters: procParams.filter((p) => p.name !== ""),
      });
    }

    try {
      const created = await createDataset({
        dataSourceConnectionId: selectedConnectionId,
        name,
        description: description === "" ? null : description,
        mode,
        definitionJson,
        rowLimit: rowLimit === "" ? null : Number(rowLimit),
      });

      setColumnPreviewError(null);
      try {
        await discoverDatasetColumns(created.id);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 502) {
          setColumnPreviewError(
            typeof err.response.data?.detail === "string" ? err.response.data.detail : "Could not preview columns for this query."
          );
        }
      }

      setName("");
      setDescription("");
      setSelectedTable("");
      setSelectedColumns([]);
      setSqlText("");
      setRoutineName("");
      setProcParams([{ name: "", value: "" }]);
      setRowLimit("");
      await refreshDatasets(selectedConnectionId);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError(typeof err.response.data === "string" ? err.response.data : "Invalid input.");
      } else {
        setError("Something went wrong talking to the backend.");
      }
    }
  }
  ```
  `columnPreviewError` is surfaced separately from `error` — a column-discovery failure (e.g. the `ORDER BY` gotcha) shouldn't look like the Dataset itself failed to save, since it did save; only its column preview failed. Render it as its own `Alert` right after the form, alongside the existing `error` alert:
  ```tsx
  {columnPreviewError && <Alert severity="warning" sx={{ mb: 2 }}>{columnPreviewError}</Alert>}
  ```

  Replace the Task 11 form body's conditional rendering — wrap the existing Table Query fields (Table dropdown + column checkboxes) in `{mode === "TableQuery" && (...)}`, and add two new conditional blocks alongside it:
  ```tsx
  {mode === "RawSql" && (
    <TextField
      label="SQL"
      multiline
      minRows={3}
      fullWidth
      value={sqlText}
      onChange={(e) => setSqlText(e.target.value)}
      sx={{ mb: 2 }}
    />
  )}

  {mode === "StoredProcedure" && (
    <Box sx={{ mb: 2 }}>
      <TextField
        label="Procedure or Function Name"
        size="small"
        value={routineName}
        onChange={(e) => setRoutineName(e.target.value)}
        sx={{ mb: 1, display: "block" }}
      />
      {procParams.map((p, i) => (
        <Box key={i} sx={{ display: "flex", gap: 1, mb: 1 }}>
          <TextField
            label="Parameter Name"
            size="small"
            value={p.name}
            onChange={(e) => {
              const next = [...procParams];
              next[i] = { ...next[i], name: e.target.value };
              setProcParams(next);
            }}
          />
          <TextField
            label="Value"
            size="small"
            value={p.value}
            onChange={(e) => {
              const next = [...procParams];
              next[i] = { ...next[i], value: e.target.value };
              setProcParams(next);
            }}
          />
        </Box>
      ))}
      <Button size="small" onClick={() => setProcParams([...procParams, { name: "", value: "" }])}>
        Add Parameter
      </Button>
    </Box>
  )}
  ```
  The submit button's `disabled` condition (Task 11: `!selectedTable || selectedColumns.length === 0`) needs to become mode-aware — replace it with:
  ```tsx
  disabled={
    (mode === "TableQuery" && (!selectedTable || selectedColumns.length === 0)) ||
    (mode === "RawSql" && sqlText.trim() === "") ||
    (mode === "StoredProcedure" && routineName.trim() === "")
  }
  ```

- [ ] Step 2: From `frontend/`, run:
  ```
  npm run build
  ```
  Expected: clean compile.

- [ ] Step 3: Commit:
  ```
  git add -A
  git commit -m "frontend: RawSql and StoredProcedure mode editors, mode-aware submit validation, column-preview error surfacing"
  ```

---

### Task 13: Frontend — `RestQuery` mode editor + final end-to-end manual check

**Files:**
- Modify: `frontend/src/pages/DatasetsPage.tsx`

**Interfaces:**
- Consumes: everything from Tasks 10-12.
- Produces: the finished Milestone 3 frontend. Nothing downstream.

- [ ] Step 1: Extend the mode type and add the `RestQuery` form. The mode dropdown (Task 12) should only offer `TableQuery`/`RawSql`/`StoredProcedure` when the selected connection's `type` is `SqlServer`, and automatically use `RestQuery` (no dropdown shown) when it's `RestApi` — add this derived value near the other state:
  ```tsx
  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);
  const isRestConnection = selectedConnection?.type === "RestApi";
  ```
  Update the `mode` type to include `"RestQuery"`:
  ```tsx
  const [mode, setMode] = useState<"TableQuery" | "RawSql" | "StoredProcedure" | "RestQuery">("TableQuery");
  ```
  Add a `useEffect` that snaps `mode` to `"RestQuery"` automatically when a REST connection is selected, and back to `"TableQuery"` for a SqlServer connection:
  ```tsx
  useEffect(() => {
    setMode(isRestConnection ? "RestQuery" : "TableQuery");
  }, [selectedConnectionId]);
  ```
  Wrap the existing Mode dropdown (Task 12) so it only renders for SqlServer connections:
  ```tsx
  {!isRestConnection && (
    <TextField select label="Mode" /* ...unchanged... */ >
      {/* ...unchanged MenuItems... */}
    </TextField>
  )}
  ```

  Add REST-specific state:
  ```tsx
  const [pathSuffix, setPathSuffix] = useState("");
  const [queryParams, setQueryParams] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  ```

  Replace Task 12's `definitionJson`-building `if`/`else if`/`else` chain entirely with this four-branch version, covering all four modes explicitly (no implicit final `else` — every mode is named):
  ```tsx
  let definitionJson: string;
  if (mode === "TableQuery") {
    definitionJson = JSON.stringify({
      query: { table: selectedTable, columns: selectedColumns, filters: [], sort: null, top: null },
    });
  } else if (mode === "RawSql") {
    definitionJson = JSON.stringify({ sqlText });
  } else if (mode === "StoredProcedure") {
    definitionJson = JSON.stringify({
      routineName,
      parameters: procParams.filter((p) => p.name !== ""),
    });
  } else {
    definitionJson = JSON.stringify({
      pathSuffix: pathSuffix === "" ? null : pathSuffix,
      queryParams: queryParams.filter((p) => p.key !== ""),
    });
  }
  ```
  This is a straight textual replacement of the `let definitionJson: string; if (mode === "TableQuery") { ... } else if (mode === "RawSql") { ... } else { ... }` block Task 12 wrote — same variable, same position in `handleSubmit`, just with the `RestQuery` case now named explicitly instead of being the fallback `else`.

  Add the REST form block, alongside the `TableQuery`/`RawSql`/`StoredProcedure` conditional blocks from Tasks 11-12:
  ```tsx
  {mode === "RestQuery" && (
    <Box sx={{ mb: 2 }}>
      <TextField
        label="Path Suffix (optional)"
        size="small"
        placeholder="/users"
        value={pathSuffix}
        onChange={(e) => setPathSuffix(e.target.value)}
        sx={{ mb: 1, display: "block" }}
      />
      {queryParams.map((p, i) => (
        <Box key={i} sx={{ display: "flex", gap: 1, mb: 1 }}>
          <TextField
            label="Param Key"
            size="small"
            value={p.key}
            onChange={(e) => {
              const next = [...queryParams];
              next[i] = { ...next[i], key: e.target.value };
              setQueryParams(next);
            }}
          />
          <TextField
            label="Param Value"
            size="small"
            value={p.value}
            onChange={(e) => {
              const next = [...queryParams];
              next[i] = { ...next[i], value: e.target.value };
              setQueryParams(next);
            }}
          />
        </Box>
      ))}
      <Button size="small" onClick={() => setQueryParams([...queryParams, { key: "", value: "" }])}>
        Add Query Param
      </Button>
    </Box>
  )}
  ```
  Update the submit button's `disabled` condition (Task 12) to add a `RestQuery` case — a REST Dataset only needs a `name`, so it's valid with no path/params at all (an empty path suffix means "just the bare connection Host", a legitimate choice):
  ```tsx
  disabled={
    (mode === "TableQuery" && (!selectedTable || selectedColumns.length === 0)) ||
    (mode === "RawSql" && sqlText.trim() === "") ||
    (mode === "StoredProcedure" && routineName.trim() === "") ||
    name.trim() === ""
  }
  ```
  (Also added a `name.trim() === ""` check here that was implicitly missing before — every mode requires a non-empty Dataset name, matching the backend's `Create` validation.)

- [ ] Step 2: From `frontend/`, run:
  ```
  npm run build
  ```
  Expected: clean compile.

- [ ] Step 3: End-to-end check, two terminals from the repo root:
  - `dotnet run --project backend --launch-profile http`
  - `cd frontend && npm run dev`

  Open `http://localhost:5173/datasets` and verify (if a browser is available in this environment — if not, honestly disclose that in the report rather than fabricating a check, same as Milestone 2's Tasks 8-9):
  - Selecting the SqlServer connection shows the Mode dropdown with all three SQL modes; selecting the REST connection hides the dropdown and shows the REST form directly.
  - Creating a Table Query dataset against `Reports` shows it in the list; clicking "Run" shows real rows in the grid below.
  - Creating a Raw SQL dataset with a trailing `ORDER BY` shows the warning alert (the 502/`ORDER BY` message) without blocking the Dataset from being created.
  - Creating a Stored Procedure dataset (reuse `usp_GetReportsAbove` from Task 9's manual smoke test) with a parameter row filled in works end to end.
  - Creating a REST dataset against the JSONPlaceholder connection with no path suffix and no params, then running it, shows the 10 users' rows.
  - Reloading the page preserves every created Dataset (real database, not in-memory).

- [ ] Step 4: Commit:
  ```
  git add -A
  git commit -m "frontend: RestQuery mode editor, connection-type-driven mode selection, final Datasets page for all four modes"
  ```

---

## Self-review — design coverage and signature consistency

- Every `Dataset.Mode` value (`TableQuery`, `RawSql`, `StoredProcedure`, `RestQuery`) has: a `Definition` DTO (Task 2), provider-side execution logic (Tasks 3-5 for SqlServer's three modes, Task 3 for REST), provider-side discovery logic (Tasks 4-6), a `DatasetService` dispatch branch for both execution and discovery (Task 7), and a frontend creation form (Tasks 11-13). No mode is missing a leg.
- `IDataSourceProvider.ExecuteQueryAsync`'s signature — `(DataSourceConnection connection, Dataset dataset, int rowLimit, CancellationToken cancellationToken) -> Task<QueryResult>` — declared once in Task 3, implemented identically by `SqlServerProvider` and `RestApiProvider`, called identically by `DatasetService.ExecuteAsync` (Task 7). No drift.
- `ColumnDescriptor`/`QueryResult` — defined once in Task 2, consumed unchanged through every provider method, `DatasetService`, `DatasetsController`, and mirrored field-for-field in the frontend's `datasets.ts` TypeScript interfaces (Task 10).
- Row-limit enforcement — every mode's execution path caps rows by stopping a read/collect loop at `rowLimit` (`ReadQueryResultAsync` for all three SqlServer modes via Task 3's shared helper; `ParseQueryResult`'s `.Take(rowLimit)` for REST) — no mode relies on rewriting SQL text to inject a row cap, consistent with the design's explicit rejection of that approach for `RawSql`/`StoredProcedure`.
- Credential handling — `DatasetService` (Task 7) is the only class that calls `ICredentialProtector.Unprotect`, via its own `WithDecryptedCredentials`, exactly mirroring (and deliberately duplicating rather than sharing) `DataSourceService`'s Milestone 2 pattern. Both `SqlServerProvider` and `RestApiProvider` continue to never reference `ICredentialProtector` directly — they receive already-decrypted connections, same rule as Milestone 2.
- Discovery-vs-execution distinction — `TableQuery` discovery never calls a provider (filters cached schema, per the design's "no new query needed"); `RawSql`/`StoredProcedure`/`RestQuery` discovery each call a dedicated provider method (Tasks 4-6) that is NOT part of the shared `IDataSourceProvider` interface, deliberately, since these are mode-specific capabilities only meaningful when `DatasetService` has already validated the mode/connection-type pairing at creation time.
- Controller error handling — `DatasetsController` (Task 8) replicates Milestone 2's own post-review fix (unknown id → 404, I/O failure → 502) from the start, rather than needing the same fix applied again after a final review catches it a second time.
- Frontend/backend enum string alignment — `DatasetMode`'s C# enum values (`TableQuery`/`RawSql`/`StoredProcedure`/`RestQuery`) serialize as those exact strings via the already-registered `JsonStringEnumConverter` (Milestone 2's Program.cs fix, unchanged here), matching the frontend's `DatasetMode` TypeScript union (Task 10) exactly.

That closes Milestone 3. The Report Designer itself — canvas, widgets, `WidgetBinding.DatasetId` actually binding a chart to one of these Datasets, and the `NativeType -> CoarseKind` classification function the design doc defers — is still out of scope, per that same design doc's own final line: still the next one.
