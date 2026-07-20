using Backend.Data;
using Backend.Models;

namespace Backend.Services;

public class EfReportRepository : IReportRepository
{
    private readonly ReportingDbContext _context;

    public EfReportRepository(ReportingDbContext context)
    {
        _context = context;
    }

    public IReadOnlyList<Report> GetAll()
    {
        return _context.Reports.ToList();
    }

    public Report Add(string name, string description)
    {
        var report = new Report(0, name, description);
        _context.Reports.Add(report);
        _context.SaveChanges();
        return report;
    }
}
