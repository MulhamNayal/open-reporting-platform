import { useRef } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import { formatToSeriesOptions, shapeBarOption } from "./shaping";
import { useECharts } from "./useECharts";

function BarWidget({
  title, result, categoryField, valueFields, stacked = false, horizontal = false, format, onDataPointClick,
}: {
  title: string;
  result: QueryResult;
  categoryField: string;
  valueFields: string[];
  stacked?: boolean;
  horizontal?: boolean;
  format?: WidgetFormatOptions;
  onDataPointClick?: (categoryValue: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useECharts(containerRef, shapeBarOption(result, categoryField, valueFields, { ...formatToSeriesOptions(format), stacked, horizontal }), onDataPointClick);

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />
    </Paper>
  );
}

export default BarWidget;
