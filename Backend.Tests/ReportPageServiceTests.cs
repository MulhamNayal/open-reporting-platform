using Backend.Data;
using Backend.Models;
using Backend.Services.ReportPages;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Backend.Tests;

public class ReportPageServiceTests
{
    private static (IReportPageService Service, ReportingDbContext Context) CreateService(string databaseName)
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();

        var service = new ReportPageService(context);
        return (service, context);
    }

    [Fact]
    public async Task GetPagesAsync_ReportNotFound_Throws()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());

        await Assert.ThrowsAsync<InvalidOperationException>(() => service.GetPagesAsync(999));
    }

    [Fact]
    public async Task CreateAsync_FirstPageForAReport_DefaultsNameAndSortOrderZero()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());

        var page = await service.CreateAsync(1, new CreateReportPageRequest(null));

        Assert.Equal("Page 1", page.Name);
        Assert.Equal(0, page.SortOrder);
        Assert.Equal("{}", page.FilterState);
    }

    [Fact]
    public async Task CreateAsync_SecondPage_IncrementsSortOrderAndDefaultName()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        await service.CreateAsync(1, new CreateReportPageRequest(null));

        var second = await service.CreateAsync(1, new CreateReportPageRequest(null));

        Assert.Equal("Page 2", second.Name);
        Assert.Equal(1, second.SortOrder);
    }

    [Fact]
    public async Task CreateAsync_AfterDeletingAnEarlierPage_DoesNotReuseItsDefaultName()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var first = await service.CreateAsync(1, new CreateReportPageRequest(null));
        await service.CreateAsync(1, new CreateReportPageRequest(null));
        await service.DeleteAsync(1, first.Id);

        var third = await service.CreateAsync(1, new CreateReportPageRequest(null));

        Assert.Equal("Page 3", third.Name);
    }

    [Fact]
    public async Task CreateAsync_ExplicitName_IsUsedVerbatim()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());

        var page = await service.CreateAsync(1, new CreateReportPageRequest("Executive Summary"));

        Assert.Equal("Executive Summary", page.Name);
    }

    [Fact]
    public async Task UpdateAsync_RenamesAndSetsFilterState()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var page = await service.CreateAsync(1, new CreateReportPageRequest(null));

        var updated = await service.UpdateAsync(1, page.Id, new UpdateReportPageRequest("Renamed", null, "{\"Region\":[\"North\"]}"));

        Assert.Equal("Renamed", updated.Name);
        Assert.Equal("{\"Region\":[\"North\"]}", updated.FilterState);
    }

    [Fact]
    public async Task DeleteAsync_LastRemainingPage_ThrowsLastPageDeletionException()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var page = await service.CreateAsync(1, new CreateReportPageRequest(null));

        await Assert.ThrowsAsync<LastPageDeletionException>(() => service.DeleteAsync(1, page.Id));
    }

    [Fact]
    public async Task DeleteAsync_OneOfSeveralPages_RemovesItAndLeavesTheOthers()
    {
        var (service, _) = CreateService(Guid.NewGuid().ToString());
        var first = await service.CreateAsync(1, new CreateReportPageRequest(null));
        await service.CreateAsync(1, new CreateReportPageRequest(null));

        await service.DeleteAsync(1, first.Id);

        var remaining = await service.GetPagesAsync(1);
        Assert.Single(remaining);
    }

    [Fact]
    public async Task DeleteAsync_AlsoRemovesThatPagesWidgetsAndBindings()
    {
        var (service, context) = CreateService(Guid.NewGuid().ToString());
        var first = await service.CreateAsync(1, new CreateReportPageRequest(null));
        await service.CreateAsync(1, new CreateReportPageRequest(null));
        var widget = new Widget { ReportPageId = first.Id, Type = WidgetType.Text, Title = "Note", Content = "hi" };
        context.Widgets.Add(widget);
        await context.SaveChangesAsync();

        await service.DeleteAsync(1, first.Id);

        Assert.Equal(0, await context.Widgets.CountAsync(w => w.ReportPageId == first.Id));
    }
}
