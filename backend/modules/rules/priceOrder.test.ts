import { describe, expect, it } from "vitest";
import { priceOrder } from "./priceOrder";
import type { EvaluatedOptionGroup } from "./types";

const evaluatedOptions: EvaluatedOptionGroup[] = [
  {
    groupKey: "sleeve",
    groupLabel: "Sleeve",
    values: [
      { key: "full", label: "Full", priceDelta: 0, extraLeadDays: 0, isDefault: true },
      { key: "three-quarter", label: "Three-quarter", priceDelta: 150, extraLeadDays: 1, isDefault: false },
    ],
  },
  {
    groupKey: "closure",
    groupLabel: "Closure",
    values: [{ key: "zip", label: "Zip", priceDelta: 200, extraLeadDays: 0, isDefault: false }],
  },
];

describe("priceOrder", () => {
  it("prices fabric by yardage * price per metre, with no options selected", () => {
    const result = priceOrder({
      fabricPricePerMetre: 900,
      templateBaseStitchPrice: 2500,
      yardageMetres: 4.5,
      evaluatedOptions,
      selection: {},
    });

    expect(result).toEqual({
      yardageMetres: 4.5,
      fabricCost: 4050,
      stitchCost: 2500,
      optionsCost: 0,
      total: 6550,
    });
  });

  it("sums the price delta of every selected value", () => {
    const result = priceOrder({
      fabricPricePerMetre: 900,
      templateBaseStitchPrice: 2500,
      yardageMetres: 4.5,
      evaluatedOptions,
      selection: { sleeve: "three-quarter", closure: "zip" },
    });

    expect(result.optionsCost).toBe(350);
    expect(result.total).toBe(4050 + 2500 + 350);
  });

  it("throws when a selected value isn't in the evaluated options", () => {
    expect(() =>
      priceOrder({
        fabricPricePerMetre: 900,
        templateBaseStitchPrice: 2500,
        yardageMetres: 4.5,
        evaluatedOptions,
        selection: { sleeve: "sleeveless" },
      }),
    ).toThrow(/sleeveless/);
  });

  it("throws when the selected group isn't in the evaluated options at all", () => {
    expect(() =>
      priceOrder({
        fabricPricePerMetre: 900,
        templateBaseStitchPrice: 2500,
        yardageMetres: 4.5,
        evaluatedOptions,
        selection: { cuff: "soft" },
      }),
    ).toThrow(/cuff/);
  });

  it("rounds every money figure to 2 decimal places", () => {
    const result = priceOrder({
      fabricPricePerMetre: 1200.555,
      templateBaseStitchPrice: 1000,
      yardageMetres: 2.333,
      evaluatedOptions: [],
      selection: {},
    });

    expect(result.fabricCost).toBe(2800.89);
    expect(result.total).toBe(3800.89);
  });
});
