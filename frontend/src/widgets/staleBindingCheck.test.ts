import { describe, expect, it } from "vitest";
import { findMissingFields } from "./staleBindingCheck";

const columns = [
  { name: "Month", nativeType: "nvarchar(20)" },
  { name: "Revenue", nativeType: "decimal(18,2)" },
];

describe("findMissingFields", () => {
  it("returns an empty array when every field still exists", () => {
    expect(findMissingFields(columns, "Month", ["Revenue"])).toEqual([]);
  });

  it("reports a missing categoryField", () => {
    expect(findMissingFields(columns, "Region", ["Revenue"])).toEqual(["Region"]);
  });

  it("reports missing valueFields", () => {
    expect(findMissingFields(columns, "Month", ["Cost"])).toEqual(["Cost"]);
  });

  it("ignores a null categoryField", () => {
    expect(findMissingFields(columns, null, ["Revenue"])).toEqual([]);
  });
});
