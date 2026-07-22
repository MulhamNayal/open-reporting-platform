import { Alert, Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetSummary } from "../api/widgets";
import { parseFormatOptions } from "../api/widgets";
import { findMissingFields, isBindingComplete } from "./staleBindingCheck";
import TableWidget from "./TableWidget";
import BarWidget from "./BarWidget";
import LineWidget from "./LineWidget";
import PieWidget from "./PieWidget";
import KpiWidget from "./KpiWidget";
import ScatterWidget from "./ScatterWidget";
import TextWidget from "./TextWidget";

function WidgetRenderer({
  widget, result, onDataPointClick,
}: {
  widget: WidgetSummary;
  result: QueryResult | null;
  onDataPointClick?: (field: string, value: string) => void;
}) {
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

  const format = parseFormatOptions(widget.binding.formatOptions);
  // showTitle toggles the displayed title; a non-empty format title overrides the widget's own.
  const chartTitle = format.showTitle ? (format.title || widget.title) : "";

  switch (widget.type) {
    case "Table":
      return <TableWidget title={chartTitle} result={result} valueFields={widget.binding.valueFields} />;
    case "Bar":
      return <BarWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "StackedColumn":
      return <BarWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} stacked format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "ClusteredBar":
      return <BarWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} horizontal format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Line":
      return <LineWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Pie":
      return <PieWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Area":
      return <LineWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} area format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Donut":
      return <PieWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} donut format={format} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Kpi":
      return <KpiWidget title={chartTitle} result={result} valueField={widget.binding.valueFields[0]} />;
    case "Scatter":
      return (
        <ScatterWidget
          title={chartTitle}
          result={result}
          xField={widget.binding.valueFields[0]}
          yField={widget.binding.valueFields[1]}
          detailsField={widget.binding.categoryField}
          format={format}
          onDataPointClick={onDataPointClick && widget.binding.categoryField ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined}
        />
      );
    default:
      return null;
  }
}

export default WidgetRenderer;
