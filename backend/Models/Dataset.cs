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

    public DatasetStorageMode StorageMode { get; set; } = DatasetStorageMode.DirectQuery;

    /// <summary>Set once the dataset has been materialised at least once; null means it never has.</summary>
    public string? MaterializedTableName { get; set; }

    public DateTime? LastMaterializedAtUtc { get; set; }

    public int? MaterializedRowCount { get; set; }

    /// <summary>Last materialisation failure, kept so the UI can explain why data looks stale.
    /// Cleared on the next success.</summary>
    public string? LastMaterializeError { get; set; }
}
