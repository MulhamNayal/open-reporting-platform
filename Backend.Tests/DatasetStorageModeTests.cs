using System.Text.Json;
using Backend.Data;
using Backend.Models;
using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Tests;

public class DatasetStorageModeTests
{
    private class PassThroughCredentialProtector : ICredentialProtector
    {
        public string Protect(string plaintext) => $"encrypted:{plaintext}";
        public string Unprotect(string protectedText) => protectedText.Replace("encrypted:", "");
    }

    // Derives from the concrete provider, not the interface: DatasetService casts to
    // SqlServerProvider for column discovery, so only the virtual members can be stubbed.
    private class StubProvider : SqlServerProvider
    {
        public override Task<IReadOnlyList<ColumnDescriptor>> DiscoverRawSqlColumnsAsync(
            DataSourceConnection connection, string sqlText, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<ColumnDescriptor>>(new List<ColumnDescriptor> { new("Id", "int") });

        public override Task<IReadOnlyList<ColumnDescriptor>> DiscoverStoredProcedureColumnsAsync(
            DataSourceConnection connection, string routineName,
            IReadOnlyList<StoredProcedureParameter> parameters, CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<ColumnDescriptor>>(new List<ColumnDescriptor> { new("Id", "int") });
    }

    private static IDatasetService CreateService()
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();
        context.DataSourceConnections.Add(new DataSourceConnection
        {
            Id = 1,
            Name = "Test SQL Source",
            Type = DataSourceType.SqlServer,
            Host = "localhost",
            DatabaseName = "TestDb",
            EncryptedCredentials = "encrypted:{}",
            CreatedAtUtc = DateTime.UtcNow
        });
        context.SaveChanges();

        return new DatasetService(context, new PassThroughCredentialProtector(),
            new List<IDataSourceProvider> { new StubProvider() });
    }

    // RawSql rather than TableQuery: only the RawSql and stored-procedure discovery paths are
    // virtual on SqlServerProvider, so they're the two a stub can intercept.
    private static string RawSqlJson() =>
        JsonSerializer.Serialize(new RawSqlDefinition("SELECT Id FROM Reports"));

    [Fact]
    public async Task CreateAsync_RawSqlWithNoStorageMode_DefaultsToDirectQuery()
    {
        var service = CreateService();

        var created = await service.CreateAsync(new CreateDatasetRequest(
            1, "Ds", null, DatasetMode.RawSql, RawSqlJson(), 100));

        Assert.Equal(DatasetStorageMode.DirectQuery, created.StorageMode);
    }

    [Fact]
    public async Task CreateAsync_RawSqlRequestingImport_IsAllowed()
    {
        var service = CreateService();

        var created = await service.CreateAsync(new CreateDatasetRequest(
            1, "Ds", null, DatasetMode.RawSql, RawSqlJson(), 100,
            IsSaved: true, StorageMode: DatasetStorageMode.Import));

        Assert.Equal(DatasetStorageMode.Import, created.StorageMode);
    }

    [Fact]
    public async Task CreateAsync_StoredProcedureWithNoStorageMode_DefaultsToDirectQuery()
    {
        // Not Import: switching a dataset to Import is the author's decision, and DirectQuery is
        // how a procedure-backed dataset behaved before this setting existed.
        var service = CreateService();
        var definition = JsonSerializer.Serialize(
            new StoredProcedureDefinition("dbo.Thing", new List<StoredProcedureParameter>()));

        var created = await service.CreateAsync(new CreateDatasetRequest(
            1, "Ds", null, DatasetMode.StoredProcedure, definition, 100));

        Assert.Equal(DatasetStorageMode.DirectQuery, created.StorageMode);
    }

    [Fact]
    public async Task CreateAsync_StoredProcedureRequestingImport_IsAllowed()
    {
        var service = CreateService();
        var definition = JsonSerializer.Serialize(
            new StoredProcedureDefinition("dbo.Thing", new List<StoredProcedureParameter>()));

        var created = await service.CreateAsync(new CreateDatasetRequest(
            1, "Ds", null, DatasetMode.StoredProcedure, definition, 100,
            IsSaved: true, StorageMode: DatasetStorageMode.Import));

        Assert.Equal(DatasetStorageMode.Import, created.StorageMode);
    }

    [Fact]
    public async Task CreateAsync_StoredProcedureRequestingDirectQuery_IsAllowed()
    {
        // Legitimate for a small result that must be current — it just can't push filtering or
        // paging to the source, which CanPushDownQueries reports.
        var service = CreateService();
        var definition = JsonSerializer.Serialize(
            new StoredProcedureDefinition("dbo.Thing", new List<StoredProcedureParameter>()));

        var created = await service.CreateAsync(new CreateDatasetRequest(
            1, "Ds", null, DatasetMode.StoredProcedure, definition, 100,
            IsSaved: true, StorageMode: DatasetStorageMode.DirectQuery));

        Assert.Equal(DatasetStorageMode.DirectQuery, created.StorageMode);
    }

    [Theory]
    // Materialised datasets are a table, so everything can be pushed down regardless of source.
    [InlineData(DatasetMode.StoredProcedure, DatasetStorageMode.Import, true)]
    [InlineData(DatasetMode.RestQuery, DatasetStorageMode.Import, true)]
    // Live, but wrappable in a derived table.
    [InlineData(DatasetMode.RawSql, DatasetStorageMode.DirectQuery, true)]
    // Live and not wrappable — SELECT * FROM (EXEC ...) isn't valid SQL, so the row cap applies
    // and the work happens in memory.
    [InlineData(DatasetMode.StoredProcedure, DatasetStorageMode.DirectQuery, false)]
    [InlineData(DatasetMode.RestQuery, DatasetStorageMode.DirectQuery, false)]
    // Buildable in principle; excluded only because its SQL builder lives in the provider.
    [InlineData(DatasetMode.TableQuery, DatasetStorageMode.DirectQuery, false)]
    public void CanPushDownQueries_ReflectsWhetherTheSourceCanBeFilteredAtSource(
        DatasetMode mode, DatasetStorageMode storageMode, bool expected)
    {
        Assert.Equal(expected, DatasetService.CanPushDownQueries(mode, storageMode));
    }

    [Fact]
    public async Task UpdateAsync_WithoutStorageMode_KeepsTheExistingOne()
    {
        var service = CreateService();
        var created = await service.CreateAsync(new CreateDatasetRequest(
            1, "Ds", null, DatasetMode.RawSql, RawSqlJson(), 100,
            IsSaved: true, StorageMode: DatasetStorageMode.Import));

        var updated = await service.UpdateAsync(created.Id, new UpdateDatasetRequest(
            "Renamed", null, DatasetMode.RawSql, RawSqlJson(), 100));

        Assert.Equal(DatasetStorageMode.Import, updated.StorageMode);
    }

    [Fact]
    public async Task UpdateAsync_SwitchingToDirectQuery_IsAllowedForRawSql()
    {
        var service = CreateService();
        var created = await service.CreateAsync(new CreateDatasetRequest(
            1, "Ds", null, DatasetMode.RawSql, RawSqlJson(), 100,
            IsSaved: true, StorageMode: DatasetStorageMode.Import));

        var updated = await service.UpdateAsync(created.Id, new UpdateDatasetRequest(
            "Ds", null, DatasetMode.RawSql, RawSqlJson(), 100, DatasetStorageMode.DirectQuery));

        Assert.Equal(DatasetStorageMode.DirectQuery, updated.StorageMode);
    }

    [Fact]
    public async Task CreateAsync_NewDataset_HasNoMaterializationState()
    {
        var service = CreateService();

        var created = await service.CreateAsync(new CreateDatasetRequest(
            1, "Ds", null, DatasetMode.RawSql, RawSqlJson(), 100));

        Assert.Null(created.LastMaterializedAtUtc);
        Assert.Null(created.MaterializedRowCount);
        Assert.Null(created.LastMaterializeError);
    }
}
