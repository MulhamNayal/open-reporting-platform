namespace Backend.Services.DataSources;

public interface IDataSourceService
{
    Task<DataSourceConnectionSummary> CreateAsync(CreateDataSourceConnectionRequest request);

    Task<ConnectionTestResult> TestAsync(int id);

    Task<SchemaDescriptor> DiscoverSchemaAsync(int id);

    Task<IReadOnlyList<DataSourceConnectionSummary>> ListAsync();
}
