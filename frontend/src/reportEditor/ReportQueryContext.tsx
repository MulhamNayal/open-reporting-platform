import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { getReport } from "../api/reports";
import { executeDataset, type QueryResult } from "../api/datasets";
import { getReportPages, updateReportPage, type ReportPage } from "../api/reportPages";
import { applyFilters } from "./crossFilter";
import { resolveWidgetDatasetId } from "./widgetDataset";

export interface ReportQueryContextValue {
  reportId: number;
  reportName: string | null;
  reportDatasetId: number | null;
  reportPages: ReportPage[];
  reportPageId: number | null;
  setReportPageId: (id: number) => void;
  rawResult: QueryResult | null;
  filteredResult: QueryResult | null;
  datasetResults: Map<number, QueryResult>;
  datasetErrors: Map<number, string>;
  ensureDatasets: (ids: Array<number | null>) => Promise<void>;
  filteredResultFor: (datasetId: number | null) => QueryResult | null;
  filterState: Record<string, string[]>;
  setFilterState: (next: Record<string, string[]>) => void;
  saveFilterState: () => Promise<void>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ReportQueryContext = createContext<ReportQueryContextValue | null>(null);

export function ReportQueryProvider({ reportId, children }: { reportId: number; children: ReactNode }) {
  const [reportName, setReportName] = useState<string | null>(null);
  const [reportDatasetId, setReportDatasetId] = useState<number | null>(null);
  const [reportPages, setReportPages] = useState<ReportPage[]>([]);
  const [reportPageId, setReportPageIdState] = useState<number | null>(null);
  const [rawResult, setRawResult] = useState<QueryResult | null>(null);
  const [datasetResults, setDatasetResults] = useState<Map<number, QueryResult>>(new Map());
  const [datasetErrors, setDatasetErrors] = useState<Map<number, string>>(new Map());
  const [filterState, setFilterState] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state: two concurrent ensureDatasets calls (React re-invokes effects in dev
  // StrictMode) would both read the same stale `datasetResults` and both fire a request.
  const inFlightRef = useRef<Set<number>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const report = await getReport(reportId);
      setReportName(report.name);
      setReportDatasetId(report.datasetId);
      const pages = await getReportPages(reportId);
      setReportPages(pages);
      const firstPageId = pages[0]?.id ?? null;
      setReportPageIdState(firstPageId);
      setFilterState(firstPageId !== null ? JSON.parse(pages[0].filterState || "{}") : {});

      // A refresh must not serve results cached before it — drop everything and re-seed with
      // the default dataset. Consumers re-request the rest via ensureDatasets.
      inFlightRef.current.clear();
      setDatasetErrors(new Map());

      if (report.datasetId !== null) {
        const result = await executeDataset(report.datasetId);
        setRawResult(result);
        setDatasetResults(new Map([[report.datasetId, result]]));
      } else {
        setRawResult(null);
        setDatasetResults(new Map());
      }
    } catch {
      setError("Could not load this report's data.");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  // Fetches any dataset not already cached or in flight. Accepts raw widget dataset ids
  // (nulls included) so callers can pass `widgets.map(w => w.datasetId)` without filtering.
  // Idempotent — safe to call from an effect that re-runs.
  const ensureDatasets = useCallback(async (ids: Array<number | null>) => {
    const wanted = [...new Set(ids.map((id) => resolveWidgetDatasetId(id, reportDatasetId)))]
      .filter((id): id is number => id !== null)
      .filter((id) => !datasetResults.has(id) && !inFlightRef.current.has(id));

    if (wanted.length === 0) {
      return;
    }

    wanted.forEach((id) => inFlightRef.current.add(id));

    await Promise.all(
      wanted.map(async (id) => {
        try {
          const result = await executeDataset(id);
          setDatasetResults((prev) => new Map(prev).set(id, result));
        } catch {
          // Per-dataset, deliberately: one broken query must not blank the whole report.
          setDatasetErrors((prev) => new Map(prev).set(id, "Could not load this dataset."));
        } finally {
          inFlightRef.current.delete(id);
        }
      }),
    );
  }, [datasetResults, reportDatasetId]);

  const saveFilterState = useCallback(async () => {
    if (reportPageId === null) {
      return;
    }
    await updateReportPage(reportId, reportPageId, { filterState: JSON.stringify(filterState) });
  }, [reportId, reportPageId, filterState]);

  const setReportPageId = useCallback((id: number) => {
    setReportPageIdState(id);
    const page = reportPages.find((p) => p.id === id);
    setFilterState(page ? JSON.parse(page.filterState || "{}") : {});
  }, [reportPages]);

  useEffect(() => {
    load();
  }, [load]);

  // The page's single filterState is applied to every dataset, matched by column name —
  // applyFilters already drops filters whose field isn't a column of the result, so a filter
  // narrows the datasets that have that column and no-ops on the ones that don't.
  const filteredResultFor = useCallback(
    (datasetId: number | null) => {
      const resolved = resolveWidgetDatasetId(datasetId, reportDatasetId);
      if (resolved === null) {
        return null;
      }
      const result = datasetResults.get(resolved);
      return result ? applyFilters(result, filterState) : null;
    },
    [datasetResults, filterState, reportDatasetId],
  );

  // Defined in terms of filteredResultFor so the two can never disagree about the default.
  const filteredResult = useMemo(() => filteredResultFor(null), [filteredResultFor]);

  const value: ReportQueryContextValue = {
    reportId,
    reportName,
    reportDatasetId,
    reportPages,
    reportPageId,
    setReportPageId,
    rawResult,
    filteredResult,
    datasetResults,
    datasetErrors,
    ensureDatasets,
    filteredResultFor,
    filterState,
    setFilterState,
    saveFilterState,
    loading,
    error,
    refresh: load,
  };

  return <ReportQueryContext.Provider value={value}>{children}</ReportQueryContext.Provider>;
}

export function useReportQuery(): ReportQueryContextValue {
  const context = useContext(ReportQueryContext);
  if (!context) {
    throw new Error("useReportQuery must be used within a ReportQueryProvider");
  }
  return context;
}
