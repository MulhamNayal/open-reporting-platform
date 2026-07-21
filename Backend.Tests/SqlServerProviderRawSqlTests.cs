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
}
