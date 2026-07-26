import type { QueryResult } from "../api/datasets";
import { classify } from "../widgets/fieldClassification";
import { normalizeCell } from "./crossFilter";
import "./reportEditor.css";

// Above this many distinct values, a field isn't a usable checkbox/chip filter
// regardless of layout — e.g. a near-unique document-number column classified
// as "Categorical" purely by its text type. Such fields are excluded entirely
// rather than dumped into the pane as an unbrowsable wall of chips.
const MAX_FILTER_VALUES = 30;

function distinctValues(result: QueryResult, field: string): string[] {
  const index = result.columns.findIndex((c) => c.name === field);
  const values = new Set(result.rows.map((row) => normalizeCell(row[index])));
  return [...values].sort();
}

function FiltersPane({
  visible, rawResult, filterState, onChange, crossFilter, onClearCrossFilter, onResetAll,
}: {
  visible: boolean;
  rawResult: QueryResult | null;
  filterState: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  crossFilter?: { field: string; value: string } | null;
  onClearCrossFilter?: () => void;
  onResetAll?: () => void;
}) {
  if (!visible) {
    return null;
  }

  if (!rawResult) {
    return (
      <div className="pane pane-filters">
        <div className="pane-head">Filters</div>
        <div className="filters-empty">No data to filter yet — define this report's query first.</div>
      </div>
    );
  }

  const filterableFields = rawResult.columns
    .filter((c) => classify(c.nativeType) === "Categorical")
    .map((column) => ({ column, values: distinctValues(rawResult, column.name) }))
    .filter(({ values }) => values.length <= MAX_FILTER_VALUES);
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
