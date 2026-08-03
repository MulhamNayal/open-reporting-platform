namespace Backend.Services.Materialization;

public interface IMaterializationService
{
    /// <summary>
    /// Runs the dataset's source query in full and loads the result into its materialised table.
    /// Safe to call repeatedly; each call fully replaces the previous copy.
    /// </summary>
    Task<MaterializationResult> MaterializeAsync(int datasetId, CancellationToken cancellationToken = default);

    /// <summary>Materialises only if the dataset has never been materialised. Used on first read.</summary>
    Task EnsureMaterializedAsync(int datasetId, CancellationToken cancellationToken = default);
}

public record MaterializationResult(int RowCount, DateTime MaterializedAtUtc);
