using Backend.Models;

namespace Backend.Services.Datasets;

// StorageMode is last with a default so the existing positional call sites keep compiling; the
// JSON body binds by name, so wire order is unaffected. null means "leave unchanged".
public record UpdateDatasetRequest(
    string Name,
    string? Description,
    DatasetMode Mode,
    string DefinitionJson,
    int? RowLimit,
    DatasetStorageMode? StorageMode = null,
    int? RefreshIntervalMinutes = null);
