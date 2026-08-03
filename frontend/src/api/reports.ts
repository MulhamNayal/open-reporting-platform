import axios from "axios";
import type { DatasetMode } from "./datasets";

export interface Report {
  id: number;
  name: string;
  description: string;
  datasetId: number | null;
  // Manual archive switch — deactivated reports are hidden from the list, not deleted.
  isActive: boolean;
  // Recorded automatically by the viewer, so "unused" is observed rather than declared.
  lastViewedAtUtc: string | null;
  viewCount: number;
}

export interface SetReportDatasetRequest {
  dataSourceConnectionId: number;
  mode: DatasetMode;
  definitionJson: string;
  rowLimit: number | null;
}

const api = axios.create({ baseURL: import.meta.env.DEV ? "http://localhost:5198/api" : "/reporting/api" });

export async function getReports(includeInactive = false): Promise<Report[]> {
  const res = await api.get<Report[]>(`/reports${includeInactive ? "?includeInactive=true" : ""}`);
  return res.data;
}

export async function setReportActive(id: number, isActive: boolean): Promise<Report> {
  const res = await api.put<Report>(`/reports/${id}/active`, { isActive });
  return res.data;
}

// Fire-and-forget: a failed view record must never stop the report rendering.
export async function recordReportView(id: number): Promise<void> {
  try {
    await api.post(`/reports/${id}/view`);
  } catch {
    // ignored on purpose
  }
}

export async function getReport(id: number): Promise<Report> {
  const res = await api.get<Report>(`/reports/${id}`);
  return res.data;
}

export async function createReport(name: string, description: string): Promise<Report> {
  const res = await api.post<Report>("/reports", { name, description });
  return res.data;
}

export async function renameReport(id: number, name: string): Promise<Report> {
  const res = await api.put<Report>(`/reports/${id}`, { name });
  return res.data;
}

export async function deleteReport(id: number): Promise<void> {
  await api.delete(`/reports/${id}`);
}

export async function setReportDataset(id: number, request: SetReportDatasetRequest): Promise<Report> {
  const res = await api.put<Report>(`/reports/${id}/dataset`, request);
  return res.data;
}
