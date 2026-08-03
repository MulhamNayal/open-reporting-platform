using Backend.Data;
using Backend.Models;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Backend.Services.Materialization;

/// <summary>
/// Refreshes Import datasets that have fallen past their refresh interval.
///
/// Deliberately sequential: these are the slow queries the whole milestone exists to keep out of
/// the request path, and running several at once would put the same load back on the source
/// database that materialising was meant to remove.
/// </summary>
public class ScheduledRefreshService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly IMaterializationTracker _tracker;
    private readonly ScheduledRefreshOptions _options;
    private readonly ILogger<ScheduledRefreshService> _logger;

    public ScheduledRefreshService(
        IServiceScopeFactory scopeFactory,
        IMaterializationTracker tracker,
        IOptions<ScheduledRefreshOptions> options,
        ILogger<ScheduledRefreshService> logger)
    {
        _scopeFactory = scopeFactory;
        _tracker = tracker;
        _options = options.Value;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!_options.Enabled)
        {
            _logger.LogInformation("Scheduled dataset refresh is disabled.");
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RefreshDueDatasetsAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // The loop must survive anything a single pass throws — otherwise one bad dataset
                // silently stops every scheduled refresh until the app restarts.
                _logger.LogError(ex, "Scheduled refresh pass failed.");
            }

            try
            {
                await Task.Delay(TimeSpan.FromSeconds(_options.PollSeconds), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }

    private async Task RefreshDueDatasetsAsync(CancellationToken stoppingToken)
    {
        List<int> due;
        using (var scope = _scopeFactory.CreateScope())
        {
            var context = scope.ServiceProvider.GetRequiredService<ReportingDbContext>();
            due = (await context.Datasets
                    .Where(d => d.StorageMode == DatasetStorageMode.Import && d.RefreshIntervalMinutes != null)
                    .Select(d => new { d.Id, d.RefreshIntervalMinutes, d.LastMaterializedAtUtc })
                    .ToListAsync(stoppingToken))
                // Evaluated in memory: expressing "now minus a per-row interval" in SQL means
                // DATEADD over a column, which EF can't translate.
                .Where(d => d.LastMaterializedAtUtc is null
                            || d.LastMaterializedAtUtc.Value.AddMinutes(d.RefreshIntervalMinutes!.Value) <= DateTime.UtcNow)
                .Select(d => d.Id)
                .ToList();
        }

        foreach (var datasetId in due)
        {
            if (stoppingToken.IsCancellationRequested)
            {
                return;
            }

            // Someone pressing Refresh already has it in hand; picking it up next pass is fine.
            if (_tracker.IsRunning(datasetId))
            {
                continue;
            }

            using var scope = _scopeFactory.CreateScope();
            var materialization = scope.ServiceProvider.GetRequiredService<IMaterializationService>();

            try
            {
                var result = await materialization.MaterializeAsync(datasetId, stoppingToken);
                _logger.LogInformation("Refreshed dataset {DatasetId}: {RowCount} rows.", datasetId, result.RowCount);
            }
            catch (Exception ex)
            {
                // Recorded on the dataset by MaterializeAsync and surfaced in the UI; the loop
                // carries on to the others.
                _logger.LogWarning(ex, "Scheduled refresh of dataset {DatasetId} failed.", datasetId);
            }
        }
    }
}
