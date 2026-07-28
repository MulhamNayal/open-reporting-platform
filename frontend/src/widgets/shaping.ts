import type { EChartsOption } from "echarts";
import type { QueryResult } from "../api/datasets";
import type { WidgetFormatOptions } from "../api/widgets";
import type { ThemeMode } from "../appearance/AppearanceContext";
import { formatFieldValue, getFieldFormat, resolveDisplayName } from "./fieldFormat";

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
  mode?: ThemeMode;
  // The full format (not just the subset above) so builders can resolve a per-field format —
  // needs the specific field name and its native type, both only known inside each builder.
  format?: WidgetFormatOptions;
}

// Resolves a value field's format using its native SQL type from the query result, for tooltip/
// axis-label/data-label formatting inside the chart option builders below.
function resolveFieldFormat(result: QueryResult, format: WidgetFormatOptions | undefined, field: string) {
  const nativeType = result.columns.find((c) => c.name === field)?.nativeType;
  return getFieldFormat(format, field, nativeType);
}

// Named colour themes selectable in the Format tab, one color set per theme mode. The first
// entry of each array is the palette's swatch colour shown in FormatTab.
export const PALETTES: Record<ThemeMode, Record<string, string[]>> = {
  light: {
    meridian: ["#5b4fe6", "#8b7ff0", "#b3a9f7", "#7c6ff2", "#4a3fd0", "#c9c2fa"],
    ocean: ["#0ea5e9", "#38bdf8", "#0284c7", "#7dd3fc", "#0369a1", "#bae6fd"],
    sunset: ["#f5a524", "#fb923c", "#f97316", "#fbbf24", "#ea580c", "#fed7aa"],
    forest: ["#46a758", "#65b874", "#2f8f43", "#86c98f", "#227d38", "#b7e0bd"],
  },
  dark: {
    meridian: ["#8b7ff0", "#a89cf5", "#c9c2fa", "#7c6ff2", "#6a5ce8", "#d6d0fc"],
    ocean: ["#38bdf8", "#7dd3fc", "#0ea5e9", "#bae6fd", "#0284c7", "#e0f2fe"],
    sunset: ["#fb923c", "#fbbf24", "#f97316", "#fed7aa", "#ea580c", "#ffedd5"],
    forest: ["#65b874", "#86c98f", "#46a758", "#b7e0bd", "#2f8f43", "#d5f0d9"],
  },
};

function paletteColors(name: string | undefined, mode: ThemeMode = "light"): string[] | undefined {
  return name ? PALETTES[mode][name] : undefined;
}

// Maps the persisted WidgetFormatOptions onto the subset of shaping options the
// chart builders understand. Type-derived flags (stacked/horizontal/area/donut)
// are supplied separately by each widget component.
export function formatToSeriesOptions(format?: WidgetFormatOptions, mode: ThemeMode = "light"): CategorySeriesOptions {
  if (!format) {
    return { mode };
  }
  return {
    sortDirection: format.sortDirection,
    dataLabels: format.dataLabels,
    showLegend: format.showLegend,
    grid: format.grid,
    palette: format.palette,
    mode,
    format,
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

  const fieldFormats = new Map(valueFields.map((field) => [field, resolveFieldFormat(result, options?.format, field)]));
  const formatSeriesValue = (field: string, value: unknown) => formatFieldValue(value, fieldFormats.get(field)!);
  const displayNames = new Map(valueFields.map((field) => [field, resolveDisplayName(field, fieldFormats.get(field)!)]));

  const series = valueFields.map((field, i) => ({
    name: displayNames.get(field),
    type: seriesType,
    data: seriesValues[i],
    ...(options?.stacked ? { stack: "total" } : {}),
    ...(options?.area ? { areaStyle: {} } : {}),
    ...(options?.dataLabels ? { label: { show: true, formatter: (p: { value: unknown }) => formatSeriesValue(field, p.value) } } : {}),
  }));

  const categoryAxis = { type: "category" as const, data: categories };
  const valueAxis = {
    type: "value" as const,
    ...(options?.grid !== undefined ? { splitLine: { show: options.grid } } : {}),
    // Series can mix native types (e.g. a decimal Revenue with an integer Count), but a shared
    // axis can only render one format — the first value field's format wins.
    axisLabel: { formatter: (value: number) => formatSeriesValue(valueFields[0], value) },
  };

  const colors = paletteColors(options?.palette, options?.mode);
  const axes = options?.horizontal
    ? { yAxis: categoryAxis, xAxis: valueAxis }
    : { xAxis: categoryAxis, yAxis: valueAxis };

  return {
    ...axes,
    series,
    tooltip: {
      trigger: "axis",
      formatter: (params) => {
        const list = (Array.isArray(params) ? params : [params]) as Array<{
          axisValue?: unknown; name?: string; marker?: string; seriesIndex?: number; value?: unknown;
        }>;
        const header = String(list[0]?.axisValue ?? list[0]?.name ?? "");
        // Keyed off seriesIndex, not seriesName — the series name is now the (possibly renamed)
        // display name, which fieldFormats/formatSeriesValue don't know about; the raw field is
        // still recoverable positionally from valueFields.
        const lines = list.map((p) => {
          const field = valueFields[p.seriesIndex ?? 0];
          return `${p.marker ?? ""}${displayNames.get(field)}: ${formatSeriesValue(field, p.value)}`;
        });
        return [header, ...lines].join("<br/>");
      },
    },
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

  const colors = paletteColors(options?.palette, options?.mode);
  const fieldFormat = resolveFieldFormat(result, options?.format, valueField);
  const formatValue = (value: unknown) => formatFieldValue(value, fieldFormat);

  return {
    tooltip: {
      trigger: "item",
      formatter: (params) => {
        const p = Array.isArray(params) ? params[0] : params;
        return `${p.marker ?? ""}${p.name}: ${formatValue(p.value)} (${p.percent}%)`;
      },
    },
    series: [
      {
        type: "pie",
        data,
        ...(options?.donut ? { radius: ["50%", "70%"] } : {}),
        ...(options?.dataLabels
          ? { label: { show: true, formatter: (p: { value: unknown }) => formatValue(p.value) } }
          : { label: { show: false } }),
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

  const xFieldFormat = resolveFieldFormat(result, options?.format, xField);
  const yFieldFormat = resolveFieldFormat(result, options?.format, yField);
  const xDisplayName = resolveDisplayName(xField, xFieldFormat);
  const yDisplayName = resolveDisplayName(yField, yFieldFormat);

  const splitLine = options?.grid !== undefined ? { splitLine: { show: options.grid } } : {};
  const xAxis = { type: "value" as const, name: xDisplayName, ...splitLine, axisLabel: { formatter: (v: number) => formatFieldValue(v, xFieldFormat) } };
  const yAxis = { type: "value" as const, name: yDisplayName, ...splitLine, axisLabel: { formatter: (v: number) => formatFieldValue(v, yFieldFormat) } };
  const colors = paletteColors(options?.palette, options?.mode);
  const label = options?.dataLabels
    ? {
        label: {
          show: true,
          formatter: (p: unknown) => {
            const [x, y] = (p as { value: [number, number] }).value;
            return `(${formatFieldValue(x, xFieldFormat)}, ${formatFieldValue(y, yFieldFormat)})`;
          },
        },
      }
    : {};

  const seriesTail = {
    tooltip: {
      trigger: "item" as const,
      formatter: (params: unknown) => {
        const p = params as { marker?: string; seriesName?: string; value: [number, number] };
        const seriesLine = p.seriesName ? `${p.seriesName}<br/>` : "";
        return `${p.marker ?? ""}${seriesLine}${xDisplayName}: ${formatFieldValue(p.value[0], xFieldFormat)}<br/>${yDisplayName}: ${formatFieldValue(p.value[1], yFieldFormat)}`;
      },
    },
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
