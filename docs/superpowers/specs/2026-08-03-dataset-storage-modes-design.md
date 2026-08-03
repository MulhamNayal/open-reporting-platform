# Dataset Storage Modes (Import / DirectQuery) — Design

## Overview

A dataset is executed in full and the entire result is serialised to the browser as JSON. Every
widget on the page then reads that one in-memory array: the table renders rows from it, the chart
aggregates over it, and `mergeFilterableFields` scans every row of it to build the Filters pane's
distinct-value lists.

That design is fine for a few thousand rows and falls apart beyond that. Measured across all 64
datasets in use on 2026-08-03:

| Dataset | Rows | Payload | Cold | Warm (fully cached) |
|---|---|---|---|---|
| REN Analysis | 50,000 | 49 MB | 61s | **30.1s** |
| HOT Exsim Report | 50,000 | 46 MB | 166s | **28.0s** |
| View Project Unit Report | 50,000 | 38 MB | 115s | **26.9s** |
| Unit Invoicing Report | 50,000 | 40 MB | 157s | **22.6s** |

**26 datasets sit pinned at the 50,000-row cap, totalling 466 MB and 292 seconds of load even when
every one of them is served from cache.** The result cache added in `3b1ef1f` does not help: the
time is serialising and transferring the payload, not running the query. Ten reports take over ten
seconds to open with a warm cache.

And they are *still* truncated. The true row counts are larger than the cap — Top Subsale 222,406,
Developer Status 175,270, REN Analysis 77,740 — so these reports are simultaneously **incomplete
and slow**, with no indication to the user that rows are missing.

Lowering the row limit trades one problem for the other. Measured on REN Analysis:

| rowLimit | Payload | Warm |
|---|---|---|
| 50,000 | 49 MB | 30.08s |
| 5,000 | 4.2 MB | 2.32s |
| 2,000 | 1.5 MB | 0.85s |

Fast, or complete. Not both. The only way to have both is to stop sending whole result sets to the
browser — page the table, aggregate the chart, and query distinct values separately.

## The constraint that decides the design

The obvious approach is to push filtering, paging and aggregation down into SQL. That is
impossible for most of this platform's datasets:

```sql
SELECT * FROM (EXEC PowerBI.RENAnalysisReport) WHERE Team = 'Elite'   -- not valid SQL
```

A stored procedure's result set cannot be filtered, sorted or paged inline. The only route is
`INSERT INTO #temp EXEC proc` followed by a query against the temp table — which re-runs the
procedure on every interaction. Given the measured cold times (34–166s), a filter click would take
minutes.

**50 of the 64 datasets in use are `StoredProcedure` mode.** Pushdown is viable only for the 14
`RawSql`/`TableQuery` datasets, which the provider already wraps in a derived table
(`BuildBoundedRawSql`).

So the source data must first be *materialised into a table this platform owns*. Once it is a
table, ordinary SQL filtering and paging work, and the slow procedure runs on a schedule rather
than in the request path.

This is the same conclusion Power BI reached, and this milestone deliberately borrows its
vocabulary: **Import** (materialise, then query the copy) versus **DirectQuery** (query the source
per interaction).

## Data Model

`Dataset` gains one column:

```csharp
public DatasetStorageMode StorageMode { get; set; } = DatasetStorageMode.DirectQuery;
```

```csharp
public enum DatasetStorageMode
{
    DirectQuery,   // execute the source per request — today's behaviour
    Import         // materialise into a platform-owned table, serve queries from that
}
```

Defaulting to `DirectQuery` keeps every existing dataset behaving exactly as it does now, so the
change is additive and needs no data migration — the same shape as `Widget.DatasetId` in the
per-widget-datasets milestone.

Import datasets additionally track their materialisation state:

```csharp
public string? MaterializedTableName { get; set; }   // e.g. mat.Dataset_18
public DateTime? LastMaterializedAtUtc { get; set; }
public int? MaterializedRowCount { get; set; }
public string? LastMaterializeError { get; set; }
```

### The mode is constrained by the dataset's query mode, not freely chosen

| `Dataset.Mode` | Allowed storage modes | Default |
|---|---|---|
| `StoredProcedure` | Import only | Import |
| `RawSql`, `TableQuery` | Either | DirectQuery |
| `RestQuery` | Import only | Import |

DirectQuery over a stored procedure is technically expressible and practically unusable — every
filter click re-runs a procedure that takes tens of seconds. The service rejects that combination
rather than offering a setting that is always the wrong answer. `RestQuery` is Import-only for the
same reason: an HTTP round-trip per interaction, with no server-side filtering available.

### Where materialised tables live

A **separate database owned by this platform**, not `ReportingDb` and not any ERP database. Tables
are created in a dedicated `mat` schema, one per Import dataset, named `mat.Dataset_{id}`.

Column types are derived from the discovered `ColumnDescriptor` list, which the dataset already
stores. A `__RowNumber` identity column is added to give paging a stable, deterministic order when
the query has no explicit sort — without it, `OFFSET/FETCH` results can repeat or skip rows.

The connection to this database is configured separately from user-created data source
connections; it is infrastructure, not a data source, and must not appear in the Connections UI.

## Query Pipeline

The single "execute the dataset, return everything" call is replaced by three narrower operations.
Each widget asks for what it needs.

```
                    ┌── page of rows ──►  Table widget
   Dataset ─────────┼── aggregate ─────►  Chart widget
   (Import or DQ)   └── distinct ──────►  Filters pane
```

**Rows (paged)** — used by table widgets.

```sql
SELECT <selected columns> FROM mat.Dataset_18
WHERE <filter predicate>
ORDER BY <sort or __RowNumber>
OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY
```

**Aggregate** — used by chart and KPI widgets. This is where the payload problem disappears
entirely: 50,000 rows grouped by 8 teams returns 8 rows, so charts never need paging.

```sql
SELECT <categoryField>, SUM(<valueField>) FROM mat.Dataset_18
WHERE <filter predicate>
GROUP BY <categoryField>
```

**Distinct values** — used by the Filters pane, replacing `mergeFilterableFields`'s full scan.

```sql
SELECT DISTINCT <column> FROM mat.Dataset_18 ORDER BY 1
```

### Filters become a predicate, not a client-side array scan

Today `applyFilters` filters the loaded array in the browser. Under this design the page's
`filterState` is translated into a parameterised `WHERE` clause applied to **all three** query
shapes, so the table and the chart are filtered by the same predicate at the same source.

This also fixes a correctness bug that exists today and is invisible: with the result truncated at
the row cap, a chart's `SUM` is computed over the truncated set and displays a **wrong total** with
no warning. Pushing the aggregate to SQL makes it correct by construction.

Filter values are always passed as SQL parameters. String concatenation into the predicate would be
an injection vector, and unlike the existing `SelectQuery` path there is no fixed allow-list of
operators to lean on.

### DirectQuery datasets use the same three shapes

For `RawSql`/`TableQuery` datasets the same three queries are generated, wrapped around the user's
SQL as a derived table — exactly how `BuildBoundedRawSql` already wraps for row limiting. No
materialised table is involved, and the source is queried per interaction.

### Cross-filtering becomes a round-trip

Clicking a chart bar to filter the rest of the page is currently instantaneous, because everything
is in browser memory. Under this design it becomes a server call per affected widget. Each such
query is small and cacheable, but the interaction is no longer free. This is a real regression in
feel and is accepted deliberately — it is the cost of not shipping 49 MB to the browser.

## Refresh

**Atomic swap.** Materialisation loads into `mat.Dataset_18__loading`, then swaps to the live name
inside a transaction. A reader must never observe a half-populated table, and a failed refresh must
leave the previous good copy in place.

**Manual first, scheduled second.** The first deliverable is a "Refresh now" action plus
materialise-on-first-use. Scheduling is a separate, smaller step once materialisation is proven —
it introduces a background job runner, which is new infrastructure for this codebase and is better
added to something that already works.

**Staleness must be visible.** An Import-backed report shows `LastMaterializedAtUtc` in the UI.
Without it, imported data is indistinguishable from live data, which is precisely how a stale
dashboard misleads someone. Power BI surfaces this and users already expect it.

**Schema drift.** If a procedure's output columns change between refreshes, the materialised table
no longer matches. The refresh detects a column-set mismatch and rebuilds the table rather than
failing. Widgets bound to a column that disappeared already degrade gracefully via
`findMissingFields`.

## Out of Scope

- **No joins across datasets.** Unchanged from the per-widget-datasets milestone: each widget still
  gets one flat result from one query. Anything needing a genuine join is still pushed into SQL.
- **No semantic model, no measure layer.**
- **No incremental refresh.** Every refresh is a full reload. Incremental refresh needs a watermark
  column and a merge strategy per dataset, and there is no evidence yet that full reloads are too
  slow when run off the request path.
- **No row-level security.** Note that the result cache and materialised tables are both shared
  across all users; if RLS is ever added, both need a user dimension.

## Consequences and honest trade-offs

**This adds writes and scheduling to a platform that has so far been read-only.** An earlier
position in this project was that the platform should never own ingestion, because doing so turns a
reporting tool into a pipeline product. That position does not survive the stored-procedure
finding. The distinction that does hold: the platform materialises **its own query output**, not
foreign source data. Copying a third party's Google Sheet into our schema remains out of scope;
caching the result of a query we already run does not.

**Materialised tables are a new location for personal data.** The migrated reports contain agent
and buyer names, phone numbers, email addresses and bank details. Import mode creates a second
copy of that in a database that will need deliberate access control — narrower than the source, and
not readable by whoever happens to hold `sa`.

**Import data is stale by definition.** For reports that must be to-the-second, DirectQuery over a
`RawSql` dataset is the right answer, and the mode selection exists precisely so that choice can be
made per dataset.

## Open Questions

1. **Where does the platform database live?** Same SQL Server instance as `IQIADMIN-REP` (so
   three-part-name joins remain possible) versus the local/dev instance. Blocked on a decision that
   has been open since the Google Sheets discussion. Note the staging server currently has 16.5 GB
   free of 450 GB.
2. **Default TTL / refresh cadence for Import datasets** — nightly is the obvious starting point,
   but several of these reports are described as weekly.
3. **Should DirectQuery be offered at all for `RawSql`,** or is Import simply the default for
   everything, with DirectQuery reserved for a future "real-time" requirement that has not yet been
   stated?
