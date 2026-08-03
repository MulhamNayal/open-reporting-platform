using Backend.Services.DataSources;

namespace Backend.Services.Datasets;

/// <summary>
/// The three narrow query shapes that replace "execute the dataset and return everything".
/// Each call works for any dataset; behind the scenes it is either SQL against the source or
/// in-memory over the cached result, depending on <see cref="DatasetService.CanPushDownQueries"/>.
/// Callers do not need to know which.
/// </summary>
public interface IDatasetQueryService
{
    Task<PagedQueryResult> QueryRowsAsync(int datasetId, QueryRowsRequest request, CancellationToken cancellationToken = default);

    Task<QueryResult> QueryAggregateAsync(int datasetId, QueryAggregateRequest request, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<string>> QueryDistinctAsync(int datasetId, QueryDistinctRequest request, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<FilterableField>> QueryFilterableFieldsAsync(int datasetId, QueryFilterableFieldsRequest request, CancellationToken cancellationToken = default);
}
