import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as reportsApi from "../api/reports";
import * as reportPagesApi from "../api/reportPages";
import * as datasetsApi from "../api/datasets";
import { ReportQueryProvider, useReportQuery } from "./ReportQueryContext";

// This project doesn't enable Vitest globals, so RTL's automatic cleanup doesn't run,
// and spies aren't restored between tests. Without a manual reset, the first test's
// mounted provider and its recorded executeDataset call leak into the second.
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Probe() {
  const { rawResult, filteredResult, loading, reportPageId } = useReportQuery();
  if (loading) {
    return <div>loading</div>;
  }
  return (
    <div>
      <div>rows: {rawResult?.rows.length ?? 0}</div>
      <div>filtered: {filteredResult?.rows.length ?? 0}</div>
      <div>page: {reportPageId ?? "none"}</div>
    </div>
  );
}

describe("ReportQueryProvider", () => {
  it("fetches the report's dataset and first page exactly once", async () => {
    vi.spyOn(reportsApi, "getReport").mockResolvedValue({ id: 1, name: "R", description: "", datasetId: 5 });
    vi.spyOn(reportPagesApi, "getReportPages").mockResolvedValue([
      { id: 10, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{}" },
    ]);
    const executeSpy = vi.spyOn(datasetsApi, "executeDataset").mockResolvedValue({
      columns: [{ name: "Region", nativeType: "nvarchar(20)" }],
      rows: [["North"], ["South"]],
    });

    render(
      <ReportQueryProvider reportId={1}>
        <Probe />
      </ReportQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText("rows: 2")).toBeInTheDocument());
    expect(screen.getByText("filtered: 2")).toBeInTheDocument();
    expect(screen.getByText("page: 10")).toBeInTheDocument();
    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it("does not call executeDataset when the report has no datasetId yet", async () => {
    vi.spyOn(reportsApi, "getReport").mockResolvedValue({ id: 2, name: "R", description: "", datasetId: null });
    vi.spyOn(reportPagesApi, "getReportPages").mockResolvedValue([
      { id: 11, reportId: 2, name: "Page 1", sortOrder: 0, filterState: "{}" },
    ]);
    const executeSpy = vi.spyOn(datasetsApi, "executeDataset");

    render(
      <ReportQueryProvider reportId={2}>
        <Probe />
      </ReportQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText("rows: 0")).toBeInTheDocument());
    expect(executeSpy).not.toHaveBeenCalled();
  });
});

describe("ReportQueryProvider saveFilterState", () => {
  function Probe2() {
    const { setFilterState, saveFilterState } = useReportQuery();
    return (
      <div>
        <button onClick={() => setFilterState({ Region: ["North"] })}>set</button>
        <button onClick={() => saveFilterState()}>save</button>
      </div>
    );
  }

  it("persists the current filterState to the active ReportPage via updateReportPage", async () => {
    vi.spyOn(reportsApi, "getReport").mockResolvedValue({ id: 1, name: "R", description: "", datasetId: null });
    vi.spyOn(reportPagesApi, "getReportPages").mockResolvedValue([
      { id: 10, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{}" },
    ]);
    const updateSpy = vi.spyOn(reportPagesApi, "updateReportPage").mockResolvedValue({
      id: 10, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{\"Region\":[\"North\"]}",
    });

    render(
      <ReportQueryProvider reportId={1}>
        <Probe2 />
      </ReportQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText("set")).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText("set"));
    await userEvent.setup().click(screen.getByText("save"));

    expect(updateSpy).toHaveBeenCalledWith(1, 10, { filterState: JSON.stringify({ Region: ["North"] }) });
  });
});
