using Backend.Models;

namespace Backend.Services;

public class InMemoryReportRepository : IReportRepository
{
    private readonly List<Report> _reports = new();
    private readonly object _lock = new();
    private int _nextId = 1;

    public InMemoryReportRepository()
    {
        Add("Monthly Sales", "Sales totals grouped by month");
        Add("Top Agents", "Agents ranked by closed deals");
        Add("Pipeline Overview", "Open deals by stage");
    }

    public IReadOnlyList<Report> GetAll()
    {
        lock (_lock)
        {
            return _reports.ToList();
        }
    }

    public Report Add(string name, string description)
    {
        lock (_lock)
        {
            var report = new Report(_nextId++, name, description);
            _reports.Add(report);
            return report;
        }
    }
}
