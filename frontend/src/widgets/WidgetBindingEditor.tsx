import { Box, MenuItem, TextField } from "@mui/material";
import type { ColumnDescriptor } from "../api/datasets";
import { classify } from "./fieldClassification";
import type { WidgetBindingDraft, WidgetDraft } from "./widgetDraftReducer";

function WidgetBindingEditor({
  widget, columns, onChange,
}: { widget: WidgetDraft; columns: ColumnDescriptor[]; onChange: (binding: WidgetBindingDraft | null) => void }) {
  if (widget.type === "Text") {
    return null;
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
