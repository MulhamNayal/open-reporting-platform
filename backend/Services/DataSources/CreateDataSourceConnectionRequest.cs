using Backend.Models;

namespace Backend.Services.DataSources;

public record CreateDataSourceConnectionRequest(string Name, DataSourceType Type, string Host, string? DatabaseName, string CredentialsJson);
