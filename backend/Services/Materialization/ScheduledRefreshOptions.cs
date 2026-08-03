namespace Backend.Services.Materialization;

/// <summary>
/// Bound from configuration section "Materialization:Schedule".
/// </summary>
public class ScheduledRefreshOptions
{
    /// <summary>How often the scheduler wakes to look for due datasets. Not how often any given
    /// dataset refreshes — that's <c>Dataset.RefreshIntervalMinutes</c>.</summary>
    public int PollSeconds { get; set; } = 60;

    /// <summary>Set false to disable background refresh entirely — useful on a developer machine
    /// where a wake-up would hammer a shared source database.</summary>
    public bool Enabled { get; set; } = true;
}
