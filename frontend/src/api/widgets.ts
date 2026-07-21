import axios from "axios";

export type WidgetType = "Table" | "Bar" | "Line" | "Pie" | "Kpi" | "Text";

export interface WidgetBindingSummary {
  datasetId: number;
  categoryField: string | null;
  valueFields: string[];
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
  datasetId: number;
  categoryField: string | null;
  valueFields: string[];
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

export async function getWidgets(reportId: number): Promise<WidgetSummary[]> {
  const res = await api.get<WidgetSummary[]>(`/reports/${reportId}/widgets`);
  return res.data;
}

export async function saveWidgets(reportId: number, widgets: SaveWidgetRequest[]): Promise<WidgetSummary[]> {
  const res = await api.put<WidgetSummary[]>(`/reports/${reportId}/widgets`, { widgets });
  return res.data;
}
