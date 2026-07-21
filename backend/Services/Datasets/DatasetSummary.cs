using Backend.Models;
using Backend.Services.DataSources;

namespace Backend.Services.Datasets;

public record DatasetSummary(
    int Id,
    int DataSourceConnectionId,
    string Name,
    string? Description,
    DatasetMode Mode,
    int? RowLimit,
    IReadOnlyList<ColumnDescriptor> Columns,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc);
