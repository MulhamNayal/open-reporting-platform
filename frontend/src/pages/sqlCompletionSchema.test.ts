import { describe, expect, it } from "vitest";
import type { SchemaDescriptor } from "../api/datasources";
import { buildSqlCompletionSchema } from "./sqlCompletionSchema";

describe("buildSqlCompletionSchema", () => {
  it("maps each table to a plain array of its column names", () => {
    const schema: SchemaDescriptor = {
      tables: [
        { name: "Agents", fields: [{ name: "Id", dataType: "int" }, { name: "Name", dataType: "nvarchar" }] },
        { name: "Deals", fields: [{ name: "Id", dataType: "int" }, { name: "AgentId", dataType: "int" }] },
      ],
    };

    expect(buildSqlCompletionSchema(schema)).toEqual({
      Agents: ["Id", "Name"],
      Deals: ["Id", "AgentId"],
    });
  });

  it("returns an empty map for a schema with no tables", () => {
    expect(buildSqlCompletionSchema({ tables: [] })).toEqual({});
  });

  it("gives a table with no fields an empty column array", () => {
    const schema: SchemaDescriptor = { tables: [{ name: "EmptyTable", fields: [] }] };

    expect(buildSqlCompletionSchema(schema)).toEqual({ EmptyTable: [] });
  });
});
