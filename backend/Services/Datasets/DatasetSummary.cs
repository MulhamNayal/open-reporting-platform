using Backend.Models;
using Backend.Services.DataSources;

namespace Backend.Services.Datasets;

public record DatasetSummary(
    int Id,
    int DataSourceConnectionId,
    string Name,
    string? Description,
    DatasetMode Mode,
    string DefinitionJson,
    int? RowLimit,
    bool IsSaved,
    IReadOnlyList<ColumnDescriptor> Columns,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    DatasetStorageMode StorageMode = DatasetStorageMode.DirectQuery,
    DateTime? LastMaterializedAtUtc = null,
    int? MaterializedRowCount = null,
    string? LastMaterializeError = null,
    int? RefreshIntervalMinutes = null);
