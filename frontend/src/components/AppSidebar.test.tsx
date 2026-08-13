import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppearanceProvider } from "../appearance/AppearanceContext";
import * as workspacesApi from "../api/workspaces";
import * as reportsApi from "../api/reports";
import AppSidebar from "./AppSidebar";

// The rail fetches workspaces and recents, so every test stubs both; a spy left in place would leak
// into the next test.
afterEach(() => {
  vi.restoreAllMocks();
});

function workspace(overrides: Partial<workspacesApi.Workspace>): workspacesApi.Workspace {
  return { id: 1, name: "W", description: "", sortOrder: 0, isActive: true, reportCount: 0, ...overrides };
}

function report(overrides: Partial<reportsApi.Report>): reportsApi.Report {
  return {
    id: 1, name: "R", description: "", datasetId: null, isActive: true,
    lastViewedAtUtc: null, viewCount: 0, workspaceId: 1, ...overrides,
  };
}

function stub({ workspaces = [], reports = [] }: { workspaces?: workspacesApi.Workspace[]; reports?: reportsApi.Report[] } = {}) {
  vi.spyOn(workspacesApi, "getWorkspaces").mockResolvedValue(workspaces);
  vi.spyOn(reportsApi, "getReports").mockResolvedValue(reports);
}

function renderRail(path: string) {
  return render(
    <AppearanceProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppSidebar />
      </MemoryRouter>
    </AppearanceProvider>,
  );
}

const TWO = [
  workspace({ id: 1, name: "Finance Team", reportCount: 30 }),
  workspace({ id: 2, name: "Vietnam", reportCount: 1 }),
];

describe("AppSidebar", () => {
  it("renders the fixed destinations", () => {
    stub();
    renderRail("/reports");

    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/reports");
    expect(screen.getByRole("link", { name: /connections/i })).toHaveAttribute("href", "/datasources");
    expect(screen.getByRole("link", { name: /datasets/i })).toHaveAttribute("href", "/datasets");
  });

  it("marks the active destination", () => {
    stub();
    renderRail("/datasets");

    expect(screen.getByRole("link", { name: /datasets/i })).toHaveClass("active");
    expect(screen.getByRole("link", { name: /connections/i })).not.toHaveClass("active");
  });

  // The list lives in a flyout beside the rail, because a 68px rail can't show a name like
  // "Project Admin Team - Management Reports".
  it("opens a flyout listing workspaces with their report counts", async () => {
    stub({ workspaces: TWO });
    renderRail("/reports");

    expect(screen.queryByRole("link", { name: /Finance Team/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Workspaces" }));

    const flyout = await screen.findByRole("group", { name: "Workspaces" });
    expect(flyout).toBeInTheDocument();
    // Selecting a workspace filters the reports list rather than navigating somewhere new.
    expect(screen.getByRole("link", { name: /Finance Team/ })).toHaveAttribute("href", "/reports?workspaceId=1");
    expect(screen.getByText("30 reports")).toBeInTheDocument();
    expect(screen.getByText("1 report")).toBeInTheDocument();
  });

  it("closes the flyout when the same rail button is clicked again", async () => {
    stub({ workspaces: TWO });
    renderRail("/reports");

    await userEvent.click(screen.getByRole("button", { name: "Workspaces" }));
    expect(await screen.findByRole("group", { name: "Workspaces" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Workspaces" }));
    expect(screen.queryByRole("group", { name: "Workspaces" })).not.toBeInTheDocument();
  });

  it("closes the flyout on Escape", async () => {
    stub({ workspaces: TWO });
    renderRail("/reports");

    await userEvent.click(screen.getByRole("button", { name: "Workspaces" }));
    expect(await screen.findByRole("group", { name: "Workspaces" })).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "Workspaces" })).not.toBeInTheDocument();
  });

  // A short list is faster to scan than to filter, so the box only appears once it isn't.
  it("offers no filter while the list is short", async () => {
    stub({ workspaces: TWO });
    renderRail("/reports");

    await userEvent.click(screen.getByRole("button", { name: "Workspaces" }));

    expect(await screen.findByRole("group", { name: "Workspaces" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("offers a filter once the list is long", async () => {
    stub({ workspaces: Array.from({ length: 9 }, (_, i) => workspace({ id: i + 1, name: `WS ${i + 1}` })) });
    renderRail("/reports");

    await userEvent.click(screen.getByRole("button", { name: "Workspaces" }));

    expect(await screen.findByRole("searchbox")).toBeInTheDocument();
  });

  it("narrows the list as you type and says so when nothing matches", async () => {
    stub({ workspaces: Array.from({ length: 9 }, (_, i) => workspace({ id: i + 1, name: i === 0 ? "Finance Team" : `WS ${i}` })) });
    renderRail("/reports");
    await userEvent.click(screen.getByRole("button", { name: "Workspaces" }));

    await userEvent.type(await screen.findByRole("searchbox"), "finance");
    expect(screen.getByRole("link", { name: /Finance Team/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /WS 1/ })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByRole("searchbox"));
    await userEvent.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText(/no workspace matches/i)).toBeInTheDocument();
  });

  // An empty panel otherwise reads as a failed load.
  it("says so when there are no workspaces at all", async () => {
    stub({ workspaces: [] });
    renderRail("/reports");

    await userEvent.click(screen.getByRole("button", { name: "Workspaces" }));

    expect(await screen.findByText(/no workspaces yet/i)).toBeInTheDocument();
  });

  // The rail should say where you are, not just what you last clicked.
  it("marks the workspace whose reports are on screen", async () => {
    stub({ workspaces: TWO });
    renderRail("/reports?workspaceId=2");

    await userEvent.click(screen.getByRole("button", { name: "Workspaces" }));

    await waitFor(() => expect(screen.getByRole("link", { name: /Vietnam/ })).toHaveClass("active"));
    expect(screen.getByRole("link", { name: /Finance Team/ })).not.toHaveClass("active");
    // Home is the unfiltered list, so it isn't current while a workspace is.
    expect(screen.getByRole("link", { name: /home/i })).not.toHaveClass("active");
  });

  // Recents are the reports actually opened, most recent first — never the unopened ones.
  it("lists recently viewed reports in their own flyout, newest first", async () => {
    stub({
      reports: [
        report({ id: 10, name: "Older", lastViewedAtUtc: "2026-08-01T00:00:00Z" }),
        report({ id: 11, name: "Newest", lastViewedAtUtc: "2026-08-12T00:00:00Z" }),
        report({ id: 12, name: "Never opened", lastViewedAtUtc: null }),
      ],
    });
    renderRail("/reports");

    await userEvent.click(await screen.findByRole("button", { name: "Recent" }));

    const names = screen.getAllByRole("link").map((a) => a.textContent ?? "");
    expect(names.findIndex((n) => n.includes("Newest"))).toBeLessThan(names.findIndex((n) => n.includes("Older")));
    expect(screen.queryByRole("link", { name: /Never opened/ })).not.toBeInTheDocument();
  });

  // Nothing opened yet means nothing to shortcut to, so the button would only lead to an empty panel.
  it("hides Recent until something has been opened", async () => {
    stub({ reports: [report({ id: 12, name: "Never opened", lastViewedAtUtc: null })] });
    renderRail("/reports");

    await waitFor(() => expect(screen.getByRole("link", { name: /home/i })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Recent" })).not.toBeInTheDocument();
  });

  // Neither list is essential to navigation, so a failed fetch must not take the rail with it.
  it("still renders its fixed items when the lookups fail", async () => {
    vi.spyOn(workspacesApi, "getWorkspaces").mockRejectedValue(new Error("offline"));
    vi.spyOn(reportsApi, "getReports").mockRejectedValue(new Error("offline"));
    renderRail("/reports");

    await waitFor(() => expect(screen.getByRole("link", { name: /home/i })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /datasets/i })).toBeInTheDocument();
  });
});
