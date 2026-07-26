# Meridian Visual Restyle — Design

## Overview

The user shared reference material (`widget-spec-gallery.html`, `sample-reports.html`, and a from-scratch "build Meridian platform" prompt) showing a more polished, PowerBI-style visual language they want the app to adopt. The reference's backend/architecture proposal (query descriptors, server-side keyset pagination, async export jobs, a different frontend/backend stack entirely) is **explicitly out of scope** — this milestone is a visual restyle of the existing app only, confirmed via a composite mockup shown and approved in the browser companion before writing this spec.

The app already has a partial "Meridian" design token system (`frontend/src/meridian-tokens.css`) from an earlier milestone's `DatasetsPage` restyle, whose token names match the reference material closely — this work extends that existing direction app-wide rather than starting over.

## Architecture

A hybrid approach, chosen after comparing a pure MUI-theme-override against a full hand-rolled rewrite:

- **Global MUI theme override** (`frontend/src/theme.ts`, applied via `<ThemeProvider>` in `main.tsx`) handles the vast majority of the app: palette, IBM Plex Sans/Mono fonts, flat shadows, border radius, and per-component style overrides (`MuiPaper`, `MuiTableCell`, `MuiButton`, `MuiChip`, `MuiCheckbox`, etc.). Every existing MUI-based surface picks this up automatically with no code changes to the components themselves.
- **Hand-rolled replacement** only where MUI's built-in structure genuinely can't be bent into the reference's shape via styling alone: the **DataTable pager** and the **two nav shells** (management-page nav vs. report viewer/designer ribbon). Both are described in detail below.
- **`meridian-tokens.css` gets extended** with tokens present in the reference but missing from the current file: `--good-soft`, `--bad`, `--bad-soft`, `--warn-soft`.

## DataTable Restyle

The table itself (`DataTable.tsx`'s `Table`/`TableContainer`/`TableHead`) keeps its current MUI structure; the theme override gives it: a sticky header row, `--groove`-colored row dividers, `--accent-soft` row hover, and right-aligned tabular-nums for any column whose rendered content is numeric (driven by existing `render` output — no data-model change).

The **pager is replaced**: `TablePagination` is swapped for a hand-rolled bar matching the reference's `.pager` — a "‹ Prev" / "Next ›" button pair and a plain "`1–25 of 150`" range readout. The reference's simplified demo has no rows-per-page control, but the app needs one (10/25/50), so that capability is kept, styled as a small segmented control using the same pill styling as the filter chips rather than a MUI dropdown. This is a real behavior change (new component), not just a reskin, so it gets its own tests (below).

The filter checklist popover (`Popper` + checkbox list, built in the prior milestone) stays structurally as-is, re-themed only — no reference component demonstrates an equivalent pattern to match more specifically.

## Nav Shell

Two shells, matched to the role each already plays:

- **Management pages** (`ReportsPage`/`DatasetsPage`/`DataSourcesPage`, currently routed through `AppShellLayout` + `AppSidebar.tsx`): the icon-only rail widens into a labeled nav matching the reference gallery's `.nav` — a grouped section header, icon + text label per item, active-state highlight (`--accent-soft` background, `--accent` left border). Same three destinations, same routing, same component — just wider and labeled.
- **Report Viewer/Designer** (`ReportView.tsx`/`ReportCanvas.tsx`): a new top ribbon (Meridian logo mark, app name, current report's name) is added above the existing `PageTabsBar`, which is re-themed to match (active-tab underline in `--accent`, matching font/spacing). The reference's ribbon also has a "Refresh" button, deliberately **not** carried over — the app has no manual-refresh concept for it to trigger, and adding a dead button would be worse than omitting it. A real refresh action can be added later once there's a concrete behavior behind it.

These two shells are mutually exclusive per route, matching the app's current routing (`App.tsx`): Viewer/Designer routes already bypass `AppShellLayout`/`AppSidebar` entirely today, so the ribbon replaces having no shell there at all — it does not sit alongside the labeled nav.

## Report Designer/Viewer Canvas

Widget cards (GridStack-managed) get the reference's treatment via the theme override on the underlying `Paper`: 12px radius, `--sh-sm` shadow deepening to `--sh-md` on hover, and a header row with title + a "⋯" affordance for the existing widget edit/delete menu — replacing the current plain title bar. This is styling only; no change to GridStack's drag/resize behavior.

`FiltersPane.tsx` converts from a vertical checkbox list to a horizontal pill/chip bar, grouped by field label, implemented with MUI's `Chip` component (a natural fit for "toggle pill" and "removable tag," keeping this in the theme-override bucket rather than a from-scratch rewrite). An active cross-filter (from clicking a chart element) gets its own distinct chip in `--good`/`--good-soft` with a "✕" to clear it, plus a "Reset filters" text link shown whenever any filter is active. Both are new UI — the app currently has no visible chip for cross-filter state at all — but both are built on the filter-context state that already exists; this is new presentation of existing state, not new state.

## Testing Approach

- **Theme override**: no new behavioral tests — pure styling over already-tested components. Verification here is visual/manual, and — consistent with every UI milestone this session — genuinely unverified until someone with browser access looks at it.
- **DataTable pager**: real behavior change, gets Vitest/RTL tests — Prev/Next enabled/disabled at boundaries, the range text reflecting the correct row span, and the rows-per-page control still resetting to page 0 exactly as `TablePagination` did.
- **FiltersPane chip conversion**: tests that toggling a filter chip still applies/removes the filter, the cross-filter chip's "✕" clears cross-filtering, and "Reset filters" clears everything — asserting through the new chip UI against the same existing filter-context logic.
- **Nav shell**: light smoke tests only (labeled nav renders all 3 destinations with correct active state; ribbon shows the current report name on Viewer/Designer routes) — mostly presentational, not over-tested.

## Explicitly Out of Scope

- The backend/architecture rewrite from the reference build prompt: query descriptors, server-side keyset pagination, aggregate-pushdown vs. import capability flags, async export jobs, Dapper/ClosedXML/QuestPDF, TanStack Query, react-grid-layout, Chart.js. Already discussed and separated out — nothing here touches the backend or swaps any library.
- Pixel-perfect fidelity everywhere — only the pager and the nav shells get structural replacement; everything else is "close via theme," not a hand-copy of the reference's exact markup.
- A "Refresh" action on the new ribbon (no current behavior to attach it to).
- Any change to GridStack drag/resize behavior, echarts rendering logic, or the report-definition data model.
