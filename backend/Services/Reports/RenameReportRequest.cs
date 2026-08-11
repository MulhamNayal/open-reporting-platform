namespace Backend.Services.Reports;

/// <summary>
/// Description is optional and null means "leave what's already there", matching how blank
/// credentials mean "keep the stored ones" on a connection update. Passing an empty string is
/// therefore the way to deliberately clear a description.
/// </summary>
public record RenameReportRequest(string? Name, string? Description = null);
