using Backend.Models;
using Backend.Services.DataSources;
using Backend.Services.Datasets;

namespace Backend.Tests;

public class RawSqlWrappabilityTests
{
    private static Dataset RawSql(string sql, DatasetStorageMode storage = DatasetStorageMode.DirectQuery) =>
        new()
        {
            Mode = DatasetMode.RawSql,
            StorageMode = storage,
            Definition = $"{{\"sqlText\":{System.Text.Json.JsonSerializer.Serialize(sql)}}}",
        };

    [Theory]
    [InlineData("SELECT 1 AS a")]
    [InlineData("SELECT a, b FROM T WHERE a > 1 GROUP BY a, b")]
    // An ORDER BY inside a subquery or an OVER(...) sits below the top level and is fine.
    [InlineData("SELECT * FROM (SELECT TOP 5 a FROM T ORDER BY a) x")]
    [InlineData("SELECT ROW_NUMBER() OVER (ORDER BY a) rn, a FROM T")]
    public void CanWrapInDerivedTable_PlainSelect_IsWrappable(string sql)
    {
        Assert.True(SqlServerProvider.CanWrapInDerivedTable(sql));
    }

    [Theory]
    // A CTE has to begin its own statement.
    [InlineData("WITH c AS (SELECT 1 AS a) SELECT a FROM c")]
    [InlineData("  \r\n  with c as (select 1 a) select a from c")]
    // The keyword can hide behind a leading comment.
    [InlineData("-- header\nWITH c AS (SELECT 1 AS a) SELECT a FROM c")]
    [InlineData("/* header */ WITH c AS (SELECT 1 AS a) SELECT a FROM c")]
    // A batch, not a query.
    [InlineData("DECLARE @x int; EXEC p @x")]
    [InlineData("EXEC dbo.SomeProc @location = 2")]
    // A subquery carrying ORDER BY needs TOP/OFFSET.
    [InlineData("SELECT a FROM T ORDER BY a")]
    public void CanWrapInDerivedTable_ShapesThatCannotNest_AreRejected(string sql)
    {
        Assert.False(SqlServerProvider.CanWrapInDerivedTable(sql));
    }

    [Fact]
    public void CanWrapInDerivedTable_Blank_IsRejected()
    {
        Assert.False(SqlServerProvider.CanWrapInDerivedTable("   "));
    }

    // SQL pasted in from a file routinely carries a byte-order mark, and char.IsWhiteSpace says a
    // BOM is not whitespace — so it hid the first keyword and a DECLARE batch looked wrappable.
    [Fact]
    public void CanWrapInDerivedTable_LeadingByteOrderMark_DoesNotHideTheKeyword()
    {
        Assert.False(SqlServerProvider.CanWrapInDerivedTable("﻿declare @d datetime = GETDATE()\nselect 1 a"));
        Assert.False(SqlServerProvider.CanWrapInDerivedTable("﻿WITH c AS (SELECT 1 a) SELECT a FROM c"));
        Assert.True(SqlServerProvider.CanWrapInDerivedTable("﻿SELECT 1 AS a"));
    }

    [Fact]
    public void CanPushDownQueries_WrappableRawSql_PushesDown()
    {
        Assert.True(DatasetService.CanPushDownQueries(RawSql("SELECT 1 AS a")));
    }

    // The point of the change: this used to claim pushdown and then fail with a syntax error,
    // because the mode alone said "RawSql, therefore wrappable".
    [Fact]
    public void CanPushDownQueries_CteRawSql_FallsBackToInMemory()
    {
        Assert.False(DatasetService.CanPushDownQueries(RawSql("WITH c AS (SELECT 1 a) SELECT a FROM c")));
    }

    [Fact]
    public void CanPushDownQueries_TrailingOrderBy_FallsBackToInMemory()
    {
        Assert.False(DatasetService.CanPushDownQueries(RawSql("SELECT a FROM T ORDER BY a")));
    }

    // Materialised into a real table, so the original query's shape stops mattering.
    [Fact]
    public void CanPushDownQueries_ImportAlwaysPushesDown_EvenForACte()
    {
        var dataset = RawSql("WITH c AS (SELECT 1 a) SELECT a FROM c", DatasetStorageMode.Import);
        Assert.True(DatasetService.CanPushDownQueries(dataset));
    }

    [Fact]
    public void CanPushDownQueries_StoredProcedure_NeverPushesDown()
    {
        var dataset = new Dataset
        {
            Mode = DatasetMode.StoredProcedure,
            StorageMode = DatasetStorageMode.DirectQuery,
            Definition = "{\"routineName\":\"dbo.P\",\"parameters\":[]}",
        };
        Assert.False(DatasetService.CanPushDownQueries(dataset));
    }

    [Fact]
    public void CanPushDownQueries_UnreadableDefinition_FallsBackToInMemory()
    {
        var dataset = new Dataset
        {
            Mode = DatasetMode.RawSql,
            StorageMode = DatasetStorageMode.DirectQuery,
            Definition = "not json",
        };
        Assert.False(DatasetService.CanPushDownQueries(dataset));
    }
}
