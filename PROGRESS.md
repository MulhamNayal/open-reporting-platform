# Progress Log

Running record of what's been built, in reverse-chronological order (newest first). Updated as each feature/enhancement lands.

---

## 2026-07-20 — Milestone 1 built (real database)

- Swapped the in-memory report list for a real SQL Server database. `ReportingDbContext` + `EfReportRepository` behind the same `IReportRepository` interface — `ReportsController` didn't need to change at all.
- DI moved from Singleton (in-memory repo) to Scoped (`ReportingDbContext`/`EfReportRepository`), the normal EF Core lifetime for a web API.
- Schema via a code-first migration (`InitialCreate`), applied to a local SQL Server Express instance (`localhost\SQLEXPRESS`, Windows Integrated auth).
- Proved the actual point of the milestone: posted a report, restarted the app process, and it was still there — data isn't living in memory anymore.
- Tests moved from a hand-rolled in-memory fake to EF Core's InMemory provider — same fast/no-real-DB-needed tests, but now exercising real EF Core query/save behavior. 7 tests passing (4 controller + 3 repository).
- All 4 plan tasks done and reviewed.

## 2026-07-20 — Milestone 1 design approved

- Wrote and approved the design for Milestone 1: swap the in-memory report list for a real SQL Server database via EF Core (using the local SQLEXPRESS instance, code-first migrations, repository moves from Singleton to Scoped).
- See `docs/superpowers/specs/2026-07-20-milestone-1-real-database-design.md` for the full design.
- Not yet implemented — plan and code come next.

## 2026-07-20 — Milestone 0 built (Hello, full stack)

- Implemented Milestone 0 end to end — list reports and add a report, working across both servers.
- **Backend:** `InMemoryReportRepository` (hardcoded seed list) behind an interface, a `ReportsController` exposing GET/POST, DI registration, CORS configured for the Vite dev server, and the API port pinned to 5198.
- **Tests:** added `Backend.Tests` (xUnit) — repository and controller coverage, 7 tests passing.
- **Frontend:** axios API client plus the reports page — table of reports, an add form, and error handling for failed requests.
- All 5 plan tasks done and reviewed; the two apps run together (backend :5198, frontend :5173).

## 2026-07-19 — Milestone 0 design approved

- Wrote and approved the design for Milestone 0 ("Hello, full stack"): a hardcoded in-memory report list on the backend, a React + MUI page on the frontend to list and create reports, axios for HTTP, no database/auth/routing yet.
- See `docs/superpowers/specs/2026-07-19-milestone-0-hello-full-stack-design.md` for the full design.
- Not yet implemented — plan and code come next.

## 2026-07-19 — Repo scaffolded

- Created `open-reporting-platform` on GitHub (public, MIT licensed).
- Scaffolded `frontend/` (React + Vite + TypeScript) and `backend/` (ASP.NET Core Web API, net8.0).
- Added CI (`.github/workflows/ci.yml`) building both projects on push/PR.
