using System.Data;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Backend.Data;
using Backend.Exceptions;
using Backend.Models;
using Backend.Services.DataSources;
using Backend.Services.Materialization;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Backend.Services.Datasets;

public class DatasetQueryService : IDatasetQueryService
{
    /// <summary>A caller must not be able to ask for the whole table back and undo the point of paging.</summary>
    public const int MaxTake = 500;

    public const int MaxDistinctTake = 5000;

    private static readonly JsonSerializerOptions CaseInsensitiveJson = new() { PropertyNameCaseInsensitive = true };

    private readonly ReportingDbContext _context;
    private readonly IDatasetService _datasetService;
    private readonly ICredentialProtector _credentialProtector;
    private readonly IReadOnlyList<IDataSourceProvider> _providers;
    private readonly IMaterializationService _materialization;
    private readonly MaterializationOptions _materializationOptions;
    private readonly IConfiguration _configuration;

    public DatasetQueryService(
        ReportingDbContext context,
        IDatasetService datasetService,
        ICredentialProtector credentialProtector,
        IEnumerable<IDataSourceProvider> providers,
        IMaterializationService materialization,
        IOptions<MaterializationOptions> materializationOptions,
        IConfiguration configuration)
    {
        _context = context;
        _datasetService = datasetService;
        _credentialProtector = credentialProtector;
        _providers = providers.ToList();
        _materialization = materialization;
        _materializationOptions = materializationOptions.Value;
        _configuration = configuration;
    }

    // ---------------------------------------------------------------- public API

    public async Task<PagedQueryResult> QueryRowsAsync(int datasetId, QueryRowsRequest request, CancellationToken cancellationToken = default)
    {
        var dataset = await GetDatasetAsync(datasetId);
        var columns = ColumnsOf(dataset);
        var take = Math.Clamp(request.Take, 1, MaxTake);
        var skip = Math.Max(0, request.Skip);

        var selected = ResolveColumns(request.Columns, columns);
        ValidateFilters(request.Filters, columns);
        if (request.Sort is not null)
        {
            RequireKnownColumn(request.Sort.Field, columns);
        }

        if (!DatasetService.CanPushDownQueries(dataset.Mode, dataset.StorageMode))
        {
            var all = await _datasetService.ExecuteAsync(datasetId);
            var filtered = ApplyFilters(all, request.Filters);
            var sorted = ApplySort(filtered, request.Sort);
            var page = sorted.Rows.Skip(skip).Take(take).ToList();
            return new PagedQueryResult(Project(sorted.Columns, selected, page, out var projected), projected, sorted.Rows.Count);
        }

        await EnsureReadyAsync(dataset, cancellationToken);

        var parameters = new List<SqlParameter>();
        var where = BuildWhere(request.Filters, parameters);
        var source = await BuildSourceAsync(dataset);
        var orderBy = request.Sort is not null
            ? $"{Quote(request.Sort.Field)} {(request.Sort.Descending ? "DESC" : "ASC")}"
            // Paging needs a deterministic order; the identity column exists precisely for this.
            : (dataset.StorageMode == DatasetStorageMode.Import ? Quote(SqlMaterializationStore.RowNumberColumn) : "(SELECT NULL)");

        var columnList = string.Join(", ", selected.Select(Quote));
        var sql = $@"
SELECT {columnList} FROM {source}
{where}
ORDER BY {orderBy}
OFFSET {skip} ROWS FETCH NEXT {take} ROWS ONLY;
SELECT COUNT_BIG(1) FROM {source} {where};";

        return await ReadPagedAsync(dataset, sql, parameters, selected, cancellationToken);
    }

    public async Task<QueryResult> QueryAggregateAsync(int datasetId, QueryAggregateRequest request, CancellationToken cancellationToken = default)
    {
        var dataset = await GetDatasetAsync(datasetId);
        var columns = ColumnsOf(dataset);

        ValidateFilters(request.Filters, columns);
        if (request.CategoryField is not null)
        {
            RequireKnownColumn(request.CategoryField, columns);
        }
        foreach (var field in request.ValueFields)
        {
            RequireKnownColumn(field, columns);
        }

        if (!DatasetService.CanPushDownQueries(dataset.Mode, dataset.StorageMode))
        {
            var all = await _datasetService.ExecuteAsync(datasetId);
            return AggregateInMemory(ApplyFilters(all, request.Filters), request);
        }

        await EnsureReadyAsync(dataset, cancellationToken);

        var parameters = new List<SqlParameter>();
        var where = BuildWhere(request.Filters, parameters);
        var source = await BuildSourceAsync(dataset);

        var selectParts = new List<string>();
        if (request.CategoryField is not null)
        {
            selectParts.Add(Quote(request.CategoryField));
        }
        for (var i = 0; i < request.ValueFields.Count; i++)
        {
            var fn = request.Aggregations is not null && i < request.Aggregations.Count ? request.Aggregations[i] : "None";
            selectParts.Add($"{AggregateExpression(fn, request.ValueFields[i])} AS {Quote(request.ValueFields[i])}");
        }

        var groupBy = request.CategoryField is not null ? $"GROUP BY {Quote(request.CategoryField)}" : "";
        var sql = $"SELECT {string.Join(", ", selectParts)} FROM {source} {where} {groupBy};";

        return await ReadQueryAsync(dataset, sql, parameters, cancellationToken);
    }

    public async Task<IReadOnlyList<string>> QueryDistinctAsync(int datasetId, QueryDistinctRequest request, CancellationToken cancellationToken = default)
    {
        var dataset = await GetDatasetAsync(datasetId);
        var columns = ColumnsOf(dataset);
        RequireKnownColumn(request.Column, columns);
        ValidateFilters(request.Filters, columns);
        var take = Math.Clamp(request.Take, 1, MaxDistinctTake);

        if (!DatasetService.CanPushDownQueries(dataset.Mode, dataset.StorageMode))
        {
            var all = await _datasetService.ExecuteAsync(datasetId);
            var index = IndexOf(all.Columns, request.Column);
            return ApplyFilters(all, request.Filters).Rows
                .Select(r => Normalize(index >= 0 && index < r.Length ? r[index] : null))
                .Distinct(StringComparer.Ordinal)
                .OrderBy(v => v, StringComparer.Ordinal)
                .Take(take)
                .ToList();
        }

        await EnsureReadyAsync(dataset, cancellationToken);

        var parameters = new List<SqlParameter>();
        var where = BuildWhere(request.Filters, parameters);
        var source = await BuildSourceAsync(dataset);
        var sql = $"SELECT DISTINCT TOP ({take}) {Quote(request.Column)} FROM {source} {where} ORDER BY {Quote(request.Column)};";

        var result = await ReadQueryAsync(dataset, sql, parameters, cancellationToken);
        return result.Rows.Select(r => Normalize(r.Length > 0 ? r[0] : null)).ToList();
    }

    // ---------------------------------------------------------------- SQL building

    private static string Quote(string identifier) => "[" + identifier.Replace("]", "]]") + "]";

    /// <summary>
    /// Values are always parameters, never concatenated. Unlike SelectQuery there is no operator
    /// allow-list to lean on here, so the predicate is the one place injection could enter.
    /// </summary>
    public static string BuildWhere(IReadOnlyList<DatasetFilter>? filters, List<SqlParameter> parameters)
    {
        var active = (filters ?? Array.Empty<DatasetFilter>()).Where(f => f.Values.Count > 0).ToList();
        if (active.Count == 0)
        {
            return "";
        }

        var clauses = new List<string>();
        foreach (var filter in active)
        {
            var names = new List<string>();
            foreach (var value in filter.Values)
            {
                var name = $"@p{parameters.Count}";
                parameters.Add(new SqlParameter(name, (object?)value ?? DBNull.Value));
                names.Add(name);
            }

            // Empty string is how the frontend represents null, so a filter including it must
            // also match real nulls — IN () alone never matches NULL in SQL.
            var clause = $"{Quote(filter.Field)} IN ({string.Join(", ", names)})";
            if (filter.Values.Contains(""))
            {
                clause = $"({clause} OR {Quote(filter.Field)} IS NULL)";
            }

            clauses.Add(clause);
        }

        return "WHERE " + string.Join(" AND ", clauses.Select(c => $"({c})"));
    }

    private static string AggregateExpression(string function, string field) => function switch
    {
        "Sum" => $"SUM({Quote(field)})",
        "Count" => $"COUNT({Quote(field)})",
        "CountDistinct" => $"COUNT(DISTINCT {Quote(field)})",
        "Avg" => $"AVG({Quote(field)})",
        "Min" => $"MIN({Quote(field)})",
        "Max" => $"MAX({Quote(field)})",
        // "None" inside a grouped query still needs an aggregate; MIN is the deterministic
        // equivalent of the client-side "take the group's first value".
        _ => $"MIN({Quote(field)})"
    };

    private async Task<string> BuildSourceAsync(Dataset dataset)
    {
        if (dataset.StorageMode == DatasetStorageMode.Import)
        {
            return $"{Quote(_materializationOptions.Schema)}.{Quote($"Dataset_{dataset.Id}")}";
        }

        // RawSql is the only live mode we push down to — it wraps in a derived table, exactly as
        // BuildBoundedRawSql already does for row limiting.
        var definition = JsonSerializer.Deserialize<RawSqlDefinition>(dataset.Definition, CaseInsensitiveJson)!;
        var trimmed = definition.SqlText.TrimEnd().TrimEnd(';');
        return $"({trimmed}) AS src";
    }

    private async Task EnsureReadyAsync(Dataset dataset, CancellationToken cancellationToken)
    {
        if (dataset.StorageMode == DatasetStorageMode.Import)
        {
            await _materialization.EnsureMaterializedAsync(dataset.Id, cancellationToken);
        }
    }

    private async Task<SqlConnection> OpenAsync(Dataset dataset, CancellationToken cancellationToken)
    {
        string connectionString;
        if (dataset.StorageMode == DatasetStorageMode.Import)
        {
            connectionString = _configuration.GetConnectionString("ReportingCacheDatabase")
                ?? throw new InvalidOperationException("Connection string 'ReportingCacheDatabase' is not configured.");
        }
        else
        {
            var connection = await _context.DataSourceConnections
                .FirstOrDefaultAsync(c => c.Id == dataset.DataSourceConnectionId, cancellationToken)
                ?? throw new NotFoundException($"No connection found with id {dataset.DataSourceConnectionId}.");

            var decrypted = new DataSourceConnection
            {
                Id = connection.Id,
                Name = connection.Name,
                Type = connection.Type,
                Host = connection.Host,
                DatabaseName = connection.DatabaseName,
                EncryptedCredentials = _credentialProtector.Unprotect(connection.EncryptedCredentials),
                CreatedAtUtc = connection.CreatedAtUtc
            };

            var provider = (SqlServerProvider)_providers.First(p => p.SupportedType == connection.Type);
            connectionString = provider.BuildConnectionString(decrypted);
        }

        var sqlConnection = new SqlConnection(connectionString);
        await sqlConnection.OpenAsync(cancellationToken);
        return sqlConnection;
    }

    private async Task<QueryResult> ReadQueryAsync(Dataset dataset, string sql, List<SqlParameter> parameters, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(dataset, cancellationToken);
        await using var command = new SqlCommand(sql, connection) { CommandTimeout = _materializationOptions.CommandTimeoutSeconds };
        command.Parameters.AddRange(parameters.ToArray());

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await ReadResultAsync(reader, cancellationToken);
    }

    private async Task<PagedQueryResult> ReadPagedAsync(Dataset dataset, string sql, List<SqlParameter> parameters, IReadOnlyList<string> selected, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(dataset, cancellationToken);
        await using var command = new SqlCommand(sql, connection) { CommandTimeout = _materializationOptions.CommandTimeoutSeconds };
        // The count re-uses the same predicate, so the parameters have to be supplied twice over
        // one batch — SqlParameter instances can't be reused across two collections.
        command.Parameters.AddRange(parameters.ToArray());

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var page = await ReadResultAsync(reader, cancellationToken);

        var total = page.Rows.Count;
        if (await reader.NextResultAsync(cancellationToken) && await reader.ReadAsync(cancellationToken))
        {
            total = Convert.ToInt32(reader.GetValue(0), CultureInfo.InvariantCulture);
        }

        return new PagedQueryResult(page.Columns, page.Rows, total);
    }

    private static async Task<QueryResult> ReadResultAsync(SqlDataReader reader, CancellationToken cancellationToken)
    {
        var columns = new List<ColumnDescriptor>();
        for (var i = 0; i < reader.FieldCount; i++)
        {
            columns.Add(new ColumnDescriptor(reader.GetName(i), reader.GetDataTypeName(i)));
        }

        var rows = new List<object?[]>();
        while (await reader.ReadAsync(cancellationToken))
        {
            var row = new object?[reader.FieldCount];
            for (var i = 0; i < reader.FieldCount; i++)
            {
                row[i] = await reader.IsDBNullAsync(i, cancellationToken) ? null : reader.GetValue(i);
            }
            rows.Add(row);
        }

        return new QueryResult(columns, rows);
    }

    // ---------------------------------------------------------------- in-memory fallback

    private static string Normalize(object? value) => value is null ? "" : value.ToString() ?? "";

    private static int IndexOf(IReadOnlyList<ColumnDescriptor> columns, string name)
    {
        for (var i = 0; i < columns.Count; i++)
        {
            if (columns[i].Name == name)
            {
                return i;
            }
        }
        return -1;
    }

    /// <summary>Mirrors the frontend's applyFilters: absent columns are skipped rather than
    /// excluding everything, so one page filter can span datasets of different shapes.</summary>
    private static QueryResult ApplyFilters(QueryResult result, IReadOnlyList<DatasetFilter>? filters)
    {
        var active = (filters ?? Array.Empty<DatasetFilter>())
            .Where(f => f.Values.Count > 0 && IndexOf(result.Columns, f.Field) >= 0)
            .Select(f => (Index: IndexOf(result.Columns, f.Field), f.Values))
            .ToList();

        if (active.Count == 0)
        {
            return result;
        }

        var rows = result.Rows
            .Where(row => active.All(f => f.Values.Contains(Normalize(f.Index < row.Length ? row[f.Index] : null))))
            .ToList();

        return new QueryResult(result.Columns, rows);
    }

    private static QueryResult ApplySort(QueryResult result, DatasetSort? sort)
    {
        if (sort is null)
        {
            return result;
        }

        var index = IndexOf(result.Columns, sort.Field);
        if (index < 0)
        {
            return result;
        }

        var sorted = sort.Descending
            ? result.Rows.OrderByDescending(r => index < r.Length ? r[index] : null, Comparer<object?>.Create(CompareValues)).ToList()
            : result.Rows.OrderBy(r => index < r.Length ? r[index] : null, Comparer<object?>.Create(CompareValues)).ToList();

        return new QueryResult(result.Columns, sorted);
    }

    private static int CompareValues(object? a, object? b)
    {
        if (a is null && b is null) return 0;
        if (a is null) return -1;
        if (b is null) return 1;
        if (a is IComparable ca && a.GetType() == b.GetType()) return ca.CompareTo(b);
        return string.Compare(Normalize(a), Normalize(b), StringComparison.Ordinal);
    }

    private static QueryResult AggregateInMemory(QueryResult result, QueryAggregateRequest request)
    {
        var categoryIndex = request.CategoryField is null ? -1 : IndexOf(result.Columns, request.CategoryField);
        var valueIndexes = request.ValueFields.Select(f => IndexOf(result.Columns, f)).ToList();

        var groups = new Dictionary<string, (object? Key, List<object?[]> Rows)>(StringComparer.Ordinal);
        foreach (var row in result.Rows)
        {
            var rawKey = categoryIndex >= 0 && categoryIndex < row.Length ? row[categoryIndex] : null;
            var key = categoryIndex < 0 ? "" : Normalize(rawKey);
            if (!groups.TryGetValue(key, out var group))
            {
                group = (categoryIndex < 0 ? null : rawKey, new List<object?[]>());
                groups[key] = group;
            }
            group.Rows.Add(row);
        }

        var columns = new List<ColumnDescriptor>();
        if (request.CategoryField is not null && categoryIndex >= 0)
        {
            columns.Add(result.Columns[categoryIndex]);
        }
        for (var i = 0; i < request.ValueFields.Count; i++)
        {
            var fn = request.Aggregations is not null && i < request.Aggregations.Count ? request.Aggregations[i] : "None";
            var native = fn is "Count" or "CountDistinct"
                ? "int"
                : (valueIndexes[i] >= 0 ? result.Columns[valueIndexes[i]].NativeType : "nvarchar(max)");
            columns.Add(new ColumnDescriptor(request.ValueFields[i], native));
        }

        var rows = new List<object?[]>();
        foreach (var group in groups.Values)
        {
            var cells = new List<object?>();
            if (request.CategoryField is not null && categoryIndex >= 0)
            {
                cells.Add(group.Key);
            }
            for (var i = 0; i < request.ValueFields.Count; i++)
            {
                var fn = request.Aggregations is not null && i < request.Aggregations.Count ? request.Aggregations[i] : "None";
                cells.Add(Aggregate(fn, group.Rows, valueIndexes[i]));
            }
            rows.Add(cells.ToArray());
        }

        return new QueryResult(columns, rows);
    }

    private static object? Aggregate(string function, List<object?[]> rows, int index)
    {
        if (index < 0)
        {
            return null;
        }

        var present = rows
            .Select(r => index < r.Length ? r[index] : null)
            .Where(v => v is not null && Normalize(v).Length > 0)
            .ToList();

        switch (function)
        {
            case "Count":
                return present.Count;
            case "CountDistinct":
                return present.Select(Normalize).Distinct(StringComparer.Ordinal).Count();
            case "Sum":
            case "Avg":
            {
                var numbers = present.Select(ToDouble).Where(d => d.HasValue).Select(d => d!.Value).ToList();
                if (numbers.Count == 0) return null;
                return function == "Sum" ? numbers.Sum() : numbers.Average();
            }
            case "Min":
            case "Max":
            {
                if (present.Count == 0) return null;
                var ordered = present.OrderBy(v => v, Comparer<object?>.Create(CompareValues)).ToList();
                return function == "Min" ? ordered.First() : ordered.Last();
            }
            default:
                return present.Count > 0 ? present[0] : null;
        }
    }

    private static double? ToDouble(object? value) =>
        value is null ? null
        : double.TryParse(Normalize(value), NumberStyles.Any, CultureInfo.InvariantCulture, out var d) ? d
        : null;

    // ---------------------------------------------------------------- shared helpers

    private async Task<Dataset> GetDatasetAsync(int id)
    {
        var dataset = await _context.Datasets.FirstOrDefaultAsync(d => d.Id == id);
        if (dataset is null)
        {
            throw new NotFoundException($"No dataset found with id {id}.");
        }
        return dataset;
    }

    private static IReadOnlyList<ColumnDescriptor> ColumnsOf(Dataset dataset) =>
        JsonSerializer.Deserialize<IReadOnlyList<ColumnDescriptor>>(dataset.Columns) ?? new List<ColumnDescriptor>();

    /// <summary>Every identifier reaching SQL is checked against the dataset's own discovered
    /// columns first — quoting alone isn't a sufficient defence for a name the caller supplied.</summary>
    private static void RequireKnownColumn(string name, IReadOnlyList<ColumnDescriptor> columns)
    {
        if (!columns.Any(c => c.Name == name))
        {
            throw new InvalidOperationException($"Column '{name}' is not part of this dataset.");
        }
    }

    private static void ValidateFilters(IReadOnlyList<DatasetFilter>? filters, IReadOnlyList<ColumnDescriptor> columns)
    {
        foreach (var filter in filters ?? Array.Empty<DatasetFilter>())
        {
            if (filter.Values.Count > 0)
            {
                RequireKnownColumn(filter.Field, columns);
            }
        }
    }

    private static IReadOnlyList<string> ResolveColumns(IReadOnlyList<string>? requested, IReadOnlyList<ColumnDescriptor> columns)
    {
        if (requested is null || requested.Count == 0)
        {
            return columns.Select(c => c.Name).ToList();
        }

        foreach (var name in requested)
        {
            RequireKnownColumn(name, columns);
        }

        return requested;
    }

    private static IReadOnlyList<ColumnDescriptor> Project(
        IReadOnlyList<ColumnDescriptor> columns, IReadOnlyList<string> selected,
        IReadOnlyList<object?[]> rows, out IReadOnlyList<object?[]> projected)
    {
        var indexes = selected.Select(name => IndexOf(columns, name)).ToList();
        projected = rows.Select(row => indexes.Select(i => i >= 0 && i < row.Length ? row[i] : null).ToArray()).ToList();
        return selected.Select(name =>
        {
            var i = IndexOf(columns, name);
            return i >= 0 ? columns[i] : new ColumnDescriptor(name, "nvarchar(max)");
        }).ToList();
    }
}
