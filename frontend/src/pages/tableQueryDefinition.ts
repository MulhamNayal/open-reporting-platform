export const ALLOWED_OPERATORS = ["=", "!=", ">", "<", ">=", "<=", "LIKE"] as const;
export type FilterOperator = (typeof ALLOWED_OPERATORS)[number];

export interface FilterRowDraft {
  field: string;
  operator: FilterOperator;
  value: string;
}

export interface TableQueryFilter {
  field: string;
  operator: string;
  value: string;
}

export interface TableQuerySort {
  field: string;
  direction: "ASC" | "DESC";
}

export interface TableQueryDefinition {
  query: {
    table: string;
    columns: string[];
    filters: TableQueryFilter[];
    sort: TableQuerySort | null;
    top: number | null;
  };
}

export function buildTableQueryDefinition(
  table: string,
  columns: string[],
  filterRows: FilterRowDraft[],
  sortField: string,
  sortDirection: "ASC" | "DESC",
  top: string,
): TableQueryDefinition {
  const filters: TableQueryFilter[] = filterRows
    .filter((row) => row.field !== "")
    .map((row) => ({ field: row.field, operator: row.operator, value: row.value }));

  const sort: TableQuerySort | null = sortField === "" ? null : { field: sortField, direction: sortDirection };

  const parsedTop = top.trim() === "" ? null : Number(top);
  const topValue = parsedTop !== null && Number.isFinite(parsedTop) && parsedTop > 0 ? parsedTop : null;

  return { query: { table, columns, filters, sort, top: topValue } };
}
