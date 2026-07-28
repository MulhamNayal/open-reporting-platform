using Backend.Exceptions;
using Backend.Middleware;
using Backend.Services.DataSources;
using Backend.Services.ReportPages;
using Backend.Services.Widgets;
using Xunit;

namespace Backend.Tests;

public class GlobalExceptionHandlerTests
{
    [Theory]
    [InlineData(typeof(NotFoundException), 404)]
    [InlineData(typeof(LastPageDeletionException), 409)]
    [InlineData(typeof(WidgetValidationException), 400)]
    [InlineData(typeof(UnsupportedQueryOperationException), 400)]
    [InlineData(typeof(InvalidOperationException), 400)]
    [InlineData(typeof(TimeoutException), 502)]
    [InlineData(typeof(Exception), 502)]
    public void MapStatusCode_ReturnsExpectedStatusForEachExceptionType(Type exceptionType, int expectedStatus)
    {
        var exception = (Exception)Activator.CreateInstance(exceptionType, "message")!;

        var statusCode = GlobalExceptionHandler.MapStatusCode(exception);

        Assert.Equal(expectedStatus, statusCode);
    }
}
