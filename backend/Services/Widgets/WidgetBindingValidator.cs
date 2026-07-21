using Backend.Models;

namespace Backend.Services.Widgets;

public class WidgetBindingValidator : IWidgetBindingValidator
{
    public WidgetBindingValidationResult Validate(WidgetType type, SaveWidgetBindingRequest? binding)
    {
        if (type == WidgetType.Text)
        {
            return binding == null
                ? WidgetBindingValidationResult.Success()
                : WidgetBindingValidationResult.Failure("Text widgets must not have a binding.");
        }

        if (binding == null)
        {
            return WidgetBindingValidationResult.Success();
        }

        return type switch
        {
            WidgetType.Kpi => ValidateKpi(binding),
            WidgetType.Pie => ValidatePie(binding),
            WidgetType.Donut => ValidatePie(binding),
            WidgetType.Bar => ValidateCategoryPlusValues(binding),
            WidgetType.ClusteredBar => ValidateCategoryPlusValues(binding),
            WidgetType.StackedColumn => ValidateCategoryPlusValues(binding),
            WidgetType.Line => ValidateCategoryPlusValues(binding),
            WidgetType.Area => ValidateCategoryPlusValues(binding),
            WidgetType.Scatter => ValidateScatter(binding),
            WidgetType.Table => WidgetBindingValidationResult.Success(),
            _ => WidgetBindingValidationResult.Failure($"Unknown widget type '{type}'.")
        };
    }

    private static WidgetBindingValidationResult ValidateKpi(SaveWidgetBindingRequest binding)
    {
        if (binding.CategoryField != null)
        {
            return WidgetBindingValidationResult.Failure("Kpi widgets must not have a CategoryField.");
        }

        if (binding.ValueFields.Count != 1)
        {
            return WidgetBindingValidationResult.Failure("Kpi widgets must have exactly one ValueField.");
        }

        return WidgetBindingValidationResult.Success();
    }

    private static WidgetBindingValidationResult ValidatePie(SaveWidgetBindingRequest binding)
    {
        if (string.IsNullOrWhiteSpace(binding.CategoryField))
        {
            return WidgetBindingValidationResult.Failure("Pie widgets require a CategoryField.");
        }

        if (binding.ValueFields.Count != 1)
        {
            return WidgetBindingValidationResult.Failure("Pie widgets must have exactly one ValueField.");
        }

        return WidgetBindingValidationResult.Success();
    }

    private static WidgetBindingValidationResult ValidateCategoryPlusValues(SaveWidgetBindingRequest binding)
    {
        if (string.IsNullOrWhiteSpace(binding.CategoryField))
        {
            return WidgetBindingValidationResult.Failure("This widget type requires a CategoryField.");
        }

        if (binding.ValueFields.Count == 0)
        {
            return WidgetBindingValidationResult.Failure("This widget type requires at least one ValueField.");
        }

        return WidgetBindingValidationResult.Success();
    }

    private static WidgetBindingValidationResult ValidateScatter(SaveWidgetBindingRequest binding)
    {
        if (binding.ValueFields.Count != 2)
        {
            return WidgetBindingValidationResult.Failure("Scatter widgets must have exactly two ValueFields (X then Y).");
        }

        return WidgetBindingValidationResult.Success();
    }
}
