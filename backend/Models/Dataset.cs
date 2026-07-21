namespace Backend.Models;

public class Dataset
{
    public int Id { get; set; }

    public int DataSourceConnectionId { get; set; }

    public string Name { get; set; } = "";

    public string? Description { get; set; }

    public DatasetMode Mode { get; set; }

    public string Definition { get; set; } = "";

    public int? RowLimit { get; set; }

    public string Columns { get; set; } = "[]";

    public DateTime CreatedAtUtc { get; set; }

    public DateTime UpdatedAtUtc { get; set; }
}
