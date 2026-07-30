import { Alert, Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetSummary } from "../api/widgets";
import { parseFormatOptions } from "../api/widgets";
import { useAppearance } from "../appearance/AppearanceContext";
import { findMissingFields, isBindingComplete } from "./staleBindingCheck";
import TableWidget from "./TableWidget";
import BarWidget from "./BarWidget";
import LineWidget from "./LineWidget";
import PieWidget from "./PieWidget";
import KpiWidget from "./KpiWidget";
import ScatterWidget from "./ScatterWidget";
import TextWidget from "./TextWidget";

function WidgetRenderer({
  widget, result, error = null, onDataPointClick, hideTitle = false,
}: {
  widget: WidgetSummary;
  result: QueryResult | null;
  error?: string | null;
  onDataPointClick?: (field: string, value: string) => void;
  hideTitle?: boolean;
}) {
  const { mode } = useAppearance();

  if (widget.type === "Text") {
    return <TextWidget title={hideTitle ? "" : widget.title} content={widget.content} />;
  }

  if (!widget.binding) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        {!hideTitle && <Typography variant="subtitle2">{widget.title}</Typography>}
        <Alert severity="info" sx={{ mt: 1 }}>Not bound to a field yet.</Alert>
      </Paper>
    );
  }

  // Checked before the null-result branch: a failed dataset never produces a result, so
  // without this the widget would sit on Loading… indefinitely.
  if (error) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        {!hideTitle && <Typography variant="subtitle2">{widget.title}</Typography>}
        <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>
      </Paper>
    );
  }

  if (!result) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        {!hideTitle && <Typography variant="subtitle2">{widget.title}</Typography>}
        <Typography variant="body2">Loading…</Typography>
      </Paper>
    );
  }

  const missingFields = findMissingFields(result.columns, widget.binding.categoryField, widget.binding.valueFields);
  if (missingFields.length > 0) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        {!hideTitle && <Typography variant="subtitle2">{widget.title}</Typography>}
        <Alert severity="warning" sx={{ mt: 1 }}>
          Field {missingFields.join(", ")} no longer exists in this report's query — edit the binding to fix.
        </Alert>
      </Paper>
    );
  }

  if (!isBindingComplete(widget.type, widget.binding.categoryField, widget.binding.valueFields)) {
    return (
      <Paper sx={{ p: 2, height: "100%" }}>
        {!hideTitle && <Typography variant="subtitle2">{widget.title}</Typography>}
        <Alert severity="info" sx={{ mt: 1 }}>Finish configuring this widget's fields to see a preview.</Alert>
      </Paper>
    );
  }

  const format = parseFormatOptions(widget.binding.formatOptions);
  // showTitle toggles the displayed title; a non-empty format title overrides the widget's own.
  // hideTitle suppresses it regardless — used when a wrapping chrome (the report editor's
  // widget card) already shows and lets you rename this same title, so it isn't shown twice.
  const chartTitle = !hideTitle && format.showTitle ? (format.title || widget.title) : "";

  switch (widget.type) {
    case "Table":
      return <TableWidget title={chartTitle} result={result} valueFields={widget.binding.valueFields} format={format} />;
    case "Bar":
      return <BarWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "StackedColumn":
      return <BarWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} stacked format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "ClusteredBar":
      return <BarWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} horizontal format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Line":
      return <LineWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Pie":
      return <PieWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Area":
      return <LineWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueFields={widget.binding.valueFields} area format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Donut":
      return <PieWidget title={chartTitle} result={result} categoryField={widget.binding.categoryField!} valueField={widget.binding.valueFields[0]} donut format={format} mode={mode} onDataPointClick={onDataPointClick ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined} />;
    case "Kpi":
      return <KpiWidget title={chartTitle} result={result} valueField={widget.binding.valueFields[0]} format={format} />;
    case "Scatter":
      return (
        <ScatterWidget
          title={chartTitle}
          result={result}
          xField={widget.binding.valueFields[0]}
          yField={widget.binding.valueFields[1]}
          detailsField={widget.binding.categoryField}
          format={format}
          mode={mode}
          onDataPointClick={onDataPointClick && widget.binding.categoryField ? (value) => onDataPointClick(widget.binding!.categoryField!, value) : undefined}
        />
      );
    default:
      return null;
  }
}

export default WidgetRenderer;
