using Backend.Models;

namespace Backend.Services.Widgets;

public record SaveWidgetsRequest(IReadOnlyList<SaveWidgetRequest> Widgets);

public record SaveWidgetRequest(
    WidgetType Type,
    int X,
    int Y,
    int W,
    int H,
    string Title,
    string? Content,
    int? DatasetId,
    SaveWidgetBindingRequest? Binding);

// Aggregations is last with a default so the existing positional call sites keep compiling;
// the JSON body binds by name, so wire order is unaffected.
public record SaveWidgetBindingRequest(
    string? CategoryField,
    IReadOnlyList<string> ValueFields,
    string? FormatOptions,
    IReadOnlyList<string>? Aggregations = null);
