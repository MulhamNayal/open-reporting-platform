import axios from "axios";

export type DatasetMode = "TableQuery" | "RawSql" | "StoredProcedure" | "RestQuery";

export interface ColumnDescriptor {
  name: string;
  nativeType: string;
}

export interface DatasetSummary {
  id: number;
  dataSourceConnectionId: number;
  name: string;
  description: string | null;
  mode: DatasetMode;
  rowLimit: number | null;
  columns: ColumnDescriptor[];
  createdAtUtc: string;
  updatedAtUtc: string;
}

export interface CreateDatasetRequest {
  dataSourceConnectionId: number;
  name: string;
  description: string | null;
  mode: DatasetMode;
  definitionJson: string;
  rowLimit: number | null;
}

export interface QueryResult {
  columns: ColumnDescriptor[];
  rows: unknown[][];
}

const api = axios.create({ baseURL: "http://localhost:5198/api" });

export async function getDatasets(connectionId: number): Promise<DatasetSummary[]> {
  const res = await api.get<DatasetSummary[]>("/datasets", { params: { connectionId } });
  return res.data;
}

export async function createDataset(request: CreateDatasetRequest): Promise<DatasetSummary> {
  const res = await api.post<DatasetSummary>("/datasets", request);
  return res.data;
}

export async function discoverDatasetColumns(id: number): Promise<ColumnDescriptor[]> {
  const res = await api.post<ColumnDescriptor[]>(`/datasets/${id}/columns`);
  return res.data;
}

export async function executeDataset(id: number): Promise<QueryResult> {
  const res = await api.post<QueryResult>(`/datasets/${id}/execute`);
  return res.data;
}
