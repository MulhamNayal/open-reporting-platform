import type { QueryResult } from "../api/datasets";

// Canonical string form of a cell for filter matching. Null/undefined collapse
// to "" so the Filters pane checkbox values and applyFilters use identical keys.
export function normalizeCell(cell: unknown): string {
  return cell === null || cell === undefined ? "" : String(cell);
}

export function applyFilters(result: QueryResult, filterState: Record<string, string[]>): QueryResult {
  const activeFilters = Object.entries(filterState).filter(([field, values]) => {
    const columnExists = result.columns.some((c) => c.name === field);
    return columnExists && values.length > 0;
  });

  if (activeFilters.length === 0) {
    return result;
  }

  const columnIndex = (field: string) => result.columns.findIndex((c) => c.name === field);

  const rows = result.rows.filter((row) =>
    activeFilters.every(([field, values]) => {
      const index = columnIndex(field);
      return values.includes(normalizeCell(row[index]));
    }),
  );

  return { columns: result.columns, rows };
}
