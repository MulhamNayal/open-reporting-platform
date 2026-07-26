using Backend.Services.DataSources;
using Xunit;

namespace Backend.Tests;

public class SqlServerProviderRawSqlTests
{
    [Fact]
    public void BuildRawSqlDiscoveryWrapper_WrapsUserSqlInTopZeroDerivedTable()
    {
        var provider = new SqlServerProvider();

        var wrapped = provider.BuildRawSqlDiscoveryWrapper("SELECT Id, Name FROM Reports");

        Assert.Equal("SELECT TOP (0) * FROM (SELECT Id, Name FROM Reports) AS x", wrapped);
    }

    [Fact]
    public void BuildBoundedRawSql_WithNoOrderBy_WrapsInTopDerivedTable()
    {
        var provider = new SqlServerProvider();

        var bounded = provider.BuildBoundedRawSql("select * from SqlAccountingMasterPaymentVouchers", 500);

        Assert.Equal("SELECT TOP (500) * FROM (select * from SqlAccountingMasterPaymentVouchers) AS x", bounded);
    }

    [Fact]
    public void BuildBoundedRawSql_WithTrailingOrderBy_AppendsFetchNextInsteadOfWrapping()
    {
        var provider = new SqlServerProvider();

        var bounded = provider.BuildBoundedRawSql("SELECT Id, Name FROM Reports ORDER BY Name", 500);

        Assert.Equal("SELECT Id, Name FROM Reports ORDER BY Name OFFSET 0 ROWS FETCH NEXT (500) ROWS ONLY", bounded);
    }

    [Fact]
    public void BuildBoundedRawSql_WithOrderByNestedInsideASubquery_StillWrapsInTopDerivedTable()
    {
        var provider = new SqlServerProvider();

        // The ORDER BY here sits inside a window function's OVER(...) clause (paren depth > 0),
        // not at the top level, so it must not be treated as a trailing top-level ORDER BY.
        var bounded = provider.BuildBoundedRawSql(
            "SELECT Id, ROW_NUMBER() OVER (ORDER BY Name) AS rn FROM Reports",
            500);

        Assert.Equal(
            "SELECT TOP (500) * FROM (SELECT Id, ROW_NUMBER() OVER (ORDER BY Name) AS rn FROM Reports) AS x",
            bounded);
    }

    [Fact]
    public void BuildBoundedRawSql_TrimsTrailingSemicolonBeforeWrapping()
    {
        var provider = new SqlServerProvider();

        var bounded = provider.BuildBoundedRawSql("SELECT Id FROM Reports;  ", 10);

        Assert.Equal("SELECT TOP (10) * FROM (SELECT Id FROM Reports) AS x", bounded);
    }
}
