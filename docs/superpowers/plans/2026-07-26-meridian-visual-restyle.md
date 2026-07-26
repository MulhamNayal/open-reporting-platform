# Meridian Visual Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole app to match the Meridian reference visual language: a global MUI theme override for the management pages and `DataTable`, plain-CSS polish for the already-hand-rolled Report Designer/Viewer editor area, a hand-rolled `DataTable` pager, a widened labeled nav for management pages, `Ribbon` reuse (with a new `readOnly` mode) on the Report Viewer, and a filter-chip bar (with a genuine cross-filter chip) replacing `FiltersPane`'s checkbox list.

**Architecture:** Hybrid, confirmed against the actual codebase during planning. `frontend/src/theme.ts` (new) + extended `frontend/src/meridian-tokens.css` cover every MUI-based surface (management pages, `DataTable`) via one central `<ThemeProvider>`. The Report Designer/Viewer editor area (`reportEditor.css`, `Ribbon.tsx`, `FiltersPane.tsx`, `PageTabsBar.tsx`, `WidgetChrome.tsx`) has zero MUI usage today and stays that way — restyled via plain CSS. `DataTable`'s pager is a genuine new component (`DataTablePager.tsx`), the only structural (not just visual) replacement in this plan.

**Tech Stack:** React 19 + TypeScript (`verbatimModuleSyntax: true`), MUI 9, Vitest + React Testing Library.

## Global Constraints

- `verbatimModuleSyntax: true` — type-only imports use `import type { X }`.
- Test gate: `npm run verify` (= `tsc -b && vitest run`) from `frontend/`. Never bare `npm test`.
- Commits: `frontend: ...`, lowercase, imperative, **no** AI attribution / Co-Authored-By line.
- No change to GridStack drag/resize behavior, echarts rendering logic, or the report-definition data model.
- No pixel-perfect fidelity requirement outside the `DataTable` pager — everything else is "close via CSS/theme."
- No `@mui/icons-material` dependency (not installed in this project) — any new icon-like glyph is plain text/unicode, matching existing conventions (e.g. `WidgetChrome.tsx`'s `⧉`/`🗑`, `Ribbon.tsx`'s `⟳`).
- Out of scope entirely: the backend/architecture rewrite from the reference build prompt (query descriptors, server-side keyset pagination, async export jobs, Dapper/ClosedXML/QuestPDF, TanStack Query, react-grid-layout, Chart.js) — nothing in this plan touches the backend or swaps a library.

---

### Task 1: Foundation — extend tokens + central MUI theme

**Files:**
- Modify: `frontend/src/meridian-tokens.css`
- Create: `frontend/src/theme.ts`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: nothing from later tasks.
- Produces: the exported `meridianTheme` (default export) from `frontend/src/theme.ts`, applied globally via `<ThemeProvider>`. Later tasks don't import this directly — it's applied once, in `main.tsx`, and every MUI component in the tree picks it up automatically.

- [ ] **Step 1: Extend the token file**

Add these 4 missing custom properties to `frontend/src/meridian-tokens.css`'s `:root` block, right after the existing `--good` and `--warn` lines:

```css
  --good-soft: #e2f6f2;
  --warn-soft: #fdefe2;
  --bad: #e5484d;
  --bad-soft: #fdecec;
```

(The file currently has `--good: #12a594;` then `--warn: #e5843a;` on consecutive lines — insert the 4 new lines directly after `--warn`, before `--sh-sm`.)

- [ ] **Step 2: Create the central MUI theme**

Create `frontend/src/theme.ts`:

```typescript
import { createTheme } from "@mui/material/styles";

const meridianTheme = createTheme({
  palette: {
    primary: { main: "#5b4fe6", dark: "#4a3fd6" },
    background: { default: "#e7eaf1", paper: "#ffffff" },
    text: { primary: "#1b1e27", secondary: "#6c7480" },
  },
  typography: {
    fontFamily: "'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    button: { textTransform: "none" },
  },
  shape: { borderRadius: 8 },
  shadows: [
    "none",
    "0 1px 2px rgba(20,24,40,.06), 0 1px 1px rgba(20,24,40,.04)",
    ...Array(23).fill("0 4px 14px rgba(20,24,40,.10), 0 1px 3px rgba(20,24,40,.06)"),
  ] as unknown as import("@mui/material/styles").Theme["shadows"],
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { border: "1px solid #e3e7ef" },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: "1px solid #eef0f4" },
        head: { color: "#6c7480", fontWeight: 600, background: "#f6f7f9" },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          "&:hover td": { background: "#edeafc" },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { fontWeight: 600 },
      },
    },
  },
});

export default meridianTheme;
```

(MUI's `shadows` array must have exactly 25 entries, indices 0–24 — index 0 is always `"none"`. This maps every `elevation` level MUI components use internally onto the two flat Meridian shadows, `--sh-sm` for level 1 and `--sh-md` for the rest, matching the design's "flat shadows" requirement without needing to touch every consuming component individually.)

- [ ] **Step 3: Wire the theme into the app**

Modify `frontend/src/main.tsx` — currently:

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './meridian-tokens.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

Change to:

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import './index.css'
import './meridian-tokens.css'
import App from './App.tsx'
import meridianTheme from './theme.ts'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={meridianTheme}>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
```

- [ ] **Step 4: Run the full verify gate**

Run: `cd frontend && npm run verify`
Expected: PASS — `tsc -b` clean, and every existing test still passes (this is pure styling layered onto already-tested components; no test should need updating for this task specifically).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/meridian-tokens.css frontend/src/theme.ts frontend/src/main.tsx
git commit -m "frontend: add central Meridian MUI theme and extend design tokens"
```

---

### Task 2: `DataTable` pager replacement

**Files:**
- Create: `frontend/src/components/DataTablePager.tsx`
- Create: `frontend/src/components/dataTablePager.css`
- Create: `frontend/src/components/DataTablePager.test.tsx`
- Modify: `frontend/src/components/DataTable.tsx`
- Modify: `frontend/src/components/DataTable.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1 directly (uses global CSS custom properties from `meridian-tokens.css`, already loaded app-wide).
- Produces: `DataTablePager` component with props `{ page: number; rowsPerPage: number; totalRows: number; onPageChange: (page: number) => void; onRowsPerPageChange: (rowsPerPage: number) => void; rowsPerPageOptions?: number[] }` (default `rowsPerPageOptions = [10, 25, 50]`). No later task consumes this directly.

This task assumes `frontend/src/components/DataTable.tsx` is exactly as it exists today: it renders `<TablePagination component="div" count={sorted.length} page={page} onPageChange={...} rowsPerPage={rowsPerPage} onRowsPerPageChange={...} rowsPerPageOptions={[10, 25, 50]} />` as the last child inside `<TableContainer component={Paper}>`.

- [ ] **Step 1: Write the failing tests for the new pager**

Create `frontend/src/components/DataTablePager.test.tsx`:

```typescript
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import DataTablePager from "./DataTablePager";

afterEach(cleanup);

describe("DataTablePager", () => {
  it("shows the correct range text for the current page", () => {
    render(<DataTablePager page={0} rowsPerPage={25} totalRows={42} onPageChange={vi.fn()} onRowsPerPageChange={vi.fn()} />);
    expect(screen.getByText("1–25 of 42")).toBeInTheDocument();
  });

  it("disables Previous on the first page and Next on the last page", () => {
    const { rerender } = render(
      <DataTablePager page={0} rowsPerPage={25} totalRows={42} onPageChange={vi.fn()} onRowsPerPageChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next page/i })).toBeEnabled();

    rerender(<DataTablePager page={1} rowsPerPage={25} totalRows={42} onPageChange={vi.fn()} onRowsPerPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /previous page/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
  });

  it("clicking Next calls onPageChange with the next page index", async () => {
    const onPageChange = vi.fn();
    render(<DataTablePager page={0} rowsPerPage={25} totalRows={42} onPageChange={onPageChange} onRowsPerPageChange={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /next page/i }));

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("clicking a rows-per-page option calls onRowsPerPageChange with that value", async () => {
    const onRowsPerPageChange = vi.fn();
    render(
      <DataTablePager page={0} rowsPerPage={25} totalRows={42} onPageChange={vi.fn()} onRowsPerPageChange={onRowsPerPageChange} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "10 rows per page" }));

    expect(onRowsPerPageChange).toHaveBeenCalledWith(10);
  });

  it("marks the active rows-per-page option", () => {
    render(<DataTablePager page={0} rowsPerPage={10} totalRows={42} onPageChange={vi.fn()} onRowsPerPageChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "10 rows per page" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "25 rows per page" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows 0 of 0 when there are no rows", () => {
    render(<DataTablePager page={0} rowsPerPage={25} totalRows={0} onPageChange={vi.fn()} onRowsPerPageChange={vi.fn()} />);
    expect(screen.getByText("0–0 of 0")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/DataTablePager.test.tsx`
Expected: FAIL — `Cannot find module './DataTablePager'`.

- [ ] **Step 3: Implement `DataTablePager`**

Create `frontend/src/components/dataTablePager.css`:

```css
.pager {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--muted);
}
.pager .pbtn {
  border: 1px solid var(--line-strong);
  background: var(--panel);
  border-radius: 6px;
  padding: 4px 10px;
  font-weight: 600;
  color: var(--text);
  font-size: 11.5px;
  font-family: inherit;
  cursor: pointer;
}
.pager .pbtn:hover:not(:disabled) {
  background: var(--groove);
}
.pager .pbtn:disabled {
  opacity: 0.4;
  cursor: default;
}
.pager .rng {
  font-variant-numeric: tabular-nums;
}
.pager .spacer {
  flex: 1;
}
.pager .prpp {
  display: flex;
  gap: 3px;
  background: var(--groove);
  padding: 2px;
  border-radius: 6px;
}
.pager .prpp button {
  border: 0;
  background: none;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--muted);
  padding: 3px 8px;
  border-radius: 4px;
  font-family: inherit;
  cursor: pointer;
}
.pager .prpp button.on {
  background: var(--panel);
  color: var(--accent-ink);
  box-shadow: var(--sh-sm);
}
```

Create `frontend/src/components/DataTablePager.tsx`:

```typescript
import "./dataTablePager.css";

export interface DataTablePagerProps {
  page: number;
  rowsPerPage: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  rowsPerPageOptions?: number[];
}

function DataTablePager({
  page, rowsPerPage, totalRows, onPageChange, onRowsPerPageChange, rowsPerPageOptions = [10, 25, 50],
}: DataTablePagerProps) {
  const from = totalRows === 0 ? 0 : page * rowsPerPage + 1;
  const to = Math.min(totalRows, page * rowsPerPage + rowsPerPage);
  const hasNextPage = to < totalRows;

  return (
    <div className="pager">
      <button
        type="button"
        className="pbtn"
        aria-label="Previous page"
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        ‹ Prev
      </button>
      <button
        type="button"
        className="pbtn"
        aria-label="Next page"
        disabled={!hasNextPage}
        onClick={() => onPageChange(page + 1)}
      >
        Next ›
      </button>
      <span className="rng">{from}–{to} of {totalRows}</span>
      <span className="spacer" />
      <div className="prpp">
        {rowsPerPageOptions.map((option) => (
          <button
            key={option}
            type="button"
            className={rowsPerPage === option ? "on" : ""}
            aria-label={`${option} rows per page`}
            aria-pressed={rowsPerPage === option}
            onClick={() => onRowsPerPageChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export default DataTablePager;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/DataTablePager.test.tsx`
Expected: PASS (6/6).

- [ ] **Step 5: Wire `DataTablePager` into `DataTable`**

In `frontend/src/components/DataTable.tsx`:

Remove `TablePagination` from the `@mui/material` import list (it becomes unused):

```typescript
import {
  Button, Checkbox, ClickAwayListener, FormControlLabel, IconButton, Menu, MenuItem, Paper, Popper, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, TextField, Typography,
} from "@mui/material";
import { exportRows } from "./dataTableExport";
import DataTablePager from "./DataTablePager";
```

Replace the existing `<TablePagination ... />` block with:

```tsx
        <DataTablePager
          page={page}
          rowsPerPage={rowsPerPage}
          totalRows={sorted.length}
          onPageChange={setPage}
          onRowsPerPageChange={(n) => { setRowsPerPage(n); setPage(0); }}
        />
```

- [ ] **Step 6: Add one integration test confirming the reset-to-page-0 behavior survives the swap**

Add this test to `frontend/src/components/DataTable.test.tsx`, in the `describe("DataTable", ...)` block, after the existing `"paginates: ..."` test:

```typescript
  it("changing rows-per-page resets pagination to the first page", async () => {
    const manyRows: Row[] = Array.from({ length: 30 }, (_, i) => ({ id: i, name: `Row ${i}` }));
    render(<DataTable columns={columns} rows={manyRows} rowKey={(r) => r.id} />);

    await userEvent.click(screen.getByRole("button", { name: /next page/i }));
    expect(screen.getByRole("button", { name: /previous page/i })).toBeEnabled();

    await userEvent.click(screen.getByRole("button", { name: "10 rows per page" }));

    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
  });
```

- [ ] **Step 7: Run the full `DataTable` suite to verify nothing regressed**

Run: `cd frontend && npx vitest run src/components/DataTable.test.tsx`
Expected: PASS — all existing tests (including the ones using `/next page/i`/`/previous page/i` regex matches against the old `TablePagination` labels) still pass unchanged, because `DataTablePager`'s buttons use the matching `aria-label`s (`"Previous page"`/`"Next page"`).

- [ ] **Step 8: Run the full verify gate**

Run: `cd frontend && npm run verify`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/DataTablePager.tsx frontend/src/components/dataTablePager.css frontend/src/components/DataTablePager.test.tsx frontend/src/components/DataTable.tsx frontend/src/components/DataTable.test.tsx
git commit -m "frontend: replace DataTable's MUI pager with a Meridian-styled one"
```

---

### Task 3: `AppSidebar` — widened labeled nav

**Files:**
- Modify: `frontend/src/components/AppSidebar.tsx`
- Create: `frontend/src/components/appSidebar.css`
- Modify: `frontend/src/components/AppSidebar.test.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing consumed by later tasks — this is a self-contained, presentational component.

This task assumes `frontend/src/components/AppSidebar.tsx` is exactly as it exists today: an MUI `Box` rendering `ITEMS.map(...)`, each item an emoji-only icon in a 36×36 tooltip-wrapped square, inside a 56px-wide rail.

- [ ] **Step 1: Write the failing test**

Modify `frontend/src/components/AppSidebar.test.tsx` — add this test after the existing one, inside the `describe("AppSidebar", ...)` block:

```typescript
  it("shows a section header and marks the active destination", () => {
    render(
      <MemoryRouter initialEntries={["/datasets"]}>
        <AppSidebar />
      </MemoryRouter>,
    );

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /datasets/i })).toHaveClass("active");
    expect(screen.getByRole("link", { name: /reports/i })).not.toHaveClass("active");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/components/AppSidebar.test.tsx`
Expected: FAIL — no element with text `"Overview"`, and no `active` class on any link (current markup uses inline `sx` background/color, not a class).

- [ ] **Step 3: Implement the widened labeled nav**

Create `frontend/src/components/appSidebar.css`:

```css
.app-nav {
  width: 200px;
  flex: 0 0 200px;
  background: var(--panel);
  border-right: 1px solid var(--line);
  padding: 14px 0;
}
.app-nav-group {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--faint);
  padding: 14px 18px 6px;
}
.app-nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 18px;
  color: var(--text);
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
  border-left: 2px solid transparent;
}
.app-nav-link:hover {
  background: var(--groove);
}
.app-nav-link.active {
  background: var(--accent-soft);
  border-left-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}
.app-nav-icon {
  width: 18px;
  flex: 0 0 18px;
  text-align: center;
}
```

Replace `frontend/src/components/AppSidebar.tsx` entirely with:

```typescript
import { Link, useLocation } from "react-router-dom";
import "./appSidebar.css";

const ITEMS = [
  { to: "/datasources", label: "Connections", icon: "🔌" },
  { to: "/datasets", label: "Datasets", icon: "📚" },
  { to: "/reports", label: "Reports", icon: "📊" },
];

function AppSidebar() {
  const location = useLocation();

  return (
    <nav className="app-nav">
      <div className="app-nav-group">Overview</div>
      {ITEMS.map((item) => {
        const active = location.pathname.startsWith(item.to);
        return (
          <Link key={item.to} to={item.to} className={"app-nav-link" + (active ? " active" : "")}>
            <span className="app-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default AppSidebar;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/AppSidebar.test.tsx`
Expected: PASS (2/2) — the pre-existing `href`-based test still passes since each `Link`'s accessible name (icon + label text) still contains "Connections"/"Datasets"/"Reports".

- [ ] **Step 5: Run the full verify gate**

Run: `cd frontend && npm run verify`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/AppSidebar.tsx frontend/src/components/appSidebar.css frontend/src/components/AppSidebar.test.tsx
git commit -m "frontend: widen AppSidebar into a labeled Meridian-styled nav"
```

---

### Task 4: `Ribbon` reuse (`readOnly` mode) + reportEditor chrome polish

**Files:**
- Modify: `frontend/src/reportEditor/Ribbon.tsx`
- Modify: `frontend/src/reportEditor/Ribbon.test.tsx`
- Modify: `frontend/src/pages/ReportView.tsx`
- Modify: `frontend/src/reportEditor/reportEditor.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `Ribbon`'s new `readOnly?: boolean` prop (default `false`) — no later task in this plan consumes it, but it's the mechanism Task 5 relies on being present when it later wires `crossFilter` props into the same `ReportView.tsx` file.

This task assumes `frontend/src/reportEditor/Ribbon.tsx`, `frontend/src/pages/ReportView.tsx`, and `frontend/src/reportEditor/reportEditor.css` are exactly as they exist today (read them before starting — `ReportView.tsx` currently has no ribbon at all; `Ribbon.tsx` is only used by `ReportCanvas.tsx` today, with no `readOnly` concept).

- [ ] **Step 1: Write the failing tests**

Add these 2 tests to `frontend/src/reportEditor/Ribbon.test.tsx`, inside the `describe("Ribbon", ...)` block, after the existing 2 tests:

```typescript
  it("readOnly hides the File/Insert/View menus and the Save button", () => {
    render(
      <Ribbon
        reportName="My Report"
        onRename={vi.fn()}
        onChangeDataSource={vi.fn()}
        onBackToReports={vi.fn()}
        onAddText={vi.fn()}
        onToggleFilters={vi.fn()}
        onRefresh={vi.fn()}
        onSave={vi.fn()}
        readOnly
      />,
    );

    expect(screen.queryByRole("button", { name: "File" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Insert" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("readOnly still shows the report name and a working Refresh button", async () => {
    const onRefresh = vi.fn();
    render(
      <Ribbon
        reportName="My Report"
        onRename={vi.fn()}
        onChangeDataSource={vi.fn()}
        onBackToReports={vi.fn()}
        onAddText={vi.fn()}
        onToggleFilters={vi.fn()}
        onRefresh={onRefresh}
        onSave={vi.fn()}
        readOnly
      />,
    );

    expect(screen.getByText("My Report")).toBeInTheDocument();
    await userEvent.click(screen.getByTitle("Refresh data"));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/reportEditor/Ribbon.test.tsx`
Expected: FAIL — `readOnly` prop doesn't exist yet, so the File/Insert/View/Save controls are still rendered unconditionally.

- [ ] **Step 3: Add the `readOnly` prop to `Ribbon`**

Modify `frontend/src/reportEditor/Ribbon.tsx` — replace the whole file with:

```typescript
import { useState } from "react";
import { Menu, MenuItem } from "@mui/material";
import "./reportEditor.css";

function Ribbon({
  reportName, onRename, onChangeDataSource, onBackToReports, onAddText, onToggleFilters, onRefresh, onSave,
  readOnly = false,
}: {
  reportName: string;
  onRename: () => void;
  onChangeDataSource: () => void;
  onBackToReports: () => void;
  onAddText: () => void;
  onToggleFilters: () => void;
  onRefresh: () => void;
  onSave: () => void;
  readOnly?: boolean;
}) {
  const [fileAnchor, setFileAnchor] = useState<HTMLElement | null>(null);
  const [insertAnchor, setInsertAnchor] = useState<HTMLElement | null>(null);
  const [viewAnchor, setViewAnchor] = useState<HTMLElement | null>(null);

  return (
    <div className="ribbon">
      <span className="ribbon-mark" aria-hidden="true" />
      <div className="brand">{reportName}</div>
      {!readOnly && (
        <div className="menu">
          <button onClick={(e) => setFileAnchor(e.currentTarget)}>File</button>
          <Menu anchorEl={fileAnchor} open={Boolean(fileAnchor)} onClose={() => setFileAnchor(null)}>
            <MenuItem onClick={() => { setFileAnchor(null); onRename(); }}>Rename report</MenuItem>
            <MenuItem onClick={() => { setFileAnchor(null); onChangeDataSource(); }}>Change data source</MenuItem>
            <MenuItem onClick={() => { setFileAnchor(null); onBackToReports(); }}>Back to Reports</MenuItem>
          </Menu>

          <button onClick={(e) => setInsertAnchor(e.currentTarget)}>Insert</button>
          <Menu anchorEl={insertAnchor} open={Boolean(insertAnchor)} onClose={() => setInsertAnchor(null)}>
            <MenuItem onClick={() => { setInsertAnchor(null); onAddText(); }}>Add Text widget</MenuItem>
          </Menu>

          <button onClick={(e) => setViewAnchor(e.currentTarget)}>View</button>
          <Menu anchorEl={viewAnchor} open={Boolean(viewAnchor)} onClose={() => setViewAnchor(null)}>
            <MenuItem onClick={() => { setViewAnchor(null); onToggleFilters(); }}>Toggle Filters pane</MenuItem>
          </Menu>
        </div>
      )}
      <div className="spacer" />
      <div className="tools">
        <button className="iconbtn" title="Refresh data" onClick={onRefresh}>⟳</button>
        {!readOnly && (
          <>
            <div className="divider-v" />
            <button className="btn-primary" onClick={onSave}>Save</button>
          </>
        )}
      </div>
    </div>
  );
}

export default Ribbon;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/reportEditor/Ribbon.test.tsx`
Expected: PASS (4/4) — including the 2 pre-existing tests (they don't pass `readOnly`, so it defaults to `false` and behaves exactly as before).

- [ ] **Step 5: Wire `Ribbon` into `ReportView.tsx`**

Modify `frontend/src/pages/ReportView.tsx`. Add the import, right after the existing `FiltersPane` import:

```typescript
import Ribbon from "../reportEditor/Ribbon";
```

Destructure `reportName` and `refresh` from `useReportQuery()` — change:

```typescript
  const {
    reportPageId, setReportPageId, reportPages, rawResult, filteredResult, filterState, setFilterState, loading: queryLoading,
  } = useReportQuery();
```

to:

```typescript
  const {
    reportName, reportPageId, setReportPageId, reportPages, rawResult, filteredResult, filterState, setFilterState,
    loading: queryLoading, refresh,
  } = useReportQuery();
```

Add the `<Ribbon>` element as the first child inside the outer `<div>`, right before the `{error && ...}` line:

```tsx
      <Ribbon
        reportName={reportName ?? "Report"}
        onRename={() => {}}
        onChangeDataSource={() => {}}
        onBackToReports={() => {}}
        onAddText={() => {}}
        onToggleFilters={() => {}}
        onRefresh={refresh}
        onSave={() => {}}
        readOnly
      />
```

- [ ] **Step 6: Polish `reportEditor.css`**

Add the ribbon logo mark, right after the existing `.ribbon { ... }` rule:

```css
.ribbon-mark {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  background: var(--accent);
  border-radius: 5px;
  display: inline-block;
}
```

Add a hover shadow to widget cards — insert this rule directly after the existing `.visual { ... }` rule and before `.visual.selected { ... }`:

```css
.visual:hover {
  box-shadow: var(--sh-md);
}
```

- [ ] **Step 7: Run the full verify gate**

Run: `cd frontend && npm run verify`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/reportEditor/Ribbon.tsx frontend/src/reportEditor/Ribbon.test.tsx frontend/src/pages/ReportView.tsx frontend/src/reportEditor/reportEditor.css
git commit -m "frontend: reuse Ribbon (read-only mode) on the Report Viewer, polish chrome"
```

---

### Task 5: `FiltersPane` — chip bar + cross-filter chip + reset link

**Files:**
- Modify: `frontend/src/reportEditor/FiltersPane.tsx`
- Modify: `frontend/src/reportEditor/FiltersPane.test.tsx`
- Modify: `frontend/src/reportEditor/reportEditor.css`
- Modify: `frontend/src/pages/ReportView.tsx`
- Modify: `frontend/src/pages/ReportCanvas.tsx`

**Interfaces:**
- Consumes: `--good-soft` (Task 1's token addition — this task's `.xfchip` CSS rule uses it, so Task 1 must have landed first).
- Produces: nothing consumed by later tasks — this is the last task in the plan.

This task assumes `frontend/src/reportEditor/FiltersPane.tsx`, `frontend/src/pages/ReportView.tsx` (as modified by Task 4), and `frontend/src/pages/ReportCanvas.tsx` are in their current, real state — read all three before starting. `filterState`'s shape (`Record<string, string[]>`) and `toggleCrossFilterValue` (in `frontend/src/reportEditor/clickToCrossFilter.ts`) do **not** change in this task; only a new, separate piece of state (`crossFilter: { field: string; value: string } | null`) is added alongside them, purely to let the UI distinguish "this value is selected because of a chart click" from "this value is selected because the user checked it," without changing how filtering itself works.

- [ ] **Step 1: Write the failing tests**

Add these 4 tests to `frontend/src/reportEditor/FiltersPane.test.tsx`, inside the `describe("FiltersPane", ...)` block, after the existing tests:

```typescript
  it("shows a cross-filter chip with the field and value when crossFilter is set", () => {
    render(
      <FiltersPane
        visible
        rawResult={result}
        filterState={{}}
        onChange={vi.fn()}
        crossFilter={{ field: "Region", value: "North" }}
        onClearCrossFilter={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    expect(screen.getByText("Region")).toBeInTheDocument();
    expect(screen.getByText(/North/)).toBeInTheDocument();
  });

  it("clicking the cross-filter chip's clear button calls onClearCrossFilter", async () => {
    const onClearCrossFilter = vi.fn();
    render(
      <FiltersPane
        visible
        rawResult={result}
        filterState={{}}
        onChange={vi.fn()}
        crossFilter={{ field: "Region", value: "North" }}
        onClearCrossFilter={onClearCrossFilter}
        onResetAll={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear cross-filter" }));

    expect(onClearCrossFilter).toHaveBeenCalledTimes(1);
  });

  it("shows a Reset filters link when a filter is active, and calls onResetAll when clicked", async () => {
    const onResetAll = vi.fn();
    render(
      <FiltersPane
        visible
        rawResult={result}
        filterState={{ Region: ["North"] }}
        onChange={vi.fn()}
        onResetAll={onResetAll}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(onResetAll).toHaveBeenCalledTimes(1);
  });

  it("does not show a Reset filters link when nothing is active", () => {
    render(<FiltersPane visible rawResult={result} filterState={{}} onChange={vi.fn()} onResetAll={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Reset filters" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/reportEditor/FiltersPane.test.tsx`
Expected: FAIL — `crossFilter`/`onClearCrossFilter`/`onResetAll` props don't exist yet, no chip or reset link is rendered.

- [ ] **Step 3: Implement the chip bar, cross-filter chip, and reset link**

Replace `frontend/src/reportEditor/FiltersPane.tsx` entirely with:

```typescript
import type { QueryResult } from "../api/datasets";
import { classify } from "../widgets/fieldClassification";
import { normalizeCell } from "./crossFilter";
import "./reportEditor.css";

function distinctValues(result: QueryResult, field: string): string[] {
  const index = result.columns.findIndex((c) => c.name === field);
  const values = new Set(result.rows.map((row) => normalizeCell(row[index])));
  return [...values].sort();
}

function FiltersPane({
  visible, rawResult, filterState, onChange, crossFilter, onClearCrossFilter, onResetAll,
}: {
  visible: boolean;
  rawResult: QueryResult | null;
  filterState: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  crossFilter?: { field: string; value: string } | null;
  onClearCrossFilter?: () => void;
  onResetAll?: () => void;
}) {
  if (!visible) {
    return null;
  }

  if (!rawResult) {
    return (
      <div className="pane pane-filters">
        <div className="pane-head">Filters</div>
        <div className="filters-empty">No data to filter yet — define this report's query first.</div>
      </div>
    );
  }

  const categoricalFields = rawResult.columns.filter((c) => classify(c.nativeType) === "Categorical");
  const hasActiveFilters = Object.values(filterState).some((values) => values.length > 0) || Boolean(crossFilter);

  function toggle(field: string, value: string, checked: boolean) {
    const current = filterState[field] ?? [];
    const next = checked ? [...current, value] : current.filter((v) => v !== value);
    onChange({ ...filterState, [field]: next });
  }

  return (
    <div className="pane pane-filters">
      <div className="pane-head">Filters</div>
      <div className="pane-scroll">
        <div className="filter-scope">Filters on this page</div>
        {crossFilter && (
          <div className="xfchip">
            <span><b>{crossFilter.field}</b>: {crossFilter.value}</span>
            <button type="button" className="x" aria-label="Clear cross-filter" onClick={onClearCrossFilter}>✕</button>
          </div>
        )}
        {hasActiveFilters && onResetAll && (
          <button type="button" className="resetf" onClick={onResetAll}>Reset filters</button>
        )}
        {categoricalFields.map((column) => (
          <div className="filter-group" key={column.name}>
            <div className="filter-group-label">{column.name}</div>
            <div className="filter-group-opts">
              {distinctValues(rawResult, column.name).map((value) => (
                <label className="opt" key={value}>
                  <input
                    type="checkbox"
                    checked={(filterState[column.name] ?? []).includes(value)}
                    onChange={(e) => toggle(column.name, value, e.target.checked)}
                  />
                  <span>{value === "" ? "(blank)" : value}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FiltersPane;
```

- [ ] **Step 4: Update `reportEditor.css`**

Remove the now-unused `.filter-card`/`.opts`/`.opt` rules (the `<details>`-based collapsible-group styling) — delete these rules:

```css
.filter-card {
  margin: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
}
.filter-card > summary {
  list-style: none;
  cursor: pointer;
  padding: 9px 11px;
  font-weight: 500;
  background: var(--panel-2);
}
.filter-card > summary::-webkit-details-marker {
  display: none;
}
.filter-card .opts {
  padding: 6px 11px 10px;
}
.opt {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  color: var(--text);
  cursor: pointer;
}
.opt input {
  accent-color: var(--accent);
  width: 14px;
  height: 14px;
}
```

Replace them with:

```css
.filter-group {
  margin: 10px 10px 4px;
}
.filter-group-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--faint);
  margin-bottom: 6px;
}
.filter-group-opts {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.opt {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.opt input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.opt span {
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--line-strong);
  background: var(--panel);
  color: var(--muted);
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
}
.opt:has(input:checked) span {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.xfchip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 10px 0;
  background: var(--good-soft);
  border: 1px solid #bfe9e0;
  color: var(--good);
  border-radius: 20px;
  font-size: 11.5px;
  font-weight: 600;
  padding: 4px 6px 4px 12px;
  width: fit-content;
}
.xfchip .x {
  border: 0;
  background: rgba(18, 165, 148, 0.15);
  color: var(--good);
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 11px;
  cursor: pointer;
}
.xfchip .x:hover {
  background: rgba(18, 165, 148, 0.28);
}
.resetf {
  display: block;
  margin: 8px 10px 0;
  border: 0;
  background: none;
  color: var(--accent-ink);
  font-size: 11.5px;
  font-weight: 600;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
}
.resetf:hover {
  background: var(--accent-soft);
}
```

- [ ] **Step 5: Run the `FiltersPane` suite to verify everything passes**

Run: `cd frontend && npx vitest run src/reportEditor/FiltersPane.test.tsx`
Expected: PASS — all pre-existing tests (checking/unchecking a value, the empty-state message, null-cell normalization, the "(blank)" label) still pass unchanged, since the checkbox input + its `checked`/`onChange` wiring are untouched — only the surrounding markup/CSS changed. Plus the 4 new tests.

- [ ] **Step 6: Wire the new cross-filter state into `ReportView.tsx`**

Modify `frontend/src/pages/ReportView.tsx`. Add the import, alongside the existing ones:

```typescript
import { useState } from "react";
```

(Check the existing import line first — `ReportView.tsx` already imports `useEffect, useState` from `"react"` as of Task 4's changes; if `useState` is already there, skip this step.)

Add new state, right after the existing `useState<string | null>(null)` for `error`:

```typescript
  const [crossFilter, setCrossFilter] = useState<{ field: string; value: string } | null>(null);
```

Add these two handler functions, right before the `if (queryLoading)` early return:

```typescript
  function handleDataPointClick(field: string, value: string) {
    setFilterState(toggleCrossFilterValue(filterState, field, value));
    setCrossFilter((prev) => (prev && prev.field === field && prev.value === value ? null : { field, value }));
  }

  function handleClearCrossFilter() {
    if (!crossFilter) {
      return;
    }
    setFilterState(toggleCrossFilterValue(filterState, crossFilter.field, crossFilter.value));
    setCrossFilter(null);
  }

  function handleResetAllFilters() {
    setFilterState({});
    setCrossFilter(null);
  }
```

Update the `<FiltersPane>` element:

```tsx
        <FiltersPane
          visible
          rawResult={rawResult}
          filterState={filterState}
          onChange={setFilterState}
          crossFilter={crossFilter}
          onClearCrossFilter={handleClearCrossFilter}
          onResetAll={handleResetAllFilters}
        />
```

Update the `<WidgetRenderer>` element's `onDataPointClick` prop:

```tsx
                  <WidgetRenderer
                    widget={w}
                    result={filteredResult}
                    onDataPointClick={handleDataPointClick}
                  />
```

- [ ] **Step 7: Mirror the same wiring into `ReportCanvas.tsx`**

Modify `frontend/src/pages/ReportCanvas.tsx` the same way: add a `crossFilter` state (alongside the existing `filtersVisible`/`railView` state declarations), the same 3 handler functions, and update its own `<FiltersPane>` and `<WidgetRenderer onDataPointClick={...}>` usages to match — read the file first to find the exact current lines (its `<FiltersPane>` and widget-click-handling code is structured similarly to `ReportView.tsx`'s pre-Task-5 version, but is not identical, so match against what's actually there rather than assuming line numbers).

- [ ] **Step 8: Run the full verify gate**

Run: `cd frontend && npm run verify`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/reportEditor/FiltersPane.tsx frontend/src/reportEditor/FiltersPane.test.tsx frontend/src/reportEditor/reportEditor.css frontend/src/pages/ReportView.tsx frontend/src/pages/ReportCanvas.tsx
git commit -m "frontend: convert FiltersPane to a chip bar with a distinct cross-filter chip"
```

- [ ] **Step 10: Manual smoke test note (no browser in this environment)**

Whoever next has browser access should open: a management page (confirm the labeled nav + MUI theme look), the Report Viewer (confirm the read-only Ribbon with a working Refresh, and the DataTable pager on any table widget), and the Report Designer (confirm the widget-card hover shadow, the filter chip bar, and clicking a chart to see a real green cross-filter chip appear with a working "✕" and "Reset filters").

---

## Self-Review Notes

- **Spec coverage**: every design-doc section has a task — foundation/theme (Task 1), `DataTable` pager (Task 2), management-page nav (Task 3), Ribbon reuse + chrome polish (Task 4), `FiltersPane` chip bar + cross-filter chip (Task 5, including the small new `crossFilter` state addition agreed during planning). The out-of-scope list (backend rewrite, pixel-perfect fidelity, GridStack/echarts/data-model changes) has no corresponding task, correctly.
- **Placeholder scan**: no TBD/TODO; every step has complete, runnable code, except Task 5 Step 7's `ReportCanvas.tsx` mirroring, which is explicitly flagged as "match against the real file" rather than assumed line numbers — `ReportCanvas.tsx` is a large, actively-evolving file where fixed line numbers would likely be stale by the time this task runs; the instruction to read it first and mirror `ReportView.tsx`'s pattern is a deliberate, bounded exception, not a placeholder.
- **Type consistency**: `crossFilter: { field: string; value: string } | null` has the identical shape everywhere it's threaded (`FiltersPane`'s prop, `ReportView.tsx`'s state, the wiring described for `ReportCanvas.tsx`). `DataTablePager`'s prop names/types match between Task 2's component definition and its `DataTable.tsx` call site.
- **Scope check**: 5 tasks. Task 1 has no dependency on any other task. Tasks 2 and 3 depend only on Task 1 having landed (global theme applied) but touch entirely disjoint files, so could run in parallel in a different execution model. Task 4 depends only on Task 1. Task 5 depends on Task 1 (the `--good-soft` token) and Task 4 (both modify `ReportView.tsx`; Task 5 builds on Task 4's `Ribbon` wiring being in place) — this plan lists all 5 sequentially, and Task 5 must run last.
