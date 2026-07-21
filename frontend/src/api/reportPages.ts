import axios from "axios";

export interface ReportPage {
  id: number;
  reportId: number;
  name: string;
  sortOrder: number;
  filterState: string;
}

export interface UpdateReportPageRequest {
  name?: string;
  sortOrder?: number;
  filterState?: string;
}

const api = axios.create({ baseURL: "http://localhost:5198/api" });

export async function getReportPages(reportId: number): Promise<ReportPage[]> {
  const res = await api.get<ReportPage[]>(`/reports/${reportId}/pages`);
  return res.data;
}

export async function createReportPage(reportId: number, name: string | null): Promise<ReportPage> {
  const res = await api.post<ReportPage>(`/reports/${reportId}/pages`, { name });
  return res.data;
}

export async function updateReportPage(reportId: number, pageId: number, updates: UpdateReportPageRequest): Promise<ReportPage> {
  const res = await api.put<ReportPage>(`/reports/${reportId}/pages/${pageId}`, updates);
  return res.data;
}

export async function deleteReportPage(reportId: number, pageId: number): Promise<void> {
  await api.delete(`/reports/${reportId}/pages/${pageId}`);
}
