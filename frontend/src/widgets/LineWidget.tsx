import { useRef } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import { shapeLineOption } from "./shaping";
import { useECharts } from "./useECharts";

function LineWidget({
  title, result, categoryField, valueFields, area = false,
}: { title: string; result: QueryResult; categoryField: string; valueFields: string[]; area?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useECharts(containerRef, shapeLineOption(result, categoryField, valueFields, { area }));

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />
    </Paper>
  );
}

export default LineWidget;
