import { useRef } from "react";
import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import { shapePieOption } from "./shaping";
import { useECharts } from "./useECharts";

function PieWidget({
  title, result, categoryField, valueField, donut = false,
}: { title: string; result: QueryResult; categoryField: string; valueField: string; donut?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useECharts(containerRef, shapePieOption(result, categoryField, valueField, { donut }));

  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <div ref={containerRef} style={{ width: "100%", height: 220 }} />
    </Paper>
  );
}

export default PieWidget;
