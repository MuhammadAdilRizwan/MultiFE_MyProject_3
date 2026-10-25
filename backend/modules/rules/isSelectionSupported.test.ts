import { describe, expect, it } from "vitest";
import { isSelectionSupported } from "./isSelectionSupported";
import type { EvaluatedOptionGroup } from "./types";

const evaluated: EvaluatedOptionGroup[] = [
  { groupKey: "cuff", groupLabel: "Cuff", values: [{ key: "soft", label: "Soft", priceDelta: 0, extraLeadDays: 0, isDefault: true }] },
  { groupKey: "neckline", groupLabel: "Neckline", values: [{ key: "round", label: "Round", priceDelta: 0, extraLeadDays: 0, isDefault: true }] },
];

describe("isSelectionSupported", () => {
  it("accepts a selection whose every value is offered", () => {
    expect(isSelectionSupported(evaluated, { cuff: "soft", neckline: "round" })).toBe(true);
  });

  it("accepts a partial selection (not every group chosen yet)", () => {
    expect(isSelectionSupported(evaluated, { cuff: "soft" })).toBe(true);
  });

  it("rejects a value the fabric doesn't support (e.g. submitted directly, bypassing the UI)", () => {
    expect(isSelectionSupported(evaluated, { cuff: "hard" })).toBe(false);
  });

  it("rejects a group that isn't offered at all", () => {
    expect(isSelectionSupported(evaluated, { sleeve: "full" })).toBe(false);
  });

  it("accepts an empty selection", () => {
    expect(isSelectionSupported(evaluated, {})).toBe(true);
  });
});
