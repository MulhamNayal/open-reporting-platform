namespace Backend.Models;

public class DataSourceConnection
{
    public int Id { get; set; }

    public string Name { get; set; } = "";

    public DataSourceType Type { get; set; }

    public string Host { get; set; } = "";

    public string? DatabaseName { get; set; }

    public string EncryptedCredentials { get; set; } = "";

    public DateTime CreatedAtUtc { get; set; }
}
