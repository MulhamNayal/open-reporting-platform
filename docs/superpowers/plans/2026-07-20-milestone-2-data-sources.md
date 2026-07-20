# Milestone 2 Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to run this task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a pluggable data-source abstraction — register a connection (SQL Server or REST API), test it, discover its schema. Register → test → discover. Not running a real query against a discovered schema yet — that's a later Dataset/query-pipeline milestone.

**Architecture:** `DataSourcesController → IDataSourceService → IDataSourceProvider (SqlServerProvider | RestApiProvider) → ReportingDbContext`. Same database Milestone 1 already stood up — `DataSourceConnection` is just a new `DbSet` alongside `Reports`, one more migration. Frontend gets React Router for the first time — two pages, `/reports` (existing page, moved) and `/datasources` (new), behind a shared `AppBar` nav.

**Tech Stack:** .NET 8, EF Core 8 (SqlServer provider for real usage, InMemory provider for tests), `IDataProtector` (built into `Microsoft.AspNetCore.App`, no new package), `IHttpClientFactory` (built in), xUnit, hand-rolled fake `HttpMessageHandler` for `RestApiProvider` tests, React + Vite + TypeScript, MUI, axios, react-router-dom (new).

See `docs/superpowers/specs/2026-07-20-milestone-2-data-sources-design.md` for the full approved design — this plan is the task breakdown for building it.

## Global Constraints

- Package versions pinned to `8.0.11` for every EF Core package (`SqlServer`, `Design`, `InMemory`) — same reasoning as Milestone 1, keeps them in lockstep with the `dotnet-ef` global tool (already installed at `8.0.11`, confirm with `dotnet ef --version` if paranoid, no reinstall needed). If `8.0.11` is gone from NuGet by the time this runs, use the newest `8.0.x` patch everywhere, don't mix patch versions.
- No new backend NuGet packages beyond the EF Core ones already in the project. `IDataProtector` ships in `Microsoft.AspNetCore.App` (the shared framework `Microsoft.NET.Sdk.Web` already references) — no package to add. `Microsoft.Data.SqlClient` comes transitively via `Microsoft.EntityFrameworkCore.SqlServer`, already there. `HttpClient`/`IHttpClientFactory` are framework-provided. Test project needs no new package either — `RestApiProvider` is tested with a hand-written fake `HttpMessageHandler`, not a mocking library.
- Namespace/casing stays `Backend.*` (capital B) everywhere — CI builds on `ubuntu-latest`, case-sensitive filesystem, same rule as the last two milestones.
- Multiple .NET SDKs installed, no `global.json` pin. This plan adds files to existing projects only — no `dotnet new` anywhere, so the main risk (a scaffolded `.csproj` landing on net9/net10) doesn't apply here. Flagging it anyway per the environment notes: if any step below is later changed to scaffold a new project, check its `<TargetFramework>` immediately.
- `dotnet ef` commands need `$env:ASPNETCORE_ENVIRONMENT = "Development"` set in the current terminal session first — it doesn't go through `launchSettings.json` the way `dotnet run` does. Set it again if you open a new terminal partway through.
- Same SQL Server Express instance as Milestone 1 (`localhost\SQLEXPRESS`, Windows Integrated auth), same `OpenReportingPlatform` database — this migration adds one table (`DataSourceConnections`) to it, doesn't touch `Reports`.
- Not doing this milestone (see design doc "Not doing" section — repeating here so it's visible while executing tasks, not just in the design doc): no host-allowlist concept, no data source types beyond `SqlServer`/`RestApi`, no endpoint that actually runs a query against a discovered schema and returns rows. Resist scope creep toward any of these while implementing.
- All commands run from the repo root `C:\Users\Mulham\source\repos\open-reporting-platform` unless a step says otherwise. Shell is PowerShell.
- Frontend package versions in this repo run ahead of what you might expect from your own knowledge (e.g. `react` is pinned at `^19.2.7`, `@mui/material` at `^9.2.0` in `frontend/package.json` as of Milestone 1) — when Task 8 runs `npm install react-router-dom`, let npm resolve whatever the current major is compatible with those; don't hand-pick an old pinned version from memory. The router API used throughout this plan (`createBrowserRouter` + `<RouterProvider>`) is the v6+/v7 shape and is stable across that range, so this plan works regardless of exactly which current minor npm resolves to.

---

### Task 1: `DataSourceConnection` entity + `DbSet` on `ReportingDbContext`

**Files:**
- Create: `backend/Models/DataSourceType.cs`
- Create: `backend/Models/DataSourceConnection.cs`
- Modify: `backend/Data/ReportingDbContext.cs`

**Interfaces:**
- Consumes: nothing new — `ReportingDbContext` already exists from Milestone 1 (constructor `ReportingDbContext(DbContextOptions<ReportingDbContext> options)`, `DbSet<Report> Reports`).
- Produces: `Backend.Models.DataSourceType` (enum: `SqlServer`, `RestApi`), `Backend.Models.DataSourceConnection` (class, not a record — see note below), `DbSet<DataSourceConnection> DataSourceConnections` on `ReportingDbContext`. Every later task (provider interface, both providers, the service, the controller, the migration) depends on this exact shape — property names and types don't move once Task 2 starts consuming them.

Note on why `DataSourceConnection` is a class and not a positional record like `Report`: `Report` has 3 constructor args and every field is always known up front. `DataSourceConnection` has an optional field (`DatabaseName`) and a server-generated one (`CreatedAtUtc`), and Task 5 (the service) builds it up in a couple of steps (encrypt credentials, then set `CreatedAtUtc`) rather than in one constructor call. A mutable class with an empty constructor + `init`/settable properties fits that better and is still perfectly fine for EF Core to map. This is a judgment call, not dictated by the design doc — flagging it here rather than silently deviating.

- [ ] Step 1: Create `backend/Models/DataSourceType.cs`:
  ```csharp
  namespace Backend.Models;

  public enum DataSourceType
  {
      SqlServer,
      RestApi
  }
  ```

- [ ] Step 2: Create `backend/Models/DataSourceConnection.cs`:
  ```csharp
  namespace Backend.Models;

  public class DataSourceConnection
  {
      public int Id { get; set; }

      public string Name { get; set; } = "";

      public DataSourceType Type { get; set; }

      public string Host { get; set; } = "";

      public string? DatabaseName { get; set; }

      public string EncryptedCredentials { get; set; } = "";

      public DateTime CreatedAtUtc { get; set; }
  }
  ```

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
  No `HasData` seed for `DataSourceConnection` — unlike `Reports`, there's nothing sensible to seed (every real row needs an actual `Host` and encrypted credentials). By EF Core convention, `Type` (an enum) maps to an `int` column and `DatabaseName` (a nullable `string`) maps to a nullable `nvarchar` column — no extra Fluent API configuration needed for either.

- [ ] Step 4: Build to confirm it compiles (nothing consumes the new `DbSet` yet):
  ```
  dotnet build backend/Backend.csproj
  ```
  Expected: `Build succeeded.` with 0 errors.

- [ ] Step 5: Commit:
  ```
  git add backend/Models/DataSourceType.cs backend/Models/DataSourceConnection.cs backend/Data/ReportingDbContext.cs
  git commit -m "backend: add DataSourceConnection entity and DbSet"
  ```

---

### Task 2: `IDataSourceProvider` contract + `CredentialProtector` (TDD the protector round-trip)

**Files:**
- Create: `backend/Services/DataSources/ConnectionTestResult.cs`
- Create: `backend/Services/DataSources/SchemaDescriptor.cs`
- Create: `backend/Services/DataSources/IDataSourceProvider.cs`
- Create: `backend/Services/DataSources/ICredentialProtector.cs`
- Create: `backend/Services/DataSources/CredentialProtector.cs`
- Create: `Backend.Tests/CredentialProtectorTests.cs`

**Interfaces:**
- Consumes: `Backend.Models.DataSourceConnection` (Task 1) — referenced by `IDataSourceProvider` method signatures.
- Produces:
  - `Backend.Services.DataSources.IDataSourceProvider` — `Task<ConnectionTestResult> TestConnectionAsync(DataSourceConnection connection)`, `Task<SchemaDescriptor> DiscoverSchemaAsync(DataSourceConnection connection)`. Tasks 3 and 4 (`SqlServerProvider`, `RestApiProvider`) both implement this exact interface — signatures don't change after this task.
  - `public record ConnectionTestResult(bool Success, string? ErrorMessage);`
  - `public record SchemaDescriptor(IReadOnlyList<TableDescriptor> Tables);`
  - `public record TableDescriptor(string Name, IReadOnlyList<FieldDescriptor> Fields);`
  - `public record FieldDescriptor(string Name, string DataType);`
  - `Backend.Services.DataSources.ICredentialProtector` — `string Protect(string plaintext)`, `string Unprotect(string protectedText)`. Task 5 (`DataSourceService`) is the only consumer of this — providers never see it, per the design's "only the service calls Protect/Unprotect" rule.
  - `Backend.Services.DataSources.CredentialProtector : ICredentialProtector`, constructor `CredentialProtector(IDataProtectionProvider provider)`, purpose string `"DataSourceCredentials"`.

All the records/interfaces above go in one namespace, `Backend.Services.DataSources`, to keep the whole data-source feature grouped in one folder rather than scattering pieces across the flatter `Backend.Services` namespace `Report`'s repository lives in — this is a new sub-area, not an extension of the existing reports feature.

- [ ] Step 1: Create the shared records — `backend/Services/DataSources/ConnectionTestResult.cs`:
  ```csharp
  namespace Backend.Services.DataSources;

  public record ConnectionTestResult(bool Success, string? ErrorMessage);
  ```

- [ ] Step 2: Create `backend/Services/DataSources/SchemaDescriptor.cs` (all three schema records together, they only ever travel as a unit):
  ```csharp
  namespace Backend.Services.DataSources;

  public record SchemaDescriptor(IReadOnlyList<TableDescriptor> Tables);

  public record TableDescriptor(string Name, IReadOnlyList<FieldDescriptor> Fields);

  public record FieldDescriptor(string Name, string DataType);
  ```

- [ ] Step 3: Create `backend/Services/DataSources/IDataSourceProvider.cs`:
  ```csharp
  using Backend.Models;

  namespace Backend.Services.DataSources;

  public interface IDataSourceProvider
  {
      Task<ConnectionTestResult> TestConnectionAsync(DataSourceConnection connection);

      Task<SchemaDescriptor> DiscoverSchemaAsync(DataSourceConnection connection);
  }
  ```

- [ ] Step 4: Create `backend/Services/DataSources/ICredentialProtector.cs`:
  ```csharp
  namespace Backend.Services.DataSources;

  public interface ICredentialProtector
  {
      string Protect(string plaintext);

      string Unprotect(string protectedText);
  }
  ```

- [ ] Step 5: Write the failing test — `Backend.Tests/CredentialProtectorTests.cs`. `IDataProtectionProvider` needs DI to build a real one; `Microsoft.AspNetCore.DataProtection`'s `EphemeralDataProtectionProvider` is the simplest way to get a working instance in a unit test without touching disk (it holds keys in memory only, which is exactly what a test needs — no persisted key ring to clean up):
  ```csharp
  using Backend.Services.DataSources;
  using Microsoft.AspNetCore.DataProtection;

  namespace Backend.Tests;

  public class CredentialProtectorTests
  {
      private static ICredentialProtector CreateProtector()
      {
          var provider = new EphemeralDataProtectionProvider();
          return new CredentialProtector(provider);
      }

      [Fact]
      public void Protect_ThenUnprotect_ReturnsOriginalPlaintext()
      {
          var protector = CreateProtector();
          var plaintext = """{"username":"sa","password":"correct-horse-battery-staple"}""";

          var protectedText = protector.Protect(plaintext);
          var roundTripped = protector.Unprotect(protectedText);

          Assert.Equal(plaintext, roundTripped);
      }

      [Fact]
      public void Protect_DoesNotReturnThePlaintextVerbatim()
      {
          var protector = CreateProtector();
          var plaintext = """{"username":"sa","password":"correct-horse-battery-staple"}""";

          var protectedText = protector.Protect(plaintext);

          Assert.DoesNotContain("correct-horse-battery-staple", protectedText);
      }
  }
  ```
  `EphemeralDataProtectionProvider` lives in the `Microsoft.AspNetCore.DataProtection` namespace, shipped as part of the ASP.NET Core shared framework the same as `IDataProtectionProvider` itself — no package reference needed in `Backend.Tests.csproj`, it comes along because `Backend.Tests` project-references `backend/Backend.csproj`, which is an `Microsoft.NET.Sdk.Web` project.

- [ ] Step 6: Run the tests to confirm they fail (compile error — `CredentialProtector` doesn't exist yet):
  ```
  dotnet test Backend.Tests
  ```
  Expected: build failure, `error CS0246: The type or namespace name 'CredentialProtector' could not be found`. That's the red.

- [ ] Step 7: Implement `backend/Services/DataSources/CredentialProtector.cs`:
  ```csharp
  using Microsoft.AspNetCore.DataProtection;

  namespace Backend.Services.DataSources;

  public class CredentialProtector : ICredentialProtector
  {
      private const string Purpose = "DataSourceCredentials";

      private readonly IDataProtector _protector;

      public CredentialProtector(IDataProtectionProvider provider)
      {
          _protector = provider.CreateProtector(Purpose);
      }

      public string Protect(string plaintext)
      {
          return _protector.Protect(plaintext);
      }

      public string Unprotect(string protectedText)
      {
          return _protector.Unprotect(protectedText);
      }
  }
  ```

- [ ] Step 8: Run the tests again to confirm they pass:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass, including the 7 pre-existing from Milestones 0/1.

- [ ] Step 9: Commit:
  ```
  git add backend/Services/DataSources Backend.Tests/CredentialProtectorTests.cs
  git commit -m "backend: IDataSourceProvider contract, schema/test-result records, CredentialProtector (TDD)"
  ```

---

### Task 3: `SqlServerProvider` (TDD the connection-string builder; real I/O deferred to Task 7's manual check)

**Files:**
- Create: `backend/Services/DataSources/SqlServerProvider.cs`
- Create: `Backend.Tests/SqlServerProviderTests.cs`

**Interfaces:**
- Consumes: `Backend.Models.DataSourceConnection` (Task 1), `IDataSourceProvider`, `ConnectionTestResult`, `SchemaDescriptor`/`TableDescriptor`/`FieldDescriptor` (Task 2).
- Produces: `Backend.Services.DataSources.SqlServerProvider : IDataSourceProvider`, parameterless constructor. Per the design's rule that "providers receive already-decrypted credentials, they don't touch `IDataProtector` themselves" — `SqlServerProvider` never sees `ICredentialProtector` at all. It expects the `DataSourceConnection` handed to it by `TestConnectionAsync`/`DiscoverSchemaAsync` to already carry plaintext credentials JSON in `EncryptedCredentials` (a slightly awkward field name to reuse for plaintext, but it keeps `IDataSourceProvider`'s signature exactly as the design specifies — no second "decrypted credentials" parameter bolted on). Task 5 (`DataSourceService`) is the one that does the actual decrypting, before it ever calls into a provider. Task 6 (DI wiring) registers this by name; Task 7 is where it actually gets pointed at a real database.

Credentials JSON shape for `SqlServer`, decided here since nothing pinned it down before: `{"username": "...", "password": "..."}`. This is a plain internal record, not exposed anywhere outside this file.

`TestConnectionAsync` (opens a real `SqlConnection`) and `DiscoverSchemaAsync` (runs a real query against `INFORMATION_SCHEMA.COLUMNS`) both need actual I/O against a real SQL Server — there's no fake/in-memory substitute for "does opening this connection string succeed," so per the design brief those two methods are **not** unit tested here. They get a manual verification step in Task 7, the same pattern Milestone 1 used for the "survives a restart" proof (a real end-to-end check, not a unit test standing in for one). What *is* unit-testable here, and gets full TDD, is the pure connection-string-building logic — no network needed, just string assembly from known inputs.

- [ ] Step 1: Write the failing test first — `Backend.Tests/SqlServerProviderTests.cs`. `BuildConnectionString` is public (not just `internal`) since `SqlServerProvider` is already a public class and this reads fine as part of its public surface for testing:
  ```csharp
  using Backend.Models;
  using Backend.Services.DataSources;

  namespace Backend.Tests;

  public class SqlServerProviderTests
  {
      private static DataSourceConnection CreateConnection(string host, string? databaseName, string credentialsJson)
      {
          return new DataSourceConnection
          {
              Id = 1,
              Name = "Test SQL Source",
              Type = DataSourceType.SqlServer,
              Host = host,
              DatabaseName = databaseName,
              EncryptedCredentials = credentialsJson,
              CreatedAtUtc = DateTime.UtcNow
          };
      }

      [Fact]
      public void BuildConnectionString_IncludesHostDatabaseAndCredentials()
      {
          var provider = new SqlServerProvider();
          var connection = CreateConnection("localhost\\SQLEXPRESS", "OpenReportingPlatform", """{"username":"sa","password":"p@ssw0rd"}""");

          var connectionString = provider.BuildConnectionString(connection);

          Assert.Contains("Server=localhost\\SQLEXPRESS", connectionString);
          Assert.Contains("Database=OpenReportingPlatform", connectionString);
          Assert.Contains("User Id=sa", connectionString);
          Assert.Contains("Password=p@ssw0rd", connectionString);
      }

      [Fact]
      public void BuildConnectionString_MalformedCredentialsJson_ThrowsInvalidOperationException()
      {
          var provider = new SqlServerProvider();
          var connection = CreateConnection("localhost\\SQLEXPRESS", "OpenReportingPlatform", "not json at all");

          Assert.Throws<InvalidOperationException>(() => provider.BuildConnectionString(connection));
      }
  }
  ```
  No fake protector needed here — `SqlServerProvider` never touches `ICredentialProtector`, so these tests just put plaintext JSON straight into `EncryptedCredentials` (standing in for what `DataSourceService` will have already decrypted into that same field by the time a real call reaches this provider — see Task 5).

- [ ] Step 2: Run the tests to confirm they fail (compile error — `SqlServerProvider` doesn't exist yet):
  ```
  dotnet test Backend.Tests
  ```
  Expected: `error CS0246: The type or namespace name 'SqlServerProvider' could not be found`. Red.

- [ ] Step 3: Implement `backend/Services/DataSources/SqlServerProvider.cs`:
  ```csharp
  using System.Text.Json;
  using Backend.Models;
  using Microsoft.Data.SqlClient;

  namespace Backend.Services.DataSources;

  public class SqlServerProvider : IDataSourceProvider
  {
      public string BuildConnectionString(DataSourceConnection connection)
      {
          var credentials = ParseCredentials(connection.EncryptedCredentials);

          var builder = new SqlConnectionStringBuilder
          {
              DataSource = connection.Host,
              InitialCatalog = connection.DatabaseName ?? "",
              UserID = credentials.Username,
              Password = credentials.Password,
              TrustServerCertificate = true
          };

          return builder.ConnectionString;
      }

      public async Task<ConnectionTestResult> TestConnectionAsync(DataSourceConnection connection)
      {
          try
          {
              var connectionString = BuildConnectionString(connection);
              await using var sqlConnection = new SqlConnection(connectionString);
              await sqlConnection.OpenAsync();
              return new ConnectionTestResult(true, null);
          }
          catch (Exception ex)
          {
              return new ConnectionTestResult(false, ex.Message);
          }
      }

      public async Task<SchemaDescriptor> DiscoverSchemaAsync(DataSourceConnection connection)
      {
          var connectionString = BuildConnectionString(connection);
          await using var sqlConnection = new SqlConnection(connectionString);
          await sqlConnection.OpenAsync();

          const string sql = """
              SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
              FROM INFORMATION_SCHEMA.COLUMNS
              ORDER BY TABLE_NAME, ORDINAL_POSITION
              """;

          await using var command = new SqlCommand(sql, sqlConnection);
          await using var reader = await command.ExecuteReaderAsync();

          var fieldsByTable = new Dictionary<string, List<FieldDescriptor>>();

          while (await reader.ReadAsync())
          {
              var tableName = reader.GetString(0);
              var columnName = reader.GetString(1);
              var dataType = reader.GetString(2);

              if (!fieldsByTable.TryGetValue(tableName, out var fields))
              {
                  fields = new List<FieldDescriptor>();
                  fieldsByTable[tableName] = fields;
              }

              fields.Add(new FieldDescriptor(columnName, dataType));
          }

          var tables = fieldsByTable
              .Select(kvp => new TableDescriptor(kvp.Key, kvp.Value))
              .ToList();

          return new SchemaDescriptor(tables);
      }

      private static SqlCredentials ParseCredentials(string credentialsJson)
      {
          try
          {
              var credentials = JsonSerializer.Deserialize<SqlCredentials>(credentialsJson);
              if (credentials is null)
              {
                  throw new InvalidOperationException("SQL Server credentials JSON deserialized to null.");
              }

              return credentials;
          }
          catch (JsonException ex)
          {
              throw new InvalidOperationException("SQL Server credentials are not valid JSON.", ex);
          }
      }

      private record SqlCredentials(string Username, string Password);
  }
  ```
  `ParseCredentials` reads `connection.EncryptedCredentials` directly as plaintext JSON — no `Unprotect` call anywhere in this file, matching the design's "providers don't touch `IDataProtector`" rule. The malformed-JSON test passes `"not json at all"` straight in as `EncryptedCredentials`; `JsonSerializer.Deserialize` throws `JsonException`, caught and rethrown as `InvalidOperationException`, matching the test's `Assert.Throws<InvalidOperationException>`.

- [ ] Step 4: Run the tests again to confirm they pass:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass, including everything from Tasks 1-2 and Milestones 0/1.

- [ ] Step 5: Commit:
  ```
  git add backend/Services/DataSources/SqlServerProvider.cs Backend.Tests/SqlServerProviderTests.cs
  git commit -m "backend: SqlServerProvider with TDD'd connection-string builder (real I/O covered manually in Task 7)"
  ```

---

### Task 4: `RestApiProvider` (fully TDD'd via fake `HttpMessageHandler`)

**Files:**
- Create: `Backend.Tests/FakeHttpMessageHandler.cs`
- Create: `Backend.Tests/FakeHttpClientFactory.cs`
- Create: `Backend.Tests/RestApiProviderTests.cs`
- Create: `backend/Services/DataSources/RestApiProvider.cs`

**Interfaces:**
- Consumes: `Backend.Models.DataSourceConnection` (Task 1), `IDataSourceProvider`, `ConnectionTestResult`, `SchemaDescriptor`/`TableDescriptor`/`FieldDescriptor` (Task 2), `IHttpClientFactory` (framework-provided).
- Produces: `Backend.Services.DataSources.RestApiProvider : IDataSourceProvider`, constructor `RestApiProvider(IHttpClientFactory httpClientFactory)`. Note this provider does **not** take `ICredentialProtector` — the design's REST credential shape (bearer token / API key) isn't used for anything in this milestone's `TestConnectionAsync`/`DiscoverSchemaAsync` (both are plain unauthenticated GETs against `Host`), so there's nothing for it to decrypt yet. Flagging this as a deliberate simplification, not a missed requirement: the design doc says the credentials JSON shape for REST "isn't nailed down further than some JSON," and doesn't actually specify that this milestone's REST provider must send an auth header. Wiring credential-based auth into the GET is straightforward to add later (the query-pipeline milestone, when providers start being used for real reads) without changing this constructor's shape — it would just add a second constructor parameter.

Unlike `SqlServerProvider`, this provider is fully testable without touching a real network — `IHttpClientFactory` is an interface, and a fake `HttpMessageHandler` intercepts every call `HttpClient` would otherwise make. Both `TestConnectionAsync` and `DiscoverSchemaAsync` get full red/green TDD coverage here.

- [ ] Step 1: Create the fake handler — `Backend.Tests/FakeHttpMessageHandler.cs`:
  ```csharp
  using System.Net;

  namespace Backend.Tests;

  public sealed class FakeHttpMessageHandler : HttpMessageHandler
  {
      private readonly HttpStatusCode _statusCode;
      private readonly string? _content;

      public FakeHttpMessageHandler(HttpStatusCode statusCode, string? content = null)
      {
          _statusCode = statusCode;
          _content = content;
      }

      protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
      {
          var response = new HttpResponseMessage(_statusCode)
          {
              Content = _content is null ? null : new StringContent(_content)
          };
          return Task.FromResult(response);
      }
  }
  ```

- [ ] Step 2: Create the fake factory — `Backend.Tests/FakeHttpClientFactory.cs`:
  ```csharp
  namespace Backend.Tests;

  public sealed class FakeHttpClientFactory : IHttpClientFactory
  {
      private readonly HttpClient _client;

      public FakeHttpClientFactory(HttpMessageHandler handler)
      {
          _client = new HttpClient(handler);
      }

      public HttpClient CreateClient(string name) => _client;
  }
  ```

- [ ] Step 3: Write the failing tests — `Backend.Tests/RestApiProviderTests.cs`:
  ```csharp
  using System.Net;
  using Backend.Models;
  using Backend.Services.DataSources;

  namespace Backend.Tests;

  public class RestApiProviderTests
  {
      private static DataSourceConnection CreateConnection(string url)
      {
          return new DataSourceConnection
          {
              Id = 1,
              Name = "Test REST Source",
              Type = DataSourceType.RestApi,
              Host = url,
              DatabaseName = null,
              EncryptedCredentials = "",
              CreatedAtUtc = DateTime.UtcNow
          };
      }

      [Fact]
      public async Task TestConnectionAsync_SuccessStatusCode_ReturnsSuccessTrue()
      {
          var factory = new FakeHttpClientFactory(new FakeHttpMessageHandler(HttpStatusCode.OK));
          var provider = new RestApiProvider(factory);
          var connection = CreateConnection("https://api.example.com/data");

          var result = await provider.TestConnectionAsync(connection);

          Assert.True(result.Success);
          Assert.Null(result.ErrorMessage);
      }

      [Fact]
      public async Task TestConnectionAsync_ErrorStatusCode_ReturnsSuccessFalseWithMessage()
      {
          var factory = new FakeHttpClientFactory(new FakeHttpMessageHandler(HttpStatusCode.InternalServerError));
          var provider = new RestApiProvider(factory);
          var connection = CreateConnection("https://api.example.com/data");

          var result = await provider.TestConnectionAsync(connection);

          Assert.False(result.Success);
          Assert.NotNull(result.ErrorMessage);
      }

      [Fact]
      public async Task DiscoverSchemaAsync_JsonArrayResponse_InfersFieldsFromFirstElement()
      {
          const string json = """
              [
                  { "id": 1, "name": "Alice", "active": true },
                  { "id": 2, "name": "Bob", "active": false }
              ]
              """;
          var factory = new FakeHttpClientFactory(new FakeHttpMessageHandler(HttpStatusCode.OK, json));
          var provider = new RestApiProvider(factory);
          var connection = CreateConnection("https://api.example.com/people");

          var schema = await provider.DiscoverSchemaAsync(connection);

          var table = Assert.Single(schema.Tables);
          Assert.Equal(3, table.Fields.Count);
          Assert.Contains(table.Fields, f => f.Name == "id" && f.DataType == "number");
          Assert.Contains(table.Fields, f => f.Name == "name" && f.DataType == "string");
          Assert.Contains(table.Fields, f => f.Name == "active" && f.DataType == "boolean");
      }

      [Fact]
      public async Task DiscoverSchemaAsync_JsonObjectResponse_InfersFieldsFromRootObject()
      {
          const string json = """{ "total": 42, "label": "summary" }""";
          var factory = new FakeHttpClientFactory(new FakeHttpMessageHandler(HttpStatusCode.OK, json));
          var provider = new RestApiProvider(factory);
          var connection = CreateConnection("https://api.example.com/summary");

          var schema = await provider.DiscoverSchemaAsync(connection);

          var table = Assert.Single(schema.Tables);
          Assert.Equal(2, table.Fields.Count);
          Assert.Contains(table.Fields, f => f.Name == "total" && f.DataType == "number");
          Assert.Contains(table.Fields, f => f.Name == "label" && f.DataType == "string");
      }

      [Fact]
      public async Task DiscoverSchemaAsync_EmptyJsonArray_ReturnsTableWithNoFields()
      {
          var factory = new FakeHttpClientFactory(new FakeHttpMessageHandler(HttpStatusCode.OK, "[]"));
          var provider = new RestApiProvider(factory);
          var connection = CreateConnection("https://api.example.com/empty");

          var schema = await provider.DiscoverSchemaAsync(connection);

          var table = Assert.Single(schema.Tables);
          Assert.Empty(table.Fields);
      }
  }
  ```

- [ ] Step 4: Run the tests to confirm they fail (compile error — `RestApiProvider` doesn't exist yet):
  ```
  dotnet test Backend.Tests
  ```
  Expected: `error CS0246: The type or namespace name 'RestApiProvider' could not be found`. Red.

- [ ] Step 5: Implement `backend/Services/DataSources/RestApiProvider.cs`:
  ```csharp
  using System.Text.Json;
  using Backend.Models;

  namespace Backend.Services.DataSources;

  public class RestApiProvider : IDataSourceProvider
  {
      private readonly IHttpClientFactory _httpClientFactory;

      public RestApiProvider(IHttpClientFactory httpClientFactory)
      {
          _httpClientFactory = httpClientFactory;
      }

      public async Task<ConnectionTestResult> TestConnectionAsync(DataSourceConnection connection)
      {
          try
          {
              var client = _httpClientFactory.CreateClient(nameof(RestApiProvider));
              var response = await client.GetAsync(connection.Host);

              if (response.IsSuccessStatusCode)
              {
                  return new ConnectionTestResult(true, null);
              }

              return new ConnectionTestResult(false, $"Request failed with status code {(int)response.StatusCode}.");
          }
          catch (Exception ex)
          {
              return new ConnectionTestResult(false, ex.Message);
          }
      }

      public async Task<SchemaDescriptor> DiscoverSchemaAsync(DataSourceConnection connection)
      {
          var client = _httpClientFactory.CreateClient(nameof(RestApiProvider));
          var response = await client.GetAsync(connection.Host);
          response.EnsureSuccessStatusCode();

          var body = await response.Content.ReadAsStringAsync();
          using var document = JsonDocument.Parse(body);

          JsonElement sample;
          if (document.RootElement.ValueKind == JsonValueKind.Array)
          {
              sample = document.RootElement.GetArrayLength() > 0
                  ? document.RootElement[0]
                  : default;
          }
          else
          {
              sample = document.RootElement;
          }

          var fields = new List<FieldDescriptor>();

          if (sample.ValueKind == JsonValueKind.Object)
          {
              foreach (var property in sample.EnumerateObject())
              {
                  fields.Add(new FieldDescriptor(property.Name, InferDataType(property.Value)));
              }
          }

          var table = new TableDescriptor(connection.Name, fields);
          return new SchemaDescriptor(new List<TableDescriptor> { table });
      }

      private static string InferDataType(JsonElement value)
      {
          return value.ValueKind switch
          {
              JsonValueKind.String => "string",
              JsonValueKind.Number => "number",
              JsonValueKind.True or JsonValueKind.False => "boolean",
              JsonValueKind.Object => "object",
              JsonValueKind.Array => "array",
              JsonValueKind.Null => "null",
              _ => "unknown"
          };
      }
  }
  ```
  Note on the empty-array case: `sample` stays as `default(JsonElement)` (`ValueKind == JsonValueKind.Undefined`), so the `if (sample.ValueKind == JsonValueKind.Object)` check is false and `fields` stays empty — matching the `DiscoverSchemaAsync_EmptyJsonArray_ReturnsTableWithNoFields` test. `TableDescriptor.Name` uses `connection.Name` (the data source's own name) since a REST response has no inherent "table name" the way SQL does — this is the one place `SqlServerProvider` and `RestApiProvider` genuinely can't share a convention, and that's fine, it's still the same `TableDescriptor` shape either way.

- [ ] Step 6: Run the tests again to confirm they pass:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass, including everything from Tasks 1-3 and Milestones 0/1.

- [ ] Step 7: Commit:
  ```
  git add backend/Services/DataSources/RestApiProvider.cs Backend.Tests/FakeHttpMessageHandler.cs Backend.Tests/FakeHttpClientFactory.cs Backend.Tests/RestApiProviderTests.cs
  git commit -m "backend: RestApiProvider, fully TDD'd via fake HttpMessageHandler"
  ```

---

### Task 5: `IDataSourceService` (TDD via EF Core InMemory provider — proves `ListAsync` never leaks `EncryptedCredentials`)

**Files:**
- Create: `backend/Services/DataSources/DataSourceConnectionSummary.cs`
- Create: `backend/Services/DataSources/CreateDataSourceConnectionRequest.cs`
- Create: `backend/Services/DataSources/IDataSourceService.cs`
- Create: `backend/Services/DataSources/DataSourceService.cs`
- Create: `Backend.Tests/DataSourceServiceTests.cs`

**Interfaces:**
- Consumes: `Backend.Data.ReportingDbContext` (Task 1, now with `DataSourceConnections`), `Backend.Models.DataSourceConnection`/`DataSourceType` (Task 1), `ICredentialProtector` (Task 2), `IDataSourceProvider`/`ConnectionTestResult`/`SchemaDescriptor` (Task 2), `SqlServerProvider`/`RestApiProvider` (Tasks 3-4).
- Produces:
  - `public record DataSourceConnectionSummary(int Id, string Name, DataSourceType Type, string Host, string? DatabaseName, DateTime CreatedAtUtc);` — deliberately has no `EncryptedCredentials` field. This is the type `ListAsync` returns; Task 6's controller passes it straight through as the `GET /api/datasources` response body.
  - `public record CreateDataSourceConnectionRequest(string Name, DataSourceType Type, string Host, string? DatabaseName, string CredentialsJson);` — `CredentialsJson` is the plaintext credentials blob (e.g. `{"username":"sa","password":"..."}` for SQL Server) the caller sends; the service encrypts it before persisting, nothing above the service ever holds ciphertext or plaintext at the same time as the persisted row.
  - `Backend.Services.DataSources.IDataSourceService` — `Task<DataSourceConnectionSummary> CreateAsync(CreateDataSourceConnectionRequest request)`, `Task<ConnectionTestResult> TestAsync(int id)`, `Task<SchemaDescriptor> DiscoverSchemaAsync(int id)`, `Task<IReadOnlyList<DataSourceConnectionSummary>> ListAsync()`.
  - `Backend.Services.DataSources.DataSourceService : IDataSourceService`, constructor `DataSourceService(ReportingDbContext context, ICredentialProtector credentialProtector, IEnumerable<IDataSourceProvider> providers)`. Task 6's DI wiring depends on this exact constructor shape.

Provider resolution: `DataSourceService` takes `IEnumerable<IDataSourceProvider>` and picks the right one by checking each provider's concrete type against the connection's `Type`. This keeps the mapping in one place without a giant `switch` living in the controller (which the design explicitly says shouldn't know providers exist) and without a separate factory abstraction that this milestone doesn't need yet — two providers, two `if`-checks, that's it.

- [ ] Step 1: Create the DTOs — `backend/Services/DataSources/DataSourceConnectionSummary.cs`:
  ```csharp
  using Backend.Models;

  namespace Backend.Services.DataSources;

  public record DataSourceConnectionSummary(int Id, string Name, DataSourceType Type, string Host, string? DatabaseName, DateTime CreatedAtUtc);
  ```

- [ ] Step 2: Create `backend/Services/DataSources/CreateDataSourceConnectionRequest.cs`:
  ```csharp
  using Backend.Models;

  namespace Backend.Services.DataSources;

  public record CreateDataSourceConnectionRequest(string Name, DataSourceType Type, string Host, string? DatabaseName, string CredentialsJson);
  ```

- [ ] Step 3: Create `backend/Services/DataSources/IDataSourceService.cs`:
  ```csharp
  namespace Backend.Services.DataSources;

  public interface IDataSourceService
  {
      Task<DataSourceConnectionSummary> CreateAsync(CreateDataSourceConnectionRequest request);

      Task<ConnectionTestResult> TestAsync(int id);

      Task<SchemaDescriptor> DiscoverSchemaAsync(int id);

      Task<IReadOnlyList<DataSourceConnectionSummary>> ListAsync();
  }
  ```

- [ ] Step 4: Add the EF Core InMemory provider to the test project if it's somehow missing (it isn't — `Backend.Tests.csproj` already has `Microsoft.EntityFrameworkCore.InMemory` 8.0.11 from Milestone 1). Skip straight to the test file.

- [ ] Step 5: Write the failing tests — `Backend.Tests/DataSourceServiceTests.cs`. This is the test file that proves the "no leaked credentials" rule, not just documents it:
  ```csharp
  using Backend.Data;
  using Backend.Models;
  using Backend.Services.DataSources;
  using Microsoft.EntityFrameworkCore;

  namespace Backend.Tests;

  public class DataSourceServiceTests
  {
      private class PassThroughCredentialProtector : ICredentialProtector
      {
          public string Protect(string plaintext) => $"encrypted:{plaintext}";

          public string Unprotect(string protectedText) => protectedText.Replace("encrypted:", "");
      }

      private class StubSqlServerProvider : IDataSourceProvider
      {
          public Task<ConnectionTestResult> TestConnectionAsync(DataSourceConnection connection) =>
              Task.FromResult(new ConnectionTestResult(true, null));

          public Task<SchemaDescriptor> DiscoverSchemaAsync(DataSourceConnection connection) =>
              Task.FromResult(new SchemaDescriptor(new List<TableDescriptor>()));
      }

      private static (IDataSourceService Service, ReportingDbContext Context) CreateService(string databaseName)
      {
          var options = new DbContextOptionsBuilder<ReportingDbContext>()
              .UseInMemoryDatabase(databaseName)
              .Options;

          var context = new ReportingDbContext(options);
          context.Database.EnsureCreated();

          var providers = new List<IDataSourceProvider> { new StubSqlServerProvider() };
          var service = new DataSourceService(context, new PassThroughCredentialProtector(), providers);
          return (service, context);
      }

      [Fact]
      public async Task CreateAsync_PersistsConnectionWithEncryptedCredentials()
      {
          var (service, context) = CreateService(Guid.NewGuid().ToString());
          var request = new CreateDataSourceConnectionRequest(
              "Main SQL",
              DataSourceType.SqlServer,
              "localhost\\SQLEXPRESS",
              "OpenReportingPlatform",
              """{"username":"sa","password":"secret"}""");

          var summary = await service.CreateAsync(request);

          var stored = await context.DataSourceConnections.FirstAsync(c => c.Id == summary.Id);
          Assert.Equal("encrypted:{\"username\":\"sa\",\"password\":\"secret\"}", stored.EncryptedCredentials);
          Assert.NotEqual(default, stored.CreatedAtUtc);
      }

      [Fact]
      public async Task ListAsync_NeverExposesEncryptedCredentials()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          await service.CreateAsync(new CreateDataSourceConnectionRequest(
              "Main SQL",
              DataSourceType.SqlServer,
              "localhost\\SQLEXPRESS",
              "OpenReportingPlatform",
              """{"username":"sa","password":"secret"}"""));

          var summaries = await service.ListAsync();

          Assert.Single(summaries);
          var summaryType = typeof(DataSourceConnectionSummary);
          Assert.DoesNotContain(summaryType.GetProperties(), p => p.Name == "EncryptedCredentials");
      }

      [Fact]
      public async Task ListAsync_ReturnsCreatedConnectionsWithExpectedFields()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          await service.CreateAsync(new CreateDataSourceConnectionRequest(
              "Main SQL",
              DataSourceType.SqlServer,
              "localhost\\SQLEXPRESS",
              "OpenReportingPlatform",
              """{"username":"sa","password":"secret"}"""));

          var summaries = await service.ListAsync();

          var summary = Assert.Single(summaries);
          Assert.Equal("Main SQL", summary.Name);
          Assert.Equal(DataSourceType.SqlServer, summary.Type);
          Assert.Equal("localhost\\SQLEXPRESS", summary.Host);
          Assert.Equal("OpenReportingPlatform", summary.DatabaseName);
      }

      [Fact]
      public async Task TestAsync_ResolvesProviderByTypeAndDelegatesToIt()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var created = await service.CreateAsync(new CreateDataSourceConnectionRequest(
              "Main SQL",
              DataSourceType.SqlServer,
              "localhost\\SQLEXPRESS",
              "OpenReportingPlatform",
              """{"username":"sa","password":"secret"}"""));

          var result = await service.TestAsync(created.Id);

          Assert.True(result.Success);
      }

      [Fact]
      public async Task DiscoverSchemaAsync_ResolvesProviderByTypeAndDelegatesToIt()
      {
          var (service, _) = CreateService(Guid.NewGuid().ToString());
          var created = await service.CreateAsync(new CreateDataSourceConnectionRequest(
              "Main SQL",
              DataSourceType.SqlServer,
              "localhost\\SQLEXPRESS",
              "OpenReportingPlatform",
              """{"username":"sa","password":"secret"}"""));

          var schema = await service.DiscoverSchemaAsync(created.Id);

          Assert.Empty(schema.Tables);
      }
  }
  ```
  `ListAsync_NeverExposesEncryptedCredentials` is the one that actually enforces the rule at the type level — it reflects over `DataSourceConnectionSummary`'s properties and asserts there's no `EncryptedCredentials` property at all, which is a stronger guarantee than checking a serialized JSON string doesn't contain a particular substring (that kind of check can pass by accident if a field gets renamed; asserting the shape itself doesn't have the property can't).

- [ ] Step 6: Run the tests to confirm they fail (compile error — none of `IDataSourceService`/`DataSourceService`/the DTOs exist as consumed yet, specifically `DataSourceService`):
  ```
  dotnet test Backend.Tests
  ```
  Expected: `error CS0246: The type or namespace name 'DataSourceService' could not be found`. Red.

- [ ] Step 7: Implement `backend/Services/DataSources/DataSourceService.cs`:
  ```csharp
  using Backend.Data;
  using Backend.Models;
  using Microsoft.EntityFrameworkCore;

  namespace Backend.Services.DataSources;

  public class DataSourceService : IDataSourceService
  {
      private readonly ReportingDbContext _context;
      private readonly ICredentialProtector _credentialProtector;
      private readonly IReadOnlyList<IDataSourceProvider> _providers;

      public DataSourceService(ReportingDbContext context, ICredentialProtector credentialProtector, IEnumerable<IDataSourceProvider> providers)
      {
          _context = context;
          _credentialProtector = credentialProtector;
          _providers = providers.ToList();
      }

      public async Task<DataSourceConnectionSummary> CreateAsync(CreateDataSourceConnectionRequest request)
      {
          var connection = new DataSourceConnection
          {
              Name = request.Name,
              Type = request.Type,
              Host = request.Host,
              DatabaseName = request.DatabaseName,
              EncryptedCredentials = _credentialProtector.Protect(request.CredentialsJson),
              CreatedAtUtc = DateTime.UtcNow
          };

          _context.DataSourceConnections.Add(connection);
          await _context.SaveChangesAsync();

          return ToSummary(connection);
      }

      public async Task<ConnectionTestResult> TestAsync(int id)
      {
          var connection = await GetConnectionAsync(id);
          var provider = ResolveProvider(connection.Type);
          return await provider.TestConnectionAsync(WithDecryptedCredentials(connection));
      }

      public async Task<SchemaDescriptor> DiscoverSchemaAsync(int id)
      {
          var connection = await GetConnectionAsync(id);
          var provider = ResolveProvider(connection.Type);
          return await provider.DiscoverSchemaAsync(WithDecryptedCredentials(connection));
      }

      public async Task<IReadOnlyList<DataSourceConnectionSummary>> ListAsync()
      {
          var connections = await _context.DataSourceConnections.ToListAsync();
          return connections.Select(ToSummary).ToList();
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

      private IDataSourceProvider ResolveProvider(DataSourceType type)
      {
          return type switch
          {
              DataSourceType.SqlServer => _providers.OfType<SqlServerProvider>().First(),
              DataSourceType.RestApi => _providers.OfType<RestApiProvider>().First(),
              _ => throw new InvalidOperationException($"No provider registered for data source type {type}.")
          };
      }

      // Providers never call ICredentialProtector themselves (see design). This builds a transient,
      // never-persisted copy of the connection where EncryptedCredentials has been swapped for the
      // decrypted plaintext JSON, so a provider's BuildConnectionString/credential-parsing logic can
      // read it directly. The real, still-encrypted row in the database is untouched by this.
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

      private static DataSourceConnectionSummary ToSummary(DataSourceConnection connection)
      {
          return new DataSourceConnectionSummary(
              connection.Id,
              connection.Name,
              connection.Type,
              connection.Host,
              connection.DatabaseName,
              connection.CreatedAtUtc);
      }
  }
  ```
  `ResolveProvider` switches on the connection's `Type` and picks the matching provider out of the injected `IEnumerable<IDataSourceProvider>` by concrete type (`OfType<SqlServerProvider>()`/`OfType<RestApiProvider>()`) — this is why the test's `StubSqlServerProvider` needs to actually be named/positioned as the SQL Server one; if the test instead needs a stub for `RestApi`, add a second stub class following the same pattern. `.First()` throws if the DI registration in Task 6 is ever missing a provider — a fast, loud failure at the point of use rather than a silent null.

- [ ] Step 8: Run the tests again to confirm they pass:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass, including everything from Tasks 1-4 and Milestones 0/1.

- [ ] Step 9: Commit:
  ```
  git add backend/Services/DataSources/DataSourceConnectionSummary.cs backend/Services/DataSources/CreateDataSourceConnectionRequest.cs backend/Services/DataSources/IDataSourceService.cs backend/Services/DataSources/DataSourceService.cs Backend.Tests/DataSourceServiceTests.cs
  git commit -m "backend: DataSourceService, TDD'd against EF Core InMemory, proves ListAsync never leaks EncryptedCredentials"
  ```

---

### Task 6: `DataSourcesController` + `Program.cs` DI wiring

**Files:**
- Create: `backend/Controllers/DataSourcesController.cs`
- Modify: `backend/Program.cs`

**Interfaces:**
- Consumes: `IDataSourceService`/`DataSourceService` (Task 5), `CreateDataSourceConnectionRequest`/`DataSourceConnectionSummary` (Task 5), `IDataSourceProvider`/`SqlServerProvider`/`RestApiProvider` (Tasks 2-4), `ICredentialProtector`/`CredentialProtector` (Task 2).
- Produces: running endpoints `GET /api/datasources`, `POST /api/datasources`, `POST /api/datasources/{id}/test`, `GET /api/datasources/{id}/schema`. Task 8/9 (frontend) hardcode these exact routes.

This task has no new unit tests of its own — `ReportsController` didn't get one either in Milestone 0 beyond what the repository/service tests already cover, and the controller here is equally thin (route → service call → wrap the result). Coverage comes from Task 5's service tests plus Task 7's manual HTTP smoke test.

- [ ] Step 1: Create `backend/Controllers/DataSourcesController.cs`:
  ```csharp
  using Backend.Services.DataSources;
  using Microsoft.AspNetCore.Mvc;

  namespace Backend.Controllers;

  [ApiController]
  [Route("api/datasources")]
  public class DataSourcesController : ControllerBase
  {
      private readonly IDataSourceService _service;

      public DataSourcesController(IDataSourceService service)
      {
          _service = service;
      }

      [HttpGet]
      public async Task<ActionResult<IEnumerable<DataSourceConnectionSummary>>> GetAll()
      {
          return Ok(await _service.ListAsync());
      }

      [HttpPost]
      public async Task<ActionResult<DataSourceConnectionSummary>> Create(CreateDataSourceConnectionRequest request)
      {
          if (string.IsNullOrWhiteSpace(request.Name))
          {
              return BadRequest("Name is required.");
          }

          if (string.IsNullOrWhiteSpace(request.Host))
          {
              return BadRequest("Host is required.");
          }

          var summary = await _service.CreateAsync(request);
          return Created($"/api/datasources/{summary.Id}", summary);
      }

      [HttpPost("{id}/test")]
      public async Task<ActionResult<ConnectionTestResult>> Test(int id)
      {
          return Ok(await _service.TestAsync(id));
      }

      [HttpGet("{id}/schema")]
      public async Task<ActionResult<SchemaDescriptor>> Schema(int id)
      {
          return Ok(await _service.DiscoverSchemaAsync(id));
      }
  }
  ```
  Route casing note (this project doesn't use the `snake_case`/`SlugifyParameterTransformer` convention from the ERP codebase this instruction set otherwise draws on — `open-reporting-platform` is a separate personal project and its existing routes, `api/reports`, are already plain lowercase with no separators; `api/datasources` follows that same existing convention, not the ERP one).

- [ ] Step 2: Wire up DI in `backend/Program.cs` — add the data-source registrations alongside the existing report ones. Full file after the change:
  ```csharp
  using Backend.Data;
  using Backend.Services;
  using Backend.Services.DataSources;
  using Microsoft.EntityFrameworkCore;

  var builder = WebApplication.CreateBuilder(args);

  builder.Services.AddControllers();
  builder.Services.AddEndpointsApiExplorer();
  builder.Services.AddSwaggerGen();

  builder.Services.AddDbContext<ReportingDbContext>(options =>
      options.UseSqlServer(builder.Configuration.GetConnectionString("ReportingDatabase")));
  builder.Services.AddScoped<IReportRepository, EfReportRepository>();

  builder.Services.AddHttpClient();
  builder.Services.AddScoped<ICredentialProtector, CredentialProtector>();
  builder.Services.AddScoped<IDataSourceProvider, SqlServerProvider>();
  builder.Services.AddScoped<IDataSourceProvider, RestApiProvider>();
  builder.Services.AddScoped<IDataSourceService, DataSourceService>();

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
  Two `AddScoped<IDataSourceProvider, ...>()` calls for two different implementations is exactly how ASP.NET Core's DI container is meant to be used for "resolve all implementations of this interface" — `IEnumerable<IDataSourceProvider>` (which `DataSourceService`'s constructor asks for) collects every registration in order. `AddHttpClient()` with no type argument registers the framework's default `IHttpClientFactory`, which is what `RestApiProvider` needs — this is the one new DI concept in `Program.cs` this milestone, everything else follows the existing `AddScoped` pattern from Milestone 1.

- [ ] Step 3: Build and run the full test suite:
  ```
  dotnet build backend/Backend.csproj
  dotnet test Backend.Tests
  ```
  Expected: both succeed, all tests from every prior task still pass (nothing in this task touched an existing type's shape).

- [ ] Step 4: Commit:
  ```
  git add backend/Controllers/DataSourcesController.cs backend/Program.cs
  git commit -m "backend: DataSourcesController, wire up DataSourceService/providers/credential protector in DI"
  ```

---

### Task 7: Migration, apply to the real database, manual smoke test of both providers

**Files:**
- Create: `backend/Migrations/*_AddDataSourceConnections.cs` (and its `.Designer.cs` companion, plus an updated `ReportingDbContextModelSnapshot.cs`, all generated by the tool)

**Interfaces:**
- Consumes: `Backend.Data.ReportingDbContext` with `DataSourceConnections` (Task 1), the wired-up DI from Task 6, the connection string in `backend/appsettings.Development.json` (unchanged — same database).
- Produces: nothing further downstream — the point of this task is the `DataSourceConnections` table existing on the real `OpenReportingPlatform` database, and a real end-to-end proof that `SqlServerProvider` and `RestApiProvider` actually work against real targets (not just their pure/fake-backed unit tests from Tasks 3-4).

- [ ] Step 1: Confirm `dotnet-ef` is installed and at the right version (already installed at `8.0.11` per Milestone 1 — just checking, not reinstalling):
  ```
  dotnet ef --version
  ```
  Expected output contains `Entity Framework Core .NET Command-line Tools 8.0.11`.

- [ ] Step 2: Set the environment for this terminal session before running any `dotnet ef` command (same reason as Milestone 1 — design-time discovery needs `appsettings.Development.json` loaded for the connection string):
  ```
  $env:ASPNETCORE_ENVIRONMENT = "Development"
  ```

- [ ] Step 3: Generate the migration:
  ```
  dotnet ef migrations add AddDataSourceConnections --project backend/Backend.csproj --startup-project backend/Backend.csproj
  ```
  Expected: ends with `Done.`, creates `backend/Migrations/{timestamp}_AddDataSourceConnections.cs` and its `.Designer.cs` companion, and updates the existing `backend/Migrations/ReportingDbContextModelSnapshot.cs` (doesn't touch the earlier `InitialCreate` migration files).

- [ ] Step 4: Open the generated `{timestamp}_AddDataSourceConnections.cs` and confirm the `Up()` method has a `migrationBuilder.CreateTable(name: "DataSourceConnections", ...)` call with columns matching Task 1's entity (`Id`, `Name`, `Type`, `Host`, `DatabaseName`, `EncryptedCredentials`, `CreatedAtUtc`) and `Id` set up as the identity primary key. No `InsertData` call this time — unlike `Reports`, there's no seed data for this table. No edits needed — just confirm it matches.

- [ ] Step 5: Apply the migration to the real SQL Server Express instance:
  ```
  dotnet ef database update --project backend/Backend.csproj --startup-project backend/Backend.csproj
  ```
  Expected: ends with `Done.`, no errors.

- [ ] Step 6: Verify the table exists directly against the database:
  ```
  sqlcmd -S "localhost\SQLEXPRESS" -E -Q "SELECT TABLE_NAME FROM OpenReportingPlatform.INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'DataSourceConnections'"
  ```
  Expected: one row, `DataSourceConnections`.

- [ ] Step 7: Start the app:
  ```
  dotnet run --project backend --launch-profile http
  ```
  Confirm it logs listening on `http://localhost:5198`.

- [ ] Step 8: Manual smoke test, `SqlServerProvider` end to end — register a connection pointing at the very same `OpenReportingPlatform` database (Windows auth doesn't fit this milestone's username/password credential shape, so this step uses SQL auth; if the local SQLEXPRESS instance only has Windows auth enabled, enable SQL Server + Windows Authentication mode in SSMS first, create a throwaway low-privilege SQL login for this test, and use those credentials below instead of `sa`). From a second terminal:
  ```
  curl.exe -X POST http://localhost:5198/api/datasources -H "Content-Type: application/json" -d "{\"name\":\"Local Reporting DB\",\"type\":\"SqlServer\",\"host\":\"localhost\\\\SQLEXPRESS\",\"databaseName\":\"OpenReportingPlatform\",\"credentialsJson\":\"{\\\"username\\\":\\\"sa\\\",\\\"password\\\":\\\"<your-actual-sa-password>\\\"}\"}"
  ```
  Expected: `201 Created` with a body showing the summary — `id`, `name`, `type`, `host`, `databaseName`, `createdAtUtc` — and no `encryptedCredentials` field anywhere in it (the actual live proof of Task 5's `ListAsync_NeverExposesEncryptedCredentials` test, now checked against the real running API instead of just the InMemory-provider test).

- [ ] Step 9: Test the connection (replace `1` with whatever `id` Step 8 returned):
  ```
  curl.exe -X POST http://localhost:5198/api/datasources/1/test
  ```
  Expected: `200 OK`, `{"success":true,"errorMessage":null}`.

- [ ] Step 10: Discover its schema:
  ```
  curl.exe http://localhost:5198/api/datasources/1/schema
  ```
  Expected: `200 OK`, a JSON body listing `tables`, each with a `name` and `fields` — you should see `Reports` and `DataSourceConnections` among them, since this connection points at the same database, with fields matching each table's actual columns.

- [ ] Step 11: Manual smoke test, `RestApiProvider` end to end — register a connection against any public JSON endpoint that returns an array (e.g. `https://jsonplaceholder.typicode.com/users`, a long-standing free test API; swap for whatever's reachable from this machine if that one's unavailable when you run this):
  ```
  curl.exe -X POST http://localhost:5198/api/datasources -H "Content-Type: application/json" -d "{\"name\":\"JSONPlaceholder Users\",\"type\":\"RestApi\",\"host\":\"https://jsonplaceholder.typicode.com/users\",\"databaseName\":null,\"credentialsJson\":\"{}\"}"
  ```
  Expected: `201 Created`, again with no `encryptedCredentials` in the body.

- [ ] Step 12: Test and discover schema for it (replace `2` with the returned `id`):
  ```
  curl.exe -X POST http://localhost:5198/api/datasources/2/test
  curl.exe http://localhost:5198/api/datasources/2/schema
  ```
  Expected: test returns `{"success":true,"errorMessage":null}`; schema returns one table named `JSONPlaceholder Users` with fields inferred from the first user object (`id: number`, `name: string`, `email: string`, `address: object`, etc.).

- [ ] Step 13: Confirm the list endpoint shows both connections, still with no credentials:
  ```
  curl.exe http://localhost:5198/api/datasources
  ```
  Expected: a JSON array with both entries from Steps 8 and 11, neither containing `encryptedCredentials`.

- [ ] Step 14: Stop the app (`Ctrl+C`).

- [ ] Step 15: Commit the migration files:
  ```
  git add backend/Migrations
  git commit -m "backend: add AddDataSourceConnections migration"
  ```

---

### Task 8: Frontend routing — extract `ReportsPage`, add react-router-dom, top nav

**Files:**
- Modify: `frontend/package.json` (via `npm install`)
- Create: `frontend/src/pages/ReportsPage.tsx`
- Modify: `frontend/src/App.tsx` (becomes the router + nav shell)

**Interfaces:**
- Consumes: `getReports`/`createReport`/`Report` from `frontend/src/api/reports.ts` (unchanged, existing from Milestone 0).
- Produces: routes `/reports` and `/datasources` (the latter rendering a placeholder until Task 9), a shared `AppBar` nav. Task 9 depends on the `/datasources` route already existing here.

- [ ] Step 1: Install react-router-dom:
  ```
  cd frontend
  npm install react-router-dom
  ```
  Confirm `frontend/package.json` picked up a `react-router-dom` entry under `dependencies` — whatever current major npm resolves to is fine (see Global Constraints note on this).

- [ ] Step 2: Extract the existing page content into `frontend/src/pages/ReportsPage.tsx` — this is `App.tsx`'s current content verbatim, just renamed and moved:
  ```tsx
  import { useEffect, useState } from "react";
  import {
    Alert,
    Box,
    Button,
    Container,
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
  import { createReport, getReports, type Report } from "../api/reports";

  function ReportsPage() {
    const [reports, setReports] = useState<Report[]>([]);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [error, setError] = useState<string | null>(null);

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
        await createReport(name, description);
        setName("");
        setDescription("");
        await refresh();
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
              <TableRow><TableCell>ID</TableCell><TableCell>Name</TableCell><TableCell>Description</TableCell></TableRow>
            </TableHead>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id}><TableCell>{r.id}</TableCell><TableCell>{r.name}</TableCell><TableCell>{r.description}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Container>
    );
  }

  export default ReportsPage;
  ```
  Two deliberate differences from the original `App.tsx`, both just consequences of this no longer being the top-level component: the `import` path for the api client is `../api/reports` (one directory up, since this file now lives in `pages/`), and the `<CssBaseline />` + surrounding `<>...</>` fragment are gone from here — `CssBaseline` is a page-independent, apply-once concern that belongs in the new `App.tsx` shell instead (Step 3), not duplicated into every page component.

- [ ] Step 3: Replace `frontend/src/App.tsx` entirely — this becomes the router + nav shell:
  ```tsx
  import { AppBar, Box, CssBaseline, Tab, Tabs, Toolbar, Typography } from "@mui/material";
  import { useMemo } from "react";
  import { createBrowserRouter, Link, RouterProvider, useLocation } from "react-router-dom";
  import DataSourcesPage from "./pages/DataSourcesPage";
  import ReportsPage from "./pages/ReportsPage";

  function TopNav() {
    const location = useLocation();
    const currentTab = location.pathname.startsWith("/datasources") ? "/datasources" : "/reports";

    return (
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ mr: 4 }}>Open Reporting Platform</Typography>
          <Tabs value={currentTab} textColor="inherit" indicatorColor="secondary">
            <Tab label="Reports" value="/reports" component={Link} to="/reports" />
            <Tab label="Data Sources" value="/datasources" component={Link} to="/datasources" />
          </Tabs>
        </Toolbar>
      </AppBar>
    );
  }

  function Layout({ children }: { children: React.ReactNode }) {
    return (
      <>
        <CssBaseline />
        <TopNav />
        <Box>{children}</Box>
      </>
    );
  }

  const router = createBrowserRouter([
    { path: "/", element: <Layout><ReportsPage /></Layout> },
    { path: "/reports", element: <Layout><ReportsPage /></Layout> },
    { path: "/datasources", element: <Layout><DataSourcesPage /></Layout> },
  ]);

  function App() {
    return <RouterProvider router={router} />;
  }

  export default App;
  ```
  Wait — `TopNav` calls `useLocation()`, which only works for components rendered *inside* a router's tree. Since `Layout`/`TopNav` are placed directly into each route's `element` (not wrapped by a parent `<Outlet>`-based layout route), this actually does work correctly — `createBrowserRouter`'s route tree provides router context to every element it renders, including nested components like `Layout` and `TopNav`, regardless of whether the layout is expressed as a wrapping component (as here) or a parent route with `<Outlet>`. Both styles are standard; this plan uses the wrapping-component style since it's the smaller change for two routes, and `useMemo` isn't actually needed here since `router` is defined at module scope, not inside the component — dropping that unused import before writing the file (already removed from the code above; if you copy this and TypeScript's `noUnusedLocals` complains about it, it's because a stray copy still has it, double check against the final block above).

  `DataSourcesPage` doesn't exist yet — Task 9 creates it. This file won't compile until Task 9 lands, which is fine as an in-progress state within this task's own steps, but the task isn't done until it builds — see Step 4.

- [ ] Step 4: This task alone leaves the build red (`DataSourcesPage` doesn't exist), which is different from every other task in this plan — flagging it explicitly rather than pretending otherwise. Two ways to handle it, pick the first:
  - **Preferred:** fold Task 8 and Task 9 into one working session so the build only needs to go green once, at the end of Task 9 — don't commit in between.
  - **If you do need a checkpoint here:** add a temporary one-line placeholder `frontend/src/pages/DataSourcesPage.tsx`:
    ```tsx
    function DataSourcesPage() {
      return <div>Data sources coming in the next task</div>;
    }

    export default DataSourcesPage;
    ```
    run `npm run build` to confirm it's clean, commit, then Task 9 replaces this file's content entirely (not a new file — the same path, real content instead of the placeholder).

- [ ] Step 5 (only if you took the placeholder path in Step 4): From `frontend/`, run:
  ```
  npm run build
  ```
  Expected: clean compile.

- [ ] Step 6 (only if you took the placeholder path in Step 4): Commit:
  ```
  git add -A
  git commit -m "frontend: extract ReportsPage, add react-router-dom, top nav with Reports/Data Sources tabs"
  ```
  If you folded this into Task 9 instead, skip this commit — Task 9's commit covers both.

---

### Task 9: `DataSourcesPage` — list, add form, per-row Test button

**Files:**
- Create: `frontend/src/api/datasources.ts`
- Create/Replace: `frontend/src/pages/DataSourcesPage.tsx`

**Interfaces:**
- Consumes: `GET /api/datasources`, `POST /api/datasources`, `POST /api/datasources/{id}/test` (Tasks 6-7). Route `/datasources` already exists from Task 8.
- Produces: the finished Milestone 2 frontend page. Nothing downstream.

- [ ] Step 1: Create `frontend/src/api/datasources.ts`, following the exact same isolation pattern as `frontend/src/api/reports.ts` — no HTTP calls anywhere outside this file for this feature:
  ```typescript
  import axios from "axios";

  export type DataSourceType = "SqlServer" | "RestApi";

  export interface DataSourceConnectionSummary {
    id: number;
    name: string;
    type: DataSourceType;
    host: string;
    databaseName: string | null;
    createdAtUtc: string;
  }

  export interface ConnectionTestResult {
    success: boolean;
    errorMessage: string | null;
  }

  export interface CreateDataSourceConnectionRequest {
    name: string;
    type: DataSourceType;
    host: string;
    databaseName: string | null;
    credentialsJson: string;
  }

  const api = axios.create({ baseURL: "http://localhost:5198/api" });

  export async function getDataSources(): Promise<DataSourceConnectionSummary[]> {
    const res = await api.get<DataSourceConnectionSummary[]>("/datasources");
    return res.data;
  }

  export async function createDataSource(request: CreateDataSourceConnectionRequest): Promise<DataSourceConnectionSummary> {
    const res = await api.post<DataSourceConnectionSummary>("/datasources", request);
    return res.data;
  }

  export async function testDataSource(id: number): Promise<ConnectionTestResult> {
    const res = await api.post<ConnectionTestResult>(`/datasources/${id}/test`);
    return res.data;
  }
  ```
  `type DataSourceType = "SqlServer" | "RestApi"` matches the backend enum's serialized string form — `System.Text.Json`'s default enum serialization writes the member name, not the numeric value, for ASP.NET Core's default controller JSON options, so `"SqlServer"`/`"RestApi"` is what actually comes over the wire and what a `POST` body needs to send back.

- [ ] Step 2: Create (or replace the Task 8 placeholder at) `frontend/src/pages/DataSourcesPage.tsx`:
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
  import {
    createDataSource,
    getDataSources,
    testDataSource,
    type ConnectionTestResult,
    type DataSourceConnectionSummary,
    type DataSourceType,
  } from "../api/datasources";

  function DataSourcesPage() {
    const [connections, setConnections] = useState<DataSourceConnectionSummary[]>([]);
    const [name, setName] = useState("");
    const [type, setType] = useState<DataSourceType>("SqlServer");
    const [host, setHost] = useState("");
    const [databaseName, setDatabaseName] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<number, ConnectionTestResult>>({});

    async function refresh() {
      setConnections(await getDataSources());
    }

    useEffect(() => {
      refresh().catch(() => setError("Could not load data sources — is the backend running on :5198?"));
    }, []);

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      try {
        const credentialsJson =
          type === "SqlServer" ? JSON.stringify({ username, password }) : JSON.stringify({ token: password });

        await createDataSource({
          name,
          type,
          host,
          databaseName: type === "SqlServer" ? databaseName : null,
          credentialsJson,
        });

        setName("");
        setHost("");
        setDatabaseName("");
        setUsername("");
        setPassword("");
        await refresh();
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 400) {
          setError(typeof err.response.data === "string" ? err.response.data : "Invalid input.");
        } else {
          setError("Something went wrong talking to the backend.");
        }
      }
    }

    async function handleTest(id: number) {
      const result = await testDataSource(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
    }

    return (
      <Container maxWidth="md" sx={{ py: 4 }}>
        <Typography variant="h4" gutterBottom>Data Sources</Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 3 }}>
          <TextField label="Name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField
            select
            label="Type"
            size="small"
            value={type}
            onChange={(e) => setType(e.target.value as DataSourceType)}
            sx={{ minWidth: 140 }}
          >
            <MenuItem value="SqlServer">SQL Server</MenuItem>
            <MenuItem value="RestApi">REST API</MenuItem>
          </TextField>
          <TextField
            label={type === "SqlServer" ? "Host" : "URL"}
            size="small"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            sx={{ flexGrow: 1 }}
          />
          {type === "SqlServer" && (
            <TextField
              label="Database Name"
              size="small"
              value={databaseName}
              onChange={(e) => setDatabaseName(e.target.value)}
            />
          )}
          {type === "SqlServer" ? (
            <>
              <TextField label="Username" size="small" value={username} onChange={(e) => setUsername(e.target.value)} />
              <TextField
                label="Password"
                type="password"
                size="small"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </>
          ) : (
            <TextField
              label="API Token"
              type="password"
              size="small"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          <Button type="submit" variant="contained">Add</Button>
        </Box>
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Host</TableCell>
                <TableCell>Test</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {connections.map((c) => {
                const result = testResults[c.id];
                return (
                  <TableRow key={c.id}>
                    <TableCell>{c.name}</TableCell>
                    <TableCell>{c.type}</TableCell>
                    <TableCell>{c.host}</TableCell>
                    <TableCell>
                      <Button size="small" variant="outlined" onClick={() => handleTest(c.id)}>
                        Test
                      </Button>
                      {result && (
                        <Typography
                          component="span"
                          sx={{ ml: 1 }}
                          color={result.success ? "success.main" : "error.main"}
                        >
                          {result.success ? "OK" : result.errorMessage ?? "Failed"}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Container>
    );
  }

  export default DataSourcesPage;
  ```
  Credential-field note: the design says "credential fields appropriate to the selected type" without nailing down the REST shape further than "some JSON" (same as the design doc's own hedge on the backend side) — this form sends `{"token": "..."}` for REST API and `{"username": "...", "password": "..."}` for SQL Server. The REST shape is a single field either way for this milestone (this project only tests REST discovery against unauthenticated public endpoints in Task 7, so the exact key name isn't load-bearing yet) — call it `token` here for concreteness, matching the design doc's own example phrasing ("bearer token or an API key header/value pair"). If a later milestone needs a real REST auth story, this is the field that gets revisited, not a new one bolted on.

  Table never renders `EncryptedCredentials` — it isn't even in `DataSourceConnectionSummary`, so there's nothing to accidentally display; this is the frontend half of the same guarantee Task 5's test enforces on the backend.

- [ ] Step 3: From `frontend/`, run:
  ```
  npm run build
  ```
  Expected: clean compile.

- [ ] Step 4: End-to-end check, two terminals from the repo root:
  - `dotnet run --project backend --launch-profile http`
  - `cd frontend && npm run dev`

  Open `http://localhost:5173` and verify:
  - Top nav shows "Reports" and "Data Sources" tabs; `/reports` still works exactly as before.
  - Switch to Data Sources — the table starts empty (or shows whatever Task 7's manual smoke test left behind, if that database wasn't reset).
  - Add a SQL Server connection (Name, Host `localhost\SQLEXPRESS`, Database Name `OpenReportingPlatform`, a real username/password) — it appears in the table with no credentials visible anywhere.
  - Click Test on that row — "OK" appears inline.
  - Switch Type to REST API in the form — Database Name field disappears, Host field's label changes to "URL", username/password become a single "API Token" field. Add one pointing at a real public JSON endpoint, click Test, confirm "OK" shows.
  - Reload the page — both connections persist (real database, not in-memory).

- [ ] Step 5: Commit:
  ```
  git add -A
  git commit -m "frontend: data sources page — list, add form, per-row test button"
  ```

---

## Self-review — design coverage and signature consistency

- Entity shape (`Id`, `Name`, `Type`, `Host`, `DatabaseName?`, `EncryptedCredentials`, `CreatedAtUtc`) — defined once in Task 1, consumed identically by `SqlServerProvider`/`RestApiProvider` (Tasks 3-4, via the `DataSourceConnection` parameter on both interface methods), `DataSourceService` (Task 5, reads every field, writes every field except `Id` which EF generates), and `DataSourcesController`/frontend (Tasks 6, 8-9, via `DataSourceConnectionSummary`, the credential-free projection). No field renamed or retyped between tasks.
- `IDataSourceProvider`'s two methods — `TestConnectionAsync(DataSourceConnection)` and `DiscoverSchemaAsync(DataSourceConnection)` — declared once in Task 2, implemented with matching signatures by both `SqlServerProvider` (Task 3) and `RestApiProvider` (Task 4), called with matching signatures by `DataSourceService` (Task 5). No drift.
- `ConnectionTestResult`/`SchemaDescriptor`/`TableDescriptor`/`FieldDescriptor` — defined once in Task 2, exact shape from the approved design, used unchanged through providers, service, and controller, and mirrored field-for-field in the frontend's `ConnectionTestResult` TypeScript interface (Task 9).
- Credential encryption — `ICredentialProtector`/`CredentialProtector` (Task 2, purpose string `"DataSourceCredentials"` exactly as specified) is the *only* thing that ever calls `Protect`/`Unprotect`, and that's true by construction, not just convention: `DataSourceService` (Task 5) is the only class in this whole plan that takes an `ICredentialProtector` dependency. Both providers are deliberately shaped to never see it — `SqlServerProvider` (Task 3) takes a parameterless constructor and reads `connection.EncryptedCredentials` as already-decrypted plaintext JSON; `RestApiProvider` (Task 4) never deals with credentials at all in this milestone. `DataSourceService.WithDecryptedCredentials` (Task 5) is the one seam where decryption happens — it builds a transient, never-persisted copy of the connection with the plaintext swapped in, and passes *that* to the provider, so the real encrypted row in the database is never mutated and no provider ever holds an `ICredentialProtector` reference. This matches the design's "providers receive already-decrypted credentials, they don't touch `IDataProtector` themselves" rule exactly, including through the awkward-but-necessary detail that the transient copy still uses the `EncryptedCredentials` property name to carry plaintext — that's a naming wart worth living with rather than adding a second field to `DataSourceConnection` (or a parallel provider-facing type) just for this.
- `EncryptedCredentials`-never-leaks rule — enforced testably in two places, not just prose: `DataSourceServiceTests.ListAsync_NeverExposesEncryptedCredentials` (Task 5) reflects over `DataSourceConnectionSummary`'s properties and asserts the field doesn't exist on the type at all; Task 7 Step 8/13 re-confirms it against the real running API over real HTTP.
- Controller routes (`GET /api/datasources`, `POST /api/datasources`, `POST /api/datasources/{id}/test`, `GET /api/datasources/{id}/schema`) — declared in Task 6, exercised in Task 7's manual smoke test, consumed with matching paths in Task 9's `frontend/src/api/datasources.ts`.
- Frontend routing — `/reports` and `/datasources` declared in Task 8, both exercised in Task 9's end-to-end check; `/reports`'s existing behavior (list, add, blank-name 400 handling) is untouched, just relocated.

That's the milestone. Actually running a query against a discovered schema and getting rows back, the Dataset/query-pipeline concept the designer vision doc gestures at, is still out of scope — that's the next one.
