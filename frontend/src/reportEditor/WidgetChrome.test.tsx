import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import WidgetChrome from "./WidgetChrome";

// This project doesn't enable Vitest globals, so RTL's automatic cleanup doesn't run.
afterEach(cleanup);

describe("WidgetChrome", () => {
  it("always shows the title", () => {
    render(<WidgetChrome title="Revenue by Month" selected={false} onDuplicate={vi.fn()} onDelete={vi.fn()}><div>body</div></WidgetChrome>);

    expect(screen.getByText("Revenue by Month")).toBeInTheDocument();
  });

  it("hides duplicate/delete icons when not selected", () => {
    render(<WidgetChrome title="W" selected={false} onDuplicate={vi.fn()} onDelete={vi.fn()}><div>body</div></WidgetChrome>);

    expect(screen.queryByTitle("Duplicate")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Delete")).not.toBeInTheDocument();
  });

  it("shows duplicate/delete icons when selected, and each calls its callback", async () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    render(<WidgetChrome title="W" selected onDuplicate={onDuplicate} onDelete={onDelete}><div>body</div></WidgetChrome>);

    await userEvent.click(screen.getByTitle("Duplicate"));
    await userEvent.click(screen.getByTitle("Delete"));

    expect(onDuplicate).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
