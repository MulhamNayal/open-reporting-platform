import type { WidgetType } from "../api/widgets";

export const VIZ_LABELS: Record<WidgetType, string> = {
  Bar: "Clustered column",
  ClusteredBar: "Clustered bar",
  StackedColumn: "Stacked column",
  Line: "Line chart",
  Area: "Area chart",
  Pie: "Pie chart",
  Donut: "Donut chart",
  Scatter: "Scatter chart",
  Kpi: "Card (KPI)",
  Table: "Table",
  Text: "Text box",
};

// Path data copied verbatim from report-designer.html's VIZ_ICONS map (viewBox 0 0 24 24).
export const VIZ_ICON_PATHS: Record<Exclude<WidgetType, "Text">, string> = {
  Bar: '<rect x="4" y="11" width="4" height="9"/><rect x="10" y="6" width="4" height="14"/><rect x="16" y="13" width="4" height="7"/>',
  ClusteredBar: '<rect x="4" y="4" width="10" height="4"/><rect x="4" y="10" width="15" height="4"/><rect x="4" y="16" width="7" height="4"/>',
  StackedColumn: '<rect x="5" y="12" width="5" height="8"/><rect x="5" y="7" width="5" height="4"/><rect x="14" y="9" width="5" height="11"/><rect x="14" y="4" width="5" height="4"/>',
  Line: '<polyline points="4,16 9,10 13,13 20,5" fill="none" stroke-width="2"/>',
  Area: '<path d="M4 17l5-6 4 3 7-8v11z" fill-opacity=".35"/><polyline points="4,17 9,11 13,14 20,6" fill="none" stroke-width="2"/>',
  Pie: '<path d="M12 12V3a9 9 0 1 0 9 9z" fill-opacity=".35"/><path d="M12 12V3a9 9 0 0 1 9 9z"/>',
  Donut: '<circle cx="12" cy="12" r="8" fill="none" stroke-width="6" stroke-dasharray="34 60"/>',
  Scatter: '<circle cx="7" cy="15" r="1.6"/><circle cx="11" cy="9" r="1.6"/><circle cx="15" cy="13" r="1.6"/><circle cx="18" cy="6" r="1.6"/><circle cx="9" cy="17" r="1.6"/>',
  Kpi: '<rect x="4" y="6" width="16" height="12" rx="2" fill="none" stroke-width="2"/><path d="M8 13h6M8 10h3" stroke-width="2"/>',
  Table: '<rect x="4" y="5" width="16" height="14" rx="1.5" fill="none" stroke-width="1.8"/><path d="M4 9.5h16M4 14h16M11 5.5v13" stroke-width="1.5"/>',
};

// Picker-grid order, matching report-designer.html's VTYPES key order.
export const VIZ_PICKER_ORDER: Array<Exclude<WidgetType, "Text">> = [
  "Bar", "ClusteredBar", "StackedColumn", "Line", "Area", "Pie", "Donut", "Scatter", "Kpi", "Table",
];
