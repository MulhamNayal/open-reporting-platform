import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import WidgetChrome from "./WidgetChrome";

// This project doesn't enable Vitest globals, so RTL's automatic cleanup doesn't run.
afterEach(cleanup);

describe("WidgetChrome", () => {
  it("always shows the title", () => {
    render(<WidgetChrome title="Revenue by Month" selected={false} onDuplicate={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()}><div>body</div></WidgetChrome>);

    expect(screen.getByText("Revenue by Month")).toBeInTheDocument();
  });

  it("hides duplicate/delete icons when not selected", () => {
    render(<WidgetChrome title="W" selected={false} onDuplicate={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()}><div>body</div></WidgetChrome>);

    expect(screen.queryByTitle("Duplicate")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Delete")).not.toBeInTheDocument();
  });

  it("shows duplicate/delete icons when selected, and each calls its callback", async () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    render(<WidgetChrome title="W" selected onDuplicate={onDuplicate} onDelete={onDelete} onRename={vi.fn()}><div>body</div></WidgetChrome>);

    await userEvent.click(screen.getByTitle("Duplicate"));
    await userEvent.click(screen.getByTitle("Delete"));

    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("renders no title input or textarea outside the widget body, so the header never blocks canvas drag", () => {
    render(<WidgetChrome title="Revenue by Month" selected={false} onDuplicate={vi.fn()} onDelete={vi.fn()} onRename={vi.fn()}><div>body</div></WidgetChrome>);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("double-clicking the title switches to an editable input, and committing calls onRename", async () => {
    const onRename = vi.fn();
    render(<WidgetChrome title="Old title" selected={false} onDuplicate={vi.fn()} onDelete={vi.fn()} onRename={onRename}><div>body</div></WidgetChrome>);

    await userEvent.dblClick(screen.getByText("Old title"));
    const input = screen.getByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "New title{Enter}");

    expect(onRename).toHaveBeenCalledWith("New title");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("does not call onRename if the title is unchanged or blank", async () => {
    const onRename = vi.fn();
    render(<WidgetChrome title="Kept" selected={false} onDuplicate={vi.fn()} onDelete={vi.fn()} onRename={onRename}><div>body</div></WidgetChrome>);

    await userEvent.dblClick(screen.getByText("Kept"));
    await userEvent.keyboard("{Enter}");

    expect(onRename).not.toHaveBeenCalled();
    expect(screen.getByText("Kept")).toBeInTheDocument();
  });
});
