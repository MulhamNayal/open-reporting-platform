import { useEffect, useMemo, useState } from "react";
import { queryAggregate, queryDistinct, queryRows, type DatasetFilter, type QueryResult } from "../api/datasets";
import type { WidgetSummary } from "../api/widgets";
import { useReportQuery } from "./ReportQueryContext";

export const PAGE_SIZE = 100;

// Matches the server's own default for a distinct lookup. High enough that a real categorical
// column arrives whole; the checklist still narrows by typing beyond that.
export const DISTINCT_VALUE_LIMIT = 1000;

export interface WidgetData {
  result: QueryResult | null;
  error: string | null;
  /// Total rows behind the current filter, ignoring paging. Null when the widget isn't paged.
  totalRows: number | null;
  page: number;
  setPage: (page: number) => void;
  paged: boolean;
  /// A column's full distinct values, asked of the source rather than derived from the rows on
  /// hand. Deriving them locally under-reports either way: a server-paged table only holds the
  /// current page, and a DirectQuery one only holds what fit under the dataset's row cap.
  columnValues: ((column: string) => Promise<(string | number)[]>) | undefined;
  /// Sums for the named columns over the whole filtered result. Only set when the widget is
  /// server-paged, where adding up the rows on hand would total one page rather than the dataset.
  /// Undefined means "the rows you have are the whole result, add them up yourself".
  columnTotals: ((fields: string[]) => Promise<Record<string, number>>) | undefined;
}

/// A chart's data has been reduced to one row per category, so it can be sent whole. A table's
/// hasn't, which is the only reason paging exists.
function isTable(widget: WidgetSummary): boolean {
  return widget.type === "Table";
}

function toFilters(filterState: Record<string, string[]>): DatasetFilter[] {
  return Object.entries(filterState)
    .filter(([, values]) => values.length > 0)
    .map(([field, values]) => ({ field, values }));
}

/**
 * Where a widget's rows come from.
 *
 * DirectQuery datasets keep the original path exactly: the whole result was already fetched, and
 * filtering and aggregation happen in the browser. Import datasets never load whole, so each
 * widget asks the server for precisely what it draws — a page of rows, or a grouped total.
 */
export function useWidgetData(widget: WidgetSummary): WidgetData {
  const { filteredResultFor, datasetErrorFor, datasetInfoFor, resolveDatasetId, filterState } = useReportQuery();

  const info = datasetInfoFor(widget.datasetId);
  const datasetId = resolveDatasetId(widget.datasetId);
  const isImport = info?.storageMode === "Import";

  const [page, setPage] = useState(0);
  const [serverResult, setServerResult] = useState<QueryResult | null>(null);
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const binding = widget.binding;
  // Serialised so the effect below re-runs on a genuine change of inputs rather than on every
  // render — filterState and the binding arrays are new object identities each time.
  const requestKey = useMemo(
    () => JSON.stringify({
      datasetId,
      isImport,
      type: widget.type,
      category: binding?.categoryField ?? null,
      values: binding?.valueFields ?? [],
      aggregations: binding?.aggregations ?? null,
      filters: toFilters(filterState),
      page: isTable(widget) ? page : 0,
    }),
    [datasetId, isImport, widget, binding, filterState, page],
  );

  useEffect(() => {
    if (!isImport || datasetId === null || !binding) {
      return;
    }

    let cancelled = false;
    const filters = toFilters(filterState);

    async function run() {
      try {
        if (isTable(widget)) {
          const columns = binding!.valueFields.length > 0 ? binding!.valueFields : undefined;
          const res = await queryRows(datasetId!, { filters, columns, skip: page * PAGE_SIZE, take: PAGE_SIZE });
          if (!cancelled) {
            setServerResult({ columns: res.columns, rows: res.rows });
            setServerTotal(res.totalRows);
            setServerError(null);
          }
          return;
        }

        const res = await queryAggregate(datasetId!, {
          filters,
          categoryField: binding!.categoryField,
          valueFields: binding!.valueFields,
          aggregations: binding!.aggregations ?? null,
        });
        if (!cancelled) {
          setServerResult(res);
          setServerTotal(null);
          setServerError(null);
        }
      } catch {
        if (!cancelled) {
          setServerError("Could not load this widget's data.");
          setServerResult(null);
        }
      }
    }

    void run();
    return () => { cancelled = true; };
    // requestKey captures every input; listing them individually would re-run on identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  // Paging back to a page that no longer exists after a filter narrows the result.
  useEffect(() => {
    if (serverTotal !== null && page > 0 && page * PAGE_SIZE >= serverTotal) {
      setPage(0);
    }
  }, [serverTotal, page]);

  // Deliberately not filtered by the current filter state: a column's checklist has to keep
  // offering the values you could switch to, not just the ones already selected.
  const columnValues = datasetId === null
    ? undefined
    : (column: string) => queryDistinct(datasetId, { column, take: DISTINCT_VALUE_LIMIT });

  if (!isImport) {
    return {
      result: filteredResultFor(widget.datasetId),
      error: datasetErrorFor(widget.datasetId),
      totalRows: null,
      page: 0,
      setPage: () => {},
      paged: false,
      columnValues,
      // The whole result is already in the browser, so a local sum is both correct and cheaper.
      columnTotals: undefined,
    };
  }

  // Report-level filters are applied so the total matches what the table is showing. A search
  // typed into the table itself is not — that only ever narrowed the current page anyway.
  const columnTotals = datasetId === null
    ? undefined
    : async (fields: string[]) => {
        const res = await queryAggregate(datasetId, {
          filters: toFilters(filterState),
          categoryField: null,
          valueFields: fields,
          aggregations: fields.map(() => "Sum"),
        });
        const totals: Record<string, number> = {};
        res.columns.forEach((column, index) => {
          const cell = res.rows[0]?.[index];
          const value = typeof cell === "number" ? cell : Number(cell);
          if (!Number.isNaN(value)) {
            totals[column.name] = value;
          }
        });
        return totals;
      };

  return {
    result: serverResult,
    error: serverError,
    totalRows: serverTotal,
    page,
    setPage,
    paged: isTable(widget) && serverTotal !== null && serverTotal > PAGE_SIZE,
    columnValues,
    columnTotals: isTable(widget) ? columnTotals : undefined,
  };
}
