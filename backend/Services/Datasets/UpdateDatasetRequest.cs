using Backend.Models;

namespace Backend.Services.Datasets;

public record UpdateDatasetRequest(string Name, string? Description, DatasetMode Mode, string DefinitionJson, int? RowLimit);
