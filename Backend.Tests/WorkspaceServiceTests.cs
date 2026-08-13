using Backend.Data;
using Backend.Exceptions;
using Backend.Models;
using Backend.Services.Workspaces;
using Microsoft.EntityFrameworkCore;

namespace Backend.Tests;

public class WorkspaceServiceTests
{
    // EnsureCreated applies the model's HasData, so the default workspace and three demo reports
    // are already present. Each test below asserts on exact counts and ordering, so it has to own
    // its data — the seed is removed rather than worked around.
    private static ReportingDbContext NewContext()
    {
        var context = new ReportingDbContext(new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);
        context.Database.EnsureCreated();

        context.Reports.RemoveRange(context.Reports);
        context.Workspaces.RemoveRange(context.Workspaces);
        context.SaveChanges();
        return context;
    }

    private static async Task<Workspace> AddWorkspaceAsync(ReportingDbContext context, string name, int sortOrder = 0, bool active = true)
    {
        var workspace = new Workspace { Name = name, SortOrder = sortOrder, IsActive = active };
        context.Workspaces.Add(workspace);
        await context.SaveChangesAsync();
        return workspace;
    }

    [Fact]
    public async Task CreateAsync_PlacesNewWorkspaceLast()
    {
        await using var context = NewContext();
        var service = new WorkspaceService(context);
        await AddWorkspaceAsync(context, "First", sortOrder: 7);

        var created = await service.CreateAsync(new CreateWorkspaceRequest("Second", null, null));

        Assert.Equal(8, created.SortOrder);
        Assert.Equal("", created.Description);
    }

    [Fact]
    public async Task CreateAsync_HonoursAnExplicitPosition()
    {
        await using var context = NewContext();
        var created = await new WorkspaceService(context).CreateAsync(new CreateWorkspaceRequest("W", "d", 3));

        Assert.Equal(3, created.SortOrder);
        Assert.Equal("d", created.Description);
    }

    // The rail is ordered, so the list has to come back ordered rather than by insertion.
    [Fact]
    public async Task GetAllAsync_OrdersBySortOrderThenName()
    {
        await using var context = NewContext();
        await AddWorkspaceAsync(context, "Zed", 0);
        await AddWorkspaceAsync(context, "Alpha", 0);
        await AddWorkspaceAsync(context, "Middle", -1);

        var all = await new WorkspaceService(context).GetAllAsync();

        Assert.Equal(new[] { "Middle", "Alpha", "Zed" }, all.Select(w => w.Name));
    }

    [Fact]
    public async Task GetAllAsync_HidesInactiveUnlessAsked()
    {
        await using var context = NewContext();
        await AddWorkspaceAsync(context, "Live");
        await AddWorkspaceAsync(context, "Archived", active: false);
        var service = new WorkspaceService(context);

        Assert.Single(await service.GetAllAsync());
        Assert.Equal(2, (await service.GetAllAsync(includeInactive: true)).Count);
    }

    [Fact]
    public async Task GetAllAsync_CountsTheReportsInEachWorkspace()
    {
        await using var context = NewContext();
        var a = await AddWorkspaceAsync(context, "A", 0);
        var b = await AddWorkspaceAsync(context, "B", 1);
        context.Reports.Add(new Report { Name = "r1", WorkspaceId = a.Id });
        context.Reports.Add(new Report { Name = "r2", WorkspaceId = a.Id });
        context.Reports.Add(new Report { Name = "r3", WorkspaceId = b.Id });
        await context.SaveChangesAsync();

        var all = await new WorkspaceService(context).GetAllAsync();

        Assert.Equal(2, all.Single(w => w.Name == "A").ReportCount);
        Assert.Equal(1, all.Single(w => w.Name == "B").ReportCount);
    }

    [Fact]
    public async Task UpdateAsync_NullFieldsLeaveTheExistingValues()
    {
        await using var context = NewContext();
        var w = await AddWorkspaceAsync(context, "Original", 4);
        var service = new WorkspaceService(context);

        var updated = await service.UpdateAsync(w.Id, new UpdateWorkspaceRequest(null, null, null, null));

        Assert.Equal("Original", updated.Name);
        Assert.Equal(4, updated.SortOrder);
        Assert.True(updated.IsActive);
    }

    [Fact]
    public async Task UpdateAsync_AppliesWhatWasProvided()
    {
        await using var context = NewContext();
        var w = await AddWorkspaceAsync(context, "Original", 4);

        var updated = await new WorkspaceService(context)
            .UpdateAsync(w.Id, new UpdateWorkspaceRequest("Renamed", "why", 1, false));

        Assert.Equal("Renamed", updated.Name);
        Assert.Equal("why", updated.Description);
        Assert.Equal(1, updated.SortOrder);
        Assert.False(updated.IsActive);
    }

    // Deleting a workspace that still holds reports would orphan them.
    [Fact]
    public async Task DeleteAsync_WithReports_Throws()
    {
        await using var context = NewContext();
        var keep = await AddWorkspaceAsync(context, "Keep", 0);
        var full = await AddWorkspaceAsync(context, "Full", 1);
        context.Reports.Add(new Report { Name = "r", WorkspaceId = full.Id });
        await context.SaveChangesAsync();

        var ex = await Assert.ThrowsAsync<WorkspaceNotEmptyException>(
            () => new WorkspaceService(context).DeleteAsync(full.Id));
        Assert.Contains("1 report", ex.Message);
        Assert.NotNull(await context.Workspaces.FindAsync(keep.Id));
    }

    // Same reasoning as a report's last page: a new report needs somewhere to go.
    [Fact]
    public async Task DeleteAsync_TheOnlyWorkspace_Throws()
    {
        await using var context = NewContext();
        var only = await AddWorkspaceAsync(context, "Only");

        await Assert.ThrowsAsync<WorkspaceNotEmptyException>(
            () => new WorkspaceService(context).DeleteAsync(only.Id));
    }

    [Fact]
    public async Task DeleteAsync_EmptyAndNotTheLast_Removes()
    {
        await using var context = NewContext();
        await AddWorkspaceAsync(context, "Keep", 0);
        var spare = await AddWorkspaceAsync(context, "Spare", 1);

        await new WorkspaceService(context).DeleteAsync(spare.Id);

        Assert.Null(await context.Workspaces.FindAsync(spare.Id));
    }

    [Fact]
    public async Task GetByIdAsync_Unknown_ThrowsNotFound()
    {
        await using var context = NewContext();
        await Assert.ThrowsAsync<NotFoundException>(() => new WorkspaceService(context).GetByIdAsync(4242));
    }
}
