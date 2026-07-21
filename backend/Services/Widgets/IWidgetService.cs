namespace Backend.Services.Widgets;

public interface IWidgetService
{
    Task<IReadOnlyList<WidgetSummary>> GetWidgetsAsync(int reportId);

    Task<IReadOnlyList<WidgetSummary>> SaveWidgetsAsync(int reportId, SaveWidgetsRequest request);
}
