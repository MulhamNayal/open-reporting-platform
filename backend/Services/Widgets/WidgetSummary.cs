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
    string FormatOptions,
    // Last with a default: every existing construction site is positional, and a widget without
    // measures must serialise exactly as it did before the column existed.
    IReadOnlyList<WidgetMeasureRequest>? Measures = null);
