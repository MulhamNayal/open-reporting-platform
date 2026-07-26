import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import DataTablePager from "./DataTablePager";

afterEach(cleanup);

describe("DataTablePager", () => {
  it("shows the correct range text for the current page", () => {
    render(<DataTablePager page={0} rowsPerPage={25} totalRows={42} onPageChange={vi.fn()} onRowsPerPageChange={vi.fn()} />);
    expect(screen.getByText("1–25 of 42")).toBeInTheDocument();
  });

  it("disables Previous on the first page and Next on the last page", () => {
    const { rerender } = render(
      <DataTablePager page={0} rowsPerPage={25} totalRows={42} onPageChange={vi.fn()} onRowsPerPageChange={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /next page/i })).toBeEnabled();

    rerender(<DataTablePager page={1} rowsPerPage={25} totalRows={42} onPageChange={vi.fn()} onRowsPerPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /previous page/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /next page/i })).toBeDisabled();
  });

  it("clicking Next calls onPageChange with the next page index", async () => {
    const onPageChange = vi.fn();
    render(<DataTablePager page={0} rowsPerPage={25} totalRows={42} onPageChange={onPageChange} onRowsPerPageChange={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: /next page/i }));

    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("clicking a rows-per-page option calls onRowsPerPageChange with that value", async () => {
    const onRowsPerPageChange = vi.fn();
    render(
      <DataTablePager page={0} rowsPerPage={25} totalRows={42} onPageChange={vi.fn()} onRowsPerPageChange={onRowsPerPageChange} />,
    );

    await userEvent.click(screen.getByRole("button", { name: "10 rows per page" }));

    expect(onRowsPerPageChange).toHaveBeenCalledWith(10);
  });

  it("marks the active rows-per-page option", () => {
    render(<DataTablePager page={0} rowsPerPage={10} totalRows={42} onPageChange={vi.fn()} onRowsPerPageChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: "10 rows per page" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "25 rows per page" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows 0 of 0 when there are no rows", () => {
    render(<DataTablePager page={0} rowsPerPage={25} totalRows={0} onPageChange={vi.fn()} onRowsPerPageChange={vi.fn()} />);
    expect(screen.getByText("0–0 of 0")).toBeInTheDocument();
  });
});
