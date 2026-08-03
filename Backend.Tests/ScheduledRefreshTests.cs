using Backend.Data;
using Backend.Models;
using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Backend.Services.Materialization;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Tests;

public class MaterializationTrackerTests
{
    [Fact]
    public void TryBegin_TwiceForTheSameDataset_SecondCallIsRefused()
    {
        // Two loads racing on the swap could have one drop the table the other just renamed in.
        var tracker = new MaterializationTracker();

        Assert.True(tracker.TryBegin(1));
        Assert.False(tracker.TryBegin(1));
    }

    [Fact]
    public void TryBegin_DifferentDatasets_BothProceed()
    {
        var tracker = new MaterializationTracker();

        Assert.True(tracker.TryBegin(1));
        Assert.True(tracker.TryBegin(2));
    }

    [Fact]
    public void End_ReleasesTheDataset()
    {
        var tracker = new MaterializationTracker();
        tracker.TryBegin(1);

        tracker.End(1);

        Assert.False(tracker.IsRunning(1));
        Assert.True(tracker.TryBegin(1));
    }
}

public class ScheduledRefreshDueTests
{
    private class PassThroughCredentialProtector : ICredentialProtector
    {
        public string Protect(string plaintext) => plaintext;
        public string Unprotect(string protectedText) => protectedText;
    }

    private class StubStore : IMaterializationStore
    {
        public string TableNameFor(int datasetId) => $"mat.Dataset_{datasetId}";
        public Task CreateStagingTableAsync(int datasetId, IReadOnlyList<ColumnDescriptor> columns, CancellationToken ct) => Task.CompletedTask;
        public Task BulkLoadStagingAsync(int datasetId, QueryResult result, CancellationToken ct) => Task.CompletedTask;
        public Task SwapStagingIntoPlaceAsync(int datasetId, CancellationToken ct) => Task.CompletedTask;
        public Task DropAsync(int datasetId, CancellationToken ct) => Task.CompletedTask;
        public Task<IReadOnlyList<string>?> GetLiveColumnNamesAsync(int datasetId, CancellationToken ct) => Task.FromResult<IReadOnlyList<string>?>(null);
    }

    private class StubDatasetService : IDatasetService
    {
        public Task<QueryResult> ExecuteRawAsync(int datasetId, int rowLimit, CancellationToken ct = default) =>
            Task.FromResult(new QueryResult(
                new List<ColumnDescriptor> { new("Id", "int") },
                new List<object?[]> { new object?[] { 1 } }));

        public Task<DatasetSummary> CreateAsync(CreateDatasetRequest r) => throw new NotImplementedException();
        public Task<DatasetSummary> UpdateAsync(int id, UpdateDatasetRequest r) => throw new NotImplementedException();
        public Task<DatasetSummary> GetByIdAsync(int id) => throw new NotImplementedException();
        public Task<IReadOnlyList<DatasetSummary>> ListAsync(int c) => throw new NotImplementedException();
        public Task<IReadOnlyList<ColumnDescriptor>> DiscoverColumnsAsync(int id) => throw new NotImplementedException();
        public Task<QueryResult> ExecuteAsync(int id, bool refresh = false) => throw new NotImplementedException();
        public Task DeleteAsync(int id) => throw new NotImplementedException();
        public Task<DatasetSummary> PromoteAsync(int id, string name) => throw new NotImplementedException();
    }

    private static ReportingDbContext CreateContext(params Dataset[] datasets)
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();
        context.Datasets.AddRange(datasets);
        context.SaveChanges();
        return context;
    }

    private static Dataset Ds(int id, DatasetStorageMode storage, int? interval, DateTime? lastMaterialized) => new()
    {
        Id = id, DataSourceConnectionId = 1, Name = $"Ds{id}", Mode = DatasetMode.StoredProcedure,
        Definition = "{}", Columns = "[]", StorageMode = storage, RefreshIntervalMinutes = interval,
        LastMaterializedAtUtc = lastMaterialized,
        MaterializedTableName = lastMaterialized is null ? null : $"mat.Dataset_{id}",
        CreatedAtUtc = DateTime.UtcNow, UpdatedAtUtc = DateTime.UtcNow,
    };

    /// Mirrors the query in ScheduledRefreshService.RefreshDueDatasetsAsync.
    private static List<int> Due(ReportingDbContext context) =>
        context.Datasets
            .Where(d => d.StorageMode == DatasetStorageMode.Import && d.RefreshIntervalMinutes != null)
            .ToList()
            .Where(d => d.LastMaterializedAtUtc is null
                        || d.LastMaterializedAtUtc.Value.AddMinutes(d.RefreshIntervalMinutes!.Value) <= DateTime.UtcNow)
            .Select(d => d.Id)
            .ToList();

    [Fact]
    public void Due_IncludesAnImportDatasetPastItsInterval()
    {
        using var context = CreateContext(Ds(1, DatasetStorageMode.Import, 60, DateTime.UtcNow.AddMinutes(-90)));

        Assert.Equal(new[] { 1 }, Due(context));
    }

    [Fact]
    public void Due_ExcludesAnImportDatasetStillWithinItsInterval()
    {
        using var context = CreateContext(Ds(1, DatasetStorageMode.Import, 60, DateTime.UtcNow.AddMinutes(-10)));

        Assert.Empty(Due(context));
    }

    [Fact]
    public void Due_IncludesAnImportDatasetNeverMaterialized()
    {
        using var context = CreateContext(Ds(1, DatasetStorageMode.Import, 60, null));

        Assert.Equal(new[] { 1 }, Due(context));
    }

    [Fact]
    public void Due_ExcludesDatasetsWithNoInterval()
    {
        // Null interval means manual only — the default, so nothing starts refreshing itself
        // just because it was switched to Import.
        using var context = CreateContext(Ds(1, DatasetStorageMode.Import, null, DateTime.UtcNow.AddYears(-1)));

        Assert.Empty(Due(context));
    }

    [Fact]
    public void Due_ExcludesDirectQueryDatasets()
    {
        using var context = CreateContext(Ds(1, DatasetStorageMode.DirectQuery, 5, null));

        Assert.Empty(Due(context));
    }

    [Fact]
    public async Task MaterializeAsync_WhileAlreadyRunning_IsRefused()
    {
        using var context = CreateContext(Ds(1, DatasetStorageMode.Import, null, null));
        var tracker = new MaterializationTracker();
        var service = new MaterializationService(context, new StubDatasetService(), new StubStore(), tracker);

        tracker.TryBegin(1);

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.MaterializeAsync(1));
    }

    [Fact]
    public async Task MaterializeAsync_ReleasesTheTrackerAfterwards()
    {
        using var context = CreateContext(Ds(1, DatasetStorageMode.Import, null, null));
        var tracker = new MaterializationTracker();
        var service = new MaterializationService(context, new StubDatasetService(), new StubStore(), tracker);

        await service.MaterializeAsync(1);

        Assert.False(tracker.IsRunning(1));
    }
}
