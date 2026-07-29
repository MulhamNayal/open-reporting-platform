namespace Backend.Models;

public class Widget
{
    public int Id { get; set; }

    public int ReportPageId { get; set; }

    public WidgetType Type { get; set; }

    // null means "use the report's default dataset" (Report.DatasetId). No FK to Datasets:
    // widgets are delete-and-reinserted on every page save and datasets are independently
    // deletable, so a constraint here would break unrelated saves. Validated at save time.
    public int? DatasetId { get; set; }

    public int X { get; set; }

    public int Y { get; set; }

    public int W { get; set; }

    public int H { get; set; }

    public string Title { get; set; } = "";

    public string? Content { get; set; }

    public WidgetBinding? Binding { get; set; }
}
