using Backend.Data;
using Backend.Exceptions;
using Backend.Models;
using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Backend.Services.Materialization;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Tests;

public class MaterializationTypeMappingTests
{
    [Theory]
    [InlineData("int", "int")]
    [InlineData("bigint", "bigint")]
    [InlineData("decimal(18,2)", "decimal(18,2)")]
    [InlineData("nvarchar(50)", "nvarchar(50)")]
    [InlineData("nvarchar(max)", "nvarchar(max)")]
    [InlineData("datetime2", "datetime2")]
    [InlineData("uniqueidentifier", "uniqueidentifier")]
    public void MapColumnType_KnownSqlType_PassesThrough(string native, string expected)
    {
        Assert.Equal(expected, SqlMaterializationStore.MapColumnType(native));
    }

    [Theory]
    [InlineData("string")]
    [InlineData("number")]
    [InlineData("boolean")]
    [InlineData("object")]
    [InlineData("")]
    [InlineData(null)]
    public void MapColumnType_UnknownType_FallsBackToNvarcharMax(string? native)
    {
        // The REST provider reports JSON type names, and anything unrecognised must still be
        // landable rather than failing the whole materialisation.
        Assert.Equal("nvarchar(max)", SqlMaterializationStore.MapColumnType(native));
    }

    [Theory]
    [InlineData("varchar")]
    [InlineData("nvarchar")]
    public void MapColumnType_CharTypeWithNoLength_BecomesMax(string native)
    {
        // A bare varchar means length 1 in SQL Server, which would silently truncate every value.
        Assert.Equal($"{native}(max)", SqlMaterializationStore.MapColumnType(native));
    }
}

public class MaterializationServiceTests
{
    private class RecordingStore : IMaterializationStore
    {
        public List<string> Calls { get; } = new();
        public bool FailOnBulkLoad { get; set; }

        public string TableNameFor(int datasetId) => $"mat.Dataset_{datasetId}";

        public Task CreateStagingTableAsync(int datasetId, IReadOnlyList<ColumnDescriptor> columns, CancellationToken cancellationToken)
        {
            Calls.Add("create");
            return Task.CompletedTask;
        }

        public Task BulkLoadStagingAsync(int datasetId, QueryResult result, CancellationToken cancellationToken)
        {
            Calls.Add("load");
            return FailOnBulkLoad ? throw new InvalidOperationException("bulk load blew up") : Task.CompletedTask;
        }

        public Task SwapStagingIntoPlaceAsync(int datasetId, CancellationToken cancellationToken)
        {
            Calls.Add("swap");
            return Task.CompletedTask;
        }

        public Task DropAsync(int datasetId, CancellationToken cancellationToken) => Task.CompletedTask;

        public Task<IReadOnlyList<string>?> GetLiveColumnNamesAsync(int datasetId, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<string>?>(null);
    }

    private class StubDatasetService : IDatasetService
    {
        public int? LastRowLimit { get; private set; }

        public Task<QueryResult> ExecuteRawAsync(int datasetId, int rowLimit, CancellationToken cancellationToken = default)
        {
            LastRowLimit = rowLimit;
            return Task.FromResult(new QueryResult(
                new List<ColumnDescriptor> { new("Id", "int") },
                new List<object?[]> { new object?[] { 1 }, new object?[] { 2 }, new object?[] { 3 } }));
        }

        public Task<DatasetSummary> CreateAsync(CreateDatasetRequest request) => throw new NotImplementedException();
        public Task<DatasetSummary> UpdateAsync(int id, UpdateDatasetRequest request) => throw new NotImplementedException();
        public Task<DatasetSummary> GetByIdAsync(int id) => throw new NotImplementedException();
        public Task<IReadOnlyList<DatasetSummary>> ListAsync(int connectionId) => throw new NotImplementedException();
        public Task<IReadOnlyList<ColumnDescriptor>> DiscoverColumnsAsync(int datasetId) => throw new NotImplementedException();
        public Task<QueryResult> ExecuteAsync(int datasetId, bool refresh = false) => throw new NotImplementedException();
        public Task DeleteAsync(int id) => throw new NotImplementedException();
        public Task<DatasetSummary> PromoteAsync(int id, string name) => throw new NotImplementedException();
    }

    private static (MaterializationService Service, ReportingDbContext Context, RecordingStore Store, StubDatasetService Datasets)
        CreateService(DatasetStorageMode storageMode = DatasetStorageMode.Import)
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();
        context.Datasets.Add(new Dataset
        {
            Id = 1,
            DataSourceConnectionId = 1,
            Name = "Ds",
            Mode = DatasetMode.StoredProcedure,
            Definition = "{}",
            StorageMode = storageMode,
            Columns = "[]",
            CreatedAtUtc = DateTime.UtcNow,
            UpdatedAtUtc = DateTime.UtcNow
        });
        context.SaveChanges();

        var store = new RecordingStore();
        var datasets = new StubDatasetService();
        return (new MaterializationService(context, datasets, store), context, store, datasets);
    }

    [Fact]
    public async Task MaterializeAsync_CreatesLoadsAndSwapsInThatOrder()
    {
        var (service, _, store, _) = CreateService();

        await service.MaterializeAsync(1);

        Assert.Equal(new[] { "create", "load", "swap" }, store.Calls);
    }

    [Fact]
    public async Task MaterializeAsync_RecordsRowCountAndTimestamp()
    {
        var (service, context, _, _) = CreateService();

        var result = await service.MaterializeAsync(1);

        var dataset = context.Datasets.Single();
        Assert.Equal(3, result.RowCount);
        Assert.Equal(3, dataset.MaterializedRowCount);
        Assert.NotNull(dataset.LastMaterializedAtUtc);
        Assert.Equal("mat.Dataset_1", dataset.MaterializedTableName);
        Assert.Null(dataset.LastMaterializeError);
    }

    [Fact]
    public async Task MaterializeAsync_IgnoresTheRequestPathRowLimit()
    {
        // Rows aren't serialised to a browser here, so the cap that exists for that must not apply.
        var (service, _, _, datasets) = CreateService();

        await service.MaterializeAsync(1);

        Assert.Equal(int.MaxValue, datasets.LastRowLimit);
    }

    [Fact]
    public async Task MaterializeAsync_WhenLoadFails_RecordsTheErrorAndLeavesThePreviousCopyInPlace()
    {
        var (service, context, store, _) = CreateService();
        await service.MaterializeAsync(1);
        var firstStamp = context.Datasets.Single().LastMaterializedAtUtc;

        store.FailOnBulkLoad = true;
        await Assert.ThrowsAsync<InvalidOperationException>(() => service.MaterializeAsync(1));

        var dataset = context.Datasets.Single();
        Assert.Equal("bulk load blew up", dataset.LastMaterializeError);
        Assert.Equal(firstStamp, dataset.LastMaterializedAtUtc);
        Assert.Equal("mat.Dataset_1", dataset.MaterializedTableName);
    }

    [Fact]
    public async Task MaterializeAsync_OnADirectQueryDataset_IsRejected()
    {
        var (service, _, _, _) = CreateService(DatasetStorageMode.DirectQuery);

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.MaterializeAsync(1));
    }

    [Fact]
    public async Task MaterializeAsync_UnknownDataset_ThrowsNotFound()
    {
        var (service, _, _, _) = CreateService();

        await Assert.ThrowsAsync<NotFoundException>(() => service.MaterializeAsync(999));
    }

    [Fact]
    public async Task EnsureMaterializedAsync_WhenAlreadyMaterialized_DoesNothing()
    {
        var (service, _, store, _) = CreateService();
        await service.MaterializeAsync(1);
        store.Calls.Clear();

        await service.EnsureMaterializedAsync(1);

        Assert.Empty(store.Calls);
    }

    [Fact]
    public async Task EnsureMaterializedAsync_WhenNeverMaterialized_Materializes()
    {
        var (service, _, store, _) = CreateService();

        await service.EnsureMaterializedAsync(1);

        Assert.Equal(new[] { "create", "load", "swap" }, store.Calls);
    }

    [Fact]
    public async Task EnsureMaterializedAsync_OnADirectQueryDataset_DoesNothing()
    {
        var (service, _, store, _) = CreateService(DatasetStorageMode.DirectQuery);

        await service.EnsureMaterializedAsync(1);

        Assert.Empty(store.Calls);
    }
}
