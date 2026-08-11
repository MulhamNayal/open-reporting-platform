using Backend.Data;
using Backend.Exceptions;
using Backend.Models;
using Backend.Services.Datasets;
using Backend.Services.ReportPages;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services.Reports;

public class ReportService : IReportService
{
    private readonly ReportingDbContext _context;
    private readonly IDatasetService _datasetService;
    private readonly IReportPageService _reportPageService;

    public ReportService(ReportingDbContext context, IDatasetService datasetService, IReportPageService reportPageService)
    {
        _context = context;
        _datasetService = datasetService;
        _reportPageService = reportPageService;
    }

    // includeInactive defaults to false so deactivated reports drop out of the list without
    // any caller changing — the point of archiving is that you stop seeing them.
    public async Task<IReadOnlyList<ReportSummary>> GetAllAsync(bool includeInactive = false)
    {
        var query = _context.Reports.AsQueryable();
        if (!includeInactive)
        {
            query = query.Where(r => r.IsActive);
        }

        var reports = await query.ToListAsync();
        return reports.Select(ToSummary).ToList();
    }

    public async Task<ReportSummary> SetActiveAsync(int id, SetReportActiveRequest request)
    {
        var report = await GetReportEntityAsync(id);
        report.IsActive = request.IsActive;
        await _context.SaveChangesAsync();
        return ToSummary(report);
    }

    // Called by the viewer, not by GetByIdAsync — otherwise opening the editor, or any
    // internal lookup, would inflate the count and make the usage data meaningless.
    public async Task RecordViewAsync(int id)
    {
        var report = await GetReportEntityAsync(id);
        report.ViewCount++;
        report.LastViewedAtUtc = DateTime.UtcNow;
        await _context.SaveChangesAsync();
    }

    public async Task<ReportSummary> GetByIdAsync(int id)
    {
        var report = await GetReportEntityAsync(id);
        return ToSummary(report);
    }

    public async Task<ReportSummary> CreateAsync(CreateReportRequest request)
    {
        var report = new Report { Name = request.Name!, Description = request.Description ?? "" };
        _context.Reports.Add(report);
        await _context.SaveChangesAsync();

        await _reportPageService.CreateAsync(report.Id, new CreateReportPageRequest(null));

        return ToSummary(report);
    }

    public async Task<ReportSummary> RenameAsync(int id, RenameReportRequest request)
    {
        var report = await GetReportEntityAsync(id);
        report.Name = request.Name!;
        if (request.Description is not null)
        {
            report.Description = request.Description;
        }

        await _context.SaveChangesAsync();
        return ToSummary(report);
    }

    // Deep-copies pages, widgets and bindings so the copy can be redesigned without touching the
    // original. View stats are deliberately not carried over — the copy has genuinely never been
    // opened, and inheriting a count would make the usage data meaningless.
    public async Task<ReportSummary> DuplicateAsync(int id, DuplicateReportRequest request)
    {
        var source = await GetReportEntityAsync(id);

        // A saved dataset is a shared, independently managed object, so the copy points at the
        // same one. An unsaved dataset belongs to its report — DeleteAsync removes it along with
        // the report — so the copy needs its own, or deleting either report would break the other.
        var datasetId = source.DatasetId;
        if (source.DatasetId.HasValue)
        {
            var dataset = await _context.Datasets.FirstOrDefaultAsync(d => d.Id == source.DatasetId.Value);
            if (dataset is not null && !dataset.IsSaved)
            {
                var copiedDataset = await _datasetService.CreateAsync(new CreateDatasetRequest(
                    dataset.DataSourceConnectionId, "", null, dataset.Mode, dataset.Definition,
                    dataset.RowLimit, IsSaved: false, dataset.StorageMode));
                datasetId = copiedDataset.Id;
            }
        }

        var name = string.IsNullOrWhiteSpace(request.Name) ? $"{source.Name} (copy)" : request.Name.Trim();
        var copy = new Report
        {
            Name = name,
            Description = source.Description,
            DatasetId = datasetId,
            IsActive = source.IsActive,
        };
        _context.Reports.Add(copy);
        await _context.SaveChangesAsync();

        var pages = await _context.ReportPages
            .Where(p => p.ReportId == id)
            .OrderBy(p => p.SortOrder)
            .ToListAsync();

        foreach (var page in pages)
        {
            var copiedPage = new ReportPage
            {
                ReportId = copy.Id,
                Name = page.Name,
                SortOrder = page.SortOrder,
                FilterState = page.FilterState,
            };
            _context.ReportPages.Add(copiedPage);
            await _context.SaveChangesAsync();

            // Include is required — lazy loading is off, so Binding would silently be null.
            var widgets = await _context.Widgets
                .Include(w => w.Binding)
                .Where(w => w.ReportPageId == page.Id)
                .ToListAsync();

            foreach (var widget in widgets)
            {
                var copiedWidget = new Widget
                {
                    ReportPageId = copiedPage.Id,
                    Type = widget.Type,
                    DatasetId = widget.DatasetId,
                    X = widget.X,
                    Y = widget.Y,
                    W = widget.W,
                    H = widget.H,
                    Title = widget.Title,
                    Content = widget.Content,
                };

                if (widget.Binding is not null)
                {
                    copiedWidget.Binding = new WidgetBinding
                    {
                        CategoryField = widget.Binding.CategoryField,
                        ValueFields = widget.Binding.ValueFields,
                        Aggregations = widget.Binding.Aggregations,
                        FormatOptions = widget.Binding.FormatOptions,
                    };
                }

                _context.Widgets.Add(copiedWidget);
            }

            await _context.SaveChangesAsync();
        }

        return ToSummary(copy);
    }

    public async Task<ReportSummary> SetDatasetAsync(int id, SetReportDatasetRequest request)
    {
        var report = await GetReportEntityAsync(id);
        var previousDatasetId = report.DatasetId;

        var created = await _datasetService.CreateAsync(new CreateDatasetRequest(
            request.DataSourceConnectionId, "", null, request.Mode, request.DefinitionJson, request.RowLimit, IsSaved: false));

        report.DatasetId = created.Id;
        await _context.SaveChangesAsync();

        if (previousDatasetId.HasValue && previousDatasetId.Value != created.Id)
        {
            var previous = await _context.Datasets.FirstOrDefaultAsync(d => d.Id == previousDatasetId.Value);
            if (previous != null && !previous.IsSaved)
            {
                await _datasetService.DeleteAsync(previous.Id);
            }
        }

        return ToSummary(report);
    }

    public async Task DeleteAsync(int id)
    {
        var report = await GetReportEntityAsync(id);

        var pageIds = await _context.ReportPages.Where(p => p.ReportId == id).Select(p => p.Id).ToListAsync();
        var widgetIds = await _context.Widgets.Where(w => pageIds.Contains(w.ReportPageId)).Select(w => w.Id).ToListAsync();
        var bindings = await _context.WidgetBindings.Where(b => widgetIds.Contains(b.WidgetId)).ToListAsync();
        var widgets = await _context.Widgets.Where(w => pageIds.Contains(w.ReportPageId)).ToListAsync();
        var pages = await _context.ReportPages.Where(p => p.ReportId == id).ToListAsync();

        _context.WidgetBindings.RemoveRange(bindings);
        _context.Widgets.RemoveRange(widgets);
        _context.ReportPages.RemoveRange(pages);

        var datasetId = report.DatasetId;
        _context.Reports.Remove(report);
        await _context.SaveChangesAsync();

        if (datasetId.HasValue)
        {
            var dataset = await _context.Datasets.FirstOrDefaultAsync(d => d.Id == datasetId.Value);
            if (dataset != null && !dataset.IsSaved)
            {
                await _datasetService.DeleteAsync(dataset.Id);
            }
        }
    }

    private async Task<Report> GetReportEntityAsync(int id)
    {
        var report = await _context.Reports.FirstOrDefaultAsync(r => r.Id == id);
        if (report is null)
        {
            throw new NotFoundException($"No report found with id {id}.");
        }

        return report;
    }

    private static ReportSummary ToSummary(Report report) =>
        new(report.Id, report.Name, report.Description, report.DatasetId,
            report.IsActive, report.LastViewedAtUtc, report.ViewCount);
}
