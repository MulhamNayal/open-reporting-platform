import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import { shapeKpiValue } from "./shaping";

function KpiWidget({ title, result, valueField }: { title: string; result: QueryResult; valueField: string }) {
  const value = shapeKpiValue(result, valueField);

  return (
    <Paper sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
      <Typography variant="subtitle2">{title}</Typography>
      <Typography variant="h3">{value ?? "—"}</Typography>
    </Paper>
  );
}

export default KpiWidget;
