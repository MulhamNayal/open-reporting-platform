using Backend.Services.Materialization;
using Xunit;

namespace Backend.Tests;

/// <summary>
/// The cache database sits on the same instance as other people's databases. Its name is derived
/// rather than fixed precisely so it can't land on one of theirs.
/// </summary>
public class CacheDatabaseNamingTests
{
    [Theory]
    [InlineData("Server=localhost;Database=ReportingDb;Trusted_Connection=True", "ReportingDbCache")]
    [InlineData("Server=x;Initial Catalog=OpenReportingPlatform;User Id=a;Password=b", "OpenReportingPlatformCache")]
    [InlineData("Server=x,1433;Database=orp-dev;User Id=a;Password=b", "orp-devCache")]
    public void DeriveCacheDatabaseName_SuffixesTheApplicationDatabase(string connectionString, string expected)
    {
        Assert.Equal(expected, SqlMaterializationStore.DeriveCacheDatabaseName(connectionString));
    }

    [Fact]
    public void DeriveCacheDatabaseName_NeverReturnsTheApplicationDatabaseItself()
    {
        // If these ever matched, materialised tables would be created straight into the
        // application's own database.
        const string connectionString = "Server=localhost;Database=ReportingDb;Trusted_Connection=True";

        Assert.NotEqual("ReportingDb", SqlMaterializationStore.DeriveCacheDatabaseName(connectionString));
    }

    [Fact]
    public void DeriveCacheDatabaseName_WithNoDatabaseNamed_Throws()
    {
        Assert.Throws<InvalidOperationException>(() =>
            SqlMaterializationStore.DeriveCacheDatabaseName("Server=localhost;Trusted_Connection=True"));
    }
}
