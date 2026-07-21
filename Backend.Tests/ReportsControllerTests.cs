using Backend.Controllers;
using Backend.Data;
using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Backend.Services.ReportPages;
using Backend.Services.Reports;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Tests;

public class ReportsControllerTests
{
    private class NoOpCredentialProtector : ICredentialProtector
    {
        public string Protect(string plaintext) => plaintext;
        public string Unprotect(string protectedText) => protectedText;
    }

    private static ReportsController CreateController(string databaseName)
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();

        var datasetService = new DatasetService(context, new NoOpCredentialProtector(), new List<IDataSourceProvider>());
        var reportPageService = new ReportPageService(context);
        var service = new ReportService(context, datasetService, reportPageService);
        return new ReportsController(service);
    }

    [Fact]
    public async Task GetAll_ReturnsOkWithSeededReports()
    {
        var controller = CreateController(Guid.NewGuid().ToString());

        var result = await controller.GetAll();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var reports = Assert.IsAssignableFrom<IEnumerable<ReportSummary>>(ok.Value);
        Assert.NotEmpty(reports);
    }

    [Fact]
    public async Task GetById_NotFound_Returns404()
    {
        var controller = CreateController(Guid.NewGuid().ToString());

        var result = await controller.GetById(999);

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    [Fact]
    public async Task Create_BlankName_Returns400()
    {
        var controller = CreateController(Guid.NewGuid().ToString());

        var result = await controller.Create(new CreateReportRequest("   ", "whatever"));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task Create_NullName_Returns400()
    {
        var controller = CreateController(Guid.NewGuid().ToString());

        var result = await controller.Create(new CreateReportRequest(null, null));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task Create_ValidInput_Returns201WithTheReport()
    {
        var controller = CreateController(Guid.NewGuid().ToString());

        var result = await controller.Create(new CreateReportRequest("Churn", "Customers lost per quarter"));

        var created = Assert.IsType<CreatedResult>(result.Result);
        var report = Assert.IsType<ReportSummary>(created.Value);
        Assert.Equal("Churn", report.Name);
        Assert.Null(report.DatasetId);
    }

    [Fact]
    public async Task Rename_BlankName_Returns400()
    {
        var controller = CreateController(Guid.NewGuid().ToString());
        var created = await controller.Create(new CreateReportRequest("Churn", ""));
        var report = (ReportSummary)((CreatedResult)created.Result!).Value!;

        var result = await controller.Rename(report.Id, new RenameReportRequest("   "));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task Delete_ThenGetById_Returns404()
    {
        var controller = CreateController(Guid.NewGuid().ToString());
        var created = await controller.Create(new CreateReportRequest("Churn", ""));
        var report = (ReportSummary)((CreatedResult)created.Result!).Value!;

        await controller.Delete(report.Id);
        var result = await controller.GetById(report.Id);

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }
}
