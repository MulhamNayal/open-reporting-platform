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

  it("labels the normalized empty value as (blank) instead of an empty checkbox", () => {
    const withNull: QueryResult = {
      columns: [
        { name: "Region", nativeType: "nvarchar(20)" },
        { name: "Revenue", nativeType: "decimal(18,2)" },
      ],
      rows: [["North", 100], [null, 50]],
    };
    render(<FiltersPane visible rawResult={withNull} filterState={{}} onChange={vi.fn()} />);

    expect(screen.getByText("(blank)")).toBeInTheDocument();
  });

  it("shows a cross-filter chip with the field and value when crossFilter is set", () => {
    const { container } = render(
      <FiltersPane
        visible
        rawResult={result}
        filterState={{}}
        onChange={vi.fn()}
        crossFilter={{ field: "Region", value: "North" }}
        onClearCrossFilter={vi.fn()}
        onResetAll={vi.fn()}
      />,
    );

    // "Region" also appears as this field's own filter-group label, so the
    // chip's combined text is checked directly rather than via a page-wide
    // getByText, which would be ambiguous between the two.
    const chip = container.querySelector(".xfchip");
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain("Region");
    expect(chip?.textContent).toContain("North");
  });

  it("clicking the cross-filter chip's clear button calls onClearCrossFilter", async () => {
    const onClearCrossFilter = vi.fn();
    render(
      <FiltersPane
        visible
        rawResult={result}
        filterState={{}}
        onChange={vi.fn()}
        crossFilter={{ field: "Region", value: "North" }}
        onClearCrossFilter={onClearCrossFilter}
        onResetAll={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Clear cross-filter" }));

    expect(onClearCrossFilter).toHaveBeenCalledTimes(1);
  });

  it("shows a Reset filters link when a filter is active, and calls onResetAll when clicked", async () => {
    const onResetAll = vi.fn();
    render(
      <FiltersPane
        visible
        rawResult={result}
        filterState={{ Region: ["North"] }}
        onChange={vi.fn()}
        onResetAll={onResetAll}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Reset filters" }));

    expect(onResetAll).toHaveBeenCalledTimes(1);
  });

  it("does not show a Reset filters link when nothing is active", () => {
    render(<FiltersPane visible rawResult={result} filterState={{}} onChange={vi.fn()} onResetAll={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "Reset filters" })).not.toBeInTheDocument();
  });
});
