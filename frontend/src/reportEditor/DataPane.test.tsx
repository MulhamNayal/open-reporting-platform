import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
import type { WidgetDraft } from "../widgets/widgetDraftReducer";
import DataPane from "./DataPane";

// This project doesn't enable Vitest globals, so RTL's automatic cleanup doesn't run.
afterEach(cleanup);

const columns = [
  { name: "Region", nativeType: "nvarchar(20)" },
  { name: "Month", nativeType: "date" },
  { name: "Revenue", nativeType: "decimal(18,2)" },
];

describe("DataPane", () => {
  it("lists every column, filtered by the search box", async () => {
    render(<DataPane columns={columns} selectedWidget={null} onSmartAdd={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Search fields"), "rev");

    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.queryByText("Region")).not.toBeInTheDocument();
  });

  it("checking a field's checkbox calls onSmartAdd with its name and classified kind", async () => {
    const onSmartAdd = vi.fn();
    render(<DataPane columns={columns} selectedWidget={null} onSmartAdd={onSmartAdd} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "Revenue" }));

    expect(onSmartAdd).toHaveBeenCalledWith("Revenue", "Numeric");
  });

  it("marks a field's checkbox checked when it's already used in the selected widget's binding", () => {
    const widget: WidgetDraft = {
      id: 1, type: "Bar", x: 0, y: 0, w: 4, h: 3, title: "W", content: null,
      binding: { categoryField: "Month", valueFields: ["Revenue"], formatOptions: DEFAULT_FORMAT_OPTIONS },
    };

    render(<DataPane columns={columns} selectedWidget={widget} onSmartAdd={vi.fn()} />);

    expect(screen.getByRole("checkbox", { name: "Month" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Revenue" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Region" })).not.toBeChecked();
  });
});
