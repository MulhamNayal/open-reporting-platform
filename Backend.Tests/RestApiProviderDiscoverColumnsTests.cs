using System.Net;
using Backend.Models;
using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Xunit;

namespace Backend.Tests;

public class RestApiProviderDiscoverColumnsTests
{
    private static DataSourceConnection CreateConnection(string host)
    {
        return new DataSourceConnection
        {
            Id = 1,
            Name = "Test REST Source",
            Type = DataSourceType.RestApi,
            Host = host,
            DatabaseName = null,
            EncryptedCredentials = "",
            CreatedAtUtc = DateTime.UtcNow
        };
    }

    [Fact]
    public async Task DiscoverRestQueryColumnsAsync_AppendsPathSuffixAndQueryParamsToHost()
    {
        const string json = """[{ "id": 1, "name": "Alice" }]""";
        var handler = new FakeHttpMessageHandler(HttpStatusCode.OK, json);
        var factory = new FakeHttpClientFactory(handler);
        var provider = new RestApiProvider(factory);
        var connection = CreateConnection("https://api.example.com");

        var columns = await provider.DiscoverRestQueryColumnsAsync(
            connection, "/users", new[] { new QueryParam("active", "true") }, CancellationToken.None);

        Assert.Equal(2, columns.Count);
        Assert.Contains(columns, c => c.Name == "id" && c.NativeType == "number");
        Assert.Contains(columns, c => c.Name == "name" && c.NativeType == "string");
    }

    [Fact]
    public async Task DiscoverRestQueryColumnsAsync_HandlesNullPathSuffixAndNoQueryParams()
    {
        const string json = """{ "total": 42 }""";
        var handler = new FakeHttpMessageHandler(HttpStatusCode.OK, json);
        var factory = new FakeHttpClientFactory(handler);
        var provider = new RestApiProvider(factory);
        var connection = CreateConnection("https://api.example.com/summary");

        var columns = await provider.DiscoverRestQueryColumnsAsync(connection, null, Array.Empty<QueryParam>(), CancellationToken.None);

        var column = Assert.Single(columns);
        Assert.Equal("total", column.Name);
        Assert.Equal("number", column.NativeType);
    }
}
