import type { ColumnDescriptor } from "../api/datasets";

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
