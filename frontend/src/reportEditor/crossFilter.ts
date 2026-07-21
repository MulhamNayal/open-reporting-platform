import type { QueryResult } from "../api/datasets";

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
      const cell = row[index];
      return values.includes(cell === null || cell === undefined ? "" : String(cell));
    }),
  );

  return { columns: result.columns, rows };
}
