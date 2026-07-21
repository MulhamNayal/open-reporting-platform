import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Box, Container, Typography } from "@mui/material";
import { getWidgets, type WidgetSummary } from "../api/widgets";
import WidgetRenderer from "../widgets/WidgetRenderer";

function ReportView() {
  const { id } = useParams<{ id: string }>();
  const reportId = Number(id);
  const [widgets, setWidgets] = useState<WidgetSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWidgets(reportId)
      .then(setWidgets)
      .catch(() => setError("Could not load this report."));
  }, [reportId]);

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>Report</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 2 }}>
        {widgets.map((w) => (
          <Box key={w.id} sx={{ gridColumn: `${w.x + 1} / span ${w.w}`, gridRow: `${w.y + 1} / span ${w.h}` }}>
            <WidgetRenderer widget={w} />
          </Box>
        ))}
      </Box>
    </Container>
  );
}

export default ReportView;
