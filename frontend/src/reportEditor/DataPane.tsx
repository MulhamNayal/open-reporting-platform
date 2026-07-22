import { useState } from "react";
import type { ColumnDescriptor } from "../api/datasets";
import { classify } from "../widgets/fieldClassification";
import type { WidgetDraft } from "../widgets/widgetDraftReducer";
import "./reportEditor.css";

function glyphFor(nativeType: string): { glyphClass: string; glyph: string } {
  const kind = classify(nativeType);
  if (kind === "Numeric") {
    return { glyphClass: "measure", glyph: "Σ" };
  }
  if (kind === "Temporal") {
    return { glyphClass: "date", glyph: "▦" };
  }
  return { glyphClass: "dim", glyph: "Abc" };
}

function isFieldUsed(widget: WidgetDraft | null, fieldName: string): boolean {
  if (!widget?.binding) {
    return false;
  }
  return widget.binding.categoryField === fieldName || widget.binding.valueFields.includes(fieldName);
}

function DataPane({
  columns, selectedWidget, onSmartAdd,
}: {
  columns: ColumnDescriptor[];
  selectedWidget: WidgetDraft | null;
  onSmartAdd: (fieldName: string, fieldKind: ReturnType<typeof classify>) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = columns.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="pane pane-data">
      <div className="pane-head">Data</div>
      <div className="data-search">
        <input placeholder="Search fields" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="pane-scroll">
        {filtered.map((column) => {
          const { glyphClass, glyph } = glyphFor(column.nativeType);
          const kind = classify(column.nativeType);
          return (
            <div
              className="field-row"
              key={column.name}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/field", column.name);
                e.dataTransfer.effectAllowed = "copy";
              }}
            >
              <input
                type="checkbox"
                aria-label={column.name}
                checked={isFieldUsed(selectedWidget, column.name)}
                onChange={() => onSmartAdd(column.name, kind)}
              />
              <span className={`fgl gl ${glyphClass}`}>{glyph}</span>
              <span className="fname">{column.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default DataPane;
