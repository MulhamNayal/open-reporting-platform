using Backend.Data;
using Backend.Exceptions;
using Backend.Models;
using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Backend.Services.ReportPages;
using Backend.Services.Reports;
using Microsoft.EntityFrameworkCore;

namespace Backend.Tests;

public class ReportDuplicateTests
{
    // Only CreateAsync and DeleteAsync are reachable from DuplicateAsync. Persisting a real row
    // rather than returning a canned id keeps the "copy got its own dataset" assertion meaningful,
    // and avoids standing up a provider just to validate a definition this test never executes.
    private class StubDatasetService : IDatasetService
    {
        private readonly ReportingDbContext _context;

        public StubDatasetService(ReportingDbContext context) => _context = context;

        public async Task<DatasetSummary> CreateAsync(CreateDatasetRequest request)
        {
            var dataset = new Dataset
            {
                DataSourceConnectionId = request.DataSourceConnectionId,
                Name = request.Name,
                Mode = request.Mode,
                Definition = request.DefinitionJson,
                RowLimit = request.RowLimit,
                IsSaved = request.IsSaved,
                StorageMode = request.StorageMode ?? DatasetStorageMode.DirectQuery,
            };
            _context.Datasets.Add(dataset);
            await _context.SaveChangesAsync();

            return new DatasetSummary(dataset.Id, dataset.DataSourceConnectionId, dataset.Name, dataset.Description,
                dataset.Mode, dataset.Definition, dataset.RowLimit, dataset.IsSaved, new List<ColumnDescriptor>(),
                dataset.CreatedAtUtc, dataset.UpdatedAtUtc, dataset.StorageMode);
        }

        public async Task DeleteAsync(int id)
        {
            var dataset = await _context.Datasets.FirstOrDefaultAsync(d => d.Id == id);
            if (dataset is not null)
            {
                _context.Datasets.Remove(dataset);
                await _context.SaveChangesAsync();
            }
        }

        public Task<DatasetSummary> UpdateAsync(int id, UpdateDatasetRequest request) => throw new NotImplementedException();
        public Task<DatasetSummary> GetByIdAsync(int id) => throw new NotImplementedException();
        public Task<IReadOnlyList<DatasetSummary>> ListAsync(int connectionId) => throw new NotImplementedException();
        public Task<IReadOnlyList<ColumnDescriptor>> DiscoverColumnsAsync(int datasetId) => throw new NotImplementedException();
        public Task<QueryResult> ExecuteAsync(int datasetId, bool refresh = false) => throw new NotImplementedException();
        public Task<QueryResult> ExecuteRawAsync(int datasetId, int rowLimit, CancellationToken cancellationToken = default) => throw new NotImplementedException();
        public Task<DatasetSummary> PromoteAsync(int id, string name) => throw new NotImplementedException();
    }

    private static ReportingDbContext NewContext() =>
        new(new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options);

    private static ReportService NewService(ReportingDbContext context) =>
        new(context, new StubDatasetService(context), new ReportPageService(context));

    private static async Task<Report> SeedReportAsync(ReportingDbContext context)
    {
        var report = new Report { Name = "Sales", Description = "Quarterly", IsActive = true, ViewCount = 12, LastViewedAtUtc = DateTime.UtcNow };
        context.Reports.Add(report);
        await context.SaveChangesAsync();

        var page = new ReportPage { ReportId = report.Id, Name = "Overview", SortOrder = 0, FilterState = "{\"a\":1}" };
        context.ReportPages.Add(page);
        await context.SaveChangesAsync();

        context.Widgets.Add(new Widget
        {
            ReportPageId = page.Id,
            Type = WidgetType.Table,
            DatasetId = 77,
            X = 1, Y = 2, W = 6, H = 4,
            Title = "Units",
            Content = null,
            Binding = new WidgetBinding
            {
                CategoryField = "Month",
                ValueFields = "[\"NetPrice\"]",
                Aggregations = "[\"Sum\"]",
                FormatOptions = "{\"showTotals\":true}",
            },
        });
        await context.SaveChangesAsync();

        return report;
    }

    [Fact]
    public async Task DuplicateAsync_WithoutName_AppendsCopySuffix()
    {
        await using var context = NewContext();
        var report = await SeedReportAsync(context);

        var copy = await NewService(context).DuplicateAsync(report.Id, new DuplicateReportRequest(null));

        Assert.Equal("Sales (copy)", copy.Name);
        Assert.NotEqual(report.Id, copy.Id);
    }

    [Fact]
    public async Task DuplicateAsync_WithName_UsesProvidedName()
    {
        await using var context = NewContext();
        var report = await SeedReportAsync(context);

        var copy = await NewService(context).DuplicateAsync(report.Id, new DuplicateReportRequest("  Design test  "));

        Assert.Equal("Design test", copy.Name);
    }

    [Fact]
    public async Task DuplicateAsync_CopiesPagesWidgetsAndBindings()
    {
        await using var context = NewContext();
        var report = await SeedReportAsync(context);

        var copy = await NewService(context).DuplicateAsync(report.Id, new DuplicateReportRequest(null));

        var copiedPages = await context.ReportPages.Where(p => p.ReportId == copy.Id).ToListAsync();
        var page = Assert.Single(copiedPages);
        Assert.Equal("Overview", page.Name);
        Assert.Equal("{\"a\":1}", page.FilterState);

        var widget = Assert.Single(await context.Widgets.Include(w => w.Binding).Where(w => w.ReportPageId == page.Id).ToListAsync());
        Assert.Equal(WidgetType.Table, widget.Type);
        Assert.Equal(77, widget.DatasetId);
        Assert.Equal(6, widget.W);
        Assert.Equal("Units", widget.Title);
        Assert.NotNull(widget.Binding);
        Assert.Equal("Month", widget.Binding!.CategoryField);
        Assert.Equal("[\"NetPrice\"]", widget.Binding.ValueFields);
        Assert.Equal("[\"Sum\"]", widget.Binding.Aggregations);
        Assert.Equal("{\"showTotals\":true}", widget.Binding.FormatOptions);
    }

    [Fact]
    public async Task DuplicateAsync_LeavesOriginalIntact()
    {
        await using var context = NewContext();
        var report = await SeedReportAsync(context);

        await NewService(context).DuplicateAsync(report.Id, new DuplicateReportRequest(null));

        var originalPages = await context.ReportPages.Where(p => p.ReportId == report.Id).ToListAsync();
        Assert.Single(originalPages);
        Assert.Single(await context.Widgets.Where(w => w.ReportPageId == originalPages[0].Id).ToListAsync());
    }

    // The copy has genuinely never been opened — inheriting the source's counter would make the
    // usage column meaningless for deciding what is actually in use.
    [Fact]
    public async Task DuplicateAsync_DoesNotCarryOverViewStats()
    {
        await using var context = NewContext();
        var report = await SeedReportAsync(context);

        var copy = await NewService(context).DuplicateAsync(report.Id, new DuplicateReportRequest(null));

        Assert.Equal(0, copy.ViewCount);
        Assert.Null(copy.LastViewedAtUtc);
    }

    [Fact]
    public async Task DuplicateAsync_SharesSavedReportDataset()
    {
        await using var context = NewContext();
        var report = await SeedReportAsync(context);
        context.Datasets.Add(new Dataset { Id = 500, DataSourceConnectionId = 1, Mode = DatasetMode.RawSql, Definition = "{}", IsSaved = true });
        report.DatasetId = 500;
        await context.SaveChangesAsync();

        var copy = await NewService(context).DuplicateAsync(report.Id, new DuplicateReportRequest(null));

        Assert.Equal(500, copy.DatasetId);
    }

    // An unsaved dataset is owned by its report and deleted with it, so sharing one would mean
    // deleting either report broke the other.
    [Fact]
    public async Task DuplicateAsync_CopiesUnsavedReportDataset()
    {
        await using var context = NewContext();
        var report = await SeedReportAsync(context);
        context.Datasets.Add(new Dataset { Id = 501, DataSourceConnectionId = 1, Mode = DatasetMode.RawSql, Definition = "{}", IsSaved = false });
        report.DatasetId = 501;
        await context.SaveChangesAsync();

        var copy = await NewService(context).DuplicateAsync(report.Id, new DuplicateReportRequest(null));

        Assert.NotNull(copy.DatasetId);
        Assert.NotEqual(501, copy.DatasetId);
    }

    // Description is how a migrated report carries its link back to the Power BI original, so it
    // has to be editable after creation — but a rename must not wipe it.
    [Fact]
    public async Task RenameAsync_NullDescription_LeavesExistingDescription()
    {
        await using var context = NewContext();
        var report = await SeedReportAsync(context);

        var renamed = await NewService(context).RenameAsync(report.Id, new RenameReportRequest("Renamed"));

        Assert.Equal("Renamed", renamed.Name);
        Assert.Equal("Quarterly", renamed.Description);
    }

    [Fact]
    public async Task RenameAsync_WithDescription_UpdatesIt()
    {
        await using var context = NewContext();
        var report = await SeedReportAsync(context);

        var renamed = await NewService(context).RenameAsync(report.Id, new RenameReportRequest("Sales", "See https://app.powerbi.com/x"));

        Assert.Equal("See https://app.powerbi.com/x", renamed.Description);
    }

    [Fact]
    public async Task RenameAsync_EmptyDescription_ClearsIt()
    {
        await using var context = NewContext();
        var report = await SeedReportAsync(context);

        var renamed = await NewService(context).RenameAsync(report.Id, new RenameReportRequest("Sales", ""));

        Assert.Equal("", renamed.Description);
    }

    [Fact]
    public async Task DuplicateAsync_UnknownReport_ThrowsNotFound()
    {
        await using var context = NewContext();

        await Assert.ThrowsAsync<NotFoundException>(
            () => NewService(context).DuplicateAsync(9999, new DuplicateReportRequest(null)));
    }
}
