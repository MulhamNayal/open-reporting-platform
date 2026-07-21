import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";
import { Link as RouterLink } from "react-router-dom";
import { createReport, getReports, type Report } from "../api/reports";

function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      await createReport(name, description);
      setName("");
      setDescription("");
      await refresh();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError(typeof err.response.data === "string" ? err.response.data : "Invalid input.");
      } else {
        setError("Something went wrong talking to the backend.");
      }
    }
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>Reports</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", gap: 2, mb: 3 }}>
        <TextField label="Name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Description" size="small" value={description} onChange={(e) => setDescription(e.target.value)} sx={{ flexGrow: 1 }} />
        <Button type="submit" variant="contained">Add</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow><TableCell>ID</TableCell><TableCell>Name</TableCell><TableCell>Description</TableCell><TableCell>Designer</TableCell></TableRow>
          </TableHead>
          <TableBody>
            {reports.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.id}</TableCell>
                <TableCell>{r.name}</TableCell>
                <TableCell>{r.description}</TableCell>
                <TableCell>
                  <Button size="small" component={RouterLink} to={`/reports/${r.id}`}>View</Button>
                  <Button size="small" component={RouterLink} to={`/reports/${r.id}/edit`}>Edit</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}

export default ReportsPage;
