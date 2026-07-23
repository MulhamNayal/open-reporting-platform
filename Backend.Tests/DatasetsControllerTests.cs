using Backend.Controllers;
using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Microsoft.AspNetCore.Mvc;
using Xunit;

namespace Backend.Tests;

public class DatasetsControllerTests
{
    private class StubDatasetService : IDatasetService
    {
        public Func<int, Task<QueryResult>>? ExecuteAsyncFunc { get; set; }

        public Task<DatasetSummary> CreateAsync(CreateDatasetRequest request) => throw new NotImplementedException();
        public Task<IReadOnlyList<DatasetSummary>> ListAsync(int connectionId) => throw new NotImplementedException();
        public Task<IReadOnlyList<ColumnDescriptor>> DiscoverColumnsAsync(int datasetId) => throw new NotImplementedException();
        public Task DeleteAsync(int id) => throw new NotImplementedException();
        public Task<DatasetSummary> PromoteAsync(int id, string name) => throw new NotImplementedException();

        public Task<QueryResult> ExecuteAsync(int datasetId) =>
            ExecuteAsyncFunc?.Invoke(datasetId) ?? throw new NotImplementedException();
    }

    [Fact]
    public async Task Execute_UnsupportedQueryOperation_Returns400()
    {
        var stub = new StubDatasetService
        {
            ExecuteAsyncFunc = _ => throw new UnsupportedQueryOperationException("Unsupported filter operator: DROP"),
        };
        var controller = new DatasetsController(stub);

        var result = await controller.Execute(1);

        var badRequest = Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal("Unsupported filter operator: DROP", badRequest.Value);
    }

    [Fact]
    public async Task Execute_DatasetNotFound_Returns404()
    {
        var stub = new StubDatasetService
        {
            ExecuteAsyncFunc = _ => throw new InvalidOperationException("No dataset found with id 999."),
        };
        var controller = new DatasetsController(stub);

        var result = await controller.Execute(999);

        var notFound = Assert.IsType<NotFoundObjectResult>(result.Result);
        Assert.Equal("No dataset found with id 999.", notFound.Value);
    }

    [Fact]
    public async Task Execute_OtherFailure_Returns502()
    {
        // InvalidOperationException always maps to 404 regardless of inner exception, so use a
        // genuinely different exception type to exercise the generic catch-all -> 502 path.
        var stub502 = new StubDatasetService
        {
            ExecuteAsyncFunc = _ => throw new TimeoutException("db unreachable"),
        };
        var controller = new DatasetsController(stub502);

        var result = await controller.Execute(1);

        var problem = Assert.IsType<ObjectResult>(result.Result);
        Assert.Equal(502, problem.StatusCode);
    }
}
