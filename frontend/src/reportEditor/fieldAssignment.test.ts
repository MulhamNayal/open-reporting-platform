import { describe, expect, it } from "vitest";
import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
import type { WidgetBindingDraft } from "../widgets/widgetDraftReducer";
import { accepts, assignField, migrateFieldsOnTypeChange, removeField, smartAdd, WELL_SPECS } from "./fieldAssignment";

const emptyBinding: WidgetBindingDraft = { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS };

describe("WELL_SPECS", () => {
  it("gives Bar/StackedColumn/ClusteredBar/Line/Area exactly Axis + Values (no Legend well)", () => {
    for (const type of ["Bar", "StackedColumn", "ClusteredBar", "Line", "Area"] as const) {
      expect(WELL_SPECS[type].map((w) => w.key)).toEqual(["category", "values"]);
    }
  });

  it("gives Scatter x/y/category wells, not a generic values well", () => {
    expect(WELL_SPECS.Scatter.map((w) => w.key)).toEqual(["x", "y", "category"]);
    expect(WELL_SPECS.Scatter.find((w) => w.key === "x")!.label).toBe("X-axis");
    expect(WELL_SPECS.Scatter.find((w) => w.key === "y")!.label).toBe("Y-axis");
  });

  it("gives Text no wells at all", () => {
    expect(WELL_SPECS.Text).toEqual([]);
  });
});

describe("accepts", () => {
  it("a categorical well accepts both Categorical and Temporal fields", () => {
    expect(accepts("categorical", "Categorical")).toBe(true);
    expect(accepts("categorical", "Temporal")).toBe(true);
    expect(accepts("categorical", "Numeric")).toBe(false);
  });

  it("a numeric well only accepts Numeric fields", () => {
    expect(accepts("numeric", "Numeric")).toBe(true);
    expect(accepts("numeric", "Categorical")).toBe(false);
  });

  it("an any well accepts everything", () => {
    expect(accepts("any", "Unsupported")).toBe(true);
  });
});

describe("assignField", () => {
  it("assigning to the category well replaces any existing categoryField", () => {
    const binding = assignField(emptyBinding, "Bar", "category", "Month", "Temporal");
    const replaced = assignField(binding, "Bar", "category", "Region", "Categorical");

    expect(replaced.categoryField).toBe("Region");
  });

  it("assigning to the values well appends, up to the well's max", () => {
    let binding = assignField(emptyBinding, "Bar", "values", "Revenue", "Numeric");
    binding = assignField(binding, "Bar", "values", "Cost", "Numeric");

    expect(binding.valueFields).toEqual(["Revenue", "Cost"]);
  });

  it("assigning to a Kpi's single-slot values well replaces rather than appends", () => {
    let binding = assignField(emptyBinding, "Kpi", "values", "Revenue", "Numeric");
    binding = assignField(binding, "Kpi", "values", "Profit", "Numeric");

    expect(binding.valueFields).toEqual(["Profit"]);
  });

  it("Scatter's x well writes to valueFields[0] positionally", () => {
    const binding = assignField(emptyBinding, "Scatter", "x", "Sales", "Numeric");

    expect(binding.valueFields[0]).toBe("Sales");
  });

  it("Scatter's y well writes to valueFields[1] positionally, preserving an already-set x", () => {
    let binding = assignField(emptyBinding, "Scatter", "x", "Sales", "Numeric");
    binding = assignField(binding, "Scatter", "y", "Profit", "Numeric");

    expect(binding.valueFields).toEqual(["Sales", "Profit"]);
  });

  it("does not add a duplicate field to the same well", () => {
    let binding = assignField(emptyBinding, "Bar", "values", "Revenue", "Numeric");
    binding = assignField(binding, "Bar", "values", "Revenue", "Numeric");

    expect(binding.valueFields).toEqual(["Revenue"]);
  });
});

describe("removeField", () => {
  it("removes a value field", () => {
    let binding = assignField(emptyBinding, "Bar", "values", "Revenue", "Numeric");
    binding = removeField(binding, "values", "Revenue");

    expect(binding.valueFields).toEqual([]);
  });

  it("removes a category field", () => {
    let binding = assignField(emptyBinding, "Bar", "category", "Month", "Temporal");
    binding = removeField(binding, "category", "Month");

    expect(binding.categoryField).toBeNull();
  });

  it("clearing Scatter's x well leaves y in its positional slot rather than shifting it to x", () => {
    const binding: WidgetBindingDraft = { categoryField: null, valueFields: ["Rx", "Ry"], formatOptions: DEFAULT_FORMAT_OPTIONS };

    const cleared = removeField(binding, "x", "Rx");

    expect(cleared.valueFields[0]).toBeFalsy();
    expect(cleared.valueFields[1]).toBe("Ry");
  });

  it("clearing the only set Scatter axis collapses to an empty array", () => {
    const binding: WidgetBindingDraft = { categoryField: null, valueFields: ["Rx"], formatOptions: DEFAULT_FORMAT_OPTIONS };

    const cleared = removeField(binding, "x", "Rx");

    expect(cleared.valueFields).toEqual([]);
  });
});

describe("smartAdd", () => {
  it("places a numeric field into the empty values well", () => {
    const binding = smartAdd(emptyBinding, "Bar", "Revenue", "Numeric");

    expect(binding.valueFields).toEqual(["Revenue"]);
  });

  it("places a categorical field into the empty category well", () => {
    const binding = smartAdd(emptyBinding, "Bar", "Region", "Categorical");

    expect(binding.categoryField).toBe("Region");
  });

  it("for Scatter, fills x before y", () => {
    let binding = smartAdd(emptyBinding, "Scatter", "Sales", "Numeric");
    binding = smartAdd(binding, "Scatter", "Profit", "Numeric");

    expect(binding.valueFields).toEqual(["Sales", "Profit"]);
  });
});

describe("migrateFieldsOnTypeChange", () => {
  it("carries a compatible categoryField and valueField over to the new type", () => {
    const oldBinding: WidgetBindingDraft = { categoryField: "Month", valueFields: ["Revenue"], formatOptions: DEFAULT_FORMAT_OPTIONS };
    const fieldKinds = { Month: "Temporal" as const, Revenue: "Numeric" as const };

    const migrated = migrateFieldsOnTypeChange(oldBinding, "Line", fieldKinds);

    expect(migrated.categoryField).toBe("Month");
    expect(migrated.valueFields).toEqual(["Revenue"]);
  });

  it("drops a field with no compatible well in the new type (e.g. two value fields migrating to Kpi)", () => {
    const oldBinding: WidgetBindingDraft = { categoryField: "Month", valueFields: ["Revenue", "Cost"], formatOptions: DEFAULT_FORMAT_OPTIONS };
    const fieldKinds = { Month: "Temporal" as const, Revenue: "Numeric" as const, Cost: "Numeric" as const };

    const migrated = migrateFieldsOnTypeChange(oldBinding, "Kpi", fieldKinds);

    expect(migrated.categoryField).toBeNull();
    expect(migrated.valueFields).toEqual(["Revenue"]);
  });

  it("preserves the previous formatOptions", () => {
    const custom = { ...DEFAULT_FORMAT_OPTIONS, showLegend: false };
    const oldBinding: WidgetBindingDraft = { categoryField: null, valueFields: [], formatOptions: custom };

    const migrated = migrateFieldsOnTypeChange(oldBinding, "Table", {});

    expect(migrated.formatOptions).toEqual(custom);
  });
});
