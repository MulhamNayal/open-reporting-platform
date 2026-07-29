import type { ColumnDescriptor, QueryResult } from "../api/datasets";
import { classify } from "../widgets/fieldClassification";
import { normalizeCell } from "./crossFilter";

// Above this many distinct values, a field isn't a usable checkbox/chip filter regardless of
// layout — e.g. a near-unique document-number column classified as "Categorical" purely by its
// text type. Such fields are excluded entirely rather than dumped into the pane as an
// unbrowsable wall of chips.
export const MAX_FILTER_VALUES = 30;

export interface FilterableField {
  column: ColumnDescriptor;
  values: string[];
}

// Fields are matched across datasets by column NAME — the same rule applyFilters uses. Two
// datasets with a same-named column contribute to one filter group whose value list is the
// union of both. Deliberately name-based, not relationship-based: see the "Filter Semantics"
// section of docs/superpowers/specs/2026-07-29-per-widget-datasets-design.md for the limits
// that implies.
export function mergeFilterableFields(results: QueryResult[]): FilterableField[] {
  const byName = new Map<string, { column: ColumnDescriptor; values: Set<string> }>();

  for (const result of results) {
    result.columns.forEach((column, index) => {
      if (classify(column.nativeType) !== "Categorical") {
        return;
      }

      const entry = byName.get(column.name) ?? { column, values: new Set<string>() };
      for (const row of result.rows) {
        entry.values.add(normalizeCell(row[index]));
      }
      byName.set(column.name, entry);
    });
  }

  // Capped after merging, not per result: two datasets each under the cap can jointly exceed
  // it, and the pane renders the merged list.
  return [...byName.values()]
    .map(({ column, values }) => ({ column, values: [...values].sort() }))
    .filter(({ values }) => values.length <= MAX_FILTER_VALUES);
}
