import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getReport } from "../api/reports";
import { executeDataset, type QueryResult } from "../api/datasets";
import { getReportPages, updateReportPage, type ReportPage } from "../api/reportPages";
import { applyFilters } from "./crossFilter";

export interface ReportQueryContextValue {
  reportId: number;
  reportPages: ReportPage[];
  reportPageId: number | null;
  setReportPageId: (id: number) => void;
  rawResult: QueryResult | null;
  filteredResult: QueryResult | null;
  filterState: Record<string, string[]>;
  setFilterState: (next: Record<string, string[]>) => void;
  saveFilterState: () => Promise<void>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ReportQueryContext = createContext<ReportQueryContextValue | null>(null);

export function ReportQueryProvider({ reportId, children }: { reportId: number; children: ReactNode }) {
  const [reportPages, setReportPages] = useState<ReportPage[]>([]);
  const [reportPageId, setReportPageId] = useState<number | null>(null);
  const [rawResult, setRawResult] = useState<QueryResult | null>(null);
  const [filterState, setFilterState] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const report = await getReport(reportId);
      const pages = await getReportPages(reportId);
      setReportPages(pages);
      const firstPageId = pages[0]?.id ?? null;
      setReportPageId(firstPageId);
      setFilterState(firstPageId !== null ? JSON.parse(pages[0].filterState || "{}") : {});

      if (report.datasetId !== null) {
        setRawResult(await executeDataset(report.datasetId));
      } else {
        setRawResult(null);
      }
    } catch {
      setError("Could not load this report's data.");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  const saveFilterState = useCallback(async () => {
    if (reportPageId === null) {
      return;
    }
    await updateReportPage(reportId, reportPageId, { filterState: JSON.stringify(filterState) });
  }, [reportId, reportPageId, filterState]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredResult = useMemo(
    () => (rawResult ? applyFilters(rawResult, filterState) : null),
    [rawResult, filterState],
  );

  const value: ReportQueryContextValue = {
    reportId,
    reportPages,
    reportPageId,
    setReportPageId,
    rawResult,
    filteredResult,
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
