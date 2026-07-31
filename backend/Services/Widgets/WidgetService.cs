using System.Text.Json;
using Backend.Data;
using Backend.Exceptions;
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

        await EnsureDatasetsExistAsync(request.Widgets);

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
                Content = widgetRequest.Content,
                DatasetId = widgetRequest.DatasetId
            };

            // Text widgets never persist a binding, even if one somehow got past validation above —
            // enforced again here at the point of persistence, not just at the validation gate.
            if (widgetRequest.Type != WidgetType.Text && widgetRequest.Binding != null)
            {
                widget.Binding = new WidgetBinding
                {
                    CategoryField = widgetRequest.Binding.CategoryField,
                    ValueFields = JsonSerializer.Serialize(widgetRequest.Binding.ValueFields),
                    // Left null when nothing is aggregated, so an unaggregated widget stores
                    // exactly what it stored before this column existed.
                    Aggregations = widgetRequest.Binding.Aggregations is { Count: > 0 }
                        ? JsonSerializer.Serialize(widgetRequest.Binding.Aggregations)
                        : null,
                    FormatOptions = widgetRequest.Binding.FormatOptions ?? "{}"
                };
            }

            _context.Widgets.Add(widget);
        }

        await _context.SaveChangesAsync();

        return await GetWidgetsAsync(reportPageId);
    }

    // Validates every distinct dataset id in the payload in one round-trip, before any
    // persistence — the same validate-before-persist shape DatasetService.CreateAsync uses.
    // A null DatasetId means "use the report default" and needs no lookup.
    private async Task EnsureDatasetsExistAsync(IReadOnlyList<SaveWidgetRequest> widgets)
    {
        var datasetIds = widgets
            .Where(w => w.DatasetId.HasValue)
            .Select(w => w.DatasetId!.Value)
            .Distinct()
            .ToList();

        if (datasetIds.Count == 0)
        {
            return;
        }

        var foundIds = await _context.Datasets
            .Where(d => datasetIds.Contains(d.Id))
            .Select(d => d.Id)
            .ToListAsync();

        var missingIds = datasetIds.Where(id => !foundIds.Contains(id)).ToList();
        if (missingIds.Count > 0)
        {
            throw new NotFoundException($"No dataset found with id {missingIds[0]}.");
        }
    }

    private async Task EnsureReportPageExistsAsync(int reportPageId)
    {
        var exists = await _context.ReportPages.AnyAsync(p => p.Id == reportPageId);
        if (!exists)
        {
            throw new NotFoundException($"No report page found with id {reportPageId}.");
        }
    }

    private static WidgetSummary ToSummary(Widget widget)
    {
        WidgetBindingSummary? bindingSummary = null;
        if (widget.Binding != null)
        {
            var valueFields = JsonSerializer.Deserialize<List<string>>(widget.Binding.ValueFields) ?? new List<string>();
            var aggregations = widget.Binding.Aggregations is null
                ? null
                : JsonSerializer.Deserialize<List<string>>(widget.Binding.Aggregations);
            bindingSummary = new WidgetBindingSummary(widget.Binding.CategoryField, valueFields, aggregations, widget.Binding.FormatOptions);
        }

        return new WidgetSummary(widget.Id, widget.Type, widget.X, widget.Y, widget.W, widget.H, widget.Title, widget.Content, widget.DatasetId, bindingSummary);
    }
}
