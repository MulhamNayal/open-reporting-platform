import axios from "axios";

export type WidgetType =
  | "Bar" | "ClusteredBar" | "StackedColumn" | "Line" | "Area" | "Pie" | "Donut" | "Scatter" | "Kpi" | "Table" | "Text";

export type FieldFormatType = "auto" | "decimal" | "integer" | "date" | "boolean" | "text";
export type DatePreset = "iso" | "isoDateTime" | "shortDate" | "longDate" | "monthYear";
export type BooleanStyle = "trueFalse" | "yesNo" | "checkmark";

// One entry per value field a widget plots — keyed by field name, since a single widget can mix
// fields of different native types (e.g. a bar chart with a decimal Revenue and an integer Count).
export interface FieldFormat {
  type: FieldFormatType;
  decimalPlaces: number;
  thousandsSeparator: boolean;
  prefix: string;
  suffix: string;
  datePreset: DatePreset;
  booleanStyle: BooleanStyle;
  // null (the default) means "show the real column name" — set to override it per widget.
  displayName: string | null;
  // Table widgets only. Pixels; null means auto (sized by content, or a manual in-session drag).
  columnWidth: number | null;
}

export interface WidgetFormatOptions {
  showTitle: boolean;
  title: string | null;
  showLegend: boolean;
  grid: boolean;
  palette: string;
  sortField: string | null;
  sortDirection: "asc" | "desc" | null;
  dataLabels: boolean;
  // Table widgets only. Pixels; null means the table's default row height.
  rowHeight: number | null;
  // Table widgets only. Adds a summary row that sums every numeric column. Off by default so
  // existing tables are unchanged; the Power BI reports this platform replaces show one on their
  // pivot-style tables and not on their detail listings, so it has to be per-widget.
  showTotals: boolean;
  fieldFormats: Record<string, Partial<FieldFormat>>;
}

export const DEFAULT_FORMAT_OPTIONS: WidgetFormatOptions = {
  showTitle: true,
  title: null,
  showLegend: true,
  grid: true,
  palette: "meridian",
  sortField: null,
  sortDirection: null,
  dataLabels: false,
  rowHeight: null,
  showTotals: false,
  fieldFormats: {},
};

// Names match the backend enum and map 1:1 to SQL, so the same spec can later be pushed
// into a GROUP BY instead of being applied in the browser.
export type AggregationFn = "None" | "Sum" | "Count" | "CountDistinct" | "Avg" | "Min" | "Max";

export const AGGREGATION_FNS: AggregationFn[] = ["None", "Sum", "Count", "CountDistinct", "Avg", "Min", "Max"];

/**
 * A column computed from other columns rather than read from the source — growth, a conversion rate,
 * variance against target. Evaluated against the AGGREGATED rows, so it yields the ratio of the sums
 * rather than the sum of the ratios, which is the whole reason it can't be an aggregation function.
 */
export interface WidgetMeasure {
  name: string;
  expression: string;
}

export interface WidgetBindingSummary {
  categoryField: string | null;
  valueFields: string[];
  // Aligned by index with valueFields. Absent/null (or a short array) means "None" for the
  // rest — which is how every widget behaved before aggregation existed.
  aggregations?: AggregationFn[] | null;
  // Appended after the aggregated value fields, in order. Absent/null means the widget has none.
  measures?: WidgetMeasure[] | null;
  formatOptions: string;
}

export interface WidgetSummary {
  id: number;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  content: string | null;
  // null means "use the report's default dataset" — see resolveWidgetDatasetId.
  datasetId: number | null;
  binding: WidgetBindingSummary | null;
}

export interface SaveWidgetBindingRequest {
  categoryField: string | null;
  valueFields: string[];
  aggregations?: AggregationFn[] | null;
  measures?: WidgetMeasure[] | null;
  formatOptions: string;
}

export interface SaveWidgetRequest {
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  content: string | null;
  datasetId: number | null;
  binding: SaveWidgetBindingRequest | null;
}

const api = axios.create({ baseURL: import.meta.env.DEV ? "http://localhost:5198/api" : "/reporting/api" });

export async function getWidgets(reportPageId: number): Promise<WidgetSummary[]> {
  const res = await api.get<WidgetSummary[]>(`/reportpages/${reportPageId}/widgets`);
  return res.data;
}

export async function saveWidgets(reportPageId: number, widgets: SaveWidgetRequest[]): Promise<WidgetSummary[]> {
  const res = await api.put<WidgetSummary[]>(`/reportpages/${reportPageId}/widgets`, { widgets });
  return res.data;
}

export function parseFormatOptions(json: string): WidgetFormatOptions {
  try {
    return { ...DEFAULT_FORMAT_OPTIONS, ...JSON.parse(json) };
  } catch {
    return DEFAULT_FORMAT_OPTIONS;
  }
}
