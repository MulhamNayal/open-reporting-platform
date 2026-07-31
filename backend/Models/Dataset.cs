namespace Backend.Models;

public class Dataset
{
    public int Id { get; set; }

    public int DataSourceConnectionId { get; set; }

    public string Name { get; set; } = "";

    public string? Description { get; set; }

    public DatasetMode Mode { get; set; }

    public string Definition { get; set; } = "";

    public int? RowLimit { get; set; }

    public bool IsSaved { get; set; } = true;

    public string Columns { get; set; } = "[]";

    public DateTime CreatedAtUtc { get; set; }

    public DateTime UpdatedAtUtc { get; set; }

    /// <summary>
    /// Bumped only when the definition actually changes, and used in the result cache key.
    /// UpdatedAtUtc can't serve this purpose — ExecuteAsync bumps it on every run, which would
    /// invalidate the cache on the very call that populated it.
    /// </summary>
    public int DefinitionVersion { get; set; } = 1;
}
