namespace Backend.Services.ReportPages;

public interface IReportPageService
{
    Task<IReadOnlyList<ReportPageSummary>> GetPagesAsync(int reportId);

    Task<ReportPageSummary> CreateAsync(int reportId, CreateReportPageRequest request);

    Task<ReportPageSummary> UpdateAsync(int reportId, int pageId, UpdateReportPageRequest request);

    Task DeleteAsync(int reportId, int pageId);
}
