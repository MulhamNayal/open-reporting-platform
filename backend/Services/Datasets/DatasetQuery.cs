namespace Backend.Services.Datasets;

/// <summary>
/// The page's filter state, matching the shape the frontend already persists on ReportPage:
/// field name → the set of values to keep. An empty value list means the field isn't filtering.
/// </summary>
public record DatasetFilter(string Field, IReadOnlyList<string> Values);

public record DatasetSort(string Field, bool Descending);

/// <summary>A page of detail rows. Used by table widgets.</summary>
public record QueryRowsRequest(
    IReadOnlyList<DatasetFilter>? Filters,
    IReadOnlyList<string>? Columns,
    DatasetSort? Sort,
    int Skip = 0,
    int Take = 100);

/// <summary>
/// Grouped totals. Used by chart and KPI widgets — this is where the payload problem disappears,
/// since grouping 50,000 rows by a handful of categories returns a handful of rows.
/// Aggregations is aligned by index with ValueFields, matching WidgetBinding.Aggregations.
/// </summary>
public record QueryAggregateRequest(
    IReadOnlyList<DatasetFilter>? Filters,
    string? CategoryField,
    IReadOnlyList<string> ValueFields,
    IReadOnlyList<string>? Aggregations);

/// <summary>Distinct values of one column, for the Filters pane.</summary>
public record QueryDistinctRequest(
    IReadOnlyList<DatasetFilter>? Filters,
    string Column,
    int Take = 1000);

/// <summary>
/// Every categorical column and its distinct values, in one round trip. A per-column request
/// would mean dozens of calls to render one filters pane.
/// </summary>
public record QueryFilterableFieldsRequest(IReadOnlyList<DatasetFilter>? Filters, int MaxValues = 30);

public record FilterableField(DataSources.ColumnDescriptor Column, IReadOnlyList<string> Values);

/// <summary>A page of rows plus the unfiltered-by-paging total, so the UI can show "page 3 of 13".</summary>
public record PagedQueryResult(
    IReadOnlyList<DataSources.ColumnDescriptor> Columns,
    IReadOnlyList<object?[]> Rows,
    int TotalRows);
