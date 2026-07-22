import { describe, expect, it } from "vitest";
import { toggleCrossFilterValue } from "./clickToCrossFilter";

describe("toggleCrossFilterValue", () => {
  it("adds the value to an empty selection for that field", () => {
    expect(toggleCrossFilterValue({}, "Region", "North")).toEqual({ Region: ["North"] });
  });

  it("adds the value alongside an existing selection for that field", () => {
    expect(toggleCrossFilterValue({ Region: ["South"] }, "Region", "North")).toEqual({ Region: ["South", "North"] });
  });

  it("removes the value if it's already selected (toggle off)", () => {
    expect(toggleCrossFilterValue({ Region: ["North", "South"] }, "Region", "North")).toEqual({ Region: ["South"] });
  });

  it("leaves other fields' selections untouched", () => {
    expect(toggleCrossFilterValue({ Category: ["Furniture"] }, "Region", "North")).toEqual({
      Category: ["Furniture"],
      Region: ["North"],
    });
  });
});
