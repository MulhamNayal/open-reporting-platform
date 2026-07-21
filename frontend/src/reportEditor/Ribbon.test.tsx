import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import Ribbon from "./Ribbon";

// This project doesn't enable Vitest globals, so RTL's automatic cleanup doesn't run.
afterEach(cleanup);

describe("Ribbon", () => {
  it("calls onRename when File > Rename report is chosen", async () => {
    const onRename = vi.fn();
    render(
      <Ribbon
        reportName="My Report"
        onRename={onRename}
        onChangeDataSource={vi.fn()}
        onBackToReports={vi.fn()}
        onAddText={vi.fn()}
        onToggleFilters={vi.fn()}
        onRefresh={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "File" }));
    await userEvent.click(await screen.findByText("Rename report"));

    expect(onRename).toHaveBeenCalledTimes(1);
  });

  it("calls onSave when the primary Save button is clicked", async () => {
    const onSave = vi.fn();
    render(
      <Ribbon
        reportName="My Report"
        onRename={vi.fn()}
        onChangeDataSource={vi.fn()}
        onBackToReports={vi.fn()}
        onAddText={vi.fn()}
        onToggleFilters={vi.fn()}
        onRefresh={vi.fn()}
        onSave={onSave}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
