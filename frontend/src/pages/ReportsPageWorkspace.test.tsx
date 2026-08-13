import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppearanceProvider } from "../appearance/AppearanceContext";
import * as reportsApi from "../api/reports";
import * as workspacesApi from "../api/workspaces";
import ReportsPage from "./ReportsPage";

// The workspace filter lives in the URL, so these cases are about what the page does with
// ?workspaceId= rather than about local state.
afterEach(() => {
  vi.restoreAllMocks();
});

const WORKSPACES: workspacesApi.Workspace[] = [
  { id: 1, name: "My workspace", description: "", sortOrder: 0, isActive: true, reportCount: 1 },
  { id: 2, name: "Finance Team", description: "", sortOrder: 1, isActive: true, reportCount: 1 },
];

function report(overrides: Partial<reportsApi.Report>): reportsApi.Report {
  return {
    id: 1, name: "R", description: "", datasetId: null, isActive: true,
    lastViewedAtUtc: null, viewCount: 0, workspaceId: 1, ...overrides,
  };
}

function renderPage(path: string, reports: reportsApi.Report[]) {
  const getReports = vi.spyOn(reportsApi, "getReports").mockResolvedValue(reports);
  vi.spyOn(workspacesApi, "getWorkspaces").mockResolvedValue(WORKSPACES);
  render(
    <AppearanceProvider>
      <MemoryRouter initialEntries={[path]}>
        <ReportsPage />
      </MemoryRouter>
    </AppearanceProvider>,
  );
  return getReports;
}

describe("ReportsPage workspace filtering", () => {
  // Filtered server-side: selecting a workspace shouldn't mean fetching every report to throw most
  // of them away.
  it("asks the backend for one workspace when the URL names one", async () => {
    const getReports = renderPage("/reports?workspaceId=2", [report({ id: 9, name: "Deduction Report", workspaceId: 2 })]);

    await waitFor(() => expect(getReports).toHaveBeenCalledWith(false, 2));
  });

  it("asks for everything when the URL names no workspace", async () => {
    const getReports = renderPage("/reports", [report({})]);

    await waitFor(() => expect(getReports).toHaveBeenCalledWith(false, undefined));
  });

  // A filtered list still headed "Reports" reads as a list that has lost most of its rows.
  it("names the workspace in the heading and offers a way out", async () => {
    renderPage("/reports?workspaceId=2", [report({ id: 9, name: "Deduction Report", workspaceId: 2 })]);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Finance Team" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /all reports/i })).toBeInTheDocument();
  });

  it("heads the unfiltered list 'Reports' with nothing to clear", async () => {
    renderPage("/reports", [report({})]);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Reports" })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /all reports/i })).not.toBeInTheDocument();
  });

  // Clearing goes back to the whole list rather than reloading the filtered one.
  it("refetches without a workspace when cleared", async () => {
    const getReports = renderPage("/reports?workspaceId=2", [report({ id: 9, workspaceId: 2 })]);
    await waitFor(() => expect(getReports).toHaveBeenCalledWith(false, 2));

    await userEvent.click(screen.getByRole("button", { name: /all reports/i }));

    await waitFor(() => expect(getReports).toHaveBeenCalledWith(false, undefined));
  });

  // The column is how you see where a report lives, and a second way to reach a workspace.
  it("shows a Workspace column only in the unfiltered list", async () => {
    renderPage("/reports", [report({ id: 9, name: "Deduction Report", workspaceId: 2 })]);

    await waitFor(() => expect(screen.getByRole("columnheader", { name: /workspace/i })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Finance Team" })).toHaveAttribute("href", "/reports?workspaceId=2");
  });

  it("drops the Workspace column when every row would repeat it", async () => {
    renderPage("/reports?workspaceId=2", [report({ id: 9, workspaceId: 2 })]);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Finance Team" })).toBeInTheDocument());
    expect(screen.queryByRole("columnheader", { name: /workspace/i })).not.toBeInTheDocument();
  });

  // Workspace names are only needed to label things, so losing them must not cost the reports list.
  it("falls back to the id and still lists reports when workspaces can't be loaded", async () => {
    vi.spyOn(reportsApi, "getReports").mockResolvedValue([report({ id: 9, name: "Deduction Report", workspaceId: 7 })]);
    vi.spyOn(workspacesApi, "getWorkspaces").mockRejectedValue(new Error("offline"));
    render(
      <AppearanceProvider>
        <MemoryRouter initialEntries={["/reports"]}>
          <ReportsPage />
        </MemoryRouter>
      </AppearanceProvider>,
    );

    await waitFor(() => expect(screen.getByText("Deduction Report")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Workspace 7" })).toBeInTheDocument();
  });
});
