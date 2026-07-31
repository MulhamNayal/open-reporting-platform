using Backend.Services.DataSources;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;

namespace Backend.Services.Datasets;

/// <summary>
/// In-process cache. The app is deployed as a single IIS site, so there is nothing to share
/// state with; swap this for a distributed implementation if that ever changes.
/// </summary>
public class MemoryDatasetResultCache : IDatasetResultCache
{
    private readonly IMemoryCache _cache;
    private readonly DatasetCacheOptions _options;

    public MemoryDatasetResultCache(IMemoryCache cache, IOptions<DatasetCacheOptions> options)
    {
        _cache = cache;
        _options = options.Value;
    }

    public QueryResult? Get(string key)
    {
        if (!_options.Enabled)
        {
            return null;
        }

        return _cache.TryGetValue(key, out QueryResult? result) ? result : null;
    }

    public void Set(string key, QueryResult result)
    {
        if (!_options.Enabled)
        {
            return;
        }

        _cache.Set(key, result, TimeSpan.FromSeconds(_options.TtlSeconds));
    }
}
