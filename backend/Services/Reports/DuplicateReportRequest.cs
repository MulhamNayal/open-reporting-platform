namespace Backend.Services.Reports;

/// <summary>
/// Name is optional — omitting it yields "&lt;source name&gt; (copy)", which is what the
/// duplicate button in the reports list relies on.
/// </summary>
public record DuplicateReportRequest(string? Name);
