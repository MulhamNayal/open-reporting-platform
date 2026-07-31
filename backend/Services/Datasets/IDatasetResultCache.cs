using Backend.Services.DataSources;

namespace Backend.Services.Datasets;

public interface IDatasetResultCache
{
    /// <summary>Returns the cached result for this key, or null on a miss.</summary>
    QueryResult? Get(string key);

    void Set(string key, QueryResult result);
}
