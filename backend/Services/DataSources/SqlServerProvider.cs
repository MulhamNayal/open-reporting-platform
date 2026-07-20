using System.Text.Json;
using Backend.Models;
using Microsoft.Data.SqlClient;

namespace Backend.Services.DataSources;

public class SqlServerProvider : IDataSourceProvider
{
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
