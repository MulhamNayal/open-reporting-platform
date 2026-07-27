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
