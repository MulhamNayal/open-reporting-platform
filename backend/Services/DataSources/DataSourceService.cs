using Backend.Data;
using Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services.DataSources;

public class DataSourceService : IDataSourceService
{
    private readonly ReportingDbContext _context;
    private readonly ICredentialProtector _credentialProtector;
    private readonly IReadOnlyList<IDataSourceProvider> _providers;

    public DataSourceService(ReportingDbContext context, ICredentialProtector credentialProtector, IEnumerable<IDataSourceProvider> providers)
    {
        _context = context;
        _credentialProtector = credentialProtector;
        _providers = providers.ToList();
    }

    public async Task<DataSourceConnectionSummary> CreateAsync(CreateDataSourceConnectionRequest request)
    {
        var connection = new DataSourceConnection
        {
            Name = request.Name,
            Type = request.Type,
            Host = request.Host,
            DatabaseName = request.DatabaseName,
            EncryptedCredentials = _credentialProtector.Protect(request.CredentialsJson),
            CreatedAtUtc = DateTime.UtcNow
        };

        _context.DataSourceConnections.Add(connection);
        await _context.SaveChangesAsync();

        return ToSummary(connection);
    }

    public async Task<ConnectionTestResult> TestAsync(int id)
    {
        var connection = await GetConnectionAsync(id);
        var provider = ResolveProvider(connection.Type);
        return await provider.TestConnectionAsync(WithDecryptedCredentials(connection));
    }

    public async Task<SchemaDescriptor> DiscoverSchemaAsync(int id)
    {
        var connection = await GetConnectionAsync(id);
        var provider = ResolveProvider(connection.Type);
        return await provider.DiscoverSchemaAsync(WithDecryptedCredentials(connection));
    }

    public async Task<IReadOnlyList<DataSourceConnectionSummary>> ListAsync()
    {
        var connections = await _context.DataSourceConnections.ToListAsync();
        return connections.Select(ToSummary).ToList();
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

    private IDataSourceProvider ResolveProvider(DataSourceType type)
    {
        var provider = _providers.FirstOrDefault(p => p.SupportedType == type);
        if (provider is null)
        {
            throw new InvalidOperationException($"No provider registered for data source type {type}.");
        }

        return provider;
    }

    // Providers never call ICredentialProtector themselves (see design). This builds a transient,
    // never-persisted copy of the connection where EncryptedCredentials has been swapped for the
    // decrypted plaintext JSON, so a provider's BuildConnectionString/credential-parsing logic can
    // read it directly. The real, still-encrypted row in the database is untouched by this.
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

    private static DataSourceConnectionSummary ToSummary(DataSourceConnection connection)
    {
        return new DataSourceConnectionSummary(
            connection.Id,
            connection.Name,
            connection.Type,
            connection.Host,
            connection.DatabaseName,
            connection.CreatedAtUtc);
    }
}
