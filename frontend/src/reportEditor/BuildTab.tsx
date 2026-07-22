import { useState } from "react";
import { classify } from "../widgets/fieldClassification";
import type { ColumnDescriptor } from "../api/datasets";
import type { WidgetBindingDraft, WidgetDraft } from "../widgets/widgetDraftReducer";
import { assignField, removeField, WELL_SPECS } from "./fieldAssignment";
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

function fieldNamesInWell(binding: WidgetBindingDraft, wellKey: string): string[] {
  if (wellKey === "category") {
    return binding.categoryField ? [binding.categoryField] : [];
  }
  if (wellKey === "x") {
    return binding.valueFields[0] ? [binding.valueFields[0]] : [];
  }
  if (wellKey === "y") {
    return binding.valueFields[1] ? [binding.valueFields[1]] : [];
  }
  return binding.valueFields;
}

function BuildTab({
  widget, columns, onChange,
}: {
  widget: WidgetDraft | null;
  columns: ColumnDescriptor[];
  onChange: (binding: WidgetBindingDraft | null) => void;
}) {
  const [dropHotWell, setDropHotWell] = useState<string | null>(null);

  if (!widget || widget.type === "Text" || !widget.binding) {
    return <div className="no-visual">Select a visual to configure its fields, or drag a field onto the canvas to start.</div>;
  }

  const binding = widget.binding;
  const wells = WELL_SPECS[widget.type];
  const columnByName = (name: string) => columns.find((c) => c.name === name);

  function handleDrop(wellKey: string, fieldName: string) {
    setDropHotWell(null);
    const column = columnByName(fieldName);
    if (!column || !widget!.binding) {
      return;
    }
    onChange(assignField(widget!.binding, widget!.type, wellKey, fieldName, classify(column.nativeType)));
  }

  return (
    <div className="wells">
      {wells.map((well) => (
        <div className="well" key={well.key}>
          <p className="well-label">{well.label}</p>
          <div
            className={"well-box" + (dropHotWell === well.key ? " drop-hot" : "")}
            onDragOver={(e) => { e.preventDefault(); setDropHotWell(well.key); }}
            onDragLeave={() => setDropHotWell(null)}
            onDrop={(e) => {
              e.preventDefault();
              const fieldName = e.dataTransfer.getData("text/field");
              if (fieldName) {
                handleDrop(well.key, fieldName);
              }
            }}
          >
            {fieldNamesInWell(binding, well.key).length === 0 && <div className="hint">Add data fields here</div>}
            {fieldNamesInWell(binding, well.key).map((fieldName) => {
              const column = columnByName(fieldName);
              const { glyphClass, glyph } = glyphFor(column?.nativeType ?? "");
              return (
                <div className="pill" key={fieldName}>
                  <span className={`gl ${glyphClass}`}>{glyph}</span>
                  <span className="pname">{fieldName}</span>
                  <button
                    type="button"
                    className="x"
                    aria-label={`Remove ${fieldName}`}
                    onClick={() => onChange(removeField(binding, well.key, fieldName))}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default BuildTab;
