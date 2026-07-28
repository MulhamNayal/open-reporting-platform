using Backend.Services.Widgets;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Route("api/reportpages/{reportPageId}/widgets")]
public class WidgetsController : ControllerBase
{
    private readonly IWidgetService _service;

    public WidgetsController(IWidgetService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<WidgetSummary>>> GetWidgets(int reportPageId)
    {
        return Ok(await _service.GetWidgetsAsync(reportPageId));
    }

    [HttpPut]
    public async Task<ActionResult<IReadOnlyList<WidgetSummary>>> SaveWidgets(int reportPageId, SaveWidgetsRequest request)
    {
        return Ok(await _service.SaveWidgetsAsync(reportPageId, request));
    }
}
