namespace Backend.Models;

public class WidgetBinding
{
    public int Id { get; set; }

    public int WidgetId { get; set; }

    public string? CategoryField { get; set; }

    public string ValueFields { get; set; } = "[]";

    /// <summary>
    /// JSON array of aggregation function names, aligned by index with ValueFields — e.g.
    /// ["Sum","Count"]. Null means every field is unaggregated, which is exactly how every
    /// widget behaved before this column existed, so existing rows need no migration.
    /// The names map 1:1 to SQL so the same spec can later be pushed into a GROUP BY.
    /// </summary>
    public string? Aggregations { get; set; }

    /// <summary>
    /// JSON array of measures — columns computed from other columns rather than read from the
    /// source, e.g. [{"name":"Growth","expression":"DIVIDE([ThisYear] - [LastYear],[LastYear])"}].
    /// Evaluated against the aggregated rows, which is what separates a measure from a calculated
    /// column: the ratio of the sums, not the sum of the ratios.
    ///
    /// Null means the widget has none, which is how every widget behaved before this column
    /// existed, so existing rows need no backfill.
    ///
    /// Stored here rather than inside FormatOptions because a measure is data, not presentation.
    /// </summary>
    public string? Measures { get; set; }

    public string FormatOptions { get; set; } = "{}";
}
