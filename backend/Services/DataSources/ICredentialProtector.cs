namespace Backend.Services.DataSources;

public interface ICredentialProtector
{
    string Protect(string plaintext);

    string Unprotect(string protectedText);
}
