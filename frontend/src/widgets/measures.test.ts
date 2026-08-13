import { describe, expect, it } from "vitest";
import { compileMeasure, MeasureSyntaxError } from "./measures";

function evaluate(expression: string, row: Record<string, unknown> = {}): number | null {
  return compileMeasure(expression).evaluate((field) => row[field]);
}

describe("compileMeasure", () => {
  it("reads fields bracketed or bare", () => {
    expect(evaluate("[This Year] + Target", { "This Year": 10, Target: 5 })).toBe(15);
  });

  it("applies normal operator precedence and parentheses", () => {
    expect(evaluate("2 + 3 * 4")).toBe(14);
    expect(evaluate("(2 + 3) * 4")).toBe(20);
    expect(evaluate("-[a] + 10", { a: 4 })).toBe(6);
    expect(evaluate("10 - 2 - 3")).toBe(5);
  });

  it("coerces numeric strings, which is how SQL decimals arrive over JSON", () => {
    expect(evaluate("[a] * 2", { a: "21" })).toBe(42);
  });

  // The case the whole thing exists for: growth is the ratio of the sums, computed on the grouped
  // row, and it must not blow up for a group with no prior-year figure.
  describe("the growth shape", () => {
    const growth = "DIVIDE([ThisYear] - [LastYear], [LastYear])";

    it("computes growth against last year", () => {
      expect(evaluate(growth, { ThisYear: 110, LastYear: 100 })).toBeCloseTo(0.1);
    });

    it("is blank rather than Infinity when last year is zero", () => {
      expect(evaluate(growth, { ThisYear: 110, LastYear: 0 })).toBeNull();
    });

    it("uses the alternate when given one", () => {
      expect(evaluate("DIVIDE([a], [b], 0)", { a: 5, b: 0 })).toBe(0);
    });
  });

  // Infinity in a report is worse than an empty cell.
  it("treats a bare divide by zero as blank too", () => {
    expect(evaluate("[a] / [b]", { a: 1, b: 0 })).toBeNull();
  });

  // A missing operand must not silently read as zero — that turns absent data into a real-looking
  // number, which is the failure mode this feature is meant to avoid.
  it("is blank when an operand is missing, null or empty", () => {
    expect(evaluate("[a] + [b]", { a: 1 })).toBeNull();
    expect(evaluate("[a] + [b]", { a: 1, b: null })).toBeNull();
    expect(evaluate("[a] + [b]", { a: 1, b: "" })).toBeNull();
  });

  it("is blank for a non-numeric operand rather than NaN", () => {
    expect(evaluate("[a] * 2", { a: "Elite" })).toBeNull();
  });

  it("reports every field it reads, so a binding can be validated before rendering", () => {
    expect(compileMeasure("DIVIDE([a] - [b], [b]) + [c]").fields.sort()).toEqual(["a", "b", "c"]);
  });

  it("compiles once and evaluates per row", () => {
    const measure = compileMeasure("DIVIDE([n], [d])");

    expect(measure.evaluate((f) => ({ n: 1, d: 2 })[f as "n" | "d"])).toBe(0.5);
    expect(measure.evaluate((f) => ({ n: 3, d: 4 })[f as "n" | "d"])).toBe(0.75);
  });

  describe("rejects what it can't evaluate", () => {
    it("an empty expression", () => {
      expect(() => compileMeasure("   ")).toThrow(MeasureSyntaxError);
    });

    it("unbalanced parentheses and brackets", () => {
      expect(() => compileMeasure("(1 + 2")).toThrow(MeasureSyntaxError);
      expect(() => compileMeasure("[unclosed")).toThrow(MeasureSyntaxError);
      expect(() => compileMeasure("[]")).toThrow(MeasureSyntaxError);
    });

    it("a dangling operator", () => {
      expect(() => compileMeasure("1 +")).toThrow(MeasureSyntaxError);
      expect(() => compileMeasure("1 2")).toThrow(MeasureSyntaxError);
    });

    it("DIVIDE without enough arguments", () => {
      expect(() => compileMeasure("DIVIDE([a])")).toThrow(MeasureSyntaxError);
    });

    it("any function other than DIVIDE, by name", () => {
      expect(() => compileMeasure("SUM([a])")).toThrow(/Only DIVIDE is supported/);
    });

    // It is a parser over field names, not eval — there is no path to anything but the fields the
    // caller supplies.
    it("expressions reaching for the host environment", () => {
      expect(() => compileMeasure("process.exit(1)")).toThrow(MeasureSyntaxError);
      expect(() => compileMeasure("globalThis")).not.toThrow();
      expect(evaluate("globalThis", {})).toBeNull();
    });
  });
});
