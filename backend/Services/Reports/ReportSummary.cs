namespace Backend.Services.Reports;

public record ReportSummary(
    int Id,
    string Name,
    string Description,
    int? DatasetId,
    bool IsActive,
    DateTime? LastViewedAtUtc,
    int ViewCount);
