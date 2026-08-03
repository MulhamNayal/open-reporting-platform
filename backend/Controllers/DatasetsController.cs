using Backend.Services.DataSources;
using Backend.Services.Materialization;
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

    [HttpGet("{id}")]
    public async Task<ActionResult<DatasetSummary>> GetById(int id)
    {
        return Ok(await _service.GetByIdAsync(id));
    }

    [HttpPost]
    public async Task<ActionResult<DatasetSummary>> Create(CreateDatasetRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        var summary = await _service.CreateAsync(request with { IsSaved = true });
        return Created($"/api/datasets/{summary.Id}", summary);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<DatasetSummary>> Update(int id, UpdateDatasetRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        return Ok(await _service.UpdateAsync(id, request));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        await _service.DeleteAsync(id);
        return NoContent();
    }

    [HttpPost("{id}/promote")]
    public async Task<ActionResult<DatasetSummary>> Promote(int id, PromoteDatasetRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        return Ok(await _service.PromoteAsync(id, request.Name!));
    }

    [HttpPost("{id}/columns")]
    public async Task<ActionResult<IEnumerable<ColumnDescriptor>>> DiscoverColumns(int id)
    {
        return Ok(await _service.DiscoverColumnsAsync(id));
    }

    // Import datasets only — runs the source in full and replaces the materialised copy.
    [HttpPost("{id}/materialize")]
    public async Task<ActionResult<MaterializationResult>> Materialize(int id, [FromServices] IMaterializationService materialization)
    {
        return Ok(await materialization.MaterializeAsync(id, HttpContext.RequestAborted));
    }

    // refresh=true bypasses the result cache — used by the Ribbon's Refresh action.
    [HttpPost("{id}/execute")]
    public async Task<ActionResult<QueryResult>> Execute(int id, [FromQuery] bool refresh = false)
    {
        return Ok(await _service.ExecuteAsync(id, refresh));
    }
}
