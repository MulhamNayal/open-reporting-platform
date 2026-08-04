using System.Data;
using System.Text;
using System.Text.RegularExpressions;
using Backend.Services.DataSources;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Options;

namespace Backend.Services.Materialization;

public class SqlMaterializationStore : IMaterializationStore
{
    // Column type names we can pass straight through to CREATE TABLE. Anything else â€” including
    // the RestApiProvider's "string"/"number"/"boolean" â€” falls back to nvarchar(max), which is
    // always safe to land a value in even if it costs some fidelity.
    private static readonly HashSet<string> PassThroughTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "bit", "tinyint", "smallint", "int", "bigint",
        "decimal", "numeric", "money", "smallmoney", "float", "real",
        "date", "datetime", "datetime2", "smalldatetime", "datetimeoffset", "time",
        "char", "varchar", "nchar", "nvarchar", "text", "ntext",
        "uniqueidentifier", "binary", "varbinary", "image", "xml"
    };

    // Digits are part of the name, not the arguments â€” datetime2, varbinary, nvarchar2-style names
    // would otherwise fail to match and silently fall back to nvarchar(max).
    private static readonly Regex TypeShape = new(@"^\s*(?<name>[A-Za-z_][A-Za-z0-9_]*)\s*(?<args>\([^)]*\))?\s*$", RegexOptions.Compiled);

    /// <summary>Every materialised table carries this so paging has a deterministic order even
    /// when the query has none â€” without it OFFSET/FETCH can repeat or skip rows.</summary>
    public const string RowNumberColumn = "__RowNumber";

    private readonly MaterializationOptions _options;
    private readonly IConfiguration _configuration;

    public SqlMaterializationStore(IOptions<MaterializationOptions> options, IConfiguration configuration)
    {
        _options = options.Value;
        _configuration = configuration;
    }

    /// <summary>
    /// Resolved per call rather than in the constructor. DatasetService takes this store so it can
    /// clean up materialised tables, so throwing here at construction would stop every controller
    /// that touches a dataset from being built â€” an environment that simply hasn't configured the
    /// cache database would fail to serve anything, not just Import datasets.
    /// </summary>
    private string ConnectionString
    {
        get
        {
            var configured = _configuration.GetConnectionString("ReportingCacheDatabase");
            if (!string.IsNullOrWhiteSpace(configured))
            {
                return configured;
            }

            // Fall back to the application's own connection with the database name suffixed.
            // Keeps a new environment working without a second secret, and because the name is
            // derived from whatever this app's database is already called, it can't collide with
            // an unrelated database on a shared server.
            var application = _configuration.GetConnectionString("ReportingDatabase")
                ?? throw new InvalidOperationException(
                    "Neither 'ReportingCacheDatabase' nor 'ReportingDatabase' is configured, so Import datasets can't be materialised.");

            return new SqlConnectionStringBuilder(application)
            {
                InitialCatalog = DeriveCacheDatabaseName(application),
            }.ConnectionString;
        }
    }

    /// <summary>
    /// The derived cache database name. Public because this is the one value that must never
    /// collide with an unrelated database on a shared instance, so it's worth pinning in a test.
    /// </summary>
    public static string DeriveCacheDatabaseName(string applicationConnectionString)
    {
        var name = new SqlConnectionStringBuilder(applicationConnectionString).InitialCatalog;
        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException(
                "The application connection string names no database, so a cache database name can't be derived from it.");
        }

        return name + "Cache";
    }

    public string TableNameFor(int datasetId) => $"{_options.Schema}.Dataset_{datasetId}";

    private string LiveName(int datasetId) => $"Dataset_{datasetId}";
    private string StagingName(int datasetId) => $"Dataset_{datasetId}__loading";

    private static string Q(string identifier) => "[" + identifier.Replace("]", "]]") + "]";

    // public so it can be tested directly â€” it's a pure function and the fallback behaviour
    // (unknown types landing as nvarchar(max)) is worth pinning down.
    public static string MapColumnType(string? nativeType)
    {
        if (string.IsNullOrWhiteSpace(nativeType))
        {
            return "nvarchar(max)";
        }

        var match = TypeShape.Match(nativeType);
        if (!match.Success)
        {
            return "nvarchar(max)";
        }

        var name = match.Groups["name"].Value;
        if (!PassThroughTypes.Contains(name))
        {
            return "nvarchar(max)";
        }

        var args = match.Groups["args"].Value;
        // A bare varchar/nvarchar means length 1 in SQL Server, which would silently truncate.
        if (string.IsNullOrEmpty(args) && name.EndsWith("char", StringComparison.OrdinalIgnoreCase))
        {
            return $"{name}(max)";
        }

        return name + args;
    }

    private async Task<SqlConnection> OpenAsync(CancellationToken cancellationToken)
    {
        var connection = new SqlConnection(ConnectionString);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }

    public async Task CreateStagingTableAsync(int datasetId, IReadOnlyList<ColumnDescriptor> columns, CancellationToken cancellationToken)
    {
        if (columns.Count == 0)
        {
            throw new InvalidOperationException("Cannot materialise a dataset with no columns.");
        }

        var staging = StagingName(datasetId);
        var sql = new StringBuilder();
        sql.AppendLine($"IF SCHEMA_ID('{_options.Schema}') IS NULL EXEC('CREATE SCHEMA {_options.Schema}');");
        sql.AppendLine($"IF OBJECT_ID('{_options.Schema}.{staging}') IS NOT NULL DROP TABLE {Q(_options.Schema)}.{Q(staging)};");
        sql.AppendLine($"CREATE TABLE {Q(_options.Schema)}.{Q(staging)} (");
        sql.AppendLine($"    {Q(RowNumberColumn)} int IDENTITY(1,1) NOT NULL,");
        sql.AppendLine(string.Join(",\n", columns.Select(c => $"    {Q(c.Name)} {MapColumnType(c.NativeType)} NULL")));
        sql.AppendLine(");");

        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new SqlCommand(sql.ToString(), connection) { CommandTimeout = _options.CommandTimeoutSeconds };
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task BulkLoadStagingAsync(int datasetId, QueryResult result, CancellationToken cancellationToken)
    {
        if (result.Rows.Count == 0)
        {
            return;
        }

        var table = new DataTable();
        foreach (var column in result.Columns)
        {
            table.Columns.Add(column.Name, typeof(object));
        }

        foreach (var row in result.Rows)
        {
            var values = new object?[result.Columns.Count];
            for (var i = 0; i < result.Columns.Count; i++)
            {
                values[i] = i < row.Length ? row[i] ?? DBNull.Value : DBNull.Value;
            }
            table.Rows.Add(values);
        }

        await using var connection = await OpenAsync(cancellationToken);
        using var bulk = new SqlBulkCopy(connection)
        {
            DestinationTableName = $"{Q(_options.Schema)}.{Q(StagingName(datasetId))}",
            BulkCopyTimeout = _options.CommandTimeoutSeconds,
            BatchSize = _options.BulkCopyBatchSize
        };

        // Map by name â€” the staging table leads with __RowNumber, so ordinal mapping would be off by one.
        foreach (var column in result.Columns)
        {
            bulk.ColumnMappings.Add(column.Name, column.Name);
        }

        await bulk.WriteToServerAsync(table, cancellationToken);
    }

    public async Task SwapStagingIntoPlaceAsync(int datasetId, CancellationToken cancellationToken)
    {
        var live = LiveName(datasetId);
        var staging = StagingName(datasetId);

        // sp_rename's second argument must be a bare name, not schema-qualified.
        var sql = $@"
BEGIN TRANSACTION;
IF OBJECT_ID('{_options.Schema}.{live}') IS NOT NULL DROP TABLE {Q(_options.Schema)}.{Q(live)};
EXEC sp_rename '{_options.Schema}.{staging}', '{live}';
COMMIT TRANSACTION;";

        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new SqlCommand(sql, connection) { CommandTimeout = _options.CommandTimeoutSeconds };
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task DropAsync(int datasetId, CancellationToken cancellationToken)
    {
        var sql = $@"
IF OBJECT_ID('{_options.Schema}.{LiveName(datasetId)}') IS NOT NULL DROP TABLE {Q(_options.Schema)}.{Q(LiveName(datasetId))};
IF OBJECT_ID('{_options.Schema}.{StagingName(datasetId)}') IS NOT NULL DROP TABLE {Q(_options.Schema)}.{Q(StagingName(datasetId))};";

        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new SqlCommand(sql, connection) { CommandTimeout = _options.CommandTimeoutSeconds };
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<string>?> GetLiveColumnNamesAsync(int datasetId, CancellationToken cancellationToken)
    {
        const string sql = @"
SELECT c.name
FROM sys.columns c
JOIN sys.objects o ON o.object_id = c.object_id
WHERE o.name = @table AND SCHEMA_NAME(o.schema_id) = @schema
ORDER BY c.column_id;";

        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new SqlCommand(sql, connection) { CommandTimeout = _options.CommandTimeoutSeconds };
        command.Parameters.AddWithValue("@table", LiveName(datasetId));
        command.Parameters.AddWithValue("@schema", _options.Schema);

        var names = new List<string>();
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            var name = reader.GetString(0);
            if (name != RowNumberColumn)
            {
                names.Add(name);
            }
        }

        return names.Count == 0 ? null : names;
    }
}
