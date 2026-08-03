using Backend.Models;

namespace Backend.Services.Datasets;

// StorageMode is last with a default so the existing positional call sites keep compiling.
// null means "use the default for this query mode" — see DatasetService.ResolveStorageMode.
public record CreateDatasetRequest(
    int DataSourceConnectionId,
    string Name,
    string? Description,
    DatasetMode Mode,
    string DefinitionJson,
    int? RowLimit,
    bool IsSaved = true,
    DatasetStorageMode? StorageMode = null);
