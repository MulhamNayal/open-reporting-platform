import { useEffect } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as reportsApi from "../api/reports";
import * as reportPagesApi from "../api/reportPages";
import * as datasetsApi from "../api/datasets";
import type { WidgetSummary } from "../api/widgets";
import { ReportQueryProvider, useReportQuery } from "./ReportQueryContext";
import { useWidgetData } from "./useWidgetData";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const page = [{ id: 10, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{}" }];

function mockDataset(storageMode: datasetsApi.DatasetStorageMode) {
  vi.spyOn(reportsApi, "getReport").mockResolvedValue({
    id: 1, name: "R", description: "", datasetId: 5, isActive: true, lastViewedAtUtc: null, viewCount: 0, workspaceId: 1,
  });
  vi.spyOn(reportPagesApi, "getReportPages").mockResolvedValue(page);
  vi.spyOn(datasetsApi, "getDataset").mockImplementation(async (id: number) => ({
    id, dataSourceConnectionId: 1, name: `Ds ${id}`, description: null, mode: "StoredProcedure",
    definitionJson: "{}", rowLimit: null, isSaved: true, columns: [],
    createdAtUtc: "2026-01-01T00:00:00Z", updatedAtUtc: "2026-01-01T00:00:00Z",
    storageMode, lastMaterializedAtUtc: null, materializedRowCount: null, lastMaterializeError: null, refreshIntervalMinutes: null,
  }));
}

function makeWidget(overrides: Partial<WidgetSummary>): WidgetSummary {
  return {
    id: 1, type: "Table", x: 0, y: 0, w: 4, h: 2, title: "W", content: null, datasetId: 7,
    binding: { categoryField: null, valueFields: ["Amount"], aggregations: null, formatOptions: "{}" },
    ...overrides,
  };
}

function Probe({ widget }: { widget: WidgetSummary }) {
  // ReportView and ReportCanvas both do this after loading their widgets; without it the
  // dataset's metadata is never fetched and useWidgetData can't tell Import from DirectQuery.
  const { ensureDatasets } = useReportQuery();
  useEffect(() => {
    void ensureDatasets([widget.datasetId]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.datasetId]);

  const { result, totalRows, paged } = useWidgetData(widget);
  return (
    <div>
      <div>rows: {result?.rows.length ?? "none"}</div>
      <div>total: {totalRows ?? "none"}</div>
      <div>paged: {String(paged)}</div>
    </div>
  );
}

function renderWith(widget: WidgetSummary) {
  return render(
    <ReportQueryProvider reportId={1}>
      <Probe widget={widget} />
    </ReportQueryProvider>,
  );
}

describe("useWidgetData", () => {
  it("a table on an Import dataset asks the server for one page, not the whole result", async () => {
    mockDataset("Import");
    const execute = vi.spyOn(datasetsApi, "executeDataset").mockResolvedValue({ columns: [], rows: [] });
    const rows = vi.spyOn(datasetsApi, "queryRows").mockResolvedValue({
      columns: [{ name: "Amount", nativeType: "int" }],
      rows: [[1], [2], [3]],
      totalRows: 5000,
    });

    renderWith(makeWidget({ type: "Table" }));

    await waitFor(() => expect(screen.getByText("rows: 3")).toBeInTheDocument());
    expect(screen.getByText("total: 5000")).toBeInTheDocument();
    expect(rows).toHaveBeenCalled();
    // The whole point: 5,000 rows never crossed the wire.
    expect(execute).not.toHaveBeenCalledWith(7);
  });

  it("a chart on an Import dataset asks for an aggregate rather than rows", async () => {
    mockDataset("Import");
    const rows = vi.spyOn(datasetsApi, "queryRows");
    const aggregate = vi.spyOn(datasetsApi, "queryAggregate").mockResolvedValue({
      columns: [{ name: "Team", nativeType: "nvarchar(20)" }, { name: "Amount", nativeType: "int" }],
      rows: [["Alpha", 10], ["Beta", 20]],
    });

    renderWith(makeWidget({
      type: "Bar",
      binding: { categoryField: "Team", valueFields: ["Amount"], aggregations: ["Sum"], formatOptions: "{}" },
    }));

    await waitFor(() => expect(screen.getByText("rows: 2")).toBeInTheDocument());
    expect(aggregate).toHaveBeenCalled();
    expect(rows).not.toHaveBeenCalled();
  });

  it("paging is off when the result fits on one page", async () => {
    mockDataset("Import");
    vi.spyOn(datasetsApi, "queryRows").mockResolvedValue({
      columns: [{ name: "Amount", nativeType: "int" }],
      rows: [[1]],
      totalRows: 1,
    });

    renderWith(makeWidget({ type: "Table" }));

    await waitFor(() => expect(screen.getByText("paged: false")).toBeInTheDocument());
  });

  it("a DirectQuery dataset keeps the original whole-result path", async () => {
    mockDataset("DirectQuery");
    const execute = vi.spyOn(datasetsApi, "executeDataset").mockResolvedValue({
      columns: [{ name: "Amount", nativeType: "int" }],
      rows: [[1], [2]],
    });
    const rows = vi.spyOn(datasetsApi, "queryRows");

    renderWith(makeWidget({ type: "Table", datasetId: null }));

    await waitFor(() => expect(execute).toHaveBeenCalled());
    // No server-side query â€” filtering and paging stay in the browser for these.
    expect(rows).not.toHaveBeenCalled();
    expect(screen.getByText("paged: false")).toBeInTheDocument();
  });
});
