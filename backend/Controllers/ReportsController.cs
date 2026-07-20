using Backend.Models;
using Backend.Services;
using Microsoft.AspNetCore.Mvc;

namespace Backend.Controllers;

[ApiController]
[Route("api/reports")]
public class ReportsController : ControllerBase
{
    private readonly IReportRepository _repository;

    public ReportsController(IReportRepository repository)
    {
        _repository = repository;
    }

    [HttpGet]
    public ActionResult<IEnumerable<Report>> GetAll()
    {
        return Ok(_repository.GetAll());
    }

    [HttpPost]
    public ActionResult<Report> Create(CreateReportRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Name))
        {
            return BadRequest("Name is required.");
        }

        var report = _repository.Add(request.Name, request.Description ?? "");
        return Created($"/api/reports/{report.Id}", report);
    }
}

public record CreateReportRequest(string? Name, string? Description);
