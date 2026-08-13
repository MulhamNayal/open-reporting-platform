using Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Backend.Data;

public class ReportingDbContext : DbContext
{
    public ReportingDbContext(DbContextOptions<ReportingDbContext> options) : base(options)
    {
    }

    public DbSet<Workspace> Workspaces => Set<Workspace>();

    public DbSet<Report> Reports => Set<Report>();

    public DbSet<ReportPage> ReportPages => Set<ReportPage>();

    public DbSet<DataSourceConnection> DataSourceConnections => Set<DataSourceConnection>();

    public DbSet<Dataset> Datasets => Set<Dataset>();

    public DbSet<Widget> Widgets => Set<Widget>();

    public DbSet<WidgetBinding> WidgetBindings => Set<WidgetBinding>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Seeded before the reports below, which all reference it. A report's WorkspaceId defaults
        // to this id, so no report can exist unfiled.
        modelBuilder.Entity<Workspace>().HasData(
            new Workspace
            {
                Id = Report.DefaultWorkspaceId,
                Name = "My workspace",
                Description = "Reports that haven't been filed anywhere else.",
                SortOrder = 0,
                IsActive = true,
                CreatedAtUtc = new DateTime(2026, 8, 13, 0, 0, 0, DateTimeKind.Utc),
            }
        );

        modelBuilder.Entity<Report>().HasData(
            new Report { Id = 1, Name = "Monthly Sales", Description = "Sales totals grouped by month", DatasetId = null },
            new Report { Id = 2, Name = "Top Agents", Description = "Agents ranked by closed deals", DatasetId = null },
            new Report { Id = 3, Name = "Pipeline Overview", Description = "Open deals by stage", DatasetId = null }
        );

        // No navigation property on Report: the codebase loads with explicit queries rather than
        // graph traversal, and a required relationship is enough to stop a report pointing at a
        // workspace that has been removed.
        modelBuilder.Entity<Report>()
            .HasOne<Workspace>()
            .WithMany()
            .HasForeignKey(r => r.WorkspaceId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Widget>()
            .HasOne(w => w.Binding)
            .WithOne()
            .HasForeignKey<WidgetBinding>(b => b.WidgetId);
    }
}
