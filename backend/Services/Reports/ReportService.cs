using Backend.Data;
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

    public async Task<IReadOnlyList<ReportSummary>> GetAllAsync()
    {
        var reports = await _context.Reports.ToListAsync();
        return reports.Select(ToSummary).ToList();
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
        await _context.SaveChangesAsync();
        return ToSummary(report);
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
            throw new InvalidOperationException($"No report found with id {id}.");
        }

        return report;
    }

    private static ReportSummary ToSummary(Report report) =>
        new(report.Id, report.Name, report.Description, report.DatasetId);
}
