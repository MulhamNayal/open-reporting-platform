using System.Text.RegularExpressions;
using Backend.Data;
using Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services.ReportPages;

public class ReportPageService : IReportPageService
{
    private readonly ReportingDbContext _context;

    public ReportPageService(ReportingDbContext context)
    {
        _context = context;
    }

    public async Task<IReadOnlyList<ReportPageSummary>> GetPagesAsync(int reportId)
    {
        await EnsureReportExistsAsync(reportId);

        var pages = await _context.ReportPages
            .Where(p => p.ReportId == reportId)
            .OrderBy(p => p.SortOrder)
            .ToListAsync();

        return pages.Select(ToSummary).ToList();
    }

    public async Task<ReportPageSummary> CreateAsync(int reportId, CreateReportPageRequest request)
    {
        await EnsureReportExistsAsync(reportId);

        var existing = await _context.ReportPages.Where(p => p.ReportId == reportId).ToListAsync();
        var sortOrder = existing.Count == 0 ? 0 : existing.Max(p => p.SortOrder) + 1;
        var nextPageNumber = existing.Count == 0 ? 1 : existing.Max(p => ExtractPageNumber(p.Name)) + 1;
        var name = string.IsNullOrWhiteSpace(request.Name) ? $"Page {nextPageNumber}" : request.Name!;

        var page = new ReportPage { ReportId = reportId, Name = name, SortOrder = sortOrder, FilterState = "{}" };
        _context.ReportPages.Add(page);
        await _context.SaveChangesAsync();

        return ToSummary(page);
    }

    public async Task<ReportPageSummary> UpdateAsync(int reportId, int pageId, UpdateReportPageRequest request)
    {
        await EnsureReportExistsAsync(reportId);
        var page = await GetPageEntityAsync(reportId, pageId);

        if (request.Name != null)
        {
            page.Name = request.Name;
        }

        if (request.SortOrder.HasValue)
        {
            page.SortOrder = request.SortOrder.Value;
        }

        if (request.FilterState != null)
        {
            page.FilterState = request.FilterState;
        }

        await _context.SaveChangesAsync();
        return ToSummary(page);
    }

    public async Task DeleteAsync(int reportId, int pageId)
    {
        await EnsureReportExistsAsync(reportId);
        var page = await GetPageEntityAsync(reportId, pageId);

        var remainingCount = await _context.ReportPages.CountAsync(p => p.ReportId == reportId);
        if (remainingCount <= 1)
        {
            throw new LastPageDeletionException("A report needs at least one page.");
        }

        var widgetIds = await _context.Widgets.Where(w => w.ReportPageId == pageId).Select(w => w.Id).ToListAsync();
        var bindings = await _context.WidgetBindings.Where(b => widgetIds.Contains(b.WidgetId)).ToListAsync();
        var widgets = await _context.Widgets.Where(w => w.ReportPageId == pageId).ToListAsync();

        _context.WidgetBindings.RemoveRange(bindings);
        _context.Widgets.RemoveRange(widgets);
        _context.ReportPages.Remove(page);
        await _context.SaveChangesAsync();
    }

    private async Task EnsureReportExistsAsync(int reportId)
    {
        var exists = await _context.Reports.AnyAsync(r => r.Id == reportId);
        if (!exists)
        {
            throw new InvalidOperationException($"No report found with id {reportId}.");
        }
    }

    private async Task<ReportPage> GetPageEntityAsync(int reportId, int pageId)
    {
        var page = await _context.ReportPages.FirstOrDefaultAsync(p => p.Id == pageId && p.ReportId == reportId);
        if (page is null)
        {
            throw new InvalidOperationException($"No page found with id {pageId} on report {reportId}.");
        }

        return page;
    }

    private static readonly Regex PageNumberPattern = new(@"^Page (\d+)$", RegexOptions.Compiled);

    private static int ExtractPageNumber(string name)
    {
        var match = PageNumberPattern.Match(name);
        return match.Success ? int.Parse(match.Groups[1].Value) : 0;
    }

    private static ReportPageSummary ToSummary(ReportPage page) =>
        new(page.Id, page.ReportId, page.Name, page.SortOrder, page.FilterState);
}
