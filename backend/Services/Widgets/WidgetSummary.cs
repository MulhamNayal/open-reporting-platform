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
    int? DatasetId,
    WidgetBindingSummary? Binding);

// Aggregations is aligned by index with ValueFields; null/short means "None" for the rest.
public record WidgetBindingSummary(
    string? CategoryField,
    IReadOnlyList<string> ValueFields,
    IReadOnlyList<string>? Aggregations,
    string FormatOptions);
