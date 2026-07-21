using Backend.Models;

namespace Backend.Services.Widgets;

public interface IWidgetBindingValidator
{
    WidgetBindingValidationResult Validate(WidgetType type, SaveWidgetBindingRequest? binding);
}
