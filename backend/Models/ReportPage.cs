namespace Backend.Models;

public class ReportPage
{
    public int Id { get; set; }

    public int ReportId { get; set; }

    public string Name { get; set; } = "";

    public int SortOrder { get; set; }

    public string FilterState { get; set; } = "{}";
}
