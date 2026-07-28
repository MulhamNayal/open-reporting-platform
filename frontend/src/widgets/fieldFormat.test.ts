import { describe, expect, it } from "vitest";
import type { WidgetFormatOptions } from "../api/widgets";
import { DEFAULT_FORMAT_OPTIONS } from "../api/widgets";
import { DEFAULT_FIELD_FORMAT, formatFieldValue, getFieldFormat, inferFormatType, resolveDisplayName } from "./fieldFormat";

describe("inferFormatType", () => {
  it("maps SQL Server decimal-like native types to decimal", () => {
    expect(inferFormatType("decimal")).toBe("decimal");
    expect(inferFormatType("money")).toBe("decimal");
    expect(inferFormatType("float")).toBe("decimal");
  });

  it("maps SQL Server integer-like native types to integer", () => {
    expect(inferFormatType("int")).toBe("integer");
    expect(inferFormatType("bigint")).toBe("integer");
  });

  it("maps SQL Server date-like native types to date", () => {
    expect(inferFormatType("datetime")).toBe("date");
    expect(inferFormatType("date")).toBe("date");
  });

  it("maps bit to boolean", () => {
    expect(inferFormatType("bit")).toBe("boolean");
  });

  it("falls back to text for unrecognized or missing native types", () => {
    expect(inferFormatType("nvarchar")).toBe("text");
    expect(inferFormatType(undefined)).toBe("text");
  });
});

describe("getFieldFormat", () => {
  it("returns the default format (with 'auto' resolved to 'text', no native type known) when nothing is saved for the field", () => {
    const format: WidgetFormatOptions = { ...DEFAULT_FORMAT_OPTIONS, fieldFormats: {} };

    expect(getFieldFormat(format, "Revenue")).toEqual({ ...DEFAULT_FIELD_FORMAT, type: "text" });
  });

  it("merges a partially-saved field format with the defaults", () => {
    const format: WidgetFormatOptions = { ...DEFAULT_FORMAT_OPTIONS, fieldFormats: { Revenue: { decimalPlaces: 0 } } };

    // No nativeType passed, so "auto" resolves to "text" (inferFormatType(undefined)) — see the
    // "resolves 'auto' to a concrete type" test below for the case with a native type available.
    expect(getFieldFormat(format, "Revenue")).toEqual({ ...DEFAULT_FIELD_FORMAT, type: "text", decimalPlaces: 0 });
  });

  it("resolves 'auto' to a concrete type from the column's native type", () => {
    const format: WidgetFormatOptions = { ...DEFAULT_FORMAT_OPTIONS, fieldFormats: { Revenue: { type: "auto" } } };

    expect(getFieldFormat(format, "Revenue", "decimal").type).toBe("decimal");
  });

  it("does not override an explicit type with the native-type inference", () => {
    const format: WidgetFormatOptions = { ...DEFAULT_FORMAT_OPTIONS, fieldFormats: { Revenue: { type: "text" } } };

    expect(getFieldFormat(format, "Revenue", "decimal").type).toBe("text");
  });
});

describe("formatFieldValue", () => {
  it("returns an empty string for null, undefined, or empty values", () => {
    expect(formatFieldValue(null, { ...DEFAULT_FIELD_FORMAT, type: "decimal" })).toBe("");
    expect(formatFieldValue(undefined, { ...DEFAULT_FIELD_FORMAT, type: "decimal" })).toBe("");
    expect(formatFieldValue("", { ...DEFAULT_FIELD_FORMAT, type: "decimal" })).toBe("");
  });

  it("formats a decimal with the configured decimal places and thousands separator", () => {
    const result = formatFieldValue("1234.5", { ...DEFAULT_FIELD_FORMAT, type: "decimal", decimalPlaces: 2, thousandsSeparator: true });

    expect(result).toBe("1,234.50");
  });

  it("applies a prefix and suffix to a decimal", () => {
    const result = formatFieldValue(1234.5, { ...DEFAULT_FIELD_FORMAT, type: "decimal", decimalPlaces: 2, prefix: "$", suffix: "" });

    expect(result).toBe("$1,234.50");
  });

  it("formats an integer with no decimal places even if decimalPlaces is set", () => {
    const result = formatFieldValue(1234, { ...DEFAULT_FIELD_FORMAT, type: "integer", decimalPlaces: 2, thousandsSeparator: true });

    expect(result).toBe("1,234");
  });

  it("omits the thousands separator when disabled", () => {
    const result = formatFieldValue(1234, { ...DEFAULT_FIELD_FORMAT, type: "integer", thousandsSeparator: false });

    expect(result).toBe("1234");
  });

  it("formats a date using the ISO preset", () => {
    const result = formatFieldValue("2026-07-28T00:00:00", { ...DEFAULT_FIELD_FORMAT, type: "date", datePreset: "iso" });

    expect(result).toBe("2026-07-28");
  });

  it("formats a boolean as Yes/No when configured", () => {
    expect(formatFieldValue(true, { ...DEFAULT_FIELD_FORMAT, type: "boolean", booleanStyle: "yesNo" })).toBe("Yes");
    expect(formatFieldValue(false, { ...DEFAULT_FIELD_FORMAT, type: "boolean", booleanStyle: "yesNo" })).toBe("No");
  });

  it("formats a boolean stored as 0/1 (SQL Server bit column shape)", () => {
    expect(formatFieldValue(1, { ...DEFAULT_FIELD_FORMAT, type: "boolean", booleanStyle: "trueFalse" })).toBe("True");
    expect(formatFieldValue(0, { ...DEFAULT_FIELD_FORMAT, type: "boolean", booleanStyle: "trueFalse" })).toBe("False");
  });

  it("passes text through unchanged", () => {
    expect(formatFieldValue("Monthly Sales", { ...DEFAULT_FIELD_FORMAT, type: "text" })).toBe("Monthly Sales");
  });

  it("falls back to String(value) for a non-numeric decimal value rather than throwing", () => {
    expect(formatFieldValue("not a number", { ...DEFAULT_FIELD_FORMAT, type: "decimal" })).toBe("not a number");
  });
});

describe("resolveDisplayName", () => {
  it("returns the real field name when no display name is set", () => {
    expect(resolveDisplayName("DocAmount", DEFAULT_FIELD_FORMAT)).toBe("DocAmount");
  });

  it("returns the configured display name when set", () => {
    expect(resolveDisplayName("DocAmount", { ...DEFAULT_FIELD_FORMAT, displayName: "Total Sales" })).toBe("Total Sales");
  });

  it("falls back to the field name for a blank or whitespace-only display name", () => {
    expect(resolveDisplayName("DocAmount", { ...DEFAULT_FIELD_FORMAT, displayName: "" })).toBe("DocAmount");
    expect(resolveDisplayName("DocAmount", { ...DEFAULT_FIELD_FORMAT, displayName: "   " })).toBe("DocAmount");
  });

  it("trims surrounding whitespace from a configured display name", () => {
    expect(resolveDisplayName("DocAmount", { ...DEFAULT_FIELD_FORMAT, displayName: "  Total Sales  " })).toBe("Total Sales");
  });
});
