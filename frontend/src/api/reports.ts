import axios from "axios";

export interface Report {
  id: number;
  name: string;
  description: string;
}

const api = axios.create({ baseURL: "http://localhost:5198/api" });

export async function getReports(): Promise<Report[]> {
  const res = await api.get<Report[]>("/reports");
  return res.data;
}

export async function createReport(name: string, description: string): Promise<Report> {
  const res = await api.post<Report>("/reports", { name, description });
  return res.data;
}
