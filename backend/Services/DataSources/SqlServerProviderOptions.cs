namespace Backend.Services.DataSources;

/// <summary>
/// Bound from configuration section "DataSources:SqlServer".
/// </summary>
public class SqlServerProviderOptions
{
    /// <summary>
    /// ADO.NET's own default is 30s, which is too tight here: a report page fetches every one of
    /// its widgets' datasets concurrently, so several slow reporting procedures compete at once
    /// and each one's clock runs the whole time.
    /// </summary>
    public const int DefaultCommandTimeoutSeconds = 120;

    public int CommandTimeoutSeconds { get; set; } = DefaultCommandTimeoutSeconds;
}
