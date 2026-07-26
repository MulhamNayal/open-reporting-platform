import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Box, Typography } from "@mui/material";
import { getWidgets, type WidgetSummary } from "../api/widgets";
import WidgetRenderer from "../widgets/WidgetRenderer";
import { ReportQueryProvider, useReportQuery } from "../reportEditor/ReportQueryContext";
import FiltersPane from "../reportEditor/FiltersPane";
import PageTabsBar from "../reportEditor/PageTabsBar";
import Ribbon from "../reportEditor/Ribbon";
import { toggleCrossFilterValue } from "../reportEditor/clickToCrossFilter";
import "../reportEditor/reportEditor.css";

function ReportViewInner() {
  const {
    reportName, reportPageId, setReportPageId, reportPages, rawResult, filteredResult, filterState, setFilterState,
    loading: queryLoading, refresh,
  } = useReportQuery();
  const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [crossFilter, setCrossFilter] = useState<{ field: string; value: string } | null>(null);

  useEffect(() => {
    if (reportPageId === null) {
      return;
    }

    getWidgets(reportPageId).then(setWidgets).catch(() => setError("Could not load this report's widgets."));
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

  if (queryLoading) {
    return <Box sx={{ p: 4 }}><Typography>Loading…</Typography></Box>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      <Ribbon
        reportName={reportName ?? "Report"}
        onRename={() => {}}
        onChangeDataSource={() => {}}
        onBackToReports={() => {}}
        onAddText={() => {}}
        onToggleFilters={() => {}}
        onRefresh={refresh}
        onSave={() => {}}
        readOnly
      />
      {error && <Alert severity="error">{error}</Alert>}
      <div className="body" style={{ flex: 1 }}>
        <FiltersPane
          visible
          rawResult={rawResult}
          filterState={filterState}
          onChange={setFilterState}
          crossFilter={crossFilter}
          onClearCrossFilter={handleClearCrossFilter}
          onResetAll={handleResetAllFilters}
        />
        <div className="stage">
          <div className="scroll">
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 2, width: 960 }}>
              {widgets.map((w) => (
                <Box key={w.id} sx={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}>
                  <WidgetRenderer
                    widget={w}
                    result={filteredResult}
                    onDataPointClick={handleDataPointClick}
                  />
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

  return (
    <ReportQueryProvider reportId={reportId}>
      <ReportViewInner />
    </ReportQueryProvider>
  );
}

export default ReportView;
