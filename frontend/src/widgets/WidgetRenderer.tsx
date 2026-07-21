import { Alert, Paper, Typography } from "@mui/material";
import type { WidgetSummary } from "../api/widgets";
import { useDatasetExecute } from "./useDatasetExecute";
import { findMissingFields, isBindingComplete } from "./staleBindingCheck";
import TableWidget from "./TableWidget";
import BarWidget from "./BarWidget";
import LineWidget from "./LineWidget";
import PieWidget from "./PieWidget";
import KpiWidget from "./KpiWidget";
import TextWidget from "./TextWidget";

function WidgetRenderer({ widget }: { widget: WidgetSummary }) {
  const datasetId = widget.binding?.datasetId ?? null;
  const { data, loading, error } = useDatasetExecute(datasetId);

  if (widget.type === "Text") {
    return <TextWidget title={widget.title} content={widget.content} />;
  }

  if (!widget.binding) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2">{widget.title}</Typography>
        <Alert severity="info" sx={{ mt: 1 }}>Not bound to a Dataset yet.</Alert>
      </Paper>
    );
  }

  if (loading) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2">{widget.title}</Typography>
        <Typography variant="body2">Loading…</Typography>
      </Paper>
    );
  }

  if (error || !data) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2">{widget.title}</Typography>
        <Alert severity="error" sx={{ mt: 1 }}>{error ?? "No data."}</Alert>
      </Paper>
    );
  }

  const missingFields = findMissingFields(data.columns, widget.binding.categoryField, widget.binding.valueFields);
  if (missingFields.length > 0) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2">{widget.title}</Typography>
        <Alert severity="warning" sx={{ mt: 1 }}>
          Field {missingFields.join(", ")} no longer exists in this Dataset — edit the binding to fix.
        </Alert>
      </Paper>
    );
  }

  if (!isBindingComplete(widget.type, widget.binding.categoryField, widget.binding.valueFields)) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2">{widget.title}</Typography>
        <Alert severity="info" sx={{ mt: 1 }}>Finish configuring this widget's fields to see a preview.</Alert>
      </Paper>
    );
  }

  switch (widget.type) {
    case "Table":
      return <TableWidget title={widget.title} result={data} valueFields={widget.binding.valueFields} />;
    case "Bar":
      return <BarWidget title={widget.title} result={data} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} />;
    case "Line":
      return <LineWidget title={widget.title} result={data} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} />;
    case "Pie":
      return <PieWidget title={widget.title} result={data} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} />;
    case "Kpi":
      return <KpiWidget title={widget.title} result={data} valueField={widget.binding.valueFields[0]} />;
    default:
      return null;
  }
}

export default WidgetRenderer;
