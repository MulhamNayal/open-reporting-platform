# Milestone 1 — a real database

Goal: swap the in-memory report list for a real SQL Server database via EF Core. Same `IReportRepository` interface, same controller, nothing above the repository layer changes. This unblocks everything that comes after it (data sources, the designer) since they all assume real persistence exists.

Using the SQL Server Express instance already installed and running on this machine (`localhost\SQLEXPRESS`) — no new install needed, no Docker, nothing extra to set up.

## What changes

- `Backend/Data/ReportingDbContext.cs` — `DbSet<Report> Reports`. The 3 sample reports get seeded via `HasData` in `OnModelCreating` instead of in a constructor like before, so the seed data is migration-tracked.
- `Report` becomes an EF Core entity. It stays a record — EF Core 8 handles that fine, and `Id` is picked up as the key by convention, no attributes needed.
- `Backend/Services/EfReportRepository.cs` — implements `IReportRepository` using `ReportingDbContext`. `GetAll()` → `_context.Reports.ToList()`. `Add()` → `_context.Reports.Add(...)` then `SaveChanges()`.
- `InMemoryReportRepository.cs` and its tests are gone. Repository tests move to EF Core's InMemory provider instead — still fast, still no real DB needed for tests, but now exercising real EF Core query/save behavior instead of a hand-rolled fake.
- DI lifetime changes: the repository was Singleton before, only because the in-memory list needed to survive across requests. Now that the database is the source of truth, both `ReportingDbContext` and `EfReportRepository` become **Scoped** — the normal pattern for EF Core in a web API. (A DbContext isn't safe to share across concurrent requests, which is exactly why Singleton doesn't work anymore.)
- Connection string in `appsettings.Development.json`: `Server=localhost\SQLEXPRESS;Database=OpenReportingPlatform;Trusted Connection=True;TrustServerCertificate=True`. No username/password (Windows Integrated auth), so it's fine to commit as-is — nothing secret in it.
- Schema comes from `dotnet ef migrations add InitialCreate`, applied manually with `dotnet ef database update` — not run automatically on startup. Schema changes should always be a deliberate step, not something that happens silently when the app starts.

## Not doing

No connection pooling tuning, no retry-on-failure policies, no multiple environments beyond Development — none of that matters yet for a single local database.
