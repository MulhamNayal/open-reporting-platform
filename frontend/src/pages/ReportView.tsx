import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Box, Container, Typography } from "@mui/material";
import { getReport } from "../api/reports";
import { executeDataset, type QueryResult } from "../api/datasets";
import { getWidgets, type WidgetSummary } from "../api/widgets";
import { getReportPages } from "../api/reportPages";
import WidgetRenderer from "../widgets/WidgetRenderer";

function ReportView() {
  const { id } = useParams<{ id: string }>();
  const reportId = Number(id);
  const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const report = await getReport(reportId);
      if (report.datasetId !== null) {
        setResult(await executeDataset(report.datasetId));
      }

      const pages = await getReportPages(reportId);
      const firstPageId = pages[0]?.id ?? null;
      if (firstPageId === null) {
        setWidgets([]);
        return;
      }

      setWidgets(await getWidgets(firstPageId));
    }

    load().catch(() => setError("Could not load this report."));
  }, [reportId]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>Report</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 2 }}>
        {widgets.map((w) => (
          <Box key={w.id} sx={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}>
            <WidgetRenderer widget={w} result={result} />
          </Box>
        ))}
      </Box>
    </Container>
  );
}

export default ReportView;
