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
      MuiButton: {
        styleOverrides: {
          root: { fontWeight: 600 },
        },
      },
    },
  });
}
