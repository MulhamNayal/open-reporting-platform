import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WidgetBindingEditor from "./WidgetBindingEditor";
import type { WidgetDraft } from "./widgetDraftReducer";

function makeWidget(overrides: Partial<WidgetDraft>): WidgetDraft {
  return {
    id: 1, type: "Bar", x: 0, y: 0, w: 4, h: 3, title: "W", content: null, binding: null,
    ...overrides,
  };
}

describe("WidgetBindingEditor", () => {
  it("renders nothing for a Text widget", () => {
    const { container } = render(
      <WidgetBindingEditor widget={makeWidget({ type: "Text" })} columns={[]} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
