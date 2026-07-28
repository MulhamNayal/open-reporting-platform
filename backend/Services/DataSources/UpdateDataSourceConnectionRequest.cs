namespace Backend.Services.DataSources;

// CredentialsJson is nullable/optional on purpose: leaving it blank keeps the connection's
// existing (still-encrypted) credentials rather than requiring them to be re-entered on every
// edit. The plaintext is never sent back to the client to populate this field.
public record UpdateDataSourceConnectionRequest(string Name, string Host, string? DatabaseName, string? CredentialsJson);
