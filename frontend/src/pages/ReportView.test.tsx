import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReportView from "./ReportView";
import { AppearanceProvider } from "../appearance/AppearanceContext";
import type { Report } from "../api/reports";
import type { ReportPage } from "../api/reportPages";

vi.mock("../api/reports", () => ({
  getReport: vi.fn(),
  recordReportView: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../api/reportPages", () => ({
  getReportPages: vi.fn(),
  updateReportPage: vi.fn(),
}));
vi.mock("../api/widgets", () => ({ getWidgets: vi.fn().mockResolvedValue([]) }));
vi.mock("../api/datasets", () => ({ executeDataset: vi.fn(), getDataset: vi.fn() }));

import { getReport } from "../api/reports";
import { getReportPages } from "../api/reportPages";

const report: Report = {
  id: 1, name: "Monthly Sales", description: "", datasetId: null,
  isActive: true, lastViewedAtUtc: null, viewCount: 0, workspaceId: 1,
};

function renderView() {
  return render(
    // The Ribbon pulls in AppearanceMenu, which needs the provider to be present.
    <AppearanceProvider>
      <MemoryRouter initialEntries={["/reports/1"]}>
        <Routes><Route path="/reports/:id" element={<ReportView />} /></Routes>
      </MemoryRouter>
    </AppearanceProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

describe("ReportView", () => {
  // Reports predating the pages concept still exist, and the viewer used to render a ribbon
  // over an empty stage for them — indistinguishable from a report that simply has no widgets.
  it("explains itself when the report has no pages", async () => {
    vi.mocked(getReport).mockResolvedValue(report);
    vi.mocked(getReportPages).mockResolvedValue([]);

    renderView();

    expect(await screen.findByText(/no pages/i)).toBeInTheDocument();
  });

  it("surfaces a failed load instead of rendering blank", async () => {
    vi.mocked(getReport).mockRejectedValue(new Error("boom"));

    renderView();

    expect(await screen.findByText(/could not load this report's data/i)).toBeInTheDocument();
  });

  it("renders the report body once a page exists", async () => {
    const page: ReportPage = { id: 5, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{}" };
    vi.mocked(getReport).mockResolvedValue(report);
    vi.mocked(getReportPages).mockResolvedValue([page]);

    renderView();

    expect(await screen.findByText("Page 1")).toBeInTheDocument();
    expect(screen.queryByText(/no pages/i)).not.toBeInTheDocument();
  });
});
