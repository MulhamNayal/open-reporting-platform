import type { FieldKind } from "../widgets/fieldClassification";
import type { WidgetBindingDraft } from "../widgets/widgetDraftReducer";
import type { WidgetType } from "../api/widgets";

export interface WellSpec {
  key: "category" | "values" | "x" | "y";
  label: string;
  accept: "categorical" | "numeric" | "any";
  max: number;
}

const AXIS_VALUES_WELLS: WellSpec[] = [
  { key: "category", label: "Axis", accept: "categorical", max: 1 },
  { key: "values", label: "Values", accept: "numeric", max: 6 },
];

const LEGEND_CATEGORY_VALUE_WELLS: WellSpec[] = [
  { key: "category", label: "Legend", accept: "categorical", max: 1 },
  { key: "values", label: "Values", accept: "numeric", max: 1 },
];

export const WELL_SPECS: Record<WidgetType, WellSpec[]> = {
  Bar: AXIS_VALUES_WELLS,
  ClusteredBar: AXIS_VALUES_WELLS,
  StackedColumn: AXIS_VALUES_WELLS,
  Line: AXIS_VALUES_WELLS,
  Area: AXIS_VALUES_WELLS,
  Pie: LEGEND_CATEGORY_VALUE_WELLS,
  Donut: LEGEND_CATEGORY_VALUE_WELLS,
  Scatter: [
    { key: "x", label: "X-axis", accept: "numeric", max: 1 },
    { key: "y", label: "Y-axis", accept: "numeric", max: 1 },
    { key: "category", label: "Details", accept: "categorical", max: 1 },
  ],
  Kpi: [{ key: "values", label: "Fields", accept: "numeric", max: 1 }],
  Table: [{ key: "values", label: "Columns", accept: "any", max: 8 }],
  Text: [],
};

export function accepts(wellAccept: WellSpec["accept"], fieldKind: FieldKind): boolean {
  if (wellAccept === "any") {
    return true;
  }
  if (wellAccept === "numeric") {
    return fieldKind === "Numeric";
  }
  return fieldKind === "Categorical" || fieldKind === "Temporal";
}

function wellFor(widgetType: WidgetType, wellKey: string): WellSpec | undefined {
  return WELL_SPECS[widgetType].find((w) => w.key === wellKey);
}

export function assignField(
  binding: WidgetBindingDraft,
  widgetType: WidgetType,
  wellKey: string,
  fieldName: string,
  _fieldKind: FieldKind,
): WidgetBindingDraft {
  const well = wellFor(widgetType, wellKey);
  if (!well) {
    return binding;
  }

  if (wellKey === "category") {
    return { ...binding, categoryField: fieldName };
  }

  if (wellKey === "x") {
    const next = [...binding.valueFields];
    next[0] = fieldName;
    return { ...binding, valueFields: next };
  }

  if (wellKey === "y") {
    const next = [...binding.valueFields];
    next[1] = fieldName;
    return { ...binding, valueFields: next };
  }

  // "values" well
  if (binding.valueFields.includes(fieldName)) {
    return binding;
  }

  if (well.max === 1) {
    return { ...binding, valueFields: [fieldName] };
  }

  if (binding.valueFields.length >= well.max) {
    return binding;
  }

  return { ...binding, valueFields: [...binding.valueFields, fieldName] };
}

export function removeField(binding: WidgetBindingDraft, wellKey: string, fieldName: string): WidgetBindingDraft {
  if (wellKey === "category") {
    return binding.categoryField === fieldName ? { ...binding, categoryField: null } : binding;
  }

  // Scatter's x/y wells are positional (index 0 = X, index 1 = Y). Filtering would
  // shift the surviving measure into the wrong axis, so clear the one slot in place.
  if (wellKey === "x" || wellKey === "y") {
    const index = wellKey === "x" ? 0 : 1;
    if (binding.valueFields[index] !== fieldName) {
      return binding;
    }
    const next = [...binding.valueFields];
    delete next[index];
    if (!next[0] && !next[1]) {
      return { ...binding, valueFields: [] };
    }
    return { ...binding, valueFields: next };
  }

  return { ...binding, valueFields: binding.valueFields.filter((f) => f !== fieldName) };
}

export function smartAdd(
  binding: WidgetBindingDraft,
  widgetType: WidgetType,
  fieldName: string,
  fieldKind: FieldKind,
): WidgetBindingDraft {
  const wells = WELL_SPECS[widgetType];

  function wellFieldCount(well: WellSpec): number {
    if (well.key === "category") {
      return binding.categoryField ? 1 : 0;
    }
    if (well.key === "x") {
      return binding.valueFields[0] ? 1 : 0;
    }
    if (well.key === "y") {
      return binding.valueFields[1] ? 1 : 0;
    }
    return binding.valueFields.length;
  }

  const target =
    wells.find((w) => accepts(w.accept, fieldKind) && wellFieldCount(w) === 0) ??
    wells.find((w) => accepts(w.accept, fieldKind) && wellFieldCount(w) < w.max);

  if (!target) {
    return binding;
  }

  return assignField(binding, widgetType, target.key, fieldName, fieldKind);
}

export function migrateFieldsOnTypeChange(
  oldBinding: WidgetBindingDraft,
  newType: WidgetType,
  fieldKinds: Record<string, FieldKind>,
): WidgetBindingDraft {
  const flatFields: string[] = [];
  if (oldBinding.categoryField) {
    flatFields.push(oldBinding.categoryField);
  }
  flatFields.push(...oldBinding.valueFields);

  let binding: WidgetBindingDraft = { categoryField: null, valueFields: [], formatOptions: oldBinding.formatOptions };

  for (const fieldName of flatFields) {
    const kind = fieldKinds[fieldName];
    if (!kind) {
      continue;
    }
    binding = smartAdd(binding, newType, fieldName, kind);
  }

  return binding;
}
