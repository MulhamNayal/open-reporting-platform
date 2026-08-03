namespace Backend.Models;

public class Report
{
    public int Id { get; set; }

    public string Name { get; set; } = "";

    public string Description { get; set; } = "";

    public int? DatasetId { get; set; }

    /// <summary>
    /// Manual archive switch. Deactivating hides a report from the default list without
    /// deleting it — the safe way to retire something that might still be needed at year-end.
    /// </summary>
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Recorded automatically whenever the report is opened in the viewer. A manually
    /// maintained flag goes stale the moment people stop maintaining it, so "is anyone
    /// actually using this?" is answered from observed views, not from IsActive.
    /// </summary>
    public DateTime? LastViewedAtUtc { get; set; }

    public int ViewCount { get; set; }
}
