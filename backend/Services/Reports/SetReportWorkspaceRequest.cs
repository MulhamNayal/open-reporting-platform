namespace Backend.Services.Reports;

/// <summary>Which workspace a report is filed in. Optional on create — omitting it uses the default.</summary>
public record SetReportWorkspaceRequest(int WorkspaceId);
