namespace Backend.Services.DataSources;

public record QueryResult(IReadOnlyList<ColumnDescriptor> Columns, IReadOnlyList<object?[]> Rows);
