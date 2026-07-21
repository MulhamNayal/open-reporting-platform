using Backend.Controllers;
using Backend.Data;
using Backend.Models;
using Backend.Services.Widgets;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Tests;

public class WidgetsControllerTests
{
    private static WidgetsController CreateController(string databaseName)
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();
        context.ReportPages.Add(new ReportPage { Id = 1, ReportId = 1, Name = "Page 1", SortOrder = 0, FilterState = "{}" });
        context.SaveChanges();

        var service = new WidgetService(context, new WidgetBindingValidator());
        return new WidgetsController(service);
    }

    [Fact]
    public async Task GetWidgets_ReportPageNotFound_Returns404()
    {
        var controller = CreateController(Guid.NewGuid().ToString());

        var result = await controller.GetWidgets(999);

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    [Fact]
    public async Task GetWidgets_ReportPageWithNoWidgets_ReturnsEmptyOk()
    {
        var controller = CreateController(Guid.NewGuid().ToString());

        var result = await controller.GetWidgets(1);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var widgets = Assert.IsAssignableFrom<IReadOnlyList<WidgetSummary>>(ok.Value);
        Assert.Empty(widgets);
    }

    [Fact]
    public async Task SaveWidgets_InvalidBinding_Returns400()
    {
        var controller = CreateController(Guid.NewGuid().ToString());
        var badWidget = new SaveWidgetRequest(
            WidgetType.Pie, 0, 0, 4, 3, "Bad Pie", null,
            new SaveWidgetBindingRequest("Region", new List<string> { "A", "B" }, null));
        var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { badWidget });

        var result = await controller.SaveWidgets(1, request);

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task SaveWidgets_ReportPageNotFound_Returns404()
    {
        var controller = CreateController(Guid.NewGuid().ToString());
        var request = new SaveWidgetsRequest(new List<SaveWidgetRequest>());

        var result = await controller.SaveWidgets(999, request);

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    [Fact]
    public async Task SaveWidgets_ValidRequest_Returns200WithSavedWidgets()
    {
        var controller = CreateController(Guid.NewGuid().ToString());
        var textWidget = new SaveWidgetRequest(WidgetType.Text, 0, 0, 4, 2, "A note", "hello", null);
        var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { textWidget });

        var result = await controller.SaveWidgets(1, request);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var widgets = Assert.IsAssignableFrom<IReadOnlyList<WidgetSummary>>(ok.Value);
        var widget = Assert.Single(widgets);
        Assert.Equal("A note", widget.Title);
        Assert.Null(widget.Binding);
    }

    [Fact]
    public async Task GetWidgets_AfterSave_ReturnsPersistedWidgets()
    {
        var controller = CreateController(Guid.NewGuid().ToString());
        var kpiWidget = new SaveWidgetRequest(
            WidgetType.Kpi, 0, 0, 2, 2, "Total Revenue", null,
            new SaveWidgetBindingRequest(null, new List<string> { "Revenue" }, null));
        await controller.SaveWidgets(1, new SaveWidgetsRequest(new List<SaveWidgetRequest> { kpiWidget }));

        var result = await controller.GetWidgets(1);

        var ok = Assert.IsType<OkObjectResult>(result.Result);
        var widgets = Assert.IsAssignableFrom<IReadOnlyList<WidgetSummary>>(ok.Value);
        Assert.Single(widgets);
    }
}
