import { AppBar, Box, CssBaseline, Tab, Tabs, Toolbar, Typography } from "@mui/material";
import { createBrowserRouter, Link, RouterProvider, useLocation } from "react-router-dom";
import DataSourcesPage from "./pages/DataSourcesPage";
import ReportsPage from "./pages/ReportsPage";
import DatasetsPage from "./pages/DatasetsPage";

function TopNav() {
  const location = useLocation();
  const currentTab = location.pathname.startsWith("/datasources")
    ? "/datasources"
    : location.pathname.startsWith("/datasets")
      ? "/datasets"
      : "/reports";

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" sx={{ mr: 4 }}>Open Reporting Platform</Typography>
        <Tabs value={currentTab} textColor="inherit" indicatorColor="secondary">
          <Tab label="Reports" value="/reports" component={Link} to="/reports" />
          <Tab label="Data Sources" value="/datasources" component={Link} to="/datasources" />
          <Tab label="Datasets" value="/datasets" component={Link} to="/datasets" />
        </Tabs>
      </Toolbar>
    </AppBar>
  );
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CssBaseline />
      <TopNav />
      <Box>{children}</Box>
    </>
  );
}

const router = createBrowserRouter([
  { path: "/", element: <Layout><ReportsPage /></Layout> },
  { path: "/reports", element: <Layout><ReportsPage /></Layout> },
  { path: "/datasources", element: <Layout><DataSourcesPage /></Layout> },
  { path: "/datasets", element: <Layout><DatasetsPage /></Layout> },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
