# Milestone 0 Implementation Plan

> For agentic workers: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to run this task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** React frontend and ASP.NET Core backend talking to each other end to end — list reports, add one, see it show up.

**Architecture:** One-page React app (Vite, MUI, axios) calls `GET/POST /api/reports` on an ASP.NET Core Web API. The API is `ReportsController → IReportRepository → in-memory List<Report>`, repository registered as a singleton so data survives across requests. No DB, no auth, no router.

**Tech Stack:** .NET 8 Web API (controllers), xUnit, Vite + React + TypeScript, MUI, axios.

## Global Constraints

- No database — in-memory list only. No auth. No react-router — one page.
- HTTP calls live in `frontend/src/api/reports.ts`, never inside components.
- Backend runs on `http://localhost:5198` (pinned in Task 3), frontend on `http://localhost:5173` (Vite default). CORS opened for 5173 in Development only.
- No frontend tests this milestone. Backend: repository + controller validation are test-driven.
- Backend project is `backend/Backend.csproj`, namespace `Backend` (capital — it was scaffolded with `-n Backend`). Keep the casing exact in every path and `using`/`namespace` line below — Windows won't care, but the CI workflow builds on `ubuntu-latest`, which has a case-sensitive filesystem, and a mismatched reference will build locally and fail there.
- All commands run from the repo root `C:\Users\Mulham\source\repos\open-reporting-platform` unless a step says otherwise.

---

### Task 1: In-memory report repository (TDD)

**Files:**
- Create: `Backend.Tests/Backend.Tests.csproj` (via `dotnet new`)
- Create: `Backend.Tests/InMemoryReportRepositoryTests.cs`
- Create: `backend/Models/Report.cs`
- Create: `backend/Services/IReportRepository.cs`
- Create: `backend/Services/InMemoryReportRepository.cs`
- Delete: `Backend.Tests/UnitTest1.cs`

**Interfaces:**
- Consumes: nothing — first task.
- Produces:
  - `public record Report(int Id, string Name, string Description);` in namespace `Backend.Models`
  - `IReportRepository` in namespace `Backend.Services` with `IReadOnlyList<Report> GetAll()` and `Report Add(string name, string description)`
  - `InMemoryReportRepository : IReportRepository`, seeds 3 reports in its constructor

- [ ] Step 1: Scaffold the test project and wire it to the backend:
  ```
  dotnet new xunit -o Backend.Tests
  dotnet add Backend.Tests/Backend.Tests.csproj reference backend/Backend.csproj
  ```
  If there's a `.sln` at the repo root, also `dotnet sln add Backend.Tests/Backend.Tests.csproj`. Delete the generated `Backend.Tests/UnitTest1.cs`.

- [ ] Step 2: Create `backend/Models/Report.cs`:
  ```csharp
  namespace Backend.Models;

  public record Report(int Id, string Name, string Description);
  ```

- [ ] Step 3: Write the failing tests — `Backend.Tests/InMemoryReportRepositoryTests.cs`:
  ```csharp
  using Backend.Services;

  namespace Backend.Tests;

  public class InMemoryReportRepositoryTests
  {
      [Fact]
      public void GetAll_OnFreshRepository_ReturnsSeededReports()
      {
          var repo = new InMemoryReportRepository();

          var reports = repo.GetAll();

          Assert.Equal(3, reports.Count);
          Assert.All(reports, r => Assert.False(string.IsNullOrWhiteSpace(r.Name)));
      }

      [Fact]
      public void Add_ThenGetAll_IncludesTheNewReport()
      {
          var repo = new InMemoryReportRepository();

          var created = repo.Add("Churn", "Customers lost per quarter");
          var reports = repo.GetAll();

          Assert.Contains(reports, r => r.Id == created.Id && r.Name == "Churn" && r.Description == "Customers lost per quarter");
      }

      [Fact]
      public void Add_AssignsIncrementingIds()
      {
          var repo = new InMemoryReportRepository();

          var a = repo.Add("A", "");
          var b = repo.Add("B", "");

          Assert.Equal(a.Id + 1, b.Id);
      }
  }
  ```

- [ ] Step 4: Run `dotnet test Backend.Tests` — confirm it fails (compile error, `InMemoryReportRepository` doesn't exist yet). That's the red.

- [ ] Step 5: Create `backend/Services/IReportRepository.cs`:
  ```csharp
  using Backend.Models;

  namespace Backend.Services;

  public interface IReportRepository
  {
      IReadOnlyList<Report> GetAll();

      Report Add(string name, string description);
  }
  ```

- [ ] Step 6: Create `backend/Services/InMemoryReportRepository.cs`. Lock around the list — this thing will be a singleton, and ASP.NET handles requests concurrently:
  ```csharp
  using Backend.Models;

  namespace Backend.Services;

  public class InMemoryReportRepository : IReportRepository
  {
      private readonly List<Report> _reports = new();
      private readonly object _lock = new();
      private int _nextId = 1;

      public InMemoryReportRepository()
      {
          Add("Monthly Sales", "Sales totals grouped by month");
          Add("Top Agents", "Agents ranked by closed deals");
          Add("Pipeline Overview", "Open deals by stage");
      }

      public IReadOnlyList<Report> GetAll()
      {
          lock (_lock)
          {
              return _reports.ToList();
          }
      }

      public Report Add(string name, string description)
      {
          lock (_lock)
          {
              var report = new Report(_nextId++, name, description);
              _reports.Add(report);
              return report;
          }
      }
  }
  ```

- [ ] Step 7: Run `dotnet test Backend.Tests` — all 3 pass.

- [ ] Step 8: Commit: `git add -A` then `git commit -m "backend: report model and in-memory repository with seed data"`.

---

### Task 2: ReportsController (TDD)

**Files:**
- Create: `Backend.Tests/ReportsControllerTests.cs`
- Create: `backend/Controllers/ReportsController.cs`

**Interfaces:**
- Consumes: `Report`, `IReportRepository`, `InMemoryReportRepository` from Task 1.
- Produces:
  - `ReportsController` at route `api/reports` — `GetAll()` returns `200` with all reports; `Create(CreateReportRequest request)` returns `400` with a message when name is blank, `201` with the created `Report` otherwise.
  - `public record CreateReportRequest(string? Name, string? Description);` in namespace `Backend.Controllers` — properties are nullable on purpose, so `[ApiController]`'s automatic required-property validation stays out of the way and our own blank-name check owns the 400.

- [ ] Step 1: Write the failing tests — `Backend.Tests/ReportsControllerTests.cs`:
  ```csharp
  using Backend.Controllers;
  using Backend.Models;
  using Backend.Services;
  using Microsoft.AspNetCore.Mvc;

  namespace Backend.Tests;

  public class ReportsControllerTests
  {
      [Fact]
      public void GetAll_ReturnsOkWithSeededReports()
      {
          var controller = new ReportsController(new InMemoryReportRepository());

          var result = controller.GetAll();

          var ok = Assert.IsType<OkObjectResult>(result.Result);
          var reports = Assert.IsAssignableFrom<IEnumerable<Report>>(ok.Value);
          Assert.NotEmpty(reports);
      }

      [Fact]
      public void Create_BlankName_Returns400()
      {
          var controller = new ReportsController(new InMemoryReportRepository());

          var result = controller.Create(new CreateReportRequest("   ", "whatever"));

          Assert.IsType<BadRequestObjectResult>(result.Result);
      }

      [Fact]
      public void Create_NullName_Returns400()
      {
          var controller = new ReportsController(new InMemoryReportRepository());

          var result = controller.Create(new CreateReportRequest(null, null));

          Assert.IsType<BadRequestObjectResult>(result.Result);
      }

      [Fact]
      public void Create_ValidInput_Returns201WithTheReport()
      {
          var repo = new InMemoryReportRepository();
          var controller = new ReportsController(repo);

          var result = controller.Create(new CreateReportRequest("Churn", "Customers lost per quarter"));

          var created = Assert.IsType<CreatedResult>(result.Result);
          var report = Assert.IsType<Report>(created.Value);
          Assert.Equal("Churn", report.Name);
          Assert.Contains(repo.GetAll(), r => r.Id == report.Id);
      }
  }
  ```

- [ ] Step 2: Run `dotnet test Backend.Tests` — fails to compile (no `ReportsController`). Red.

- [ ] Step 3: Create `backend/Controllers/ReportsController.cs`:
  ```csharp
  using Backend.Models;
  using Backend.Services;
  using Microsoft.AspNetCore.Mvc;

  namespace Backend.Controllers;

  [ApiController]
  [Route("api/reports")]
  public class ReportsController : ControllerBase
  {
      private readonly IReportRepository _repository;

      public ReportsController(IReportRepository repository)
      {
          _repository = repository;
      }

      [HttpGet]
      public ActionResult<IEnumerable<Report>> GetAll()
      {
          return Ok(_repository.GetAll());
      }

      [HttpPost]
      public ActionResult<Report> Create(CreateReportRequest request)
      {
          if (string.IsNullOrWhiteSpace(request.Name))
          {
              return BadRequest("Name is required.");
          }

          var report = _repository.Add(request.Name, request.Description ?? "");
          return Created($"/api/reports/{report.Id}", report);
      }
  }

  public record CreateReportRequest(string? Name, string? Description);
  ```

- [ ] Step 4: Run `dotnet test Backend.Tests` — all 7 pass (3 from Task 1 + 4 new).

- [ ] Step 5: Commit: `git commit -am "backend: reports controller with blank-name validation"`.

---

### Task 3: Wire up Program.cs, CORS, pin the port, smoke-test over HTTP

**Files:**
- Modify: `backend/Program.cs`
- Modify: `backend/Properties/launchSettings.json`

**Interfaces:**
- Consumes: `IReportRepository` / `InMemoryReportRepository` from Task 1, `ReportsController` from Task 2.
- Produces: running API at `http://localhost:5198` with `GET/POST /api/reports`, CORS open for `http://localhost:5173` in Development. Tasks 4-5 hardcode `http://localhost:5198/api` as the base URL.

- [ ] Step 1: Edit `backend/Program.cs` to register the repo as a singleton and add CORS. Keep the existing Swagger lines; drop `app.UseHttpsRedirection()` (we're running plain http locally and a redirect would just confuse axios). End state:
  ```csharp
  using Backend.Services;

  var builder = WebApplication.CreateBuilder(args);

  builder.Services.AddControllers();
  builder.Services.AddEndpointsApiExplorer();
  builder.Services.AddSwaggerGen();
  builder.Services.AddSingleton<IReportRepository, InMemoryReportRepository>();

  builder.Services.AddCors(options =>
  {
      options.AddPolicy("Frontend", policy =>
      {
          policy.WithOrigins("http://localhost:5173").AllowAnyHeader().AllowAnyMethod();
      });
  });

  var app = builder.Build();

  if (app.Environment.IsDevelopment())
  {
      app.UseSwagger();
      app.UseSwaggerUI();
      app.UseCors("Frontend");
  }

  app.UseAuthorization();
  app.MapControllers();

  app.Run();
  ```

- [ ] Step 2: In `backend/Properties/launchSettings.json`, set the `"http"` profile's `"applicationUrl"` to `"http://localhost:5198"` (whatever random port the template picked, replace it). Leave the rest of the file alone.

- [ ] Step 3: Run the API in one terminal: `dotnet run --project backend`. Confirm it says it's listening on `http://localhost:5198`.

- [ ] Step 4: Smoke-test from another terminal (`curl.exe`, not the PowerShell alias):
  ```
  curl.exe http://localhost:5198/api/reports
  curl.exe -i -X POST http://localhost:5198/api/reports -H "Content-Type: application/json" -d "{\"name\":\"From curl\",\"description\":\"smoke test\"}"
  curl.exe -i -X POST http://localhost:5198/api/reports -H "Content-Type: application/json" -d "{\"name\":\"\",\"description\":\"\"}"
  ```
  Expect: 3 seeded reports (camelCase JSON: `id`, `name`, `description`), then a `201` with the created report, then a `400` with `Name is required.`. Hit the first GET again and "From curl" should still be there — that's the singleton doing its job.

- [ ] Step 5: Stop the server. Commit: `git commit -am "backend: DI registration, CORS for vite dev server, pin port 5198"`.

---

### Task 4: Frontend deps + API client

**Files:**
- Modify: `frontend/package.json` (via npm install)
- Create: `frontend/src/api/reports.ts`

**Interfaces:**
- Consumes: the running API from Task 3 (`http://localhost:5198/api`, camelCase JSON).
- Produces (for Task 5):
  - `interface Report { id: number; name: string; description: string; }`
  - `getReports(): Promise<Report[]>`
  - `createReport(name: string, description: string): Promise<Report>`

- [ ] Step 1: Install deps:
  ```
  cd frontend
  npm install axios @mui/material @emotion/react @emotion/styled
  ```
  (Skipping `@fontsource/roboto` — MUI's fallback fonts are fine for this milestone.)

- [ ] Step 2: Create `frontend/src/api/reports.ts` — all HTTP lives here, components never import axios:
  ```typescript
  import axios from "axios";

  export interface Report {
    id: number;
    name: string;
    description: string;
  }

  const api = axios.create({ baseURL: "http://localhost:5198/api" });

  export async function getReports(): Promise<Report[]> {
    const res = await api.get<Report[]>("/reports");
    return res.data;
  }

  export async function createReport(name: string, description: string): Promise<Report> {
    const res = await api.post<Report>("/reports", { name, description });
    return res.data;
  }
  ```

- [ ] Step 3: From `frontend/`, run `npm run build` — must compile clean (this is the only automated check the frontend gets this milestone).

- [ ] Step 4: Commit: `git add -A` then `git commit -m "frontend: axios + MUI deps, reports api client"`.

---

### Task 5: The page — table, form, error alert, end-to-end check

**Files:**
- Modify: `frontend/src/App.tsx` (full replace)
- Modify: `frontend/src/index.css` (gut the Vite defaults)
- Delete: `frontend/src/App.css`

**Interfaces:**
- Consumes: `getReports`, `createReport`, `Report` from `frontend/src/api/reports.ts` (Task 4).
- Produces: the working Milestone 0 page. Nothing downstream.

- [ ] Step 1: Replace the contents of `frontend/src/index.css` with just:
  ```css
  body {
    margin: 0;
  }
  ```
  Delete `frontend/src/App.css` (the new App.tsx won't import it). Leave `main.tsx` as-is — it already imports `index.css` and renders `<App />`.

- [ ] Step 2: Replace `frontend/src/App.tsx` entirely:
  ```tsx
  import { useEffect, useState } from "react";
  import {
    Alert,
    Box,
    Button,
    Container,
    CssBaseline,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography,
  } from "@mui/material";
  import axios from "axios";
  import { createReport, getReports, type Report } from "./api/reports";

  function App() {
    const [reports, setReports] = useState<Report[]>([]);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [error, setError] = useState<string | null>(null);

    async function refresh() {
      setReports(await getReports());
    }

    useEffect(() => {
      refresh().catch(() => setError("Could not load reports — is the backend running on :5198?"));
    }, []);

    async function handleSubmit(e: React.FormEvent) {
      e.preventDefault();
      setError(null);
      try {
        await createReport(name, description);
        setName("");
        setDescription("");
        await refresh();
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 400) {
          setError(typeof err.response.data === "string" ? err.response.data : "Invalid input.");
        } else {
          setError("Something went wrong talking to the backend.");
        }
      }
    }

    return (
      <>
        <CssBaseline />
        <Container maxWidth="md" sx={{ py: 4 }}>
          <Typography variant="h4" gutterBottom>
            Reports
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", gap: 2, mb: 3 }}>
            <TextField label="Name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField
              label="Description"
              size="small"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              sx={{ flexGrow: 1 }}
            />
            <Button type="submit" variant="contained">
              Add
            </Button>
          </Box>

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.id}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Container>
      </>
    );
  }

  export default App;
  ```
  Note: the form deliberately lets you submit a blank name — no client-side `required` — because seeing the backend's 400 surface in the Alert is part of the point of this milestone.

- [ ] Step 3: From `frontend/`, run `npm run build` — clean compile.

- [ ] Step 4: End-to-end check. Two terminals:
  - `dotnet run --project backend` (from repo root)
  - `npm run dev` (from `frontend/`)

  Open `http://localhost:5173` and verify:
  - The 3 seeded reports show in the table.
  - Add a report with a name — it appears in the table without a page reload.
  - Submit with a blank name — red Alert saying `Name is required.`, nothing added.
  - Stop the backend, reload the page — the "is the backend running" Alert shows (nice-to-have sanity check on the error path).

- [ ] Step 5: Commit: `git add -A` then `git commit -m "frontend: reports page with add form and error alert"`.

---

That's the whole milestone. Everything after this (real DB, auth, drag-and-drop designer, frontend tests) is deliberately out of scope — resist the urge.
