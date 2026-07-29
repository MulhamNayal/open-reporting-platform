import type { QueryResult } from "../api/datasets";
import { mergeFilterableFields } from "./mergeFilterableFields";
import "./reportEditor.css";

function FiltersPane({
  visible, results, filterState, onChange, crossFilter, onClearCrossFilter, onResetAll,
}: {
  visible: boolean;
  results: QueryResult[];
  filterState: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  crossFilter?: { field: string; value: string } | null;
  onClearCrossFilter?: () => void;
  onResetAll?: () => void;
}) {
  if (!visible) {
    return null;
  }

  if (results.length === 0) {
    return (
      <div className="pane pane-filters">
        <div className="pane-head">Filters</div>
        <div className="filters-empty">No data to filter yet — define this report's query first.</div>
      </div>
    );
  }

  // Union across every loaded dataset, matched by column name — a filter group can therefore
  // drive widgets bound to different datasets.
  const filterableFields = mergeFilterableFields(results);
  const hasActiveFilters = Object.values(filterState).some((values) => values.length > 0) || Boolean(crossFilter);

  function toggle(field: string, value: string, checked: boolean) {
    const current = filterState[field] ?? [];
    const next = checked ? [...current, value] : current.filter((v) => v !== value);
    onChange({ ...filterState, [field]: next });
  }

  return (
    <div className="pane pane-filters">
      <div className="pane-head">Filters</div>
      <div className="pane-scroll">
        <div className="filter-scope">Filters on this page</div>
        {crossFilter && (
          <div className="xfchip">
            <span><b>{crossFilter.field}</b>: {crossFilter.value}</span>
            <button type="button" className="x" aria-label="Clear cross-filter" onClick={onClearCrossFilter}>✕</button>
          </div>
        )}
        {hasActiveFilters && onResetAll && (
          <button type="button" className="resetf" onClick={onResetAll}>Reset filters</button>
        )}
        {filterableFields.map(({ column, values }) => (
          <div className="filter-group" key={column.name}>
            <div className="filter-group-label">{column.name}</div>
            <div className="filter-group-opts">
              {values.map((value) => (
                <label className="opt" key={value}>
                  <input
                    type="checkbox"
                    checked={(filterState[column.name] ?? []).includes(value)}
                    onChange={(e) => toggle(column.name, value, e.target.checked)}
                  />
                  <span>{value === "" ? "(blank)" : value}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default FiltersPane;
