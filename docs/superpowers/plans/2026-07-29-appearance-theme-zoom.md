# Appearance Settings (Light/Dark Theme + Per-Theme Zoom) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Appearance settings surface (Light/Dark theme + a 4-step, per-theme-remembered zoom) to the open-reporting-platform frontend, backed by `localStorage`, with dark-mode-aware variants of the 4 named chart color palettes.

**Architecture:** A new `AppearanceContext` (React context) is the single source of truth for `{ mode, zoomByTheme }`, persisted to `localStorage` and applied to the DOM via a `data-theme` attribute (drives dark CSS custom properties) and a root `font-size` percentage (drives `rem`-based zoom). The existing static MUI theme becomes a `buildTheme(mode)` factory; the existing flat chart-palette map becomes theme-keyed; a shared `AppearanceMenu` component (Light/Dark toggle + zoom steps) is rendered in both `AppSidebar` and `Ribbon`, the app's two independent top-level chrome components.

**Tech Stack:** React 19 + TypeScript (`verbatimModuleSyntax: true`), MUI 9, Vitest + React Testing Library, plain CSS custom properties (no CSS-in-JS beyond MUI's own).

## Global Constraints

- Repo root: `C:\Users\Mulham\source\repos\open-reporting-platform`. All paths below are relative to `frontend/` unless stated otherwise.
- `verbatimModuleSyntax: true` is on — every type-only import MUST use `import type { X } from "..."` (mixing a type into a regular `import { X }` fails the build).
- Verify each task with `npm run verify` (runs `tsc -b && vitest run`) from the `frontend/` directory before committing.
- Vitest's `testTimeout` is 10000ms (already configured in `vite.config.ts`) — no per-test timeout overrides should be needed.
- Commit messages: lowercase imperative, prefixed `frontend: ...` (or `docs: ...` for spec/plan files). No AI attribution, no `Co-Authored-By` line — this project's own convention, confirmed via `git log`.
- Spec: `docs/superpowers/specs/2026-07-29-appearance-theme-zoom-design.md` — read it before starting; it has the full rationale and the complete dark-token/dark-palette color tables this plan implements verbatim.
- No backend changes in this plan — everything is `localStorage`-only, confirmed there is no user/settings model anywhere in `backend/`.

---

### Task 1: `AppearanceContext` — state, localStorage persistence, DOM effects

**Files:**
- Create: `frontend/src/appearance/AppearanceContext.tsx`
- Test: `frontend/src/appearance/AppearanceContext.test.tsx`

**Interfaces:**
- Produces: `ThemeMode = "light" | "dark"`, `ZoomLevel = 90 | 100 | 110 | 125`, `AppearanceProvider` (component, prop `children: ReactNode`), `useAppearance(): { mode: ThemeMode; zoomByTheme: Record<ThemeMode, ZoomLevel>; setMode: (mode: ThemeMode) => void; setZoom: (zoom: ZoomLevel) => void }`. Every later task imports these exact names from `"../appearance/AppearanceContext"` (or `"./AppearanceContext"` from within the `appearance/` folder).

- [ ] **Step 1: Write the failing test file**

Create `frontend/src/appearance/AppearanceContext.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider, useAppearance } from "./AppearanceContext";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.fontSize = "";
});

function Probe() {
  const { mode, zoomByTheme, setMode, setZoom } = useAppearance();
  return (
    <div>
      <div>mode: {mode}</div>
      <div>zoom: {zoomByTheme[mode]}</div>
      <div>light zoom: {zoomByTheme.light}</div>
      <div>dark zoom: {zoomByTheme.dark}</div>
      <button onClick={() => setMode("dark")}>go dark</button>
      <button onClick={() => setMode("light")}>go light</button>
      <button onClick={() => setZoom(110)}>zoom 110</button>
    </div>
  );
}

describe("AppearanceProvider", () => {
  it("defaults to light mode and 100% zoom for both themes when localStorage is empty", () => {
    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    expect(screen.getByText("mode: light")).toBeInTheDocument();
    expect(screen.getByText("zoom: 100")).toBeInTheDocument();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.fontSize).toBe("100%");
  });

  it("reads a previously-stored theme and zoom from localStorage", () => {
    window.localStorage.setItem("orp.theme", "dark");
    window.localStorage.setItem("orp.zoom", JSON.stringify({ light: 100, dark: 125 }));

    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    expect(screen.getByText("mode: dark")).toBeInTheDocument();
    expect(screen.getByText("zoom: 125")).toBeInTheDocument();
    expect(document.documentElement.style.fontSize).toBe("125%");
  });

  it("setMode updates state, localStorage, and the data-theme attribute", async () => {
    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    await userEvent.click(screen.getByText("go dark"));

    expect(screen.getByText("mode: dark")).toBeInTheDocument();
    expect(window.localStorage.getItem("orp.theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("setZoom only changes the current mode's stored zoom, leaving the other theme's untouched", async () => {
    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    await userEvent.click(screen.getByText("zoom 110"));

    expect(screen.getByText("light zoom: 110")).toBeInTheDocument();
    expect(screen.getByText("dark zoom: 100")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem("orp.zoom")!)).toEqual({ light: 110, dark: 100 });
  });

  it("switching theme applies that theme's own remembered zoom", async () => {
    window.localStorage.setItem("orp.zoom", JSON.stringify({ light: 90, dark: 125 }));
    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    await userEvent.click(screen.getByText("go dark"));

    expect(screen.getByText("zoom: 125")).toBeInTheDocument();
    expect(document.documentElement.style.fontSize).toBe("125%");
  });

  it("falls back to defaults when localStorage holds malformed JSON for zoom", () => {
    window.localStorage.setItem("orp.zoom", "not json{");

    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    expect(screen.getByText("zoom: 100")).toBeInTheDocument();
  });

  it("falls back to defaults when localStorage.getItem throws", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });

    render(<AppearanceProvider><Probe /></AppearanceProvider>);

    expect(screen.getByText("mode: light")).toBeInTheDocument();
    expect(screen.getByText("zoom: 100")).toBeInTheDocument();
    spy.mockRestore();
  });

  it("useAppearance throws when used outside an AppearanceProvider", () => {
    function Bare() {
      useAppearance();
      return null;
    }
    expect(() => render(<Bare />)).toThrow("useAppearance must be used within an AppearanceProvider");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `frontend/`): `npx vitest run src/appearance/AppearanceContext.test.tsx`
Expected: FAIL — `Cannot find module './AppearanceContext'` (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `frontend/src/appearance/AppearanceContext.tsx`:

```tsx
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemeMode = "light" | "dark";
export type ZoomLevel = 90 | 100 | 110 | 125;

export interface ZoomByTheme {
  light: ZoomLevel;
  dark: ZoomLevel;
}

export interface AppearanceContextValue {
  mode: ThemeMode;
  zoomByTheme: ZoomByTheme;
  setMode: (mode: ThemeMode) => void;
  setZoom: (zoom: ZoomLevel) => void;
}

const THEME_KEY = "orp.theme";
const ZOOM_KEY = "orp.zoom";
const DEFAULT_ZOOM_BY_THEME: ZoomByTheme = { light: 100, dark: 100 };
const VALID_ZOOM_LEVELS: ZoomLevel[] = [90, 100, 110, 125];

function isZoomLevel(value: unknown): value is ZoomLevel {
  return typeof value === "number" && (VALID_ZOOM_LEVELS as number[]).includes(value);
}

function readMode(): ThemeMode {
  try {
    return window.localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function readZoomByTheme(): ZoomByTheme {
  try {
    const stored = window.localStorage.getItem(ZOOM_KEY);
    if (!stored) {
      return DEFAULT_ZOOM_BY_THEME;
    }
    const parsed = JSON.parse(stored) as Partial<ZoomByTheme>;
    return {
      light: isZoomLevel(parsed.light) ? parsed.light : 100,
      dark: isZoomLevel(parsed.dark) ? parsed.dark : 100,
    };
  } catch {
    return DEFAULT_ZOOM_BY_THEME;
  }
}

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(readMode);
  const [zoomByTheme, setZoomByTheme] = useState<ZoomByTheme>(readZoomByTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", mode);
    document.documentElement.style.fontSize = `${zoomByTheme[mode]}%`;
  }, [mode, zoomByTheme]);

  function setMode(next: ThemeMode) {
    setModeState(next);
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // localStorage unavailable (e.g. private browsing) — in-memory state still updates.
    }
  }

  function setZoom(zoom: ZoomLevel) {
    setZoomByTheme((prev) => {
      const next = { ...prev, [mode]: zoom };
      try {
        window.localStorage.setItem(ZOOM_KEY, JSON.stringify(next));
      } catch {
        // localStorage unavailable — in-memory state still updates.
      }
      return next;
    });
  }

  const value: AppearanceContextValue = { mode, zoomByTheme, setMode, setZoom };

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance(): AppearanceContextValue {
  const context = useContext(AppearanceContext);
  if (!context) {
    throw new Error("useAppearance must be used within an AppearanceProvider");
  }
  return context;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/appearance/AppearanceContext.test.tsx`
Expected: `Test Files 1 passed (1)`, `Tests 8 passed (8)`.

- [ ] **Step 5: Type-check**

Run: `npx tsc -b`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/appearance/AppearanceContext.tsx frontend/src/appearance/AppearanceContext.test.tsx
git commit -m "frontend: add AppearanceContext for theme mode and per-theme zoom, persisted to localStorage"
```

---

### Task 2: MUI theme factory + dark CSS tokens + wire up `main.tsx`

**Files:**
- Modify: `frontend/src/theme.ts` (currently exports a single `meridianTheme` object — see full current content below)
- Test: `frontend/src/theme.test.ts` (new)
- Modify: `frontend/src/meridian-tokens.css`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: `ThemeMode` from `./appearance/AppearanceContext` (Task 1), `AppearanceProvider`/`useAppearance` from the same module.
- Produces: `buildTheme(mode: ThemeMode): Theme`, a named export from `theme.ts` (replaces the old default export `meridianTheme` — there are no other consumers of the old default export besides `main.tsx`, confirmed via repo-wide search).

- [ ] **Step 1: Write the failing test file**

Create `frontend/src/theme.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildTheme } from "./theme";

describe("buildTheme", () => {
  it("builds a light theme with the existing Meridian light colors", () => {
    const theme = buildTheme("light");

    expect(theme.palette.mode).toBe("light");
    expect(theme.palette.primary.main).toBe("#5b4fe6");
    expect(theme.palette.background.default).toBe("#e7eaf1");
    expect(theme.palette.background.paper).toBe("#ffffff");
    expect(theme.palette.text.primary).toBe("#1b1e27");
  });

  it("builds a dark theme with distinct, dark-appropriate colors", () => {
    const theme = buildTheme("dark");

    expect(theme.palette.mode).toBe("dark");
    expect(theme.palette.primary.main).toBe("#7b70f0");
    expect(theme.palette.background.default).toBe("#14151c");
    expect(theme.palette.background.paper).toBe("#1b1e27");
    expect(theme.palette.text.primary).toBe("#e7e9ee");
  });

  it("keeps the same typography and shape configuration across both modes", () => {
    const light = buildTheme("light");
    const dark = buildTheme("dark");

    expect(light.typography.fontFamily).toBe(dark.typography.fontFamily);
    expect(light.shape.borderRadius).toBe(dark.shape.borderRadius);
  });

  it("uses distinct MuiTableCell head background colors per mode", () => {
    const light = buildTheme("light");
    const dark = buildTheme("dark");

    const lightHead = light.components?.MuiTableCell?.styleOverrides?.head as { background: string };
    const darkHead = dark.components?.MuiTableCell?.styleOverrides?.head as { background: string };
    expect(lightHead.background).toBe("#f6f7f9");
    expect(darkHead.background).toBe("#20232d");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/theme.test.ts`
Expected: FAIL — `buildTheme is not a function` (or "no exported member `buildTheme`").

- [ ] **Step 3: Replace `theme.ts`'s content**

Current full content of `frontend/src/theme.ts`:

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
        root: { padding: "6px 9px", fontSize: "0.71875rem", borderBottom: "1px solid #eef0f4" },
        head: {
          color: "#6c7480",
          fontWeight: 600,
          background: "#f6f7f9",
          padding: "7px 9px",
          borderBottom: "1.5px solid #cfd5e0",
          position: "sticky",
          top: 0,
          zIndex: 1,
        },
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

Replace it entirely with:

```typescript
import { createTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import type { ThemeMode } from "./appearance/AppearanceContext";

interface PaletteColors {
  primaryMain: string;
  primaryDark: string;
  backgroundDefault: string;
  backgroundPaper: string;
  textPrimary: string;
  textSecondary: string;
  paperBorder: string;
  tableCellBorder: string;
  tableHeadColor: string;
  tableHeadBackground: string;
  tableHeadBorder: string;
  tableRowHoverBackground: string;
}

const LIGHT_COLORS: PaletteColors = {
  primaryMain: "#5b4fe6",
  primaryDark: "#4a3fd6",
  backgroundDefault: "#e7eaf1",
  backgroundPaper: "#ffffff",
  textPrimary: "#1b1e27",
  textSecondary: "#6c7480",
  paperBorder: "#e3e7ef",
  tableCellBorder: "#eef0f4",
  tableHeadColor: "#6c7480",
  tableHeadBackground: "#f6f7f9",
  tableHeadBorder: "#cfd5e0",
  tableRowHoverBackground: "#edeafc",
};

const DARK_COLORS: PaletteColors = {
  primaryMain: "#7b70f0",
  primaryDark: "#8f86f5",
  backgroundDefault: "#14151c",
  backgroundPaper: "#1b1e27",
  textPrimary: "#e7e9ee",
  textSecondary: "#9aa1ad",
  paperBorder: "#2f333f",
  tableCellBorder: "#2f333f",
  tableHeadColor: "#9aa1ad",
  tableHeadBackground: "#20232d",
  tableHeadBorder: "#3d4250",
  tableRowHoverBackground: "#2a2650",
};

export function buildTheme(mode: ThemeMode): Theme {
  const colors = mode === "dark" ? DARK_COLORS : LIGHT_COLORS;

  return createTheme({
    palette: {
      mode,
      primary: { main: colors.primaryMain, dark: colors.primaryDark },
      background: { default: colors.backgroundDefault, paper: colors.backgroundPaper },
      text: { primary: colors.textPrimary, secondary: colors.textSecondary },
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
    ] as unknown as Theme["shadows"],
    components: {
      MuiPaper: {
        styleOverrides: {
          root: { border: `1px solid ${colors.paperBorder}` },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { padding: "6px 9px", fontSize: "0.71875rem", borderBottom: `1px solid ${colors.tableCellBorder}` },
          head: {
            color: colors.tableHeadColor,
            fontWeight: 600,
            background: colors.tableHeadBackground,
            padding: "7px 9px",
            borderBottom: `1.5px solid ${colors.tableHeadBorder}`,
            position: "sticky",
            top: 0,
            zIndex: 1,
          },
        },
      },
      MuiTableRow: {
        styleOverrides: {
          root: {
            "&:hover td": { background: colors.tableRowHoverBackground },
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
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/theme.test.ts`
Expected: `Test Files 1 passed (1)`, `Tests 4 passed (4)`.

- [ ] **Step 5: Add the dark token block to `meridian-tokens.css`**

Current full content of `frontend/src/meridian-tokens.css`:

```css
:root {
  --ink: #15171e;
  --rail: #1b1e27;
  --rail-hover: #2a2e3a;
  --rail-line: #2f333f;
  --panel: #ffffff;
  --panel-2: #f6f7f9;
  --groove: #eef0f4;
  --line: #e3e7ef;
  --line-strong: #cfd5e0;
  --canvas: #e7eaf1;
  --page: #ffffff;
  --text: #1b1e27;
  --muted: #6c7480;
  --faint: #9aa1ad;
  --accent: #5b4fe6;
  --accent-ink: #4a3fd6;
  --accent-soft: #edeafc;
  --accent-line: #c9c2f7;
  --good: #12a594;
  --warn: #e5843a;
  --good-soft: #e2f6f2;
  --warn-soft: #fdefe2;
  --bad: #e5484d;
  --bad-soft: #fdecec;
  --sh-sm: 0 1px 2px rgba(20, 24, 40, 0.06), 0 1px 1px rgba(20, 24, 40, 0.04);
  --sh-md: 0 4px 14px rgba(20, 24, 40, 0.1), 0 1px 3px rgba(20, 24, 40, 0.06);
  --r: 8px;
}

body {
  font-family: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--text);
}

.mono {
  font-family: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
```

Insert a new block immediately after the closing `}` of the existing `:root { ... }` block (i.e. right before the blank line that precedes `body {`):

```css
:root[data-theme="dark"] {
  --ink: #e7e9ee;
  --rail: #0f1015;
  --rail-hover: #1a1c24;
  --rail-line: #22242e;
  --panel: #1b1e27;
  --panel-2: #20232d;
  --groove: #252834;
  --line: #2f333f;
  --line-strong: #3d4250;
  --canvas: #14151c;
  --page: #1b1e27;
  --text: #e7e9ee;
  --muted: #9aa1ad;
  --faint: #6c7480;
  --accent: #7b70f0;
  --accent-ink: #8f86f5;
  --accent-soft: #2a2650;
  --accent-line: #4b3f8f;
  --good: #2dd4bf;
  --warn: #f5a35c;
  --good-soft: #123330;
  --warn-soft: #3a2a18;
  --bad: #f2777a;
  --bad-soft: #3a1e1f;
}
```

(`--sh-sm`, `--sh-md`, `--r` are intentionally omitted from this block — they're unchanged in dark mode, so they simply keep falling through to the base `:root` values.)

- [ ] **Step 6: Wire `main.tsx` to `AppearanceProvider` + `buildTheme`**

Current full content of `frontend/src/main.tsx`:

```tsx
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

Replace it entirely with:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material/styles'
import './index.css'
import './meridian-tokens.css'
import App from './App.tsx'
import { buildTheme } from './theme.ts'
import { AppearanceProvider, useAppearance } from './appearance/AppearanceContext'

function ThemedApp() {
  const { mode } = useAppearance()
  return (
    <ThemeProvider theme={buildTheme(mode)}>
      <App />
    </ThemeProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppearanceProvider>
      <ThemedApp />
    </AppearanceProvider>
  </StrictMode>,
)
```

- [ ] **Step 7: Type-check and run the full suite**

Run: `npx tsc -b && npx vitest run`
Expected: build succeeds; all existing tests still pass (no existing test imports `theme.ts`'s old default export or `main.tsx`).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/theme.ts frontend/src/theme.test.ts frontend/src/meridian-tokens.css frontend/src/main.tsx
git commit -m "frontend: turn the MUI theme into a light/dark buildTheme factory, add dark CSS tokens"
```

---

### Task 3: Zoom — convert font-size (and co-located padding) to `rem` across 4 CSS files

**Files:**
- Modify: `frontend/src/reportEditor/reportEditor.css` (31 declarations)
- Modify: `frontend/src/components/appSidebar.css` (2 declarations)
- Modify: `frontend/src/components/dataTablePager.css` (3 declarations)
- Modify: `frontend/src/pages/sqlEditor.css` (1 declaration)

**Interfaces:** None — pure CSS, no exports/imports change. No other task depends on this one; it can run in any order relative to Tasks 1–2 and 4–5.

**Conversion rule (apply mechanically, no exceptions):** every `font-size: Npx` becomes `font-size: (N/16)rem`. If — and only if — the *same rule block* also declares `padding` or a `padding-*` longhand, convert that value(s) too, using the same `N/16` division per number. Do **not** touch `margin`, `gap`, `width`, `height`, or any other property, even in the same rule — this is a targeted text-and-its-immediate-padding conversion, not a full unit rewrite (per the spec's explicit scope).

- [ ] **Step 1: Confirm the starting count**

Run: `grep -rn "font-size:\s*[0-9.]*px" frontend/src/reportEditor/reportEditor.css frontend/src/components/appSidebar.css frontend/src/components/dataTablePager.css frontend/src/pages/sqlEditor.css | wc -l`
Expected: `37`

- [ ] **Step 2: Convert `frontend/src/reportEditor/reportEditor.css`**

Apply these 31 exact replacements (old block → new block; every other line in each block is unchanged and shown only for unambiguous matching):

1.
```css
  font-size: 15px;
```
→ (inside `.brand`, also convert `padding-right: 14px;` → `padding-right: 0.875rem;`)
```css
  padding-right: 0.875rem;
```
```css
  font-size: 0.9375rem;
```

2. `.menu button`: `font-size: 13px;` → `font-size: 0.8125rem;`; `padding: 7px 10px;` → `padding: 0.4375rem 0.625rem;`

3. `.btn-primary`: `font-size: 13px;` → `font-size: 0.8125rem;`; `padding: 8px 15px;` → `padding: 0.5rem 0.9375rem;`

4. `.stagebar`: `font-size: 12px;` → `font-size: 0.75rem;`; `padding: 0 14px;` → `padding: 0 0.875rem;`

5. `.canvas-empty b`: `font-size: 14px;` → `font-size: 0.875rem;` (no padding in this rule)

6. `.ptab`: `font-size: 12.5px;` → `font-size: 0.78125rem;`; `padding: 0 10px;` → `padding: 0 0.625rem;`

7. `.pane-head`: `font-size: 12.5px;` → `font-size: 0.78125rem;`; `padding: 0 12px;` → `padding: 0 0.75rem;`

8. `.buildtab`: `font-size: 12.5px;` → `font-size: 0.78125rem;`; `padding: 8px 0 9px;` → `padding: 0.5rem 0 0.5625rem;`

9. `.no-visual`: `font-size: 12px;` → `font-size: 0.75rem;`; `padding: 16px 12px;` → `padding: 1rem 0.75rem;`

10. `.well-label`: `font-size: 11px;` → `font-size: 0.6875rem;` (no padding in this rule — `margin: 0 0 5px;` stays untouched)

11. `.well-box .hint`: `font-size: 11.5px;` → `font-size: 0.71875rem;`; `padding: 5px 6px;` → `padding: 0.3125rem 0.375rem;`

12. `.pill`: `font-size: 12px;` → `font-size: 0.75rem;`; `padding: 5px 7px;` → `padding: 0.3125rem 0.4375rem;`

13. `.pill .gl`: `font-size: 10px;` → `font-size: 0.625rem;` (no padding in this rule)

14. `.data-search input`: `font-size: 12.5px;` → `font-size: 0.78125rem;`; `padding: 7px 9px;` → `padding: 0.4375rem 0.5625rem;`

15. `.field-row .fgl`: `font-size: 9px;` → `font-size: 0.5625rem;` (no padding in this rule)

16. `.field-row .fname`: `font-size: 12.5px;` → `font-size: 0.78125rem;` (no padding in this rule)

17. `.frow label`: `font-size: 12.5px;` → `font-size: 0.78125rem;` (no padding in this rule)

18. `.text-in`: `font-size: 12.5px;` → `font-size: 0.78125rem;`; `padding: 7px 9px;` → `padding: 0.4375rem 0.5625rem;`

19. `.fbtn`: `font-size: 12.5px;` → `font-size: 0.78125rem;`; `padding: 6px 12px;` → `padding: 0.375rem 0.75rem;`

20. `.facc-row .fname`: `font-size: 12.5px;` → `font-size: 0.78125rem;` (no padding in this rule)

21. `.rename-badge`: `font-size: 9.5px;` → `font-size: 0.59375rem;`; `padding: 1px 5px;` → `padding: 0.0625rem 0.3125rem;`

22. `.facc-row .cur`: `font-size: 11.5px;` → `font-size: 0.71875rem;` (no padding in this rule)

23. `.filter-scope`: `font-size: 11px;` → `font-size: 0.6875rem;`; `padding: 12px 12px 4px;` → `padding: 0.75rem 0.75rem 0.25rem;`

24. `.filter-group-label`: `font-size: 10px;` → `font-size: 0.625rem;` (no padding — `margin-bottom: 6px;` stays untouched)

25. `.opt span`: `font-size: 11px;` → `font-size: 0.6875rem;`; `padding: 4px 10px;` → `padding: 0.25rem 0.625rem;`

26. `.xfchip`: `font-size: 11.5px;` → `font-size: 0.71875rem;`; `padding: 4px 6px 4px 12px;` → `padding: 0.25rem 0.375rem 0.25rem 0.75rem;`

27. `.xfchip .x`: `font-size: 11px;` → `font-size: 0.6875rem;` (no padding in this rule)

28. `.resetf`: `font-size: 11.5px;` → `font-size: 0.71875rem;`; `padding: 4px 6px;` → `padding: 0.25rem 0.375rem;`

29. `.filters-empty`: `font-size: 12px;` → `font-size: 0.75rem;`; `padding: 12px;` → `padding: 0.75rem;`

30. `.vtitle`: `font-size: 13px;` → `font-size: 0.8125rem;` (no padding in this rule)

31. `.vtitle-input`: `font-size: 13px;` → `font-size: 0.8125rem;`; `padding: 1px 4px;` → `padding: 0.0625rem 0.25rem;`

- [ ] **Step 3: Convert `frontend/src/components/appSidebar.css`**

`.app-nav-group`: `font-size: 10.5px;` → `font-size: 0.65625rem;`; `padding: 14px 18px 6px;` → `padding: 0.875rem 1.125rem 0.375rem;`

`.app-nav-link`: `font-size: 13px;` → `font-size: 0.8125rem;`; `padding: 7px 18px;` → `padding: 0.4375rem 1.125rem;`

- [ ] **Step 4: Convert `frontend/src/components/dataTablePager.css`**

`.pager`: `font-size: 11.5px;` → `font-size: 0.71875rem;` (no padding in this rule — `gap: 10px; margin-top: 10px;` stay untouched)

`.pager .pbtn`: `font-size: 11.5px;` → `font-size: 0.71875rem;`; `padding: 4px 10px;` → `padding: 0.25rem 0.625rem;`

`.pager .prpp button`: `font-size: 10.5px;` → `font-size: 0.65625rem;`; `padding: 3px 8px;` → `padding: 0.1875rem 0.5rem;`

- [ ] **Step 5: Convert `frontend/src/pages/sqlEditor.css`**

`.sql-editor`: `font-size: 13px;` → `font-size: 0.8125rem;` (no padding in this rule)

- [ ] **Step 6: Confirm every conversion landed**

Run: `grep -rn "font-size:\s*[0-9.]*px" frontend/src/reportEditor/reportEditor.css frontend/src/components/appSidebar.css frontend/src/components/dataTablePager.css frontend/src/pages/sqlEditor.css`
Expected: no output (0 matches).

- [ ] **Step 7: Verify nothing broke**

Run: `npx tsc -b && npx vitest run`
Expected: all pass — this is a pure CSS value change, no component behavior differs.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/reportEditor/reportEditor.css frontend/src/components/appSidebar.css frontend/src/components/dataTablePager.css frontend/src/pages/sqlEditor.css
git commit -m "frontend: convert font-size (and co-located padding) to rem so zoom can scale them"
```

---

### Task 4: Chart palette dark variants

**Files:**
- Modify: `frontend/src/widgets/shaping.ts`
- Modify: `frontend/src/widgets/shaping.test.ts`
- Modify: `frontend/src/widgets/BarWidget.tsx`
- Modify: `frontend/src/widgets/LineWidget.tsx`
- Modify: `frontend/src/widgets/PieWidget.tsx`
- Modify: `frontend/src/widgets/ScatterWidget.tsx`
- Modify: `frontend/src/widgets/WidgetRenderer.tsx`
- Modify: `frontend/src/reportEditor/FormatTab.tsx`
- Modify: `frontend/src/reportEditor/FormatTab.test.tsx`

**Interfaces:**
- Consumes: `ThemeMode`, `useAppearance` from `../appearance/AppearanceContext` (Task 1).
- Produces: `PALETTES: Record<ThemeMode, Record<string, string[]>>` (was `Record<string, string[]>`), `formatToSeriesOptions(format?: WidgetFormatOptions, mode?: ThemeMode): CategorySeriesOptions` (gained a second parameter, defaults to `"light"`), `CategorySeriesOptions.mode?: ThemeMode` (new field). `BarWidget`/`LineWidget`/`PieWidget`/`ScatterWidget` all gain an optional `mode?: ThemeMode` prop.

- [ ] **Step 1: Update `shaping.test.ts`'s existing palette assertions and add dark-mode tests**

In `frontend/src/widgets/shaping.test.ts`, make these exact changes:

Change:
```typescript
    expect(option.color).toEqual(PALETTES.ocean);
    // A different palette produces a different color array — proving it is load-bearing.
    expect(shapeBarOption(result, "Month", ["Revenue"], { palette: "forest" }).color).toEqual(PALETTES.forest);
```
to:
```typescript
    expect(option.color).toEqual(PALETTES.light.ocean);
    // A different palette produces a different color array — proving it is load-bearing.
    expect(shapeBarOption(result, "Month", ["Revenue"], { palette: "forest" }).color).toEqual(PALETTES.light.forest);
```

Change:
```typescript
    expect(option.legend).toBeDefined();
    expect(option.color).toEqual(PALETTES.sunset);
```
to:
```typescript
    expect(option.legend).toBeDefined();
    expect(option.color).toEqual(PALETTES.light.sunset);
```

Change:
```typescript
    const option = shapeScatterOption(scatterResult, "Sales", "Profit", "Segment", { showLegend: true, palette: "meridian", grid: false });

    expect(option.legend).toBeDefined();
    expect(option.color).toEqual(PALETTES.meridian);
```
to:
```typescript
    const option = shapeScatterOption(scatterResult, "Sales", "Profit", "Segment", { showLegend: true, palette: "meridian", grid: false });

    expect(option.legend).toBeDefined();
    expect(option.color).toEqual(PALETTES.light.meridian);
```

Change:
```typescript
  it("returns an empty object when no format is given", () => {
    expect(formatToSeriesOptions(undefined)).toEqual({});
  });
});
```
to:
```typescript
  it("returns just the (default light) mode when no format is given", () => {
    expect(formatToSeriesOptions(undefined)).toEqual({ mode: "light" });
  });

  it("passes an explicit mode through even when no format is given", () => {
    expect(formatToSeriesOptions(undefined, "dark")).toEqual({ mode: "dark" });
  });
});

describe("PALETTES dark variants", () => {
  it("feeds the dark palette's colors into the chart when mode is dark", () => {
    const option = shapeBarOption(result, "Month", ["Revenue"], { palette: "ocean", mode: "dark" });

    expect(option.color).toEqual(PALETTES.dark.ocean);
    expect(option.color).not.toEqual(PALETTES.light.ocean);
  });

  it("shapePieOption resolves the dark palette when mode is dark", () => {
    const option = shapePieOption(result, "Month", "Revenue", { palette: "sunset", mode: "dark" });

    expect(option.color).toEqual(PALETTES.dark.sunset);
  });

  it("shapeScatterOption resolves the dark palette when mode is dark", () => {
    const option = shapeScatterOption(scatterResult, "Sales", "Profit", "Segment", { palette: "meridian", mode: "dark" });

    expect(option.color).toEqual(PALETTES.dark.meridian);
  });

  it("defaults to the light palette when mode is omitted", () => {
    const option = shapeBarOption(result, "Month", ["Revenue"], { palette: "forest" });

    expect(option.color).toEqual(PALETTES.light.forest);
  });
});
```

(`scatterResult` is already defined earlier in this file inside the `describe("shapeScatterOption value formatting...")` block — for the new `describe("PALETTES dark variants")` block above, which sits at the top level of the file, declare its own local `scatterResult` constant using the same shape:
```typescript
const scatterResultForPalettes: QueryResult = {
  columns: [
    { name: "Segment", nativeType: "nvarchar(20)" },
    { name: "Sales", nativeType: "decimal(18,2)" },
    { name: "Profit", nativeType: "decimal(18,2)" },
  ],
  rows: [["Consumer", 100, 20]],
};
```
and use `scatterResultForPalettes` instead of `scatterResult` in the two scatter-related `it` blocks above, to avoid relying on another `describe` block's local scope.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/widgets/shaping.test.ts`
Expected: FAIL — `PALETTES.ocean` etc. are `undefined` (still the old flat shape), and `mode` isn't a recognized option yet.

- [ ] **Step 3: Update `shaping.ts`**

Add the import at the top of `frontend/src/widgets/shaping.ts`:
```typescript
import type { ThemeMode } from "../appearance/AppearanceContext";
```

Change:
```typescript
export interface CategorySeriesOptions {
  sortDirection?: "asc" | "desc" | null;
  dataLabels?: boolean;
  stacked?: boolean;
  horizontal?: boolean;
  area?: boolean;
  showLegend?: boolean;
  grid?: boolean;
  palette?: string;
  // The full format (not just the subset above) so builders can resolve a per-field format —
  // needs the specific field name and its native type, both only known inside each builder.
  format?: WidgetFormatOptions;
}
```
to:
```typescript
export interface CategorySeriesOptions {
  sortDirection?: "asc" | "desc" | null;
  dataLabels?: boolean;
  stacked?: boolean;
  horizontal?: boolean;
  area?: boolean;
  showLegend?: boolean;
  grid?: boolean;
  palette?: string;
  mode?: ThemeMode;
  // The full format (not just the subset above) so builders can resolve a per-field format —
  // needs the specific field name and its native type, both only known inside each builder.
  format?: WidgetFormatOptions;
}
```

Change:
```typescript
// Named colour themes selectable in the Format tab. The first entry of each
// array is the palette's swatch colour shown in FormatTab.
export const PALETTES: Record<string, string[]> = {
  meridian: ["#5b4fe6", "#8b7ff0", "#b3a9f7", "#7c6ff2", "#4a3fd0", "#c9c2fa"],
  ocean: ["#0ea5e9", "#38bdf8", "#0284c7", "#7dd3fc", "#0369a1", "#bae6fd"],
  sunset: ["#f5a524", "#fb923c", "#f97316", "#fbbf24", "#ea580c", "#fed7aa"],
  forest: ["#46a758", "#65b874", "#2f8f43", "#86c98f", "#227d38", "#b7e0bd"],
};

function paletteColors(name: string | undefined): string[] | undefined {
  return name ? PALETTES[name] : undefined;
}
```
to:
```typescript
// Named colour themes selectable in the Format tab, one color set per theme mode. The first
// entry of each array is the palette's swatch colour shown in FormatTab.
export const PALETTES: Record<ThemeMode, Record<string, string[]>> = {
  light: {
    meridian: ["#5b4fe6", "#8b7ff0", "#b3a9f7", "#7c6ff2", "#4a3fd0", "#c9c2fa"],
    ocean: ["#0ea5e9", "#38bdf8", "#0284c7", "#7dd3fc", "#0369a1", "#bae6fd"],
    sunset: ["#f5a524", "#fb923c", "#f97316", "#fbbf24", "#ea580c", "#fed7aa"],
    forest: ["#46a758", "#65b874", "#2f8f43", "#86c98f", "#227d38", "#b7e0bd"],
  },
  dark: {
    meridian: ["#8b7ff0", "#a89cf5", "#c9c2fa", "#7c6ff2", "#6a5ce8", "#d6d0fc"],
    ocean: ["#38bdf8", "#7dd3fc", "#0ea5e9", "#bae6fd", "#0284c7", "#e0f2fe"],
    sunset: ["#fb923c", "#fbbf24", "#f97316", "#fed7aa", "#ea580c", "#ffedd5"],
    forest: ["#65b874", "#86c98f", "#46a758", "#b7e0bd", "#2f8f43", "#d5f0d9"],
  },
};

function paletteColors(name: string | undefined, mode: ThemeMode = "light"): string[] | undefined {
  return name ? PALETTES[mode][name] : undefined;
}
```

Change:
```typescript
export function formatToSeriesOptions(format?: WidgetFormatOptions): CategorySeriesOptions {
  if (!format) {
    return {};
  }
  return {
    sortDirection: format.sortDirection,
    dataLabels: format.dataLabels,
    showLegend: format.showLegend,
    grid: format.grid,
    palette: format.palette,
    format,
  };
}
```
to:
```typescript
export function formatToSeriesOptions(format?: WidgetFormatOptions, mode: ThemeMode = "light"): CategorySeriesOptions {
  if (!format) {
    return { mode };
  }
  return {
    sortDirection: format.sortDirection,
    dataLabels: format.dataLabels,
    showLegend: format.showLegend,
    grid: format.grid,
    palette: format.palette,
    mode,
    format,
  };
}
```

Change (inside `buildCategorySeriesOption`):
```typescript
  const colors = paletteColors(options?.palette);
```
to:
```typescript
  const colors = paletteColors(options?.palette, options?.mode);
```

Change (inside `shapePieOption`):
```typescript
  const colors = paletteColors(options?.palette);
  const fieldFormat = resolveFieldFormat(result, options?.format, valueField);
```
to:
```typescript
  const colors = paletteColors(options?.palette, options?.mode);
  const fieldFormat = resolveFieldFormat(result, options?.format, valueField);
```

Change (inside `shapeScatterOption`):
```typescript
  const xAxis = { type: "value" as const, name: xDisplayName, ...splitLine, axisLabel: { formatter: (v: number) => formatFieldValue(v, xFieldFormat) } };
  const yAxis = { type: "value" as const, name: yDisplayName, ...splitLine, axisLabel: { formatter: (v: number) => formatFieldValue(v, yFieldFormat) } };
  const colors = paletteColors(options?.palette);
```
to:
```typescript
  const xAxis = { type: "value" as const, name: xDisplayName, ...splitLine, axisLabel: { formatter: (v: number) => formatFieldValue(v, xFieldFormat) } };
  const yAxis = { type: "value" as const, name: yDisplayName, ...splitLine, axisLabel: { formatter: (v: number) => formatFieldValue(v, yFieldFormat) } };
  const colors = paletteColors(options?.palette, options?.mode);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/widgets/shaping.test.ts`
Expected: all tests pass, including the new "PALETTES dark variants" describe block.

- [ ] **Step 5: Thread `mode` through the 4 chart widget components**

In each of `BarWidget.tsx`, `LineWidget.tsx`, `PieWidget.tsx`, `ScatterWidget.tsx`, add a `mode?: ThemeMode` prop and pass it into `formatToSeriesOptions`. Exact changes:

`frontend/src/widgets/BarWidget.tsx` — current full content:
```tsx
import { useRef } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import { formatToSeriesOptions, shapeBarOption } from "./shaping";
import { useECharts } from "./useECharts";

function BarWidget({
  title, result, categoryField, valueFields, stacked = false, horizontal = false, format, onDataPointClick,
}: {
  title: string;
  result: QueryResult;
  categoryField: string;
  valueFields: string[];
  stacked?: boolean;
  horizontal?: boolean;
  format?: WidgetFormatOptions;
  onDataPointClick?: (categoryValue: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useECharts(containerRef, shapeBarOption(result, categoryField, valueFields, { ...formatToSeriesOptions(format), stacked, horizontal }), onDataPointClick);

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />
    </Paper>
  );
}

export default BarWidget;
```
Replace with:
```tsx
import { useRef } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import type { ThemeMode } from "../appearance/AppearanceContext";
import { formatToSeriesOptions, shapeBarOption } from "./shaping";
import { useECharts } from "./useECharts";

function BarWidget({
  title, result, categoryField, valueFields, stacked = false, horizontal = false, format, mode, onDataPointClick,
}: {
  title: string;
  result: QueryResult;
  categoryField: string;
  valueFields: string[];
  stacked?: boolean;
  horizontal?: boolean;
  format?: WidgetFormatOptions;
  mode?: ThemeMode;
  onDataPointClick?: (categoryValue: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useECharts(containerRef, shapeBarOption(result, categoryField, valueFields, { ...formatToSeriesOptions(format, mode), stacked, horizontal }), onDataPointClick);

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />
    </Paper>
  );
}

export default BarWidget;
```

`frontend/src/widgets/LineWidget.tsx` — current full content:
```tsx
import { useRef } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import { formatToSeriesOptions, shapeLineOption } from "./shaping";
import { useECharts } from "./useECharts";

function LineWidget({
  title, result, categoryField, valueFields, area = false, format, onDataPointClick,
}: {
  title: string;
  result: QueryResult;
  categoryField: string;
  valueFields: string[];
  area?: boolean;
  format?: WidgetFormatOptions;
  onDataPointClick?: (categoryValue: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useECharts(containerRef, shapeLineOption(result, categoryField, valueFields, { ...formatToSeriesOptions(format), area }), onDataPointClick);

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />
    </Paper>
  );
}

export default LineWidget;
```
Replace with:
```tsx
import { useRef } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import type { ThemeMode } from "../appearance/AppearanceContext";
import { formatToSeriesOptions, shapeLineOption } from "./shaping";
import { useECharts } from "./useECharts";

function LineWidget({
  title, result, categoryField, valueFields, area = false, format, mode, onDataPointClick,
}: {
  title: string;
  result: QueryResult;
  categoryField: string;
  valueFields: string[];
  area?: boolean;
  format?: WidgetFormatOptions;
  mode?: ThemeMode;
  onDataPointClick?: (categoryValue: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useECharts(containerRef, shapeLineOption(result, categoryField, valueFields, { ...formatToSeriesOptions(format, mode), area }), onDataPointClick);

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />
    </Paper>
  );
}

export default LineWidget;
```

`frontend/src/widgets/PieWidget.tsx` — current full content:
```tsx
import { useRef } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import { formatToSeriesOptions, shapePieOption } from "./shaping";
import { useECharts } from "./useECharts";

function PieWidget({
  title, result, categoryField, valueField, donut = false, format, onDataPointClick,
}: {
  title: string;
  result: QueryResult;
  categoryField: string;
  valueField: string;
  donut?: boolean;
  format?: WidgetFormatOptions;
  onDataPointClick?: (categoryValue: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useECharts(containerRef, shapePieOption(result, categoryField, valueField, { ...formatToSeriesOptions(format), donut }), onDataPointClick);

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />
    </Paper>
  );
}

export default PieWidget;
```
Replace with:
```tsx
import { useRef } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import type { ThemeMode } from "../appearance/AppearanceContext";
import { formatToSeriesOptions, shapePieOption } from "./shaping";
import { useECharts } from "./useECharts";

function PieWidget({
  title, result, categoryField, valueField, donut = false, format, mode, onDataPointClick,
}: {
  title: string;
  result: QueryResult;
  categoryField: string;
  valueField: string;
  donut?: boolean;
  format?: WidgetFormatOptions;
  mode?: ThemeMode;
  onDataPointClick?: (categoryValue: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useECharts(containerRef, shapePieOption(result, categoryField, valueField, { ...formatToSeriesOptions(format, mode), donut }), onDataPointClick);

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />
    </Paper>
  );
}

export default PieWidget;
```

`frontend/src/widgets/ScatterWidget.tsx` — current full content:
```tsx
import { useRef } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import { formatToSeriesOptions, shapeScatterOption } from "./shaping";
import { useECharts } from "./useECharts";

function ScatterWidget({
  title, result, xField, yField, detailsField, format, onDataPointClick,
}: {
  title: string;
  result: QueryResult;
  xField: string;
  yField: string;
  detailsField: string | null;
  format?: WidgetFormatOptions;
  onDataPointClick?: (categoryValue: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useECharts(containerRef, shapeScatterOption(result, xField, yField, detailsField, formatToSeriesOptions(format)), onDataPointClick);

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />
    </Paper>
  );
}

export default ScatterWidget;
```
Replace with:
```tsx
import { useRef } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import type { ThemeMode } from "../appearance/AppearanceContext";
import { formatToSeriesOptions, shapeScatterOption } from "./shaping";
import { useECharts } from "./useECharts";

function ScatterWidget({
  title, result, xField, yField, detailsField, format, mode, onDataPointClick,
}: {
  title: string;
  result: QueryResult;
  xField: string;
  yField: string;
  detailsField: string | null;
  format?: WidgetFormatOptions;
  mode?: ThemeMode;
  onDataPointClick?: (categoryValue: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useECharts(containerRef, shapeScatterOption(result, xField, yField, detailsField, formatToSeriesOptions(format, mode)), onDataPointClick);

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />
    </Paper>
  );
}

export default ScatterWidget;
```

- [ ] **Step 6: Wire `mode` from `WidgetRenderer.tsx`**

In `frontend/src/widgets/WidgetRenderer.tsx`, add the import:
```tsx
import { useAppearance } from "../appearance/AppearanceContext";
```
(add it alongside the existing imports, e.g. right after the `parseFormatOptions` import line).

Add this line inside the `WidgetRenderer` function body, right after the opening `if (widget.type === "Text") { ... }` block (i.e. right before the `if (!widget.binding) {` check):
```tsx
  const { mode } = useAppearance();
```

Then add `mode={mode}` to each of the 5 chart-widget JSX call sites (`BarWidget`, `LineWidget` ×2 — `Line` and `Area` — `PieWidget` ×2 — `Pie` and `Donut` — `ScatterWidget`). Exact changes:

Change:
```tsx
    case "Bar":
      return <BarWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "StackedColumn":
      return <BarWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} stacked format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "ClusteredBar":
      return <BarWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} horizontal format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Line":
      return <LineWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Pie":
      return <PieWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Area":
      return <LineWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} area format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Donut":
      return <PieWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} donut format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Kpi":
      return <KpiWidget title={chartTitle} result={result} valueField={widget.binding.valueFields[0]} format={format} />;
    case "Scatter":
      return (
        <ScatterWidget
          title={chartTitle}
          result={result}
          xField={widget.binding.valueFields[0]}
          yField={widget.binding.valueFields[1]}
          detailsField={widget.binding.categoryField}
          format={format}
          onDataPointClick={onDataPointClick && widget.binding.categoryField ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined}
        />
      );
```
to:
```tsx
    case "Bar":
      return <BarWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "StackedColumn":
      return <BarWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} stacked format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "ClusteredBar":
      return <BarWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} horizontal format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Line":
      return <LineWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Pie":
      return <PieWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Area":
      return <LineWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} area format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Donut":
      return <PieWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} donut format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Kpi":
      return <KpiWidget title={chartTitle} result={result} valueField={widget.binding.valueFields[0]} format={format} />;
    case "Scatter":
      return (
        <ScatterWidget
          title={chartTitle}
          result={result}
          xField={widget.binding.valueFields[0]}
          yField={widget.binding.valueFields[1]}
          detailsField={widget.binding.categoryField}
          format={format}
          mode={mode}
          onDataPointClick={onDataPointClick && widget.binding.categoryField ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined}
        />
      );
```

(`KpiWidget` is intentionally left unchanged — it has no chart color palette, only a formatted number.)

- [ ] **Step 7: Update `WidgetRenderer.test.tsx` to wrap with `AppearanceProvider`**

`WidgetRenderer` now calls `useAppearance()`, so every `render(...)` call in `frontend/src/widgets/WidgetRenderer.test.tsx` that renders a `<WidgetRenderer>` needs an `AppearanceProvider` ancestor or it will throw. There are exactly 20 such `render(` call sites in this file (confirmed via `grep -c "render("`) — 2 written as a single line (e.g. `render(<WidgetRenderer widget={makeWidget({ type: "Text", ... })} result={null} />);`) and 18 written multi-line (`render(\n      <WidgetRenderer\n        ...\n      />,\n    );`). **All 20 need the same fix.**

Add the import:
```tsx
import { AppearanceProvider } from "../appearance/AppearanceContext";
```
Add a small render helper right after the `makeWidget` function:
```tsx
function renderWidget(ui: React.ReactElement) {
  return render(<AppearanceProvider>{ui}</AppearanceProvider>);
}
```
Then, for all 20 call sites, change the function name from `render` to `renderWidget` — i.e. every `render(` in this file becomes `renderWidget(`, and everything else about each call (the JSX passed in, single-line or multi-line, indentation, closing `);`) stays byte-for-byte identical. Since every `render(` in this file renders a `<WidgetRenderer>` (there is no other component under test here), this is a safe global replace of the token `render(` → `renderWidget(` across the whole file — do not special-case the 2 single-line calls differently from the 18 multi-line ones.

- [ ] **Step 8: Update `FormatTab.tsx`'s palette swatches to be theme-aware**

Current relevant section of `frontend/src/reportEditor/FormatTab.tsx`:
```tsx
import { useState } from "react";
import type { ColumnDescriptor } from "../api/datasets";
import type { BooleanStyle, DatePreset, FieldFormat, FieldFormatType } from "../api/widgets";
import { DATE_PRESET_EXAMPLES, DEFAULT_FIELD_FORMAT, inferFormatType, resolveDisplayName } from "../widgets/fieldFormat";
import type { WidgetBindingDraft, WidgetDraft } from "../widgets/widgetDraftReducer";
import "./reportEditor.css";

const PALETTE_NAMES = ["meridian", "ocean", "sunset", "forest"];
const PALETTE_SWATCH_COLORS: Record<string, string> = {
  meridian: "#5b4fe6",
  ocean: "#0ea5e9",
  sunset: "#f5a524",
  forest: "#46a758",
};
```
Replace with:
```tsx
import { useState } from "react";
import type { ColumnDescriptor } from "../api/datasets";
import type { BooleanStyle, DatePreset, FieldFormat, FieldFormatType } from "../api/widgets";
import { useAppearance } from "../appearance/AppearanceContext";
import { DATE_PRESET_EXAMPLES, DEFAULT_FIELD_FORMAT, inferFormatType, resolveDisplayName } from "../widgets/fieldFormat";
import { PALETTES } from "../widgets/shaping";
import type { WidgetBindingDraft, WidgetDraft } from "../widgets/widgetDraftReducer";
import "./reportEditor.css";

const PALETTE_NAMES = ["meridian", "ocean", "sunset", "forest"];
```

Then, inside the `FormatTab` function body, add (right after the existing `const [expandedFields, ...] = useState(...)` line):
```tsx
  const { mode } = useAppearance();
```

Finally, change the swatch button's `style` prop:
```tsx
                <button
                  key={name}
                  type="button"
                  title={name}
                  className={"swatch" + (options.palette === name ? " active" : "")}
                  style={{ background: PALETTE_SWATCH_COLORS[name] }}
                  onClick={() => update({ palette: name })}
                />
```
to:
```tsx
                <button
                  key={name}
                  type="button"
                  title={name}
                  className={"swatch" + (options.palette === name ? " active" : "")}
                  style={{ background: PALETTES[mode][name][0] }}
                  onClick={() => update({ palette: name })}
                />
```

- [ ] **Step 9: Update `FormatTab.test.tsx` to wrap with `AppearanceProvider`**

`FormatTab` now calls `useAppearance()` too. Add the import at the top of `frontend/src/reportEditor/FormatTab.test.tsx`:
```tsx
import { AppearanceProvider } from "../appearance/AppearanceContext";
```

Change the `ControlledFormatTab` helper (this fixes all 13 `render(<ControlledFormatTab ...>)` call sites in the file at once, since they all go through this one component):
```tsx
function ControlledFormatTab({ initialWidget, columns }: { initialWidget: WidgetDraft; columns?: ColumnDescriptor[] }) {
  const [widget, setWidget] = useState(initialWidget);
  function handleChange(binding: WidgetBindingDraft) {
    setWidget((w) => ({ ...w, binding }));
  }
  return <FormatTab widget={widget} columns={columns} onChange={handleChange} />;
}
```
to:
```tsx
function ControlledFormatTab({ initialWidget, columns }: { initialWidget: WidgetDraft; columns?: ColumnDescriptor[] }) {
  const [widget, setWidget] = useState(initialWidget);
  function handleChange(binding: WidgetBindingDraft) {
    setWidget((w) => ({ ...w, binding }));
  }
  return (
    <AppearanceProvider>
      <FormatTab widget={widget} columns={columns} onChange={handleChange} />
    </AppearanceProvider>
  );
}
```

Then add a small helper right after `ControlledFormatTab`, for the remaining 13 direct `render(<FormatTab ...>)` call sites:
```tsx
function renderFormatTab(ui: React.ReactElement) {
  return render(<AppearanceProvider>{ui}</AppearanceProvider>);
}
```
Then replace every occurrence of the exact token `render(<FormatTab` (there are 13, none of them inside `ControlledFormatTab` since that one was already handled above) with `renderFormatTab(<FormatTab` — the rest of each call (props, closing `/>`  or `>`, and the closing `)`) stays exactly as-is.

- [ ] **Step 10: Run the full suite and type-check**

Run: `npx tsc -b && npx vitest run`
Expected: all tests pass, including the updated `shaping.test.ts`, `WidgetRenderer.test.tsx`, and `FormatTab.test.tsx`.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/widgets/shaping.ts frontend/src/widgets/shaping.test.ts frontend/src/widgets/BarWidget.tsx frontend/src/widgets/LineWidget.tsx frontend/src/widgets/PieWidget.tsx frontend/src/widgets/ScatterWidget.tsx frontend/src/widgets/WidgetRenderer.tsx frontend/src/widgets/WidgetRenderer.test.tsx frontend/src/reportEditor/FormatTab.tsx frontend/src/reportEditor/FormatTab.test.tsx
git commit -m "frontend: give the 4 named chart palettes dark-mode variants, threaded from AppearanceContext"
```

---

### Task 5: `AppearanceMenu` component + `AppSidebar`/`Ribbon` integration

**Files:**
- Create: `frontend/src/appearance/AppearanceMenu.tsx`
- Create: `frontend/src/appearance/appearanceMenu.css`
- Test: `frontend/src/appearance/AppearanceMenu.test.tsx`
- Modify: `frontend/src/components/AppSidebar.tsx`
- Modify: `frontend/src/components/appSidebar.css`
- Modify: `frontend/src/components/AppSidebar.test.tsx`
- Modify: `frontend/src/reportEditor/Ribbon.tsx`
- Modify: `frontend/src/reportEditor/Ribbon.test.tsx`

**Interfaces:**
- Consumes: `useAppearance`, `ZoomLevel` from `../appearance/AppearanceContext` (Task 1).
- Produces: `AppearanceMenu` — a self-contained component (no props) usable anywhere already inside `AppearanceProvider`.

- [ ] **Step 1: Write the failing test file**

Create `frontend/src/appearance/AppearanceMenu.test.tsx`:

```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AppearanceProvider } from "./AppearanceContext";
import AppearanceMenu from "./AppearanceMenu";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.fontSize = "";
});

async function openMenu() {
  await userEvent.click(screen.getByRole("button", { name: "Appearance settings" }));
}

describe("AppearanceMenu", () => {
  it("shows Light active by default and the four zoom steps for the current theme", async () => {
    render(<AppearanceProvider><AppearanceMenu /></AppearanceProvider>);
    await openMenu();

    expect(screen.getByRole("button", { name: "Light" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Dark" })).not.toHaveClass("active");
    expect(screen.getByRole("button", { name: "100%" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "90%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "110%" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "125%" })).toBeInTheDocument();
  });

  it("clicking Dark switches the theme and applies data-theme", async () => {
    render(<AppearanceProvider><AppearanceMenu /></AppearanceProvider>);
    await openMenu();

    await userEvent.click(screen.getByRole("button", { name: "Dark" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark" })).toHaveClass("active");
  });

  it("clicking a zoom step applies it to the root font-size", async () => {
    render(<AppearanceProvider><AppearanceMenu /></AppearanceProvider>);
    await openMenu();

    await userEvent.click(screen.getByRole("button", { name: "110%" }));

    expect(document.documentElement.style.fontSize).toBe("110%");
    expect(screen.getByRole("button", { name: "110%" })).toHaveClass("active");
  });

  it("switching to Dark shows that theme's own remembered zoom, not the light theme's", async () => {
    window.localStorage.setItem("orp.zoom", JSON.stringify({ light: 90, dark: 125 }));
    render(<AppearanceProvider><AppearanceMenu /></AppearanceProvider>);
    await openMenu();

    expect(screen.getByRole("button", { name: "90%" })).toHaveClass("active");

    await userEvent.click(screen.getByRole("button", { name: "Dark" }));

    expect(screen.getByRole("button", { name: "125%" })).toHaveClass("active");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/appearance/AppearanceMenu.test.tsx`
Expected: FAIL — `Cannot find module './AppearanceMenu'`.

- [ ] **Step 3: Write the CSS**

Create `frontend/src/appearance/appearanceMenu.css`:

```css
.appearance-menu {
  padding: 12px;
  min-width: 200px;
}
.appearance-menu-label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--faint);
  margin: 10px 0 6px;
}
.appearance-menu-label:first-child {
  margin-top: 0;
}
.appearance-menu-row {
  display: flex;
  gap: 6px;
}
.appearance-menu-btn {
  flex: 1;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--panel);
  color: var(--text);
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.375rem 0.5rem;
  cursor: pointer;
}
.appearance-menu-btn:hover {
  background: var(--groove);
}
.appearance-menu-btn.active {
  background: var(--accent-soft);
  border-color: var(--accent-line);
  color: var(--accent-ink);
}
```

- [ ] **Step 4: Write the component**

Create `frontend/src/appearance/AppearanceMenu.tsx`:

```tsx
import { useState } from "react";
import { IconButton, Popover } from "@mui/material";
import { useAppearance } from "./AppearanceContext";
import type { ZoomLevel } from "./AppearanceContext";
import "./appearanceMenu.css";

const ZOOM_LEVELS: ZoomLevel[] = [90, 100, 110, 125];

function AppearanceMenu() {
  const { mode, zoomByTheme, setMode, setZoom } = useAppearance();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  return (
    <>
      <IconButton size="small" aria-label="Appearance settings" onClick={(e) => setAnchor(e.currentTarget)}>
        <span aria-hidden="true">⚙</span>
      </IconButton>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <div className="appearance-menu">
          <div className="appearance-menu-label">Theme</div>
          <div className="appearance-menu-row">
            <button type="button" className={"appearance-menu-btn" + (mode === "light" ? " active" : "")} onClick={() => setMode("light")}>
              Light
            </button>
            <button type="button" className={"appearance-menu-btn" + (mode === "dark" ? " active" : "")} onClick={() => setMode("dark")}>
              Dark
            </button>
          </div>
          <div className="appearance-menu-label">Zoom</div>
          <div className="appearance-menu-row">
            {ZOOM_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className={"appearance-menu-btn" + (zoomByTheme[mode] === level ? " active" : "")}
                onClick={() => setZoom(level)}
              >
                {level}%
              </button>
            ))}
          </div>
        </div>
      </Popover>
    </>
  );
}

export default AppearanceMenu;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/appearance/AppearanceMenu.test.tsx`
Expected: `Test Files 1 passed (1)`, `Tests 4 passed (4)`.

- [ ] **Step 6: Add `AppearanceMenu` to `AppSidebar`**

Current full content of `frontend/src/components/AppSidebar.tsx`:
```tsx
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
Replace with:
```tsx
import { Link, useLocation } from "react-router-dom";
import AppearanceMenu from "../appearance/AppearanceMenu";
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
      <div className="app-nav-spacer" />
      <div className="app-nav-appearance">
        <AppearanceMenu />
      </div>
    </nav>
  );
}

export default AppSidebar;
```

- [ ] **Step 7: Add the layout CSS for the sidebar footer**

In `frontend/src/components/appSidebar.css`, change:
```css
.app-nav {
  width: 200px;
  flex: 0 0 200px;
  background: var(--panel);
  border-right: 1px solid var(--line);
  padding: 14px 0;
}
```
to:
```css
.app-nav {
  width: 200px;
  flex: 0 0 200px;
  background: var(--panel);
  border-right: 1px solid var(--line);
  padding: 14px 0;
  display: flex;
  flex-direction: column;
}
```
Then append at the end of the file:
```css
.app-nav-spacer {
  flex: 1;
}
.app-nav-appearance {
  padding: 10px 18px 4px;
  border-top: 1px solid var(--line);
  margin-top: 10px;
}
```

- [ ] **Step 8: Fix `AppSidebar.test.tsx` to wrap with `AppearanceProvider`**

Current full content of `frontend/src/components/AppSidebar.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import AppSidebar from "./AppSidebar";

describe("AppSidebar", () => {
  it("renders links to Connections, Datasets, and Reports", () => {
    render(
      <MemoryRouter initialEntries={["/reports"]}>
        <AppSidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link", { name: /connections/i })).toHaveAttribute("href", "/datasources");
    expect(screen.getByRole("link", { name: /datasets/i })).toHaveAttribute("href", "/datasets");
    expect(screen.getByRole("link", { name: /reports/i })).toHaveAttribute("href", "/reports");
  });

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
});
```
Replace with:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppearanceProvider } from "../appearance/AppearanceContext";
import AppSidebar from "./AppSidebar";

describe("AppSidebar", () => {
  it("renders links to Connections, Datasets, and Reports", () => {
    render(
      <AppearanceProvider>
        <MemoryRouter initialEntries={["/reports"]}>
          <AppSidebar />
        </MemoryRouter>
      </AppearanceProvider>,
    );

    expect(screen.getByRole("link", { name: /connections/i })).toHaveAttribute("href", "/datasources");
    expect(screen.getByRole("link", { name: /datasets/i })).toHaveAttribute("href", "/datasets");
    expect(screen.getByRole("link", { name: /reports/i })).toHaveAttribute("href", "/reports");
  });

  it("shows a section header and marks the active destination", () => {
    render(
      <AppearanceProvider>
        <MemoryRouter initialEntries={["/datasets"]}>
          <AppSidebar />
        </MemoryRouter>
      </AppearanceProvider>,
    );

    expect(screen.getByText("Overview")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /datasets/i })).toHaveClass("active");
    expect(screen.getByRole("link", { name: /reports/i })).not.toHaveClass("active");
  });
});
```

- [ ] **Step 9: Add `AppearanceMenu` to `Ribbon`**

Current full content of `frontend/src/reportEditor/Ribbon.tsx`:
```tsx
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
Replace with:
```tsx
import { useState } from "react";
import { Menu, MenuItem } from "@mui/material";
import AppearanceMenu from "../appearance/AppearanceMenu";
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
        <AppearanceMenu />
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

- [ ] **Step 10: Fix `Ribbon.test.tsx` to wrap with `AppearanceProvider`**

Current full content of `frontend/src/reportEditor/Ribbon.test.tsx`:
```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Ribbon from "./Ribbon";

// This project doesn't enable Vitest globals, so RTL's automatic cleanup doesn't run.
afterEach(cleanup);

describe("Ribbon", () => {
  it("calls onRename when File > Rename report is chosen", async () => {
    const onRename = vi.fn();
    render(
      <Ribbon
        reportName="My Report"
        onRename={onRename}
        onChangeDataSource={vi.fn()}
        onBackToReports={vi.fn()}
        onAddText={vi.fn()}
        onToggleFilters={vi.fn()}
        onRefresh={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "File" }));
    await userEvent.click(await screen.findByText("Rename report"));

    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("calls onSave when the primary Save button is clicked", async () => {
    const onSave = vi.fn();
    render(
      <Ribbon
        reportName="My Report"
        onRename={vi.fn()}
        onChangeDataSource={vi.fn()}
        onBackToReports={vi.fn()}
        onAddText={vi.fn()}
        onToggleFilters={vi.fn()}
        onRefresh={vi.fn()}
        onSave={onSave}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

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
});
```
Replace with:
```tsx
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "../appearance/AppearanceContext";
import Ribbon from "./Ribbon";

// This project doesn't enable Vitest globals, so RTL's automatic cleanup doesn't run.
afterEach(cleanup);

describe("Ribbon", () => {
  it("calls onRename when File > Rename report is chosen", async () => {
    const onRename = vi.fn();
    render(
      <AppearanceProvider>
        <Ribbon
          reportName="My Report"
          onRename={onRename}
          onChangeDataSource={vi.fn()}
          onBackToReports={vi.fn()}
          onAddText={vi.fn()}
          onToggleFilters={vi.fn()}
          onRefresh={vi.fn()}
          onSave={vi.fn()}
        />
      </AppearanceProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "File" }));
    await userEvent.click(await screen.findByText("Rename report"));

    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("calls onSave when the primary Save button is clicked", async () => {
    const onSave = vi.fn();
    render(
      <AppearanceProvider>
        <Ribbon
          reportName="My Report"
          onRename={vi.fn()}
          onChangeDataSource={vi.fn()}
          onBackToReports={vi.fn()}
          onAddText={vi.fn()}
          onToggleFilters={vi.fn()}
          onRefresh={vi.fn()}
          onSave={onSave}
        />
      </AppearanceProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("readOnly hides the File/Insert/View menus and the Save button", () => {
    render(
      <AppearanceProvider>
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
        />
      </AppearanceProvider>,
    );

    expect(screen.queryByRole("button", { name: "File" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Insert" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("readOnly still shows the report name and a working Refresh button", async () => {
    const onRefresh = vi.fn();
    render(
      <AppearanceProvider>
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
        />
      </AppearanceProvider>,
    );

    expect(screen.getByText("My Report")).toBeInTheDocument();
    await userEvent.click(screen.getByTitle("Refresh data"));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 11: Run the full suite and type-check**

Run: `npx tsc -b && npx vitest run`
Expected: all tests pass.

- [ ] **Step 12: Commit**

```bash
git add frontend/src/appearance/AppearanceMenu.tsx frontend/src/appearance/appearanceMenu.css frontend/src/appearance/AppearanceMenu.test.tsx frontend/src/components/AppSidebar.tsx frontend/src/components/appSidebar.css frontend/src/components/AppSidebar.test.tsx frontend/src/reportEditor/Ribbon.tsx frontend/src/reportEditor/Ribbon.test.tsx
git commit -m "frontend: add the Appearance settings menu (Light/Dark + zoom) to AppSidebar and Ribbon"
```

---

## After all tasks: final review and live verification

Once Tasks 1–5 are complete and reviewed, this feature needs the same live verification every other feature in this project's history has gotten before shipping (not a coding task — no diff of its own):

- Toggle Dark mode from both `AppSidebar` (on `/reports`, `/datasets`, `/datasources`) and `Ribbon` (on a report's designer `/reports/:id/edit` and viewer `/reports/:id`) and confirm the whole page — MUI components AND plain-CSS panels (Format tab, Data pane, Filters pane) — actually switches, not just half of it.
- Click each zoom step and confirm text and padding visibly scale (not just the number label changing).
- Reload the page after setting Dark + 110% and confirm both are still applied (persistence).
- Switch Light → Dark → Light and confirm each theme's own remembered zoom re-applies correctly.
- Open the Format tab's Color theme swatches in both Light and Dark and confirm the preview swatch colors (and an actual chart's rendered colors) differ appropriately between modes.
- Revert any live test data (widgets/report state) touched during this check back to its original state, per this project's established QA convention.
