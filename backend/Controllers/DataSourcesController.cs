using Backend.Services.DataSources;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Route("api/datasources")]
public class DataSourcesController : ControllerBase
{
    private readonly IDataSourceService _service;

    public DataSourcesController(IDataSourceService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<DataSourceConnectionSummary>>> GetAll()
    {
        return Ok(await _service.ListAsync());
    }

    [HttpPost]
    public async Task<ActionResult<DataSourceConnectionSummary>> Create(CreateDataSourceConnectionRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Host))
        {
            return BadRequest("Host is required.");
        }

        var summary = await _service.CreateAsync(request);
        return Created($"/api/datasources/{summary.Id}", summary);
    }

    [HttpPost("{id}/test")]
    public async Task<ActionResult<ConnectionTestResult>> Test(int id)
    {
        return Ok(await _service.TestAsync(id));
    }

    [HttpGet("{id}/schema")]
    public async Task<ActionResult<SchemaDescriptor>> Schema(int id)
    {
        return Ok(await _service.DiscoverSchemaAsync(id));
    }
}
