import { Box, CssBaseline } from "@mui/material";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import DataSourcesPage from "./pages/DataSourcesPage";
import ReportsPage from "./pages/ReportsPage";
import DatasetsPage from "./pages/DatasetsPage";
import ReportCanvas from "./pages/ReportCanvas";
import ReportView from "./pages/ReportView";
import AppSidebar from "./components/AppSidebar";

function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CssBaseline />
      <Box sx={{ display: "flex", minHeight: "100vh" }}>
        <AppSidebar />
        <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
      </Box>
    </>
  );
}

const router = createBrowserRouter([
  { path: "/", element: <AppShellLayout><ReportsPage /></AppShellLayout> },
  { path: "/reports", element: <AppShellLayout><ReportsPage /></AppShellLayout> },
  { path: "/reports/:id", element: <><CssBaseline /><ReportView /></> },
  { path: "/reports/:id/edit", element: <><CssBaseline /><ReportCanvas /></> },
  { path: "/datasources", element: <AppShellLayout><DataSourcesPage /></AppShellLayout> },
  { path: "/datasets", element: <AppShellLayout><DatasetsPage /></AppShellLayout> },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
