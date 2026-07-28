import { useState } from "react";
import type { ColumnDescriptor } from "../api/datasets";
import type { BooleanStyle, DatePreset, FieldFormat, FieldFormatType } from "../api/widgets";
import { DATE_PRESET_EXAMPLES, DEFAULT_FIELD_FORMAT, inferFormatType, resolveDisplayName } from "../widgets/fieldFormat";
import type { WidgetBindingDraft, WidgetDraft } from "../widgets/widgetDraftReducer";
import "./reportEditor.css";

const PALETTE_NAMES = ["meridian", "ocean", "sunset", "forest"];
const PALETTE_SWATCH_COLORS: Record<string, string> = {
  meridian: "#5b4fe6",
  ocean: "#0ea5e9",
  sunset: "#f5a524",
  forest: "#46a758",
};

const FORMAT_TYPE_OPTIONS: { value: FieldFormatType; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "decimal", label: "Decimal" },
  { value: "integer", label: "Integer" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Boolean" },
  { value: "text", label: "Text" },
];

// The collapsed row's summary label — e.g. "Decimal" or "Auto (date)" — so a wide table's
// fields can be scanned at a glance without expanding each one.
function formatSummary(current: FieldFormat, nativeType: string | undefined): string {
  if (current.type === "auto") {
    return `Auto (${inferFormatType(nativeType)})`;
  }
  return FORMAT_TYPE_OPTIONS.find((opt) => opt.value === current.type)?.label ?? current.type;
}

function nextSortDirection(current: "asc" | "desc" | null): "asc" | "desc" | null {
  if (current === null) {
    return "asc";
  }
  if (current === "asc") {
    return "desc";
  }
  return null;
}

function FormatTab({
  widget, onChange, columns = [],
}: {
  widget: WidgetDraft | null;
  onChange: (binding: WidgetBindingDraft) => void;
  columns?: ColumnDescriptor[];
}) {
  // Purely local UI state — which fields' controls are expanded in the Value formats
  // accordion. Not persisted; every field starts collapsed.
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  if (!widget || !widget.binding) {
    return <div className="no-visual">Select a visual to format it.</div>;
  }

  const binding = widget.binding;
  const options = binding.formatOptions;
  const fieldFormats = options.fieldFormats ?? {};

  function update(partial: Partial<typeof options>) {
    onChange({ ...binding, formatOptions: { ...options, ...partial } });
  }

  function toggleExpanded(field: string) {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }

  function updateFieldFormat(field: string, patch: Partial<FieldFormat>) {
    const current: FieldFormat = { ...DEFAULT_FIELD_FORMAT, ...fieldFormats[field] };
    update({ fieldFormats: { ...fieldFormats, [field]: { ...current, ...patch } } });
  }

  return (
    <div className="format">
      <details className="fgroup" open>
        <summary>Title</summary>
        <div className="fbody">
          <div className="frow">
            <label htmlFor="format-show-title">Show title</label>
            <input id="format-show-title" type="checkbox" checked={options.showTitle} onChange={(e) => update({ showTitle: e.target.checked })} />
          </div>
          <div className="frow" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
            <label htmlFor="format-title-text">Title text</label>
            <input id="format-title-text" className="text-in" value={options.title ?? ""} onChange={(e) => update({ title: e.target.value || null })} />
          </div>
        </div>
      </details>

      <details className="fgroup" open>
        <summary>Legend &amp; colors</summary>
        <div className="fbody">
          <div className="frow">
            <label htmlFor="format-show-legend">Show legend</label>
            <input id="format-show-legend" type="checkbox" checked={options.showLegend} onChange={(e) => update({ showLegend: e.target.checked })} />
          </div>
          <div className="frow">
            <label htmlFor="format-grid">Gridlines</label>
            <input id="format-grid" type="checkbox" checked={options.grid} onChange={(e) => update({ grid: e.target.checked })} />
          </div>
          <div className="frow" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
            <label>Color theme</label>
            <div className="swatches">
              {PALETTE_NAMES.map((name) => (
                <button
                  key={name}
                  type="button"
                  title={name}
                  className={"swatch" + (options.palette === name ? " active" : "")}
                  style={{ background: PALETTE_SWATCH_COLORS[name] }}
                  onClick={() => update({ palette: name })}
                />
              ))}
            </div>
          </div>
        </div>
      </details>

      <details className="fgroup" open>
        <summary>Sort &amp; labels</summary>
        <div className="fbody">
          <div className="frow">
            <label>Sort ({options.sortDirection ?? "none"})</label>
            <button type="button" className="fbtn" aria-label="Sort direction" onClick={() => update({ sortDirection: nextSortDirection(options.sortDirection) })}>
              Sort
            </button>
          </div>
          <div className="frow">
            <label htmlFor="format-data-labels">Data labels</label>
            <input id="format-data-labels" type="checkbox" checked={options.dataLabels} onChange={(e) => update({ dataLabels: e.target.checked })} />
          </div>
        </div>
      </details>

      {binding.valueFields.length > 0 && (
        <details className="fgroup" open>
          <summary>Value formats</summary>
          <div className="fbody">
            {binding.valueFields.map((field) => {
              const nativeType = columns.find((c) => c.name === field)?.nativeType;
              const current: FieldFormat = { ...DEFAULT_FIELD_FORMAT, ...fieldFormats[field] };
              const isOpen = expandedFields.has(field);

              return (
                <div key={field} className={"facc" + (isOpen ? " open" : "")}>
                  <div
                    className="facc-row"
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    aria-label={`${field} format, currently ${formatSummary(current, nativeType)}`}
                    onClick={() => toggleExpanded(field)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpanded(field); } }}
                  >
                    <span className="fname">
                      {field}
                      {resolveDisplayName(field, current) !== field && <span className="rename-badge">renamed</span>}
                    </span>
                    <span className="cur">
                      {formatSummary(current, nativeType)}
                      <svg className="chev" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                  {isOpen && (
                  <div className="facc-body">
                  <div className="frow rename-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
                    <label htmlFor={`format-displayname-${field}`}>Display name</label>
                    <input
                      id={`format-displayname-${field}`}
                      className="text-in"
                      placeholder={field}
                      value={current.displayName ?? ""}
                      onChange={(e) => updateFieldFormat(field, { displayName: e.target.value === "" ? null : e.target.value })}
                    />
                  </div>
                  <div className="frow">
                    <label htmlFor={`format-type-${field}`}>Format</label>
                    <select
                      id={`format-type-${field}`}
                      className="text-in"
                      value={current.type}
                      onChange={(e) => updateFieldFormat(field, { type: e.target.value as FieldFormatType })}
                      style={{ maxWidth: 160 }}
                    >
                      {FORMAT_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.value === "auto" ? `Auto (${inferFormatType(nativeType)})` : opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(current.type === "decimal" || current.type === "integer") && (
                    <>
                      {current.type === "decimal" && (
                        <div className="frow">
                          <label htmlFor={`format-decimals-${field}`}>Decimal places</label>
                          <input
                            id={`format-decimals-${field}`}
                            className="text-in"
                            type="number"
                            min={0}
                            max={6}
                            value={current.decimalPlaces}
                            onChange={(e) => updateFieldFormat(field, { decimalPlaces: Number(e.target.value) })}
                            style={{ width: 60 }}
                          />
                        </div>
                      )}
                      <div className="frow">
                        <label htmlFor={`format-thousands-${field}`}>Thousands separator</label>
                        <input
                          id={`format-thousands-${field}`}
                          type="checkbox"
                          checked={current.thousandsSeparator}
                          onChange={(e) => updateFieldFormat(field, { thousandsSeparator: e.target.checked })}
                        />
                      </div>
                      <div className="frow">
                        <input
                          className="text-in"
                          aria-label={`Prefix for ${field}`}
                          placeholder="Prefix (e.g. $)"
                          value={current.prefix}
                          onChange={(e) => updateFieldFormat(field, { prefix: e.target.value })}
                          style={{ width: "48%" }}
                        />
                        <input
                          className="text-in"
                          aria-label={`Suffix for ${field}`}
                          placeholder="Suffix (e.g. %)"
                          value={current.suffix}
                          onChange={(e) => updateFieldFormat(field, { suffix: e.target.value })}
                          style={{ width: "48%" }}
                        />
                      </div>
                    </>
                  )}

                  {current.type === "date" && (
                    <div className="frow">
                      <label htmlFor={`format-date-${field}`}>Date format</label>
                      <select
                        id={`format-date-${field}`}
                        className="text-in"
                        value={current.datePreset}
                        onChange={(e) => updateFieldFormat(field, { datePreset: e.target.value as DatePreset })}
                        style={{ maxWidth: 160 }}
                      >
                        {Object.entries(DATE_PRESET_EXAMPLES).map(([preset, example]) => (
                          <option key={preset} value={preset}>{example}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {current.type === "boolean" && (
                    <div className="frow">
                      <label htmlFor={`format-bool-${field}`}>Style</label>
                      <select
                        id={`format-bool-${field}`}
                        className="text-in"
                        value={current.booleanStyle}
                        onChange={(e) => updateFieldFormat(field, { booleanStyle: e.target.value as BooleanStyle })}
                        style={{ maxWidth: 160 }}
                      >
                        <option value="trueFalse">True / False</option>
                        <option value="yesNo">Yes / No</option>
                        <option value="checkmark">✓ / ✗</option>
                      </select>
                    </div>
                  )}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

export default FormatTab;
