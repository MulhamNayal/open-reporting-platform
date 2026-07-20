# Open Reporting Platform

A self-hosted, open-source, drag-and-drop report/dashboard builder — pluggable data sources, pluggable auth, generic REST data contracts. Personal project, built to learn React and explore a generic version of ideas from a reporting tool built at work.

## Stack

- **Frontend:** React + TypeScript, scaffolded with Vite (`frontend/`)
- **Backend:** ASP.NET Core Web API (`backend/`)

## Status

Milestone 1 done: reports are now backed by a real SQL Server database (EF Core, code-first migrations) instead of an in-memory list — data survives an app restart. The frontend lists reports and can add one, backed by the REST API. Auth and the drag-and-drop builder come in later milestones.

## Running locally

Needs a local SQL Server instance (this project uses `localhost\SQLEXPRESS` with Windows Integrated auth — see `backend/appsettings.Development.json`). Run both servers together — the frontend calls the backend, so both need to be up.

**Backend** (listens on http://localhost:5198):
```bash
cd backend
dotnet run
```

First time only, create the database:
```bash
dotnet ef database update --project backend/Backend.csproj --startup-project backend/Backend.csproj
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
