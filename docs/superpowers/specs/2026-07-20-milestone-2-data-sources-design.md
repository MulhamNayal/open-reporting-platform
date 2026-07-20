# Milestone 2 — data sources

Goal: a pluggable data-source abstraction — register a connection to something (a SQL Server database, a REST API), test that it works, and see what shape of data lives behind it. This is the "opaque dependency" `Dataset`/data-source concept the designer vision doc (`2026-07-20-report-designer-vision-design.md`) waves at without defining — this milestone is where it actually gets defined. Not the whole path to a working designer, just the first real step: register → test → discover schema. Running an actual query against a data source and getting rows back is a later Dataset/query-pipeline milestone, not this one.

Heads up going in: this one's a lot bigger than Milestone 0 or 1. Full provider abstraction, credential encryption, two provider implementations, a new frontend page, and routing shows up in this project for the first time — all in one milestone. The implementation plan that follows this doc is going to have noticeably more tasks than the last two did. That's expected, not scope creep that snuck in.

## How it fits together

```
React (frontend/)
  /reports       →  existing Reports page, unchanged, just moved under a route
  /datasources   →  new page: list + add form + per-row Test button
   │  GET  /api/datasources            →  list (no credentials in the response)
   │  POST /api/datasources            →  create
   │  POST /api/datasources/{id}/test  →  test connection
   │  GET  /api/datasources/{id}/schema →  discovered tables/fields
   ▼
ASP.NET Core (backend/)
  DataSourcesController → IDataSourceService → IDataSourceProvider (SqlServer | RestApi) → ReportingDbContext
```

Same `ReportingDbContext`, same SQL Server database Milestone 1 already set up — no second connection string, no second database. `DataSourceConnection` is just a new `DbSet` alongside `Reports`.

## Backend

### Entity

`DataSourceConnection`:

- `Id (int)`
- `Name (string)`
- `Type (enum: SqlServer, RestApi)`
- `Host (string)` — for `SqlServer` this is the server host; for `RestApi` this field holds the *full URL*, there's no separate URL field
- `DatabaseName (string, nullable)` — only meaningful for `SqlServer`, null for `RestApi`
- `EncryptedCredentials (string)` — one opaque encrypted blob, see below
- `CreatedAtUtc (DateTime)`

Added as `DbSet<DataSourceConnection> DataSourceConnections` on the existing `ReportingDbContext`. New EF Core migration, same as any schema change from here — nothing automatic on startup.

### Provider abstraction

```csharp
public interface IDataSourceProvider
{
    Task<ConnectionTestResult> TestConnectionAsync(DataSourceConnection connection);
    Task<SchemaDescriptor> DiscoverSchemaAsync(DataSourceConnection connection);
}

public record ConnectionTestResult(bool Success, string? ErrorMessage);
public record SchemaDescriptor(IReadOnlyList<TableDescriptor> Tables);
public record TableDescriptor(string Name, IReadOnlyList<FieldDescriptor> Fields);
public record FieldDescriptor(string Name, string DataType);
```

Two implementations, resolved by `Type`:

- **`SqlServerProvider`** — opens a `SqlConnection` built from the connection's `Host` + `DatabaseName` + decrypted credentials. `TestConnectionAsync` just opens the connection and reports success/failure (catch the exception, put its message in `ErrorMessage`, don't let it bubble as an unhandled 500). `DiscoverSchemaAsync` queries `INFORMATION_SCHEMA.COLUMNS`, groups by table name, maps each row into a `FieldDescriptor`.
- **`RestApiProvider`** — `Host` IS the full URL for this type (no separate endpoint field). `TestConnectionAsync` does a GET and checks for a success status code. `DiscoverSchemaAsync` does the same GET, parses the JSON body, and infers fields from the first element if the response is a JSON array, or from the root object if it isn't. Field `DataType` here is just the inferred JSON value kind (string/number/bool/etc.) — nowhere near as precise as `INFORMATION_SCHEMA`, and that's fine, it's schema *discovery* not a real type system.

Provider resolution (`Type` → implementation) happens inside `IDataSourceService`, not the controller — the controller doesn't know providers exist.

### Credential encryption

Credentials are a small JSON blob before encryption — for `SqlServer` that's username/password, for `RestApi` it's something like a bearer token or an API key header/value pair. The exact shape isn't nailed down further than "some JSON" — it's encrypted at rest as a single opaque string either way, and nothing downstream needs to know the shape beyond "decrypt, then deserialize based on `Type`."

Encryption is ASP.NET Core's built-in `IDataProtector` — already part of `Microsoft.AspNetCore.App`, no new package. Purpose-string-scoped the conventional way (e.g. `"DataSourceCredentials"`), same pattern this kind of at-rest secret always uses in ASP.NET Core apps. `IDataSourceService` is the only thing that ever calls `Protect`/`Unprotect` — providers receive already-decrypted credentials, they don't touch `IDataProtector` themselves.

### Service layer

`IDataSourceService`:

- `CreateAsync` — encrypts the incoming credentials, persists the connection via `ReportingDbContext`.
- `TestAsync(id)` — loads the connection, resolves the right `IDataSourceProvider` by `Type`, delegates.
- `DiscoverSchemaAsync(id)` — same resolution, delegates.
- `ListAsync()` — returns all connections.

The one rule that matters here: **`EncryptedCredentials` never leaves this service.** `ListAsync` returns something that omits it entirely — not "trust the caller not to serialize it," an actual different shape. This isn't a nice-to-have, it's the whole point of encrypting the field in the first place — if the API just echoes it back in a list response, encryption at rest bought nothing.

### Controller

`DataSourcesController`, same thin-controller convention as `ReportsController`:

- `GET /api/datasources` — list; response DTO has no `EncryptedCredentials` field, full stop.
- `POST /api/datasources` — create.
- `POST /api/datasources/{id}/test` — returns the `ConnectionTestResult`.
- `GET /api/datasources/{id}/schema` — returns the `SchemaDescriptor`.

## Frontend

React Router shows up for the first time in this project. Milestone 0 deliberately skipped it — one page didn't need it. Two pages now, so it's actually needed:

- `/reports` — the existing Reports page, moved under this route, otherwise untouched.
- `/datasources` — new page.

A simple top nav — MUI `AppBar` with two tabs/links, "Reports" and "Data Sources" — so there's an actual way to get from one page to the other.

`/datasources` follows the same list+form pattern as the Reports page:

- A table listing existing connections: Name, Type, Host. Never shows credentials — there's nothing to show, the list endpoint doesn't return them.
- A form to add a connection: Name, Type (dropdown: SQL Server / REST API), Host, Database Name (only shown when Type is SQL Server), and credential fields appropriate to the selected type.
- A Test button per row that calls the test endpoint and shows pass/fail inline next to that row.

## Not doing

- No host-allowlist / "don't accidentally point this at a live production database" concept. That's a real thing in the work-project version of this idea, where a shared internal tool could get pointed at prod by mistake — there's no equivalent risk on a single-user personal project, so adding it here would just be unneeded complexity.
- No data source types beyond `SqlServer` and `RestApi`.
- No actually *querying* a discovered schema for real report data. This milestone stops at "register a connection, test it, see its schema" — running a query and getting rows back is the Dataset/query-pipeline milestone that comes after this one.
