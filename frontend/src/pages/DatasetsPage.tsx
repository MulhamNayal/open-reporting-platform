import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Container,
  MenuItem,
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
import { getDataSources, type DataSourceConnectionSummary } from "../api/datasources";
import { createDataset, getDatasets, type DatasetSummary } from "../api/datasets";

function DatasetsPage() {
  const [connections, setConnections] = useState<DataSourceConnectionSummary[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | "">("");
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [name, setName] = useState("");
  const [tableName, setTableName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDataSources()
      .then(setConnections)
      .catch(() => setError("Could not load data source connections — is the backend running on :5198?"));
  }, []);

  async function refreshDatasets(connectionId: number) {
    setDatasets(await getDatasets(connectionId));
  }

  useEffect(() => {
    if (typeof selectedConnectionId === "number") {
      refreshDatasets(selectedConnectionId).catch(() => setError("Could not load datasets for this connection."));
    } else {
      setDatasets([]);
    }
  }, [selectedConnectionId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (typeof selectedConnectionId !== "number") {
      return;
    }

    try {
      const definitionJson = JSON.stringify({
        query: { table: tableName, columns: [], filters: [], sort: null, top: null },
      });

      await createDataset({
        dataSourceConnectionId: selectedConnectionId,
        name,
        description: null,
        mode: "TableQuery",
        definitionJson,
        rowLimit: null,
      });

      setName("");
      setTableName("");
      await refreshDatasets(selectedConnectionId);
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
      <Typography variant="h4" gutterBottom>Datasets</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TextField
        select
        label="Connection"
        size="small"
        value={selectedConnectionId}
        onChange={(e) => setSelectedConnectionId(e.target.value === "" ? "" : Number(e.target.value))}
        sx={{ minWidth: 240, mb: 3 }}
      >
        {connections.map((c) => (
          <MenuItem key={c.id} value={c.id}>{c.name} ({c.type})</MenuItem>
        ))}
      </TextField>

      {typeof selectedConnectionId === "number" && (
        <>
          <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", gap: 2, mb: 3 }}>
            <TextField label="Dataset Name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Table Name" size="small" value={tableName} onChange={(e) => setTableName(e.target.value)} />
            <Button type="submit" variant="contained">Add (Table Query)</Button>
          </Box>
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>Name</TableCell><TableCell>Mode</TableCell><TableCell>Row Limit</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {datasets.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.name}</TableCell>
                    <TableCell>{d.mode}</TableCell>
                    <TableCell>{d.rowLimit ?? "default"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
    </Container>
  );
}

export default DatasetsPage;
