import type { FilterableField } from "./mergeFilterableFields";
import "./reportEditor.css";

// Takes the field list rather than deriving it: for an Import dataset there are no rows on the
// client to derive it from, so where the values come from is the caller's concern.
// See useFilterableFields.
function FiltersPane({
  visible, fields, hasData, filterState, onChange, crossFilter, onClearCrossFilter, onResetAll,
}: {
  visible: boolean;
  fields: FilterableField[];
  hasData: boolean;
  filterState: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  crossFilter?: { field: string; value: string } | null;
  onClearCrossFilter?: () => void;
  onResetAll?: () => void;
}) {
  if (!visible) {
    return null;
  }

  if (!hasData) {
    return (
      <div className="pane pane-filters">
        <div className="pane-head">Filters</div>
        <div className="filters-empty">No data to filter yet — define this report's query first.</div>
      </div>
    );
  }

  const filterableFields = fields;
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
