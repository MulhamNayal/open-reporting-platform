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
