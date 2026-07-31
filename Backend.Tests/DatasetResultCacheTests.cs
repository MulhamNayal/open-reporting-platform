using Backend.Services.DataSources;
using Backend.Services.Datasets;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Options;
using Xunit;

namespace Backend.Tests;

public class DatasetResultCacheTests
{
    private static MemoryDatasetResultCache MakeCache(int ttlSeconds) =>
        new(new MemoryCache(new MemoryCacheOptions()),
            Options.Create(new DatasetCacheOptions { TtlSeconds = ttlSeconds }));

    private static QueryResult SampleResult() =>
        new(new List<ColumnDescriptor> { new("Region", "nvarchar(20)") },
            new List<object?[]> { new object?[] { "North" } });

    [Fact]
    public void Get_KeyNeverSet_ReturnsNull()
    {
        var cache = MakeCache(DatasetCacheOptions.DefaultTtlSeconds);

        Assert.Null(cache.Get("dataset:1:v1:rows10000"));
    }

    [Fact]
    public void Get_AfterSet_ReturnsSameResult()
    {
        var cache = MakeCache(DatasetCacheOptions.DefaultTtlSeconds);
        var result = SampleResult();

        cache.Set("dataset:1:v1:rows10000", result);

        Assert.Same(result, cache.Get("dataset:1:v1:rows10000"));
    }

    [Fact]
    public void Get_DifferentDefinitionVersion_IsAMiss()
    {
        // The whole point of versioning the key: an edited dataset can never serve a stale entry.
        var cache = MakeCache(DatasetCacheOptions.DefaultTtlSeconds);
        cache.Set("dataset:1:v1:rows10000", SampleResult());

        Assert.Null(cache.Get("dataset:1:v2:rows10000"));
    }

    [Fact]
    public void Get_DifferentRowLimit_IsAMiss()
    {
        var cache = MakeCache(DatasetCacheOptions.DefaultTtlSeconds);
        cache.Set("dataset:1:v1:rows100", SampleResult());

        Assert.Null(cache.Get("dataset:1:v1:rows5000"));
    }

    [Fact]
    public void Set_WhenTtlIsZero_CachingIsDisabled()
    {
        var cache = MakeCache(0);

        cache.Set("dataset:1:v1:rows10000", SampleResult());

        Assert.Null(cache.Get("dataset:1:v1:rows10000"));
    }

    [Fact]
    public void DefaultTtl_IsLongEnoughToSpanAPageLoad()
    {
        Assert.True(DatasetCacheOptions.DefaultTtlSeconds >= 60);
    }
}
