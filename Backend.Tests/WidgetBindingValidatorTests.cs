using Backend.Models;
using Backend.Services.Widgets;
using Xunit;

namespace Backend.Tests;

public class WidgetBindingValidatorTests
{
    private readonly WidgetBindingValidator _validator = new();

    [Fact]
    public void Validate_TextWithNoBinding_Succeeds()
    {
        var result = _validator.Validate(WidgetType.Text, null);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Validate_TextWithBinding_Fails()
    {
        var binding = new SaveWidgetBindingRequest(null, new List<string> { "Anything" }, null);

        var result = _validator.Validate(WidgetType.Text, binding);

        Assert.False(result.IsValid);
        Assert.Equal("Text widgets must not have a binding.", result.Error);
    }

    [Fact]
    public void Validate_KpiWithCategoryField_Fails()
    {
        var binding = new SaveWidgetBindingRequest("Region", new List<string> { "Revenue" }, null);

        var result = _validator.Validate(WidgetType.Kpi, binding);

        Assert.False(result.IsValid);
        Assert.Equal("Kpi widgets must not have a CategoryField.", result.Error);
    }

    [Fact]
    public void Validate_KpiWithTwoValueFields_Fails()
    {
        var binding = new SaveWidgetBindingRequest(null, new List<string> { "Revenue", "Cost" }, null);

        var result = _validator.Validate(WidgetType.Kpi, binding);

        Assert.False(result.IsValid);
        Assert.Equal("Kpi widgets must have exactly one ValueField.", result.Error);
    }

    [Fact]
    public void Validate_KpiWithSingleValueFieldAndNoCategory_Succeeds()
    {
        var binding = new SaveWidgetBindingRequest(null, new List<string> { "Revenue" }, null);

        var result = _validator.Validate(WidgetType.Kpi, binding);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Validate_PieWithTwoValueFields_Fails()
    {
        var binding = new SaveWidgetBindingRequest("Region", new List<string> { "Revenue", "Cost" }, null);

        var result = _validator.Validate(WidgetType.Pie, binding);

        Assert.False(result.IsValid);
        Assert.Equal("Pie widgets must have exactly one ValueField.", result.Error);
    }

    [Fact]
    public void Validate_PieWithNoCategoryField_Fails()
    {
        var binding = new SaveWidgetBindingRequest(null, new List<string> { "Revenue" }, null);

        var result = _validator.Validate(WidgetType.Pie, binding);

        Assert.False(result.IsValid);
        Assert.Equal("Pie widgets require a CategoryField.", result.Error);
    }

    [Fact]
    public void Validate_BarWithNoCategoryField_Fails()
    {
        var binding = new SaveWidgetBindingRequest(null, new List<string> { "Revenue" }, null);

        var result = _validator.Validate(WidgetType.Bar, binding);

        Assert.False(result.IsValid);
        Assert.Equal("This widget type requires a CategoryField.", result.Error);
    }

    [Fact]
    public void Validate_BarWithCategoryAndMultipleValueFields_Succeeds()
    {
        var binding = new SaveWidgetBindingRequest("Month", new List<string> { "Revenue", "Cost" }, null);

        var result = _validator.Validate(WidgetType.Bar, binding);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Validate_LineWithNoValueFields_Fails()
    {
        var binding = new SaveWidgetBindingRequest("Month", new List<string>(), null);

        var result = _validator.Validate(WidgetType.Line, binding);

        Assert.False(result.IsValid);
        Assert.Equal("This widget type requires at least one ValueField.", result.Error);
    }

    [Fact]
    public void Validate_TableWithAnyValueFields_Succeeds()
    {
        var binding = new SaveWidgetBindingRequest(null, new List<string>(), null);

        var result = _validator.Validate(WidgetType.Table, binding);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Validate_UnconfiguredNonTextWidget_Succeeds()
    {
        var result = _validator.Validate(WidgetType.Bar, null);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void Validate_StillUnroutedNewWidgetType_FailsAsUnknown()
    {
        // StackedColumn/ClusteredBar/Area/Donut/Scatter aren't routed to their own cardinality
        // rule yet — that's Task 6. Until then they must fall through the validator's existing
        // default arm rather than crash, proving the enum addition alone didn't break anything.
        var binding = new SaveWidgetBindingRequest("Month", new List<string> { "Revenue" }, null);

        var result = _validator.Validate(WidgetType.Scatter, binding);

        Assert.False(result.IsValid);
        Assert.Equal("Unknown widget type 'Scatter'.", result.Error);
    }
}
