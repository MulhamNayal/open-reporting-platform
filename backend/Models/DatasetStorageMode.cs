namespace Backend.Models;

/// <summary>
/// Where a dataset's rows are served from. Orthogonal to <see cref="DatasetMode"/>, which
/// describes how the source is queried.
/// </summary>
public enum DatasetStorageMode
{
    /// <summary>Execute the source on every request. Only viable where the source query can be
    /// wrapped in a derived table — i.e. RawSql and TableQuery.</summary>
    DirectQuery,

    /// <summary>Materialise the result into a platform-owned table and serve queries from that.
    /// Required for stored procedures, whose result sets cannot be filtered or paged inline.</summary>
    Import
}
