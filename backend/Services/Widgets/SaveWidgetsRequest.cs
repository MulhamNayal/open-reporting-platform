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
    SaveWidgetBindingRequest? Binding);

public record SaveWidgetBindingRequest(int DatasetId, string? CategoryField, IReadOnlyList<string> ValueFields);
