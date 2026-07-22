import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { QueryResult } from "../api/datasets";
import FiltersPane from "./FiltersPane";

const result: QueryResult = {
  columns: [
    { name: "Region", nativeType: "nvarchar(20)" },
    { name: "Revenue", nativeType: "decimal(18,2)" },
  ],
  rows: [["North", 100], ["South", 200], ["North", 150]],
};

describe("FiltersPane", () => {
  it("renders nothing visible when visible is false", () => {
    const { container } = render(<FiltersPane visible={false} rawResult={result} filterState={{}} onChange={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("auto-populates one collapsible group per Categorical field, with its distinct values", () => {
    render(<FiltersPane visible rawResult={result} filterState={{}} onChange={vi.fn()} />);

    expect(screen.getByText("Region")).toBeInTheDocument();
    expect(screen.queryByText("Revenue")).not.toBeInTheDocument();
    expect(screen.getAllByText("North")).toHaveLength(1);
    expect(screen.getByText("South")).toBeInTheDocument();
  });

  it("checking a value adds it to that field's filterState selection", async () => {
    const onChange = vi.fn();
    render(<FiltersPane visible rawResult={result} filterState={{}} onChange={onChange} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "North" }));

    expect(onChange).toHaveBeenCalledWith({ Region: ["North"] });
  });

  it("unchecking a value removes it from that field's filterState selection", async () => {
    const onChange = vi.fn();
    render(<FiltersPane visible rawResult={result} filterState={{ Region: ["North", "South"] }} onChange={onChange} />);

    await userEvent.click(screen.getByRole("checkbox", { name: "North" }));

    expect(onChange).toHaveBeenCalledWith({ Region: ["South"] });
  });

  it("shows an empty-state message when there's no data yet", () => {
    render(<FiltersPane visible rawResult={null} filterState={{}} onChange={vi.fn()} />);

    expect(screen.getByText(/no data to filter yet/i)).toBeInTheDocument();
  });

  it("normalizes null cells to \"\" so the checkbox value matches applyFilters (not the literal \"null\")", async () => {
    const withNull: QueryResult = {
      columns: [
        { name: "Region", nativeType: "nvarchar(20)" },
        { name: "Revenue", nativeType: "decimal(18,2)" },
      ],
      rows: [["North", 100], [null, 50]],
    };
    const onChange = vi.fn();
    render(<FiltersPane visible rawResult={withNull} filterState={{}} onChange={onChange} />);

    // The null cell must not surface as the literal string "null".
    expect(screen.queryByText("null")).not.toBeInTheDocument();

    // distinctValues sorts alphabetically, so the normalized "" sorts before "North".
    const checkboxes = screen.getAllByRole("checkbox");
    await userEvent.click(checkboxes[0]);

    expect(onChange).toHaveBeenCalledWith({ Region: [""] });
  });
});
