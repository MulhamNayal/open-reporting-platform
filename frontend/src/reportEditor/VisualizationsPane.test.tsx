import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import VisualizationsPane from "./VisualizationsPane";
import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
import type { WidgetDraft } from "../widgets/widgetDraftReducer";

// This project doesn't enable Vitest globals, so RTL's automatic cleanup doesn't run.
afterEach(cleanup);

const kpiWidget: WidgetDraft = {
  id: 1, type: "Kpi", x: 0, y: 0, w: 2, h: 2, title: "Total", content: null,
  binding: { categoryField: null, valueFields: [], formatOptions: DEFAULT_FORMAT_OPTIONS },
};

describe("VisualizationsPane", () => {
  it("clicking a viz-cell with nothing selected calls onAddWidget with that type", async () => {
    const onAddWidget = vi.fn();
    render(
      <VisualizationsPane selectedWidget={null} onAddWidget={onAddWidget} onChangeType={vi.fn()}>
        {() => <div>tab content</div>}
      </VisualizationsPane>,
    );

    await userEvent.click(screen.getByTitle("Table"));

    expect(onAddWidget).toHaveBeenCalledWith("Table");
  });

  it("clicking a viz-cell with a widget selected calls onChangeType instead", async () => {
    const onChangeType = vi.fn();
    render(
      <VisualizationsPane selectedWidget={kpiWidget} onAddWidget={vi.fn()} onChangeType={onChangeType}>
        {() => <div>tab content</div>}
      </VisualizationsPane>,
    );

    await userEvent.click(screen.getByTitle("Table"));

    expect(onChangeType).toHaveBeenCalledWith("Table");
  });

  it("marks the selected widget's own type as active", () => {
    render(
      <VisualizationsPane selectedWidget={kpiWidget} onAddWidget={vi.fn()} onChangeType={vi.fn()}>
        {() => <div>tab content</div>}
      </VisualizationsPane>,
    );

    expect(screen.getByTitle("Card (KPI)")).toHaveClass("active");
  });

  it("switches between Build and Format tabs", async () => {
    render(
      <VisualizationsPane selectedWidget={null} onAddWidget={vi.fn()} onChangeType={vi.fn()}>
        {(tab) => <div>current tab: {tab}</div>}
      </VisualizationsPane>,
    );

    expect(screen.getByText("current tab: build")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Format" }));

    expect(screen.getByText("current tab: format")).toBeInTheDocument();
  });
});
