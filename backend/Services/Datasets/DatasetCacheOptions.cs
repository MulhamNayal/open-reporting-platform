namespace Backend.Services.Datasets;

/// <summary>
/// Bound from configuration section "DataSources:Cache".
/// </summary>
public class DatasetCacheOptions
{
    /// <summary>
    /// How long an executed dataset result stays cached. A report page executes every one of its
    /// widgets' datasets on each load, and those queries are slow enough (8-34s observed against
    /// real reporting procedures) that re-running them per viewer does not scale. Dashboards
    /// tolerate data being a few minutes old; set to 0 to disable caching entirely.
    /// </summary>
    public const int DefaultTtlSeconds = 300;

    public int TtlSeconds { get; set; } = DefaultTtlSeconds;

    public bool Enabled => TtlSeconds > 0;
}
