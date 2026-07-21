using System.Text.Json;
using Backend.Services.DataSources;
using Backend.Services.Datasets;

namespace Backend.Tests;

public class DatasetDefinitionSerializationTests
{
    [Fact]
    public void TableQueryDefinition_RoundTripsThroughJson()
    {
        var definition = new TableQueryDefinition(new SelectQuery(
            "Reports",
            new[] { "Id", "Name" }.ToList(),
            new[] { new QueryFilter("Name", "=", "Monthly Sales") }.ToList(),
            new QuerySort("Id", "ASC"),
            10));

        var json = JsonSerializer.Serialize(definition);
        var roundTripped = JsonSerializer.Deserialize<TableQueryDefinition>(json);

        Assert.NotNull(roundTripped);
        Assert.Equal(definition.Query.Table, roundTripped.Query.Table);
        Assert.Equal(definition.Query.Columns.Count, roundTripped.Query.Columns.Count);
        Assert.Equal(definition.Query.Filters.Count, roundTripped.Query.Filters.Count);
        Assert.Equal(definition.Query.Filters[0].Field, roundTripped.Query.Filters[0].Field);
        Assert.Equal(definition.Query.Filters[0].Operator, roundTripped.Query.Filters[0].Operator);
        Assert.Equal(definition.Query.Filters[0].Value, roundTripped.Query.Filters[0].Value);
        Assert.Equal(definition.Query.Sort!.Field, roundTripped.Query.Sort!.Field);
        Assert.Equal(definition.Query.Sort.Direction, roundTripped.Query.Sort.Direction);
        Assert.Equal(definition.Query.Top, roundTripped.Query.Top);
    }

    [Fact]
    public void RawSqlDefinition_RoundTripsThroughJson()
    {
        var definition = new RawSqlDefinition("SELECT Id, Name FROM Reports");

        var json = JsonSerializer.Serialize(definition);
        var roundTripped = JsonSerializer.Deserialize<RawSqlDefinition>(json);

        Assert.NotNull(roundTripped);
        Assert.Equal(definition.SqlText, roundTripped.SqlText);
    }

    [Fact]
    public void StoredProcedureDefinition_RoundTripsThroughJson()
    {
        var definition = new StoredProcedureDefinition(
            "usp_GetTopReports",
            new[] { new StoredProcedureParameter("MinCount", "5") }.ToList());

        var json = JsonSerializer.Serialize(definition);
        var roundTripped = JsonSerializer.Deserialize<StoredProcedureDefinition>(json);

        Assert.NotNull(roundTripped);
        Assert.Equal(definition.RoutineName, roundTripped.RoutineName);
        Assert.Equal(definition.Parameters.Count, roundTripped.Parameters.Count);
        Assert.Equal(definition.Parameters[0].Name, roundTripped.Parameters[0].Name);
        Assert.Equal(definition.Parameters[0].Value, roundTripped.Parameters[0].Value);
    }

    [Fact]
    public void RestQueryDefinition_RoundTripsThroughJson()
    {
        var definition = new RestQueryDefinition(
            "/users",
            new[] { new QueryParam("active", "true") }.ToList());

        var json = JsonSerializer.Serialize(definition);
        var roundTripped = JsonSerializer.Deserialize<RestQueryDefinition>(json);

        Assert.NotNull(roundTripped);
        Assert.Equal(definition.PathSuffix, roundTripped.PathSuffix);
        Assert.Equal(definition.QueryParams.Count, roundTripped.QueryParams.Count);
        Assert.Equal(definition.QueryParams[0].Key, roundTripped.QueryParams[0].Key);
        Assert.Equal(definition.QueryParams[0].Value, roundTripped.QueryParams[0].Value);
    }

    [Fact]
    public void QueryResult_RoundTripsThroughJson_IncludingMixedRowValues()
    {
        var result = new QueryResult(
            new[] { new ColumnDescriptor("Id", "int"), new ColumnDescriptor("Name", "nvarchar(50)") }.ToList(),
            new object?[][] { new object?[] { 1, "Monthly Sales" }, new object?[] { 2, null } }.ToList());

        var json = JsonSerializer.Serialize(result);
        var roundTripped = JsonSerializer.Deserialize<QueryResult>(json);

        Assert.Equal(2, roundTripped!.Columns.Count);
        Assert.Equal(2, roundTripped.Rows.Count);
    }
}
