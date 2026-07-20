using Backend.Data;
using Backend.Services;
using Microsoft.EntityFrameworkCore;

namespace Backend.Tests;

public class EfReportRepositoryTests
{
    private static ReportingDbContext CreateContext(string databaseName)
    {
        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;

        var context = new ReportingDbContext(options);
        context.Database.EnsureCreated();
        return context;
    }

    [Fact]
    public void GetAll_ReturnsSeededReports()
    {
        using var context = CreateContext(Guid.NewGuid().ToString());
        var repository = new EfReportRepository(context);

        var reports = repository.GetAll();

        Assert.Equal(3, reports.Count);
        Assert.Contains(reports, r => r.Name == "Monthly Sales");
    }

    [Fact]
    public void Add_ReturnsReportWithGeneratedId()
    {
        using var context = CreateContext(Guid.NewGuid().ToString());
        var repository = new EfReportRepository(context);

        var report = repository.Add("Churn", "Customers lost per quarter");

        Assert.True(report.Id > 0);
        Assert.Equal("Churn", report.Name);
        Assert.Equal("Customers lost per quarter", report.Description);
    }

    [Fact]
    public void Add_ThenGetAll_FromANewContextInstance_SeesThePersistedRow()
    {
        var databaseName = Guid.NewGuid().ToString();

        using (var writeContext = CreateContext(databaseName))
        {
            new EfReportRepository(writeContext).Add("Churn", "Customers lost per quarter");
        }

        var options = new DbContextOptionsBuilder<ReportingDbContext>()
            .UseInMemoryDatabase(databaseName)
            .Options;
        using var readContext = new ReportingDbContext(options);
        var reports = new EfReportRepository(readContext).GetAll();

        Assert.Equal(4, reports.Count);
        Assert.Contains(reports, r => r.Name == "Churn");
    }
}
