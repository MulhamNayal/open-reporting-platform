namespace Backend.Tests;

public sealed class FakeHttpClientFactory : IHttpClientFactory
{
    private readonly HttpClient _client;

    public FakeHttpClientFactory(HttpMessageHandler handler)
    {
        _client = new HttpClient(handler);
    }

    public HttpClient CreateClient(string name) => _client;
}
