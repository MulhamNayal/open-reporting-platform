# Design: Milestone 0 — Hello, full stack

**Date:** 2026-07-19
**Status:** approved — proceeding to implementation plan.

---

## Goal

A working React ↔ ASP.NET Core round trip, understood end to end, before touching anything harder. No data source abstraction, no pluggable auth, no dashboard canvas yet — those come in later milestones once React itself feels natural. Success looks like: run the backend, run the frontend, see a list of reports, add a new one, see it appear.

**Non-goals for this milestone:** a real database (in-memory only — that's deliberate, isolates learning React from learning EF Core), authentication, routing (one page is enough), automated frontend tests (deferred to a milestone once components feel familiar), anything resembling the final dashboard/canvas feature set.

**Forward-looking constraint, not a Milestone 0 requirement:** later milestones are expected to become independently publishable packages (an npm package for frontend components, a NuGet package for backend libraries) so they can be reused elsewhere, including potentially inside the author's employer's separate codebase as an ordinary MIT-licensed dependency. Milestone 0 itself is throwaway learning code and is not expected to be packaged — but keep HTTP calls out of components (see Frontend section) since that's a habit worth starting early, not because Milestone 0 itself needs it.

---

## Architecture

```
React (frontend/, MUI, axios)
   │  GET /api/reports        →  list
   │  POST /api/reports       →  create
   ▼
ASP.NET Core (backend/)
   ReportsController  →  IReportRepository  →  in-memory List<Report>
```

## Backend (`backend/`)

- `Models/Report.cs` — `public record Report(int Id, string Name, string Description);`
- `Services/IReportRepository.cs` / `InMemoryReportRepository.cs` — `IReadOnlyList<Report> GetAll()`, `Report Add(string name, string description)`. Registered as a **singleton** in `Program.cs` (must survive across requests since there's no database). Seeded in its constructor with 2-3 sample reports so the list isn't empty on first run.
- `Controllers/ReportsController.cs` — thin: `GET /api/reports` returns the full list; `POST /api/reports` takes `{ name, description }`, returns `400` with a message if `name` is null/whitespace, otherwise `201` with the created `Report`.
- `Program.cs` additions: register `IReportRepository`/`InMemoryReportRepository` as singleton; add CORS allowing `http://localhost:5173` (Vite's default dev port) in Development — call this out explicitly in the plan, it's the one piece of ASP.NET Core config that silently breaks things for newcomers (browser requests get blocked with no obvious backend-side error).

## Frontend (`frontend/`)

- New packages: `axios`, `@mui/material`, `@emotion/react`, `@emotion/styled` (MUI's required peer dependencies).
- `src/api/reports.ts` — `getReports(): Promise<Report[]>` and `createReport(name: string, description: string): Promise<Report>`, both wrapping `axios` calls to `http://localhost:<backend-port>/api/reports`. Keeping HTTP calls in this file rather than inline in the component is the one structural habit worth establishing now — it's what makes later milestones (more endpoints, more pages) tractable.
- `src/App.tsx` — single page: an MUI `Table` listing reports (Name, Description columns), a small form above it (two `TextField`s + a `Button`) that calls `createReport`, then refetches the list via `getReports()` on success.
- No React Router yet — nothing to navigate *to* until a second page exists.

## Error handling

Backend: validation failure (blank name) → `400` with a plain-text/JSON message, not an unhandled exception. Frontend: wrap the `createReport` call in a try/catch, show the message via an MUI `Alert` above the form on failure — mirrors the "surface the error, don't swallow it" pattern already familiar from the IQI work.

## Testing

One backend test: `InMemoryReportRepositoryTests` (xUnit) — proves `Add` then `GetAll` includes the newly added report, and that the seeded reports are present on construction. No frontend tests yet; React Testing Library is its own learning curve, deliberately deferred until components themselves feel familiar — this is a stated deferral, not a skipped requirement.

---

## Self-review notes

- **Placeholder scan:** no TBD/TODO markers; every section names exact files, exact method signatures.
- **Internal consistency:** the "no packaging yet" non-goal doesn't contradict the "keep HTTP calls in `src/api/`" structural choice — that choice is justified by immediate next-milestone needs (more endpoints), not by the packaging goal.
- **Scope check:** small enough for a single implementation plan — one backend project, one frontend page, no cross-cutting concerns.
- **Ambiguity check:** `POST /api/reports`'s success status code is specified explicitly (`201`, not the vaguer "success") to avoid a frontend/backend mismatch during implementation.
