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
  const { rawResult, filteredResult, loading, reportPageId, reportName } = useReportQuery();
  if (loading) {
    return <div>loading</div>;
  }
  return (
    <div>
      <div>rows: {rawResult?.rows.length ?? 0}</div>
      <div>filtered: {filteredResult?.rows.length ?? 0}</div>
      <div>page: {reportPageId ?? "none"}</div>
      <div>name: {reportName ?? "none"}</div>
    </div>
  );
}

describe("ReportQueryProvider", () => {
  it("fetches the report's dataset and first page exactly once", async () => {
    vi.spyOn(reportsApi, "getReport").mockResolvedValue({ id: 1, name: "R", description: "", datasetId: 5, isActive: true, lastViewedAtUtc: null, viewCount: 0 });
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

  it("exposes the fetched report's real name", async () => {
    vi.spyOn(reportsApi, "getReport").mockResolvedValue({ id: 1, name: "Q3 Sales", description: "", datasetId: null, isActive: true, lastViewedAtUtc: null, viewCount: 0 });
    vi.spyOn(reportPagesApi, "getReportPages").mockResolvedValue([
      { id: 10, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{}" },
    ]);

    render(
      <ReportQueryProvider reportId={1}>
        <Probe />
      </ReportQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText("name: Q3 Sales")).toBeInTheDocument());
  });

  it("does not call executeDataset when the report has no datasetId yet", async () => {
    vi.spyOn(reportsApi, "getReport").mockResolvedValue({ id: 2, name: "R", description: "", datasetId: null, isActive: true, lastViewedAtUtc: null, viewCount: 0 });
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

describe("ReportQueryProvider multi-dataset cache", () => {
  const page = [{ id: 10, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{}" }];

  function DatasetProbe({ ids }: { ids: Array<number | null> }) {
    const { ensureDatasets, filteredResultFor, datasetErrors, datasetErrorFor, refresh, loading } = useReportQuery();
    if (loading) {
      return <div>loading</div>;
    }
    return (
      <div>
        <button onClick={() => void ensureDatasets(ids)}>ensure</button>
        <button onClick={() => void refresh()}>refresh</button>
        <div>default: {filteredResultFor(null)?.rows.length ?? "none"}</div>
        <div>seven: {filteredResultFor(7)?.rows.length ?? "none"}</div>
        <div>err7: {datasetErrors.get(7) ?? "none"}</div>
        <div>errFor7: {datasetErrorFor(7) ?? "none"}</div>
        <div>errForDefault: {datasetErrorFor(null) ?? "none"}</div>
      </div>
    );
  }

  // ensureDatasets reads the dataset's metadata before deciding whether to fetch its rows at all,
  // so every test here needs one. DirectQuery keeps the fetch-the-whole-result path these tests
  // were written against.
  function mockDatasetInfo(storageMode: datasetsApi.DatasetStorageMode = "DirectQuery") {
    vi.spyOn(datasetsApi, "getDataset").mockImplementation(async (id: number) => ({
      id, dataSourceConnectionId: 1, name: `Ds ${id}`, description: null, mode: "RawSql",
      definitionJson: "{}", rowLimit: null, isSaved: true, columns: [],
      createdAtUtc: "2026-01-01T00:00:00Z", updatedAtUtc: "2026-01-01T00:00:00Z",
      storageMode, lastMaterializedAtUtc: null, materializedRowCount: null, lastMaterializeError: null,
    }));
  }

  function mockReport(datasetId: number | null) {
    vi.spyOn(reportsApi, "getReport").mockResolvedValue({ id: 1, name: "R", description: "", datasetId, isActive: true, lastViewedAtUtc: null, viewCount: 0 });
    vi.spyOn(reportPagesApi, "getReportPages").mockResolvedValue(page);
    mockDatasetInfo();
  }

  it("resolves a null dataset id to the report default", async () => {
    mockReport(5);
    vi.spyOn(datasetsApi, "executeDataset").mockResolvedValue({
      columns: [{ name: "Region", nativeType: "nvarchar(20)" }],
      rows: [["North"], ["South"]],
    });

    render(
      <ReportQueryProvider reportId={1}>
        <DatasetProbe ids={[]} />
      </ReportQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText("default: 2")).toBeInTheDocument());
  });

  it("returns null for a dataset that hasn't loaded yet rather than throwing", async () => {
    mockReport(5);
    vi.spyOn(datasetsApi, "executeDataset").mockResolvedValue({ columns: [], rows: [] });

    render(
      <ReportQueryProvider reportId={1}>
        <DatasetProbe ids={[]} />
      </ReportQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText("seven: none")).toBeInTheDocument());
  });

  it("ensureDatasets fetches an uncached dataset and exposes it via filteredResultFor", async () => {
    mockReport(5);
    vi.spyOn(datasetsApi, "executeDataset").mockImplementation(async (id: number) =>
      id === 7
        ? { columns: [{ name: "Team", nativeType: "nvarchar(20)" }], rows: [["Alpha"], ["Beta"], ["Gamma"]] }
        : { columns: [{ name: "Region", nativeType: "nvarchar(20)" }], rows: [["North"]] },
    );

    render(
      <ReportQueryProvider reportId={1}>
        <DatasetProbe ids={[7]} />
      </ReportQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText("default: 1")).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText("ensure"));

    expect(await screen.findByText("seven: 3")).toBeInTheDocument();
  });

  it("ensureDatasets called twice for the same id fetches it only once", async () => {
    mockReport(5);
    const executeSpy = vi.spyOn(datasetsApi, "executeDataset").mockResolvedValue({ columns: [], rows: [] });

    render(
      <ReportQueryProvider reportId={1}>
        <DatasetProbe ids={[7]} />
      </ReportQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText("ensure")).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByText("ensure"));
    await user.click(screen.getByText("ensure"));

    // One for the report default (id 5) on mount, one for id 7 â€” the second ensure is a no-op.
    expect(executeSpy).toHaveBeenCalledTimes(2);
  });

  it("does not re-fetch the report default when it is passed to ensureDatasets", async () => {
    mockReport(5);
    const executeSpy = vi.spyOn(datasetsApi, "executeDataset").mockResolvedValue({ columns: [], rows: [] });

    render(
      <ReportQueryProvider reportId={1}>
        <DatasetProbe ids={[null, 5]} />
      </ReportQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText("ensure")).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText("ensure"));

    expect(executeSpy).toHaveBeenCalledTimes(1);
  });

  it("refresh re-queries every loaded dataset with the cache bypassed, not just the default", async () => {
    mockReport(5);
    const executeSpy = vi.spyOn(datasetsApi, "executeDataset").mockResolvedValue({ columns: [], rows: [] });

    render(
      <ReportQueryProvider reportId={1}>
        <DatasetProbe ids={[7]} />
      </ReportQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText("ensure")).toBeInTheDocument());
    const user = userEvent.setup();
    await user.click(screen.getByText("ensure"));
    await waitFor(() => expect(executeSpy).toHaveBeenCalledWith(7));

    executeSpy.mockClear();
    await user.click(screen.getByText("refresh"));

    // Both the report default (5) and the widget dataset (7) must bypass the server cache â€”
    // otherwise Refresh would appear to do nothing for every non-default widget.
    await waitFor(() => expect(executeSpy).toHaveBeenCalledWith(5, true));
    await waitFor(() => expect(executeSpy).toHaveBeenCalledWith(7, true));
  });

  it("datasetErrorFor surfaces a failed dataset's error and leaves healthy ones clean", async () => {
    mockReport(5);
    vi.spyOn(datasetsApi, "executeDataset").mockImplementation(async (id: number) => {
      if (id === 7) {
        throw new Error("boom");
      }
      return { columns: [{ name: "Region", nativeType: "nvarchar(20)" }], rows: [["North"]] };
    });

    render(
      <ReportQueryProvider reportId={1}>
        <DatasetProbe ids={[7]} />
      </ReportQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText("ensure")).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText("ensure"));

    expect(await screen.findByText("errFor7: Could not load this dataset.")).toBeInTheDocument();
    expect(screen.getByText("errForDefault: none")).toBeInTheDocument();
  });

  it("records a per-dataset error without losing the default dataset's result", async () => {
    mockReport(5);
    vi.spyOn(datasetsApi, "executeDataset").mockImplementation(async (id: number) => {
      if (id === 7) {
        throw new Error("boom");
      }
      return { columns: [{ name: "Region", nativeType: "nvarchar(20)" }], rows: [["North"], ["South"]] };
    });

    render(
      <ReportQueryProvider reportId={1}>
        <DatasetProbe ids={[7]} />
      </ReportQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText("default: 2")).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText("ensure"));

    expect(await screen.findByText(/err7: Could not load this dataset/)).toBeInTheDocument();
    // The one broken query must not blank the rest of the report.
    expect(screen.getByText("default: 2")).toBeInTheDocument();
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
    vi.spyOn(reportsApi, "getReport").mockResolvedValue({ id: 1, name: "R", description: "", datasetId: null, isActive: true, lastViewedAtUtc: null, viewCount: 0 });
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

describe("ReportQueryProvider setReportPageId", () => {
  it("loads the newly-selected page's own FilterState instead of keeping the previous page's", async () => {
    vi.spyOn(reportsApi, "getReport").mockResolvedValue({ id: 1, name: "R", description: "", datasetId: null, isActive: true, lastViewedAtUtc: null, viewCount: 0 });
    vi.spyOn(reportPagesApi, "getReportPages").mockResolvedValue([
      { id: 10, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{\"Region\":[\"North\"]}" },
      { id: 11, reportId: 1, name: "Page 2", sortOrder: 1, filterState: "{\"Region\":[\"South\"]}" },
    ]);

    function Probe3() {
      const { setReportPageId, filterState } = useReportQuery();
      return (
        <div>
          <button onClick={() => setReportPageId(11)}>go to page 2</button>
          <div>filters: {JSON.stringify(filterState)}</div>
        </div>
      );
    }

    render(
      <ReportQueryProvider reportId={1}>
        <Probe3 />
      </ReportQueryProvider>,
    );

    await waitFor(() => expect(screen.getByText('filters: {"Region":["North"]}')).toBeInTheDocument());
    await userEvent.setup().click(screen.getByText("go to page 2"));

    expect(await screen.findByText('filters: {"Region":["South"]}')).toBeInTheDocument();
  });
});
