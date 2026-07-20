using System.Text.Json;
using Backend.Models;

namespace Backend.Services.DataSources;

public class RestApiProvider : IDataSourceProvider
{
    private readonly IHttpClientFactory _httpClientFactory;

    public RestApiProvider(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public async Task<ConnectionTestResult> TestConnectionAsync(DataSourceConnection connection)
    {
        try
        {
            var client = _httpClientFactory.CreateClient(nameof(RestApiProvider));
            var response = await client.GetAsync(connection.Host);

            if (response.IsSuccessStatusCode)
            {
                return new ConnectionTestResult(true, null);
            }

            return new ConnectionTestResult(false, $"Request failed with status code {(int)response.StatusCode}.");
        }
        catch (Exception ex)
        {
            return new ConnectionTestResult(false, ex.Message);
        }
    }

    public async Task<SchemaDescriptor> DiscoverSchemaAsync(DataSourceConnection connection)
    {
        var client = _httpClientFactory.CreateClient(nameof(RestApiProvider));
        var response = await client.GetAsync(connection.Host);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(body);

        JsonElement sample;
        if (document.RootElement.ValueKind == JsonValueKind.Array)
        {
            sample = document.RootElement.GetArrayLength() > 0
                ? document.RootElement[0]
                : default;
        }
        else
        {
            sample = document.RootElement;
        }

        var fields = new List<FieldDescriptor>();

        if (sample.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in sample.EnumerateObject())
            {
                fields.Add(new FieldDescriptor(property.Name, InferDataType(property.Value)));
            }
        }

        var table = new TableDescriptor(connection.Name, fields);
        return new SchemaDescriptor(new List<TableDescriptor> { table });
    }

    private static string InferDataType(JsonElement value)
    {
        return value.ValueKind switch
        {
            JsonValueKind.String => "string",
            JsonValueKind.Number => "number",
            JsonValueKind.True or JsonValueKind.False => "boolean",
            JsonValueKind.Object => "object",
            JsonValueKind.Array => "array",
            JsonValueKind.Null => "null",
            _ => "unknown"
        };
    }
}
