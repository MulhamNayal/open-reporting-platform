using Backend.Data;
using Backend.Models;
using Backend.Services.Widgets;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Tests;

public class WidgetServiceTests
{
    private class AlwaysValidBindingValidator : IWidgetBindingValidator
    {
        public WidgetBindingValidationResult Validate(WidgetType type, SaveWidgetBindingRequest? binding) =>
            WidgetBindingValidationResult.Success();
    }

    private static (IWidgetService Service, ReportingDbContext Context) CreateService(string databaseName)
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();
        context.ReportPages.Add(new ReportPage { Id = 1, ReportId = 1, Name = "Page 1", SortOrder = 0, FilterState = "{}" });
        context.SaveChanges();

        var service = new WidgetService(context, new WidgetBindingValidator());
        return (service, context);
    }

    private static (IWidgetService Service, ReportingDbContext Context) CreateServiceWithValidator(string databaseName, IWidgetBindingValidator validator)
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();
        context.ReportPages.Add(new ReportPage { Id = 1, ReportId = 1, Name = "Page 1", SortOrder = 0, FilterState = "{}" });
        context.SaveChanges();

        var service = new WidgetService(context, validator);
        return (service, context);
    }

    [Fact]
    public async Task GetWidgetsAsync_ReportPageNotFound_Throws()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.GetWidgetsAsync(999));
    }

    [Fact]
    public async Task GetWidgetsAsync_ReportPageWithNoWidgets_ReturnsEmptyList()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());

        var widgets = await service.GetWidgetsAsync(1);

        Assert.Empty(widgets);
    }

    [Fact]
    public async Task SaveWidgetsAsync_ReportPageNotFound_Throws()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var request = new SaveWidgetsRequest(new List<SaveWidgetRequest>());

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.SaveWidgetsAsync(999, request));
    }

    [Fact]
    public async Task SaveWidgetsAsync_InvalidBinding_ThrowsWidgetValidationException()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var badWidget = new SaveWidgetRequest(
            WidgetType.Kpi, 0, 0, 4, 3, "Bad Kpi", null,
            new SaveWidgetBindingRequest("Region", new List<string> { "Revenue" }, null));
        var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { badWidget });

        await Assert.ThrowsAsync<WidgetValidationException>(() => service.SaveWidgetsAsync(1, request));
    }

    [Fact]
    public async Task SaveWidgetsAsync_MixedBatchWithInvalidLast_ThrowsAndPersistsNothing()
    {
        var (service, context) = CreateService(Guid.NewGuid().ToString());
        var validWidgetOne = new SaveWidgetRequest(WidgetType.Text, 0, 0, 4, 2, "Valid Widget", "content", null);
        var validWidgetTwo = new SaveWidgetRequest(WidgetType.Text, 4, 0, 4, 2, "Another Valid Widget", "content", null);
        var badWidget = new SaveWidgetRequest(
            WidgetType.Kpi, 0, 2, 4, 3, "Bad Kpi", null,
            new SaveWidgetBindingRequest("Region", new List<string> { "Revenue" }, null));
        var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { validWidgetOne, validWidgetTwo, badWidget });

        await Assert.ThrowsAsync<WidgetValidationException>(() => service.SaveWidgetsAsync(1, request));

        Assert.Equal(0, await context.Widgets.CountAsync());
        Assert.Equal(0, await context.WidgetBindings.CountAsync());
    }

    [Fact]
    public async Task SaveWidgetsAsync_PersistsWidgetsWithBindings()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var barWidget = new SaveWidgetRequest(
            WidgetType.Bar, 0, 0, 4, 3, "Revenue by Month", null,
            new SaveWidgetBindingRequest("Month", new List<string> { "Revenue" }, null));
        var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { barWidget });

        var saved = await service.SaveWidgetsAsync(1, request);

        var widget = Assert.Single(saved);
        Assert.True(widget.Id > 0);
        Assert.Equal("Revenue by Month", widget.Title);
        Assert.NotNull(widget.Binding);
        Assert.Equal("Month", widget.Binding!.CategoryField);
        Assert.Equal(new List<string> { "Revenue" }, widget.Binding.ValueFields);
        Assert.Equal("{}", widget.Binding.FormatOptions);
    }

    [Fact]
    public async Task SaveWidgetsAsync_BindingWithFormatOptions_PersistsThemVerbatim()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var barWidget = new SaveWidgetRequest(
            WidgetType.Bar, 0, 0, 4, 3, "Revenue by Month", null,
            new SaveWidgetBindingRequest("Month", new List<string> { "Revenue" }, "{\"showLegend\":false}"));
        var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { barWidget });

        var saved = await service.SaveWidgetsAsync(1, request);

        Assert.Equal("{\"showLegend\":false}", saved[0].Binding!.FormatOptions);
    }

    [Fact]
    public async Task SaveWidgetsAsync_TextWidgetWithSubmittedBinding_RejectedByValidator()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var textWidget = new SaveWidgetRequest(
            WidgetType.Text, 0, 0, 4, 2, "A note", "Hello",
            new SaveWidgetBindingRequest(null, new List<string> { "Anything" }, null));
        var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { textWidget });

        await Assert.ThrowsAsync<WidgetValidationException>(() => service.SaveWidgetsAsync(1, request));
    }

    [Fact]
    public async Task SaveWidgetsAsync_TextWidgetWithSubmittedBinding_StrippedAtPersistenceEvenIfValidatorAllowsIt()
    {
        var (service, _) = CreateServiceWithValidator(Guid.NewGuid().ToString(), new AlwaysValidBindingValidator());
        var textWidget = new SaveWidgetRequest(
            WidgetType.Text, 0, 0, 4, 2, "A note", "Hello",
            new SaveWidgetBindingRequest(null, new List<string> { "Anything" }, null));
        var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { textWidget });

        var saved = await service.SaveWidgetsAsync(1, request);

        var widget = Assert.Single(saved);
        Assert.Null(widget.Binding);
    }

    [Fact]
    public async Task SaveWidgetsAsync_ReplacesEntireExistingSetInOneCall()
    {
        var (service, context) = CreateService(Guid.NewGuid().ToString());
        var firstRequest = new SaveWidgetsRequest(new List<SaveWidgetRequest>
        {
            new(WidgetType.Kpi, 0, 0, 2, 2, "Widget A", null, new SaveWidgetBindingRequest(null, new List<string> { "Revenue" }, null)),
            new(WidgetType.Text, 2, 0, 2, 2, "Widget B", "note", null)
        });
        await service.SaveWidgetsAsync(1, firstRequest);

        var secondRequest = new SaveWidgetsRequest(new List<SaveWidgetRequest>
        {
            new(WidgetType.Text, 0, 0, 4, 2, "Only Widget", "replaced everything", null)
        });
        var saved = await service.SaveWidgetsAsync(1, secondRequest);

        Assert.Single(saved);
        Assert.Equal("Only Widget", saved[0].Title);
        Assert.Equal(1, await context.Widgets.CountAsync());
        Assert.Equal(0, await context.WidgetBindings.CountAsync());
    }

    [Fact]
    public async Task SaveWidgetsAsync_TableWidgetWithEmptyValueFields_Persists()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var tableWidget = new SaveWidgetRequest(
            WidgetType.Table, 0, 0, 6, 4, "All Columns", null,
            new SaveWidgetBindingRequest(null, new List<string>(), null));
        var request = new SaveWidgetsRequest(new List<SaveWidgetRequest> { tableWidget });

        var saved = await service.SaveWidgetsAsync(1, request);

        Assert.Empty(saved[0].Binding!.ValueFields);
    }
}
