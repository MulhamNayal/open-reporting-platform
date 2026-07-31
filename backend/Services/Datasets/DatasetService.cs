using System.Text.Json;
using Backend.Data;
using Backend.Exceptions;
using Backend.Models;
using Backend.Services.DataSources;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services.Datasets;

public class DatasetService : IDatasetService
{
    private const int DefaultRowLimit = 10000;

    // Client-submitted definitionJson (and any other free-form JSON persisted alongside a Dataset)
    // uses ordinary camelCase, same as every other JSON body this API accepts. The record types in
    // DatasetDefinitions.cs/SelectQuery.cs are plain PascalCase, so deserializing them needs the same
    // case-insensitive behavior ASP.NET Core's model binder already applies to controller-bound
    // requests — JsonSerializer.Deserialize does not do this by default.
    private static readonly JsonSerializerOptions CaseInsensitiveJson = new() { PropertyNameCaseInsensitive = true };

    private readonly ReportingDbContext _context;
    private readonly ICredentialProtector _credentialProtector;
    private readonly IReadOnlyList<IDataSourceProvider> _providers;
    private readonly IDatasetResultCache? _resultCache;

    public DatasetService(
        ReportingDbContext context,
        ICredentialProtector credentialProtector,
        IEnumerable<IDataSourceProvider> providers,
        // Optional so the existing service tests can keep constructing this directly; DI always
        // supplies it. A null cache simply means every execute hits the source, as before.
        IDatasetResultCache? resultCache = null)
    {
        _context = context;
        _credentialProtector = credentialProtector;
        _providers = providers.ToList();
        _resultCache = resultCache;
    }

    public async Task<DatasetSummary> CreateAsync(CreateDatasetRequest request)
    {
        var connection = await GetConnectionAsync(request.DataSourceConnectionId);
        ValidateModeMatchesConnectionType(request.Mode, connection.Type);
        var decryptedConnection = WithDecryptedCredentials(connection);

        var now = DateTime.UtcNow;
        var dataset = new Dataset
        {
            DataSourceConnectionId = request.DataSourceConnectionId,
            Name = request.Name,
            Description = request.Description,
            Mode = request.Mode,
            Definition = request.DefinitionJson,
            RowLimit = request.RowLimit,
            IsSaved = request.IsSaved,
            Columns = "[]",
            CreatedAtUtc = now,
            UpdatedAtUtc = now
        };

        // Runs the dataset's own query/procedure before the row ever exists, so a broken
        // definition (wrong table, nonexistent stored procedure, bad SQL) never gets persisted —
        // previously this only happened via a separate discover-columns call made after creation,
        // leaving a saved-but-broken dataset behind whenever that follow-up call failed.
        var columns = await DiscoverColumnsForAsync(decryptedConnection, dataset);
        dataset.Columns = JsonSerializer.Serialize(columns);

        _context.Datasets.Add(dataset);
        await _context.SaveChangesAsync();

        return ToSummary(dataset);
    }

    public async Task<DatasetSummary> UpdateAsync(int id, UpdateDatasetRequest request)
    {
        var dataset = await GetDatasetAsync(id);
        var connection = await GetConnectionAsync(dataset.DataSourceConnectionId);
        ValidateModeMatchesConnectionType(request.Mode, connection.Type);
        var decryptedConnection = WithDecryptedCredentials(connection);

        dataset.Name = request.Name;
        dataset.Description = request.Description;
        dataset.Mode = request.Mode;
        dataset.Definition = request.DefinitionJson;
        dataset.RowLimit = request.RowLimit;

        // Same validate-before-persist principle as CreateAsync: run the updated definition
        // before saving, so an edit that breaks the dataset (wrong table, bad SQL, nonexistent
        // procedure) is rejected instead of overwriting a previously-working definition.
        var columns = await DiscoverColumnsForAsync(decryptedConnection, dataset);
        dataset.Columns = JsonSerializer.Serialize(columns);
        dataset.UpdatedAtUtc = DateTime.UtcNow;
        // Retires every cache entry for this dataset — the old key can no longer be built.
        dataset.DefinitionVersion++;

        await _context.SaveChangesAsync();

        return ToSummary(dataset);
    }

    // Unlike ListAsync this returns unsaved (ad-hoc) datasets too — a report's default dataset
    // is ad-hoc when it came from the "Change data source" dialog, and callers still need to
    // resolve its connection to enumerate that connection's saved datasets.
    public async Task<DatasetSummary> GetByIdAsync(int id)
    {
        return ToSummary(await GetDatasetAsync(id));
    }

    public async Task<IReadOnlyList<DatasetSummary>> ListAsync(int connectionId)
    {
        var datasets = await _context.Datasets
            .Where(d => d.DataSourceConnectionId == connectionId && d.IsSaved)
            .ToListAsync();

        return datasets.Select(ToSummary).ToList();
    }

    public async Task DeleteAsync(int id)
    {
        var dataset = await GetDatasetAsync(id);
        _context.Datasets.Remove(dataset);
        await _context.SaveChangesAsync();
    }

    public async Task<DatasetSummary> PromoteAsync(int id, string name)
    {
        var dataset = await GetDatasetAsync(id);
        dataset.Name = name;
        dataset.IsSaved = true;
        dataset.UpdatedAtUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return ToSummary(dataset);
    }

    public async Task<IReadOnlyList<ColumnDescriptor>> DiscoverColumnsAsync(int datasetId)
    {
        var dataset = await GetDatasetAsync(datasetId);
        var connection = await GetConnectionAsync(dataset.DataSourceConnectionId);
        var decryptedConnection = WithDecryptedCredentials(connection);

        var columns = await DiscoverColumnsForAsync(decryptedConnection, dataset);

        dataset.Columns = JsonSerializer.Serialize(columns);
        dataset.UpdatedAtUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return columns;
    }

    // refresh: the Ribbon's explicit Refresh must always re-query the source, otherwise the
    // button silently does nothing for the rest of the TTL.
    public async Task<QueryResult> ExecuteAsync(int datasetId, bool refresh = false)
    {
        var dataset = await GetDatasetAsync(datasetId);
        var rowLimit = dataset.RowLimit ?? DefaultRowLimit;
        var cacheKey = BuildCacheKey(dataset, rowLimit);

        if (!refresh)
        {
            var cached = _resultCache?.Get(cacheKey);
            if (cached is not null)
            {
                // Deliberately no SaveChangesAsync here: a cache hit changed nothing, and the
                // write below would otherwise run on every page load of every report.
                return cached;
            }
        }

        var connection = await GetConnectionAsync(dataset.DataSourceConnectionId);
        var decryptedConnection = WithDecryptedCredentials(connection);
        var provider = ResolveProvider(connection.Type);

        var result = await provider.ExecuteQueryAsync(decryptedConnection, dataset, rowLimit, CancellationToken.None);

        dataset.Columns = JsonSerializer.Serialize(result.Columns);
        dataset.UpdatedAtUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        _resultCache?.Set(cacheKey, result);

        return result;
    }

    // DefinitionVersion, not UpdatedAtUtc — see the comment on Dataset.DefinitionVersion. Because
    // the version is part of the key, an edited dataset can never serve a stale entry and no
    // explicit eviction is needed; the orphaned entry just expires.
    private static string BuildCacheKey(Dataset dataset, int rowLimit) =>
        $"dataset:{dataset.Id}:v{dataset.DefinitionVersion}:rows{rowLimit}";

    private async Task<IReadOnlyList<ColumnDescriptor>> DiscoverColumnsForAsync(DataSourceConnection connection, Dataset dataset)
    {
        return dataset.Mode switch
        {
            DatasetMode.TableQuery => await DiscoverTableQueryColumnsAsync(connection, dataset),
            DatasetMode.RawSql => await DiscoverRawSqlColumnsAsync(connection, dataset),
            DatasetMode.StoredProcedure => await DiscoverStoredProcedureColumnsAsync(connection, dataset),
            DatasetMode.RestQuery => await DiscoverRestQueryColumnsAsync(connection, dataset),
            _ => throw new InvalidOperationException($"Unsupported dataset mode: {dataset.Mode}.")
        };
    }

    private async Task<IReadOnlyList<ColumnDescriptor>> DiscoverTableQueryColumnsAsync(DataSourceConnection connection, Dataset dataset)
    {
        var provider = ResolveProvider(connection.Type);
        var schema = await provider.DiscoverSchemaAsync(connection);
        var definition = JsonSerializer.Deserialize<TableQueryDefinition>(dataset.Definition, CaseInsensitiveJson)!;

        var table = schema.Tables.FirstOrDefault(t => t.Name == definition.Query.Table);
        if (table is null)
        {
            throw new InvalidOperationException($"Table '{definition.Query.Table}' was not found in the connection's discovered schema.");
        }

        return table.Fields
            .Where(f => definition.Query.Columns.Contains(f.Name))
            .Select(f => new ColumnDescriptor(f.Name, f.DataType))
            .ToList();
    }

    private async Task<IReadOnlyList<ColumnDescriptor>> DiscoverRawSqlColumnsAsync(DataSourceConnection connection, Dataset dataset)
    {
        var sqlServerProvider = (SqlServerProvider)ResolveProvider(connection.Type);
        var definition = JsonSerializer.Deserialize<RawSqlDefinition>(dataset.Definition, CaseInsensitiveJson)!;
        return await sqlServerProvider.DiscoverRawSqlColumnsAsync(connection, definition.SqlText, CancellationToken.None);
    }

    private async Task<IReadOnlyList<ColumnDescriptor>> DiscoverStoredProcedureColumnsAsync(DataSourceConnection connection, Dataset dataset)
    {
        var sqlServerProvider = (SqlServerProvider)ResolveProvider(connection.Type);
        var definition = JsonSerializer.Deserialize<StoredProcedureDefinition>(dataset.Definition, CaseInsensitiveJson)!;
        return await sqlServerProvider.DiscoverStoredProcedureColumnsAsync(connection, definition.RoutineName, definition.Parameters, CancellationToken.None);
    }

    private async Task<IReadOnlyList<ColumnDescriptor>> DiscoverRestQueryColumnsAsync(DataSourceConnection connection, Dataset dataset)
    {
        var restApiProvider = (RestApiProvider)ResolveProvider(connection.Type);
        var definition = JsonSerializer.Deserialize<RestQueryDefinition>(dataset.Definition, CaseInsensitiveJson)!;
        return await restApiProvider.DiscoverRestQueryColumnsAsync(connection, definition.PathSuffix, definition.QueryParams, CancellationToken.None);
    }

    private static void ValidateModeMatchesConnectionType(DatasetMode mode, DataSourceType connectionType)
    {
        var expectedType = mode == DatasetMode.RestQuery ? DataSourceType.RestApi : DataSourceType.SqlServer;
        if (connectionType != expectedType)
        {
            throw new InvalidOperationException($"Dataset mode {mode} is not valid for a connection of type {connectionType}.");
        }
    }

    private async Task<DataSourceConnection> GetConnectionAsync(int id)
    {
        var connection = await _context.DataSourceConnections.FirstOrDefaultAsync(c => c.Id == id);
        if (connection is null)
        {
            throw new NotFoundException($"No data source connection found with id {id}.");
        }

        return connection;
    }

    private async Task<Dataset> GetDatasetAsync(int id)
    {
        var dataset = await _context.Datasets.FirstOrDefaultAsync(d => d.Id == id);
        if (dataset is null)
        {
            throw new NotFoundException($"No dataset found with id {id}.");
        }

        return dataset;
    }

    private IDataSourceProvider ResolveProvider(DataSourceType type)
    {
        var provider = _providers.FirstOrDefault(p => p.SupportedType == type);
        if (provider is null)
        {
            throw new InvalidOperationException($"No provider registered for data source type {type}.");
        }

        return provider;
    }

    // Same transient-decrypted-copy pattern as DataSourceService.WithDecryptedCredentials (Milestone 2) —
    // duplicated deliberately rather than shared, so this service doesn't take a dependency on
    // DataSourceService or expose decryption outside either service's own boundary.
    private DataSourceConnection WithDecryptedCredentials(DataSourceConnection connection)
    {
        return new DataSourceConnection
        {
            Id = connection.Id,
            Name = connection.Name,
            Type = connection.Type,
            Host = connection.Host,
            DatabaseName = connection.DatabaseName,
            EncryptedCredentials = _credentialProtector.Unprotect(connection.EncryptedCredentials),
            CreatedAtUtc = connection.CreatedAtUtc
        };
    }

    private static DatasetSummary ToSummary(Dataset dataset)
    {
        var columns = JsonSerializer.Deserialize<IReadOnlyList<ColumnDescriptor>>(dataset.Columns) ?? new List<ColumnDescriptor>();
        return new DatasetSummary(
            dataset.Id,
            dataset.DataSourceConnectionId,
            dataset.Name,
            dataset.Description,
            dataset.Mode,
            dataset.Definition,
            dataset.RowLimit,
            dataset.IsSaved,
            columns,
            dataset.CreatedAtUtc,
            dataset.UpdatedAtUtc);
    }
}
