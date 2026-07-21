using Backend.Services.DataSources;

namespace Backend.Services.Datasets;

public interface IDatasetService
{
    Task<DatasetSummary> CreateAsync(CreateDatasetRequest request);

    Task<IReadOnlyList<DatasetSummary>> ListAsync(int connectionId);

    Task<IReadOnlyList<ColumnDescriptor>> DiscoverColumnsAsync(int datasetId);

    Task<QueryResult> ExecuteAsync(int datasetId);

    Task DeleteAsync(int id);

    Task<DatasetSummary> PromoteAsync(int id, string name);
}
