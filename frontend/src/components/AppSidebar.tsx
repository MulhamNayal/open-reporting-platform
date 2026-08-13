import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import AppearanceMenu from "../appearance/AppearanceMenu";
import { getWorkspaces, type Workspace } from "../api/workspaces";
import { getReports, type Report } from "../api/reports";
import { HomeIcon, ReportIcon, WaffleIcon, WorkspacesIcon } from "./FluentIcons";
import "./appSidebar.css";

// Power BI's rail lists a handful of recently-opened reports, not all of them.
const MAX_RECENTS = 4;

function AppSidebar() {
  const location = useLocation();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [recents, setRecents] = useState<Report[]>([]);
  const [showWorkspaces, setShowWorkspaces] = useState(false);

  useEffect(() => {
    // Neither list is essential to navigation, so a failure leaves the rail's fixed items working
    // rather than blocking the whole shell.
    getWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([]));
    getReports()
      .then((reports) => setRecents(
        reports
          .filter((r) => r.lastViewedAtUtc !== null)
          .sort((a, b) => (a.lastViewedAtUtc! < b.lastViewedAtUtc! ? 1 : -1))
          .slice(0, MAX_RECENTS),
      ))
      .catch(() => setRecents([]));
  }, []);

  return (
    <nav className="app-nav">
      <button
        type="button"
        className="app-nav-waffle"
        aria-label="Switch app"
        aria-expanded={showWorkspaces}
        onClick={() => setShowWorkspaces((open) => !open)}
      >
        <WaffleIcon />
      </button>

      <Link to="/reports" className={"app-nav-link" + (location.pathname === "/reports" ? " active" : "")}>
        <span className="app-nav-icon"><HomeIcon /></span>
        <span>Home</span>
      </Link>

      <button
        type="button"
        className={"app-nav-link app-nav-button" + (showWorkspaces ? " active" : "")}
        aria-expanded={showWorkspaces}
        onClick={() => setShowWorkspaces((open) => !open)}
      >
        <span className="app-nav-icon"><WorkspacesIcon /></span>
        <span>Workspaces</span>
      </button>

      {showWorkspaces && workspaces.length > 0 && (
        <div className="app-nav-sub">
          {workspaces.map((w) => (
            <Link
              key={w.id}
              to={`/reports?workspaceId=${w.id}`}
              className="app-nav-subitem"
              title={`${w.name} — ${w.reportCount} report${w.reportCount === 1 ? "" : "s"}`}
            >
              {w.name}
            </Link>
          ))}
        </div>
      )}

      {recents.length > 0 && (
        <>
          <div className="app-nav-rule" role="separator" />
          {recents.map((r) => (
            <Link
              key={r.id}
              to={`/reports/${r.id}`}
              className={"app-nav-link" + (location.pathname === `/reports/${r.id}` ? " active" : "")}
              title={r.name}
            >
              <span className="app-nav-icon"><ReportIcon /></span>
              <span className="app-nav-recent">{r.name}</span>
            </Link>
          ))}
        </>
      )}

      {/* Connections and Datasets are administrative, so they sit below the reporting items the way
          Power BI keeps its own settings out of the main rail. */}
      <div className="app-nav-rule" role="separator" />
      <Link to="/datasources" className={"app-nav-link" + (location.pathname.startsWith("/datasources") ? " active" : "")}>
        <span className="app-nav-icon">&#128268;</span>
        <span>Connections</span>
      </Link>
      <Link to="/datasets" className={"app-nav-link" + (location.pathname.startsWith("/datasets") ? " active" : "")}>
        <span className="app-nav-icon">&#128218;</span>
        <span>Datasets</span>
      </Link>

      <div className="app-nav-spacer" />
      <div className="app-nav-appearance">
        <AppearanceMenu />
      </div>
    </nav>
  );
}

export default AppSidebar;
