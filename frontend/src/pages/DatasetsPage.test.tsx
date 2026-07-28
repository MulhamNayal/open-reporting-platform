import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as datasourcesApi from "../api/datasources";
import * as datasetsApi from "../api/datasets";
import DatasetsPage from "./DatasetsPage";

afterEach(cleanup);

// SqlEditor wraps real CodeMirror — its own mounting/rendering is covered by
// SqlEditor.test.tsx. These tests only care that this page wires the right
// schema in and reads typed SQL back out, so a plain textarea stands in.
vi.mock("./SqlEditor", () => ({
  default: ({ value, onChange, "aria-label": ariaLabel }: { value: string; onChange: (v: string) => void; "aria-label"?: string }) => (
    <textarea aria-label={ariaLabel ?? "SQL"} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const connection: datasourcesApi.DataSourceConnectionSummary = {
  id: 1, name: "Prod DB", type: "SqlServer", host: "h", databaseName: null, createdAtUtc: "",
};

function stubCommonCalls() {
  vi.spyOn(datasourcesApi, "getDataSources").mockResolvedValue([connection]);
  vi.spyOn(datasetsApi, "getDatasets").mockResolvedValue([]);
  vi.spyOn(datasourcesApi, "getDataSourceSchema").mockResolvedValue({ tables: [] });
  vi.spyOn(datasourcesApi, "getDataSourceRoutines").mockResolvedValue([]);
}

async function selectConnection() {
  await userEvent.click((await screen.findAllByRole("combobox"))[0]);
  await userEvent.click(await screen.findByText("Prod DB (SqlServer)"));
}

describe("DatasetsPage", () => {
  it("creates a Raw SQL dataset with the SQL typed into the editor", async () => {
    stubCommonCalls();
    const createDataset = vi.spyOn(datasetsApi, "createDataset").mockResolvedValue({
      id: 10, dataSourceConnectionId: 1, name: "My dataset", description: null, mode: "RawSql",
      definitionJson: JSON.stringify({ sqlText: "select 1" }), rowLimit: null, isSaved: true, columns: [],
      createdAtUtc: "", updatedAtUtc: "",
    });
    vi.spyOn(datasetsApi, "discoverDatasetColumns").mockResolvedValue([]);

    render(<DatasetsPage />);
    await selectConnection();

    await userEvent.click(screen.getByLabelText("Mode"));
    await userEvent.click(await screen.findByText("Raw SQL"));

    await userEvent.type(screen.getByLabelText("Dataset Name"), "My dataset");
    await userEvent.type(screen.getByLabelText("SQL"), "select 1");
    await userEvent.click(screen.getByRole("button", { name: "Add Dataset" }));

    expect(createDataset).toHaveBeenCalledWith(expect.objectContaining({
      mode: "RawSql",
      definitionJson: JSON.stringify({ sqlText: "select 1" }),
    }));
  });

  it("offers known stored procedures/functions as autocomplete suggestions once Stored Procedure mode is picked", async () => {
    stubCommonCalls();
    vi.spyOn(datasourcesApi, "getDataSourceRoutines").mockResolvedValue([
      { schema: "dbo", name: "GetAgentSummary" },
      { schema: "reporting", name: "MonthlyTotals" },
    ]);

    render(<DatasetsPage />);
    await selectConnection();

    await userEvent.click(screen.getByLabelText("Mode"));
    await userEvent.click(await screen.findByText("Stored Procedure"));
    await userEvent.click(screen.getByLabelText("Procedure or Function Name"));

    expect(await screen.findByText("dbo.GetAgentSummary")).toBeInTheDocument();
    expect(screen.getByText("reporting.MonthlyTotals")).toBeInTheDocument();
  });

  it("creates a Stored Procedure dataset with the routine name picked from the suggestions", async () => {
    stubCommonCalls();
    vi.spyOn(datasourcesApi, "getDataSourceRoutines").mockResolvedValue([{ schema: "dbo", name: "GetAgentSummary" }]);
    const createDataset = vi.spyOn(datasetsApi, "createDataset").mockResolvedValue({
      id: 11, dataSourceConnectionId: 1, name: "Proc dataset", description: null, mode: "StoredProcedure",
      definitionJson: JSON.stringify({ routineName: "dbo.GetAgentSummary", parameters: [] }), rowLimit: null,
      isSaved: true, columns: [], createdAtUtc: "", updatedAtUtc: "",
    });
    vi.spyOn(datasetsApi, "discoverDatasetColumns").mockResolvedValue([]);

    render(<DatasetsPage />);
    await selectConnection();

    await userEvent.click(screen.getByLabelText("Mode"));
    await userEvent.click(await screen.findByText("Stored Procedure"));

    await userEvent.type(screen.getByLabelText("Dataset Name"), "Proc dataset");
    await userEvent.click(screen.getByLabelText("Procedure or Function Name"));
    await userEvent.click(await screen.findByText("dbo.GetAgentSummary"));
    await userEvent.click(screen.getByRole("button", { name: "Add Dataset" }));

    expect(createDataset).toHaveBeenCalledWith(expect.objectContaining({
      mode: "StoredProcedure",
      definitionJson: JSON.stringify({ routineName: "dbo.GetAgentSummary", parameters: [] }),
    }));
  });
});
