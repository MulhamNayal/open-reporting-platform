using Backend.Models;

namespace Backend.Services.DataSources;

public interface IDataSourceProvider
{
    DataSourceType SupportedType { get; }

    Task<ConnectionTestResult> TestConnectionAsync(DataSourceConnection connection);

    Task<SchemaDescriptor> DiscoverSchemaAsync(DataSourceConnection connection);

    Task<QueryResult> ExecuteQueryAsync(DataSourceConnection connection, Dataset dataset, int rowLimit, CancellationToken cancellationToken);
}
