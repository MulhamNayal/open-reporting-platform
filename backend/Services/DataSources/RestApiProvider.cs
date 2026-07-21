using System.Net.Http.Headers;
using System.Text.Json;
using Backend.Models;
using Backend.Services.Datasets;

namespace Backend.Services.DataSources;

public class RestApiProvider : IDataSourceProvider
{
    private readonly IHttpClientFactory _httpClientFactory;

    public RestApiProvider(IHttpClientFactory httpClientFactory)
    {
        _httpClientFactory = httpClientFactory;
    }

    public DataSourceType SupportedType => DataSourceType.RestApi;

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

    public async Task<QueryResult> ExecuteQueryAsync(DataSourceConnection connection, Dataset dataset, int rowLimit, CancellationToken cancellationToken)
    {
        if (dataset.Mode != DatasetMode.RestQuery)
        {
            throw new NotSupportedException($"RestApiProvider.ExecuteQueryAsync does not support mode {dataset.Mode}.");
        }

        var definition = JsonSerializer.Deserialize<RestQueryDefinition>(dataset.Definition)!;
        var client = _httpClientFactory.CreateClient(nameof(RestApiProvider));

        var url = connection.Host + (definition.PathSuffix ?? "");
        if (definition.QueryParams.Count > 0)
        {
            var query = string.Join("&", definition.QueryParams.Select(p => $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(p.Value)}"));
            url += (url.Contains('?') ? "&" : "?") + query;
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        AttachCredentials(request, connection);

        var response = await client.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        using var document = JsonDocument.Parse(body);

        return ParseQueryResult(document.RootElement, rowLimit);
    }

    private static void AttachCredentials(HttpRequestMessage request, DataSourceConnection connection)
    {
        if (string.IsNullOrWhiteSpace(connection.EncryptedCredentials))
        {
            return;
        }

        var credentials = JsonSerializer.Deserialize<RestCredentials>(connection.EncryptedCredentials);
        if (!string.IsNullOrWhiteSpace(credentials?.Token))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);
        }
    }

    private static QueryResult ParseQueryResult(JsonElement root, int rowLimit)
    {
        var items = root.ValueKind == JsonValueKind.Array
            ? root.EnumerateArray().ToList()
            : new List<JsonElement> { root };

        var sample = items.Count > 0 ? items[0] : default;

        var columns = new List<ColumnDescriptor>();
        if (sample.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in sample.EnumerateObject())
            {
                columns.Add(new ColumnDescriptor(property.Name, InferDataType(property.Value)));
            }
        }

        var rows = new List<object?[]>();
        foreach (var item in items.Take(rowLimit))
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var row = new object?[columns.Count];
            for (var i = 0; i < columns.Count; i++)
            {
                row[i] = item.TryGetProperty(columns[i].Name, out var value) ? ExtractValue(value) : null;
            }

            rows.Add(row);
        }

        return new QueryResult(columns, rows);
    }

    private static object? ExtractValue(JsonElement value)
    {
        return value.ValueKind switch
        {
            JsonValueKind.String => value.GetString(),
            JsonValueKind.Number => value.GetDouble(),
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            JsonValueKind.Null => null,
            _ => value.GetRawText()
        };
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

    private record RestCredentials(string? Token);
}
