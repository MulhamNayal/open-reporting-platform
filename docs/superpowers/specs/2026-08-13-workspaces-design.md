# Workspaces — design

## Why

Reports currently live in one flat list. Two things follow from that, both visible today:

1. **Name collisions force a wrong merge.** The source BI tenant organises reports into 12
   workspaces, and 18 report names appear in more than one of them. Migration collapsed each name
   into a single platform report, so a report that genuinely differs between two teams cannot be
   represented at all. Where the two sources are byte-identical the merge is harmless; where they
   differ it is silently lossy, and today there is no way to tell those cases apart in the product.
2. **The navigation has nothing to navigate.** The left rail is three links. The BI tool it
   replaces uses that rail for Home / Workspaces / recents, which is why the rail here looks
   decorative — there is no grouping concept for it to expose.

A workspace is also the natural owner of the things currently attached to nothing in particular:
who a report belongs to, which connection its datasets should default to, and who may see it.

## What a workspace is

A named container that reports belong to. One report is in exactly one workspace.

```
Workspace 1 ── * Report ── * ReportPage ── * Widget
```

Deliberately **not** in scope for this milestone:

- **Permissions.** There is no user or auth model yet, so a workspace cannot mean "who can see
  this". Adding an owner column now would be inventing a concept the platform can't honour.
- **Datasets and connections moving into workspaces.** Datasets are shared across reports today —
  three of them back both a weekly sales report and a legacy equivalent. Scoping datasets to a
  workspace would either duplicate them or break that sharing, and neither is a decision this
  milestone needs to take. Datasets stay attached to their connection.
- **Nested workspaces / folders.** No evidence anything needs them.

## Model

```csharp
public class Workspace
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    // Sort order in the rail. Explicit rather than alphabetical so the busiest workspace can sit
    // at the top, which is how the source tool orders its own list.
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public DateTime CreatedAtUtc { get; set; }
}
```

`Report` gains `WorkspaceId`.

**Every existing report needs a workspace, so the column cannot be nullable for long.** Two
options, and the second is preferred:

- Nullable `int?`, treat null as "unfiled". Simple, but leaves a permanent second state to handle
  in every query and every screen.
- **Non-nullable with a seeded default workspace.** The migration creates one workspace and points
  every existing report at it, so there is never an unfiled report. This is the recommended route.

### ⚠️ Migration trap this project has hit twice

EF generates the CLR default for a new non-nullable column, which is `0` for an `int` — a foreign
key to a workspace that does not exist. **Read the generated migration before applying it** and set
`defaultValue` to the seeded workspace's id, or seed the workspace in the same migration before
adding the column. The equivalent mistake with a `bool` initialised to `true` in C# silently
flipped every existing row twice before.

## API

```
GET    /api/workspaces                  list (excludes inactive unless ?includeInactive=true)
POST   /api/workspaces                  create
PUT    /api/workspaces/{id}             rename / re-describe / reorder
DELETE /api/workspaces/{id}             only when empty — see below
GET    /api/reports?workspaceId={id}    filter the existing list
PUT    /api/reports/{id}/workspace      move a report
```

Deleting a workspace that still holds reports would orphan them, so it throws — a new
`WorkspaceNotEmptyException` mapped to **409** in `GlobalExceptionHandler`, alongside
`LastPageDeletionException` which exists for the same reason. Deleting the last workspace throws
too, for the same reason the last page of a report cannot be deleted: there would be nowhere for a
new report to go.

`GET /api/reports` keeps working unfiltered, so nothing that exists today breaks.

## UI

### Left rail — matches the reference screenshot

~68px, icon above a small centred label, accent bar on the selected item. Already the right
dimensions; what it lacks is content:

```
[waffle]          app switcher
 Home             the reports list, all workspaces
 Workspaces       expands the workspace list
 ── recents ──
 <report>         the last few reports opened, by icon + truncated name
 ...              overflow
```

Recents are already derivable — `Report.LastViewedAtUtc` and `ViewCount` exist and the viewer
records views.

### Command bar — matches the reference screenshot

The reference bar reads `File⌄ · Export⌄ · Share │ Explore · Subscribe · Set alert · Monitor │
Edit · ⋯`. Chevrons and dividers are already in. **Do not add buttons the platform cannot honour** —
a Subscribe that does nothing is worse than its absence. Of that set, only these are real here:

| Button | Maps to |
|---|---|
| **File⌄** | rename, change data source, back to list *(exists)* |
| **Export⌄** | Excel / CSV — `dataTableExport` already does both, currently only per-table |
| **Edit** | open the editor *(exists, currently unlabelled in the viewer)* |
| **Refresh** | *(exists)* |
| **⋯** | duplicate, deactivate |

Report-level Export is the one genuinely new item: today export lives on each table widget, so a
reader has to export each visual separately.

### Reports list

A workspace column, and a workspace filter in the command bar. The list stays flat by default —
grouping by workspace behind a toggle rather than as the only view, since most people arrive
looking for one report by name.

## Data migration

Separate from the schema migration, and scripted against the API rather than SQL — connections and
ids differ between environments.

1. Create a workspace per source workspace (12 of them) plus a default for anything platform-native.
2. Move each report into the workspace its Power BI original came from. The mapping already exists
   in `scratchpad/pbix-export-manifest.json`.
3. **Split the 18 force-merged reports** — but only where the sources genuinely differ. One pair
   was verified byte-identical (33 tables, same 15 pages, same columns), so splitting it would
   produce two identical reports and help nobody. **Compare each pair's extracted table specs
   first; split only the ones that differ.**

## What this does not fix

Worth stating plainly, because it was the question that prompted the milestone: **workspaces do not
correct any figures.** Where a migrated report's numbers disagree with its original, the cause is
the dataset being built from a stored procedure rather than from the report's own query — the two
are different queries with similar names. That is a separate, per-report fix, and it is unaffected
by where the report is filed.

## Testing

- `WorkspaceServiceTests` — create, rename, reorder, list excludes inactive
- Deleting a non-empty workspace throws `WorkspaceNotEmptyException`; deleting the last one throws
- `ExceptionMappingIntegrationTests` gains the 409 case, since a controller-level test cannot
  observe middleware
- `ReportServiceTests` — a new report lands in the requested workspace; moving one keeps its pages
  and widgets intact
- Frontend — rail renders workspaces and recents; the reports list filters by workspace
