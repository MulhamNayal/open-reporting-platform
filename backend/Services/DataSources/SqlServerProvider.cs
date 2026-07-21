using System.Text.Json;
using Backend.Models;
using Backend.Services.Datasets;
using Microsoft.Data.SqlClient;

namespace Backend.Services.DataSources;

public class SqlServerProvider : IDataSourceProvider
{
    private static readonly HashSet<string> AllowedOperators = new() { "=", "!=", ">", "<", ">=", "<=", "LIKE" };
    private static readonly HashSet<string> AllowedSortDirections = new() { "ASC", "DESC" };

    public DataSourceType SupportedType => DataSourceType.SqlServer;

    public string BuildConnectionString(DataSourceConnection connection)
    {
        var credentials = ParseCredentials(connection.EncryptedCredentials);

        // Use manual string building to ensure the connection string has the expected format
        // (SqlConnectionStringBuilder uses "Data Source" and "Initial Catalog" standardized names)
        var parts = new List<string>();
        parts.Add($"Server={connection.Host}");
        if (!string.IsNullOrEmpty(connection.DatabaseName))
        {
            parts.Add($"Database={connection.DatabaseName}");
        }
        parts.Add($"User Id={credentials.Username}");
        parts.Add($"Password={credentials.Password}");
        parts.Add("TrustServerCertificate=true");
        parts.Add("Encrypt=false");

        return string.Join(";", parts);
    }

    public async Task<ConnectionTestResult> TestConnectionAsync(DataSourceConnection connection)
    {
        try
        {
            var connectionString = BuildConnectionString(connection);
            await using var sqlConnection = new SqlConnection(connectionString);
            await sqlConnection.OpenAsync();
            return new ConnectionTestResult(true, null);
        }
        catch (Exception ex)
        {
            return new ConnectionTestResult(false, ex.Message);
        }
    }

    public async Task<SchemaDescriptor> DiscoverSchemaAsync(DataSourceConnection connection)
    {
        var connectionString = BuildConnectionString(connection);
        await using var sqlConnection = new SqlConnection(connectionString);
        await sqlConnection.OpenAsync();

        const string sql = """
            SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE
            FROM INFORMATION_SCHEMA.COLUMNS
            ORDER BY TABLE_NAME, ORDINAL_POSITION
            """;

        await using var command = new SqlCommand(sql, sqlConnection);
        await using var reader = await command.ExecuteReaderAsync();

        var fieldsByTable = new Dictionary<string, List<FieldDescriptor>>();

        while (await reader.ReadAsync())
        {
            var tableName = reader.GetString(0);
            var columnName = reader.GetString(1);
            var dataType = reader.GetString(2);

            if (!fieldsByTable.TryGetValue(tableName, out var fields))
            {
                fields = new List<FieldDescriptor>();
                fieldsByTable[tableName] = fields;
            }

            fields.Add(new FieldDescriptor(columnName, dataType));
        }

        var tables = fieldsByTable
            .Select(kvp => new TableDescriptor(kvp.Key, kvp.Value))
            .ToList();

        return new SchemaDescriptor(tables);
    }

    public (string Sql, IReadOnlyList<SqlParameter> Parameters) BuildTableQuerySql(SelectQuery query, int rowLimit)
    {
        var effectiveTop = query.Top.HasValue ? Math.Min(query.Top.Value, rowLimit) : rowLimit;
        var columnList = string.Join(", ", query.Columns.Select(c => $"[{c}]"));

        var parameters = new List<SqlParameter>();
        var whereClauses = new List<string>();

        foreach (var filter in query.Filters)
        {
            if (!AllowedOperators.Contains(filter.Operator))
            {
                throw new InvalidOperationException($"Unsupported filter operator: {filter.Operator}");
            }

            var parameterName = $"@p{parameters.Count}";
            whereClauses.Add($"[{filter.Field}] {filter.Operator} {parameterName}");
            parameters.Add(new SqlParameter(parameterName, filter.Value));
        }

        var sql = $"SELECT TOP ({effectiveTop}) {columnList} FROM [{query.Table}]";

        if (whereClauses.Count > 0)
        {
            sql += " WHERE " + string.Join(" AND ", whereClauses);
        }

        if (query.Sort is not null)
        {
            if (!AllowedSortDirections.Contains(query.Sort.Direction))
            {
                throw new InvalidOperationException($"Unsupported sort direction: {query.Sort.Direction}");
            }

            sql += $" ORDER BY [{query.Sort.Field}] {query.Sort.Direction}";
        }

        return (sql, parameters);
    }

    public string BuildRawSqlDiscoveryWrapper(string sqlText)
    {
        return $"SELECT TOP (0) * FROM ({sqlText}) AS x";
    }

    public async Task<IReadOnlyList<ColumnDescriptor>> DiscoverRawSqlColumnsAsync(DataSourceConnection connection, string sqlText, CancellationToken cancellationToken)
    {
        var connectionString = BuildConnectionString(connection);
        await using var sqlConnection = new SqlConnection(connectionString);
        await sqlConnection.OpenAsync(cancellationToken);

        var wrappedSql = BuildRawSqlDiscoveryWrapper(sqlText);

        try
        {
            await using var command = new SqlCommand(wrappedSql, sqlConnection);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);

            var columns = new List<ColumnDescriptor>();
            for (var i = 0; i < reader.FieldCount; i++)
            {
                columns.Add(new ColumnDescriptor(reader.GetName(i), reader.GetDataTypeName(i)));
            }

            return columns;
        }
        catch (SqlException ex) when (ex.Message.Contains("ORDER BY", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                "Column preview requires removing a trailing ORDER BY from this query — SQL Server doesn't allow one inside a derived table without TOP/OFFSET. The query itself will still run fine at execution time.",
                ex);
        }
    }

    public async Task<QueryResult> ExecuteQueryAsync(DataSourceConnection connection, Dataset dataset, int rowLimit, CancellationToken cancellationToken)
    {
        var connectionString = BuildConnectionString(connection);
        await using var sqlConnection = new SqlConnection(connectionString);
        await sqlConnection.OpenAsync(cancellationToken);

        string sql;
        IReadOnlyList<SqlParameter> parameters;

        switch (dataset.Mode)
        {
            case DatasetMode.TableQuery:
                var tableQueryDefinition = JsonSerializer.Deserialize<TableQueryDefinition>(dataset.Definition)!;
                (sql, parameters) = BuildTableQuerySql(tableQueryDefinition.Query, rowLimit);
                break;
            case DatasetMode.RawSql:
                var rawSqlDefinition = JsonSerializer.Deserialize<RawSqlDefinition>(dataset.Definition)!;
                sql = rawSqlDefinition.SqlText;
                parameters = Array.Empty<SqlParameter>();
                break;
            default:
                throw new NotSupportedException($"SqlServerProvider.ExecuteQueryAsync does not yet support mode {dataset.Mode}.");
        }

        await using var command = new SqlCommand(sql, sqlConnection);
        foreach (var parameter in parameters)
        {
            command.Parameters.Add(parameter);
        }

        return await ReadQueryResultAsync(command, rowLimit, cancellationToken);
    }

    private static async Task<QueryResult> ReadQueryResultAsync(SqlCommand command, int rowLimit, CancellationToken cancellationToken)
    {
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);

        var columns = new List<ColumnDescriptor>();
        for (var i = 0; i < reader.FieldCount; i++)
        {
            columns.Add(new ColumnDescriptor(reader.GetName(i), reader.GetDataTypeName(i)));
        }

        var rows = new List<object?[]>();
        while (rows.Count < rowLimit && await reader.ReadAsync(cancellationToken))
        {
            var row = new object?[reader.FieldCount];
            for (var i = 0; i < reader.FieldCount; i++)
            {
                row[i] = reader.IsDBNull(i) ? null : reader.GetValue(i);
            }

            rows.Add(row);
        }

        return new QueryResult(columns, rows);
    }

    private static SqlCredentials ParseCredentials(string credentialsJson)
    {
        try
        {
            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            var credentials = JsonSerializer.Deserialize<SqlCredentials>(credentialsJson, options);
            if (credentials is null)
            {
                throw new InvalidOperationException("SQL Server credentials JSON deserialized to null.");
            }

            return credentials;
        }
        catch (JsonException ex)
        {
            throw new InvalidOperationException("SQL Server credentials are not valid JSON.", ex);
        }
    }

    private record SqlCredentials(string Username, string Password);
}
