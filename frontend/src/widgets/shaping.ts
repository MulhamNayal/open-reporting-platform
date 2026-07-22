import type { EChartsOption } from "echarts";
import type { QueryResult } from "../api/datasets";

export interface ShapedTableRows {
  columns: string[];
  rows: unknown[][];
}

export interface CategorySeriesOptions {
  sortDirection?: "asc" | "desc" | null;
  dataLabels?: boolean;
  stacked?: boolean;
  horizontal?: boolean;
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

function sortCategoriesAndSeries(
  categories: string[],
  seriesValues: number[][],
  sortDirection: "asc" | "desc" | null | undefined,
): { categories: string[]; seriesValues: number[][] } {
  if (!sortDirection) {
    return { categories, seriesValues };
  }

  const order = categories
    .map((_, i) => i)
    .sort((a, b) => (sortDirection === "asc" ? seriesValues[0][a] - seriesValues[0][b] : seriesValues[0][b] - seriesValues[0][a]));

  return {
    categories: order.map((i) => categories[i]),
    seriesValues: seriesValues.map((values) => order.map((i) => values[i])),
  };
}

function buildCategorySeriesOption(
  result: QueryResult,
  categoryField: string,
  valueFields: string[],
  seriesType: "bar" | "line",
  options?: CategorySeriesOptions,
): EChartsOption {
  const categoryIndex = columnIndex(result, categoryField);
  let categories = result.rows.map((row) => String(row[categoryIndex]));

  let seriesValues = valueFields.map((field) => {
    const valueIndex = columnIndex(result, field);
    return result.rows.map((row) => Number(row[valueIndex]));
  });

  ({ categories, seriesValues } = sortCategoriesAndSeries(categories, seriesValues, options?.sortDirection));

  const series = valueFields.map((field, i) => ({
    name: field,
    type: seriesType,
    data: seriesValues[i],
    ...(options?.stacked ? { stack: "total" } : {}),
    ...(options?.dataLabels ? { label: { show: true } } : {}),
  }));

  const categoryAxis = { type: "category" as const, data: categories };
  const valueAxis = { type: "value" as const };

  return options?.horizontal
    ? { yAxis: categoryAxis, xAxis: valueAxis, series }
    : { xAxis: categoryAxis, yAxis: valueAxis, series };
}

export function shapeBarOption(
  result: QueryResult,
  categoryField: string,
  valueFields: string[],
  options?: CategorySeriesOptions,
): EChartsOption {
  return buildCategorySeriesOption(result, categoryField, valueFields, "bar", options);
}

export function shapeLineOption(
  result: QueryResult,
  categoryField: string,
  valueFields: string[],
  options?: CategorySeriesOptions,
): EChartsOption {
  return buildCategorySeriesOption(result, categoryField, valueFields, "line", options);
}

export function shapePieOption(
  result: QueryResult,
  categoryField: string,
  valueField: string,
  options?: CategorySeriesOptions,
): EChartsOption {
  const categoryIndex = columnIndex(result, categoryField);
  const valueIndex = columnIndex(result, valueField);

  let data = result.rows.map((row) => ({ name: String(row[categoryIndex]), value: Number(row[valueIndex]) }));
  if (options?.sortDirection) {
    data = [...data].sort((a, b) => (options.sortDirection === "asc" ? a.value - b.value : b.value - a.value));
  }

  return {
    series: [
      {
        type: "pie",
        data,
        ...(options?.dataLabels ? { label: { show: true } } : { label: { show: false } }),
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
