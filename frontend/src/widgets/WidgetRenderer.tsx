import { Alert, Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetSummary } from "../api/widgets";
import { findMissingFields, isBindingComplete } from "./staleBindingCheck";
import TableWidget from "./TableWidget";
import BarWidget from "./BarWidget";
import LineWidget from "./LineWidget";
import PieWidget from "./PieWidget";
import KpiWidget from "./KpiWidget";
import ScatterWidget from "./ScatterWidget";
import TextWidget from "./TextWidget";

function WidgetRenderer({ widget, result }: { widget: WidgetSummary; result: QueryResult | null }) {
  if (widget.type === "Text") {
    return <TextWidget title={widget.title} content={widget.content} />;
  }

  if (!widget.binding) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2">{widget.title}</Typography>
        <Alert severity="info" sx={{ mt: 1 }}>Not bound to a field yet.</Alert>
      </Paper>
    );
  }

  if (!result) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2">{widget.title}</Typography>
        <Typography variant="body2">Loading…</Typography>
      </Paper>
    );
  }

  const missingFields = findMissingFields(result.columns, widget.binding.categoryField, widget.binding.valueFields);
  if (missingFields.length > 0) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        <Typography variant="subtitle2">{widget.title}</Typography>
        <Alert severity="warning" sx={{ mt: 1 }}>
          Field {missingFields.join(", ")} no longer exists in this report's query — edit the binding to fix.
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
      return <TableWidget title={widget.title} result={result} valueFields={widget.binding.valueFields} />;
    case "Bar":
      return <BarWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} />;
    case "StackedColumn":
      return <BarWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} stacked />;
    case "ClusteredBar":
      return <BarWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} horizontal />;
    case "Line":
      return <LineWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} />;
    case "Pie":
      return <PieWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} />;
    case "Area":
      return <LineWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} area />;
    case "Donut":
      return <PieWidget title={widget.title} result={result} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} donut />;
    case "Kpi":
      return <KpiWidget title={widget.title} result={result} valueField={widget.binding.valueFields[0]} />;
    case "Scatter":
      return (
        <ScatterWidget
          title={widget.title}
          result={result}
          xField={widget.binding.valueFields[0]}
          yField={widget.binding.valueFields[1]}
          detailsField={widget.binding.categoryField}
        />
      );
    default:
      return null;
  }
}

export default WidgetRenderer;
