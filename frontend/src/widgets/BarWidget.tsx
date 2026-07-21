import { useRef } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import { shapeBarOption } from "./shaping";
import { useECharts } from "./useECharts";

function BarWidget({
  title, result, categoryField, valueFields,
}: { title: string; result: QueryResult; categoryField: string; valueFields: string[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useECharts(containerRef, shapeBarOption(result, categoryField, valueFields));

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />
    </Paper>
  );
}

export default BarWidget;
