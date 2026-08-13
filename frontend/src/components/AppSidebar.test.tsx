import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppearanceProvider } from "../appearance/AppearanceContext";
import * as workspacesApi from "../api/workspaces";
import * as reportsApi from "../api/reports";
import AppSidebar from "./AppSidebar";

// The rail now fetches workspaces and recents, so every test stubs both; a spy left in place would
// leak into the next test.
afterEach(() => {
  vi.restoreAllMocks();
});

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

function report(overrides: Partial<reportsApi.Report>): reportsApi.Report {
  return {
    id: 1, name: "R", description: "", datasetId: null, isActive: true,
    lastViewedAtUtc: null, viewCount: 0, ...overrides,
  } as reportsApi.Report;
}

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

  // Workspaces is a disclosure — the list is hidden until asked for, so the rail stays 68px.
  it("reveals workspaces when Workspaces is clicked", async () => {
    stub({
      workspaces: [
        { id: 1, name: "Finance", description: "", sortOrder: 0, isActive: true, reportCount: 4 },
        { id: 2, name: "Marketing", description: "", sortOrder: 1, isActive: true, reportCount: 1 },
      ],
    });
    renderRail("/reports");

    expect(screen.queryByRole("link", { name: "Finance" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /workspaces/i }));

    await waitFor(() => expect(screen.getByRole("link", { name: "Finance" })).toBeInTheDocument());
    // Selecting a workspace filters the reports list rather than navigating somewhere new.
    expect(screen.getByRole("link", { name: "Finance" })).toHaveAttribute("href", "/reports?workspaceId=1");
    expect(screen.getByRole("link", { name: "Marketing" })).toBeInTheDocument();
  });

  // Recents are the reports actually opened, most recent first — never the unopened ones.
  it("lists recently viewed reports, newest first", async () => {
    stub({
      reports: [
        report({ id: 10, name: "Older", lastViewedAtUtc: "2026-08-01T00:00:00Z" }),
        report({ id: 11, name: "Newest", lastViewedAtUtc: "2026-08-12T00:00:00Z" }),
        report({ id: 12, name: "Never opened", lastViewedAtUtc: null }),
      ],
    });
    renderRail("/reports");

    await waitFor(() => expect(screen.getByRole("link", { name: "Newest" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Older" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Never opened" })).not.toBeInTheDocument();

    const recents = screen.getAllByRole("link").map((a) => a.textContent);
    expect(recents.indexOf("Newest")).toBeLessThan(recents.indexOf("Older"));
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
