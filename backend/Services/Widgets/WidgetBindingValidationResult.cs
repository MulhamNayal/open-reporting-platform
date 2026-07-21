namespace Backend.Services.Widgets;

public class WidgetBindingValidationResult
{
    public bool IsValid { get; }

    public string? Error { get; }

    private WidgetBindingValidationResult(bool isValid, string? error)
    {
        IsValid = isValid;
        Error = error;
    }

    public static WidgetBindingValidationResult Success() => new(true, null);

    public static WidgetBindingValidationResult Failure(string error) => new(false, error);
}
