namespace Backend.Services.Reports;

public record ReportSummary(
    int Id,
    string Name,
    string Description,
    int? DatasetId,
    bool IsActive,
    DateTime? LastViewedAtUtc,
    int ViewCount,
    // Last with a default so the existing positional call sites keep compiling; the JSON body
    // binds by name, so the wire shape is unaffected by the position.
    int WorkspaceId = Backend.Models.Report.DefaultWorkspaceId);
