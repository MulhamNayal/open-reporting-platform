# Milestone 0 — hello, full stack

Goal: get a React frontend and an ASP.NET Core backend actually talking to each other, end to end, before touching anything harder. No database, no auth, no drag-and-drop canvas yet — just: run the backend, run the frontend, see a list of reports, add one, see it show up.

Skipping for now: real database (in-memory list is fine, keeps this about learning React instead of EF Core too), auth, routing (one page is enough for now), frontend tests (backend gets one test, frontend testing is its own thing to learn later).

One thing to keep in mind even though it doesn't matter yet: keep HTTP calls out of the components (put them in their own file) since that'll matter once there's more than one page.

## How it fits together

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
- `Services/IReportRepository.cs` / `InMemoryReportRepository.cs` — `GetAll()`, `Add(name, description)`. Registered as a singleton (has to survive across requests since there's no DB). Seed it with 2-3 reports in the constructor so the list isn't empty on first run.
- `Controllers/ReportsController.cs` — thin. `GET /api/reports` returns everything. `POST /api/reports` takes `{ name, description }`, `400` if name is blank, `201` with the created report otherwise.
- `Program.cs`: register the repo as singleton, and open up CORS for `http://localhost:5173` (Vite's dev port) in Development. This one's easy to forget and the failure mode is confusing — browser just blocks the request with no useful backend-side error.

## Frontend (`frontend/`)

- Install: `axios`, `@mui/material`, `@emotion/react`, `@emotion/styled`
- `src/api/reports.ts` — `getReports()` and `createReport(name, description)`, wrapping axios calls. Keep these out of the component.
- `src/App.tsx` — one page: MUI `Table` for the list, a small form (two `TextField`s + `Button`) above it that calls `createReport` then refetches the list.
- No router yet, nothing to navigate to.

## Errors

Backend returns 400 + message on a blank name instead of blowing up. Frontend catches that and shows it in an MUI `Alert` above the form.

## Tests

One backend test — `InMemoryReportRepositoryTests` — add then get-all should include it, and the seeded reports should be there from the start. No frontend tests yet.
