import type { WidgetBindingDraft, WidgetDraft } from "../widgets/widgetDraftReducer";
import "./reportEditor.css";

const PALETTE_NAMES = ["meridian", "ocean", "sunset", "forest"];
const PALETTE_SWATCH_COLORS: Record<string, string> = {
  meridian: "#5b4fe6",
  ocean: "#0ea5e9",
  sunset: "#f5a524",
  forest: "#46a758",
};

function nextSortDirection(current: "asc" | "desc" | null): "asc" | "desc" | null {
  if (current === null) {
    return "asc";
  }
  if (current === "asc") {
    return "desc";
  }
  return null;
}

function FormatTab({ widget, onChange }: { widget: WidgetDraft | null; onChange: (binding: WidgetBindingDraft) => void }) {
  if (!widget || !widget.binding) {
    return <div className="no-visual">Select a visual to format it.</div>;
  }

  const binding = widget.binding;
  const options = binding.formatOptions;

  function update(partial: Partial<typeof options>) {
    onChange({ ...binding, formatOptions: { ...options, ...partial } });
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
            <button type="button" aria-label="Sort direction" onClick={() => update({ sortDirection: nextSortDirection(options.sortDirection) })}>
              Sort
            </button>
          </div>
          <div className="frow">
            <label htmlFor="format-data-labels">Data labels</label>
            <input id="format-data-labels" type="checkbox" checked={options.dataLabels} onChange={(e) => update({ dataLabels: e.target.checked })} />
          </div>
        </div>
      </details>
    </div>
  );
}

export default FormatTab;
