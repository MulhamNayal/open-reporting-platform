import { describe, expect, it } from "vitest";
import { widgetDraftReducer, type WidgetDraft } from "./widgetDraftReducer";
import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";

const baseWidget: WidgetDraft = {
  id: 1, type: "Text", x: 0, y: 0, w: 4, h: 2, title: "A", content: "hi", binding: null,
};

describe("widgetDraftReducer", () => {
  it("loaded replaces the whole state", () => {
    const result = widgetDraftReducer([], { type: "loaded", widgets: [baseWidget] });
    expect(result).toEqual([baseWidget]);
  });

  it("added appends a widget", () => {
    const newWidget: WidgetDraft = { ...baseWidget, id: -1, title: "B" };
    const result = widgetDraftReducer([baseWidget], { type: "added", widget: newWidget });
    expect(result).toEqual([baseWidget, newWidget]);
  });

  it("removed filters out the widget by id", () => {
    const other: WidgetDraft = { ...baseWidget, id: 2 };
    const result = widgetDraftReducer([baseWidget, other], { type: "removed", id: 1 });
    expect(result).toEqual([other]);
  });

  it("positionsChanged updates only matching widgets' x/y/w/h", () => {
    const other: WidgetDraft = { ...baseWidget, id: 2, x: 0, y: 0, w: 4, h: 2 };
    const result = widgetDraftReducer(
      [baseWidget, other],
      { type: "positionsChanged", changes: [{ id: 2, x: 4, y: 1, w: 6, h: 3 }] },
    );
    expect(result[0]).toEqual(baseWidget);
    expect(result[1]).toMatchObject({ id: 2, x: 4, y: 1, w: 6, h: 3 });
  });

  it("titleChanged updates only the matching widget's title", () => {
    const result = widgetDraftReducer([baseWidget], { type: "titleChanged", id: 1, title: "New title" });
    expect(result[0].title).toBe("New title");
  });

  it("contentChanged updates only the matching widget's content", () => {
    const result = widgetDraftReducer([baseWidget], { type: "contentChanged", id: 1, content: "New content" });
    expect(result[0].content).toBe("New content");
  });

  it("bindingChanged updates only the matching widget's binding", () => {
    const binding = { categoryField: "Month", valueFields: ["Revenue"], formatOptions: DEFAULT_FORMAT_OPTIONS };
    const result = widgetDraftReducer([baseWidget], { type: "bindingChanged", id: 1, binding });
    expect(result[0].binding).toEqual(binding);
  });
});
