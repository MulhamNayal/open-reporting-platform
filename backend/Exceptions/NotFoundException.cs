namespace Backend.Exceptions;

// Distinct from InvalidOperationException (used for validation failures, mapped to 400) so the
// global exception handler can tell "no entity with this id" apart from "the request was bad"
// by type alone, without parsing exception messages.
public class NotFoundException : Exception
{
    public NotFoundException(string message) : base(message)
    {
    }
}
