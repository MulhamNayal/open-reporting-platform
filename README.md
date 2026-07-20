# Open Reporting Platform

A self-hosted, open-source, drag-and-drop report/dashboard builder — pluggable data sources, pluggable auth, generic REST data contracts. Personal project, built to learn React and explore a generic version of ideas from a reporting tool built at work.

## Stack

- **Frontend:** React + TypeScript, scaffolded with Vite (`frontend/`)
- **Backend:** ASP.NET Core Web API (`backend/`)

## Status

Milestone 0 ("Hello, full stack") works end to end: the frontend lists reports and can add a report, backed by a REST API. Reports are held in memory on the backend (no database yet). The backend has xUnit tests. Database, auth, and the drag-and-drop builder come in later milestones.

## Running locally

Run both servers together — the frontend calls the backend, so both need to be up.

**Backend** (listens on http://localhost:5198):
```bash
cd backend
dotnet run
```

**Frontend** (Vite dev server on http://localhost:5173):
```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173.

**Backend tests:**
```bash
dotnet test Backend.Tests/Backend.Tests.csproj
```
