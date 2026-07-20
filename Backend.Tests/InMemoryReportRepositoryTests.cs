using Backend.Services;

namespace Backend.Tests;

public class InMemoryReportRepositoryTests
{
    [Fact]
    public void GetAll_OnFreshRepository_ReturnsSeededReports()
    {
        var repo = new InMemoryReportRepository();

        var reports = repo.GetAll();

        Assert.Equal(3, reports.Count);
        Assert.All(reports, r => Assert.False(string.IsNullOrWhiteSpace(r.Name)));
    }

    [Fact]
    public void Add_ThenGetAll_IncludesTheNewReport()
    {
        var repo = new InMemoryReportRepository();

        var created = repo.Add("Churn", "Customers lost per quarter");
        var reports = repo.GetAll();

        Assert.Contains(reports, r => r.Id == created.Id && r.Name == "Churn" && r.Description == "Customers lost per quarter");
    }

    [Fact]
    public void Add_AssignsIncrementingIds()
    {
        var repo = new InMemoryReportRepository();

        var a = repo.Add("A", "");
        var b = repo.Add("B", "");

        Assert.Equal(a.Id + 1, b.Id);
    }
}
