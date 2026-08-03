using Backend.Services.Datasets;
using Microsoft.Data.SqlClient;
using Xunit;

namespace Backend.Tests;

public class DatasetQueryPredicateTests
{
    private static (string Sql, List<SqlParameter> Parameters) Build(params DatasetFilter[] filters)
    {
        var parameters = new List<SqlParameter>();
        var sql = DatasetQueryService.BuildWhere(filters, parameters);
        return (sql, parameters);
    }

    [Fact]
    public void BuildWhere_NoFilters_ProducesNoClause()
    {
        Assert.Equal("", Build().Sql);
    }

    [Fact]
    public void BuildWhere_FilterWithNoValues_IsIgnored()
    {
        // An empty value list means the field isn't filtering, not "match nothing".
        Assert.Equal("", Build(new DatasetFilter("Team", Array.Empty<string>())).Sql);
    }

    [Fact]
    public void BuildWhere_SingleFilter_ParameterisesEveryValue()
    {
        var (sql, parameters) = Build(new DatasetFilter("Team", new[] { "Elite", "Ace" }));

        Assert.Equal("WHERE ([Team] IN (@p0, @p1))", sql);
        Assert.Equal(2, parameters.Count);
        Assert.Equal("Elite", parameters[0].Value);
        Assert.Equal("Ace", parameters[1].Value);
    }

    [Fact]
    public void BuildWhere_MultipleFilters_AreAnded()
    {
        var (sql, parameters) = Build(
            new DatasetFilter("Team", new[] { "Elite" }),
            new DatasetFilter("Region", new[] { "KL" }));

        Assert.Equal("WHERE ([Team] IN (@p0)) AND ([Region] IN (@p1))", sql);
        Assert.Equal(2, parameters.Count);
    }

    [Fact]
    public void BuildWhere_ValueContainingSqlSyntax_IsAParameterNotConcatenated()
    {
        // The whole point: nothing from the caller reaches the SQL text.
        var nasty = "'; DROP TABLE Datasets; --";
        var (sql, parameters) = Build(new DatasetFilter("Team", new[] { nasty }));

        Assert.DoesNotContain("DROP TABLE", sql);
        Assert.Equal("WHERE ([Team] IN (@p0))", sql);
        Assert.Equal(nasty, parameters[0].Value);
    }

    [Fact]
    public void BuildWhere_FieldNameWithABracket_IsEscapedNotBrokenOut()
    {
        var (sql, _) = Build(new DatasetFilter("Od]d", new[] { "x" }));

        Assert.Equal("WHERE ([Od]]d] IN (@p0))", sql);
    }

    [Fact]
    public void BuildWhere_FilterIncludingEmptyString_AlsoMatchesNull()
    {
        // The frontend represents null as "", and IN () never matches NULL in SQL — without the
        // extra clause, filtering on a blank would silently drop every null row.
        var (sql, _) = Build(new DatasetFilter("Team", new[] { "", "Elite" }));

        Assert.Equal("WHERE (([Team] IN (@p0, @p1) OR [Team] IS NULL))", sql);
    }

    [Fact]
    public void BuildWhere_ParameterNamesAreUniqueAcrossFilters()
    {
        var (_, parameters) = Build(
            new DatasetFilter("A", new[] { "1", "2" }),
            new DatasetFilter("B", new[] { "3" }));

        Assert.Equal(new[] { "@p0", "@p1", "@p2" }, parameters.Select(p => p.ParameterName));
    }
}
