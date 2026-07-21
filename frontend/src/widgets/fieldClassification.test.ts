import { describe, expect, it } from "vitest";
import { classify } from "./fieldClassification";

describe("classify", () => {
  it.each([
    ["int", "Numeric"],
    ["bigint", "Numeric"],
    ["decimal(18,2)", "Numeric"],
    ["numeric(10,0)", "Numeric"],
    ["float", "Numeric"],
    ["money", "Numeric"],
    ["number", "Numeric"],
    ["date", "Temporal"],
    ["datetime2", "Temporal"],
    ["datetimeoffset", "Temporal"],
    ["nvarchar(50)", "Categorical"],
    ["varchar(max)", "Categorical"],
    ["uniqueidentifier", "Categorical"],
    ["bit", "Categorical"],
    ["string", "Categorical"],
    ["boolean", "Categorical"],
    ["varbinary(max)", "Unsupported"],
    ["xml", "Unsupported"],
    ["object", "Unsupported"],
    ["array", "Unsupported"],
    ["null", "Unsupported"],
    ["unknown", "Unsupported"],
    ["", "Unsupported"],
  ])("classifies %s as %s", (nativeType, expected) => {
    expect(classify(nativeType)).toBe(expected);
  });
});
