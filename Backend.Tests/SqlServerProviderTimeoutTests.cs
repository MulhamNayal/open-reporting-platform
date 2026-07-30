using Backend.Services.DataSources;
using Microsoft.Extensions.Options;
using Xunit;

namespace Backend.Tests;

public class SqlServerProviderTimeoutTests
{
    [Fact]
    public void CommandTimeoutSeconds_NoOptionsSupplied_UsesDefault()
    {
        var provider = new SqlServerProvider();

        Assert.Equal(SqlServerProviderOptions.DefaultCommandTimeoutSeconds, provider.CommandTimeoutSeconds);
    }

    [Fact]
    public void CommandTimeoutSeconds_OptionsSupplied_UsesConfiguredValue()
    {
        var provider = new SqlServerProvider(Options.Create(new SqlServerProviderOptions { CommandTimeoutSeconds = 45 }));

        Assert.Equal(45, provider.CommandTimeoutSeconds);
    }

    [Fact]
    public void DefaultCommandTimeoutSeconds_IsLongerThanAdoNetsThirtySecondDefault()
    {
        // The whole point of the option: a page fetches its widgets' datasets concurrently, so
        // several slow reporting procedures overlap and 30s isn't enough.
        Assert.True(SqlServerProviderOptions.DefaultCommandTimeoutSeconds > 30);
    }
}
