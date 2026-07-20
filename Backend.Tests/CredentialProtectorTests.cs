using Backend.Services.DataSources;
using Microsoft.AspNetCore.DataProtection;

namespace Backend.Tests;

public class CredentialProtectorTests
{
    private static ICredentialProtector CreateProtector()
    {
        var provider = new EphemeralDataProtectionProvider();
        return new CredentialProtector(provider);
    }

    [Fact]
    public void Protect_ThenUnprotect_ReturnsOriginalPlaintext()
    {
        var protector = CreateProtector();
        var plaintext = """{"username":"sa","password":"correct-horse-battery-staple"}""";

        var protectedText = protector.Protect(plaintext);
        var roundTripped = protector.Unprotect(protectedText);

        Assert.Equal(plaintext, roundTripped);
    }

    [Fact]
    public void Protect_DoesNotReturnThePlaintextVerbatim()
    {
        var protector = CreateProtector();
        var plaintext = """{"username":"sa","password":"correct-horse-battery-staple"}""";

        var protectedText = protector.Protect(plaintext);

        Assert.DoesNotContain("correct-horse-battery-staple", protectedText);
    }
}
