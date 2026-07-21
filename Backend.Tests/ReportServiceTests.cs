using Backend.Data;
using Backend.Models;
using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Backend.Services.ReportPages;
using Backend.Services.Reports;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Tests;

public class ReportServiceTests
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
            throw new NotImplementedException();

        public Task<QueryResult> ExecuteQueryAsync(DataSourceConnection connection, Dataset dataset, int rowLimit, CancellationToken cancellationToken) =>
            throw new NotImplementedException();
    }

    private static (IReportService Service, ReportingDbContext Context) CreateService(string databaseName)
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

        var datasetService = new DatasetService(context, new PassThroughCredentialProtector(), new List<IDataSourceProvider> { new StubSqlServerProvider() });
        var reportPageService = new ReportPageService(context);
        var service = new ReportService(context, datasetService, reportPageService);
        return (service, context);
    }

    [Fact]
    public async Task CreateAsync_CreatesTheReportAndItsFirstPage()
    {
        var (service, context) = CreateService(Guid.NewGuid().ToString());

        var report = await service.CreateAsync(new CreateReportRequest("Churn", "Customers lost per quarter"));

        Assert.True(report.Id > 0);
        Assert.Null(report.DatasetId);
        var pages = await context.ReportPages.Where(p => p.ReportId == report.Id).ToListAsync();
        var page = Assert.Single(pages);
        Assert.Equal("Page 1", page.Name);
    }

    [Fact]
    public async Task GetByIdAsync_NotFound_Throws()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.GetByIdAsync(999));
    }

    [Fact]
    public async Task RenameAsync_UpdatesName()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var report = await service.CreateAsync(new CreateReportRequest("Old Name", ""));

        var renamed = await service.RenameAsync(report.Id, new RenameReportRequest("New Name"));

        Assert.Equal("New Name", renamed.Name);
    }

    [Fact]
    public async Task SetDatasetAsync_FirstTime_CreatesAnUnsavedDatasetAndLinksIt()
    {
        var (service, context) = CreateService(Guid.NewGuid().ToString());
        var report = await service.CreateAsync(new CreateReportRequest("Churn", ""));

        var updated = await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 1\"}", null));

        Assert.NotNull(updated.DatasetId);
        var dataset = await context.Datasets.FirstAsync(d => d.Id == updated.DatasetId);
        Assert.False(dataset.IsSaved);
    }

    [Fact]
    public async Task SetDatasetAsync_CalledAgain_DeletesThePreviousUnsavedDataset()
    {
        var (service, context) = CreateService(Guid.NewGuid().ToString());
        var report = await service.CreateAsync(new CreateReportRequest("Churn", ""));
        var first = await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 1\"}", null));
        var firstDatasetId = first.DatasetId!.Value;

        await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 2\"}", null));

        Assert.Equal(0, await context.Datasets.CountAsync(d => d.Id == firstDatasetId));
    }

    [Fact]
    public async Task SetDatasetAsync_CalledAgain_KeepsThePreviousDatasetIfItWasPromoted()
    {
        var (service, context) = CreateService(Guid.NewGuid().ToString());
        var report = await service.CreateAsync(new CreateReportRequest("Churn", ""));
        var first = await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 1\"}", null));
        var firstDataset = await context.Datasets.FirstAsync(d => d.Id == first.DatasetId!.Value);
        firstDataset.IsSaved = true;
        await context.SaveChangesAsync();

        await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 2\"}", null));

        Assert.Equal(1, await context.Datasets.CountAsync(d => d.Id == firstDataset.Id));
    }

    [Fact]
    public async Task DeleteAsync_RemovesReportPagesWidgetsBindings_AndUnsavedDataset()
    {
        var (service, context) = CreateService(Guid.NewGuid().ToString());
        var report = await service.CreateAsync(new CreateReportRequest("Churn", ""));
        var updated = await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 1\"}", null));
        var page = await context.ReportPages.FirstAsync(p => p.ReportId == report.Id);
        var widget = new Widget { ReportPageId = page.Id, Type = WidgetType.Text, Title = "Note" };
        context.Widgets.Add(widget);
        await context.SaveChangesAsync();

        await service.DeleteAsync(report.Id);

        Assert.Equal(0, await context.Reports.CountAsync(r => r.Id == report.Id));
        Assert.Equal(0, await context.ReportPages.CountAsync(p => p.ReportId == report.Id));
        Assert.Equal(0, await context.Widgets.CountAsync(w => w.ReportPageId == page.Id));
        Assert.Equal(0, await context.Datasets.CountAsync(d => d.Id == updated.DatasetId));
    }

    [Fact]
    public async Task DeleteAsync_KeepsASavedDataset()
    {
        var (service, context) = CreateService(Guid.NewGuid().ToString());
        var report = await service.CreateAsync(new CreateReportRequest("Churn", ""));
        var updated = await service.SetDatasetAsync(report.Id, new SetReportDatasetRequest(1, DatasetMode.RawSql, "{\"sqlText\":\"select 1\"}", null));
        var dataset = await context.Datasets.FirstAsync(d => d.Id == updated.DatasetId);
        dataset.IsSaved = true;
        await context.SaveChangesAsync();

        await service.DeleteAsync(report.Id);

        Assert.Equal(1, await context.Datasets.CountAsync(d => d.Id == dataset.Id));
    }
}
