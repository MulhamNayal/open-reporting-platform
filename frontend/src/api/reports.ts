import axios from "axios";
import type { DatasetMode } from "./datasets";

export interface Report {
  id: number;
  name: string;
  description: string;
  datasetId: number | null;
}

export interface SetReportDatasetRequest {
  dataSourceConnectionId: number;
  mode: DatasetMode;
  definitionJson: string;
  rowLimit: number | null;
}

const api = axios.create({ baseURL: "http://localhost:5198/api" });

export async function getReports(): Promise<Report[]> {
  const res = await api.get<Report[]>("/reports");
  return res.data;
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
