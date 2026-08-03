import { useEffect, useMemo, useState } from "react";
import { queryAggregate, queryRows, type DatasetFilter, type QueryResult } from "../api/datasets";
import type { WidgetSummary } from "../api/widgets";
import { useReportQuery } from "./ReportQueryContext";

export const PAGE_SIZE = 100;

export interface WidgetData {
  result: QueryResult | null;
  error: string | null;
  /// Total rows behind the current filter, ignoring paging. Null when the widget isn't paged.
  totalRows: number | null;
  page: number;
  setPage: (page: number) => void;
  paged: boolean;
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

  if (!isImport) {
    return {
      result: filteredResultFor(widget.datasetId),
      error: datasetErrorFor(widget.datasetId),
      totalRows: null,
      page: 0,
      setPage: () => {},
      paged: false,
    };
  }

  return {
    result: serverResult,
    error: serverError,
    totalRows: serverTotal,
    page,
    setPage,
    paged: isTable(widget) && serverTotal !== null && serverTotal > PAGE_SIZE,
  };
}
