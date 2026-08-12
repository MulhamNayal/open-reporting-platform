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

  // Power BI's card puts the value first and its label underneath, and the value is nowhere near
  // as large as it looks in the theme: across 247 card visuals in the migrated reports the
  // explicit label size is 20pt (101 of them) or 15pt (97), never the theme's 45pt callout. The
  // label is secondary-coloured and small, which is why the value reads as the subject even at
  // 26px.
  return (
    <Paper sx={{ p: 1.5, height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 0.25 }}>
      <Typography sx={{ fontSize: "26px", fontWeight: 600, lineHeight: 1.1, textAlign: "center" }}>
        {displayValue}
      </Typography>
      {title && (
        <Typography sx={{ fontSize: "12px", color: "text.secondary", textAlign: "center", lineHeight: 1.2 }}>
          {title}
        </Typography>
      )}
    </Paper>
  );
}

export default KpiWidget;
