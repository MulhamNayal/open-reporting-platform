using Backend.Services.Datasets;
using Backend.Services.DataSources;
using Xunit;

namespace Backend.Tests;

public class SqlServerProviderStoredProcedureTests
{
    [Fact]
    public void BuildStoredProcedureCommandText_UsesExecWithNamedParameters()
    {
        var provider = new SqlServerProvider();
        var parameters = new[] { new StoredProcedureParameter("MinCount", "5") };

        var (sql, sqlParameters) = provider.BuildStoredProcedureCommand("usp_GetTopReports", parameters);

        Assert.Equal("EXEC [usp_GetTopReports] @MinCount", sql);
        Assert.Single(sqlParameters);
        Assert.Equal("@MinCount", sqlParameters[0].ParameterName);
        Assert.Equal("5", sqlParameters[0].Value);
    }

    [Fact]
    public void BuildStoredProcedureCommandText_HandlesNoParameters()
    {
        var provider = new SqlServerProvider();

        var (sql, sqlParameters) = provider.BuildStoredProcedureCommand("usp_GetAllReports", Array.Empty<StoredProcedureParameter>());

        Assert.Equal("EXEC [usp_GetAllReports]", sql);
        Assert.Empty(sqlParameters);
    }

    [Fact]
    public void BuildStoredProcedureCommandText_JoinsMultipleParametersWithCommas()
    {
        var provider = new SqlServerProvider();
        var parameters = new[]
        {
            new StoredProcedureParameter("MinCount", "5"),
            new StoredProcedureParameter("Region", "West")
        };

        var (sql, sqlParameters) = provider.BuildStoredProcedureCommand("usp_GetTopReports", parameters);

        Assert.Equal("EXEC [usp_GetTopReports] @MinCount, @Region", sql);
        Assert.Equal(2, sqlParameters.Count);
    }
}
