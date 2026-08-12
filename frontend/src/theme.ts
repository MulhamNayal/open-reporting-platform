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

// Fluent's own values, so the app reads as a sibling of the Power BI reports it hosts rather than
// as a different product: Segoe UI, the #FAF9F8/#F3F2F1 neutral ramp, #605E5C secondary text,
// #EDEBE9 hairlines, and #0078D4 as the accent. Power BI's own tableAccent is #118DFF; the darker
// #0078D4 is the shell accent and gives better contrast on white.
const LIGHT_COLORS: PaletteColors = {
  primaryMain: "#0078d4",
  primaryDark: "#106ebe",
  backgroundDefault: "#faf9f8",
  backgroundPaper: "#ffffff",
  textPrimary: "#242424",
  textSecondary: "#605e5c",
  paperBorder: "#edebe9",
  tableCellBorder: "#f3f2f1",
  tableHeadColor: "#323130",
  tableHeadBackground: "#ffffff",
  tableHeadBorder: "#c8c6c4",
  tableRowHoverBackground: "#f3f2f1",
};

const DARK_COLORS: PaletteColors = {
  primaryMain: "#2899f5",
  primaryDark: "#3aa0f3",
  backgroundDefault: "#1b1a19",
  backgroundPaper: "#252423",
  textPrimary: "#f3f2f1",
  textSecondary: "#c8c6c4",
  paperBorder: "#3b3a39",
  tableCellBorder: "#323130",
  tableHeadColor: "#f3f2f1",
  tableHeadBackground: "#252423",
  tableHeadBorder: "#484644",
  tableRowHoverBackground: "#323130",
};

/**
 * The look of a report's own table widget, kept deliberately separate from the app's tables.
 *
 * These numbers are Power BI's, not invented: its theme declares Segoe UI at 10pt (#252423) for
 * values and Segoe UI Semibold for headers, and its table visual renders a thin rule under the
 * header, no vertical gridlines, faint row separators and very tight rows (~18px). Management
 * pages keep the roomier house style — a report has to look like the thing it replaced, an
 * admin screen does not.
 */
export const POWERBI_TABLE_SX = {
  fontFamily: "'Segoe UI', 'Segoe UI Web (West European)', -apple-system, system-ui, sans-serif",
  "& .MuiTableCell-root": {
    fontFamily: "inherit",
    fontSize: "11px",
    lineHeight: 1.35,
    padding: "2px 8px",
    borderBottom: "1px solid",
    borderBottomColor: "divider",
    whiteSpace: "nowrap",
  },
  "& .MuiTableCell-head": {
    fontFamily: "inherit",
    fontWeight: 600,
    fontSize: "11px",
    padding: "3px 8px",
    background: "transparent",
    borderBottom: "1px solid",
    borderBottomColor: "text.disabled",
  },
  // Banding is faint on purpose; Power BI's is barely perceptible and heavier striping reads as
  // a different product.
  "& .MuiTableBody-root .MuiTableRow-root:nth-of-type(even) .MuiTableCell-root": {
    backgroundColor: "action.hover",
  },
  // The sort control is inline text in Power BI, not a control that reserves its own height.
  "& .MuiTableSortLabel-root": { fontSize: "inherit", fontWeight: "inherit" },
  "& .MuiTableSortLabel-icon": { fontSize: "12px", margin: 0 },
} as const;

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
      // Segoe UI first — the same face the reports use, so a report and its surrounding chrome
      // don't disagree about what product this is.
      fontFamily: "'Segoe UI', 'Segoe UI Web (West European)', system-ui, -apple-system, Roboto, sans-serif",
      button: { textTransform: "none" },
      fontSize: 14,
      h4: { fontSize: "1.75rem", fontWeight: 600 },
      h5: { fontSize: "1.25rem", fontWeight: 600 },
      h6: { fontSize: "1rem", fontWeight: 600 },
      subtitle2: { fontWeight: 600 },
    },
    // Fluent corners are 2-4px. The previous 8px pill look is the single biggest reason the app
    // read as a different design language.
    shape: { borderRadius: 4 },
    // Fluent depth is far shallower than MUI's default ramp: a hairline border does the work and
    // elevation is reserved for things that genuinely float.
    shadows: [
      "none",
      "0 1px 2px rgba(0,0,0,.09)",
      ...Array(23).fill("0 4px 8px rgba(0,0,0,.10), 0 0 2px rgba(0,0,0,.08)"),
    ] as unknown as Theme["shadows"],
    components: {
      MuiPaper: {
        styleOverrides: {
          root: { border: `1px solid ${colors.paperBorder}`, backgroundImage: "none" },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          // Outlined TextField/Select boxes have a transparent background by default, so
          // whatever page background sits behind them (this app's grey --canvas) shows through
          // instead of a clean fill. This one override fixes every input/select app-wide.
          root: { background: colors.backgroundPaper },
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
      // Fluent's command-bar button: flat, no fill, no border, regular weight, tight padding —
      // what Power BI's File/Export/Share row looks like. The row-action buttons in the reports
      // list are exactly that pattern, and were rendering as heavy pills.
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            fontWeight: 400,
            minWidth: 0,
            padding: "4px 8px",
            borderRadius: 2,
          },
          text: {
            color: colors.textPrimary,
            "&:hover": { background: colors.tableRowHoverBackground },
          },
          // Kept for the one or two genuine primary actions (Create, Save); Fluent fills only those.
          contained: { boxShadow: "none", "&:hover": { boxShadow: "none" } },
          outlined: { borderColor: colors.tableHeadBorder, color: colors.textPrimary },
          sizeSmall: { fontSize: "0.8125rem", padding: "2px 6px" },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: { borderRadius: 2, height: 20, fontSize: "0.75rem" },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { borderRadius: 2, fontSize: "0.75rem" },
        },
      },
      MuiTextField: {
        defaultProps: { size: "small" },
      },
      MuiDialog: {
        styleOverrides: {
          paper: { borderRadius: 4 },
        },
      },
    },
  });
}
