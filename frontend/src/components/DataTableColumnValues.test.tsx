import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import DataTable, { type DataTableColumn } from "./DataTable";

interface Row { name: string }

const columns: DataTableColumn<Row>[] = [
  { key: "name", label: "Name", value: (r) => r.name, render: (r) => r.name },
];

// Stands in for a server-paged or row-capped table: only two of the real values are loaded.
const rows: Row[] = [{ name: "Alpha" }, { name: "Beta" }];

function renderTable(columnValues?: (key: string) => Promise<(string | number)[]>) {
  return render(
    <DataTable columns={columns} rows={rows} rowKey={(r) => r.name} columnValues={columnValues} />,
  );
}

describe("DataTable column filter values", () => {
  it("falls back to the loaded rows when no provider is given", async () => {
    renderTable();
    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));

    expect(screen.getByLabelText("Alpha")).toBeInTheDocument();
    expect(screen.getByLabelText("Beta")).toBeInTheDocument();
    expect(screen.queryByLabelText("Gamma")).not.toBeInTheDocument();
  });

  // The point of the provider: the dataset holds values this table never loaded, and the filter
  // has to offer them anyway.
  it("uses the provider's values, including ones absent from the loaded rows", async () => {
    const provider = vi.fn().mockResolvedValue(["Alpha", "Beta", "Gamma", "Delta"]);
    renderTable(provider);

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));

    await waitFor(() => expect(screen.getByLabelText("Gamma")).toBeInTheDocument());
    expect(screen.getByLabelText("Delta")).toBeInTheDocument();
    expect(provider).toHaveBeenCalledWith("name");
  });

  it("keeps the locally-derived values when the lookup fails", async () => {
    const provider = vi.fn().mockRejectedValue(new Error("network"));
    renderTable(provider);

    await userEvent.click(screen.getByRole("button", { name: "Filter Name" }));

    await waitFor(() => expect(provider).toHaveBeenCalled());
    expect(screen.getByLabelText("Alpha")).toBeInTheDocument();
    expect(screen.getByLabelText("Beta")).toBeInTheDocument();
  });

  it("only asks once per column", async () => {
    const provider = vi.fn().mockResolvedValue(["Alpha", "Gamma"]);
    renderTable(provider);

    const filterButton = screen.getByRole("button", { name: "Filter Name" });
    await userEvent.click(filterButton);
    await waitFor(() => expect(screen.getByLabelText("Gamma")).toBeInTheDocument());
    await userEvent.keyboard("{Escape}");
    await userEvent.click(filterButton);

    expect(provider).toHaveBeenCalledTimes(1);
  });
});
