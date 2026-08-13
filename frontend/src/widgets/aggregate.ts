import type { QueryResult } from "../api/datasets";
import type { AggregationFn } from "../api/widgets";
import { normalizeCell } from "../reportEditor/crossFilter";

// Applied AFTER applyFilters, deliberately: filtering then aggregating is what keeps
// click-to-cross-filter working — a click narrows the rows, and the aggregate recomputes
// from the narrowed set. Aggregating first would freeze the numbers.

function isNoOp(aggregations: AggregationFn[] | null | undefined): boolean {
  return !aggregations || aggregations.every((fn) => !fn || fn === "None");
}

/**
 * Whether aggregateResult will reshape the columns rather than pass the result through.
 *
 * Callers need this because aggregating changes the column list to [categoryField, ...valueFields]:
 * a table rendering only valueFields would silently lose the column it is grouped by.
 */
export function isAggregating(aggregations: AggregationFn[] | null | undefined, valueFields: string[]): boolean {
  return !isNoOp(aggregations) && valueFields.length > 0;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// SQL semantics: nulls are ignored by every aggregate, and COUNT(col) counts non-null values.
function applyFn(fn: AggregationFn, values: unknown[]): unknown {
  const present = values.filter((v) => v !== null && v !== undefined && v !== "");

  switch (fn) {
    case "Count":
      return present.length;
    case "CountDistinct":
      return new Set(present.map(normalizeCell)).size;
    case "Sum":
    case "Avg": {
      const numbers = present.map(toNumber).filter((n): n is number => n !== null);
      if (numbers.length === 0) {
        return null;
      }
      const total = numbers.reduce((a, b) => a + b, 0);
      return fn === "Sum" ? total : total / numbers.length;
    }
    case "Min":
    case "Max": {
      if (present.length === 0) {
        return null;
      }
      const numbers = present.map(toNumber);
      // Fall back to string comparison when the column isn't numeric (dates, codes, names).
      if (numbers.some((n) => n === null)) {
        const strings = present.map(normalizeCell).sort();
        return fn === "Min" ? strings[0] : strings[strings.length - 1];
      }
      const nums = numbers as number[];
      return fn === "Min" ? Math.min(...nums) : Math.max(...nums);
    }
    default:
      return present[0] ?? null;
  }
}

// Count-style aggregates always produce an integer regardless of the source column's type,
// so the format layer doesn't try to render a row count as currency.
function resultType(fn: AggregationFn, sourceType: string): string {
  return fn === "Count" || fn === "CountDistinct" ? "int" : sourceType;
}

/**
 * Groups `result` by `categoryField` and reduces each value field with its aggregation.
 * Returns `result` untouched when nothing is aggregated, so an unaggregated widget renders
 * byte-identically to how it did before this existed.
 */
export function aggregateResult(
  result: QueryResult,
  categoryField: string | null,
  valueFields: string[],
  aggregations: AggregationFn[] | null | undefined,
): QueryResult {
  if (isNoOp(aggregations) || valueFields.length === 0) {
    return result;
  }

  const indexOf = (name: string) => result.columns.findIndex((c) => c.name === name);
  const categoryIndex = categoryField ? indexOf(categoryField) : -1;
  if (categoryField && categoryIndex === -1) {
    return result;
  }

  const valueIndexes = valueFields.map(indexOf);

  // Insertion-ordered so categories keep their first-seen order; explicit sorting is a
  // separate concern handled downstream by the chart builders.
  const groups = new Map<string, { key: unknown; rows: unknown[][] }>();
  for (const row of result.rows) {
    const rawKey = categoryIndex === -1 ? "" : row[categoryIndex];
    const key = normalizeCell(rawKey);
    let group = groups.get(key);
    if (!group) {
      group = { key: categoryIndex === -1 ? "" : rawKey, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }

  const columns = [
    ...(categoryField ? [result.columns[categoryIndex]] : []),
    ...valueFields.map((field, i) => {
      const source = valueIndexes[i] === -1 ? undefined : result.columns[valueIndexes[i]];
      const fn = (aggregations?.[i] ?? "None") as AggregationFn;
      return { name: field, nativeType: resultType(fn, source?.nativeType ?? "nvarchar(max)") };
    }),
  ];

  const rows = [...groups.values()].map((group) => [
    ...(categoryField ? [group.key] : []),
    ...valueFields.map((_, i) => {
      const fn = (aggregations?.[i] ?? "None") as AggregationFn;
      const columnIndex = valueIndexes[i];
      if (columnIndex === -1) {
        return null;
      }
      const values = group.rows.map((r) => r[columnIndex]);
      // A "None" field inside an otherwise-aggregated widget takes the group's first value,
      // matching how SQL would treat a column that isn't in an aggregate but is grouped-ish.
      return fn === "None" ? values[0] ?? null : applyFn(fn, values);
    }),
  ]);

  return { columns, rows };
}
