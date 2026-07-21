import { useEffect, useState } from "react";
import { Box, MenuItem, TextField } from "@mui/material";
import { getDataSources } from "../api/datasources";
import { getDatasets, discoverDatasetColumns, type DatasetSummary, type ColumnDescriptor } from "../api/datasets";
import { classify } from "./fieldClassification";
import type { WidgetBindingDraft, WidgetDraft } from "./widgetDraftReducer";

function WidgetBindingEditor({
  widget, onChange,
}: { widget: WidgetDraft; onChange: (binding: WidgetBindingDraft | null) => void }) {
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [columns, setColumns] = useState<ColumnDescriptor[]>([]);

  useEffect(() => {
    getDataSources().then(async (connections) => {
      const perConnection = await Promise.all(connections.map((c) => getDatasets(c.id)));
      setDatasets(perConnection.flat());
    });
  }, []);

  const datasetId = widget.binding?.datasetId ?? null;

  useEffect(() => {
    if (datasetId !== null) {
      discoverDatasetColumns(datasetId).then(setColumns).catch(() => setColumns([]));
    } else {
      setColumns([]);
    }
  }, [datasetId]);

  if (widget.type === "Text") {
    return null;
  }

  function handleDatasetChange(newDatasetId: number) {
    onChange({ datasetId: newDatasetId, categoryField: null, valueFields: [] });
  }

  function handleCategoryChange(categoryField: string) {
    if (widget.binding) {
      onChange({ ...widget.binding, categoryField: categoryField || null });
    }
  }

  function handleValueFieldsChange(valueFields: string[]) {
    if (widget.binding) {
      onChange({ ...widget.binding, valueFields });
    }
  }

  const numericFields = columns.filter((c) => classify(c.nativeType) === "Numeric").map((c) => c.name);
  const otherFields = columns.filter((c) => classify(c.nativeType) !== "Numeric").map((c) => c.name);
  const showCategoryPicker = widget.type !== "Kpi" && widget.type !== "Table";
  const valueFieldOptions = widget.type === "Table" ? columns.map((c) => c.name) : numericFields;
  const allowMultipleValueFields = widget.type === "Bar" || widget.type === "Line" || widget.type === "Table";

  return (
    <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1 }}>
      <TextField
        select
        size="small"
        label="Dataset"
        value={datasetId ?? ""}
        onChange={(e) => handleDatasetChange(Number(e.target.value))}
        sx={{ minWidth: 140 }}
      >
        {datasets.map((d) => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
      </TextField>

      {showCategoryPicker && (
        <TextField
          select
          size="small"
          label="Category field"
          value={widget.binding?.categoryField ?? ""}
          onChange={(e) => handleCategoryChange(e.target.value)}
          sx={{ minWidth: 140 }}
        >
          {[...otherFields, ...numericFields].map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
        </TextField>
      )}

      <TextField
        select
        size="small"
        label={widget.type === "Table" ? "Columns" : "Value field(s)"}
        slotProps={{ select: { multiple: allowMultipleValueFields } }}
        value={allowMultipleValueFields ? (widget.binding?.valueFields ?? []) : (widget.binding?.valueFields[0] ?? "")}
        onChange={(e) => {
          const value = e.target.value;
          handleValueFieldsChange(Array.isArray(value) ? value : [value as string]);
        }}
        sx={{ minWidth: 140 }}
      >
        {valueFieldOptions.map((name) => <MenuItem key={name} value={name}>{name}</MenuItem>)}
      </TextField>
    </Box>
  );
}

export default WidgetBindingEditor;
