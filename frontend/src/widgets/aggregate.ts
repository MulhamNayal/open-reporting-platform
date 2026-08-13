import type { QueryResult } from "../api/datasets";
import type { AggregationFn, WidgetMeasure } from "../api/widgets";
import { normalizeCell } from "../reportEditor/crossFilter";
import { compileMeasure } from "./measures";

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
 * Groups `result` by `categoryField`, reduces each value field with its aggregation, and appends any
 * measures. Returns `result` with measures only — grouping untouched — when nothing is aggregated,
 * so an unaggregated widget renders as it did before this existed.
 */
export function aggregateResult(
  result: QueryResult,
  categoryField: string | null,
  valueFields: string[],
  aggregations: AggregationFn[] | null | undefined,
  measures?: WidgetMeasure[] | null,
): QueryResult {
  // Measures still apply without aggregation: a table listing raw rows can carry a computed column
  // too, it just computes per row rather than per group.
  if (isNoOp(aggregations) || valueFields.length === 0) {
    return appendMeasures(result, measures);
  }

  const indexOf = (name: string) => result.columns.findIndex((c) => c.name === name);
  const categoryIndex = categoryField ? indexOf(categoryField) : -1;
  if (categoryField && categoryIndex === -1) {
    return appendMeasures(result, measures);
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

  return appendMeasures({ columns, rows }, measures);
}

/**
 * Appends each measure as a column computed from the row it sits on.
 *
 * Runs last, against the aggregated rows, because that is what makes a measure a measure: growth is
 * the difference of the sums over the sum, not the sum of per-row growths. Measures can also read
 * earlier measures, since they are evaluated left to right into the same row.
 *
 * A measure that doesn't compile yields a blank column rather than taking the widget down — a typo
 * in one expression shouldn't cost you the other nine columns. The name still appears, so the
 * mistake is visible instead of the column silently vanishing.
 */
export function appendMeasures(result: QueryResult, measures: WidgetMeasure[] | null | undefined): QueryResult {
  if (!measures || measures.length === 0) {
    return result;
  }

  const compiled = measures.map((measure) => {
    try {
      return { name: measure.name, measure: compileMeasure(measure.expression) };
    } catch {
      return { name: measure.name, measure: null };
    }
  });

  const columns = [
    ...result.columns,
    // decimal so the formatter treats a measure as a number: a ratio rendered as text loses its
    // decimal places and its right alignment.
    ...compiled.map((c) => ({ name: c.name, nativeType: "decimal" })),
  ];

  const indexByName = new Map(result.columns.map((c, i) => [c.name, i]));

  const rows = result.rows.map((row) => {
    const extended = [...row];
    compiled.forEach((c, i) => {
      if (!c.measure) {
        extended.push(null);
        return;
      }
      const value = c.measure.evaluate((field) => {
        const sourceIndex = indexByName.get(field);
        if (sourceIndex !== undefined) {
          return row[sourceIndex];
        }
        // Not a source column — look among the measures already computed for this row.
        const measureIndex = compiled.findIndex((other, j) => j < i && other.name === field);
        return measureIndex === -1 ? undefined : extended[result.columns.length + measureIndex];
      });
      extended.push(value);
    });
    return extended;
  });

  return { columns, rows };
}
