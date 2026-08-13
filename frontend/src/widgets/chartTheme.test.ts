import { describe, expect, it } from "vitest";
import { shapeBarOption, shapePieOption } from "./shaping";
import { chartCategoryAxis, chartGrid, chartLegend, chartValueAxis } from "./chartTheme";
import type { QueryResult } from "../api/datasets";

const result: QueryResult = {
  columns: [{ name: "Month", nativeType: "nvarchar" }, { name: "Revenue", nativeType: "decimal" }],
  rows: [["Jan", 100], ["Feb", 200]],
} as unknown as QueryResult;

describe("chart theme", () => {
  // Power BI anchors the plot on the category axis and puts gridlines on the value axis only. A
  // gridline per category turns a column chart into a grid.
  it("gives the category axis a line and no gridlines, and the value axis the reverse", () => {
    const category = chartCategoryAxis("light");
    expect(category.axisLine.show).toBe(true);
    expect(category.splitLine.show).toBe(false);
    expect(category.axisTick.show).toBe(false);

    const value = chartValueAxis("light");
    expect(value.axisLine.show).toBe(false);
    expect(value.splitLine.lineStyle.color).toBe("#EDEBE9");
  });

  it("uses Segoe UI and Power BI's secondary grey for labels", () => {
    const axis = chartValueAxis("light");
    expect(axis.axisLabel.fontFamily).toContain("Segoe UI");
    expect(axis.axisLabel.color).toBe("#605E5C");
  });

  // Labels at near-black on a dark surface are unreadable, so the neutrals invert with the theme.
  it("lightens labels and gridlines in dark mode", () => {
    expect(chartValueAxis("dark").axisLabel.color).toBe("#C8C6C4");
    expect(chartValueAxis("dark").splitLine.lineStyle.color).not.toBe(chartValueAxis("light").splitLine.lineStyle.color);
  });

  // ECharts floats a legend over the top-centre of the plot; Power BI puts it below, left-aligned.
  it("places the legend below the plot, left-aligned, with square markers", () => {
    const legend = chartLegend("light");
    expect(legend.bottom).toBe(0);
    expect(legend.left).toBe(0);
    expect(legend.icon).toBe("rect");
  });

  // A legend at bottom:0 sits on top of the axis labels unless the grid makes room for it.
  it("reserves bottom room for a legend only when there is one", () => {
    expect(chartGrid(true).bottom).toBeGreaterThan(chartGrid(false).bottom);
    expect(chartGrid(false).containLabel).toBe(true);
  });

  it("applies the theme to a bar chart's axes, text and tooltip", () => {
    const option = shapeBarOption(result, "Month", ["Revenue"], { showLegend: true });

    expect((option.textStyle as { fontFamily: string }).fontFamily).toContain("Segoe UI");
    expect((option.xAxis as { axisTick: { show: boolean } }).axisTick.show).toBe(false);
    expect((option.tooltip as { backgroundColor: string }).backgroundColor).toBe("#FFFFFF");
    expect((option.legend as { bottom: number }).bottom).toBe(0);
  });

  // The axis label formatter is what makes a value read as currency; the theme must not replace it.
  it("keeps the value formatter while adding label styling", () => {
    const option = shapeBarOption(result, "Month", ["Revenue"]);
    const axisLabel = (option.yAxis as { axisLabel: { formatter?: unknown; color?: string } }).axisLabel;

    expect(typeof axisLabel.formatter).toBe("function");
    expect(axisLabel.color).toBe("#605E5C");
  });

  // ECharts' default white slice border reads as a gap and vanishes on a dark background.
  it("removes the pie slice border", () => {
    const option = shapePieOption(result, "Month", "Revenue");
    const series = (option.series as Array<{ itemStyle: { borderWidth: number } }>)[0];

    expect(series.itemStyle.borderWidth).toBe(0);
  });
});
