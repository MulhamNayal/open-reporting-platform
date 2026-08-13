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

// Aggregations and Measures are last with defaults so the existing positional call sites keep
// compiling; the JSON body binds by name, so wire order is unaffected.
public record SaveWidgetBindingRequest(
    string? CategoryField,
    IReadOnlyList<string> ValueFields,
    string? FormatOptions,
    IReadOnlyList<string>? Aggregations = null,
    IReadOnlyList<WidgetMeasureRequest>? Measures = null);

/// <summary>
/// A column computed from other columns. The expression is stored as written and evaluated by the
/// client against the aggregated rows — the server never parses it, so an unsupported expression is
/// a rendering problem rather than a reason to reject an otherwise valid layout save.
/// </summary>
public record WidgetMeasureRequest(string Name, string Expression);
