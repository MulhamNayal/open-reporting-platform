import { useEffect, useState } from "react";
import { executeDataset, type QueryResult } from "../api/datasets";

export interface UseDatasetExecuteResult {
  data: QueryResult | null;
  loading: boolean;
  error: string | null;
}

export function useDatasetExecute(datasetId: number | null): UseDatasetExecuteResult {
  const [data, setData] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (datasetId === null) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    executeDataset(datasetId)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load data for this widget's Dataset.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  return { data, loading, error };
}
