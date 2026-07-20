using Backend.Models;

namespace Backend.Services;

public interface IReportRepository
{
    IReadOnlyList<Report> GetAll();

    Report Add(string name, string description);
}
