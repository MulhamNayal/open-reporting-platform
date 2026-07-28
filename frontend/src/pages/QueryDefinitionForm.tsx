import { useEffect, useState } from "react";
import { Alert, Autocomplete, Box, Button, MenuItem, TextField } from "@mui/material";
import { getDataSourceRoutines, getDataSourceSchema, getDataSources, type DataSourceConnectionSummary, type RoutineDescriptor } from "../api/datasources";
import type { DatasetMode, QueryResult } from "../api/datasets";
import QueryResultGrid from "../components/QueryResultGrid";
import SqlEditor from "./SqlEditor";
import { buildSqlCompletionSchema, type SqlCompletionSchema } from "./sqlCompletionSchema";

export interface QueryDefinitionValue {
  dataSourceConnectionId: number;
  mode: DatasetMode;
  definitionJson: string;
  rowLimit: number | null;
}

function QueryDefinitionForm({
  onRun, onSubmit,
}: {
  onRun: (value: QueryDefinitionValue) => Promise<QueryResult>;
  onSubmit: (value: QueryDefinitionValue) => Promise<void>;
}) {
  const [connections, setConnections] = useState<DataSourceConnectionSummary[]>([]);
  const [connectionId, setConnectionId] = useState<number | "">("");
  const [mode, setMode] = useState<DatasetMode>("RawSql");
  const [sqlText, setSqlText] = useState("");
  const [routineName, setRoutineName] = useState("");
  const [rowLimit, setRowLimit] = useState("");
  const [previewResult, setPreviewResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sqlCompletionSchema, setSqlCompletionSchema] = useState<SqlCompletionSchema | undefined>(undefined);
  const [routines, setRoutines] = useState<RoutineDescriptor[]>([]);

  useEffect(() => {
    getDataSources().then(setConnections).catch(() => setError("Could not load connections."));
  }, []);

  const selectedConnection = connections.find((c) => c.id === connectionId);
  const isRestConnection = selectedConnection?.type === "RestApi";

  useEffect(() => {
    setMode(isRestConnection ? "RestQuery" : "RawSql");
  }, [connectionId, isRestConnection]);

  // Schema (for SQL autocomplete) and routines (for the stored-procedure picker) only make
  // sense for a real database connection — a REST connection has neither.
  useEffect(() => {
    if (typeof connectionId !== "number" || isRestConnection) {
      setSqlCompletionSchema(undefined);
      setRoutines([]);
      return;
    }

    getDataSourceSchema(connectionId)
      .then((schema) => setSqlCompletionSchema(buildSqlCompletionSchema(schema)))
      .catch(() => setSqlCompletionSchema(undefined));
    getDataSourceRoutines(connectionId).then(setRoutines).catch(() => setRoutines([]));
  }, [connectionId, isRestConnection]);

  function buildValue(): QueryDefinitionValue | null {
    if (typeof connectionId !== "number") {
      return null;
    }

    const definitionJson =
      mode === "RawSql" ? JSON.stringify({ sqlText })
      : mode === "StoredProcedure" ? JSON.stringify({ routineName, parameters: [] })
      : JSON.stringify({ pathSuffix: null, queryParams: [] });

    return {
      dataSourceConnectionId: connectionId,
      mode,
      definitionJson,
      rowLimit: rowLimit === "" ? null : Number(rowLimit),
    };
  }

  async function handleRun() {
    setError(null);
    const value = buildValue();
    if (!value) {
      return;
    }

    try {
      setPreviewResult(await onRun(value));
    } catch {
      setError("Could not run this query.");
    }
  }

  async function handleSubmit() {
    setError(null);
    const value = buildValue();
    if (!value) {
      return;
    }

    try {
      await onSubmit(value);
    } catch {
      setError("Could not save this query.");
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField
        select
        label="Connection"
        size="small"
        value={connectionId}
        onChange={(e) => setConnectionId(e.target.value === "" ? "" : Number(e.target.value))}
        sx={{ minWidth: 240 }}
      >
        {connections.map((c) => <MenuItem key={c.id} value={c.id}>{c.name} ({c.type})</MenuItem>)}
      </TextField>

      {typeof connectionId === "number" && !isRestConnection && (
        <TextField select label="Mode" size="small" value={mode} onChange={(e) => setMode(e.target.value as DatasetMode)} sx={{ minWidth: 180 }}>
          <MenuItem value="RawSql">Raw SQL</MenuItem>
          <MenuItem value="StoredProcedure">Stored Procedure</MenuItem>
        </TextField>
      )}

      {mode === "RawSql" && (
        <SqlEditor value={sqlText} onChange={setSqlText} schema={sqlCompletionSchema} aria-label="SQL" />
      )}
      {mode === "StoredProcedure" && (
        <Autocomplete
          freeSolo
          options={routines.map((r) => `${r.schema}.${r.name}`)}
          inputValue={routineName}
          onInputChange={(_, newValue) => setRoutineName(newValue)}
          renderInput={(params) => <TextField {...params} label="Procedure or Function Name" size="small" />}
          sx={{ minWidth: 280 }}
        />
      )}

      <TextField label="Row Limit (default 10000)" size="small" value={rowLimit} onChange={(e) => setRowLimit(e.target.value)} sx={{ maxWidth: 220 }} />

      <Box sx={{ display: "flex", gap: 1 }}>
        <Button variant="outlined" onClick={handleRun} disabled={typeof connectionId !== "number"}>Run</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={typeof connectionId !== "number"}>Use this query</Button>
      </Box>

      <QueryResultGrid result={previewResult} />
    </Box>
  );
}

export default QueryDefinitionForm;
