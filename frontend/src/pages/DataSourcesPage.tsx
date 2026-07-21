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
import {
  createDataSource,
  getDataSources,
  testDataSource,
  type ConnectionTestResult,
  type DataSourceConnectionSummary,
  type DataSourceType,
} from "../api/datasources";

function DataSourcesPage() {
  const [connections, setConnections] = useState<DataSourceConnectionSummary[]>([]);
  const [name, setName] = useState("");
  const [type, setType] = useState<DataSourceType>("SqlServer");
  const [host, setHost] = useState("");
  const [databaseName, setDatabaseName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<number, ConnectionTestResult>>({});

  async function refresh() {
    setConnections(await getDataSources());
  }

  useEffect(() => {
    refresh().catch(() => setError("Could not load data sources — is the backend running on :5198?"));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const credentialsJson =
        type === "SqlServer" ? JSON.stringify({ username, password }) : JSON.stringify({ token: password });

      await createDataSource({
        name,
        type,
        host,
        databaseName: type === "SqlServer" ? databaseName : null,
        credentialsJson,
      });

      setName("");
      setHost("");
      setDatabaseName("");
      setUsername("");
      setPassword("");
      await refresh();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError(typeof err.response.data === "string" ? err.response.data : "Invalid input.");
      } else {
        setError("Something went wrong talking to the backend.");
      }
    }
  }

  async function handleTest(id: number) {
    const result = await testDataSource(id);
    setTestResults((prev) => ({ ...prev, [id]: result }));
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>Data Sources</Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 3 }}>
        <TextField label="Name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField
          select
          label="Type"
          size="small"
          value={type}
          onChange={(e) => setType(e.target.value as DataSourceType)}
          sx={{ minWidth: 140 }}
        >
          <MenuItem value="SqlServer">SQL Server</MenuItem>
          <MenuItem value="RestApi">REST API</MenuItem>
        </TextField>
        <TextField
          label={type === "SqlServer" ? "Host" : "URL"}
          size="small"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          sx={{ flexGrow: 1 }}
        />
        {type === "SqlServer" && (
          <TextField
            label="Database Name"
            size="small"
            value={databaseName}
            onChange={(e) => setDatabaseName(e.target.value)}
          />
        )}
        {type === "SqlServer" ? (
          <>
            <TextField label="Username" size="small" value={username} onChange={(e) => setUsername(e.target.value)} />
            <TextField
              label="Password"
              type="password"
              size="small"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        ) : (
          <TextField
            label="API Token"
            type="password"
            size="small"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <Button type="submit" variant="contained">Add</Button>
      </Box>
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Type</TableCell>
              <TableCell>Host</TableCell>
              <TableCell>Test</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {connections.map((c) => {
              const result = testResults[c.id];
              return (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.type}</TableCell>
                  <TableCell>{c.host}</TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined" onClick={() => handleTest(c.id)}>
                      Test
                    </Button>
                    {result && (
                      <Typography
                        component="span"
                        sx={{ ml: 1 }}
                        color={result.success ? "success.main" : "error.main"}
                      >
                        {result.success ? "OK" : result.errorMessage ?? "Failed"}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}

export default DataSourcesPage;
