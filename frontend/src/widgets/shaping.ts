import type { EChartsOption } from "echarts";
import type { QueryResult } from "../api/datasets";

export interface ShapedTableRows {
  columns: string[];
  rows: unknown[][];
}

function columnIndex(result: QueryResult, name: string): number {
  return result.columns.findIndex((c) => c.name === name);
}

export function shapeTableRows(result: QueryResult, valueFields: string[]): ShapedTableRows {
  const columns = valueFields.length > 0 ? valueFields : result.columns.map((c) => c.name);
  const indexes = columns.map((name) => columnIndex(result, name));

  const rows = result.rows.map((row) => indexes.map((i) => (i === -1 ? null : row[i])));

  return { columns, rows };
}

function buildCategorySeriesOption(
  result: QueryResult,
  categoryField: string,
  valueFields: string[],
  seriesType: "bar" | "line",
): EChartsOption {
  const categoryIndex = columnIndex(result, categoryField);
  const categories = result.rows.map((row) => String(row[categoryIndex]));

  const series = valueFields.map((field) => {
    const valueIndex = columnIndex(result, field);
    return {
      name: field,
      type: seriesType,
      data: result.rows.map((row) => Number(row[valueIndex])),
    };
  });

  return {
    xAxis: { type: "category", data: categories },
    yAxis: { type: "value" },
    series,
  };
}

export function shapeBarOption(result: QueryResult, categoryField: string, valueFields: string[]): EChartsOption {
  return buildCategorySeriesOption(result, categoryField, valueFields, "bar");
}

export function shapeLineOption(result: QueryResult, categoryField: string, valueFields: string[]): EChartsOption {
  return buildCategorySeriesOption(result, categoryField, valueFields, "line");
}

export function shapePieOption(result: QueryResult, categoryField: string, valueField: string): EChartsOption {
  const categoryIndex = columnIndex(result, categoryField);
  const valueIndex = columnIndex(result, valueField);

  return {
    series: [
      {
        type: "pie",
        data: result.rows.map((row) => ({ name: String(row[categoryIndex]), value: Number(row[valueIndex]) })),
      },
    ],
  };
}

export function shapeKpiValue(result: QueryResult, valueField: string): number | null {
  if (result.rows.length === 0) {
    return null;
  }

  const valueIndex = columnIndex(result, valueField);
  const value = result.rows[0][valueIndex];
  return typeof value === "number" ? value : Number(value);
}
