using System.Net;
using Backend.Models;
using Backend.Services.DataSources;

namespace Backend.Tests;

public class RestApiProviderTests
{
    private static DataSourceConnection CreateConnection(string url)
    {
        return new DataSourceConnection
        {
            Id = 1,
            Name = "Test REST Source",
            Type = DataSourceType.RestApi,
            Host = url,
            DatabaseName = null,
            EncryptedCredentials = "",
            CreatedAtUtc = DateTime.UtcNow
        };
    }

    [Fact]
    public async Task TestConnectionAsync_SuccessStatusCode_ReturnsSuccessTrue()
    {
        var factory = new FakeHttpClientFactory(new FakeHttpMessageHandler(HttpStatusCode.OK));
        var provider = new RestApiProvider(factory);
        var connection = CreateConnection("https://api.example.com/data");

        var result = await provider.TestConnectionAsync(connection);

        Assert.True(result.Success);
        Assert.Null(result.ErrorMessage);
    }

    [Fact]
    public async Task TestConnectionAsync_ErrorStatusCode_ReturnsSuccessFalseWithMessage()
    {
        var factory = new FakeHttpClientFactory(new FakeHttpMessageHandler(HttpStatusCode.InternalServerError));
        var provider = new RestApiProvider(factory);
        var connection = CreateConnection("https://api.example.com/data");

        var result = await provider.TestConnectionAsync(connection);

        Assert.False(result.Success);
        Assert.NotNull(result.ErrorMessage);
    }

    [Fact]
    public async Task DiscoverSchemaAsync_JsonArrayResponse_InfersFieldsFromFirstElement()
    {
        const string json = """
            [
                { "id": 1, "name": "Alice", "active": true },
                { "id": 2, "name": "Bob", "active": false }
            ]
            """;
        var factory = new FakeHttpClientFactory(new FakeHttpMessageHandler(HttpStatusCode.OK, json));
        var provider = new RestApiProvider(factory);
        var connection = CreateConnection("https://api.example.com/people");

        var schema = await provider.DiscoverSchemaAsync(connection);

        var table = Assert.Single(schema.Tables);
        Assert.Equal(3, table.Fields.Count);
        Assert.Contains(table.Fields, f => f.Name == "id" && f.DataType == "number");
        Assert.Contains(table.Fields, f => f.Name == "name" && f.DataType == "string");
        Assert.Contains(table.Fields, f => f.Name == "active" && f.DataType == "boolean");
    }

    [Fact]
    public async Task DiscoverSchemaAsync_JsonObjectResponse_InfersFieldsFromRootObject()
    {
        const string json = """{ "total": 42, "label": "summary" }""";
        var factory = new FakeHttpClientFactory(new FakeHttpMessageHandler(HttpStatusCode.OK, json));
        var provider = new RestApiProvider(factory);
        var connection = CreateConnection("https://api.example.com/summary");

        var schema = await provider.DiscoverSchemaAsync(connection);

        var table = Assert.Single(schema.Tables);
        Assert.Equal(2, table.Fields.Count);
        Assert.Contains(table.Fields, f => f.Name == "total" && f.DataType == "number");
        Assert.Contains(table.Fields, f => f.Name == "label" && f.DataType == "string");
    }

    [Fact]
    public async Task DiscoverSchemaAsync_EmptyJsonArray_ReturnsTableWithNoFields()
    {
        var factory = new FakeHttpClientFactory(new FakeHttpMessageHandler(HttpStatusCode.OK, "[]"));
        var provider = new RestApiProvider(factory);
        var connection = CreateConnection("https://api.example.com/empty");

        var schema = await provider.DiscoverSchemaAsync(connection);

        var table = Assert.Single(schema.Tables);
        Assert.Empty(table.Fields);
    }
}
