import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReportPage } from "../api/reportPages";
import PageTabsBar from "./PageTabsBar";

const pages: ReportPage[] = [
  { id: 1, reportId: 1, name: "Page 1", sortOrder: 0, filterState: "{}" },
  { id: 2, reportId: 1, name: "Page 2", sortOrder: 1, filterState: "{}" },
];

describe("PageTabsBar", () => {
  it("renders one tab per page, marking the active one", () => {
    render(<PageTabsBar pages={pages} activePageId={2} onSelect={vi.fn()} onAdd={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Page 2" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "Page 1" })).not.toHaveClass("active");
  });

  it("clicking a tab calls onSelect with its id", async () => {
    const onSelect = vi.fn();
    render(<PageTabsBar pages={pages} activePageId={2} onSelect={onSelect} onAdd={vi.fn()} onRename={vi.fn()} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Page 1" }));

    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it("clicking the add-page button calls onAdd", async () => {
    const onAdd = vi.fn();
    render(<PageTabsBar pages={pages} activePageId={1} onSelect={vi.fn()} onAdd={onAdd} onRename={vi.fn()} onDelete={vi.fn()} />);

    await userEvent.click(screen.getByTitle("New page"));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("double-clicking a tab starts a rename, committing on blur", async () => {
    const onRename = vi.fn();
    render(<PageTabsBar pages={pages} activePageId={1} onSelect={vi.fn()} onAdd={vi.fn()} onRename={onRename} onDelete={vi.fn()} />);

    await userEvent.dblClick(screen.getByRole("button", { name: "Page 1" }));
    const input = screen.getByDisplayValue("Page 1");
    await userEvent.clear(input);
    await userEvent.type(input, "Overview");
    await userEvent.tab();

    expect(onRename).toHaveBeenCalledWith(1, "Overview");
  });
});
