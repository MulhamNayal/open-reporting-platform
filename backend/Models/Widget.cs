namespace Backend.Models;

public class Widget
{
    public int Id { get; set; }

    public int ReportPageId { get; set; }

    public WidgetType Type { get; set; }

    public int X { get; set; }

    public int Y { get; set; }

    public int W { get; set; }

    public int H { get; set; }

    public string Title { get; set; } = "";

    public string? Content { get; set; }

    public WidgetBinding? Binding { get; set; }
}
