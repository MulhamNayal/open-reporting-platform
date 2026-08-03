namespace Backend.Services.Materialization;

/// <summary>
/// Bound from configuration section "Materialization".
/// </summary>
public class MaterializationOptions
{
    public const string DefaultSchema = "mat";

    /// <summary>
    /// Materialising runs the source query in full and bulk-loads it, so it is expected to take
    /// far longer than an interactive query. Separate from the provider's command timeout, which
    /// governs the request path.
    /// </summary>
    public const int DefaultCommandTimeoutSeconds = 1800;

    public string Schema { get; set; } = DefaultSchema;

    public int CommandTimeoutSeconds { get; set; } = DefaultCommandTimeoutSeconds;

    /// <summary>Rows per SqlBulkCopy batch. Large enough to be efficient, small enough that a
    /// failure part-way doesn't hold an enormous transaction open.</summary>
    public int BulkCopyBatchSize { get; set; } = 5000;
}
