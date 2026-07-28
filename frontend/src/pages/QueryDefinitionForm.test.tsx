import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as datasourcesApi from "../api/datasources";
import QueryDefinitionForm from "./QueryDefinitionForm";

// This project doesn't enable Vitest globals, so RTL's automatic cleanup doesn't run.
// Without it, the first test's rendered form (its SQL field is visible from the start)
// leaks into the second, so getByLabelText("SQL") then matches two fields. Clean up manually.
afterEach(cleanup);

// SqlEditor wraps real CodeMirror — its own rendering/mounting is covered by
// SqlEditor.test.tsx. QueryDefinitionForm's tests only care that typed SQL flows
// into the built query definition, so a plain textarea stands in for it here,
// keeping these tests about this form's logic rather than CodeMirror's internals.
vi.mock("./SqlEditor", () => ({
  default: ({ value, onChange, "aria-label": ariaLabel }: { value: string; onChange: (v: string) => void; "aria-label"?: string }) => (
    <textarea aria-label={ariaLabel ?? "SQL"} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

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
    vi.spyOn(datasourcesApi, "getDataSourceSchema").mockResolvedValue({ tables: [] });
    vi.spyOn(datasourcesApi, "getDataSourceRoutines").mockResolvedValue([]);
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

  it("offers known stored procedures/functions as autocomplete suggestions once Stored Procedure mode is picked", async () => {
    vi.spyOn(datasourcesApi, "getDataSources").mockResolvedValue([
      { id: 1, name: "Prod DB", type: "SqlServer", host: "h", databaseName: null, createdAtUtc: "" },
    ]);
    vi.spyOn(datasourcesApi, "getDataSourceSchema").mockResolvedValue({ tables: [] });
    vi.spyOn(datasourcesApi, "getDataSourceRoutines").mockResolvedValue([
      { schema: "dbo", name: "GetAgentSummary" },
      { schema: "reporting", name: "MonthlyTotals" },
    ]);

    render(<QueryDefinitionForm onRun={vi.fn()} onSubmit={vi.fn()} />);

    await userEvent.click((await screen.findAllByRole("combobox"))[0]);
    await userEvent.click(await screen.findByText("Prod DB (SqlServer)"));
    await userEvent.click(screen.getByLabelText("Mode"));
    await userEvent.click(await screen.findByText("Stored Procedure"));

    await userEvent.click(screen.getByLabelText("Procedure or Function Name"));

    expect(await screen.findByText("dbo.GetAgentSummary")).toBeInTheDocument();
    expect(screen.getByText("reporting.MonthlyTotals")).toBeInTheDocument();
  });

  it("selecting a suggested procedure sets it as the routine name used in the saved definition", async () => {
    vi.spyOn(datasourcesApi, "getDataSources").mockResolvedValue([
      { id: 1, name: "Prod DB", type: "SqlServer", host: "h", databaseName: null, createdAtUtc: "" },
    ]);
    vi.spyOn(datasourcesApi, "getDataSourceSchema").mockResolvedValue({ tables: [] });
    vi.spyOn(datasourcesApi, "getDataSourceRoutines").mockResolvedValue([{ schema: "dbo", name: "GetAgentSummary" }]);
    const onSubmit = vi.fn().mockResolvedValue(undefined);

    render(<QueryDefinitionForm onRun={vi.fn()} onSubmit={onSubmit} />);

    await userEvent.click((await screen.findAllByRole("combobox"))[0]);
    await userEvent.click(await screen.findByText("Prod DB (SqlServer)"));
    await userEvent.click(screen.getByLabelText("Mode"));
    await userEvent.click(await screen.findByText("Stored Procedure"));

    await userEvent.click(screen.getByLabelText("Procedure or Function Name"));
    await userEvent.click(await screen.findByText("dbo.GetAgentSummary"));
    await userEvent.click(screen.getByRole("button", { name: "Use this query" }));

    expect(onSubmit).toHaveBeenCalledWith({
      dataSourceConnectionId: 1,
      mode: "StoredProcedure",
      definitionJson: JSON.stringify({ routineName: "dbo.GetAgentSummary", parameters: [] }),
      rowLimit: null,
    });
  });
});
