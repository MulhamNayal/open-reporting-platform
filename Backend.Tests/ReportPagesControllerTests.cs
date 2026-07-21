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
    public async Task GetPages_ReportNotFound_Returns404()
    {
        var controller = CreateController(Guid.NewGuid().ToString());

        var result = await controller.GetPages(999);

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    [Fact]
    public async Task Create_ValidRequest_Returns201()
    {
        var controller = CreateController(Guid.NewGuid().ToString());

        var result = await controller.Create(1, new CreateReportPageRequest("Overview"));

        Assert.IsType<CreatedResult>(result.Result);
    }

    [Fact]
    public async Task Delete_LastPage_Returns409()
    {
        var controller = CreateController(Guid.NewGuid().ToString());
        var created = await controller.Create(1, new CreateReportPageRequest(null));
        var page = (ReportPageSummary)((CreatedResult)created.Result!).Value!;

        var result = await controller.Delete(1, page.Id);

        var conflict = Assert.IsType<ConflictObjectResult>(result);
        Assert.Equal("A report needs at least one page.", conflict.Value);
    }

    [Fact]
    public async Task Delete_NotFoundPage_Returns404()
    {
        var controller = CreateController(Guid.NewGuid().ToString());

        var result = await controller.Delete(1, 999);

        Assert.IsType<NotFoundObjectResult>(result);
    }
}
