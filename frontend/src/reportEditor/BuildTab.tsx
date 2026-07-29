import { useState } from "react";
import { classify } from "../widgets/fieldClassification";
import type { ColumnDescriptor, DatasetSummary } from "../api/datasets";
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
  widget, columns, datasets, reportDatasetId, onDatasetChange, onChange,
}: {
  widget: WidgetDraft | null;
  columns: ColumnDescriptor[];
  datasets: DatasetSummary[];
  reportDatasetId: number | null;
  onDatasetChange: (datasetId: number | null) => void;
  onChange: (binding: WidgetBindingDraft | null) => void;
}) {
  const [dropHotWell, setDropHotWell] = useState<string | null>(null);

  if (!widget || widget.type === "Text") {
    return <div className="no-visual">Select a visual to configure its fields, or drag a field onto the canvas to start.</div>;
  }

  const defaultName = datasets.find((d) => d.id === reportDatasetId)?.name;

  const binding = widget.binding;

  function handleDatasetChange(next: number | null) {
    // datasetChanged clears the binding, since its field names belong to the old dataset.
    // Only worth confirming when there's actually something to lose.
    const hasFields = binding !== null && (binding.categoryField !== null || binding.valueFields.length > 0);
    if (hasFields && !window.confirm("Changing the dataset clears this widget's fields. Continue?")) {
      return;
    }
    onDatasetChange(next);
  }

  // Rendered above the wells and outside the no-binding guard below: a freshly added visual has
  // no binding yet, and picking its dataset is the step that comes before picking fields.
  const datasetPicker = (
    <div className="well">
      <p className="well-label">Dataset</p>
      <select
        aria-label="Dataset"
        value={widget.datasetId ?? ""}
        disabled={datasets.length === 0}
        onChange={(e) => handleDatasetChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">{defaultName ? `Report default (${defaultName})` : "Report default"}</option>
        {datasets.map((dataset) => (
          <option key={dataset.id} value={dataset.id}>{dataset.name}</option>
        ))}
      </select>
    </div>
  );

  if (binding === null) {
    return (
      <div className="wells">
        {datasetPicker}
        <div className="no-visual">Drag a field onto this visual, or pick one from the Data pane, to configure it.</div>
      </div>
    );
  }

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
      {datasetPicker}
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
