import axios from "axios";

export type WidgetType =
  | "Bar" | "ClusteredBar" | "StackedColumn" | "Line" | "Area" | "Pie" | "Donut" | "Scatter" | "Kpi" | "Table" | "Text";

export interface WidgetFormatOptions {
  showTitle: boolean;
  title: string | null;
  showLegend: boolean;
  grid: boolean;
  palette: string;
  sortField: string | null;
  sortDirection: "asc" | "desc" | null;
  dataLabels: boolean;
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
};

export interface WidgetBindingSummary {
  categoryField: string | null;
  valueFields: string[];
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
  binding: WidgetBindingSummary | null;
}

export interface SaveWidgetBindingRequest {
  categoryField: string | null;
  valueFields: string[];
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
  binding: SaveWidgetBindingRequest | null;
}

const api = axios.create({ baseURL: "http://localhost:5198/api" });

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
