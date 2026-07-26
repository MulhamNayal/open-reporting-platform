import { useEffect, useState } from "react";
import {
  Alert, Box, Button, Container, Dialog, DialogContent, DialogTitle, TextField, Typography,
} from "@mui/material";
import axios from "axios";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import { createReport, getReports, setReportDataset, type Report } from "../api/reports";
import DataTable, { type DataTableColumn } from "../components/DataTable";
import { executeDataset, type QueryResult } from "../api/datasets";
import QueryDefinitionForm, { type QueryDefinitionValue } from "./QueryDefinitionForm";

function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingReport, setPendingReport] = useState<Report | null>(null);
  const navigate = useNavigate();

  async function refresh() {
    setReports(await getReports());
  }

  useEffect(() => {
    refresh().catch(() => setError("Could not load reports — is the backend running on :5198?"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await createReport(name, description);
      setName("");
      setDescription("");
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

  const reportColumns: DataTableColumn<Report>[] = [
    { key: "id", label: "ID", value: (r) => r.id, render: (r) => r.id },
    { key: "name", label: "Name", value: (r) => r.name, render: (r) => r.name },
    { key: "description", label: "Description", value: (r) => r.description ?? "", render: (r) => r.description },
    {
      key: "designer",
      label: "Designer",
      render: (r) => (
        <>
          <Button size="small" component={RouterLink} to={`/reports/${r.id}`}>View</Button>
          <Button size="small" component={RouterLink} to={`/reports/${r.id}/edit`}>Edit</Button>
        </>
      ),
    },
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>Reports</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", gap: 2, mb: 3 }}>
        <TextField label="Name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Description" size="small" value={description} onChange={(e) => setDescription(e.target.value)} sx={{ flexGrow: 1 }} />
        <Button type="submit" variant="contained">Add</Button>
      </Box>
      <DataTable columns={reportColumns} rows={reports} rowKey={(r) => r.id} />

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
