import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Container,
  FormControlLabel,
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
import { getDataSources, getDataSourceSchema, type DataSourceConnectionSummary } from "../api/datasources";
import {
  createDataset,
  discoverDatasetColumns,
  executeDataset,
  getDatasets,
  type DatasetSummary,
  type QueryResult,
} from "../api/datasets";
import QueryResultGrid from "../components/QueryResultGrid";

function DatasetsPage() {
  const [connections, setConnections] = useState<DataSourceConnectionSummary[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | "">("");
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [tables, setTables] = useState<{ name: string; fields: { name: string }[] }[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [rowLimit, setRowLimit] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<QueryResult | null>(null);
  const [mode, setMode] = useState<"TableQuery" | "RawSql" | "StoredProcedure" | "RestQuery">("TableQuery");
  const [sqlText, setSqlText] = useState("");
  const [routineName, setRoutineName] = useState("");
  const [procParams, setProcParams] = useState<{ name: string; value: string }[]>([{ name: "", value: "" }]);
  const [columnPreviewError, setColumnPreviewError] = useState<string | null>(null);
  const [pathSuffix, setPathSuffix] = useState("");
  const [queryParams, setQueryParams] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);

  const selectedConnection = connections.find((c) => c.id === selectedConnectionId);
  const isRestConnection = selectedConnection?.type === "RestApi";

  useEffect(() => {
    getDataSources()
      .then(setConnections)
      .catch(() => setError("Could not load data source connections — is the backend running on :5198?"));
  }, []);

  useEffect(() => {
    setMode(isRestConnection ? "RestQuery" : "TableQuery");
  }, [selectedConnectionId]);

  async function refreshDatasets(connectionId: number) {
    setDatasets(await getDatasets(connectionId));
  }

  useEffect(() => {
    if (typeof selectedConnectionId !== "number") {
      setDatasets([]);
      setTables([]);
      return;
    }

    refreshDatasets(selectedConnectionId).catch(() => setError("Could not load datasets for this connection."));
    getDataSourceSchema(selectedConnectionId)
      .then((schema) => setTables(schema.tables))
      .catch(() => setError("Could not load the connection's schema."));
  }, [selectedConnectionId]);

  function toggleColumn(fieldName: string) {
    setSelectedColumns((prev) =>
      prev.includes(fieldName) ? prev.filter((c) => c !== fieldName) : [...prev, fieldName]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPreviewResult(null);
    if (typeof selectedConnectionId !== "number") {
      return;
    }

    let definitionJson: string;
    if (mode === "TableQuery") {
      definitionJson = JSON.stringify({
        query: { table: selectedTable, columns: selectedColumns, filters: [], sort: null, top: null },
      });
    } else if (mode === "RawSql") {
      definitionJson = JSON.stringify({ sqlText });
    } else if (mode === "StoredProcedure") {
      definitionJson = JSON.stringify({
        routineName,
        parameters: procParams.filter((p) => p.name !== ""),
      });
    } else {
      definitionJson = JSON.stringify({
        pathSuffix: pathSuffix === "" ? null : pathSuffix,
        queryParams: queryParams.filter((p) => p.key !== ""),
      });
    }

    try {
      const created = await createDataset({
        dataSourceConnectionId: selectedConnectionId,
        name,
        description: description === "" ? null : description,
        mode,
        definitionJson,
        rowLimit: rowLimit === "" ? null : Number(rowLimit),
      });

      setColumnPreviewError(null);
      try {
        await discoverDatasetColumns(created.id);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 502) {
          setColumnPreviewError(
            typeof err.response.data?.detail === "string" ? err.response.data.detail : "Could not preview columns for this query."
          );
        }
      }

      setName("");
      setDescription("");
      setSelectedTable("");
      setSelectedColumns([]);
      setSqlText("");
      setRoutineName("");
      setProcParams([{ name: "", value: "" }]);
      setRowLimit("");
      await refreshDatasets(selectedConnectionId);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError(typeof err.response.data === "string" ? err.response.data : "Invalid input.");
      } else {
        setError("Something went wrong talking to the backend.");
      }
    }
  }

  async function handlePreview(datasetId: number) {
    setError(null);
    try {
      setPreviewResult(await executeDataset(datasetId));
    } catch {
      setError("Could not run this dataset.");
    }
  }

  const selectedTableFields = tables.find((t) => t.name === selectedTable)?.fields ?? [];

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>Datasets</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {columnPreviewError && <Alert severity="warning" sx={{ mb: 2 }}>{columnPreviewError}</Alert>}
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
          {!isRestConnection && (
            <TextField
              select
              label="Mode"
              size="small"
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
              sx={{ minWidth: 180, mb: 3 }}
            >
              <MenuItem value="TableQuery">Table Query</MenuItem>
              <MenuItem value="RawSql">Raw SQL</MenuItem>
              <MenuItem value="StoredProcedure">Stored Procedure</MenuItem>
            </TextField>
          )}
        </>
      )}

      {typeof selectedConnectionId === "number" && (
        <>
          <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }}>
            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
              <TextField label="Dataset Name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
              <TextField label="Description (optional)" size="small" value={description} onChange={(e) => setDescription(e.target.value)} sx={{ flexGrow: 1 }} />
              <TextField label="Row Limit" size="small" value={rowLimit} onChange={(e) => setRowLimit(e.target.value)} />
            </Box>

            {mode === "TableQuery" && (
              <>
                <TextField
                  select
                  label="Table"
                  size="small"
                  value={selectedTable}
                  onChange={(e) => { setSelectedTable(e.target.value); setSelectedColumns([]); }}
                  sx={{ minWidth: 180, mb: 2 }}
                >
                  {tables.map((t) => (
                    <MenuItem key={t.name} value={t.name}>{t.name}</MenuItem>
                  ))}
                </TextField>
                {selectedTableFields.length > 0 && (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
                    {selectedTableFields.map((f) => (
                      <FormControlLabel
                        key={f.name}
                        control={<Checkbox checked={selectedColumns.includes(f.name)} onChange={() => toggleColumn(f.name)} />}
                        label={f.name}
                      />
                    ))}
                  </Box>
                )}
              </>
            )}

            {mode === "RawSql" && (
              <TextField
                label="SQL"
                multiline
                minRows={3}
                fullWidth
                value={sqlText}
                onChange={(e) => setSqlText(e.target.value)}
                sx={{ mb: 2 }}
              />
            )}

            {mode === "StoredProcedure" && (
              <Box sx={{ mb: 2 }}>
                <TextField
                  label="Procedure or Function Name"
                  size="small"
                  value={routineName}
                  onChange={(e) => setRoutineName(e.target.value)}
                  sx={{ mb: 1, display: "block" }}
                />
                {procParams.map((p, i) => (
                  <Box key={i} sx={{ display: "flex", gap: 1, mb: 1 }}>
                    <TextField
                      label="Parameter Name"
                      size="small"
                      value={p.name}
                      onChange={(e) => {
                        const next = [...procParams];
                        next[i] = { ...next[i], name: e.target.value };
                        setProcParams(next);
                      }}
                    />
                    <TextField
                      label="Value"
                      size="small"
                      value={p.value}
                      onChange={(e) => {
                        const next = [...procParams];
                        next[i] = { ...next[i], value: e.target.value };
                        setProcParams(next);
                      }}
                    />
                  </Box>
                ))}
                <Button size="small" onClick={() => setProcParams([...procParams, { name: "", value: "" }])}>
                  Add Parameter
                </Button>
              </Box>
            )}

            {mode === "RestQuery" && (
              <Box sx={{ mb: 2 }}>
                <TextField
                  label="Path Suffix (optional)"
                  size="small"
                  placeholder="/users"
                  value={pathSuffix}
                  onChange={(e) => setPathSuffix(e.target.value)}
                  sx={{ mb: 1, display: "block" }}
                />
                {queryParams.map((p, i) => (
                  <Box key={i} sx={{ display: "flex", gap: 1, mb: 1 }}>
                    <TextField
                      label="Param Key"
                      size="small"
                      value={p.key}
                      onChange={(e) => {
                        const next = [...queryParams];
                        next[i] = { ...next[i], key: e.target.value };
                        setQueryParams(next);
                      }}
                    />
                    <TextField
                      label="Param Value"
                      size="small"
                      value={p.value}
                      onChange={(e) => {
                        const next = [...queryParams];
                        next[i] = { ...next[i], value: e.target.value };
                        setQueryParams(next);
                      }}
                    />
                  </Box>
                ))}
                <Button size="small" onClick={() => setQueryParams([...queryParams, { key: "", value: "" }])}>
                  Add Query Param
                </Button>
              </Box>
            )}

            <Button type="submit" variant="contained" disabled={
              (mode === "TableQuery" && (!selectedTable || selectedColumns.length === 0)) ||
              (mode === "RawSql" && sqlText.trim() === "") ||
              (mode === "StoredProcedure" && routineName.trim() === "") ||
              name.trim() === ""
            }>
              Add Dataset
            </Button>
          </Box>

          <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>Name</TableCell><TableCell>Mode</TableCell><TableCell>Row Limit</TableCell><TableCell>Preview</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {datasets.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{d.name}</TableCell>
                    <TableCell>{d.mode}</TableCell>
                    <TableCell>{d.rowLimit ?? "default"}</TableCell>
                    <TableCell>
                      <Button size="small" variant="outlined" onClick={() => handlePreview(d.id)}>Run</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <QueryResultGrid result={previewResult} />
        </>
      )}
    </Container>
  );
}

export default DatasetsPage;
