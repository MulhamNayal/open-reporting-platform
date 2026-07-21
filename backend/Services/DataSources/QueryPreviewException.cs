namespace Backend.Services.DataSources;

public class QueryPreviewException : Exception
{
    public QueryPreviewException(string message, Exception innerException) : base(message, innerException)
    {
    }
}
