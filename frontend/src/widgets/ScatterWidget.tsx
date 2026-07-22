import { useRef } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import { formatToSeriesOptions, shapeScatterOption } from "./shaping";
import { useECharts } from "./useECharts";

function ScatterWidget({
  title, result, xField, yField, detailsField, format, onDataPointClick,
}: {
  title: string;
  result: QueryResult;
  xField: string;
  yField: string;
  detailsField: string | null;
  format?: WidgetFormatOptions;
  onDataPointClick?: (categoryValue: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useECharts(containerRef, shapeScatterOption(result, xField, yField, detailsField, formatToSeriesOptions(format)), onDataPointClick);

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />
    </Paper>
  );
}

export default ScatterWidget;
