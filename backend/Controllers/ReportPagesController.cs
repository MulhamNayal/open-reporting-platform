using Backend.Services.ReportPages;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Route("api/reports/{reportId}/pages")]
public class ReportPagesController : ControllerBase
{
    private readonly IReportPageService _service;

    public ReportPagesController(IReportPageService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<ReportPageSummary>>> GetPages(int reportId)
    {
        try
        {
            return Ok(await _service.GetPagesAsync(reportId));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpPost]
    public async Task<ActionResult<ReportPageSummary>> Create(int reportId, CreateReportPageRequest request)
    {
        try
        {
            var summary = await _service.CreateAsync(reportId, request);
            return Created($"/api/reports/{reportId}/pages/{summary.Id}", summary);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpPut("{pageId}")]
    public async Task<ActionResult<ReportPageSummary>> Update(int reportId, int pageId, UpdateReportPageRequest request)
    {
        try
        {
            return Ok(await _service.UpdateAsync(reportId, pageId, request));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpDelete("{pageId}")]
    public async Task<IActionResult> Delete(int reportId, int pageId)
    {
        try
        {
            await _service.DeleteAsync(reportId, pageId);
            return NoContent();
        }
        catch (LastPageDeletionException ex)
        {
            return Conflict(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }
}
