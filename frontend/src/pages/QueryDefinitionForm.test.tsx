import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as datasourcesApi from "../api/datasources";
import QueryDefinitionForm from "./QueryDefinitionForm";

// This project doesn't enable Vitest globals, so RTL's automatic cleanup doesn't run.
// Without it, the first test's rendered form (its SQL field is visible from the start)
// leaks into the second, so getByLabelText("SQL") then matches two fields. Clean up manually.
afterEach(cleanup);

describe("QueryDefinitionForm", () => {
  it("disables Run and Use this query until a connection is picked", async () => {
    vi.spyOn(datasourcesApi, "getDataSources").mockResolvedValue([
      { id: 1, name: "Prod DB", type: "SqlServer", host: "h", databaseName: null, createdAtUtc: "" },
    ]);

    render(<QueryDefinitionForm onRun={vi.fn()} onSubmit={vi.fn()} />);

    expect(await screen.findByRole("button", { name: "Run" })).toBeDisabled();
  });

  it("calls onSubmit with the built query definition after picking a connection and writing SQL", async () => {
    vi.spyOn(datasourcesApi, "getDataSources").mockResolvedValue([
      { id: 1, name: "Prod DB", type: "SqlServer", host: "h", databaseName: null, createdAtUtc: "" },
    ]);
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<QueryDefinitionForm onRun={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.click((await screen.findAllByRole("combobox"))[0]);
    await userEvent.click(await screen.findByText("Prod DB (SqlServer)"));
    await userEvent.type(screen.getByLabelText("SQL"), "select 1");
    await userEvent.click(screen.getByRole("button", { name: "Use this query" }));

    expect(onSubmit).toHaveBeenCalledWith({
      dataSourceConnectionId: 1,
      mode: "RawSql",
      definitionJson: JSON.stringify({ sqlText: "select 1" }),
      rowLimit: null,
    });
  });
});
