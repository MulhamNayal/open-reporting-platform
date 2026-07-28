# Appearance Settings — Light/Dark Theme & Per-Theme Zoom — Design

## Overview

The app currently has exactly one fixed visual appearance: a light "Meridian" palette (`frontend/src/theme.ts`, an MUI theme) and a parallel set of CSS custom properties (`frontend/src/meridian-tokens.css`) that all plain-CSS pages (`reportEditor.css`, `datasetsPage.css`, `appSidebar.css`, `dataTablePager.css`, `sqlEditor.css`) reference directly. There is no dark mode and no way to change how large text renders — 37 font-size declarations across 4 CSS files are hardcoded in `px`.

This adds an **Appearance** settings surface with two independent controls:
- **Theme**: Light or Dark, with a properly designed (not inverted) dark palette.
- **Zoom**: four discrete steps — 90% / 100% / 110% / 125% — remembered **separately per theme**, so switching theme also switches which zoom level is active.

There is no backend user/settings model anywhere in this app (confirmed: no auth, no user table). Both settings persist to `localStorage` only, are scoped to the browser/device, and are not synced anywhere.

Chart series-color palettes (the 4 named palettes selectable in `FormatTab` — meridian/ocean/sunset/forest) get their own dark-mode variants as part of this work, since they're rendered on theme-aware backgrounds.

## Architecture

### `AppearanceContext` (new: `frontend/src/appearance/AppearanceContext.tsx`)

Single source of truth, provided at the app root:

```typescript
export type ThemeMode = "light" | "dark";
export type ZoomLevel = 90 | 100 | 110 | 125;

export interface AppearanceState {
  mode: ThemeMode;
  zoomByTheme: Record<ThemeMode, ZoomLevel>;
}

export interface AppearanceContextValue extends AppearanceState {
  setMode: (mode: ThemeMode) => void;
  setZoom: (zoom: ZoomLevel) => void; // always sets zoom for the CURRENT mode
}
```

- Reads two `localStorage` keys on init: `orp.theme` (`"light" | "dark"`, default `"light"`) and `orp.zoom` (a JSON-serialized `Record<ThemeMode, ZoomLevel>`, default `{ light: 100, dark: 100 }`). Reads are wrapped in `try/catch` — if `localStorage` is unavailable or the stored value fails to parse, fall back to the defaults silently (no error surfaced to the user).
- Writes both keys back to `localStorage` on every change.
- An effect applies the current state to the DOM on every change:
  - `document.documentElement.setAttribute("data-theme", mode)`
  - `document.documentElement.style.fontSize = `${zoomByTheme[mode]}%``
- `setZoom(zoom)` always writes to `zoomByTheme[mode]` for whichever mode is currently active — there is no "set zoom for a specific theme while viewing the other," since the zoom control is only ever shown for the theme currently in effect.

### MUI theme (`frontend/src/theme.ts`, refactored)

Changes from one exported `meridianTheme` object to an exported `buildTheme(mode: ThemeMode): Theme` factory. Both palettes keep the same shape (same `components` overrides structure); only color values differ. `main.tsx` renders a small wrapper that reads `AppearanceContext`'s `mode` and calls `buildTheme(mode)` before handing the result to MUI's `<ThemeProvider>`.

### CSS custom properties (`frontend/src/meridian-tokens.css`)

A `:root[data-theme="dark"]` block redefines every existing custom property with dark equivalents (values below). Every page that already consumes `var(--line)`, `var(--text)`, etc. picks this up automatically with zero per-file changes, since `AppearanceContext` sets `data-theme` on `<html>`.

**Dark token values** (light values shown for reference; the rail was already dark-toned even in light mode, so its dark-mode values are close to unchanged):

| Token | Light (existing) | Dark (new) |
|---|---|---|
| `--ink` | `#15171e` | `#e7e9ee` |
| `--rail` | `#1b1e27` | `#0f1015` |
| `--rail-hover` | `#2a2e3a` | `#1a1c24` |
| `--rail-line` | `#2f333f` | `#22242e` |
| `--panel` | `#ffffff` | `#1b1e27` |
| `--panel-2` | `#f6f7f9` | `#20232d` |
| `--groove` | `#eef0f4` | `#252834` |
| `--line` | `#e3e7ef` | `#2f333f` |
| `--line-strong` | `#cfd5e0` | `#3d4250` |
| `--canvas` | `#e7eaf1` | `#14151c` |
| `--page` | `#ffffff` | `#1b1e27` |
| `--text` | `#1b1e27` | `#e7e9ee` |
| `--muted` | `#6c7480` | `#9aa1ad` |
| `--faint` | `#9aa1ad` | `#6c7480` |
| `--accent` | `#5b4fe6` | `#7b70f0` |
| `--accent-ink` | `#4a3fd6` | `#8f86f5` |
| `--accent-soft` | `#edeafc` | `#2a2650` |
| `--accent-line` | `#c9c2f7` | `#4b3f8f` |
| `--good` | `#12a594` | `#2dd4bf` |
| `--warn` | `#e5843a` | `#f5a35c` |
| `--good-soft` | `#e2f6f2` | `#123330` |
| `--warn-soft` | `#fdefe2` | `#3a2a18` |
| `--bad` | `#e5484d` | `#f2777a` |
| `--bad-soft` | `#fdecec` | `#3a1e1f` |
| `--sh-sm` / `--sh-md` | (rgba black shadows) | unchanged — negligible visual effect on a dark background already, not worth redesigning |
| `--r` | `8px` | unchanged (radius, not a color) |

`--accent`/`--accent-ink` are lightened versions of the light-mode purple (not the same hex), since the original `#5b4fe6` reads slightly muddy against the new `#14151c` canvas — the lightened version keeps the same hue while meeting comfortable contrast.

### MUI dark palette (`buildTheme("dark")`)

Mirrors the token table above for the pieces MUI's theme controls directly: `palette.primary.main = "#7b70f0"`, `palette.primary.dark = "#8f86f5"`, `palette.background.default = "#14151c"`, `palette.background.paper = "#1b1e27"`, `palette.text.primary = "#e7e9ee"`, `palette.text.secondary = "#9aa1ad"`. The `MuiTableCell`/`MuiTableRow`/`MuiPaper` style overrides swap their hardcoded light hex values (currently `#e3e7ef`, `#f6f7f9`, `#cfd5e0`, `#edeafc`) for the corresponding dark tokens from the table above.

## Zoom

Implemented via root `font-size` percentage + `rem` units — **not** the CSS `zoom` property (inconsistent across browsers) and **not** `transform: scale()` (blurs text, breaks hit-testing/positioning for fixed/absolute elements like popovers and the resize-handle overlays already in this app).

**Mechanism:** `AppearanceContext`'s effect sets `document.documentElement.style.fontSize = "90%" | "100%" | "110%" | "125%"`. Any CSS using `rem` units automatically scales, since `rem` is resolved live by the browser against the root's *computed* font-size — this includes MUI's own components for free (MUI's `MuiTableCell` override already uses `0.71875rem`; the rest of MUI's typography is rem-based internally by default), so no MUI-side changes are needed for zoom beyond what dark mode already requires.

**Conversion scope:** the 37 existing `font-size: Npx` declarations across `appSidebar.css`, `dataTablePager.css`, `sqlEditor.css`, and `reportEditor.css` convert to `rem` (at the standard `16px = 1rem` base). Where a rule's `padding` sits alongside a `font-size` in the same block (common in `reportEditor.css`'s `.frow`, `.facc-row`, button styles), that padding converts to `rem` too, so text and its immediate surrounding space scale together. Unrelated spacing (margins between whole sections, canvas-level layout dimensions like `.pane-viz`'s `256px` width) is explicitly **not** touched — this is a targeted conversion of text-adjacent sizing, not a full-app unit rewrite.

**Steps:** 90%, 100%, 110%, 125% — shown as four buttons (not a slider), consistent with how VS Code/browser zoom present discrete steps rather than continuous ranges.

**Per-theme persistence:** covered under `AppearanceContext` above — `zoomByTheme.light` and `zoomByTheme.dark` are independent; switching `mode` immediately applies the other theme's remembered zoom.

## Chart palette dark variants

`frontend/src/widgets/shaping.ts`'s `PALETTES` constant (currently `Record<string, string[]>` with 4 named entries) splits into per-theme variants:

```typescript
export const PALETTES: Record<ThemeMode, Record<string, string[]>> = {
  light: { meridian: [...], ocean: [...], sunset: [...], forest: [...] }, // unchanged, current values
  dark: { meridian: [...], ocean: [...], sunset: [...], forest: [...] },  // new
};
```

`paletteColors(name, mode)` gains the `mode` parameter. Each chart-option builder in `shaping.ts` (`buildCategorySeriesOption`, `shapePieOption`, `shapeScatterOption`) already receives a `CategorySeriesOptions` object; that gains a `mode: ThemeMode` field, threaded from the widget renderer (`WidgetRenderer.tsx`), which reads `AppearanceContext`. `FormatTab`'s palette swatch buttons read the same context to preview the correct variant's swatch color.

**Dark palette color sets** (each a lightened/desaturated-for-dark-background variant of its light counterpart, same relative hue relationships so a palette is still recognizable as "the same palette" across themes):

- `meridian` (dark): `["#8b7ff0", "#a89cf5", "#c9c2fa", "#7c6ff2", "#6a5ce8", "#d6d0fc"]`
- `ocean` (dark): `["#38bdf8", "#7dd3fc", "#0ea5e9", "#bae6fd", "#0284c7", "#e0f2fe"]`
- `sunset` (dark): `["#fb923c", "#fbbf24", "#f97316", "#fed7aa", "#ea580c", "#ffedd5"]`
- `forest` (dark): `["#65b874", "#86c98f", "#46a758", "#b7e0bd", "#2f8f43", "#d5f0d9"]`

## Settings UI

New shared component `frontend/src/appearance/AppearanceMenu.tsx`: a gear icon button that opens an MUI `Popover` containing:
- A Light/Dark toggle (two buttons, active one highlighted).
- Four zoom-step buttons (90% / 100% / 110% / 125%) for whichever theme is currently active, active one highlighted.

Both controls read/write `AppearanceContext` directly (no local state beyond the popover's own open/closed anchor).

Rendered in two places, both already-existing components:
- `frontend/src/components/AppSidebar.tsx` — appended at the bottom of the nav list, for the Connections/Datasets/Reports pages.
- `frontend/src/reportEditor/Ribbon.tsx` — a new icon button in the existing `.tools` section (next to "Refresh data"), for the report designer (`ReportCanvas`) and viewer (`ReportView`), which don't share `AppSidebar`.

## Testing Approach

- `AppearanceContext.test.tsx`: default state when `localStorage` is empty; reading a previously-stored value; `setMode`/`setZoom` update state, `localStorage`, and the `data-theme`/root `font-size` DOM effects; `setZoom` only changes the current mode's stored value, leaving the other theme's remembered zoom untouched; falls back to defaults gracefully if `localStorage` throws or holds malformed JSON.
- `theme.test.ts`: `buildTheme("light")` and `buildTheme("dark")` each produce valid, structurally-equal-shaped themes with the expected distinct color values (spot-check primary/background/text).
- `shaping.test.ts`: `paletteColors`/the builders resolve to the light or dark color set based on the `mode` passed in, mirroring the existing format-options tests' structure.
- `AppearanceMenu.test.tsx`: renders both controls; clicking Dark/a zoom step calls the right context setter; only the current theme's 4 zoom buttons are shown (not the other theme's separately-remembered value, since there's only one active zoom control at a time).
- Live verification (Playwright/screenshots, as with every other feature this session): toggle dark mode and confirm the designer, viewer, and list pages all render with the dark palette (not a half-switched mix of light CSS-var pages and dark MUI components); confirm a zoom step visibly changes text/spacing size; confirm reloading the page preserves both settings; confirm switching theme swaps to that theme's own remembered zoom.

## Explicitly Out of Scope

- **Any backend/account-level persistence** — there is no user/auth model in this app; settings are `localStorage`-only, per-browser, not synced.
- **`prefers-color-scheme` auto-detection** — first-ever load is always Light, regardless of OS setting, so nothing changes for existing usage until the toggle is used.
- **A free-form zoom slider or arbitrary percentages** — four fixed steps only (90/100/110/125%).
- **Full-app `px`-to-`rem` conversion** — only the 37 font-size declarations (and their immediately-adjacent padding) in `appSidebar.css`, `dataTablePager.css`, `sqlEditor.css`, `reportEditor.css` convert; unrelated layout dimensions (pane widths, canvas sizing, GridStack units) are untouched.
- **A single combined "font size preset" control separate from zoom** — explicitly rejected in favor of zoom alone, since both would control the same underlying mechanism (root font-size) and offering both invites confusing combined states.
- **Dark-mode-aware variants of anything beyond the 4 named chart palettes** — e.g. no per-widget custom-color-picker theming, no dark variants of report-level branding/logo (no such feature exists yet).
