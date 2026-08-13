namespace Backend.Models;

/// <summary>
/// A named container that reports belong to. One report is in exactly one workspace.
///
/// Deliberately holds no owner or permission fields: there is no user model yet, so a workspace
/// cannot mean "who may see this" and inventing the column would promise something the platform
/// can't honour. Datasets stay attached to their connection rather than to a workspace — they are
/// shared across reports today, and scoping them would either duplicate them or break that sharing.
/// </summary>
public class Workspace
{
    public int Id { get; set; }

    public string Name { get; set; } = "";

    public string Description { get; set; } = "";

    /// <summary>
    /// Position in the navigation rail. Explicit rather than alphabetical so the busiest workspace
    /// can sit at the top, which is how the tool this replaces orders its own list.
    /// </summary>
    public int SortOrder { get; set; }

    public bool IsActive { get; set; } = true;

    public DateTime CreatedAtUtc { get; set; }
}
