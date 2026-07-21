import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as datasourcesApi from "../api/datasources";
import * as datasetsApi from "../api/datasets";
import WidgetBindingEditor from "./WidgetBindingEditor";
import type { WidgetDraft } from "./widgetDraftReducer";

function makeWidget(overrides: Partial<WidgetDraft>): WidgetDraft {
  return {
    id: 1, type: "Bar", x: 0, y: 0, w: 4, h: 3, title: "W", content: null, binding: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WidgetBindingEditor", () => {
  it("renders nothing for a Text widget", () => {
    // The component's load effect runs before its Text-widget early return, so stub the API to avoid a real request.
    vi.spyOn(datasourcesApi, "getDataSources").mockResolvedValue([]);
    const { container } = render(<WidgetBindingEditor widget={makeWidget({ type: "Text" })} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a Dataset picker populated from every connection's datasets", async () => {
    vi.spyOn(datasourcesApi, "getDataSources").mockResolvedValue([
      { id: 1, name: "Prod DB", type: "SqlServer", host: "h", databaseName: null, createdAtUtc: "" },
    ]);
    vi.spyOn(datasetsApi, "getDatasets").mockResolvedValue([
      { id: 5, dataSourceConnectionId: 1, name: "Sales", description: null, mode: "TableQuery", rowLimit: null, columns: [], createdAtUtc: "", updatedAtUtc: "" },
    ]);

    render(<WidgetBindingEditor widget={makeWidget({})} onChange={vi.fn()} />);

    // MUI's closed Select does not mount its MenuItems; open the Dataset picker to reveal the loaded options.
    await userEvent.click((await screen.findAllByRole("combobox"))[0]);
    expect(await screen.findByText("Sales")).toBeInTheDocument();
  });
});
