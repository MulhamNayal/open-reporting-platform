using Backend.Services.DataSources;

namespace Backend.Services.Datasets;

public interface IDatasetService
{
    Task<DatasetSummary> CreateAsync(CreateDatasetRequest request);

    Task<DatasetSummary> UpdateAsync(int id, UpdateDatasetRequest request);

    Task<DatasetSummary> GetByIdAsync(int id);

    Task<IReadOnlyList<DatasetSummary>> ListAsync(int connectionId);

    Task<IReadOnlyList<ColumnDescriptor>> DiscoverColumnsAsync(int datasetId);

    Task<QueryResult> ExecuteAsync(int datasetId, bool refresh = false);

    /// <summary>
    /// Runs the source with no cache and an explicit row limit. Used by materialisation, which
    /// wants the whole result and must not populate or read the request-path cache.
    /// </summary>
    Task<QueryResult> ExecuteRawAsync(int datasetId, int rowLimit, CancellationToken cancellationToken = default);

    Task DeleteAsync(int id);

    Task<DatasetSummary> PromoteAsync(int id, string name);
}
