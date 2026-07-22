import type { ColumnDescriptor } from "../api/datasets";
import type { WidgetType } from "../api/widgets";

export function findMissingFields(
  columns: ColumnDescriptor[],
  categoryField: string | null,
  valueFields: string[],
): string[] {
  const columnNames = new Set(columns.map((c) => c.name));
  const missing: string[] = [];

  if (categoryField && !columnNames.has(categoryField)) {
    missing.push(categoryField);
  }

  for (const field of valueFields) {
    if (!columnNames.has(field)) {
      missing.push(field);
    }
  }

  return missing;
}

export function isBindingComplete(
  type: WidgetType,
  categoryField: string | null,
  valueFields: string[],
): boolean {
  switch (type) {
    case "Kpi":
      return categoryField === null && valueFields.length === 1;
    case "Pie":
    case "Donut":
      return categoryField !== null && valueFields.length === 1;
    case "Bar":
    case "ClusteredBar":
    case "StackedColumn":
    case "Line":
    case "Area":
      return categoryField !== null && valueFields.length >= 1;
    case "Scatter":
      return valueFields.length === 2 && !!valueFields[0] && !!valueFields[1];
    case "Table":
      return true;
    default:
      return true;
  }
}
