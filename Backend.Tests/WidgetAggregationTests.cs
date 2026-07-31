using Backend.Data;
using Backend.Models;
using Backend.Services.Widgets;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Tests;

public class WidgetAggregationTests
{
    private static (WidgetService Service, ReportingDbContext Context) CreateService()
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();

        // Reports 1-3 already exist: EnsureCreated applies the InitialCreate migration's seed data.
        context.ReportPages.Add(new ReportPage { Id = 1, ReportId = 1, Name = "Page 1", SortOrder = 0, FilterState = "{}" });
        context.SaveChanges();

        return (new WidgetService(context, new WidgetBindingValidator()), context);
    }

    private static SaveWidgetRequest Widget(SaveWidgetBindingRequest binding) =>
        new(WidgetType.Bar, 0, 0, 4, 3, "W", null, null, binding);

    [Fact]
    public async Task SaveWidgets_WithAggregations_RoundTripsThem()
    {
        var (service, _) = CreateService();

        var saved = await service.SaveWidgetsAsync(1, new SaveWidgetsRequest(new[]
        {
            Widget(new SaveWidgetBindingRequest("Source", new[] { "Amount", "Agent" }, null,
                new[] { "Sum", "CountDistinct" }))
        }));

        Assert.Equal(new[] { "Sum", "CountDistinct" }, saved[0].Binding!.Aggregations);
    }

    [Fact]
    public async Task SaveWidgets_WithoutAggregations_StoresNullSoExistingWidgetsAreUnchanged()
    {
        var (service, context) = CreateService();

        var saved = await service.SaveWidgetsAsync(1, new SaveWidgetsRequest(new[]
        {
            Widget(new SaveWidgetBindingRequest("Source", new[] { "Amount" }, null))
        }));

        Assert.Null(saved[0].Binding!.Aggregations);
        Assert.Null(context.WidgetBindings.Single().Aggregations);
    }

    [Fact]
    public async Task SaveWidgets_WithEmptyAggregations_IsTreatedAsNone()
    {
        var (service, context) = CreateService();

        await service.SaveWidgetsAsync(1, new SaveWidgetsRequest(new[]
        {
            Widget(new SaveWidgetBindingRequest("Source", new[] { "Amount" }, null, Array.Empty<string>()))
        }));

        Assert.Null(context.WidgetBindings.Single().Aggregations);
    }
}
