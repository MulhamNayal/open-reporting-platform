namespace Backend.Models;

public class WidgetBinding
{
    public int Id { get; set; }

    public int WidgetId { get; set; }

    public int DatasetId { get; set; }

    public string? CategoryField { get; set; }

    public string ValueFields { get; set; } = "[]";
}
