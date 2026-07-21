import axios from "axios";

export type DataSourceType = "SqlServer" | "RestApi";

export interface DataSourceConnectionSummary {
  id: number;
  name: string;
  type: DataSourceType;
  host: string;
  databaseName: string | null;
  createdAtUtc: string;
}

export interface ConnectionTestResult {
  success: boolean;
  errorMessage: string | null;
}

export interface CreateDataSourceConnectionRequest {
  name: string;
  type: DataSourceType;
  host: string;
  databaseName: string | null;
  credentialsJson: string;
}

const api = axios.create({ baseURL: "http://localhost:5198/api" });

export async function getDataSources(): Promise<DataSourceConnectionSummary[]> {
  const res = await api.get<DataSourceConnectionSummary[]>("/datasources");
  return res.data;
}

export async function createDataSource(request: CreateDataSourceConnectionRequest): Promise<DataSourceConnectionSummary> {
  const res = await api.post<DataSourceConnectionSummary>("/datasources", request);
  return res.data;
}

export async function testDataSource(id: number): Promise<ConnectionTestResult> {
  const res = await api.post<ConnectionTestResult>(`/datasources/${id}/test`);
  return res.data;
}
