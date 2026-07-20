namespace Backend.Services.DataSources;

public record SchemaDescriptor(IReadOnlyList<TableDescriptor> Tables);

public record TableDescriptor(string Name, IReadOnlyList<FieldDescriptor> Fields);

public record FieldDescriptor(string Name, string DataType);
