import axios from "axios";

export type DatasetMode = "TableQuery" | "RawSql" | "StoredProcedure" | "RestQuery";

export interface ColumnDescriptor {
  name: string;
  nativeType: string;
}

// Where rows are served from. DirectQuery executes the source per request — today's behaviour.
// Import materialises into a platform-owned table, which is what makes server-side paging and
// filtering possible for sources (stored procedures) that can't be filtered inline.
export type DatasetStorageMode = "DirectQuery" | "Import";

export interface DatasetSummary {
  id: number;
  dataSourceConnectionId: number;
  name: string;
  description: string | null;
  mode: DatasetMode;
  definitionJson: string;
  rowLimit: number | null;
  isSaved: boolean;
  columns: ColumnDescriptor[];
  createdAtUtc: string;
  updatedAtUtc: string;
  storageMode: DatasetStorageMode;
  lastMaterializedAtUtc: string | null;
  materializedRowCount: number | null;
  lastMaterializeError: string | null;
}

export interface CreateDatasetRequest {
  dataSourceConnectionId: number;
  name: string;
  description: string | null;
  mode: DatasetMode;
  definitionJson: string;
  rowLimit: number | null;
  storageMode?: DatasetStorageMode | null;
}

export interface UpdateDatasetRequest {
  name: string;
  description: string | null;
  mode: DatasetMode;
  definitionJson: string;
  rowLimit: number | null;
  // Omitted means "leave unchanged".
  storageMode?: DatasetStorageMode | null;
}

// --- the three narrow query shapes -------------------------------------------------

export interface DatasetFilter {
  field: string;
  values: string[];
}

export interface DatasetSort {
  field: string;
  descending: boolean;
}

export interface PagedQueryResult {
  columns: ColumnDescriptor[];
  rows: unknown[][];
  // Total matching the filter, ignoring paging — lets the UI show "page 3 of 13".
  totalRows: number;
}

export interface MaterializationResult {
  rowCount: number;
  materializedAtUtc: string;
}

export interface QueryResult {
  columns: ColumnDescriptor[];
  rows: unknown[][];
}

const api = axios.create({ baseURL: import.meta.env.DEV ? "http://localhost:5198/api" : "/reporting/api" });

export async function getDatasets(connectionId: number): Promise<DatasetSummary[]> {
  const res = await api.get<DatasetSummary[]>("/datasets", { params: { connectionId } });
  return res.data;
}

// Unlike getDatasets this also returns unsaved (ad-hoc) datasets — a report's default dataset
// is ad-hoc when it came from the "Change data source" dialog, and the widget dataset picker
// needs its connection id to enumerate that connection's saved datasets.
export async function getDataset(id: number): Promise<DatasetSummary> {
  const res = await api.get<DatasetSummary>(`/datasets/${id}`);
  return res.data;
}

export async function createDataset(request: CreateDatasetRequest): Promise<DatasetSummary> {
  const res = await api.post<DatasetSummary>("/datasets", request);
  return res.data;
}

export async function updateDataset(id: number, request: UpdateDatasetRequest): Promise<DatasetSummary> {
  const res = await api.put<DatasetSummary>(`/datasets/${id}`, request);
  return res.data;
}

export async function discoverDatasetColumns(id: number): Promise<ColumnDescriptor[]> {
  const res = await api.post<ColumnDescriptor[]>(`/datasets/${id}/columns`);
  return res.data;
}

// refresh bypasses the server-side result cache — pass it only for an explicit user refresh.
export async function executeDataset(id: number, refresh = false): Promise<QueryResult> {
  const res = await api.post<QueryResult>(`/datasets/${id}/execute${refresh ? "?refresh=true" : ""}`);
  return res.data;
}

// The three shapes below replace fetching a whole result set. Each works for any dataset —
// the backend runs SQL where the source allows it and falls back to in-memory otherwise.

export async function queryRows(
  id: number,
  request: { filters?: DatasetFilter[]; columns?: string[]; sort?: DatasetSort | null; skip?: number; take?: number },
): Promise<PagedQueryResult> {
  const res = await api.post<PagedQueryResult>(`/datasets/${id}/query/rows`, request);
  return res.data;
}

export async function queryAggregate(
  id: number,
  request: { filters?: DatasetFilter[]; categoryField?: string | null; valueFields: string[]; aggregations?: string[] | null },
): Promise<QueryResult> {
  const res = await api.post<QueryResult>(`/datasets/${id}/query/aggregate`, request);
  return res.data;
}

export async function queryDistinct(
  id: number,
  request: { filters?: DatasetFilter[]; column: string; take?: number },
): Promise<string[]> {
  const res = await api.post<string[]>(`/datasets/${id}/query/distinct`, request);
  return res.data;
}

export async function materializeDataset(id: number): Promise<MaterializationResult> {
  const res = await api.post<MaterializationResult>(`/datasets/${id}/materialize`);
  return res.data;
}

export async function deleteDataset(id: number): Promise<void> {
  await api.delete(`/datasets/${id}`);
}

export async function promoteDataset(id: number, name: string): Promise<DatasetSummary> {
  const res = await api.post<DatasetSummary>(`/datasets/${id}/promote`, { name });
  return res.data;
}
