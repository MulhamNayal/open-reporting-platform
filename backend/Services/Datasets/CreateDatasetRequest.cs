using Backend.Models;

namespace Backend.Services.Datasets;

public record CreateDatasetRequest(
    int DataSourceConnectionId,
    string Name,
    string? Description,
    DatasetMode Mode,
    string DefinitionJson,
    int? RowLimit);
