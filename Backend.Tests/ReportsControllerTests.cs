using Backend.Controllers;
using Backend.Data;
using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Backend.Tests;

public class ReportsControllerTests
{
    private static IReportRepository CreateSeededRepository()
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();
        return new EfReportRepository(context);
    }

    [Fact]
    public void GetAll_ReturnsOkWithSeededReports()
    {
        var controller = new ReportsController(CreateSeededRepository());

        var result = controller.GetAll();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var reports = Assert.IsAssignableFrom<IEnumerable<Report>>(ok.Value);
        Assert.NotEmpty(reports);
    }

    [Fact]
    public void Create_BlankName_Returns400()
    {
        var controller = new ReportsController(CreateSeededRepository());

        var result = controller.Create(new CreateReportRequest("   ", "whatever"));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public void Create_NullName_Returns400()
    {
        var controller = new ReportsController(CreateSeededRepository());

        var result = controller.Create(new CreateReportRequest(null, null));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public void Create_ValidInput_Returns201WithTheReport()
    {
        var repo = CreateSeededRepository();
        var controller = new ReportsController(repo);

        var result = controller.Create(new CreateReportRequest("Churn", "Customers lost per quarter"));

        var created = Assert.IsType<CreatedResult>(result.Result);
        var report = Assert.IsType<Report>(created.Value);
        Assert.Equal("Churn", report.Name);
        Assert.Contains(repo.GetAll(), r => r.Id == report.Id);
    }
}
