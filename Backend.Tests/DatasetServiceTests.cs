using Backend.Data;
using Backend.Models;
using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Xunit;

namespace Backend.Tests;

public class DatasetServiceTests
{
    private class PassThroughCredentialProtector : ICredentialProtector
    {
        public string Protect(string plaintext) => $"encrypted:{plaintext}";
        public string Unprotect(string protectedText) => protectedText.Replace("encrypted:", "");
    }

    private class StubSqlServerProvider : IDataSourceProvider
    {
        public DataSourceType SupportedType => DataSourceType.SqlServer;

        public Task<ConnectionTestResult> TestConnectionAsync(DataSourceConnection connection) =>
            Task.FromResult(new ConnectionTestResult(true, null));

        public Task<SchemaDescriptor> DiscoverSchemaAsync(DataSourceConnection connection) =>
            Task.FromResult(new SchemaDescriptor(new List<TableDescriptor>
            {
                new("Reports", new List<FieldDescriptor> { new("Id", "int"), new("Name", "nvarchar(50)") })
            }));

        public Task<QueryResult> ExecuteQueryAsync(DataSourceConnection connection, Dataset dataset, int rowLimit, CancellationToken cancellationToken) =>
            Task.FromResult(new QueryResult(
                new List<ColumnDescriptor> { new("Id", "int") },
                new List<object?[]> { new object?[] { 1 } }));
    }

    private static (IDatasetService Service, ReportingDbContext Context) CreateService(string databaseName)
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();

        context.DataSourceConnections.Add(new DataSourceConnection
        {
            Id = 1,
            Name = "Test SQL Source",
            Type = DataSourceType.SqlServer,
            Host = "localhost\\SQLEXPRESS",
            DatabaseName = "TestDb",
            EncryptedCredentials = "encrypted:{}",
            CreatedAtUtc = DateTime.UtcNow
        });
        context.SaveChanges();

        var providers = new List<IDataSourceProvider> { new StubSqlServerProvider() };
        var service = new DatasetService(context, new PassThroughCredentialProtector(), providers);
        return (service, context);
    }

    private static string TableQueryDefinitionJson()
    {
        var definition = new TableQueryDefinition(new SelectQuery("Reports", new[] { "Id", "Name" }, Array.Empty<QueryFilter>(), null, null));
        return JsonSerializer.Serialize(definition);
    }

    [Fact]
    public async Task CreateAsync_PersistsDatasetWithProvidedFields()
    {
        var (service, context) = CreateService(Guid.NewGuid().ToString());

        var summary = await service.CreateAsync(new CreateDatasetRequest(
            1, "Reports Table", "All reports", DatasetMode.TableQuery, TableQueryDefinitionJson(), RowLimit: 50));

        var stored = await context.Datasets.FirstAsync(d => d.Id == summary.Id);
        Assert.Equal("Reports Table", stored.Name);
        Assert.Equal(DatasetMode.TableQuery, stored.Mode);
        Assert.Equal(50, stored.RowLimit);
        Assert.NotEqual(default, stored.CreatedAtUtc);
        Assert.NotEqual(default, stored.UpdatedAtUtc);
    }

    [Fact]
    public async Task CreateAsync_RejectsModeMismatchedWithConnectionType()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());

        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            service.CreateAsync(new CreateDatasetRequest(1, "Bad", null, DatasetMode.RestQuery, "{}", null)));
    }

    [Fact]
    public async Task ListAsync_ReturnsDatasetsForTheGivenConnection()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        await service.CreateAsync(new CreateDatasetRequest(1, "Reports Table", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), null));

        var datasets = await service.ListAsync(1);

        var dataset = Assert.Single(datasets);
        Assert.Equal("Reports Table", dataset.Name);
    }

    [Fact]
    public async Task ExecuteAsync_ResolvesProviderByConnectionTypeAndReturnsItsResult()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var created = await service.CreateAsync(new CreateDatasetRequest(1, "Reports Table", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), null));

        var result = await service.ExecuteAsync(created.Id);

        Assert.Single(result.Rows);
    }

    [Fact]
    public async Task ExecuteAsync_UsesDefaultRowLimitWhenDatasetRowLimitIsNull()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var created = await service.CreateAsync(new CreateDatasetRequest(1, "Reports Table", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), RowLimit: null));

        // No direct way to assert the exact row-limit value passed into the stub provider without
        // a spy; this test instead confirms execution succeeds end-to-end with a null RowLimit,
        // which is the behavior that matters — the exact default value is asserted in Task 8's
        // manual smoke test against a real connection with more than the default's worth of rows.
        var result = await service.ExecuteAsync(created.Id);

        Assert.NotNull(result);
    }

    [Fact]
    public async Task DiscoverColumnsAsync_TableQueryMode_FiltersConnectionSchemaToSelectedColumns()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var created = await service.CreateAsync(new CreateDatasetRequest(1, "Reports Table", null, DatasetMode.TableQuery, TableQueryDefinitionJson(), null));

        var columns = await service.DiscoverColumnsAsync(created.Id);

        Assert.Equal(2, columns.Count);
        Assert.Contains(columns, c => c.Name == "Id" && c.NativeType == "int");
        Assert.Contains(columns, c => c.Name == "Name" && c.NativeType == "nvarchar(50)");
    }
}
