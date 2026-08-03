import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { getReport } from "../api/reports";
import { executeDataset, getDataset, type DatasetSummary, type QueryResult } from "../api/datasets";
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
  datasetInfo: Map<number, DatasetSummary>;
  ensureDatasets: (ids: Array<number | null>) => Promise<void>;
  filteredResultFor: (datasetId: number | null) => QueryResult | null;
  datasetErrorFor: (datasetId: number | null) => string | null;
  /// The dataset's own metadata, needed to know whether its rows live on the server (Import)
  /// or have been fetched whole (DirectQuery). Absent until ensureDatasets has run for it.
  datasetInfoFor: (datasetId: number | null) => DatasetSummary | null;
  resolveDatasetId: (datasetId: number | null) => number | null;
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
  const [datasetInfo, setDatasetInfo] = useState<Map<number, DatasetSummary>>(new Map());
  const [filterState, setFilterState] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // A ref, not state: two concurrent ensureDatasets calls (React re-invokes effects in dev
  // StrictMode) would both read the same stale `datasetResults` and both fire a request.
  const inFlightRef = useRef<Set<number>>(new Set());
  // Every dataset id fetched so far. A ref, not derived from datasetResults, so `load` can
  // re-fetch them on an explicit refresh without taking datasetResults as a dependency —
  // which would re-create `load` on every fetch and re-trigger the mount effect.
  const loadedIdsRef = useRef<Set<number>>(new Set());

  const load = useCallback(async (forceRefresh = false) => {
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

      // A refresh has to re-query every dataset already on screen, not just the default —
      // otherwise the other widgets would silently come back from the server-side cache and
      // Refresh would appear to do nothing for them.
      const alsoRefresh = forceRefresh
        ? [...loadedIdsRef.current].filter((id) => id !== report.datasetId)
        : [];
      loadedIdsRef.current.clear();

      const seeded = new Map<number, QueryResult>();

      if (report.datasetId !== null) {
        const result = await executeDataset(report.datasetId, forceRefresh);
        setRawResult(result);
        seeded.set(report.datasetId, result);
        loadedIdsRef.current.add(report.datasetId);
      } else {
        setRawResult(null);
      }

      await Promise.all(
        alsoRefresh.map(async (id) => {
          try {
            seeded.set(id, await executeDataset(id, true));
            loadedIdsRef.current.add(id);
          } catch {
            setDatasetErrors((prev) => new Map(prev).set(id, "Could not load this dataset."));
          }
        }),
      );

      setDatasetResults(seeded);
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
      .filter((id) => !datasetResults.has(id) && !datasetInfo.has(id) && !inFlightRef.current.has(id));

    if (wanted.length === 0) {
      return;
    }

    wanted.forEach((id) => inFlightRef.current.add(id));

    await Promise.all(
      wanted.map(async (id) => {
        try {
          // Metadata first: an Import dataset's rows stay on the server and are fetched per
          // widget, so pulling the whole result here would defeat the entire point.
          const info = await getDataset(id);
          setDatasetInfo((prev) => new Map(prev).set(id, info));
          if (info.storageMode === "Import") {
            return;
          }

          const result = await executeDataset(id);
          loadedIdsRef.current.add(id);
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
    void load();
  }, [load]);

  // Wrapped so the Ribbon's onClick event object can never arrive as `forceRefresh`.
  const refresh = useCallback(() => load(true), [load]);

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

  // Resolves the same way filteredResultFor does, so a widget on the report default sees the
  // default's error. Without this the renderer can't tell "still fetching" from "fetch failed"
  // and sits on Loading… forever.
  const datasetErrorFor = useCallback(
    (datasetId: number | null) => {
      const resolved = resolveWidgetDatasetId(datasetId, reportDatasetId);
      return resolved === null ? null : datasetErrors.get(resolved) ?? null;
    },
    [datasetErrors, reportDatasetId],
  );

  const resolveDatasetId = useCallback(
    (datasetId: number | null) => resolveWidgetDatasetId(datasetId, reportDatasetId),
    [reportDatasetId],
  );

  const datasetInfoFor = useCallback(
    (datasetId: number | null) => {
      const resolved = resolveWidgetDatasetId(datasetId, reportDatasetId);
      return resolved === null ? null : datasetInfo.get(resolved) ?? null;
    },
    [datasetInfo, reportDatasetId],
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
    datasetInfo,
    ensureDatasets,
    filteredResultFor,
    datasetErrorFor,
    datasetInfoFor,
    resolveDatasetId,
    filterState,
    setFilterState,
    saveFilterState,
    loading,
    error,
    refresh,
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
