using System.Text.Json;
using Backend.Data;
using Backend.Models;
using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Backend.Services.Materialization;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Tests;

/// <summary>
/// A materialised table is a copy of a specific query's output. These pin down that it doesn't
/// outlive the definition that produced it.
/// </summary>
public class MaterializedTableLifecycleTests
{
    private class PassThroughCredentialProtector : ICredentialProtector
    {
        public string Protect(string plaintext) => $"encrypted:{plaintext}";
        public string Unprotect(string protectedText) => protectedText.Replace("encrypted:", "");
    }

    private class StubProvider : SqlServerProvider
    {
        public override Task<IReadOnlyList<ColumnDescriptor>> DiscoverRawSqlColumnsAsync(
            DataSourceConnection connection, string sqlText, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<ColumnDescriptor>>(new List<ColumnDescriptor> { new("Id", "int") });
    }

    private class RecordingStore : IMaterializationStore
    {
        public List<int> Dropped { get; } = new();

        public string TableNameFor(int datasetId) => $"mat.Dataset_{datasetId}";
        public Task CreateStagingTableAsync(int datasetId, IReadOnlyList<ColumnDescriptor> columns, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task BulkLoadStagingAsync(int datasetId, QueryResult result, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task SwapStagingIntoPlaceAsync(int datasetId, CancellationToken cancellationToken) => Task.CompletedTask;
        public Task<IReadOnlyList<string>?> GetLiveColumnNamesAsync(int datasetId, CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<string>?>(null);

        public Task DropAsync(int datasetId, CancellationToken cancellationToken)
        {
            Dropped.Add(datasetId);
            return Task.CompletedTask;
        }
    }

    private static (IDatasetService Service, ReportingDbContext Context, RecordingStore Store) CreateService()
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();
        context.DataSourceConnections.Add(new DataSourceConnection
        {
            Id = 1, Name = "Src", Type = DataSourceType.SqlServer, Host = "localhost",
            DatabaseName = "TestDb", EncryptedCredentials = "encrypted:{}", CreatedAtUtc = DateTime.UtcNow
        });
        context.SaveChanges();

        var store = new RecordingStore();
        var service = new DatasetService(context, new PassThroughCredentialProtector(),
            new List<IDataSourceProvider> { new StubProvider() }, null, store);
        return (service, context, store);
    }

    private static string Sql(string text) => JsonSerializer.Serialize(new RawSqlDefinition(text));

    private static async Task<int> CreateMaterializedAsync(IDatasetService service, ReportingDbContext context)
    {
        var created = await service.CreateAsync(new CreateDatasetRequest(
            1, "Ds", null, DatasetMode.RawSql, Sql("SELECT Id FROM A"), 100,
            IsSaved: true, StorageMode: DatasetStorageMode.Import));

        // Stand in for a completed materialisation.
        var dataset = context.Datasets.Single(d => d.Id == created.Id);
        dataset.MaterializedTableName = $"mat.Dataset_{created.Id}";
        dataset.LastMaterializedAtUtc = DateTime.UtcNow;
        dataset.MaterializedRowCount = 42;
        await context.SaveChangesAsync();

        return created.Id;
    }

    [Fact]
    public async Task UpdateAsync_ChangingTheDefinition_DropsTheMaterializedTable()
    {
        var (service, context, store) = CreateService();
        var id = await CreateMaterializedAsync(service, context);

        await service.UpdateAsync(id, new UpdateDatasetRequest(
            "Ds", null, DatasetMode.RawSql, Sql("SELECT Id FROM B"), 100));

        Assert.Contains(id, store.Dropped);
        var dataset = context.Datasets.Single();
        Assert.Null(dataset.MaterializedTableName);
        Assert.Null(dataset.LastMaterializedAtUtc);
        Assert.Null(dataset.MaterializedRowCount);
    }

    [Fact]
    public async Task UpdateAsync_RenamingOnly_KeepsTheMaterializedTable()
    {
        // Re-running a slow source query because someone fixed a typo in the name would be
        // gratuitous — the data is still exactly what the definition produces.
        var (service, context, store) = CreateService();
        var id = await CreateMaterializedAsync(service, context);

        await service.UpdateAsync(id, new UpdateDatasetRequest(
            "Renamed", "new description", DatasetMode.RawSql, Sql("SELECT Id FROM A"), 100));

        Assert.Empty(store.Dropped);
        Assert.NotNull(context.Datasets.Single().MaterializedTableName);
    }

    [Fact]
    public async Task UpdateAsync_SwitchingAwayFromImport_DropsTheOrphanedTable()
    {
        var (service, context, store) = CreateService();
        var id = await CreateMaterializedAsync(service, context);

        await service.UpdateAsync(id, new UpdateDatasetRequest(
            "Ds", null, DatasetMode.RawSql, Sql("SELECT Id FROM A"), 100, DatasetStorageMode.DirectQuery));

        Assert.Contains(id, store.Dropped);
        Assert.Null(context.Datasets.Single().MaterializedTableName);
    }

    [Fact]
    public async Task DeleteAsync_DropsTheMaterializedTable()
    {
        var (service, context, store) = CreateService();
        var id = await CreateMaterializedAsync(service, context);

        await service.DeleteAsync(id);

        Assert.Contains(id, store.Dropped);
    }

    [Fact]
    public async Task DeleteAsync_NeverMaterialized_DropsNothing()
    {
        var (service, _, store) = CreateService();
        var created = await service.CreateAsync(new CreateDatasetRequest(
            1, "Ds", null, DatasetMode.RawSql, Sql("SELECT Id FROM A"), 100));

        await service.DeleteAsync(created.Id);

        Assert.Empty(store.Dropped);
    }
}
