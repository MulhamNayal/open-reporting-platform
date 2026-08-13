import type { ThemeMode } from "../appearance/AppearanceContext";

/**
 * The chart styling Power BI applies to every visual, in one place.
 *
 * Charts were rendering with ECharts' defaults — 12px sans-serif in near-black, a tick mark on
 * every label, gridlines on both axes, and a legend floating in the top-centre over the plot. Power
 * BI is specific and consistent about all of it: Segoe UI, secondary-grey labels, no tick marks, a
 * horizontal gridline only, and the legend below the plot.
 *
 * Kept out of `theme.ts` on purpose: that file is MUI's theme, and these are ECharts option
 * fragments. Kept out of the shape functions so a bar, a line and a scatter can't drift apart.
 */

// Segoe UI Semibold isn't a separate family to ECharts — weight is set where a heavier label is
// wanted. 12px matches the theme's 10pt body at 96dpi closely enough to look native beside it.
const FONT = "'Segoe UI', 'Segoe UI Web (West European)', system-ui, sans-serif";
const FONT_SIZE = 12;

interface ChartThemeColors {
  label: string;
  line: string;
  grid: string;
  tooltipBg: string;
  tooltipText: string;
}

// Power BI's own neutrals: #605E5C secondary text on #E1DFDD hairlines. The dark values are the
// same relationship inverted rather than a separate palette, so a chart reads the same either way.
const LIGHT: ChartThemeColors = {
  label: "#605E5C",
  line: "#E1DFDD",
  grid: "#EDEBE9",
  tooltipBg: "#FFFFFF",
  tooltipText: "#252423",
};

const DARK: ChartThemeColors = {
  label: "#C8C6C4",
  line: "#484644",
  grid: "#3B3A39",
  tooltipBg: "#292827",
  tooltipText: "#F3F2F1",
};

function colorsFor(mode: ThemeMode): ChartThemeColors {
  return mode === "dark" ? DARK : LIGHT;
}

export function chartTextStyle(mode: ThemeMode) {
  return { fontFamily: FONT, fontSize: FONT_SIZE, color: colorsFor(mode).label };
}

export function chartAxisLabel(mode: ThemeMode) {
  return { fontFamily: FONT, fontSize: FONT_SIZE, color: colorsFor(mode).label };
}

/**
 * The category axis keeps its line — Power BI anchors the plot on it — and loses its tick marks and
 * gridlines. A gridline per category turns a column chart into a grid.
 */
export function chartCategoryAxis(mode: ThemeMode) {
  const c = colorsFor(mode);
  return {
    axisLine: { show: true, lineStyle: { color: c.line } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: chartAxisLabel(mode),
  };
}

/**
 * The value axis is the opposite: no line of its own, but horizontal gridlines to read values
 * against. `show` is left out so a widget's own grid setting still decides it.
 */
export function chartValueAxis(mode: ThemeMode) {
  const c = colorsFor(mode);
  return {
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: c.grid, width: 1 } },
    axisLabel: chartAxisLabel(mode),
  };
}

/** Below the plot and left-aligned, with the small square markers Power BI uses. */
export function chartLegend(mode: ThemeMode) {
  return {
    show: true,
    bottom: 0,
    left: 0,
    icon: "rect" as const,
    itemWidth: 9,
    itemHeight: 9,
    itemGap: 12,
    textStyle: chartTextStyle(mode),
  };
}

/**
 * Tight margins with containLabel, so the plot fills the tile the way a Power BI visual does
 * instead of sitting in ECharts' default padding. The bottom leaves room for a legend when there is
 * one — a legend at bottom:0 otherwise sits on top of the axis labels.
 */
export function chartGrid(hasLegend: boolean) {
  return { top: 16, right: 16, bottom: hasLegend ? 30 : 8, left: 8, containLabel: true };
}

/** A flat white card with a hairline border, not ECharts' translucent dark bubble. */
export function chartTooltip(mode: ThemeMode) {
  const c = colorsFor(mode);
  return {
    backgroundColor: c.tooltipBg,
    borderColor: c.line,
    borderWidth: 1,
    padding: [6, 8] as [number, number],
    textStyle: { fontFamily: FONT, fontSize: FONT_SIZE, color: c.tooltipText },
    extraCssText: "box-shadow: 0 2px 8px rgba(0,0,0,0.10); border-radius: 2px;",
  };
}
