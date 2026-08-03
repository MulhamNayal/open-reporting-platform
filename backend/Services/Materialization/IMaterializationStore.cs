using Backend.Services.DataSources;

namespace Backend.Services.Materialization;

/// <summary>
/// Owns the physical tables in the cache database. Knows nothing about datasets or providers —
/// it is given columns and rows and manages tables for them.
/// </summary>
public interface IMaterializationStore
{
    /// <summary>Live table name for a dataset, e.g. <c>mat.Dataset_18</c>.</summary>
    string TableNameFor(int datasetId);

    /// <summary>
    /// Drops and recreates the staging table for this dataset, shaped to <paramref name="columns"/>.
    /// Loading into a staging table rather than the live one is what lets the swap be atomic.
    /// </summary>
    Task CreateStagingTableAsync(int datasetId, IReadOnlyList<ColumnDescriptor> columns, CancellationToken cancellationToken);

    Task BulkLoadStagingAsync(int datasetId, QueryResult result, CancellationToken cancellationToken);

    /// <summary>
    /// Replaces the live table with the staging one inside a transaction. A reader must never see
    /// a half-populated table, and a failed load must leave the previous copy in place.
    /// </summary>
    Task SwapStagingIntoPlaceAsync(int datasetId, CancellationToken cancellationToken);

    Task DropAsync(int datasetId, CancellationToken cancellationToken);

    /// <summary>Column names currently in the live table, or null if it doesn't exist. Used to
    /// detect a source whose shape has changed since the last refresh.</summary>
    Task<IReadOnlyList<string>?> GetLiveColumnNamesAsync(int datasetId, CancellationToken cancellationToken);
}
