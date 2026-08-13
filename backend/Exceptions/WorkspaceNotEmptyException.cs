namespace Backend.Exceptions;

/// <summary>
/// Deleting a workspace that still holds reports would orphan them, and deleting the last one
/// would leave nowhere for a new report to go. Mapped to 409, alongside
/// <see cref="LastPageDeletionException"/>, which exists for the same reason.
/// </summary>
public class WorkspaceNotEmptyException : Exception
{
    public WorkspaceNotEmptyException(string message) : base(message)
    {
    }
}
