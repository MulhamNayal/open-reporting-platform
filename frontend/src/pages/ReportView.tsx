import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Box, Typography } from "@mui/material";
import { getWidgets, type WidgetSummary } from "../api/widgets";
import WidgetRenderer from "../widgets/WidgetRenderer";
import { ReportQueryProvider, useReportQuery } from "../reportEditor/ReportQueryContext";
import FiltersPane from "../reportEditor/FiltersPane";
import PageTabsBar from "../reportEditor/PageTabsBar";
import { toggleCrossFilterValue } from "../reportEditor/clickToCrossFilter";
import "../reportEditor/reportEditor.css";

function ReportViewInner() {
  const {
    reportPageId, setReportPageId, reportPages, rawResult, filteredResult, filterState, setFilterState, loading: queryLoading,
  } = useReportQuery();
  const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (reportPageId === null) {
      return;
    }

    getWidgets(reportPageId).then(setWidgets).catch(() => setError("Could not load this report's widgets."));
  }, [reportPageId]);

  if (queryLoading) {
    return <Box sx={{ p: 4 }}><Typography>Loading…</Typography></Box>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw" }}>
      {error && <Alert severity="error">{error}</Alert>}
      <div className="body" style={{ flex: 1 }}>
        <FiltersPane visible rawResult={rawResult} filterState={filterState} onChange={setFilterState} />
        <div className="stage">
          <div className="scroll">
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 2, width: 960 }}>
              {widgets.map((w) => (
                <Box key={w.id} sx={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}>
                  <WidgetRenderer
                    widget={w}
                    result={filteredResult}
                    onDataPointClick={(field, value) => setFilterState(toggleCrossFilterValue(filterState, field, value))}
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
