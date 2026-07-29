import { describe, expect, it } from "vitest";
import { resolveWidgetDatasetId } from "./widgetDataset";

describe("resolveWidgetDatasetId", () => {
  it("uses the widget's own dataset when it has one", () => {
    expect(resolveWidgetDatasetId(7, 3)).toBe(7);
  });

  it("falls back to the report default when the widget has none", () => {
    expect(resolveWidgetDatasetId(null, 3)).toBe(3);
    expect(resolveWidgetDatasetId(undefined, 3)).toBe(3);
  });

  it("returns null when neither is set", () => {
    expect(resolveWidgetDatasetId(null, null)).toBeNull();
  });

  // Why this uses ?? and not ||: identity columns start at 1 so id 0 shouldn't occur, but
  // silently treating a real id as "absent" is the kind of bug that only shows up in prod.
  it("does not treat dataset id 0 as absent", () => {
    expect(resolveWidgetDatasetId(0, 3)).toBe(0);
  });
});
