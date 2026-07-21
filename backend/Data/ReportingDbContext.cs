using Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Data;

public class ReportingDbContext : DbContext
{
    public ReportingDbContext(DbContextOptions<ReportingDbContext> options) : base(options)
    {
    }

    public DbSet<Report> Reports => Set<Report>();

    public DbSet<ReportPage> ReportPages => Set<ReportPage>();

    public DbSet<DataSourceConnection> DataSourceConnections => Set<DataSourceConnection>();

    public DbSet<Dataset> Datasets => Set<Dataset>();

    public DbSet<Widget> Widgets => Set<Widget>();

    public DbSet<WidgetBinding> WidgetBindings => Set<WidgetBinding>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.Entity<Report>().HasData(
            new Report { Id = 1, Name = "Monthly Sales", Description = "Sales totals grouped by month", DatasetId = null },
            new Report { Id = 2, Name = "Top Agents", Description = "Agents ranked by closed deals", DatasetId = null },
            new Report { Id = 3, Name = "Pipeline Overview", Description = "Open deals by stage", DatasetId = null }
        );

        modelBuilder.Entity<Widget>()
            .HasOne(w => w.Binding)
            .WithOne()
            .HasForeignKey<WidgetBinding>(b => b.WidgetId);
    }
}
