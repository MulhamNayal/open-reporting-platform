import { Paper, Typography } from "@mui/material";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import { formatFieldValue, getFieldFormat } from "./fieldFormat";
import { shapeKpiValue } from "./shaping";

function KpiWidget({
  title, result, valueField, format,
}: {
  title: string;
  result: QueryResult;
  valueField: string;
  format?: WidgetFormatOptions;
}) {
  const value = shapeKpiValue(result, valueField);
  const nativeType = result.columns.find((c) => c.name === valueField)?.nativeType;
  const displayValue = value === null ? "—" : formatFieldValue(value, getFieldFormat(format, valueField, nativeType));

  return (
    <Paper sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
      <Typography variant="subtitle2">{title}</Typography>
      <Typography variant="h3">{displayValue}</Typography>
    </Paper>
  );
}

export default KpiWidget;
