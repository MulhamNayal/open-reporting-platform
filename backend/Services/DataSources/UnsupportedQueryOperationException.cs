namespace Backend.Services.DataSources;

public class UnsupportedQueryOperationException : Exception
{
    public UnsupportedQueryOperationException(string message) : base(message)
    {
    }
}
