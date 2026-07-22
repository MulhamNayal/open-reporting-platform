import type { EChartsOption } from "echarts";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";

export interface ShapedTableRows {
  columns: string[];
  rows: unknown[][];
}

export interface CategorySeriesOptions {
  sortDirection?: "asc" | "desc" | null;
  dataLabels?: boolean;
  stacked?: boolean;
  horizontal?: boolean;
  area?: boolean;
  showLegend?: boolean;
  grid?: boolean;
  palette?: string;
}

// Named colour themes selectable in the Format tab. The first entry of each
// array is the palette's swatch colour shown in FormatTab.
export const PALETTES: Record<string, string[]> = {
  meridian: ["#5b4fe6", "#8b7ff0", "#b3a9f7", "#7c6ff2", "#4a3fd0", "#c9c2fa"],
  ocean: ["#0ea5e9", "#38bdf8", "#0284c7", "#7dd3fc", "#0369a1", "#bae6fd"],
  sunset: ["#f5a524", "#fb923c", "#f97316", "#fbbf24", "#ea580c", "#fed7aa"],
  forest: ["#46a758", "#65b874", "#2f8f43", "#86c98f", "#227d38", "#b7e0bd"],
};

function paletteColors(name: string | undefined): string[] | undefined {
  return name ? PALETTES[name] : undefined;
}

// Maps the persisted WidgetFormatOptions onto the subset of shaping options the
// chart builders understand. Type-derived flags (stacked/horizontal/area/donut)
// are supplied separately by each widget component.
export function formatToSeriesOptions(format?: WidgetFormatOptions): CategorySeriesOptions {
  if (!format) {
    return {};
  }
  return {
    sortDirection: format.sortDirection,
    dataLabels: format.dataLabels,
    showLegend: format.showLegend,
    grid: format.grid,
    palette: format.palette,
  };
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
    ...(options?.area ? { areaStyle: {} } : {}),
    ...(options?.dataLabels ? { label: { show: true } } : {}),
  }));

  const categoryAxis = { type: "category" as const, data: categories };
  const valueAxis = {
    type: "value" as const,
    ...(options?.grid !== undefined ? { splitLine: { show: options.grid } } : {}),
  };

  const colors = paletteColors(options?.palette);
  const axes = options?.horizontal
    ? { yAxis: categoryAxis, xAxis: valueAxis }
    : { xAxis: categoryAxis, yAxis: valueAxis };

  return {
    ...axes,
    series,
    ...(options?.showLegend ? { legend: { show: true } } : {}),
    ...(colors ? { color: colors } : {}),
  };
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
  options?: CategorySeriesOptions & { donut?: boolean },
): EChartsOption {
  const categoryIndex = columnIndex(result, categoryField);
  const valueIndex = columnIndex(result, valueField);

  let data = result.rows.map((row) => ({ name: String(row[categoryIndex]), value: Number(row[valueIndex]) }));
  if (options?.sortDirection) {
    data = [...data].sort((a, b) => (options.sortDirection === "asc" ? a.value - b.value : b.value - a.value));
  }

  const colors = paletteColors(options?.palette);

  return {
    series: [
      {
        type: "pie",
        data,
        ...(options?.donut ? { radius: ["50%", "70%"] } : {}),
        ...(options?.dataLabels ? { label: { show: true } } : { label: { show: false } }),
      },
    ],
    ...(options?.showLegend ? { legend: { show: true } } : {}),
    ...(colors ? { color: colors } : {}),
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

export function shapeScatterOption(
  result: QueryResult,
  xField: string,
  yField: string,
  detailsField: string | null,
  options?: CategorySeriesOptions,
): EChartsOption {
  const xIndex = columnIndex(result, xField);
  const yIndex = columnIndex(result, yField);

  const splitLine = options?.grid !== undefined ? { splitLine: { show: options.grid } } : {};
  const xAxis = { type: "value" as const, name: xField, ...splitLine };
  const yAxis = { type: "value" as const, name: yField, ...splitLine };
  const colors = paletteColors(options?.palette);
  const label = options?.dataLabels ? { label: { show: true } } : {};

  const seriesTail = {
    ...(options?.showLegend ? { legend: { show: true } } : {}),
    ...(colors ? { color: colors } : {}),
  };

  if (!detailsField) {
    return {
      xAxis,
      yAxis,
      series: [{ type: "scatter", data: result.rows.map((row) => [Number(row[xIndex]), Number(row[yIndex])]), ...label }],
      ...seriesTail,
    };
  }

  const detailsIndex = columnIndex(result, detailsField);
  const groups = new Map<string, Array<[number, number]>>();
  for (const row of result.rows) {
    const key = String(row[detailsIndex]);
    const points = groups.get(key) ?? [];
    points.push([Number(row[xIndex]), Number(row[yIndex])]);
    groups.set(key, points);
  }

  return {
    xAxis,
    yAxis,
    series: [...groups.entries()].map(([name, data]) => ({ type: "scatter", name, data, ...label })),
    ...seriesTail,
  };
}
