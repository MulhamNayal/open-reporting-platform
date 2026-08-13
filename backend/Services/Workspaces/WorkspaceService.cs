using Backend.Data;
using Backend.Exceptions;
using Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services.Workspaces;

public record WorkspaceSummary(int Id, string Name, string Description, int SortOrder, bool IsActive, int ReportCount);

public record CreateWorkspaceRequest(string? Name, string? Description, int? SortOrder);

/// <summary>Null leaves a field as it is, matching how a blank credential means "keep the stored one".</summary>
public record UpdateWorkspaceRequest(string? Name, string? Description, int? SortOrder, bool? IsActive);

public interface IWorkspaceService
{
    Task<IReadOnlyList<WorkspaceSummary>> GetAllAsync(bool includeInactive = false);

    Task<WorkspaceSummary> GetByIdAsync(int id);

    Task<WorkspaceSummary> CreateAsync(CreateWorkspaceRequest request);

    Task<WorkspaceSummary> UpdateAsync(int id, UpdateWorkspaceRequest request);

    Task DeleteAsync(int id);
}

public class WorkspaceService : IWorkspaceService
{
    private readonly ReportingDbContext _context;

    public WorkspaceService(ReportingDbContext context)
    {
        _context = context;
    }

    // Ordered by SortOrder then name so the rail is stable, and inactive ones drop out by default
    // for the same reason deactivated reports do — the point of archiving is to stop seeing them.
    public async Task<IReadOnlyList<WorkspaceSummary>> GetAllAsync(bool includeInactive = false)
    {
        var query = _context.Workspaces.AsQueryable();
        if (!includeInactive)
        {
            query = query.Where(w => w.IsActive);
        }

        var workspaces = await query.OrderBy(w => w.SortOrder).ThenBy(w => w.Name).ToListAsync();

        // One grouped count rather than a query per workspace — the rail shows every one of them.
        var counts = await _context.Reports
            .GroupBy(r => r.WorkspaceId)
            .Select(g => new { WorkspaceId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.WorkspaceId, x => x.Count);

        return workspaces
            .Select(w => ToSummary(w, counts.TryGetValue(w.Id, out var count) ? count : 0))
            .ToList();
    }

    public async Task<WorkspaceSummary> GetByIdAsync(int id)
    {
        var workspace = await GetEntityAsync(id);
        return ToSummary(workspace, await _context.Reports.CountAsync(r => r.WorkspaceId == id));
    }

    public async Task<WorkspaceSummary> CreateAsync(CreateWorkspaceRequest request)
    {
        // A new workspace lands at the end unless placed explicitly.
        var sortOrder = request.SortOrder
            ?? (await _context.Workspaces.AnyAsync() ? await _context.Workspaces.MaxAsync(w => w.SortOrder) + 1 : 0);

        var workspace = new Workspace
        {
            Name = request.Name!,
            Description = request.Description ?? "",
            SortOrder = sortOrder,
            IsActive = true,
            CreatedAtUtc = DateTime.UtcNow,
        };

        _context.Workspaces.Add(workspace);
        await _context.SaveChangesAsync();
        return ToSummary(workspace, 0);
    }

    public async Task<WorkspaceSummary> UpdateAsync(int id, UpdateWorkspaceRequest request)
    {
        var workspace = await GetEntityAsync(id);

        if (request.Name is not null)
        {
            workspace.Name = request.Name;
        }

        if (request.Description is not null)
        {
            workspace.Description = request.Description;
        }

        if (request.SortOrder.HasValue)
        {
            workspace.SortOrder = request.SortOrder.Value;
        }

        if (request.IsActive.HasValue)
        {
            workspace.IsActive = request.IsActive.Value;
        }

        await _context.SaveChangesAsync();
        return ToSummary(workspace, await _context.Reports.CountAsync(r => r.WorkspaceId == id));
    }

    public async Task DeleteAsync(int id)
    {
        var workspace = await GetEntityAsync(id);

        var reportCount = await _context.Reports.CountAsync(r => r.WorkspaceId == id);
        if (reportCount > 0)
        {
            throw new WorkspaceNotEmptyException(
                $"This workspace still holds {reportCount} report(s). Move or delete them first.");
        }

        // The last workspace can't go, for the same reason a report's last page can't: a new report
        // would have nowhere to be filed.
        if (await _context.Workspaces.CountAsync() <= 1)
        {
            throw new WorkspaceNotEmptyException(
                "This is the only workspace. A report has to be filed somewhere, so it can't be deleted.");
        }

        _context.Workspaces.Remove(workspace);
        await _context.SaveChangesAsync();
    }

    private async Task<Workspace> GetEntityAsync(int id)
    {
        var workspace = await _context.Workspaces.FirstOrDefaultAsync(w => w.Id == id);
        if (workspace is null)
        {
            throw new NotFoundException($"No workspace found with id {id}.");
        }

        return workspace;
    }

    private static WorkspaceSummary ToSummary(Workspace workspace, int reportCount) =>
        new(workspace.Id, workspace.Name, workspace.Description, workspace.SortOrder, workspace.IsActive, reportCount);
}
