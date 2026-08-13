import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Box } from "@mui/material";
import { getWidgets, type WidgetSummary } from "../api/widgets";
import { recordReportView } from "../api/reports";
import WidgetHost from "../reportEditor/WidgetHost";
import { useFilterableFields } from "../reportEditor/useFilterableFields";
import { ReportQueryProvider, useReportQuery } from "../reportEditor/ReportQueryContext";
import FiltersPane from "../reportEditor/FiltersPane";
import PageTabsBar from "../reportEditor/PageTabsBar";
import Ribbon from "../reportEditor/Ribbon";
import { toggleCrossFilterValue } from "../reportEditor/clickToCrossFilter";
import { queryRows } from "../api/datasets";
import { exportSheets } from "../components/dataTableExport";
import "../reportEditor/reportEditor.css";

// A hard cap so an export of a two-million-row dataset doesn't try to build a spreadsheet in the
// browser. Well above any report anyone reads on screen.
const EXPORT_ROW_LIMIT = 50000;

function ReportViewInner() {
  const {
    reportName, reportPageId, setReportPageId, reportPages, datasetResults, datasetInfo, ensureDatasets,
    filterState, setFilterState, loading: queryLoading, error: queryError, refresh, resolveDatasetId,
  } = useReportQuery();
  const filterableFields = useFilterableFields();
  const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [crossFilter, setCrossFilter] = useState<{ field: string; value: string } | null>(null);

  useEffect(() => {
    if (reportPageId === null) {
      return;
    }

    getWidgets(reportPageId)
      .then((loaded) => {
        setWidgets(loaded);
        void ensureDatasets(loaded.map((w) => w.datasetId));
      })
      .catch(() => setError("Could not load this report's widgets."));
    // ensureDatasets omitted deliberately — see the matching note in ReportCanvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportPageId]);

  function handleDataPointClick(field: string, value: string) {
    setFilterState(toggleCrossFilterValue(filterState, field, value));
    setCrossFilter((prev) => (prev && prev.field === field && prev.value === value ? null : { field, value }));
  }

  function handleClearCrossFilter() {
    if (!crossFilter) {
      return;
    }
    setFilterState(toggleCrossFilterValue(filterState, crossFilter.field, crossFilter.value));
    setCrossFilter(null);
  }

  function handleResetAllFilters() {
    setFilterState({});
    setCrossFilter(null);
  }

  // Exports every table on the page in one file — a sheet each for xlsx. Rows are re-fetched rather
  // than read from what the widgets are showing, because a paged table only holds one page and an
  // export of page 1 masquerading as the report would be worse than no button. Report filters are
  // applied so the file matches what's on screen.
  const tableWidgets = widgets.filter((w) => w.type === "Table" && w.binding && resolveDatasetId(w.datasetId) !== null);

  async function handleExport(format: "xlsx" | "csv") {
    setError(null);
    try {
      const filters = Object.entries(filterState)
        .filter(([, values]) => values.length > 0)
        .map(([field, values]) => ({ field, values }));

      const sheets = await Promise.all(tableWidgets.map(async (w) => {
        const datasetId = resolveDatasetId(w.datasetId)!;
        const columns = w.binding!.valueFields;
        const res = await queryRows(datasetId, { filters, columns, skip: 0, take: EXPORT_ROW_LIMIT });
        return {
          name: w.title || `Table ${w.id}`,
          header: res.columns.map((c) => c.name),
          rows: res.rows.map((row) => row.map((cell) => (cell === null || cell === undefined ? "" : String(cell)))),
        };
      }));

      exportSheets(sheets, format, reportName ?? "report");
    } catch {
      setError("Could not export this report.");
    }
  }

  if (queryLoading) {
    return <div className="page-loading">Loading…</div>;
  }

  // Without this the viewer draws a ribbon over an empty stage and says nothing — a failed load
  // and a report with no pages both look identical to one that simply has no widgets on it.
  // A pageless report can't be produced through the app (CreateAsync always makes one, and the
  // last can't be deleted), but rows predating pages exist and still have to render sensibly.
  const notice = queryError ?? (reportPageId === null
    ? "This report has no pages, so there is nothing to display. Open it in the editor to add one."
    : null);

  const ribbon = (
    <Ribbon
      reportName={reportName ?? "Report"}
      onRename={() => {}}
      onChangeDataSource={() => {}}
      onBackToReports={() => {}}
      onAddText={() => {}}
      onToggleFilters={() => {}}
      onRefresh={refresh}
      onSave={() => {}}
      onExport={tableWidgets.length > 0 ? handleExport : undefined}
      readOnly
    />
  );

  if (notice !== null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
        {ribbon}
        <Alert severity={queryError ? "error" : "info"} sx={{ m: 3 }}>{notice}</Alert>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      {ribbon}
      {error && <Alert severity="error">{error}</Alert>}
      <div className="body" style={{ flex: 1 }}>
        <FiltersPane
          visible
          fields={filterableFields}
          hasData={datasetResults.size > 0 || datasetInfo.size > 0}
          filterState={filterState}
          onChange={setFilterState}
          crossFilter={crossFilter}
          onClearCrossFilter={handleClearCrossFilter}
          onResetAll={handleResetAllFilters}
        />
        <div className="stage">
          <div className="scroll">
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 2, width: "100%" }}>
              {widgets.map((w) => (
                <Box key={w.id} sx={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}>
                  <WidgetHost widget={w} onDataPointClick={handleDataPointClick} />
                </Box>
              ))}
            </Box>
          </div>
        </div>
      </div>
      <div className="pagetabs">
        <PageTabsBar
          pages={reportPages}
          activePageId={reportPageId}
          onSelect={setReportPageId}
          onAdd={() => {}}
          onRename={() => {}}
          onDelete={() => {}}
          readOnly
        />
      </div>
    </div>
  );
}

function ReportView() {
  const { id } = useParams<{ id: string }>();
  const reportId = Number(id);

  // Only the viewer records a view — opening the editor shouldn't make a report look used.
  useEffect(() => {
    if (!Number.isNaN(reportId)) {
      void recordReportView(reportId);
    }
  }, [reportId]);

  return (
    <ReportQueryProvider reportId={reportId}>
      <ReportViewInner />
    </ReportQueryProvider>
  );
}

export default ReportView;
