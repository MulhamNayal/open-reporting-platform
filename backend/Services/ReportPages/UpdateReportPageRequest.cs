namespace Backend.Services.ReportPages;

public record UpdateReportPageRequest(string? Name, int? SortOrder, string? FilterState);
