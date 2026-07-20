using Backend.Models;
using Backend.Services.DataSources;

namespace Backend.Tests;

public class SqlServerProviderTests
{
    private static DataSourceConnection CreateConnection(string host, string? databaseName, string credentialsJson)
    {
        return new DataSourceConnection
        {
            Id = 1,
            Name = "Test SQL Source",
            Type = DataSourceType.SqlServer,
            Host = host,
            DatabaseName = databaseName,
            EncryptedCredentials = credentialsJson,
            CreatedAtUtc = DateTime.UtcNow
        };
    }

    [Fact]
    public void BuildConnectionString_IncludesHostDatabaseAndCredentials()
    {
        var provider = new SqlServerProvider();
        var connection = CreateConnection("localhost\\SQLEXPRESS", "OpenReportingPlatform", """{"username":"sa","password":"p@ssw0rd"}""");

        var connectionString = provider.BuildConnectionString(connection);

        Assert.Contains("Server=localhost\\SQLEXPRESS", connectionString);
        Assert.Contains("Database=OpenReportingPlatform", connectionString);
        Assert.Contains("User Id=sa", connectionString);
        Assert.Contains("Password=p@ssw0rd", connectionString);
    }

    [Fact]
    public void BuildConnectionString_MalformedCredentialsJson_ThrowsInvalidOperationException()
    {
        var provider = new SqlServerProvider();
        var connection = CreateConnection("localhost\\SQLEXPRESS", "OpenReportingPlatform", "not json at all");

        Assert.Throws<InvalidOperationException>(() => provider.BuildConnectionString(connection));
    }
}
