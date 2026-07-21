using System.Text.Json;
using Backend.Data;
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

    public DatasetService(ReportingDbContext context, ICredentialProtector credentialProtector, IEnumerable<IDataSourceProvider> providers)
    {
        _context = context;
        _credentialProtector = credentialProtector;
        _providers = providers.ToList();
    }

    public async Task<DatasetSummary> CreateAsync(CreateDatasetRequest request)
    {
        var connection = await GetConnectionAsync(request.DataSourceConnectionId);
        ValidateModeMatchesConnectionType(request.Mode, connection.Type);

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

        _context.Datasets.Add(dataset);
        await _context.SaveChangesAsync();

        return ToSummary(dataset);
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

        IReadOnlyList<ColumnDescriptor> columns = dataset.Mode switch
        {
            DatasetMode.TableQuery => await DiscoverTableQueryColumnsAsync(decryptedConnection, dataset),
            DatasetMode.RawSql => await DiscoverRawSqlColumnsAsync(decryptedConnection, dataset),
            DatasetMode.StoredProcedure => await DiscoverStoredProcedureColumnsAsync(decryptedConnection, dataset),
            DatasetMode.RestQuery => await DiscoverRestQueryColumnsAsync(decryptedConnection, dataset),
            _ => throw new InvalidOperationException($"Unsupported dataset mode: {dataset.Mode}.")
        };

        dataset.Columns = JsonSerializer.Serialize(columns);
        dataset.UpdatedAtUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return columns;
    }

    public async Task<QueryResult> ExecuteAsync(int datasetId)
    {
        var dataset = await GetDatasetAsync(datasetId);
        var connection = await GetConnectionAsync(dataset.DataSourceConnectionId);
        var decryptedConnection = WithDecryptedCredentials(connection);
        var provider = ResolveProvider(connection.Type);

        var result = await provider.ExecuteQueryAsync(decryptedConnection, dataset, dataset.RowLimit ?? DefaultRowLimit, CancellationToken.None);

        dataset.Columns = JsonSerializer.Serialize(result.Columns);
        dataset.UpdatedAtUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return result;
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
            throw new InvalidOperationException($"No data source connection found with id {id}.");
        }

        return connection;
    }

    private async Task<Dataset> GetDatasetAsync(int id)
    {
        var dataset = await _context.Datasets.FirstOrDefaultAsync(d => d.Id == id);
        if (dataset is null)
        {
            throw new InvalidOperationException($"No dataset found with id {id}.");
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
            dataset.RowLimit,
            dataset.IsSaved,
            columns,
            dataset.CreatedAtUtc,
            dataset.UpdatedAtUtc);
    }
}
