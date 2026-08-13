import axios from "axios";

export interface Workspace {
  id: number;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  // Filled by the server with one grouped count, so the rail can show it without a call per row.
  reportCount: number;
}

const api = axios.create({ baseURL: import.meta.env.DEV ? "http://localhost:5198/api" : "/reporting/api" });

export async function getWorkspaces(includeInactive = false): Promise<Workspace[]> {
  const res = await api.get<Workspace[]>(`/workspaces${includeInactive ? "?includeInactive=true" : ""}`);
  return res.data;
}

export async function createWorkspace(name: string, description = ""): Promise<Workspace> {
  const res = await api.post<Workspace>("/workspaces", { name, description, sortOrder: null });
  return res.data;
}

// Every field is optional: null leaves it as it is, matching the backend's update semantics.
export async function updateWorkspace(
  id: number,
  changes: { name?: string; description?: string; sortOrder?: number; isActive?: boolean },
): Promise<Workspace> {
  const res = await api.put<Workspace>(`/workspaces/${id}`, {
    name: changes.name ?? null,
    description: changes.description ?? null,
    sortOrder: changes.sortOrder ?? null,
    isActive: changes.isActive ?? null,
  });
  return res.data;
}

export async function deleteWorkspace(id: number): Promise<void> {
  await api.delete(`/workspaces/${id}`);
}

export async function setReportWorkspace(reportId: number, workspaceId: number): Promise<void> {
  await api.put(`/reports/${reportId}/workspace`, { workspaceId });
}
