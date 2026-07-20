# Milestone 1 Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to run this task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Swap the in-memory report list for a real SQL Server database via EF Core — same `IReportRepository` contract, same controller, nothing above the repository layer changes.

**Architecture:** `ReportsController → IReportRepository → EfReportRepository → ReportingDbContext → SQL Server Express (localhost\SQLEXPRESS)`. Schema is code-first via EF Core migrations, applied manually (never on startup). Repository and DbContext both go from Singleton-forever to Scoped-per-request.

**Tech Stack:** .NET 8, EF Core 8 (SqlServer provider for real usage, InMemory provider for tests), xUnit, SQL Server Express (local, Windows auth).

## Global Constraints

- Package versions pinned to `8.0.11` everywhere — `Microsoft.EntityFrameworkCore.SqlServer`, `Microsoft.EntityFrameworkCore.Design`, `Microsoft.EntityFrameworkCore.InMemory`, and the `dotnet-ef` global tool. Keeping these in lockstep avoids the "tool version doesn't match runtime version" warning/failure class entirely. If `8.0.11` has been unlisted from NuGet by the time you run this, check nuget.org for the newest `8.0.x` patch and use that same number in all four places — don't mix patch versions.
- No new install, no Docker — this all runs against the SQL Server Express instance already on this machine at `localhost\SQLEXPRESS`, Windows Integrated auth (`Trusted Connection=True`).
- All commands below run from the repo root `C:\Users\Mulham\source\repos\open-reporting-platform` unless a step says otherwise. Shell is PowerShell.
- Namespace/casing stays `Backend.*` (capital B) everywhere, matching `Backend.csproj`/`Backend.Tests.csproj`. CI builds on `ubuntu-latest` (case-sensitive filesystem) — a casing slip that works locally will fail there.
- Multiple .NET SDKs are installed on this machine with no `global.json` pin. This plan doesn't run `dotnet new` for anything, so the risk is lower, but every task that touches a `.csproj` includes an explicit check that `<TargetFramework>net8.0</TargetFramework>` didn't move.
- Not doing this milestone: connection pooling tuning, retry policies, any environment beyond Development (no staging/prod connection string — this is a local personal project). CI (`.github/workflows/ci.yml`) only builds/tests `Backend.Tests.csproj` and never touches SQL Server, so it needs zero changes — the new tests run entirely against the EF Core InMemory provider.
- **Deviation from the approved design, found while reading the actual code (flagging per the "stop and flag contradictions" rule rather than silently working around it):** the design doc says `Backend.Tests/ReportsControllerTests.cs` is "unchanged... not tied to the storage implementation." That's not true of the file as it exists today — all four tests do `new ReportsController(new InMemoryReportRepository())` directly, with no mock. Since `InMemoryReportRepository` gets deleted in Task 3, this file would stop compiling if left untouched. Task 3 makes the smallest possible fix: swap the four `new InMemoryReportRepository()` call sites for a tiny local helper that builds an `EfReportRepository` over a fresh EF Core InMemory-provider context. No assertions change, no test intent changes — it's purely a constructor-source swap forced by the deletion, not a redesign of the test file.

---

### Task 1: EF Core packages + `ReportingDbContext`

**Files:**
- Modify: `backend/Backend.csproj`
- Create: `backend/Data/ReportingDbContext.cs`

**Interfaces:**
- Consumes: `Backend.Models.Report` — the existing `public record Report(int Id, string Name, string Description);` in `backend/Models/Report.cs`. **No changes to this file** — EF Core 8 materializes positional records straight through their primary constructor, and `Id` is picked up as the primary key by the standard "property named Id" convention. Don't touch it; if you're tempted to add attributes or a parameterless constructor, don't — it already works as-is.
- Produces: `Backend.Data.ReportingDbContext`, constructor `ReportingDbContext(DbContextOptions<ReportingDbContext> options)`, property `DbSet<Report> Reports`. Every later task (repository, DI wiring, migrations, tests) depends on this exact type name, namespace, and constructor signature — don't change the shape once Task 2 starts consuming it.

- [ ] Step 1: Add the SQL Server provider package to the backend project:
  ```
  dotnet add backend/Backend.csproj package Microsoft.EntityFrameworkCore.SqlServer --version 8.0.11
  ```
  Expected output ends with something like:
  ```
  info : PackageReference for package 'Microsoft.EntityFrameworkCore.SqlServer' version '8.0.11' added to file 'backend\Backend.csproj'.
  ```

- [ ] Step 2: Add the design-time package (needed later for `dotnet ef migrations` in Task 4 — the migrations tooling needs this referenced in the project that hosts the `DbContext`):
  ```
  dotnet add backend/Backend.csproj package Microsoft.EntityFrameworkCore.Design --version 8.0.11
  ```
  This package sets `developmentDependency=true` in its own nuspec, so the CLI automatically writes it with `PrivateAssets`/`IncludeAssets` restrictions — you don't add those by hand. The resulting entry in `backend/Backend.csproj` looks like:
  ```xml
  <PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="8.0.11">
    <PrivateAssets>all</PrivateAssets>
    <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
  </PackageReference>
  ```

- [ ] Step 3: Open `backend/Backend.csproj` and confirm `<TargetFramework>net8.0</TargetFramework>` is still there, untouched, alongside the two new `<PackageReference>` lines. Full expected file:
  ```xml
  <Project Sdk="Microsoft.NET.Sdk.Web">

    <PropertyGroup>
      <TargetFramework>net8.0</TargetFramework>
      <Nullable>enable</Nullable>
      <ImplicitUsings>enable</ImplicitUsings>
    </PropertyGroup>

    <ItemGroup>
      <PackageReference Include="Microsoft.EntityFrameworkCore.Design" Version="8.0.11">
        <PrivateAssets>all</PrivateAssets>
        <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
      </PackageReference>
      <PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer" Version="8.0.11" />
      <PackageReference Include="Swashbuckle.AspNetCore" Version="6.6.2" />
    </ItemGroup>

  </Project>
  ```
  (NuGet may alphabetize/order the `<PackageReference>` lines slightly differently — that's fine, just confirm all three packages are present and the `TargetFramework` line is untouched.)

- [ ] Step 4: Create `backend/Data/ReportingDbContext.cs`:
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
  Same 3 reports, same Ids, as the old `InMemoryReportRepository` constructor seed — this replaces that seeding, migration-tracked instead of hardcoded in a constructor.

- [ ] Step 5: Build to confirm it compiles (nothing consumes `ReportingDbContext` yet, so this is just a compile check):
  ```
  dotnet build backend/Backend.csproj
  ```
  Expected: `Build succeeded.` with 0 errors.

- [ ] Step 6: Commit:
  ```
  git add backend/Backend.csproj backend/Data/ReportingDbContext.cs
  git commit -m "backend: add EF Core packages and ReportingDbContext with seeded reports"
  ```

---

### Task 2: `EfReportRepository` (TDD against EF Core InMemory provider)

**Files:**
- Modify: `Backend.Tests/Backend.Tests.csproj`
- Create: `Backend.Tests/EfReportRepositoryTests.cs`
- Create: `backend/Services/EfReportRepository.cs`

**Interfaces:**
- Consumes: `Backend.Data.ReportingDbContext` from Task 1 (constructor `ReportingDbContext(DbContextOptions<ReportingDbContext> options)`, `DbSet<Report> Reports`); `Backend.Services.IReportRepository` (unchanged, already exists: `IReadOnlyList<Report> GetAll()`, `Report Add(string name, string description)`).
- Produces: `Backend.Services.EfReportRepository : IReportRepository`, constructor `EfReportRepository(ReportingDbContext context)`. Task 3's DI registration and the `ReportsControllerTests.cs` fix both depend on this exact constructor shape — one required parameter, the context, nothing else.

This task doesn't touch `Program.cs`, doesn't delete `InMemoryReportRepository.cs`, and doesn't touch `ReportsControllerTests.cs`. It's purely additive — the solution still builds and the old repository is still wired up and still has its own passing tests until Task 3 does the swap-over. Keeping it additive-only here means the build stays green at the end of this task without needing to touch three files that logically belong to the "retire the old repo" step.

- [ ] Step 1: Add the EF Core InMemory provider to the test project (needed to exercise real EF Core query/save behavior without a real SQL Server):
  ```
  dotnet add Backend.Tests/Backend.Tests.csproj package Microsoft.EntityFrameworkCore.InMemory --version 8.0.11
  ```
  Confirm `<TargetFramework>net8.0</TargetFramework>` in `Backend.Tests/Backend.Tests.csproj` is still there afterward — same SDK-drift check as Task 1.

- [ ] Step 2: Write the failing tests — `Backend.Tests/EfReportRepositoryTests.cs`:
  ```csharp
  using Backend.Data;
  using Backend.Services;
  using Microsoft.EntityFrameworkCore;

  namespace Backend.Tests;

  public class EfReportRepositoryTests
  {
      private static ReportingDbContext CreateContext(string databaseName)
      {
          var options = new DbContextOptionsBuilder<ReportingDbContext>()
              .UseInMemoryDatabase(databaseName)
              .Options;

          var context = new ReportingDbContext(options);
          context.Database.EnsureCreated();
          return context;
      }

      [Fact]
      public void GetAll_ReturnsSeededReports()
      {
          using var context = CreateContext(Guid.NewGuid().ToString());
          var repository = new EfReportRepository(context);

          var reports = repository.GetAll();

          Assert.Equal(3, reports.Count);
          Assert.Contains(reports, r => r.Name == "Monthly Sales");
      }

      [Fact]
      public void Add_ReturnsReportWithGeneratedId()
      {
          using var context = CreateContext(Guid.NewGuid().ToString());
          var repository = new EfReportRepository(context);

          var report = repository.Add("Churn", "Customers lost per quarter");

          Assert.True(report.Id > 0);
          Assert.Equal("Churn", report.Name);
          Assert.Equal("Customers lost per quarter", report.Description);
      }

      [Fact]
      public void Add_ThenGetAll_FromANewContextInstance_SeesThePersistedRow()
      {
          var databaseName = Guid.NewGuid().ToString();

          using (var writeContext = CreateContext(databaseName))
          {
              new EfReportRepository(writeContext).Add("Churn", "Customers lost per quarter");
          }

          var options = new DbContextOptionsBuilder<ReportingDbContext>()
              .UseInMemoryDatabase(databaseName)
              .Options;
          using var readContext = new ReportingDbContext(options);
          var reports = new EfReportRepository(readContext).GetAll();

          Assert.Equal(4, reports.Count);
          Assert.Contains(reports, r => r.Name == "Churn");
      }
  }
  ```
  The third test is the important one — it proves `Add()` actually calls `SaveChanges()` (a brand new `DbContext` instance, same InMemory database name, sees the row), which is exactly the behavior the old hand-rolled fake couldn't verify.

- [ ] Step 3: Run the tests to confirm they fail (compile error — `EfReportRepository` doesn't exist yet):
  ```
  dotnet test Backend.Tests
  ```
  Expected: build failure, `error CS0246: The type or namespace name 'EfReportRepository' could not be found`. That's the red.

- [ ] Step 4: Implement `backend/Services/EfReportRepository.cs`:
  ```csharp
  using Backend.Data;
  using Backend.Models;

  namespace Backend.Services;

  public class EfReportRepository : IReportRepository
  {
      private readonly ReportingDbContext _context;

      public EfReportRepository(ReportingDbContext context)
      {
          _context = context;
      }

      public IReadOnlyList<Report> GetAll()
      {
          return _context.Reports.ToList();
      }

      public Report Add(string name, string description)
      {
          var report = new Report(0, name, description);
          _context.Reports.Add(report);
          _context.SaveChanges();
          return report;
      }
  }
  ```
  Note on the `Id: 0` in `Add()` — `Id` is an `int` primary key, so by convention EF Core configures it `ValueGeneratedOnAdd`. Passing the CLR default (`0`) is exactly what tells EF "generate this one." After `SaveChanges()`, EF writes the real generated value back onto the same `report` object (it does this via the backing field, bypassing the record's `init`-only accessor — this is standard, documented EF Core behavior for records used as entities), so the `Report` you return already has the correct `Id`.

- [ ] Step 5: Run the tests again to confirm they pass:
  ```
  dotnet test Backend.Tests
  ```
  Expected: all pass, including the pre-existing 7 from Milestone 0 (unaffected — this task hasn't touched `InMemoryReportRepository` or `ReportsController` yet).

- [ ] Step 6: Commit:
  ```
  git add Backend.Tests/Backend.Tests.csproj Backend.Tests/EfReportRepositoryTests.cs backend/Services/EfReportRepository.cs
  git commit -m "backend: add EfReportRepository, tested against the EF Core InMemory provider"
  ```

---

### Task 3: Swap DI to EF Core, retire the in-memory repository

**Files:**
- Modify: `backend/Program.cs`
- Modify: `backend/appsettings.Development.json`
- Modify: `Backend.Tests/ReportsControllerTests.cs` (the flagged deviation — see Global Constraints)
- Delete: `backend/Services/InMemoryReportRepository.cs`
- Delete: `Backend.Tests/InMemoryReportRepositoryTests.cs`

**Interfaces:**
- Consumes: `Backend.Data.ReportingDbContext` (Task 1), `Backend.Services.EfReportRepository` (Task 2, constructor `EfReportRepository(ReportingDbContext context)`).
- Produces: nothing new for later tasks to consume — this is the cutover. After this task, `IReportRepository` in the running app and in every test resolves to `EfReportRepository` backed by EF Core, never `InMemoryReportRepository` (which no longer exists).

This is done in an order that keeps every intermediate step's *purpose* clear even though the build only goes green again at the very end of the task (that's expected — a "retire this class" task isn't independently TDD-able the way new logic is, there's no new behavior to red/green, just a controlled deletion):

- [ ] Step 1: Fix `Backend.Tests/ReportsControllerTests.cs` first, before deleting anything, so it stops depending on `InMemoryReportRepository`. Replace the whole file with:
  ```csharp
  using Backend.Controllers;
  using Backend.Data;
  using Backend.Models;
  using Backend.Services;
  using Microsoft.AspNetCore.Mvc;
  using Microsoft.EntityFrameworkCore;

  namespace Backend.Tests;

  public class ReportsControllerTests
  {
      private static IReportRepository CreateSeededRepository()
      {
          var options = new DbContextOptionsBuilder<ReportingDbContext>()
              .UseInMemoryDatabase(Guid.NewGuid().ToString())
              .Options;

          var context = new ReportingDbContext(options);
          context.Database.EnsureCreated();
          return new EfReportRepository(context);
      }

      [Fact]
      public void GetAll_ReturnsOkWithSeededReports()
      {
          var controller = new ReportsController(CreateSeededRepository());

          var result = controller.GetAll();

          var ok = Assert.IsType<OkObjectResult>(result.Result);
          var reports = Assert.IsAssignableFrom<IEnumerable<Report>>(ok.Value);
          Assert.NotEmpty(reports);
      }

      [Fact]
      public void Create_BlankName_Returns400()
      {
          var controller = new ReportsController(CreateSeededRepository());

          var result = controller.Create(new CreateReportRequest("   ", "whatever"));

          Assert.IsType<BadRequestObjectResult>(result.Result);
      }

      [Fact]
      public void Create_NullName_Returns400()
      {
          var controller = new ReportsController(CreateSeededRepository());

          var result = controller.Create(new CreateReportRequest(null, null));

          Assert.IsType<BadRequestObjectResult>(result.Result);
      }

      [Fact]
      public void Create_ValidInput_Returns201WithTheReport()
      {
          var repo = CreateSeededRepository();
          var controller = new ReportsController(repo);

          var result = controller.Create(new CreateReportRequest("Churn", "Customers lost per quarter"));

          var created = Assert.IsType<CreatedResult>(result.Result);
          var report = Assert.IsType<Report>(created.Value);
          Assert.Equal("Churn", report.Name);
          Assert.Contains(repo.GetAll(), r => r.Id == report.Id);
      }
  }
  ```
  Every assertion is identical to the original — only the four `new InMemoryReportRepository()` call sites became `CreateSeededRepository()`, plus the helper and two new `using`s.

- [ ] Step 2: Delete the old repository test file:
  ```
  git rm Backend.Tests/InMemoryReportRepositoryTests.cs
  ```

- [ ] Step 3: Delete the old repository itself:
  ```
  git rm backend/Services/InMemoryReportRepository.cs
  ```

- [ ] Step 4: Add the connection string to `backend/appsettings.Development.json` (Windows Integrated auth, no username/password — safe to commit as-is):
  ```json
  {
    "Logging": {
      "LogLevel": {
        "Default": "Information",
        "Microsoft.AspNetCore": "Warning"
      }
    },
    "ConnectionStrings": {
      "ReportingDatabase": "Server=localhost\\SQLEXPRESS;Database=OpenReportingPlatform;Trusted Connection=True;TrustServerCertificate=True"
    }
  }
  ```
  (The double backslash is JSON escaping for the single `\` between `localhost` and `SQLEXPRESS` — the actual connection string value has one backslash.)

- [ ] Step 5: Update `backend/Program.cs` — remove the `AddSingleton<IReportRepository, InMemoryReportRepository>()` line, register `ReportingDbContext` and `EfReportRepository` instead:
  ```csharp
  using Backend.Data;
  using Backend.Services;
  using Microsoft.EntityFrameworkCore;

  var builder = WebApplication.CreateBuilder(args);

  builder.Services.AddControllers();
  builder.Services.AddEndpointsApiExplorer();
  builder.Services.AddSwaggerGen();

  builder.Services.AddDbContext<ReportingDbContext>(options =>
      options.UseSqlServer(builder.Configuration.GetConnectionString("ReportingDatabase")));
  builder.Services.AddScoped<IReportRepository, EfReportRepository>();

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
  Note: `AddDbContext<T>` registers the context as **Scoped** by default — that's already the lifetime the design calls for, no extra parameter needed. `AddScoped<IReportRepository, EfReportRepository>()` matches it, so a `DbContext` never gets shared across concurrent requests.

- [ ] Step 6: Build and run the full test suite:
  ```
  dotnet build backend/Backend.csproj
  dotnet test Backend.Tests
  ```
  Expected: both succeed, all tests pass (the original `ReportsControllerTests` 4 tests + the 3 new `EfReportRepositoryTests` = 7; the 3 old `InMemoryReportRepositoryTests` are gone since that file was deleted, replacing them 1-for-1 in intent with `EfReportRepositoryTests`).

- [ ] Step 7: Commit:
  ```
  git add -A
  git commit -m "backend: wire EfReportRepository into DI as Scoped, retire InMemoryReportRepository"
  ```

---

### Task 4: Migration, real database, and proof it survives a restart

**Files:**
- Create: `backend/Migrations/*_InitialCreate.cs` (and its `.Designer.cs` + `ReportingDbContextModelSnapshot.cs` companions, generated by the tool)

**Interfaces:**
- Consumes: `Backend.Data.ReportingDbContext` (Task 1), the wired-up DI from Task 3, the connection string in `backend/appsettings.Development.json`.
- Produces: nothing further downstream — this is the last task in the milestone. The actual output that matters is the `OpenReportingPlatform` database on `localhost\SQLEXPRESS` with a `Reports` table and 3 seeded rows.

- [ ] Step 1: Check whether `dotnet-ef` is already installed as a global tool:
  ```
  dotnet tool list --global
  ```
  Look for a line containing `dotnet-ef`.

- [ ] Step 2: Install it if missing, or update it to match the package version pin if it's there but different:
  ```
  dotnet tool install --global dotnet-ef --version 8.0.11
  ```
  If Step 1 showed `dotnet-ef` already present at a different version, use `dotnet tool update` instead:
  ```
  dotnet tool update --global dotnet-ef --version 8.0.11
  ```

- [ ] Step 3: Verify it's actually on PATH and at the right version:
  ```
  dotnet ef --version
  ```
  Expected output contains `Entity Framework Core .NET Command-line Tools 8.0.11`. If PowerShell says `dotnet-ef` (or the `ef` verb) isn't recognized, the global tools folder isn't on PATH — fix it and reopen the terminal:
  ```
  setx PATH "$env:PATH;$env:USERPROFILE\.dotnet\tools"
  ```
  Close and reopen the terminal, then re-run `dotnet ef --version` to confirm.

- [ ] Step 4: Set the environment for this terminal session before running any `dotnet ef` command. This matters because `dotnet ef` runs the app's own startup code at design time to discover the `DbContext`, and by default that runs with `ASPNETCORE_ENVIRONMENT` unset (defaults to Production) — meaning `appsettings.Development.json`, where the connection string lives, wouldn't get loaded, and `UseSqlServer(null)` would throw `ArgumentNullException: Value cannot be null. (Parameter 'connectionString')`. Set it explicitly:
  ```
  $env:ASPNETCORE_ENVIRONMENT = "Development"
  ```
  This only lasts for the current terminal session — if you open a new terminal for a later step, set it again first.

- [ ] Step 5: Generate the migration:
  ```
  dotnet ef migrations add InitialCreate --project backend/Backend.csproj --startup-project backend/Backend.csproj
  ```
  Expected: ends with `Done.`, and creates three files under `backend/Migrations/`:
  - `{timestamp}_InitialCreate.cs`
  - `{timestamp}_InitialCreate.Designer.cs`
  - `ReportingDbContextModelSnapshot.cs`

  If this fails with `Unable to create an object of type 'ReportingDbContext'. ...` (the minimal-hosting auto-detection occasionally needs a hand for edge-case project shapes), add a design-time factory as a fallback — `backend/Data/ReportingDbContextFactory.cs`:
  ```csharp
  using Microsoft.EntityFrameworkCore;
  using Microsoft.EntityFrameworkCore.Design;
  using Microsoft.Extensions.Configuration;

  namespace Backend.Data;

  public class ReportingDbContextFactory : IDesignTimeDbContextFactory<ReportingDbContext>
  {
      public ReportingDbContext CreateDbContext(string[] args)
      {
          var configuration = new ConfigurationBuilder()
              .SetBasePath(Directory.GetCurrentDirectory())
              .AddJsonFile("appsettings.json")
              .AddJsonFile("appsettings.Development.json", optional: true)
              .Build();

          var optionsBuilder = new DbContextOptionsBuilder<ReportingDbContext>();
          optionsBuilder.UseSqlServer(configuration.GetConnectionString("ReportingDatabase"));

          return new ReportingDbContext(optionsBuilder.Options);
      }
  }
  ```
  Then re-run Step 5's command. Only add this file if Step 5 actually fails without it — don't add it speculatively.

- [ ] Step 6: Open the generated `backend/Migrations/{timestamp}_InitialCreate.cs` and confirm the `Up()` method has a `migrationBuilder.CreateTable(name: "Reports", ...)` call and a `migrationBuilder.InsertData(table: "Reports", ...)` call seeding the 3 rows with `Id` values `1`, `2`, `3`. No edits needed — just confirm it's there.

- [ ] Step 7: Apply the migration to the real SQL Server Express instance (this creates the `OpenReportingPlatform` database if it doesn't exist yet):
  ```
  dotnet ef database update --project backend/Backend.csproj --startup-project backend/Backend.csproj
  ```
  Expected: ends with `Done.`, no errors.

- [ ] Step 8: Verify directly against the database with `sqlcmd`:
  ```
  sqlcmd -S "localhost\SQLEXPRESS" -E -Q "SELECT Id, Name FROM OpenReportingPlatform.dbo.Reports ORDER BY Id"
  ```
  Expected: 3 rows — `Monthly Sales`, `Top Agents`, `Pipeline Overview`.

- [ ] Step 9: This is the actual point of the whole milestone — prove data survives a process restart, which it never did with the old `Singleton` in-memory repo. In one terminal, start the app on the `http` profile (pinned to port 5198 in `launchSettings.json`):
  ```
  dotnet run --project backend --launch-profile http
  ```
  Confirm it logs listening on `http://localhost:5198`.

- [ ] Step 10: In a second terminal, confirm the 3 seeded reports come back over HTTP:
  ```
  curl.exe http://localhost:5198/api/reports
  ```
  Expected: a JSON array with the 3 seeded reports.

- [ ] Step 11: POST a new one:
  ```
  curl.exe -X POST http://localhost:5198/api/reports -H "Content-Type: application/json" -d "{\"name\":\"Smoke Test Report\",\"description\":\"proves real db\"}"
  ```
  Expected: `201 Created` with a body showing `"id":4,"name":"Smoke Test Report","description":"proves real db"`.

- [ ] Step 12: Stop the app (`Ctrl+C` in the first terminal), then start it again:
  ```
  dotnet run --project backend --launch-profile http
  ```

- [ ] Step 13: GET again from the second terminal:
  ```
  curl.exe http://localhost:5198/api/reports
  ```
  Expected: **4** reports now, including `Smoke Test Report` — it survived the restart. That's the whole milestone proven: this data is not living in process memory anymore.

- [ ] Step 14: Commit the migration files (the app code was already committed in Task 3):
  ```
  git add backend/Migrations
  git commit -m "backend: add InitialCreate migration for the Reports table"
  ```

---

That's the milestone. `docs/superpowers/plans/2026-07-19-milestone-0-hello-full-stack.md` already covers the frontend and the basic API — this plan only touches the storage layer beneath `IReportRepository`. Auth, the drag-and-drop designer, and anything beyond a single Development environment are still out of scope — resist the urge.
