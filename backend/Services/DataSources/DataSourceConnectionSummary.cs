using Backend.Models;

namespace Backend.Services.DataSources;

public record DataSourceConnectionSummary(int Id, string Name, DataSourceType Type, string Host, string? DatabaseName, DateTime CreatedAtUtc);
