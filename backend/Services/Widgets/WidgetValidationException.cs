namespace Backend.Services.Widgets;

public class WidgetValidationException : Exception
{
    public WidgetValidationException(string message) : base(message)
    {
    }
}
