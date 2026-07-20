using System.Net;

namespace Backend.Tests;

public sealed class FakeHttpMessageHandler : HttpMessageHandler
{
    private readonly HttpStatusCode _statusCode;
    private readonly string? _content;

    public FakeHttpMessageHandler(HttpStatusCode statusCode, string? content = null)
    {
        _statusCode = statusCode;
        _content = content;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var response = new HttpResponseMessage(_statusCode)
        {
            Content = _content is null ? null : new StringContent(_content)
        };
        return Task.FromResult(response);
    }
}
