using Backend.Data;
using Backend.Models;
using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Backend.Services.ReportPages;
using Backend.Services.Reports;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Tests;

public class ReportActiveAndUsageTests
{
    private class NoOpCredentialProtector : ICredentialProtector
    {
        public string Protect(string plaintext) => plaintext;
        public string Unprotect(string protectedText) => protectedText;
    }

    private static (IReportService Service, ReportingDbContext Context) CreateService()
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();

        var datasetService = new DatasetService(context, new NoOpCredentialProtector(), new List<IDataSourceProvider>());
        var pageService = new ReportPageService(context);
        return (new ReportService(context, datasetService, pageService), context);
    }

    [Fact]
    public async Task CreateAsync_NewReport_IsActiveAndUnviewed()
    {
        var (service, _) = CreateService();

        var created = await service.CreateAsync(new CreateReportRequest("R", "d"));

        Assert.True(created.IsActive);
        Assert.Equal(0, created.ViewCount);
        Assert.Null(created.LastViewedAtUtc);
    }

    [Fact]
    public async Task GetAllAsync_ByDefault_HidesDeactivatedReports()
    {
        var (service, _) = CreateService();
        var created = await service.CreateAsync(new CreateReportRequest("R", "d"));

        await service.SetActiveAsync(created.Id, new SetReportActiveRequest(false));

        Assert.DoesNotContain(await service.GetAllAsync(), r => r.Id == created.Id);
    }

    [Fact]
    public async Task GetAllAsync_WithIncludeInactive_ReturnsDeactivatedReports()
    {
        var (service, _) = CreateService();
        var created = await service.CreateAsync(new CreateReportRequest("R", "d"));
        await service.SetActiveAsync(created.Id, new SetReportActiveRequest(false));

        Assert.Contains(await service.GetAllAsync(includeInactive: true), r => r.Id == created.Id);
    }

    [Fact]
    public async Task SetActiveAsync_Reactivating_PutsItBackInTheDefaultList()
    {
        var (service, _) = CreateService();
        var created = await service.CreateAsync(new CreateReportRequest("R", "d"));
        await service.SetActiveAsync(created.Id, new SetReportActiveRequest(false));

        await service.SetActiveAsync(created.Id, new SetReportActiveRequest(true));

        Assert.Contains(await service.GetAllAsync(), r => r.Id == created.Id);
    }

    [Fact]
    public async Task RecordViewAsync_IncrementsCountAndStampsTime()
    {
        var (service, _) = CreateService();
        var created = await service.CreateAsync(new CreateReportRequest("R", "d"));

        await service.RecordViewAsync(created.Id);
        await service.RecordViewAsync(created.Id);

        var after = await service.GetByIdAsync(created.Id);
        Assert.Equal(2, after.ViewCount);
        Assert.NotNull(after.LastViewedAtUtc);
    }

    [Fact]
    public async Task GetByIdAsync_DoesNotCountAsAView()
    {
        // Opening the editor, or any internal lookup, must not inflate usage — otherwise the
        // numbers can't answer "is anyone actually using this?".
        var (service, _) = CreateService();
        var created = await service.CreateAsync(new CreateReportRequest("R", "d"));

        await service.GetByIdAsync(created.Id);

        Assert.Equal(0, (await service.GetByIdAsync(created.Id)).ViewCount);
    }
}
