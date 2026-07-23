using Backend.Services.Datasets;
using Backend.Services.DataSources;
using Xunit;

namespace Backend.Tests;

public class SqlServerProviderQueryBuilderTests
{
    [Fact]
    public void BuildTableQuerySql_IncludesTableColumnsAndTop()
    {
        var provider = new SqlServerProvider();
        var query = new SelectQuery("Reports", new[] { "Id", "Name" }, Array.Empty<QueryFilter>(), null, null);

        var (sql, parameters) = provider.BuildTableQuerySql(query, rowLimit: 100);

        Assert.Contains("SELECT TOP (100) [Id], [Name]", sql);
        Assert.Contains("FROM [Reports]", sql);
        Assert.Empty(parameters);
    }

    [Fact]
    public void BuildTableQuerySql_UsesSmallerOfTopAndRowLimit()
    {
        var provider = new SqlServerProvider();
        var query = new SelectQuery("Reports", new[] { "Id" }, Array.Empty<QueryFilter>(), null, Top: 5);

        var (sql, _) = provider.BuildTableQuerySql(query, rowLimit: 100);

        Assert.Contains("TOP (5)", sql);
    }

    [Fact]
    public void BuildTableQuerySql_AddsWhereClauseWithParameterizedValues()
    {
        var provider = new SqlServerProvider();
        var query = new SelectQuery(
            "Reports",
            new[] { "Id", "Name" },
            new[] { new QueryFilter("Name", "=", "Monthly Sales") },
            null,
            null);

        var (sql, parameters) = provider.BuildTableQuerySql(query, rowLimit: 100);

        Assert.Contains("WHERE [Name] = @p0", sql);
        Assert.Single(parameters);
        Assert.Equal("@p0", parameters[0].ParameterName);
        Assert.Equal("Monthly Sales", parameters[0].Value);
    }

    [Fact]
    public void BuildTableQuerySql_AndsMultipleFilters()
    {
        var provider = new SqlServerProvider();
        var query = new SelectQuery(
            "Reports",
            new[] { "Id" },
            new[] { new QueryFilter("Name", "=", "X"), new QueryFilter("Id", ">", "1") },
            null,
            null);

        var (sql, parameters) = provider.BuildTableQuerySql(query, rowLimit: 100);

        Assert.Contains("WHERE [Name] = @p0 AND [Id] > @p1", sql);
        Assert.Equal(2, parameters.Count);
    }

    [Fact]
    public void BuildTableQuerySql_AddsOrderByWhenSortSpecified()
    {
        var provider = new SqlServerProvider();
        var query = new SelectQuery("Reports", new[] { "Id" }, Array.Empty<QueryFilter>(), new QuerySort("Id", "DESC"), null);

        var (sql, _) = provider.BuildTableQuerySql(query, rowLimit: 100);

        Assert.Contains("ORDER BY [Id] DESC", sql);
    }

    [Fact]
    public void BuildTableQuerySql_RejectsUnknownOperator()
    {
        var provider = new SqlServerProvider();
        var query = new SelectQuery(
            "Reports",
            new[] { "Id" },
            new[] { new QueryFilter("Name", "; DROP TABLE Reports; --", "x") },
            null,
            null);

        Assert.Throws<UnsupportedQueryOperationException>(() => provider.BuildTableQuerySql(query, rowLimit: 100));
    }

    [Fact]
    public void BuildTableQuerySql_RejectsUnknownSortDirection()
    {
        var provider = new SqlServerProvider();
        var query = new SelectQuery("Reports", new[] { "Id" }, Array.Empty<QueryFilter>(), new QuerySort("Id", "SIDEWAYS"), null);

        Assert.Throws<UnsupportedQueryOperationException>(() => provider.BuildTableQuerySql(query, rowLimit: 100));
    }
}
