import { describe, expect, it } from "vitest";
import { isFabricPublishable } from "./isFabricPublishable";

describe("isFabricPublishable", () => {
  it("is false for a fabric with no option groups at all (FR-TPL-10)", () => {
    expect(isFabricPublishable({ supported_options: {} })).toBe(false);
  });

  it("is false when every option group is empty", () => {
    expect(isFabricPublishable({ supported_options: { cuff: [], neckline: [] } })).toBe(false);
  });

  it("is true when at least one option group has a value", () => {
    expect(isFabricPublishable({ supported_options: { cuff: [], neckline: ["round"] } })).toBe(true);
  });

  it("is true when every option group has values", () => {
    expect(
      isFabricPublishable({ supported_options: { cuff: ["soft", "rolled"], neckline: ["round", "v"] } }),
    ).toBe(true);
  });
});
