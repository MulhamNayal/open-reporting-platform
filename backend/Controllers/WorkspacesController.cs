using Backend.Services.Workspaces;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Route("api/workspaces")]
public class WorkspacesController : ControllerBase
{
    private readonly IWorkspaceService _service;

    public WorkspacesController(IWorkspaceService service)
    {
        _service = service;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<WorkspaceSummary>>> GetAll([FromQuery] bool includeInactive = false)
    {
        return Ok(await _service.GetAllAsync(includeInactive));
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<WorkspaceSummary>> GetById(int id)
    {
        return Ok(await _service.GetByIdAsync(id));
    }

    [HttpPost]
    public async Task<ActionResult<WorkspaceSummary>> Create(CreateWorkspaceRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        var workspace = await _service.CreateAsync(request);
        return Created($"/api/workspaces/{workspace.Id}", workspace);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<WorkspaceSummary>> Update(int id, UpdateWorkspaceRequest request)
    {
        // Null means "leave it", but an explicitly blank name would leave the rail with a nameless
        // entry, so it's rejected rather than stored.
        if (request.Name is not null && string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name cannot be blank.");
        }

        return Ok(await _service.UpdateAsync(id, request));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(int id)
    {
        await _service.DeleteAsync(id);
        return NoContent();
    }
}
