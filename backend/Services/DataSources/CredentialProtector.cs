using Microsoft.AspNetCore.DataProtection;

namespace Backend.Services.DataSources;

public class CredentialProtector : ICredentialProtector
{
    private const string Purpose = "DataSourceCredentials";

    private readonly IDataProtector _protector;

    public CredentialProtector(IDataProtectionProvider provider)
    {
        _protector = provider.CreateProtector(Purpose);
    }

    public string Protect(string plaintext)
    {
        return _protector.Protect(plaintext);
    }

    public string Unprotect(string protectedText)
    {
        return _protector.Unprotect(protectedText);
    }
}
