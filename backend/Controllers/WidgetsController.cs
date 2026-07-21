using Backend.Services.Widgets;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Route("api/reports/{reportId}/widgets")]
public class WidgetsController : ControllerBase
{
    private readonly IWidgetService _service;

    public WidgetsController(IWidgetService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<WidgetSummary>>> GetWidgets(int reportId)
    {
        try
        {
            return Ok(await _service.GetWidgetsAsync(reportId));
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }

    [HttpPut]
    public async Task<ActionResult<IReadOnlyList<WidgetSummary>>> SaveWidgets(int reportId, SaveWidgetsRequest request)
    {
        try
        {
            return Ok(await _service.SaveWidgetsAsync(reportId, request));
        }
        catch (WidgetValidationException ex)
        {
            return BadRequest(ex.Message);
        }
        catch (InvalidOperationException ex)
        {
            return NotFound(ex.Message);
        }
    }
}
