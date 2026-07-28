using Backend.Exceptions;
using Backend.Services.DataSources;
using Backend.Services.ReportPages;
using Backend.Services.Widgets;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Middleware;

// Replaces the per-controller try/catch blocks that used to translate service-layer exceptions
// into HTTP responses. Every controller action now lets exceptions propagate; this single place
// maps them to a status code, matching exactly what the old scattered catches produced:
//   - 400/404/409 responses carry the exception's message as a plain string body, since the
//     frontend (e.g. ReportsPage.tsx, DatasetsPage.tsx) reads `err.response.data` directly as a
//     string for these — that's what BadRequest(string)/NotFound(string)/Conflict(string) used
//     to produce, and changing it would silently break those error messages.
//   - Anything unrecognized (502) keeps the existing ProblemDetails-with-`detail` shape, since
//     that's what the frontend's 502 handling (e.g. DatasetsPage's columnPreviewError) reads.
public class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger)
    {
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        var statusCode = MapStatusCode(exception);
        httpContext.Response.StatusCode = statusCode;

        if (statusCode >= StatusCodes.Status500InternalServerError)
        {
            _logger.LogError(exception, "Unhandled exception mapped to status {StatusCode}", statusCode);

            var problemDetails = new ProblemDetails
            {
                Type = "https://tools.ietf.org/html/rfc9110#section-15.6.3",
                Title = "Bad Gateway",
                Status = statusCode,
                Detail = exception.Message,
            };
            problemDetails.Extensions["traceId"] = httpContext.TraceIdentifier;

            await httpContext.Response.WriteAsJsonAsync(problemDetails, cancellationToken);
        }
        else
        {
            await httpContext.Response.WriteAsJsonAsync(exception.Message, cancellationToken);
        }

        return true;
    }

    public static int MapStatusCode(Exception exception) => exception switch
    {
        NotFoundException => StatusCodes.Status404NotFound,
        LastPageDeletionException => StatusCodes.Status409Conflict,
        WidgetValidationException => StatusCodes.Status400BadRequest,
        UnsupportedQueryOperationException => StatusCodes.Status400BadRequest,
        InvalidOperationException => StatusCodes.Status400BadRequest,
        _ => StatusCodes.Status502BadGateway,
    };
}
