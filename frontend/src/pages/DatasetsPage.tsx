import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Chip,
  Button,
  Checkbox,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";
import { getDataSourceRoutines, getDataSources, getDataSourceSchema, type DataSourceConnectionSummary, type RoutineDescriptor, type TableDescriptor } from "../api/datasources";
import {
  createDataset,
  discoverDatasetColumns,
  executeDataset,
  materializeDataset,
  getDatasets,
  updateDataset,
  type DatasetSummary,
  type DatasetStorageMode,
  type QueryResult,
} from "../api/datasets";
import QueryResultGrid from "../components/QueryResultGrid";
import DataTable, { type DataTableColumn } from "../components/DataTable";
import { buildTableQueryDefinition, parseTableQueryDefinition, ALLOWED_OPERATORS, type FilterRowDraft } from "./tableQueryDefinition";
import SqlEditor from "./SqlEditor";
import { buildSqlCompletionSchema } from "./sqlCompletionSchema";
import "./datasetsPage.css";

// Relative rather than an ISO stamp: "2 hours ago" is what tells you whether the numbers on
// screen can be trusted.
function formatAsOf(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso + (iso.endsWith("Z") ? "" : "Z")).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatInterval(minutes: number): string {
  if (minutes % 10080 === 0) return `${minutes / 10080}w`;
  if (minutes % 1440 === 0) return `${minutes / 1440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function DatasetsPage() {
  const [refreshingId, setRefreshingId] = useState<number | null>(null);
  // Separate create/edit state, matching how every other field on this page works — opening
  // Edit on a row must never clobber an in-progress Add draft.
  const [storageMode, setStorageMode] = useState<DatasetStorageMode>("DirectQuery");
  const [editStorageMode, setEditStorageMode] = useState<DatasetStorageMode>("DirectQuery");
  // Minutes, as a string because it's a select value. "" means manual only.
  const [editRefreshInterval, setEditRefreshInterval] = useState("");
  const [connections, setConnections] = useState<DataSourceConnectionSummary[]>([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | "">("");
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [tables, setTables] = useState<TableDescriptor[]>([]);
  const [routines, setRoutines] = useState<RoutineDescriptor[]>([]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTable, setSelectedTable] = useState("");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filterRows, setFilterRows] = useState<FilterRowDraft[]>([]);
  const [sortField, setSortField] = useState("");
  const [sortDirection, setSortDirection] = useState<"ASC" | "DESC">("ASC");
  const [topN, setTopN] = useState("");
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

  // Edit dialog mirrors the create form's fields under their own state, so opening an
  // in-progress "Add" draft's edit dialog for a different dataset doesn't clobber it. The
  // dataset's mode is fixed during edit (not offered as a switch) — its definition fields are
  // mode-specific and switching mid-edit would leave stale, mismatched state behind.
  const [editingDataset, setEditingDataset] = useState<DatasetSummary | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editRowLimit, setEditRowLimit] = useState("");
  const [editSelectedTable, setEditSelectedTable] = useState("");
  const [editSelectedColumns, setEditSelectedColumns] = useState<string[]>([]);
  const [editFilterRows, setEditFilterRows] = useState<FilterRowDraft[]>([]);
  const [editSortField, setEditSortField] = useState("");
  const [editSortDirection, setEditSortDirection] = useState<"ASC" | "DESC">("ASC");
  const [editTopN, setEditTopN] = useState("");
  const [editSqlText, setEditSqlText] = useState("");
  const [editRoutineName, setEditRoutineName] = useState("");
  const [editProcParams, setEditProcParams] = useState<{ name: string; value: string }[]>([{ name: "", value: "" }]);
  const [editPathSuffix, setEditPathSuffix] = useState("");
  const [editQueryParams, setEditQueryParams] = useState<{ key: string; value: string }[]>([{ key: "", value: "" }]);
  const [editError, setEditError] = useState<string | null>(null);

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

  async function handleMaterialize(datasetId: number) {
    setError(null);
    setRefreshingId(datasetId);
    try {
      await materializeDataset(datasetId);
      if (selectedConnectionId !== "") {
        await refreshDatasets(selectedConnectionId);
      }
    } catch (err) {
      // Surface the source error — a failed refresh leaves the previous copy servable, so the
      // user needs to know the data on screen is older than it looks.
      setError(
        axios.isAxiosError(err) && typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Could not refresh this dataset.",
      );
    } finally {
      setRefreshingId(null);
    }
  }

  useEffect(() => {
    if (typeof selectedConnectionId !== "number") {
      setDatasets([]);
      setTables([]);
      setRoutines([]);
      return;
    }

    refreshDatasets(selectedConnectionId).catch(() => setError("Could not load datasets for this connection."));
    getDataSourceSchema(selectedConnectionId)
      .then((schema) => setTables(schema.tables))
      .catch(() => setError("Could not load the connection's schema."));
    getDataSourceRoutines(selectedConnectionId).then(setRoutines).catch(() => setRoutines([]));
  }, [selectedConnectionId]);

  function toggleColumn(fieldName: string) {
    setSelectedColumns((prev) =>
      prev.includes(fieldName) ? prev.filter((c) => c !== fieldName) : [...prev, fieldName]
    );
  }

  function addFilterRow() {
    setFilterRows([...filterRows, { field: "", operator: "=", value: "" }]);
  }

  function updateFilterRow(index: number, patch: Partial<FilterRowDraft>) {
    const next = [...filterRows];
    next[index] = { ...next[index], ...patch };
    setFilterRows(next);
  }

  function removeFilterRow(index: number) {
    setFilterRows(filterRows.filter((_, i) => i !== index));
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
      definitionJson = JSON.stringify(
        buildTableQueryDefinition(selectedTable, selectedColumns, filterRows, sortField, sortDirection, topN),
      );
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
        storageMode,
      });

      setColumnPreviewError(null);
      try {
        await discoverDatasetColumns(created.id);
      } catch (err) {
        if (axios.isAxiosError(err) && err.response?.status === 502) {
          setColumnPreviewError(
            typeof err.response.data?.detail === "string" ? err.response.data.detail : "Could not preview columns for this query."
          );
        } else {
          setColumnPreviewError("Could not preview columns for this dataset.");
        }
      }

      setName("");
      setDescription("");
      setSelectedTable("");
      setSelectedColumns([]);
      setFilterRows([]);
      setSortField("");
      setSortDirection("ASC");
      setTopN("");
      setSqlText("");
      setRoutineName("");
      setProcParams([{ name: "", value: "" }]);
      setPathSuffix("");
      setQueryParams([{ key: "", value: "" }]);
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

  function openEditDataset(dataset: DatasetSummary) {
    setEditingDataset(dataset);
    setEditName(dataset.name);
    setEditDescription(dataset.description ?? "");
    setEditRowLimit(dataset.rowLimit !== null ? String(dataset.rowLimit) : "");
    setEditStorageMode(dataset.storageMode);
    setEditRefreshInterval(dataset.refreshIntervalMinutes !== null ? String(dataset.refreshIntervalMinutes) : "");
    setEditError(null);

    if (dataset.mode === "TableQuery") {
      const parsed = parseTableQueryDefinition(dataset.definitionJson);
      setEditSelectedTable(parsed.table);
      setEditSelectedColumns(parsed.columns);
      setEditFilterRows(parsed.filterRows);
      setEditSortField(parsed.sortField);
      setEditSortDirection(parsed.sortDirection);
      setEditTopN(parsed.top);
    } else if (dataset.mode === "RawSql") {
      const parsed = JSON.parse(dataset.definitionJson) as { sqlText: string };
      setEditSqlText(parsed.sqlText);
    } else if (dataset.mode === "StoredProcedure") {
      const parsed = JSON.parse(dataset.definitionJson) as {
        routineName: string;
        parameters: { name: string; value: string }[];
      };
      setEditRoutineName(parsed.routineName);
      setEditProcParams(parsed.parameters.length > 0 ? parsed.parameters : [{ name: "", value: "" }]);
    } else {
      const parsed = JSON.parse(dataset.definitionJson) as {
        pathSuffix: string | null;
        queryParams: { key: string; value: string }[];
      };
      setEditPathSuffix(parsed.pathSuffix ?? "");
      setEditQueryParams(parsed.queryParams.length > 0 ? parsed.queryParams : [{ key: "", value: "" }]);
    }
  }

  function closeEditDataset() {
    setEditingDataset(null);
  }

  function updateEditFilterRow(index: number, patch: Partial<FilterRowDraft>) {
    const next = [...editFilterRows];
    next[index] = { ...next[index], ...patch };
    setEditFilterRows(next);
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingDataset) {
      return;
    }
    setEditError(null);

    let definitionJson: string;
    if (editingDataset.mode === "TableQuery") {
      definitionJson = JSON.stringify(
        buildTableQueryDefinition(editSelectedTable, editSelectedColumns, editFilterRows, editSortField, editSortDirection, editTopN),
      );
    } else if (editingDataset.mode === "RawSql") {
      definitionJson = JSON.stringify({ sqlText: editSqlText });
    } else if (editingDataset.mode === "StoredProcedure") {
      definitionJson = JSON.stringify({
        routineName: editRoutineName,
        parameters: editProcParams.filter((p) => p.name !== ""),
      });
    } else {
      definitionJson = JSON.stringify({
        pathSuffix: editPathSuffix === "" ? null : editPathSuffix,
        queryParams: editQueryParams.filter((p) => p.key !== ""),
      });
    }

    try {
      await updateDataset(editingDataset.id, {
        name: editName,
        description: editDescription === "" ? null : editDescription,
        mode: editingDataset.mode,
        definitionJson,
        rowLimit: editRowLimit === "" ? null : Number(editRowLimit),
        storageMode: editStorageMode,
        // Only meaningful for Import; clear it when switching away so a dataset can't sit
        // scheduled for a refresh it will never run.
        refreshIntervalMinutes:
          editStorageMode === "Import" && editRefreshInterval !== "" ? Number(editRefreshInterval) : null,
      });
      closeEditDataset();
      await refreshDatasets(selectedConnectionId as number);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setEditError(typeof err.response.data === "string" ? err.response.data : "Invalid input.");
      } else {
        setEditError("Something went wrong talking to the backend.");
      }
    }
  }

  const selectedTableFields = tables.find((t) => t.name === selectedTable)?.fields ?? [];
  const editSelectedTableFields = tables.find((t) => t.name === editSelectedTable)?.fields ?? [];
  // Memoized so its reference only changes when `tables` itself changes (a new connection's
  // schema arriving) — SqlEditor recreates its CodeMirror view whenever `schema` changes
  // identity, so a fresh object on every render here would wipe out in-progress typing.
  const sqlCompletionSchema = useMemo(() => buildSqlCompletionSchema({ tables }), [tables]);
  const routineOptions = routines.map((r) => `${r.schema}.${r.name}`);

  const datasetColumns: DataTableColumn<DatasetSummary>[] = [
    { key: "name", label: "Name", value: (d) => d.name, render: (d) => d.name },
    { key: "mode", label: "Mode", value: (d) => d.mode, render: (d) => d.mode },
    { key: "rowLimit", label: "Row Limit", value: (d) => d.rowLimit ?? -1, render: (d) => d.rowLimit ?? "default" },
    {
      key: "storageMode",
      label: "Storage",
      value: (d) => d.storageMode,
      render: (d) => (
        <Chip
          size="small"
          label={d.storageMode === "Import" ? "Import" : "Direct"}
          color={d.storageMode === "Import" ? "primary" : "default"}
          variant={d.storageMode === "Import" ? "filled" : "outlined"}
        />
      ),
    },
    {
      key: "freshness",
      label: "Data as of",
      value: (d) => d.lastMaterializedAtUtc ?? "",
      // Import data is stale by definition, and without this it's indistinguishable from live.
      render: (d) =>
        d.storageMode !== "Import"
          ? "live"
          : d.lastMaterializeError
            ? <Typography variant="caption" color="error">refresh failed</Typography>
            : d.lastMaterializedAtUtc
              ? `${formatAsOf(d.lastMaterializedAtUtc)}${d.materializedRowCount !== null ? ` · ${d.materializedRowCount.toLocaleString()} rows` : ""}${d.refreshIntervalMinutes !== null ? ` · auto ${formatInterval(d.refreshIntervalMinutes)}` : ""}`
              : "not loaded",
    },
    {
      key: "preview",
      label: "Preview",
      render: (d) => <Button size="small" variant="outlined" onClick={() => handlePreview(d.id)}>Run</Button>,
    },
    {
      key: "edit",
      label: "Edit",
      render: (d) => (
        <>
          <Button size="small" onClick={() => openEditDataset(d)}>Edit</Button>
          {d.storageMode === "Import" && (
            <Button size="small" disabled={refreshingId === d.id} onClick={() => handleMaterialize(d.id)}>
              {refreshingId === d.id ? "Refreshing…" : "Refresh"}
            </Button>
          )}
        </>
      ),
    },
  ];

  return (
    <Container maxWidth={false} sx={{ py: 4, px: 4 }} className="datasets-page">
      <Typography variant="h4" gutterBottom>Datasets</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {columnPreviewError && <Alert severity="warning" sx={{ mb: 2 }}>{columnPreviewError}</Alert>}
      <TextField
        select
        label="Connection"
        size="small"
        value={selectedConnectionId}
        onChange={(e) => {
          setSelectedConnectionId(e.target.value === "" ? "" : Number(e.target.value));
          setSelectedTable("");
          setSelectedColumns([]);
          setFilterRows([]);
          setSortField("");
          setSortDirection("ASC");
          setTopN("");
        }}
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
          <Box component="form" onSubmit={handleSubmit} sx={{ mb: 3 }} className="create-form">
            <Box sx={{ display: "flex", gap: 2, mb: 2 }}>
              <TextField label="Dataset Name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
              <TextField label="Description (optional)" size="small" value={description} onChange={(e) => setDescription(e.target.value)} sx={{ flexGrow: 1 }} />
              <TextField label="Row Limit" size="small" value={rowLimit} onChange={(e) => setRowLimit(e.target.value)} />
              <TextField
                select
                label="Storage"
                size="small"
                sx={{ minWidth: 190 }}
                value={storageMode}
                onChange={(e) => setStorageMode(e.target.value as DatasetStorageMode)}
                helperText={storageMode === "Import" ? "Cached copy, refreshed on demand" : "Queries the source every time"}
              >
                <MenuItem value="DirectQuery">Direct query (live)</MenuItem>
                <MenuItem value="Import">Import (faster, cached)</MenuItem>
              </TextField>
            </Box>

            {mode === "TableQuery" && (
              <>
                <TextField
                  select
                  label="Table"
                  size="small"
                  value={selectedTable}
                  onChange={(e) => {
                    setSelectedTable(e.target.value);
                    setSelectedColumns([]);
                    setFilterRows([]);
                    setSortField("");
                    setSortDirection("ASC");
                    setTopN("");
                  }}
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
                {selectedTableFields.length > 0 && (
                  <details className="advanced-section">
                    <summary>Advanced (filters, sort, Top N)</summary>
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>Filters</Typography>
                      {filterRows.map((row, i) => (
                        <Box key={i} sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}>
                          <TextField
                            select
                            label="Field"
                            size="small"
                            value={row.field}
                            onChange={(e) => updateFilterRow(i, { field: e.target.value })}
                            sx={{ minWidth: 140 }}
                          >
                            {selectedTableFields.map((f) => (
                              <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            select
                            label="Operator"
                            size="small"
                            value={row.operator}
                            onChange={(e) => updateFilterRow(i, { operator: e.target.value as FilterRowDraft["operator"] })}
                            sx={{ minWidth: 100 }}
                          >
                            {ALLOWED_OPERATORS.map((op) => (
                              <MenuItem key={op} value={op}>{op}</MenuItem>
                            ))}
                          </TextField>
                          <TextField
                            label="Value"
                            size="small"
                            value={row.value}
                            onChange={(e) => updateFilterRow(i, { value: e.target.value })}
                          />
                          <Button size="small" onClick={() => removeFilterRow(i)}>Remove</Button>
                        </Box>
                      ))}
                      <Button size="small" onClick={addFilterRow} sx={{ mb: 2 }}>+ Add filter</Button>

                      <Typography variant="subtitle2" gutterBottom>Sort</Typography>
                      <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                        <TextField
                          select
                          label="Sort field"
                          size="small"
                          value={sortField}
                          onChange={(e) => setSortField(e.target.value)}
                          sx={{ minWidth: 160 }}
                        >
                          <MenuItem value="">None</MenuItem>
                          {selectedTableFields.map((f) => (
                            <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          select
                          label="Direction"
                          size="small"
                          value={sortDirection}
                          onChange={(e) => setSortDirection(e.target.value as "ASC" | "DESC")}
                          disabled={sortField === ""}
                          sx={{ minWidth: 120 }}
                        >
                          <MenuItem value="ASC">Ascending</MenuItem>
                          <MenuItem value="DESC">Descending</MenuItem>
                        </TextField>
                      </Box>

                      <Typography variant="subtitle2" gutterBottom>Top N</Typography>
                      <TextField
                        label="Top N (optional)"
                        size="small"
                        value={topN}
                        onChange={(e) => setTopN(e.target.value)}
                        sx={{ mb: 2 }}
                      />
                    </Box>
                  </details>
                )}
              </>
            )}

            {mode === "RawSql" && (
              <Box sx={{ mb: 2 }}>
                <SqlEditor value={sqlText} onChange={setSqlText} schema={sqlCompletionSchema} aria-label="SQL" />
              </Box>
            )}

            {mode === "StoredProcedure" && (
              <Box sx={{ mb: 2 }}>
                <Autocomplete
                  freeSolo
                  options={routineOptions}
                  inputValue={routineName}
                  onInputChange={(_, newValue) => setRoutineName(newValue)}
                  renderInput={(params) => <TextField {...params} label="Procedure or Function Name" size="small" />}
                  sx={{ mb: 1, minWidth: 280 }}
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

          <div className="dataset-list">
            <DataTable columns={datasetColumns} rows={datasets} rowKey={(d) => d.id} />
          </div>

          <QueryResultGrid result={previewResult} />
        </>
      )}

      <Dialog open={editingDataset !== null} maxWidth="sm" fullWidth onClose={closeEditDataset}>
        <DialogTitle>Edit dataset</DialogTitle>
        <Box component="form" onSubmit={handleEditSubmit}>
          <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {editError && <Alert severity="error">{editError}</Alert>}
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField label="Dataset Name" size="small" value={editName} onChange={(e) => setEditName(e.target.value)} sx={{ flexGrow: 1 }} />
              <TextField label="Row Limit" size="small" value={editRowLimit} onChange={(e) => setEditRowLimit(e.target.value)} />
              <TextField
                select
                label="Storage"
                size="small"
                sx={{ minWidth: 190 }}
                value={editStorageMode}
                onChange={(e) => setEditStorageMode(e.target.value as DatasetStorageMode)}
                helperText={editStorageMode === "Import" ? "Cached copy, refreshed on demand" : "Queries the source every time"}
              >
                <MenuItem value="DirectQuery">Direct query (live)</MenuItem>
                <MenuItem value="Import">Import (faster, cached)</MenuItem>
              </TextField>
              {editStorageMode === "Import" && (
                <TextField
                  select
                  label="Auto refresh"
                  size="small"
                  sx={{ minWidth: 170 }}
                  value={editRefreshInterval}
                  onChange={(e) => setEditRefreshInterval(e.target.value)}
                  helperText="How often this reloads itself"
                >
                  <MenuItem value="">Manual only</MenuItem>
                  <MenuItem value="60">Hourly</MenuItem>
                  <MenuItem value="360">Every 6 hours</MenuItem>
                  <MenuItem value="1440">Daily</MenuItem>
                  <MenuItem value="10080">Weekly</MenuItem>
                </TextField>
              )}
            </Box>
            <TextField label="Description (optional)" size="small" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />

            {editingDataset?.mode === "TableQuery" && (
              <>
                <TextField
                  select
                  label="Table"
                  size="small"
                  value={editSelectedTable}
                  onChange={(e) => {
                    setEditSelectedTable(e.target.value);
                    setEditSelectedColumns([]);
                  }}
                >
                  {tables.map((t) => (
                    <MenuItem key={t.name} value={t.name}>{t.name}</MenuItem>
                  ))}
                </TextField>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
                  {editSelectedTableFields.map((f) => (
                    <FormControlLabel
                      key={f.name}
                      control={
                        <Checkbox
                          checked={editSelectedColumns.includes(f.name)}
                          onChange={() =>
                            setEditSelectedColumns((prev) =>
                              prev.includes(f.name) ? prev.filter((c) => c !== f.name) : [...prev, f.name],
                            )
                          }
                        />
                      }
                      label={f.name}
                    />
                  ))}
                </Box>
                <details className="advanced-section" open>
                  <summary>Advanced (filters, sort, Top N)</summary>
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>Filters</Typography>
                    {editFilterRows.map((row, i) => (
                      <Box key={i} sx={{ display: "flex", gap: 1, mb: 1, alignItems: "center" }}>
                        <TextField
                          select
                          label="Field"
                          size="small"
                          value={row.field}
                          onChange={(e) => updateEditFilterRow(i, { field: e.target.value })}
                          sx={{ minWidth: 140 }}
                        >
                          {editSelectedTableFields.map((f) => (
                            <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          select
                          label="Operator"
                          size="small"
                          value={row.operator}
                          onChange={(e) => updateEditFilterRow(i, { operator: e.target.value as FilterRowDraft["operator"] })}
                          sx={{ minWidth: 100 }}
                        >
                          {ALLOWED_OPERATORS.map((op) => (
                            <MenuItem key={op} value={op}>{op}</MenuItem>
                          ))}
                        </TextField>
                        <TextField
                          label="Value"
                          size="small"
                          value={row.value}
                          onChange={(e) => updateEditFilterRow(i, { value: e.target.value })}
                        />
                        <Button size="small" onClick={() => setEditFilterRows(editFilterRows.filter((_, idx) => idx !== i))}>
                          Remove
                        </Button>
                      </Box>
                    ))}
                    <Button size="small" onClick={() => setEditFilterRows([...editFilterRows, { field: "", operator: "=", value: "" }])} sx={{ mb: 2 }}>
                      + Add filter
                    </Button>

                    <Typography variant="subtitle2" gutterBottom>Sort</Typography>
                    <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
                      <TextField
                        select
                        label="Sort field"
                        size="small"
                        value={editSortField}
                        onChange={(e) => setEditSortField(e.target.value)}
                        sx={{ minWidth: 160 }}
                      >
                        <MenuItem value="">None</MenuItem>
                        {editSelectedTableFields.map((f) => (
                          <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
                        ))}
                      </TextField>
                      <TextField
                        select
                        label="Direction"
                        size="small"
                        value={editSortDirection}
                        onChange={(e) => setEditSortDirection(e.target.value as "ASC" | "DESC")}
                        disabled={editSortField === ""}
                        sx={{ minWidth: 120 }}
                      >
                        <MenuItem value="ASC">Ascending</MenuItem>
                        <MenuItem value="DESC">Descending</MenuItem>
                      </TextField>
                    </Box>

                    <Typography variant="subtitle2" gutterBottom>Top N</Typography>
                    <TextField
                      label="Top N (optional)"
                      size="small"
                      value={editTopN}
                      onChange={(e) => setEditTopN(e.target.value)}
                    />
                  </Box>
                </details>
              </>
            )}

            {editingDataset?.mode === "RawSql" && (
              <SqlEditor value={editSqlText} onChange={setEditSqlText} schema={sqlCompletionSchema} aria-label="SQL" />
            )}

            {editingDataset?.mode === "StoredProcedure" && (
              <Box>
                <Autocomplete
                  freeSolo
                  options={routineOptions}
                  inputValue={editRoutineName}
                  onInputChange={(_, newValue) => setEditRoutineName(newValue)}
                  renderInput={(params) => <TextField {...params} label="Procedure or Function Name" size="small" />}
                  sx={{ mb: 1, minWidth: 280 }}
                />
                {editProcParams.map((p, i) => (
                  <Box key={i} sx={{ display: "flex", gap: 1, mb: 1 }}>
                    <TextField
                      label="Parameter Name"
                      size="small"
                      value={p.name}
                      onChange={(e) => {
                        const next = [...editProcParams];
                        next[i] = { ...next[i], name: e.target.value };
                        setEditProcParams(next);
                      }}
                    />
                    <TextField
                      label="Value"
                      size="small"
                      value={p.value}
                      onChange={(e) => {
                        const next = [...editProcParams];
                        next[i] = { ...next[i], value: e.target.value };
                        setEditProcParams(next);
                      }}
                    />
                  </Box>
                ))}
                <Button size="small" onClick={() => setEditProcParams([...editProcParams, { name: "", value: "" }])}>
                  Add Parameter
                </Button>
              </Box>
            )}

            {editingDataset?.mode === "RestQuery" && (
              <Box>
                <TextField
                  label="Path Suffix (optional)"
                  size="small"
                  placeholder="/users"
                  value={editPathSuffix}
                  onChange={(e) => setEditPathSuffix(e.target.value)}
                  sx={{ mb: 1, display: "block" }}
                />
                {editQueryParams.map((p, i) => (
                  <Box key={i} sx={{ display: "flex", gap: 1, mb: 1 }}>
                    <TextField
                      label="Param Key"
                      size="small"
                      value={p.key}
                      onChange={(e) => {
                        const next = [...editQueryParams];
                        next[i] = { ...next[i], key: e.target.value };
                        setEditQueryParams(next);
                      }}
                    />
                    <TextField
                      label="Param Value"
                      size="small"
                      value={p.value}
                      onChange={(e) => {
                        const next = [...editQueryParams];
                        next[i] = { ...next[i], value: e.target.value };
                        setEditQueryParams(next);
                      }}
                    />
                  </Box>
                ))}
                <Button size="small" onClick={() => setEditQueryParams([...editQueryParams, { key: "", value: "" }])}>
                  Add Query Param
                </Button>
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={closeEditDataset}>Cancel</Button>
            <Button type="submit" variant="contained">Save</Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Container>
  );
}

export default DatasetsPage;
