using System.Text.Json;
using Backend.Data;
using Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Services.Widgets;

public class WidgetService : IWidgetService
{
    private readonly ReportingDbContext _context;
    private readonly IWidgetBindingValidator _validator;

    public WidgetService(ReportingDbContext context, IWidgetBindingValidator validator)
    {
        _context = context;
        _validator = validator;
    }

    public async Task<IReadOnlyList<WidgetSummary>> GetWidgetsAsync(int reportPageId)
    {
        await EnsureReportPageExistsAsync(reportPageId);

        var widgets = await _context.Widgets
            .Include(w => w.Binding)
            .Where(w => w.ReportPageId == reportPageId)
            .ToListAsync();

        return widgets.Select(ToSummary).ToList();
    }

    public async Task<IReadOnlyList<WidgetSummary>> SaveWidgetsAsync(int reportPageId, SaveWidgetsRequest request)
    {
        await EnsureReportPageExistsAsync(reportPageId);

        foreach (var widgetRequest in request.Widgets)
        {
            var validation = _validator.Validate(widgetRequest.Type, widgetRequest.Binding);
            if (!validation.IsValid)
            {
                throw new WidgetValidationException(validation.Error!);
            }
        }

        var existingWidgets = await _context.Widgets.Where(w => w.ReportPageId == reportPageId).ToListAsync();
        var existingWidgetIds = existingWidgets.Select(w => w.Id).ToList();
        var existingBindings = await _context.WidgetBindings.Where(b => existingWidgetIds.Contains(b.WidgetId)).ToListAsync();

        _context.WidgetBindings.RemoveRange(existingBindings);
        _context.Widgets.RemoveRange(existingWidgets);

        foreach (var widgetRequest in request.Widgets)
        {
            var widget = new Widget
            {
                ReportPageId = reportPageId,
                Type = widgetRequest.Type,
                X = widgetRequest.X,
                Y = widgetRequest.Y,
                W = widgetRequest.W,
                H = widgetRequest.H,
                Title = widgetRequest.Title,
                Content = widgetRequest.Content
            };

            // Text widgets never persist a binding, even if one somehow got past validation above —
            // enforced again here at the point of persistence, not just at the validation gate.
            if (widgetRequest.Type != WidgetType.Text && widgetRequest.Binding != null)
            {
                widget.Binding = new WidgetBinding
                {
                    CategoryField = widgetRequest.Binding.CategoryField,
                    ValueFields = JsonSerializer.Serialize(widgetRequest.Binding.ValueFields),
                    FormatOptions = widgetRequest.Binding.FormatOptions ?? "{}"
                };
            }

            _context.Widgets.Add(widget);
        }

        await _context.SaveChangesAsync();

        return await GetWidgetsAsync(reportPageId);
    }

    private async Task EnsureReportPageExistsAsync(int reportPageId)
    {
        var exists = await _context.ReportPages.AnyAsync(p => p.Id == reportPageId);
        if (!exists)
        {
            throw new InvalidOperationException($"No report page found with id {reportPageId}.");
        }
    }

    private static WidgetSummary ToSummary(Widget widget)
    {
        WidgetBindingSummary? bindingSummary = null;
        if (widget.Binding != null)
        {
            var valueFields = JsonSerializer.Deserialize<List<string>>(widget.Binding.ValueFields) ?? new List<string>();
            bindingSummary = new WidgetBindingSummary(widget.Binding.CategoryField, valueFields, widget.Binding.FormatOptions);
        }

        return new WidgetSummary(widget.Id, widget.Type, widget.X, widget.Y, widget.W, widget.H, widget.Title, widget.Content, bindingSummary);
    }
}
