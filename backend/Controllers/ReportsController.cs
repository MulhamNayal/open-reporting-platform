using Backend.Services.Reports;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Route("api/reports")]
public class ReportsController : ControllerBase
{
    private readonly IReportService _service;

    public ReportsController(IReportService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<ReportSummary>>> GetAll(
        [FromQuery] bool includeInactive = false, [FromQuery] int? workspaceId = null)
    {
        return Ok(await _service.GetAllAsync(includeInactive, workspaceId));
    }

    [HttpPut("{id}/workspace")]
    public async Task<ActionResult<ReportSummary>> SetWorkspace(int id, SetReportWorkspaceRequest request)
    {
        return Ok(await _service.SetWorkspaceAsync(id, request));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<ReportSummary>> GetById(int id)
    {
        return Ok(await _service.GetByIdAsync(id));
    }

    [HttpPost]
    public async Task<ActionResult<ReportSummary>> Create(CreateReportRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        var report = await _service.CreateAsync(request);
        return Created($"/api/reports/{report.Id}", report);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<ReportSummary>> Rename(int id, RenameReportRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        return Ok(await _service.RenameAsync(id, request));
    }

    [HttpPost("{id}/duplicate")]
    public async Task<ActionResult<ReportSummary>> Duplicate(int id, DuplicateReportRequest request)
    {
        var report = await _service.DuplicateAsync(id, request);
        return Created($"/api/reports/{report.Id}", report);
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        await _service.DeleteAsync(id);
        return NoContent();
    }

    [HttpPut("{id}/active")]
    public async Task<ActionResult<ReportSummary>> SetActive(int id, SetReportActiveRequest request)
    {
        return Ok(await _service.SetActiveAsync(id, request));
    }

    // Separate from GET {id} on purpose: only the viewer records a view, so opening the
    // editor doesn't make an unused report look busy.
    [HttpPost("{id}/view")]
    public async Task<IActionResult> RecordView(int id)
    {
        await _service.RecordViewAsync(id);
        return NoContent();
    }

    [HttpPut("{id}/dataset")]
    public async Task<ActionResult<ReportSummary>> SetDataset(int id, SetReportDatasetRequest request)
    {
        return Ok(await _service.SetDatasetAsync(id, request));
    }
}
