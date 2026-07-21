namespace Backend.Services.ReportPages;

public record ReportPageSummary(int Id, int ReportId, string Name, int SortOrder, string FilterState);
