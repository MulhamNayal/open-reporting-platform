using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Route("api/datasets")]
public class DatasetsController : ControllerBase
{
    private readonly IDatasetService _service;

    public DatasetsController(IDatasetService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<DatasetSummary>>> GetAll([FromQuery] int connectionId)
    {
        return Ok(await _service.ListAsync(connectionId));
    }

    [HttpPost]
    public async Task<ActionResult<DatasetSummary>> Create(CreateDatasetRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        try
        {
            var summary = await _service.CreateAsync(request with { IsSaved = true });
            return Created($"/api/datasets/{summary.Id}", summary);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        try
        {
            await _service.DeleteAsync(id);
            return NoContent();
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpPost("{id}/promote")]
    public async Task<ActionResult<DatasetSummary>> Promote(int id, PromoteDatasetRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        try
        {
            return Ok(await _service.PromoteAsync(id, request.Name!));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpPost("{id}/columns")]
    public async Task<ActionResult<IEnumerable<ColumnDescriptor>>> DiscoverColumns(int id)
    {
        try
        {
            return Ok(await _service.DiscoverColumnsAsync(id));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
        catch (Exception ex)
        {
            return Problem(detail: ex.Message, statusCode: StatusCodes.Status502BadGateway);
        }
    }

    [HttpPost("{id}/execute")]
    public async Task<ActionResult<QueryResult>> Execute(int id)
    {
        try
        {
            return Ok(await _service.ExecuteAsync(id));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
        catch (Exception ex)
        {
            return Problem(detail: ex.Message, statusCode: StatusCodes.Status502BadGateway);
        }
    }
}
