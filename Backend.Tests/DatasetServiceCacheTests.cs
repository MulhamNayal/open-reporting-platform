using System.Text.Json;
using Backend.Data;
using Backend.Models;
using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Xunit;

namespace Backend.Tests;

public class DatasetServiceCacheTests
{
    private class PassThroughCredentialProtector : ICredentialProtector
    {
        public string Protect(string plaintext) => $"encrypted:{plaintext}";
        public string Unprotect(string protectedText) => protectedText.Replace("encrypted:", "");
    }

    private class CountingProvider : IDataSourceProvider
    {
        public int ExecuteCount { get; private set; }

        public DataSourceType SupportedType => DataSourceType.SqlServer;

        public Task<ConnectionTestResult> TestConnectionAsync(DataSourceConnection connection) =>
            Task.FromResult(new ConnectionTestResult(true, null));

        public Task<SchemaDescriptor> DiscoverSchemaAsync(DataSourceConnection connection) =>
            Task.FromResult(new SchemaDescriptor(new List<TableDescriptor>
            {
                new("Reports", new List<FieldDescriptor> { new("Id", "int") })
            }));

        public Task<IReadOnlyList<RoutineDescriptor>> DiscoverRoutinesAsync(DataSourceConnection connection) =>
            Task.FromResult<IReadOnlyList<RoutineDescriptor>>(new List<RoutineDescriptor>());

        public Task<QueryResult> ExecuteQueryAsync(DataSourceConnection connection, Dataset dataset, int rowLimit, CancellationToken cancellationToken)
        {
            ExecuteCount++;
            return Task.FromResult(new QueryResult(
                new List<ColumnDescriptor> { new("Id", "int") },
                new List<object?[]> { new object?[] { ExecuteCount } }));
        }
    }

    private static (IDatasetService Service, CountingProvider Provider) CreateService(int ttlSeconds = DatasetCacheOptions.DefaultTtlSeconds)
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

        var provider = new CountingProvider();
        var cache = new MemoryDatasetResultCache(
            new MemoryCache(new MemoryCacheOptions()),
            Options.Create(new DatasetCacheOptions { TtlSeconds = ttlSeconds }));

        var service = new DatasetService(
            context, new PassThroughCredentialProtector(),
            new List<IDataSourceProvider> { provider }, cache);

        return (service, provider);
    }

    // TableQuery, not RawSql: RawSql column discovery casts the provider to the concrete
    // SqlServerProvider, so a stub can't satisfy it.
    private static string TableQueryDefinitionJson() =>
        JsonSerializer.Serialize(new TableQueryDefinition(
            new SelectQuery("Reports", new[] { "Id" }, Array.Empty<QueryFilter>(), null, null)));

    private static async Task<int> CreateDatasetAsync(IDatasetService service)
    {
        var created = await service.CreateAsync(new CreateDatasetRequest(
            1, "Ds", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), 100));
        return created.Id;
    }

    [Fact]
    public async Task ExecuteAsync_CalledTwice_HitsTheSourceOnlyOnce()
    {
        var (service, provider) = CreateService();
        var id = await CreateDatasetAsync(service);
        var before = provider.ExecuteCount;

        await service.ExecuteAsync(id);
        await service.ExecuteAsync(id);

        Assert.Equal(before + 1, provider.ExecuteCount);
    }

    [Fact]
    public async Task ExecuteAsync_WithRefresh_BypassesTheCache()
    {
        var (service, provider) = CreateService();
        var id = await CreateDatasetAsync(service);
        await service.ExecuteAsync(id);
        var afterFirst = provider.ExecuteCount;

        await service.ExecuteAsync(id, refresh: true);

        Assert.Equal(afterFirst + 1, provider.ExecuteCount);
    }

    [Fact]
    public async Task ExecuteAsync_AfterUpdate_DoesNotServeTheOldResult()
    {
        var (service, provider) = CreateService();
        var id = await CreateDatasetAsync(service);
        await service.ExecuteAsync(id);
        var afterFirst = provider.ExecuteCount;

        // Bumps DefinitionVersion, so the previous cache key can no longer be built.
        await service.UpdateAsync(id, new UpdateDatasetRequest(
            "Ds renamed", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), 100));
        await service.ExecuteAsync(id);

        Assert.True(provider.ExecuteCount > afterFirst);
    }

    [Fact]
    public async Task ExecuteAsync_WithCachingDisabled_AlwaysHitsTheSource()
    {
        var (service, provider) = CreateService(ttlSeconds: 0);
        var id = await CreateDatasetAsync(service);
        var before = provider.ExecuteCount;

        await service.ExecuteAsync(id);
        await service.ExecuteAsync(id);

        Assert.Equal(before + 2, provider.ExecuteCount);
    }
}
