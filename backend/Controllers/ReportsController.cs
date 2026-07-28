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
    public async Task<ActionResult<IEnumerable<ReportSummary>>> GetAll()
    {
        return Ok(await _service.GetAllAsync());
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

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        await _service.DeleteAsync(id);
        return NoContent();
    }

    [HttpPut("{id}/dataset")]
    public async Task<ActionResult<ReportSummary>> SetDataset(int id, SetReportDatasetRequest request)
    {
        return Ok(await _service.SetDatasetAsync(id, request));
    }
}
