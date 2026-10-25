import { describe, expect, it } from "vitest";
import { DIRECTIONAL_PATTERN_MARGIN_BONUS, estimateYardage } from "./estimateYardage";
import type { YardageFormula } from "./types";

const flatFormula: YardageFormula = { base_metres: 2, coefficients: {}, wastage_margin: 0 };

describe("estimateYardage", () => {
  it("is just the base consumption with no coefficients and no margin", () => {
    expect(estimateYardage({ yardageFormula: flatFormula, measurements: {}, selection: {}, fabricHasDirectionalPattern: false })).toBe(2);
  });

  it("adds a per-measurement coefficient, multiplied by the measurement's value", () => {
    const formula: YardageFormula = { base_metres: 2, coefficients: { chest: 0.015 }, wastage_margin: 0 };

    const result = estimateYardage({
      yardageFormula: formula,
      measurements: { chest: 100 },
      selection: {},
      fabricHasDirectionalPattern: false,
    });

    expect(result).toBe(3.5); // 2 + 0.015 * 100
  });

  it("adds a flat allowance for a selected option, not multiplied by anything", () => {
    // "full" is a selected sleeve value, not a measurement — SDS §6.2's
    // "an allowance per option that adds fabric"
    const formula: YardageFormula = { base_metres: 2, coefficients: { full: 0.3 }, wastage_margin: 0 };

    const result = estimateYardage({
      yardageFormula: formula,
      measurements: {},
      selection: { sleeve: "full" },
      fabricHasDirectionalPattern: false,
    });

    expect(result).toBe(2.3);
  });

  it("ignores a coefficient whose option wasn't selected and isn't a known measurement", () => {
    const formula: YardageFormula = { base_metres: 2, coefficients: { full: 0.3 }, wastage_margin: 0 };

    const result = estimateYardage({
      yardageFormula: formula,
      measurements: {},
      selection: { sleeve: "three-quarter" },
      fabricHasDirectionalPattern: false,
    });

    expect(result).toBe(2);
  });

  it("applies the wastage margin to the whole consumption", () => {
    const formula: YardageFormula = { base_metres: 2, coefficients: {}, wastage_margin: 0.1 };

    const result = estimateYardage({ yardageFormula: formula, measurements: {}, selection: {}, fabricHasDirectionalPattern: false });

    expect(result).toBe(2.2);
  });

  it("raises the margin for a fabric with directional pattern or nap", () => {
    const formula: YardageFormula = { base_metres: 2, coefficients: {}, wastage_margin: 0.1 };

    const result = estimateYardage({ yardageFormula: formula, measurements: {}, selection: {}, fabricHasDirectionalPattern: true });

    expect(result).toBeCloseTo(2 * (1 + 0.1 + DIRECTIONAL_PATTERN_MARGIN_BONUS), 6);
  });

  it("rounds to 3 decimal places (fabrics.stock_metres / yardage_metres precision)", () => {
    const formula: YardageFormula = { base_metres: 1, coefficients: { chest: 0.0001234 }, wastage_margin: 0 };

    const result = estimateYardage({
      yardageFormula: formula,
      measurements: { chest: 1 },
      selection: {},
      fabricHasDirectionalPattern: false,
    });

    expect(result).toBe(1); // 1.0001234 rounds to 1.000
  });
});
