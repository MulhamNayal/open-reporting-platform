using Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Data;

public class ReportingDbContext : DbContext
{
    public ReportingDbContext(DbContextOptions<ReportingDbContext> options) : base(options)
    {
    }

    public DbSet<Report> Reports => Set<Report>();

    public DbSet<DataSourceConnection> DataSourceConnections => Set<DataSourceConnection>();

    public DbSet<Dataset> Datasets => Set<Dataset>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Report>().HasData(
            new Report(1, "Monthly Sales", "Sales totals grouped by month"),
            new Report(2, "Top Agents", "Agents ranked by closed deals"),
            new Report(3, "Pipeline Overview", "Open deals by stage")
        );
    }
}

