# Milestone 3: Datasets — Design

## Overview

Milestone 2 delivered pluggable `DataSourceConnection`s (SqlServer, RestApi) that can be tested and schema-discovered, but never executed. This milestone adds the missing piece: a `Dataset` — a saved, named query against a registered connection — plus the ability to execute it and get back typed tabular rows. This is what the future Report Designer's chart widgets will eventually bind to via `CategoryField`/`ValueField`.

## Data Model: `Dataset`

```
Dataset
  Id
  DataSourceConnectionId   (FK -> DataSourceConnection)
  Name
  Mode          (enum: TableQuery | RawSql | StoredProcedure | RestQuery)
  Definition    (JSON blob, shape depends on Mode — see below)
  RowLimit      (nullable int; per-Dataset override of the default execution cap)
  CreatedAtUtc
```

`Mode` is a single discriminator across every Dataset row regardless of connection type — not a SqlServer-only field with an implicit special case for REST. `TableQuery`/`RawSql`/`StoredProcedure` are only valid for a `DataSourceConnection` of `Type == SqlServer`; `RestQuery` is only valid for `Type == RestApi`. The service layer enforces this pairing with a simple guard clause at Dataset-creation time (the same style as `DataSourcesController`'s existing blank Name/Host checks) — no separate validation framework needed for a two-provider system.

`Definition` varies by `Mode`:

- **TableQuery** → a `SelectQuery` object (below).
- **RawSql** → `{ SqlText: string }`.
- **StoredProcedure** → `{ RoutineName: string, Parameters: [{ Name, Value }] }` — values fixed at save time (see "Stored procedure parameters" below).
- **RestQuery** → `{ PathSuffix: string?, QueryParams: [{ Key, Value }] }`, appended to the connection's `Host`.

### `SelectQuery` (TableQuery mode only)

```
SelectQuery
  Table:    string
  Columns:  string[]
  Filters:  [{ Field, Operator, Value }]   // ANDed
  Sort:     { Field, Direction }?
  Top:      int?                            // user's intentional "top N" semantics
```

`Top` is a query-shaping choice the user makes deliberately (e.g. "top 10 highest-value deals"), distinct from `Dataset.RowLimit`, which is a safety cap enforced regardless of mode — see Row Limits.

## Provider Extension

`IDataSourceProvider` gains a third method alongside the existing `TestConnectionAsync` / `DiscoverSchemaAsync`:

```
Task<QueryResult> ExecuteQueryAsync(DataSourceConnection connection, Dataset dataset, CancellationToken ct)
```

Each provider (`SqlServerProvider`, `RestApiProvider`) translates its own `Dataset.Definition` into whatever it needs to run — T-SQL for SqlServer, an HTTP GET for RestApi — internally, hard-coded per dialect. No shared cross-dialect SQL abstraction exists or is built; if a Postgres provider is ever added, it implements the same `ExecuteQueryAsync` contract against the same `Dataset`/`SelectQuery` shape, translating to its own SQL. The provider interface itself is the only abstraction seam needed.

### `QueryResult` / `ColumnDescriptor`

```
QueryResult
  Columns: ColumnDescriptor[]
  Rows:    object?[][]        // each row's values positionally aligned to Columns

ColumnDescriptor
  Name:       string
  NativeType: string   // provider's own type name, verbatim — e.g. "nvarchar(50)",
                        // "int", "decimal(18,2)" for SqlServer; "string"/"number"/
                        // "boolean"/"object"/"array"/"null" for RestApi (already
                        // as granular as JSON gets — no change needed there)
```

No coarse type category (categorical/numeric/temporal) is stored anywhere. Collapsing `NativeType` to something a chart widget can use is a pure function called only at bind time by the future Report Designer — out of scope here, and deliberately not persisted, so this API doesn't need to change when that classification logic is designed later.

**Wire format:** rows serialize as plain JSON values. One deliberate exception: exact-precision SQL types (`decimal`, `numeric`, `money`) serialize as JSON **strings**, not JSON numbers, to avoid IEEE-754 precision loss — the frontend uses the column's `NativeType` to know to parse/format that string as a decimal. Everything else serializes as its natural JSON type.

## REST Dataset Shape

A `RestQuery` Dataset appends a path suffix and/or query parameters onto the connection's `Host` — never a fully independent URL. This mirrors the SQL Server side (connection = *where*, Dataset = *what specifically*) and means a Dataset can never redirect the connection's stored credentials to an unregistered host.

## Schema / Column Discovery Per Mode

- **TableQuery:** columns come straight from the connection's already-discovered schema (Milestone 2's `DiscoverSchemaAsync`), filtered to the selected table + columns. No new query needed.
- **RawSql:** wrap as `SELECT TOP 0 * FROM (<SqlText>) AS x` and read the resulting reader's schema metadata (name + `GetDataTypeName()`) without materializing rows. Known gotcha: SQL Server rejects a trailing `ORDER BY` inside a derived table unless paired with `TOP`/`OFFSET`. No auto-stripping of user SQL (too fragile) — catch that specific error and surface a clear message that column preview requires removing a trailing `ORDER BY` (execution itself is unaffected, since real execution runs the SQL text directly, not wrapped).
- **StoredProcedure:** no static-metadata shortcut is reliable enough (`sp_describe_first_result_set` breaks on temp tables/dynamic SQL/branching), so discovery runs the procedure once with its defined parameter values and reads the resulting reader's schema. This means proc discovery causes one real invocation — acceptable for a personal tool, worth being aware of for procs with side effects.
- **RestQuery:** unchanged from Milestone 2 (shape inferred from the JSON response), now invoked against the Dataset's full appended path/params rather than only the bare connection `Host`.

## Row Limits

Configurable per-Dataset (`Dataset.RowLimit`), with a sane system default applied when unset. Enforced server-side at execution regardless of mode:
- TableQuery: effective limit is `min(SelectQuery.Top, RowLimit)` if `Top` is set, else `RowLimit` acts as the effective `TOP`.
- RawSql / StoredProcedure: since user SQL can't be safely rewritten, the cap is enforced at the app layer by reading at most N rows from the `DataReader` and stopping — not by modifying the SQL text.
- RestQuery: cap applied by truncating the returned array to N items after the response is parsed.

## Caching

None. Every Dataset execution is live, on-demand. Grounded in Power BI's own model: Import mode brings the caching/refresh-schedule complexity (staleness rules, refresh triggers, a gateway concept), while DirectQuery mode executes live against the source on every visual interaction — this project has no scheduled-refresh or gateway concept at all yet, so DirectQuery's "always live" behavior is the only one that fits without inventing infrastructure this milestone doesn't need. Caching only earns its complexity once there's an actual latency or load problem, and there isn't one yet for a single-user tool.

## Stored Procedure Parameters

Fixed at Dataset-definition time. Values are set once when the Dataset is saved; there is no report-viewer-facing input mechanism. Grounded in Power BI's own distinction: query parameters bound to a specific value live at the query/Power-Query-editor layer (exactly analogous to fixing them at Dataset-definition time here), while parameters meant to be re-prompted or edited by a report consumer are a distinct, later, report-level concept in Power BI — and that consumer-facing layer is squarely the not-yet-buildable Report Designer's problem, not this milestone's.

## Explicitly Out of Scope

- Multi-table joins in the query builder — covered by the raw-SQL escape hatch instead.
- The Report Designer itself: canvas, `Widget`/`WidgetBinding`, chart-type classification logic, category/value axis binding.
- A shared cross-dialect SQL abstraction beyond the existing `IDataSourceProvider` seam (no generic AST-to-SQL generator until a second real SQL dialect, e.g. Postgres, actually exists).
- Runtime-exposed/report-viewer-supplied stored-procedure parameters.
- Dataset result caching or staleness handling.
- REST Dataset support for HTTP methods other than GET, custom headers, or request bodies.
- Cursor-based/incremental pagination — execution returns one bounded result set, full stop.

## Frontend Implications (high level)

- A "New Dataset" entry point reachable from `/datasources` (e.g. a per-connection action, or a new `/datasets` list page with a connection-picker as the first step).
- Dataset creation branches by connection type: SqlServer connections choose a Mode (Table Query / Raw SQL / Stored Procedure) first; RestApi connections go straight to a single path + query-params form (`RestQuery` mode, chosen automatically).
- Table Query mode: table dropdown (from cached schema), column checkboxes, a simple filter-row builder (field/operator/value, ANDed), sort field + direction, Top N, and a row-limit override field.
- Raw SQL mode: a SQL textarea with a "Preview Columns" action that hits the discovery-by-execution endpoint and displays the resulting column list (surfacing the `ORDER BY` limitation clearly if it's hit).
- Stored Procedure mode: a routine picker plus parameter name/value inputs, fixed at save time.
- A results-preview grid somewhere in the creation flow (a "Run Preview" action against the execute endpoint) showing columns + a bounded set of rows, so the user can sanity-check the Dataset before saving.
- No chart-binding UI — that belongs to the Report Designer milestone.
