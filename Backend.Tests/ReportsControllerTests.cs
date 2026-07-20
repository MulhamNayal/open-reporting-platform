using Backend.Controllers;
using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Tests;

public class ReportsControllerTests
{
    [Fact]
    public void GetAll_ReturnsOkWithSeededReports()
    {
        var controller = new ReportsController(new InMemoryReportRepository());

        var result = controller.GetAll();

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var reports = Assert.IsAssignableFrom<IEnumerable<Report>>(ok.Value);
        Assert.NotEmpty(reports);
    }

    [Fact]
    public void Create_BlankName_Returns400()
    {
        var controller = new ReportsController(new InMemoryReportRepository());

        var result = controller.Create(new CreateReportRequest("   ", "whatever"));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public void Create_NullName_Returns400()
    {
        var controller = new ReportsController(new InMemoryReportRepository());

        var result = controller.Create(new CreateReportRequest(null, null));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public void Create_ValidInput_Returns201WithTheReport()
    {
        var repo = new InMemoryReportRepository();
        var controller = new ReportsController(repo);

        var result = controller.Create(new CreateReportRequest("Churn", "Customers lost per quarter"));

        var created = Assert.IsType<CreatedResult>(result.Result);
        var report = Assert.IsType<Report>(created.Value);
        Assert.Equal("Churn", report.Name);
        Assert.Contains(repo.GetAll(), r => r.Id == report.Id);
    }
}
