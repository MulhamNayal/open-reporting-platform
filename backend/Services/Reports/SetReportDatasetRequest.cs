using Backend.Models;

namespace Backend.Services.Reports;

public record SetReportDatasetRequest(int DataSourceConnectionId, DatasetMode Mode, string DefinitionJson, int? RowLimit);
