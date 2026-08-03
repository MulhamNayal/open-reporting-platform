using System.Collections.Concurrent;

namespace Backend.Services.Materialization;

/// <summary>
/// Tracks which datasets are mid-materialisation. Singleton, because the point is to stop two
/// callers — the scheduler and someone pressing Refresh, or two people pressing it at once —
/// running the same load concurrently and racing on the table swap.
/// </summary>
public interface IMaterializationTracker
{
    /// <summary>Returns false if this dataset is already being materialised.</summary>
    bool TryBegin(int datasetId);

    void End(int datasetId);

    bool IsRunning(int datasetId);
}

public class MaterializationTracker : IMaterializationTracker
{
    private readonly ConcurrentDictionary<int, byte> _running = new();

    public bool TryBegin(int datasetId) => _running.TryAdd(datasetId, 0);

    public void End(int datasetId) => _running.TryRemove(datasetId, out _);

    public bool IsRunning(int datasetId) => _running.ContainsKey(datasetId);
}
