using Backend.Models;

namespace Backend.Services.Widgets;

public record WidgetSummary(
    int Id,
    WidgetType Type,
    int X,
    int Y,
    int W,
    int H,
    string Title,
    string? Content,
    WidgetBindingSummary? Binding);

public record WidgetBindingSummary(string? CategoryField, IReadOnlyList<string> ValueFields, string FormatOptions);
