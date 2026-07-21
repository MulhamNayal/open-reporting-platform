namespace Backend.Services.Datasets;

public record SelectQuery(
    string Table,
    IReadOnlyList<string> Columns,
    IReadOnlyList<QueryFilter> Filters,
    QuerySort? Sort,
    int? Top);
