using Backend.Controllers;
using Backend.Data;
using Backend.Services.ReportPages;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Tests;

public class ReportPagesControllerTests
{
    private static ReportPagesController CreateController(string databaseName)
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();

        return new ReportPagesController(new ReportPageService(context));
    }

    [Fact]
    public async Task Create_ValidRequest_Returns201()
    {
        var controller = CreateController(Guid.NewGuid().ToString());

        var result = await controller.Create(1, new CreateReportPageRequest("Overview"));

        Assert.IsType<CreatedResult>(result.Result);
    }
}
