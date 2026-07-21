namespace Backend.Services.Datasets;

public record TableQueryDefinition(SelectQuery Query);

public record RawSqlDefinition(string SqlText);

public record StoredProcedureDefinition(string RoutineName, IReadOnlyList<StoredProcedureParameter> Parameters);

public record RestQueryDefinition(string? PathSuffix, IReadOnlyList<QueryParam> QueryParams);
