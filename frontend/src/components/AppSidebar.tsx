import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import AppearanceMenu from "../appearance/AppearanceMenu";
import { getWorkspaces, type Workspace } from "../api/workspaces";
import { getReports, type Report } from "../api/reports";
import NavFlyout from "./NavFlyout";
import {
  ClockIcon, ConnectionIcon, DatasetIcon, HomeIcon, WaffleIcon, WorkspacesIcon,
} from "./FluentIcons";
import "./appSidebar.css";

// Enough to scan without a search box; past this the flyout offers one.
const SEARCHABLE_FROM = 8;
// Recents are a shortcut, not a history: a list long enough to need scrolling defeats the point.
const MAX_RECENTS = 8;

type Panel = "workspaces" | "recent" | null;

function AppSidebar() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [recents, setRecents] = useState<Report[]>([]);
  const [panel, setPanel] = useState<Panel>(null);
  const [filter, setFilter] = useState("");

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

  function toggle(next: Exclude<Panel, null>) {
    setFilter("");
    setPanel((current) => (current === next ? null : next));
  }

  function close() {
    setPanel(null);
  }

  // Highlighted while its own reports are the ones on screen, so the rail reflects where you are
  // rather than only what you last clicked.
  const viewedWorkspaceId = location.pathname === "/reports" ? searchParams.get("workspaceId") : null;

  const matches = workspaces.filter((w) => w.name.toLowerCase().includes(filter.trim().toLowerCase()));

  return (
    <>
      <nav className="app-nav">
        <button type="button" className="app-nav-waffle" aria-label="Open Reporting" onClick={close}>
          <WaffleIcon />
        </button>

        <Link
          to="/reports"
          className={"app-nav-link" + (location.pathname === "/reports" && viewedWorkspaceId === null ? " active" : "")}
          onClick={close}
        >
          <span className="app-nav-icon"><HomeIcon /></span>
          <span>Home</span>
        </Link>

        <button
          type="button"
          className={"app-nav-link app-nav-button" + (panel === "workspaces" || viewedWorkspaceId !== null ? " active" : "")}
          aria-expanded={panel === "workspaces"}
          onClick={() => toggle("workspaces")}
        >
          <span className="app-nav-icon"><WorkspacesIcon /></span>
          <span>Workspaces</span>
        </button>

        {recents.length > 0 && (
          <button
            type="button"
            className={"app-nav-link app-nav-button" + (panel === "recent" ? " active" : "")}
            aria-expanded={panel === "recent"}
            onClick={() => toggle("recent")}
          >
            <span className="app-nav-icon"><ClockIcon /></span>
            <span>Recent</span>
          </button>
        )}

        {/* Connections and Datasets are administrative, so they sit below the reporting items the way
            Power BI keeps its own settings out of the main rail. */}
        <div className="app-nav-rule" role="separator" />
        <Link
          to="/datasources"
          className={"app-nav-link" + (location.pathname.startsWith("/datasources") ? " active" : "")}
          onClick={close}
        >
          <span className="app-nav-icon"><ConnectionIcon /></span>
          <span>Connections</span>
        </Link>
        <Link
          to="/datasets"
          className={"app-nav-link" + (location.pathname.startsWith("/datasets") ? " active" : "")}
          onClick={close}
        >
          <span className="app-nav-icon"><DatasetIcon /></span>
          <span>Datasets</span>
        </Link>

        <div className="app-nav-spacer" />
        <div className="app-nav-appearance">
          <AppearanceMenu />
        </div>
      </nav>

      {panel === "workspaces" && (
        <NavFlyout
          title="Workspaces"
          onClose={close}
          search={workspaces.length >= SEARCHABLE_FROM
            ? { value: filter, onChange: setFilter, placeholder: "Filter workspaces" }
            : undefined}
        >
          {/* Distinguishes "none match what you typed" from "there are none", which otherwise both
              show as an empty panel. */}
          {workspaces.length === 0 && <p className="nav-flyout-empty">No workspaces yet.</p>}
          {workspaces.length > 0 && matches.length === 0 && (
            <p className="nav-flyout-empty">No workspace matches “{filter}”.</p>
          )}
          {matches.map((w) => (
            <Link
              key={w.id}
              to={`/reports?workspaceId=${w.id}`}
              className={"nav-flyout-item" + (viewedWorkspaceId === String(w.id) ? " active" : "")}
              onClick={close}
            >
              <span className="nav-flyout-item-icon"><WorkspacesIcon /></span>
              <span className="nav-flyout-item-text">
                <span className="nav-flyout-item-name">{w.name}</span>
                <span className="nav-flyout-item-meta">
                  {w.reportCount} report{w.reportCount === 1 ? "" : "s"}
                </span>
              </span>
            </Link>
          ))}
        </NavFlyout>
      )}

      {panel === "recent" && (
        <NavFlyout title="Recent" onClose={close}>
          {recents.map((r) => (
            <Link
              key={r.id}
              to={`/reports/${r.id}`}
              className={"nav-flyout-item" + (location.pathname === `/reports/${r.id}` ? " active" : "")}
              onClick={close}
            >
              <span className="nav-flyout-item-icon"><ClockIcon /></span>
              <span className="nav-flyout-item-text">
                <span className="nav-flyout-item-name">{r.name}</span>
                <span className="nav-flyout-item-meta">{formatViewed(r.lastViewedAtUtc)}</span>
              </span>
            </Link>
          ))}
        </NavFlyout>
      )}
    </>
  );
}

// Relative time, because "yesterday" is what you actually want from a recents list; an exact
// timestamp is noise at this size.
function formatViewed(iso: string | null): string {
  if (iso === null) {
    return "";
  }
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  if (days < 30) {
    return `${days} days ago`;
  }
  return new Date(iso).toLocaleDateString();
}

export default AppSidebar;
