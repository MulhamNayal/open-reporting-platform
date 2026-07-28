using System.Net;
using System.Net.Http.Json;
using Backend.Services.Reports;
using Xunit;

namespace Backend.Tests;

// Verifies the full HTTP pipeline (routing, DI, GlobalExceptionHandler) end-to-end for a
// representative exception per status code. GlobalExceptionHandlerTests.cs already covers every
// exception type's mapping in isolation; these confirm the pieces are actually wired together —
// each scenario is picked to need no real external SQL Server/REST call, only the in-memory DB.
public class ExceptionMappingIntegrationTests
{
    [Fact]
    public async Task GetReport_UnknownId_Returns404WithMessageBody()
    {
        using var factory = new ApiWebApplicationFactory();
        var client = factory.CreateClient();

        var response = await client.GetAsync("/api/reports/999999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<string>();
        Assert.Equal("No report found with id 999999.", body);
    }

    [Fact]
    public async Task DeleteLastReportPage_Returns409WithMessageBody()
    {
        using var factory = new ApiWebApplicationFactory();
        var client = factory.CreateClient();
        var report = await CreateReportAsync(client);
        var pages = await client.GetFromJsonAsync<List<ReportPageDto>>($"/api/reports/{report.Id}/pages");
        var onlyPage = Assert.Single(pages!);

        var response = await client.DeleteAsync($"/api/reports/{report.Id}/pages/{onlyPage.Id}");

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<string>();
        Assert.Equal("A report needs at least one page.", body);
    }

    [Fact]
    public async Task SaveWidgets_InvalidBinding_Returns400WithMessageBody()
    {
        using var factory = new ApiWebApplicationFactory();
        var client = factory.CreateClient();
        var report = await CreateReportAsync(client);
        var pages = await client.GetFromJsonAsync<List<ReportPageDto>>($"/api/reports/{report.Id}/pages");
        var pageId = pages!.Single().Id;

        var request = new
        {
            widgets = new[]
            {
                new
                {
                    type = "Pie",
                    x = 0, y = 0, w = 4, h = 3,
                    title = "Bad Pie",
                    content = (string?)null,
                    binding = new { categoryField = "Region", valueFields = new[] { "A", "B" }, formatOptions = (string?)null },
                },
            },
        };

        var response = await client.PutAsJsonAsync($"/api/reportpages/{pageId}/widgets", request);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<string>();
        Assert.False(string.IsNullOrWhiteSpace(body));
    }

    [Fact]
    public async Task CreateDataset_ModeMismatchedWithConnectionType_Returns400WithMessageBody()
    {
        using var factory = new ApiWebApplicationFactory();
        var client = factory.CreateClient();
        var connectionRequest = new
        {
            name = "REST source",
            type = "RestApi",
            host = "https://example.test",
            databaseName = (string?)null,
            credentialsJson = "{}",
        };
        var connectionResponse = await client.PostAsJsonAsync("/api/datasources", connectionRequest);
        var connection = await connectionResponse.Content.ReadFromJsonAsync<ConnectionDto>();

        var datasetRequest = new
        {
            dataSourceConnectionId = connection!.Id,
            name = "Bad dataset",
            description = (string?)null,
            mode = "TableQuery", // TableQuery is SqlServer-only, connection above is RestApi
            definitionJson = "{}",
            rowLimit = (int?)null,
        };

        var response = await client.PostAsJsonAsync("/api/datasets", datasetRequest);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<string>();
        Assert.False(string.IsNullOrWhiteSpace(body));
    }

    private static async Task<ReportSummary> CreateReportAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/reports", new { name = "Integration Report", description = "" });
        return (await response.Content.ReadFromJsonAsync<ReportSummary>())!;
    }

    private record ReportPageDto(int Id, int ReportId, string Name, int SortOrder, string FilterState);

    private record ConnectionDto(int Id, string Name, string Type, string Host, string? DatabaseName, DateTime CreatedAtUtc);
}
