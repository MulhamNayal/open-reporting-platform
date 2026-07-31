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

    public string FormatOptions { get; set; } = "{}";
}
