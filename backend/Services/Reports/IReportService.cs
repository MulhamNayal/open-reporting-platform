namespace Backend.Services.Reports;

public interface IReportService
{
    Task<IReadOnlyList<ReportSummary>> GetAllAsync();

    Task<ReportSummary> GetByIdAsync(int id);

    Task<ReportSummary> CreateAsync(CreateReportRequest request);

    Task<ReportSummary> RenameAsync(int id, RenameReportRequest request);

    Task DeleteAsync(int id);

    Task<ReportSummary> SetDatasetAsync(int id, SetReportDatasetRequest request);
}
