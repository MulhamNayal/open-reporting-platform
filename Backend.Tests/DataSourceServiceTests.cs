using Backend.Data;
using Backend.Models;
using Backend.Services.DataSources;
using Microsoft.EntityFrameworkCore;

namespace Backend.Tests;

public class DataSourceServiceTests
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
            Task.FromResult(new SchemaDescriptor(new List<TableDescriptor>()));
    }

    private static (IDataSourceService Service, ReportingDbContext Context) CreateService(string databaseName)
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();

        var providers = new List<IDataSourceProvider> { new StubSqlServerProvider() };
        var service = new DataSourceService(context, new PassThroughCredentialProtector(), providers);
        return (service, context);
    }

    [Fact]
    public async Task CreateAsync_PersistsConnectionWithEncryptedCredentials()
    {
        var (service, context) = CreateService(Guid.NewGuid().ToString());
        var request = new CreateDataSourceConnectionRequest(
            "Main SQL",
            DataSourceType.SqlServer,
            "localhost\\SQLEXPRESS",
            "OpenReportingPlatform",
            """{"username":"sa","password":"secret"}""");

        var summary = await service.CreateAsync(request);

        var stored = await context.DataSourceConnections.FirstAsync(c => c.Id == summary.Id);
        Assert.Equal("encrypted:{\"username\":\"sa\",\"password\":\"secret\"}", stored.EncryptedCredentials);
        Assert.NotEqual(default, stored.CreatedAtUtc);
    }

    [Fact]
    public async Task ListAsync_NeverExposesEncryptedCredentials()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        await service.CreateAsync(new CreateDataSourceConnectionRequest(
            "Main SQL",
            DataSourceType.SqlServer,
            "localhost\\SQLEXPRESS",
            "OpenReportingPlatform",
            """{"username":"sa","password":"secret"}"""));

        var summaries = await service.ListAsync();

        Assert.Single(summaries);
        var summaryType = typeof(DataSourceConnectionSummary);
        Assert.DoesNotContain(summaryType.GetProperties(), p => p.Name == "EncryptedCredentials");
    }

    [Fact]
    public async Task ListAsync_ReturnsCreatedConnectionsWithExpectedFields()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        await service.CreateAsync(new CreateDataSourceConnectionRequest(
            "Main SQL",
            DataSourceType.SqlServer,
            "localhost\\SQLEXPRESS",
            "OpenReportingPlatform",
            """{"username":"sa","password":"secret"}"""));

        var summaries = await service.ListAsync();

        var summary = Assert.Single(summaries);
        Assert.Equal("Main SQL", summary.Name);
        Assert.Equal(DataSourceType.SqlServer, summary.Type);
        Assert.Equal("localhost\\SQLEXPRESS", summary.Host);
        Assert.Equal("OpenReportingPlatform", summary.DatabaseName);
    }

    [Fact]
    public async Task TestAsync_ResolvesProviderByTypeAndDelegatesToIt()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var created = await service.CreateAsync(new CreateDataSourceConnectionRequest(
            "Main SQL",
            DataSourceType.SqlServer,
            "localhost\\SQLEXPRESS",
            "OpenReportingPlatform",
            """{"username":"sa","password":"secret"}"""));

        var result = await service.TestAsync(created.Id);

        Assert.True(result.Success);
    }

    [Fact]
    public async Task DiscoverSchemaAsync_ResolvesProviderByTypeAndDelegatesToIt()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var created = await service.CreateAsync(new CreateDataSourceConnectionRequest(
            "Main SQL",
            DataSourceType.SqlServer,
            "localhost\\SQLEXPRESS",
            "OpenReportingPlatform",
            """{"username":"sa","password":"secret"}"""));

        var schema = await service.DiscoverSchemaAsync(created.Id);

        Assert.Empty(schema.Tables);
    }
}
