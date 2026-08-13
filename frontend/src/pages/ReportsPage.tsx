import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Chip, Container, Dialog, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Menu, MenuItem, Switch, TextField, Typography,
} from "@mui/material";
import axios from "axios";
import { useNavigate, useSearchParams, Link as RouterLink } from "react-router-dom";
import { getWorkspaces, type Workspace } from "../api/workspaces";
import { createReport, duplicateReport, getReports, setReportActive, setReportDataset, type Report } from "../api/reports";
import DataTable, { type DataTableColumn } from "../components/DataTable";
import { executeDataset, type QueryResult } from "../api/datasets";
import QueryDefinitionForm, { type QueryDefinitionValue } from "./QueryDefinitionForm";
import { AddIcon, CopyIcon, EditIcon, ViewIcon } from "../components/FluentIcons";
import { renderLinkedText } from "./linkedText";
import "./reportsPage.css";

// Relative rather than absolute: "3 days ago" answers "is anyone still using this?" at a
// glance, which an ISO timestamp does not.
function formatLastViewed(iso: string | null): string {
  if (!iso) {
    return "never";
  }
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) {
    return "today";
  }
  if (days === 1) {
    return "yesterday";
  }
  return `${days} days ago`;
}

function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingReport, setPendingReport] = useState<Report | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  // The overflow menu's anchor and the row it belongs to are separate: the anchor drives the popup,
  // the row is what the chosen action applies to.
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuReport, setMenuReport] = useState<Report | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // The rail links here with ?workspaceId=N, so the workspace lives in the URL rather than in local
  // state: the filtered list is then a shareable address, and Back leaves it the way it was found.
  const workspaceIdParam = searchParams.get("workspaceId");
  const workspaceId = workspaceIdParam === null ? undefined : Number(workspaceIdParam);
  const activeWorkspace = workspaceId === undefined
    ? null
    : workspaces.find((w) => w.id === workspaceId) ?? null;

  async function refresh(includeInactive = showInactive) {
    setReports(await getReports(includeInactive, Number.isNaN(workspaceId) ? undefined : workspaceId));
  }

  useEffect(() => {
    refresh(showInactive).catch(() => setError("Could not load reports — is the backend running on :5198?"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive, workspaceIdParam]);

  // Only needed to name workspaces in the list and the heading; a failure shouldn't stop reports
  // from rendering, so the column falls back to the raw id.
  useEffect(() => {
    getWorkspaces().then(setWorkspaces).catch(() => setWorkspaces([]));
  }, []);

  async function handleToggleActive(report: Report) {
    setError(null);
    try {
      await setReportActive(report.id, !report.isActive);
      await refresh();
    } catch {
      setError("Could not change this report's status.");
    }
  }

  // Lands you in the editor on the copy: the point of duplicating is to try a design change
  // without risking the original, so the next action is always editing it.
  async function handleDuplicate(report: Report) {
    setError(null);
    try {
      const copy = await duplicateReport(report.id);
      await refresh();
      navigate(`/reports/${copy.id}/edit`);
    } catch {
      setError("Could not duplicate this report.");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await createReport(name, description);
      setName("");
      setDescription("");
      setCreateOpen(false);
      await refresh();
      setPendingReport(created);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError(typeof err.response.data === "string" ? err.response.data : "Invalid input.");
      } else {
        setError("Something went wrong talking to the backend.");
      }
    }
  }

  async function handleRunQuery(value: QueryDefinitionValue): Promise<QueryResult> {
    // A dry run just to show a preview — doesn't persist anything. Reuses the connection's
    // own execute-style preview by temporarily wiring the Dataset via the report itself is
    // unnecessary here: the simplest, side-effect-free preview is running the same query
    // definition against the connection directly is out of scope for this form (Milestone 3
    // didn't build a connection-level ad-hoc preview endpoint either) — so "Run" here previews
    // by provisionally setting the report's dataset, same as "Use this query" would. This is a
    // deliberate simplification: there's no separate "preview without saving" endpoint.
    if (!pendingReport) {
      throw new Error("No pending report");
    }
    const updated = await setReportDataset(pendingReport.id, value);
    setPendingReport(updated);
    return executeDataset(updated.datasetId!);
  }

  async function handleUseQuery(value: QueryDefinitionValue) {
    if (!pendingReport) {
      return;
    }
    await setReportDataset(pendingReport.id, value);
    const reportId = pendingReport.id;
    setPendingReport(null);
    navigate(`/reports/${reportId}/edit`);
  }

  // Falls back to the id so an unnamed workspace still reads as something specific, rather than a
  // blank cell that looks like missing data.
  function workspaceName(id: number): string {
    return workspaces.find((w) => w.id === id)?.name ?? `Workspace ${id}`;
  }

  const reportColumns: DataTableColumn<Report>[] = [
    { key: "id", label: "ID", value: (r) => r.id, render: (r) => r.id },
    { key: "name", label: "Name", value: (r) => r.name, render: (r) => r.name },
    { key: "description", label: "Description", value: (r) => r.description ?? "", render: (r) => renderLinkedText(r.description) },
    // Dropped while viewing a single workspace, where every row would repeat the same value. Sorts
    // and filters on the name via DataTable's own per-column filter, so it doubles as the picker.
    ...(activeWorkspace === null
      ? [{
          key: "workspace",
          label: "Workspace",
          value: (r: Report) => workspaceName(r.workspaceId),
          render: (r: Report) => (
            <RouterLink to={`/reports?workspaceId=${r.workspaceId}`} onClick={(e) => e.stopPropagation()}>
              {workspaceName(r.workspaceId)}
            </RouterLink>
          ),
        }]
      : []),
    {
      key: "usage",
      label: "Usage",
      value: (r) => r.viewCount,
      render: (r) => (r.viewCount === 0 ? "never opened" : `${r.viewCount} · ${formatLastViewed(r.lastViewedAtUtc)}`),
    },
    {
      key: "status",
      label: "Status",
      value: (r) => (r.isActive ? "Active" : "Inactive"),
      render: (r) => (
        <Chip
          size="small"
          label={r.isActive ? "Active" : "Inactive"}
          color={r.isActive ? "success" : "default"}
          variant={r.isActive ? "filled" : "outlined"}
        />
      ),
    },
    {
      key: "designer",
      label: "Actions",
      // Two primary verbs stay visible; the rest go behind an overflow, which is the Fluent
      // pattern and stops every row carrying four competing buttons.
      render: (r) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Button size="small" component={RouterLink} to={`/reports/${r.id}`} startIcon={<ViewIcon />}>View</Button>
          <Button size="small" component={RouterLink} to={`/reports/${r.id}/edit`} startIcon={<EditIcon />}>Edit</Button>
          <IconButton
            size="small"
            aria-label={`More actions for ${r.name}`}
            onClick={(e) => { setMenuReport(r); setMenuAnchor(e.currentTarget); }}
            sx={{ p: 0.25, fontSize: "1rem", lineHeight: 1 }}
          >
            <span aria-hidden="true">&#8943;</span>
          </IconButton>
        </Box>
      ),
    },
  ];

  return (
    <Container maxWidth={false} sx={{ py: 3, px: 3 }} className="reports-page">
      {/* Naming the workspace in the heading, with one obvious way out. A filtered list that still
          says plain "Reports" reads as a report list that has lost most of its rows. */}
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 1.5, mb: 1.5 }}>
        <Typography variant="h4">{activeWorkspace?.name ?? "Reports"}</Typography>
        {activeWorkspace !== null && (
          <Button
            size="small"
            onClick={() => {
              const next = new URLSearchParams(searchParams);
              next.delete("workspaceId");
              setSearchParams(next);
            }}
          >
            All reports
          </Button>
        )}
      </Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Fluent command bar: the page's verbs on one flat row above the list, rather than a
          permanently-open form pushing the content down. */}
      <Box
        sx={{
          display: "flex", alignItems: "center", gap: 0.5, mb: 1.5, py: 0.5,
          borderBottom: 1, borderColor: "divider",
        }}
      >
        <Button size="small" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>New report</Button>
        <Box sx={{ flexGrow: 1 }} />
        <FormControlLabel
          sx={{ mr: 0 }}
          control={<Switch size="small" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />}
          label={<Typography sx={{ fontSize: "0.8125rem" }}>Show deactivated</Typography>}
        />
      </Box>

      <div className="list-panel">
        <DataTable columns={reportColumns} rows={reports} rowKey={(r) => r.id} exportFileName="reports" />
      </div>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
        <MenuItem
          onClick={() => { setMenuAnchor(null); if (menuReport) { void handleDuplicate(menuReport); } }}
          sx={{ gap: 1 }}
        >
          <CopyIcon />Duplicate
        </MenuItem>
        <MenuItem
          onClick={() => { setMenuAnchor(null); if (menuReport) { void handleToggleActive(menuReport); } }}
        >
          {menuReport?.isActive ? "Deactivate" : "Activate"}
        </MenuItem>
      </Menu>

      <Dialog open={createOpen} maxWidth="sm" fullWidth onClose={() => setCreateOpen(false)}>
        <DialogTitle>New report</DialogTitle>
        <DialogContent>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth />
            <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth />
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
              <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button type="submit" variant="contained">Create</Button>
            </Box>
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog open={pendingReport !== null} maxWidth="sm" fullWidth onClose={() => {}}>
        <DialogTitle>Define this report's query</DialogTitle>
        <DialogContent>
          <QueryDefinitionForm onRun={handleRunQuery} onSubmit={handleUseQuery} />
        </DialogContent>
      </Dialog>
    </Container>
  );
}

export default ReportsPage;
