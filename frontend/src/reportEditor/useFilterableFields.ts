import { useEffect, useMemo, useState } from "react";
import { queryFilterableFields } from "../api/datasets";
import { useReportQuery } from "./ReportQueryContext";
import { MAX_FILTER_VALUES, mergeFilterableFields, type FilterableField } from "./mergeFilterableFields";

/**
 * The filters pane's field list.
 *
 * DirectQuery datasets have already been fetched whole, so their values are derived in the
 * browser exactly as before. Import datasets have no rows client-side at all — their values come
 * from a SELECT DISTINCT per column, batched into one request.
 *
 * Fields from both sources are merged by column name, matching how applyFilters treats them.
 */
export function useFilterableFields(): FilterableField[] {
  const { datasetResults, datasetInfo } = useReportQuery();
  const [serverFields, setServerFields] = useState<FilterableField[]>([]);

  const importIds = useMemo(
    () => [...datasetInfo.values()].filter((d) => d.storageMode === "Import").map((d) => d.id).sort(),
    [datasetInfo],
  );
  const importKey = importIds.join(",");

  useEffect(() => {
    if (importIds.length === 0) {
      setServerFields([]);
      return;
    }

    let cancelled = false;

    async function run() {
      const results = await Promise.all(
        importIds.map(async (id) => {
          try {
            return await queryFilterableFields(id, { maxValues: MAX_FILTER_VALUES });
          } catch {
            // One dataset's filters failing must not empty the whole pane.
            return [];
          }
        }),
      );

      if (!cancelled) {
        setServerFields(results.flat());
      }
    }

    void run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importKey]);

  // Deliberately not re-fetched when filterState changes: the pane shows what you *can* pick,
  // and narrowing the options as you pick them makes filters impossible to widen again.
  return useMemo(() => {
    const clientFields = mergeFilterableFields([...datasetResults.values()]);

    const byName = new Map<string, FilterableField>();
    for (const field of [...clientFields, ...serverFields]) {
      const existing = byName.get(field.column.name);
      byName.set(
        field.column.name,
        existing
          ? { column: existing.column, values: [...new Set([...existing.values, ...field.values])].sort() }
          : field,
      );
    }

    return [...byName.values()].filter((f) => f.values.length <= MAX_FILTER_VALUES);
  }, [datasetResults, serverFields]);
}
